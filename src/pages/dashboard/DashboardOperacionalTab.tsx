import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, Cell,
} from 'recharts';
import { Clock, UserX, AlertTriangle, Users, TrendingDown } from 'lucide-react';
import { fmt, fmtShort, CHART_COLORS } from './utils';

interface Props {
  taxaOcupacao: number;
  capacidadeHoras: number;
  horasOcupadas: number;
  noShowRate: number;
  impactoFinanceiroNoShow: number;
  churnRateTotal: number;
  churnDesistencia: number;
  churnPerda: number;
  churnAlta: number;
  churnFantasma: any[];
  ocupacaoPorPsicologo: { nome: string; horasAgendadas: number; horasUsadas: number; pendente: number; capacidade: number; ociosidade: number; taxa: number; sessoes: number; cancelados: number }[];
  noShowPorPsicologo: { nome: string; noShows: number; total: number; taxa: number; 'impactoR$': number }[];
  noShowTendencia: { month: string; noShows: number; total: number; taxa: number }[];
  pacientesRiscoChurn: { nome: string; psicologo: string; ultimaConsulta: string; diasAusente: number; receitaPerdidaEstimada: number }[];
  heatmapData: {
    grid: Record<string, Record<string, number>>;
    capacityGrid: Record<string, Record<string, number>>;
    hours: string[];
    dayNames: string[];
  };
}

