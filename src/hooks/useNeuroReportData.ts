import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { Appointment, Customer, Psychologist } from '../services/types';

export interface NeuroReportItem {
  psychologistId: string;
  psychologistName: string;
  customerId: string;
  customerName: string;
  firstAppointmentDate: string;
  lastAppointmentDate: string;
  cycleTimeDays: number;
  sessionsPerformedCount: number;
  patientAbsencesCount: number;
  psychologistAbsencesCount: number;
  status: 'Em andamento' | 'Finalizado';
}

export function useNeuroReportData() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [appsData, customersData, psyData] = await Promise.all([
        api.getNeuroAppointments(),
        api.getCustomers(),
        api.getPsychologists(),
      ]);
      setAppointments(appsData);
      setCustomers(customersData);
      setPsychologists(psyData);
    } catch (err: any) {
      console.error('[useNeuroReportData] Error fetching data:', err);
      setError(err?.message || 'Erro ao carregar dados do relatório.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const reportItems = useMemo<NeuroReportItem[]>(() => {
    console.log('[useNeuroReportData] Iniciando processamento useMemo...');
    console.log('[useNeuroReportData] Bruto appointments:', appointments);
    console.log('[useNeuroReportData] Bruto customers:', customers);
    console.log('[useNeuroReportData] Bruto psychologists:', psychologists);

    if (appointments.length === 0 || customers.length === 0 || psychologists.length === 0) {
      console.log('[useNeuroReportData] Um ou mais arrays estão vazios, retornando []');
      return [];
    }

    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const psychMap = new Map(psychologists.map((p) => [p.id, p]));

    // Agrupar agendamentos por [psicologoId, pacienteId]
    const groups = new Map<string, Appointment[]>();

    for (const app of appointments) {
      if (app.isInternal) continue; // Desconsiderar compromissos internos
      if (!app.customerId || !app.psychologistId) {
        console.warn('[useNeuroReportData] Agendamento sem customerId ou psychologistId:', app);
        continue;
      }

      const key = `${app.psychologistId}|${app.customerId}`;
      let list = groups.get(key);
      if (!list) {
        list = [];
        groups.set(key, list);
      }
      list.push(app);
    }

    console.log('[useNeuroReportData] Grupos formados:', groups.size, Array.from(groups.keys()));

    const todayStr = new Date().toISOString().split('T')[0];
    const todayMs = new Date(todayStr + 'T00:00:00').getTime();

    const items: NeuroReportItem[] = [];

    for (const [key, groupApps] of groups.entries()) {
      const [psychologistId, customerId] = key.split('|');
      
      const customer = customerMap.get(customerId);
      const psychologist = psychMap.get(psychologistId);

      // Só exibe se encontrar ambos para manter a consistência relacional
      if (!customer || !psychologist) {
        console.warn(`[useNeuroReportData] Órfão encontrado. Paciente encontrado: ${!!customer}, Psicólogo encontrado: ${!!psychologist} para a chave: ${key}`);
        continue;
      }

      // Ordenar agendamentos por data crescente
      const sortedApps = [...groupApps].sort((a, b) => a.date.localeCompare(b.date));
      if (sortedApps.length === 0) continue;

      const firstAppDate = sortedApps[0].date;
      const lastAppDate = sortedApps[sortedApps.length - 1].date;

      // Cálculo de Tempo de Ciclo:
      // Se a última consulta for no passado (antes de hoje), o ciclo é fechado (Última Consulta - Primeira Consulta).
      // Se for hoje ou no futuro (em aberto), calcula-se o tempo decorrido até hoje (Hoje - Primeira Consulta).
      const firstAppMs = new Date(firstAppDate + 'T00:00:00').getTime();
      const endMs = lastAppDate < todayStr 
        ? new Date(lastAppDate + 'T00:00:00').getTime() 
        : todayMs;

      const diffMs = endMs - firstAppMs;
      const rawDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const cycleTimeDays = Math.max(1, rawDays);

      // Métricas de contagem
      let sessionsPerformedCount = 0;
      let patientAbsencesCount = 0;
      let psychologistAbsencesCount = 0;

      for (const app of sortedApps) {
        if (app.status === 'canceled') {
          // Faltas do paciente
          if (
            app.cancellationFault === 'patient' ||
            app.cancellationFault === 'patient_exempt' ||
            app.cancellationType === 'no_show'
          ) {
            patientAbsencesCount++;
          }
          // Faltas do psicólogo
          else if (
            app.cancellationFault === 'psychologist' ||
            app.cancellationType === 'psychologist_absence'
          ) {
            psychologistAbsencesCount++;
          }
        } else {
          // Sessão realizada: agendamento ativo ou liberado que já aconteceu (data <= hoje)
          if (app.date <= todayStr) {
            sessionsPerformedCount++;
          }
        }
      }

      // Status do ciclo: se houver pelo menos um agendamento não cancelado com data >= hoje, está em andamento.
      const hasActiveFutureOrToday = sortedApps.some(app => app.status !== 'canceled' && app.date >= todayStr);
      const status: 'Em andamento' | 'Finalizado' = hasActiveFutureOrToday ? 'Em andamento' : 'Finalizado';

      items.push({
        psychologistId,
        psychologistName: psychologist.name,
        customerId,
        customerName: customer.name,
        firstAppointmentDate: firstAppDate,
        lastAppointmentDate: lastAppDate,
        cycleTimeDays,
        sessionsPerformedCount,
        patientAbsencesCount,
        psychologistAbsencesCount,
        status,
      });
    }

    console.log('[useNeuroReportData] Itens finais gerados para o relatório:', items);

    // Ordenação padrão decrescente por Tempo de Ciclo
    return items.sort((a, b) => b.cycleTimeDays - a.cycleTimeDays);
  }, [appointments, customers, psychologists]);

  return {
    reportItems,
    isLoading,
    error,
    refetch: fetchData,
  };
}