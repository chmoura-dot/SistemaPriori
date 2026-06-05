/**
 * useDashboardClinico
 * Calcula: sessões médias, no-show, tempo em terapia, retorno,
 * churn/retenção, e perfis de gênero e idade.
 */
import { useMemo } from 'react';
import {
  Appointment, Customer,
  AppointmentStatus, CustomerStatus, InactivationReason,
} from '../../services/types';

interface DashboardClinicoParams {
  appointmentsFiltered: Appointment[];
  appointments: Appointment[];
  appsRealizados: Appointment[];
  customers: Customer[];
  todayStr: string;
  today: Date;
  totalAppsScheduled: number;
  activeCustomersCount: number;
  isCanceledButBilled: (app: Appointment) => boolean;
  isInSelectedPeriod: (dateStr: string) => boolean;
}

export function useDashboardClinico({
  appointmentsFiltered, appointments, appsRealizados, customers,
  todayStr, today, totalAppsScheduled, activeCustomersCount,
  isCanceledButBilled, isInSelectedPeriod,
}: DashboardClinicoParams) {

  // ─── Sessões médias por paciente ──────────────────────────────────────────
  const avgSessionsPerPatient = useMemo(() => {
    const map: Record<string, number> = {};
    appsRealizados.forEach(app => {
      if (!app.isInternal) map[app.customerId] = (map[app.customerId] || 0) + 1;
    });
    const counts = Object.values(map);
    return counts.length === 0 ? 0 : counts.reduce((a, b) => a + b, 0) / counts.length;
  }, [appsRealizados]);

  // ─── No-show ──────────────────────────────────────────────────────────────
  const noShowApps = useMemo(() =>
    appointmentsFiltered.filter(app =>
      app.date < todayStr &&
      app.status !== AppointmentStatus.CANCELED &&
      !app.confirmedPsychologist &&
      !app.confirmedPatient &&
      !app.isInternal
    ),
    [appointmentsFiltered, todayStr]
  );
  // Denominador: apenas consultas passadas não canceladas (excluindo futuras e canceladas)
  const pastNonCanceled = useMemo(() =>
    appointmentsFiltered.filter(a =>
      a.date <= todayStr && a.status !== AppointmentStatus.CANCELED && !a.isInternal
    ).length,
    [appointmentsFiltered, todayStr]
  );
  const noShowRate = pastNonCanceled > 0 ? (noShowApps.length / pastNonCanceled) * 100 : 0;

  // ─── Tempo médio em terapia ───────────────────────────────────────────────
  const avgTherapyDurationDays = useMemo(() => {
    const active = customers.filter(c =>
      c.status === CustomerStatus.ACTIVE && c.firstAppointmentDate && c.lastAppointmentDate
    );
    if (active.length === 0) return 0;
    const durations = active.map(c => {
      const first = new Date(c.firstAppointmentDate! + 'T12:00:00');
      const last  = new Date(c.lastAppointmentDate!  + 'T12:00:00');
      return Math.max(0, (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
    });
    return durations.reduce((a, b) => a + b, 0) / durations.length;
  }, [customers]);

  // ─── Taxa de retorno ──────────────────────────────────────────────────────
  const returnRate = useMemo(() => {
    const allRealized = appointments.filter(app =>
      (app.confirmedPsychologist || isCanceledButBilled(app)) && !app.isInternal
    );
    const map: Record<string, number> = {};
    allRealized.forEach(app => { map[app.customerId] = (map[app.customerId] || 0) + 1; });
    const total    = Object.keys(map).length;
    const returned = Object.values(map).filter(n => n >= 2).length;
    return total > 0 ? (returned / total) * 100 : 0;
  }, [appointments, isCanceledButBilled]);

  // ─── Churn / Retenção ─────────────────────────────────────────────────────
  const inactivatedThisMonth = useMemo(() =>
    customers.filter(c => {
      if (c.status !== CustomerStatus.INACTIVE) return false;
      const ref = c.lastAppointmentDate || c.createdAt;
      return isInSelectedPeriod(ref);
    }),
    [customers, isInSelectedPeriod]
  );
  const churnByReason = useMemo(() =>
    Object.values(InactivationReason)
      .map(reason => ({ reason, count: inactivatedThisMonth.filter(c => c.inactivationReason === reason).length }))
      .filter(r => r.count > 0),
    [inactivatedThisMonth]
  );
  const retentionRate = (activeCustomersCount + inactivatedThisMonth.length) > 0
    ? (activeCustomersCount / (activeCustomersCount + inactivatedThisMonth.length)) * 100
    : 100;

  // ─── Perfil de Gênero ─────────────────────────────────────────────────────
  const genderProfileData = useMemo(() => {
    const activeCustomers = customers.filter(c => c.status === CustomerStatus.ACTIVE);
    let feminino = 0, masculino = 0, naoIdentificado = 0;
    activeCustomers.forEach(c => {
      if (c.gender === 'F') feminino++;
      else if (c.gender === 'M') masculino++;
      else naoIdentificado++;
    });
    return {
      data: [
        { name: 'Feminino',  value: feminino,  color: '#ec4899' },
        { name: 'Masculino', value: masculino, color: '#3b82f6' },
      ].filter(d => d.value > 0),
      totalIdentificado: feminino + masculino,
      naoIdentificado,
      totalAtivos: activeCustomers.length,
    };
  }, [customers]);

  // ─── Perfil de Idade ──────────────────────────────────────────────────────
  const ageProfileData = useMemo(() => {
    const activeCustomers = customers.filter(c => c.status === CustomerStatus.ACTIVE);
    let crianca = 0, adolescente = 0, adulto = 0, idoso = 0, semIdade = 0;
    const nowYear = today.getFullYear(), nowMonth = today.getMonth(), nowDay = today.getDate();
    activeCustomers.forEach(c => {
      if (!c.birthDate) { semIdade++; return; }
      const birth = new Date(c.birthDate + 'T12:00:00');
      let age = nowYear - birth.getFullYear();
      const m = nowMonth - birth.getMonth();
      if (m < 0 || (m === 0 && nowDay < birth.getDate())) age--;
      if (age <= 12) crianca++;
      else if (age <= 17) adolescente++;
      else if (age <= 59) adulto++;
      else idoso++;
    });
    return {
      data: [
        { name: 'Criança (0-12)',       value: crianca,     color: '#6366f1' },
        { name: 'Adolescente (13-17)', value: adolescente, color: '#10b981' },
        { name: 'Adulto (18-59)',       value: adulto,      color: '#1a365d' },
        { name: 'Idoso (60+)',          value: idoso,       color: '#d4af37' },
      ].filter(d => d.value > 0),
      totalComIdade: crianca + adolescente + adulto + idoso,
      semIdade,
      totalAtivos: activeCustomers.length,
    };
  }, [customers, today]);

  return {
    avgSessionsPerPatient,
    noShowApps, noShowRate,
    avgTherapyDurationDays,
    returnRate,
    inactivatedThisMonth, churnByReason, retentionRate,
    genderProfileData, ageProfileData,
  };
}