export const DashboardOperacionalTab = (props: Props) => {
  const {
    taxaOcupacao, capacidadeHoras, horasOcupadas,
    noShowRate, impactoFinanceiroNoShow,
    churnRateTotal, churnDesistencia, churnPerda, churnAlta, churnFantasma,
    ocupacaoPorPsicologo, noShowPorPsicologo, noShowTendencia,
    pacientesRiscoChurn, heatmapData,
  } = props;

  // Max value para o heatmap
  const maxHeat = Math.max(1, ...Object.values(heatmapData.grid).flatMap(row => Object.values(row)));

  return (
    <div className="space-y-6">

      {/* ── CARDS KPI ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<Clock size={18} />}
          label="Taxa de Ocupação"
          value={`${taxaOcupacao.toFixed(1)}%`}
          subtitle={`${Math.round(horasOcupadas)}h usadas / ${Math.round(capacidadeHoras)}h disponíveis`}
          color={taxaOcupacao >= 70 ? 'emerald' : taxaOcupacao >= 50 ? 'amber' : 'red'}
        />
        <KPICard
          icon={<UserX size={18} />}
          label="No-Show Rate"
          value={`${noShowRate.toFixed(1)}%`}
          subtitle="Faltas sem aviso prévio"
          color={noShowRate <= 10 ? 'emerald' : noShowRate <= 20 ? 'amber' : 'red'}
        />
        <KPICard
          icon={<AlertTriangle size={18} />}
          label="Impacto No-Show"
          value={`R$ ${fmtShort(Math.round(impactoFinanceiroNoShow))}`}
          subtitle="Receita perdida no período"
          color="red"
        />
        <KPICard
          icon={<TrendingDown size={18} />}
          label="Churn Rate"
          value={`${churnRateTotal.toFixed(1)}%`}
          subtitle={`${churnFantasma.length} pacientes sem consulta há +30d`}
          color={churnRateTotal <= 5 ? 'emerald' : churnRateTotal <= 15 ? 'amber' : 'red'}
        />
      </div>

      {/* ── GRÁFICO: Ocupação por Psicólogo ── */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest text-center mb-1">
          Agendamentos × Capacidade Livre por Psicólogo
        </h3>
        <p className="text-[10px] text-zinc-400 text-center mb-4">Barra completa = capacidade do psicólogo</p>
        <div style={{ height: Math.max(300, ocupacaoPorPsicologo.length * 52 + 60) }} className="w-full">
          {ocupacaoPorPsicologo.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ocupacaoPorPsicologo} layout="vertical" margin={{ left: 30 }} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" fontSize={10} tickFormatter={v => `${v}h`} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="nome" fontSize={11} fontWeight="bold" tickLine={false} axisLine={false} width={120} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(v: any, name: any, entry: any) => {
                    const d = entry.payload;
                    if (name === 'Capacidade livre') return [`${Number(v).toFixed(1)}h (de ${d.capacidade}h total)`, name];
                    return [`${Number(v).toFixed(1)}h`, name];
                  }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Bar dataKey="horasAgendadas" name="Agendamentos" stackId="cap" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="ociosidade" name="Capacidade livre" stackId="cap" fill="#e4e4e7" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>
        {/* Indicadores rápidos por psicólogo */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {ocupacaoPorPsicologo.map(p => (
            <div key={p.nome} className="p-3 bg-zinc-50 rounded-xl border border-zinc-100">
              <p className="text-xs font-bold text-priori-navy truncate">{p.nome}</p>
              <p className="text-lg font-bold text-priori-navy">{p.taxa.toFixed(0)}%</p>
              <p className="text-[10px] text-zinc-400">{p.sessoes} sessões | {p.cancelados} canc.</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── GRÁFICO: Tendência No-Show + No-Show por Psicólogo ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tendência No-Show */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4 text-center">Evolução No-Show (6 meses)</h3>
          <div className="h-[250px] w-full">
            {noShowTendencia.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={noShowTendencia}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickFormatter={v => `${v}%`} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                  <Line type="monotone" dataKey="taxa" name="No-Show %" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </div>
        </div>

        {/* No-Show por Psicólogo */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4 text-center">No-Show por Psicólogo</h3>
          <div className="h-[250px] w-full">
            {noShowPorPsicologo.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={noShowPorPsicologo} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="nome" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} width={75} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: any, name: any) => [name === 'Impacto R$' ? `R$ ${fmtShort(Number(v))}` : v, name]} />
                  <Bar dataKey="noShows" name="Faltas" fill="#ef4444" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </div>
        </div>
      </div>

      {/* ── HEATMAP DE HORÁRIOS ── */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-1 text-center">
          Mapa de Calor — Horários de Pico vs. Ociosidade
        </h3>
        <p className="text-[10px] text-zinc-400 text-center mb-4">Intensidade = sessões agendadas no período</p>
        <div className="overflow-x-auto">
          <table className="mx-auto">
            <thead>
              <tr>
                <th className="p-1 text-[10px] text-zinc-400" />
                {heatmapData.dayNames.map(d => (
                  <th key={d} className="p-1 text-[10px] font-bold text-zinc-500 text-center w-14">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapData.hours.map(h => (
                <tr key={h}>
                  <td className="p-1 text-[10px] font-bold text-zinc-400 text-right pr-2">{h}</td>
                  {heatmapData.dayNames.map(d => {
                    const val = heatmapData.grid[h]?.[d] || 0;
                    const cap = heatmapData.capacityGrid[h]?.[d] || 0;
                    const intensity = maxHeat > 0 ? val / maxHeat : 0;
                    const bg = val === 0 && cap > 0
                      ? 'bg-red-50 border-red-100' // Horário disponível mas sem consulta
                      : val === 0
                      ? 'bg-zinc-50 border-zinc-100' // Sem disponibilidade
                      : intensity > 0.7
                      ? 'bg-emerald-500 border-emerald-600 text-white'
                      : intensity > 0.4
                      ? 'bg-emerald-200 border-emerald-300 text-emerald-800'
                      : 'bg-emerald-50 border-emerald-100 text-emerald-700';
                    return (
                      <td key={d} className={`p-1 text-center w-14 h-8 text-[10px] font-bold rounded border ${bg}`}>
                        {val > 0 ? val : cap > 0 ? '—' : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-center gap-4 mt-3 text-[10px] text-zinc-400">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> Alta ocupação</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200" /> Média</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-100" /> Baixa</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 border border-red-100" /> Ocioso</span>
          </div>
        </div>
      </div>

      {/* ── CHURN SEGMENTADO ── */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Churn Segmentado</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <ChurnBadge label="Desistência" count={churnDesistencia} color="red" />
          <ChurnBadge label="Perda de Plano" count={churnPerda} color="amber" />
          <ChurnBadge label="Alta Clínica" count={churnAlta} color="emerald" />
          <ChurnBadge label="Fantasma (+30d)" count={churnFantasma.length} color="zinc" />
        </div>
      </div>

      {/* ── TABELA: Pacientes em Risco de Churn ── */}
      {pacientesRiscoChurn.length > 0 && (
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm overflow-x-auto">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">
            Pacientes em Risco — Sem consulta há +30 dias
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Paciente</th>
                <th className="text-left py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Psicólogo</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Última Consulta</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Dias Ausente</th>
                <th className="text-right py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Receita/Sessão</th>
              </tr>
            </thead>
            <tbody>
              {pacientesRiscoChurn.map((p, i) => (
                <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition">
                  <td className="py-2.5 px-3 font-semibold text-priori-navy">{p.nome}</td>
                  <td className="py-2.5 px-3 text-zinc-600">{p.psicologo}</td>
                  <td className="py-2.5 px-3 text-center text-zinc-500">{p.ultimaConsulta}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${p.diasAusente > 60 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                      {p.diasAusente}d
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-zinc-600">R$ {fmt(p.receitaPerdidaEstimada)}</td>
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
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
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

function ChurnBadge({ label, count, color }: { label: string; count: number; color: string }) {
  const colorMap: Record<string, string> = {
    red: 'bg-red-50 border-red-100 text-red-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    zinc: 'bg-zinc-50 border-zinc-200 text-zinc-700',
  };
  return (
    <div className={`p-4 rounded-xl border ${colorMap[color] || colorMap.zinc}`}>
      <p className="text-[10px] font-bold uppercase mb-1">{label}</p>
      <p className="text-2xl font-bold">{count}</p>
    </div>
  );
}

function EmptyState() {
  return <div className="h-full flex items-center justify-center text-zinc-400 text-sm italic py-8">Sem dados no período</div>;
}
