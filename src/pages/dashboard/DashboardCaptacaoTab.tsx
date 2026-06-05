import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { UserPlus, Shield, Heart, Target } from 'lucide-react';
import { fmt, fmtShort, getTrendText, CHART_COLORS } from './utils';

interface Props {
  novosPacientes: number;
  novosPacientesPrev: number;
  taxaRetencao: number;
  ltvMedio: number;
  duracaoMediaMeses: number;
  sessoesMediaMensal: number;
  cac: number;
  despesaMarketing: number;
  evolucaoNovosPacientes: { month: string; count: number }[];
  funil: { filaEspera: number; novosPacientes: number; aderidos: number; taxaConversaoFila: number; taxaAdesao: number };
  cohortData: { month: string; total: number; retencaoMes1: number; retencaoMes3: number; retencaoMes6: number; ltvAcumulado: number }[];
  fonteCaptacao: { fonte: string; count: number; receita: number; percent: number; ltvMedio: number }[];
  filterMode: 'month' | 'year' | 'all';
}

export const DashboardCaptacaoTab = (props: Props) => {
  const {
    novosPacientes, novosPacientesPrev, taxaRetencao,
    ltvMedio, duracaoMediaMeses, sessoesMediaMensal,
    cac, despesaMarketing,
    evolucaoNovosPacientes, funil, cohortData, fonteCaptacao,
    filterMode,
  } = props;

  return (
    <div className="space-y-6">

      {/* ── CARDS KPI ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<UserPlus size={18} />}
          label="Novos Pacientes"
          value={`${novosPacientes}`}
          trend={getTrendText(novosPacientes, novosPacientesPrev, { filterMode })}
          color="blue"
        />
        <KPICard
          icon={<Shield size={18} />}
          label="Taxa de Retenção"
          value={`${taxaRetencao.toFixed(1)}%`}
          subtitle="Voltaram após 1ª sessão"
          color={taxaRetencao >= 70 ? 'emerald' : taxaRetencao >= 50 ? 'amber' : 'red'}
        />
        <KPICard
          icon={<Heart size={18} />}
          label="LTV Clínico"
          value={`R$ ${fmtShort(Math.round(ltvMedio))}`}
          subtitle={`${duracaoMediaMeses.toFixed(1)} meses × ${sessoesMediaMensal.toFixed(1)} sessões/mês`}
          color="indigo"
        />
        <KPICard
          icon={<Target size={18} />}
          label="CAC"
          value={cac > 0 ? `R$ ${fmt(cac)}` : '—'}
          subtitle={despesaMarketing > 0 ? `Marketing: R$ ${fmtShort(Math.round(despesaMarketing))}` : 'Sem despesas de marketing'}
          color="amber"
        />
      </div>

      {/* ── LTV vs CAC Ratio ── */}
      {cac > 0 && ltvMedio > 0 && (
        <div className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Ratio LTV / CAC</h3>
              <p className="text-[10px] text-zinc-400 mt-0.5">Ideal: ≥ 3:1 (cada R$1 investido retorna R$3+)</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-priori-navy">{(ltvMedio / cac).toFixed(1)}:1</p>
              <p className={`text-xs font-bold ${(ltvMedio / cac) >= 3 ? 'text-emerald-500' : (ltvMedio / cac) >= 2 ? 'text-amber-500' : 'text-red-500'}`}>
                {(ltvMedio / cac) >= 3 ? '✓ Saudável' : (ltvMedio / cac) >= 2 ? '⚠ Atenção' : '✗ Crítico'}
              </p>
            </div>
          </div>
          {/* Barra visual */}
          <div className="mt-3 h-3 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${(ltvMedio / cac) >= 3 ? 'bg-emerald-500' : (ltvMedio / cac) >= 2 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${Math.min((ltvMedio / cac) / 5 * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── GRÁFICO: Evolução Novos Pacientes ── */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest text-center mb-4">
          Novos Pacientes por Mês (últimos 12 meses)
        </h3>
        <div className="h-[280px] w-full">
          {evolucaoNovosPacientes.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolucaoNovosPacientes}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Line type="monotone" dataKey="count" name="Novos Pacientes" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5, fill: '#3b82f6' }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>
      </div>

      {/* ── FUNIL DE CONVERSÃO + FONTE DE CAPTAÇÃO ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funil */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6 text-center">Funil de Conversão</h3>
          <div className="space-y-4">
            <FunnelStep
              label="Fila de Espera"
              value={funil.filaEspera}
              width={100}
              color="bg-zinc-200"
            />
            <div className="flex items-center justify-center">
              <span className="text-xs font-bold text-zinc-400">↓ {funil.taxaConversaoFila.toFixed(0)}% conversão</span>
            </div>
            <FunnelStep
              label="1ª Sessão (Novos Pacientes)"
              value={funil.novosPacientes}
              width={funil.filaEspera > 0 ? Math.max(30, (funil.novosPacientes / funil.filaEspera) * 100) : 70}
              color="bg-blue-400"
            />
            <div className="flex items-center justify-center">
              <span className="text-xs font-bold text-zinc-400">↓ {funil.taxaAdesao.toFixed(0)}% adesão</span>
            </div>
            <FunnelStep
              label="Aderidos (≥3 sessões)"
              value={funil.aderidos}
              width={funil.novosPacientes > 0 ? Math.max(20, (funil.aderidos / funil.novosPacientes) * 100) : 40}
              color="bg-emerald-500"
            />
          </div>
        </div>

        {/* Fonte de Captação */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Fonte de Captação</h3>
          {fonteCaptacao.length > 0 ? (
            <div className="space-y-3">
              {fonteCaptacao.map((f, i) => (
                <div key={f.fonte} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-priori-navy truncate">{f.fonte}</span>
                      <span className="text-xs font-bold text-zinc-500">{f.count} pac. ({f.percent.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${f.percent}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-zinc-400">
                      <span>Receita: R$ {fmtShort(Math.round(f.receita))}</span>
                      <span>LTV: R$ {fmtShort(Math.round(f.ltvMedio))}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-zinc-400 italic">Nenhuma fonte de captação registrada</p>
              <p className="text-[10px] text-zinc-300 mt-1">Cadastre a origem no perfil do paciente</p>
            </div>
          )}
        </div>
      </div>

      {/* ── TABELA: Cohort de Retenção ── */}
      {cohortData.length > 0 && (
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm overflow-x-auto">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-1">Cohort de Retenção</h3>
          <p className="text-[10px] text-zinc-400 mb-4">% de pacientes ativos após 1, 3 e 6 meses desde a entrada</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Mês Entrada</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Entrou</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Mês 1</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Mês 3</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Mês 6</th>
                <th className="text-right py-2 px-3 text-xs font-bold text-zinc-400 uppercase">LTV Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {cohortData.map(c => (
                <tr key={c.month} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition">
                  <td className="py-2.5 px-3 font-semibold text-priori-navy capitalize">{c.month}</td>
                  <td className="py-2.5 px-3 text-center text-zinc-600">{c.total}</td>
                  <td className="py-2.5 px-3 text-center">
                    <RetentionBadge value={c.retencaoMes1} />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <RetentionBadge value={c.retencaoMes3} />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <RetentionBadge value={c.retencaoMes6} />
                  </td>
                  <td className="py-2.5 px-3 text-right text-zinc-600 font-bold">R$ {fmtShort(Math.round(c.ltvAcumulado))}</td>
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
function KPICard({ icon, label, value, subtitle, trend, color }: {
  icon: React.ReactNode; label: string; value: string;
  subtitle?: string; trend?: React.ReactNode; color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
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
      {trend && <div className="mt-1">{trend}</div>}
    </div>
  );
}

function FunnelStep({ label, value, width, color }: { label: string; value: number; width: number; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className={`${color} rounded-xl py-3 px-4 text-center transition-all`} style={{ width: `${width}%` }}>
        <p className="text-lg font-bold text-white">{value}</p>
        <p className="text-[10px] font-bold text-white/80 uppercase">{label}</p>
      </div>
    </div>
  );
}

function RetentionBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-zinc-300">—</span>;
  const color = value >= 70 ? 'bg-emerald-50 text-emerald-600' : value >= 40 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600';
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${color}`}>{value.toFixed(0)}%</span>;
}

function EmptyState() {
  return <div className="h-full flex items-center justify-center text-zinc-400 text-sm italic py-8">Sem dados no período</div>;
}
