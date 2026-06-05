import React from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Users, Stethoscope, Monitor, ClipboardList } from 'lucide-react';
import { fmtShort, CHART_COLORS, MODALITY_COLORS } from './utils';
import {
  Appointment, Customer, Psychologist,
  AppointmentStatus, AppointmentType, CustomerStatus,
} from '../../services/types';

interface Props {
  appointments: Appointment[];
  appointmentsFiltered: Appointment[];
  appsRealizados: Appointment[];
  customers: Customer[];
  psychologists: Psychologist[];
  activeCustomersCount: number;
}

export const DashboardQualitativoTab = (props: Props) => {
  const {
    appointments, appointmentsFiltered, appsRealizados,
    customers, psychologists, activeCustomersCount,
  } = props;

  // ─── Distribuição por tipo de atendimento ──────────────────────────────
  const demandaDistribuicao = React.useMemo(() => {
    const map: Record<string, number> = {};
    appsRealizados.filter(a => !a.isInternal).forEach(a => {
      const tipo = a.type as string;
      map[tipo] = (map[tipo] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [appsRealizados]);

  const totalDemanda = demandaDistribuicao.reduce((a, d) => a + d.value, 0);

  // ─── Distribuição por modalidade ───────────────────────────────────────
  const modalidadeData = React.useMemo(() => [
    { name: 'Presencial', value: appsRealizados.filter(a => a.mode === 'Presencial' && !a.isInternal).length },
    { name: 'On-line', value: appsRealizados.filter(a => a.mode === 'On-line' && !a.isInternal).length },
  ].filter(d => d.value > 0), [appsRealizados]);

  const totalModalidade = modalidadeData.reduce((a, d) => a + d.value, 0);

  // ─── Painel por Psicólogo ──────────────────────────────────────────────
  const painelPsicologo = React.useMemo(() => {
    const activePsy = psychologists.filter(p => p.active);
    return activePsy.map(psy => {
      const psyApps = appsRealizados.filter(a => a.psychologistId === psy.id && !a.isInternal);
      const pacientesAtivos = customers.filter(c =>
        c.status === CustomerStatus.ACTIVE && c.psychologistId === psy.id
      ).length;
      const tiposMap: Record<string, number> = {};
      psyApps.forEach(a => {
        const t = a.type as string;
        tiposMap[t] = (tiposMap[t] || 0) + 1;
      });
      const tipoPrincipal = Object.entries(tiposMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
      return {
        nome: psy.name,
        especialidades: psy.specialties?.join(', ') || '—',
        pacientesAtivos,
        sessoes: psyApps.length,
        tipoPrincipal,
      };
    }).filter(p => p.sessoes > 0 || p.pacientesAtivos > 0).sort((a, b) => b.sessoes - a.sessoes);
  }, [psychologists, appsRealizados, customers]);

  // ─── Demanda por especialidade dos psicólogos ─────────────────────────
  const demandaPorEspecialidade = React.useMemo(() => {
    const specMap: Record<string, { especialidade: string; psicologos: number; sessoes: number; pacientes: Set<string> }> = {};
    const activePsy = psychologists.filter(p => p.active);
    activePsy.forEach(psy => {
      (psy.specialties || []).forEach(spec => {
        if (!specMap[spec]) specMap[spec] = { especialidade: spec, psicologos: 0, sessoes: 0, pacientes: new Set() };
        specMap[spec].psicologos++;
      });
    });
    appsRealizados.filter(a => !a.isInternal).forEach(a => {
      const psy = psychologists.find(p => p.id === a.psychologistId);
      (psy?.specialties || []).forEach(spec => {
        if (specMap[spec]) {
          specMap[spec].sessoes++;
          specMap[spec].pacientes.add(a.customerId);
        }
      });
    });
    return Object.values(specMap).map(s => ({
      especialidade: s.especialidade,
      psicologos: s.psicologos,
      sessoes: s.sessoes,
      pacientes: s.pacientes.size,
    })).sort((a, b) => b.sessoes - a.sessoes);
  }, [psychologists, appsRealizados]);

  // ─── Perfil demográfico rápido ────────────────────────────────────────
  const activeCustomers = React.useMemo(() => customers.filter(c => c.status === CustomerStatus.ACTIVE), [customers]);
  const tipoDistPacientes = React.useMemo(() => {
    // Pela tipo de atendimento do último agendamento do paciente
    const map: Record<string, number> = {};
    activeCustomers.forEach(c => {
      const lastApp = appointments
        .filter(a => a.customerId === c.id && !a.isInternal && a.status !== AppointmentStatus.CANCELED)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (lastApp) {
        const tipo = lastApp.type as string;
        map[tipo] = (map[tipo] || 0) + 1;
      }
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [activeCustomers, appointments]);

  return (
    <div className="space-y-6">

      {/* ── CARDS KPI ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard
          icon={<Users size={18} />}
          label="Pacientes Ativos"
          value={`${activeCustomersCount}`}
          subtitle={tipoDistPacientes.map(t => `${t.name}: ${t.value}`).join(' | ')}
          color="blue"
        />
        <KPICard
          icon={<Stethoscope size={18} />}
          label="Demandas Atendidas"
          value={`${demandaDistribuicao.length} tipos`}
          subtitle={demandaDistribuicao.slice(0, 2).map(d => `${d.name}: ${d.value}`).join(' | ')}
          color="indigo"
        />
        <KPICard
          icon={<Monitor size={18} />}
          label="Modalidade"
          subtitle={modalidadeData.map(m => `${m.name}: ${totalModalidade > 0 ? Math.round((m.value / totalModalidade) * 100) : 0}%`).join(' | ')}
          value={modalidadeData.length > 0 ? `${Math.round((modalidadeData.find(m => m.name === 'Presencial')?.value || 0) / Math.max(totalModalidade, 1) * 100)}% presencial` : '—'}
          color="emerald"
        />
      </div>

      {/* ── GRÁFICOS: Demanda + Modalidade ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pizza: Distribuição de Demanda */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-2 text-center">
            Distribuição por Tipo de Atendimento
          </h3>
          <div className="h-[260px] w-full">
            {demandaDistribuicao.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={demandaDistribuicao} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                    {demandaDistribuicao.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: any) => [`${v} sessões`, 'Total']} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </div>
          {/* Detalhe percentual */}
          <div className="mt-2 space-y-1">
            {demandaDistribuicao.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-zinc-600">{d.name}</span>
                </div>
                <span className="font-bold text-zinc-500">{totalDemanda > 0 ? ((d.value / totalDemanda) * 100).toFixed(1) : 0}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pizza: Modalidade */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-2 text-center">
            Presencial vs. On-line
          </h3>
          <div className="h-[260px] w-full">
            {modalidadeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={modalidadeData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                    {modalidadeData.map((_, i) => <Cell key={i} fill={MODALITY_COLORS[i % MODALITY_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: any) => [`${v} sessões`, 'Total']} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </div>
          <div className="mt-4 flex justify-around text-[10px] font-bold uppercase tracking-tight text-zinc-400">
            {modalidadeData.map((d, i) => (
              <div key={d.name} className="flex flex-col items-center">
                <span style={{ color: MODALITY_COLORS[i] }}>{d.name}</span>
                <span className="text-lg text-priori-navy">{totalModalidade > 0 ? Math.round((d.value / totalModalidade) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── TABELA: Painel por Psicólogo ── */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Painel por Psicólogo</h3>
        {painelPsicologo.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Profissional</th>
                <th className="text-left py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Especialidades</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Pacientes</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Sessões</th>
                <th className="text-left py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Tipo Principal</th>
              </tr>
            </thead>
            <tbody>
              {painelPsicologo.map(p => (
                <tr key={p.nome} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition">
                  <td className="py-2.5 px-3 font-semibold text-priori-navy">{p.nome}</td>
                  <td className="py-2.5 px-3 text-zinc-500 text-xs max-w-[200px] truncate">{p.especialidades}</td>
                  <td className="py-2.5 px-3 text-center text-zinc-600">{p.pacientesAtivos}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-priori-navy">{p.sessoes}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold">{p.tipoPrincipal}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState />}
      </div>

      {/* ── TABELA: Demanda por Especialidade ── */}
      {demandaPorEspecialidade.length > 0 && (
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm overflow-x-auto">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-1">Demanda por Especialidade</h3>
          <p className="text-[10px] text-zinc-400 mb-4">Para decisão sobre novos credenciamentos ou contratações</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Especialidade</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Psicólogos</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Sessões</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Pacientes</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Sessões/Psicólogo</th>
              </tr>
            </thead>
            <tbody>
              {demandaPorEspecialidade.map(s => (
                <tr key={s.especialidade} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition">
                  <td className="py-2.5 px-3 font-semibold text-priori-navy">{s.especialidade}</td>
                  <td className="py-2.5 px-3 text-center text-zinc-600">{s.psicologos}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-priori-navy">{s.sessoes}</td>
                  <td className="py-2.5 px-3 text-center text-zinc-600">{s.pacientes}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${s.psicologos > 0 && (s.sessoes / s.psicologos) > 20 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {s.psicologos > 0 ? (s.sessoes / s.psicologos).toFixed(1) : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ── Componentes internos ── */
function KPICard({ icon, label, value, subtitle, color }: {
  icon: React.ReactNode; label: string; value: string; subtitle?: string; color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };
  return (
    <div className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-xl ${colorMap[color] || colorMap.blue}`}>{icon}</div>
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl font-bold text-priori-navy">{value}</p>
      {subtitle && <p className="text-[10px] text-zinc-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function EmptyState() {
  return <div className="h-full flex items-center justify-center text-zinc-400 text-sm italic py-8">Sem dados no período</div>;
}
