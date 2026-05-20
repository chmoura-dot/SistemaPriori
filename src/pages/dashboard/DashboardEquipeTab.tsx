import React from 'react';
import { Flame } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
} from 'recharts';
import { cn } from '../../lib/utils';
import { fmtShort, CHART_COLORS } from './utils';
import { useDashboardData } from '../../hooks/useDashboardData';

type Props = ReturnType<typeof useDashboardData>;

export const DashboardEquipeTab = (props: Props) => {
  const {
    psychologistRanking,
    selectedMonthLabel,
    growthData,
    planGrowthData,
    typeGrowthData,
    roomUsageData,
    plans,
    appointments,
  } = props;

  return (
    <div className="space-y-6">

      {/* ── Ranking de Psicólogos (com receita bruta e líquida) ── */}
      {psychologistRanking.length > 0 && (
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-priori-gold/10 rounded-xl"><Flame size={18} className="text-priori-gold" /></div>
            <div>
              <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Ranking de Produtividade — Psicólogos</h3>
              <p className="text-[10px] text-zinc-400">{selectedMonthLabel} · Bruto = total gerado · Líquido = o que fica para a clínica</p>
            </div>
          </div>
          <div className="space-y-4">
            {psychologistRanking.map((psy, idx) => {
              const maxRevenue = psychologistRanking[0].grossRevenue || 1;
              return (
                <div key={psy.name} className="flex items-center gap-4">
                  <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0',
                    idx === 0 ? 'bg-priori-gold text-white' : idx === 1 ? 'bg-zinc-300 text-zinc-700' : idx === 2 ? 'bg-amber-700/20 text-amber-700' : 'bg-zinc-100 text-zinc-500'
                  )}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                      <span className="text-sm font-bold text-priori-navy truncate">{psy.name}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] text-zinc-400">Bruto: <strong className="text-priori-gold">R$ {fmtShort(psy.grossRevenue)}</strong></span>
                        <span className="text-[10px] text-zinc-400">Líquido: <strong className="text-emerald-600">R$ {fmtShort(psy.netRevenue)}</strong></span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                      <div className="h-full bg-priori-gold rounded-full transition-all" style={{ width: `${(psy.grossRevenue / maxRevenue) * 100}%` }} />
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-zinc-400">{psy.appointments} atendimentos</span>
                      <span className="text-[10px] text-zinc-400">·</span>
                      <span className="text-[10px] text-zinc-400">{psy.confirmationRate.toFixed(0)}% confirmação</span>
                      <span className="text-[10px] text-zinc-400">·</span>
                      <span className="text-[10px] text-zinc-400">Repasse: R$ {fmtShort(psy.repasseTotal)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Gráficos de Evolução ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6 text-center">Crescimento da Clínica (Acumulado)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Line type="monotone" dataKey="patients"      name="Pacientes"  stroke="#1a365d" strokeWidth={3} dot={{ r: 4, fill: '#1a365d' }} activeDot={{ r: 6 }} animationDuration={1500} />
                <Line type="monotone" dataKey="psychologists" name="Psicólogos" stroke="#d4af37" strokeWidth={3} dot={{ r: 4, fill: '#d4af37' }} activeDot={{ r: 6 }} animationDuration={1500} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6 text-center">Evolução por Plano (Volume)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={planGrowthData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                {Array.from(new Set(plans.map(p => p.name))).map((name, i) => (
                  <Area key={name} type="monotone" dataKey={name} stackId="1" stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.6} animationDuration={1500} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6 text-center">Distribuição por Tipo (TUSS)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeGrowthData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                {Array.from(new Set(appointments.map(a => a.type))).map((type, i) => (
                  <Bar key={type} dataKey={type as string} stackId="a" fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} radius={i === 0 ? [0, 0, 4, 4] : [0, 0, 0, 0]} animationDuration={1500} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ocupação por Dia da Semana */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <div className="mb-2">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest text-center">Ocupação das Salas (Por Dia)</h3>
            <p className="text-[10px] text-zinc-400 text-center mt-1">{selectedMonthLabel}</p>
          </div>
          <div className="h-[300px] w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roomUsageData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="day" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="count" name="Atendimentos" fill="#1a365d" radius={[8, 8, 0, 0]} animationDuration={1500} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
