import React from 'react';
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis,
  Tooltip, Legend, Area, Line, BarChart, Bar, Cell,
} from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, Wallet, Receipt, CreditCard } from 'lucide-react';
import { fmt, fmtShort, getTrendText, CHART_COLORS } from './utils';

interface Props {
  receitaBruta: number;
  receitaBrutaPrev: number;
  receitaLiquida: number;
  totalRepasses: number;
  lucroOperacional: number;
  impostosPeriodo: number;
  taxasBancarias: number;
  despesasOperacionais: number;
  totalDespesas: number;
  totalDespesasPrev: number;
  repassePorPsicologo: { nome: string; sessoes: number; bruto: number; repasse: number; regra: string; percentReceita: number }[];
  receitaPorCanal: { nome: string; sessoes: number; receita: number; ticketMedio: number; percentMix: number }[];
  ticketMedioPorPsicologo: { nome: string; sessoes: number; receita: number; ticketMedio: number }[];
  glosaPorConvenio: { plano: string; guiasEnviadas: number; guiasGlosadas: number; taxaGlosa: number; motivoFrequente: string }[];
  tendenciaReceita6m: { month: string; bruta: number; repasses: number; liquida: number; impostos: number }[];
  filterMode: 'month' | 'year' | 'all';
}

export const DashboardFinanceiroV2Tab = (props: Props) => {
  const {
    receitaBruta, receitaBrutaPrev, receitaLiquida, totalRepasses,
    lucroOperacional, impostosPeriodo, taxasBancarias,
    repassePorPsicologo, receitaPorCanal, ticketMedioPorPsicologo,
    glosaPorConvenio, tendenciaReceita6m, filterMode,
  } = props;

  const ticketMedioGeral = receitaPorCanal.length > 0
    ? receitaPorCanal.reduce((a, c) => a + c.receita, 0) / receitaPorCanal.reduce((a, c) => a + c.sessoes, 0)
    : 0;

  return (
    <div className="space-y-6">

      {/* ── CARDS KPI ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          icon={<DollarSign size={18} />}
          label="Receita Bruta"
          value={`R$ ${fmtShort(Math.round(receitaBruta))}`}
          trend={getTrendText(receitaBruta, receitaBrutaPrev, { filterMode })}
          color="emerald"
        />
        <KPICard
          icon={<Wallet size={18} />}
          label="Receita Líquida"
          value={`R$ ${fmtShort(Math.round(receitaLiquida))}`}
          subtitle={`Impostos: R$ ${fmtShort(Math.round(impostosPeriodo))} | Taxas: R$ ${fmtShort(Math.round(taxasBancarias))}`}
          color="blue"
        />
        <KPICard
          icon={<Receipt size={18} />}
          label="Repasses"
          value={`R$ ${fmtShort(Math.round(totalRepasses))}`}
          subtitle={`${receitaBruta > 0 ? ((totalRepasses / receitaBruta) * 100).toFixed(1) : 0}% da receita bruta`}
          color="amber"
        />
        <KPICard
          icon={lucroOperacional >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          label="Lucro Operacional"
          value={`R$ ${fmtShort(Math.round(lucroOperacional))}`}
          subtitle={`Margem: ${receitaBruta > 0 ? ((lucroOperacional / receitaBruta) * 100).toFixed(1) : 0}%`}
          color={lucroOperacional >= 0 ? 'emerald' : 'red'}
        />
        <KPICard
          icon={<CreditCard size={18} />}
          label="Ticket Médio"
          value={`R$ ${fmt(ticketMedioGeral)}`}
          subtitle="Ponderado por sessão"
          color="indigo"
        />
      </div>

      {/* ── GRÁFICO: Tendência 6 meses ── */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest text-center mb-1">
          Receita Bruta × Líquida × Repasses
        </h3>
        <p className="text-[10px] text-zinc-400 text-center mb-4">Últimos 6 meses (consultas realizadas)</p>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={tendenciaReceita6m}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
              <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: any) => `R$ ${fmt(Number(v))}`} />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Area type="monotone" dataKey="bruta" name="Receita Bruta" fill="#10b981" stroke="#10b981" fillOpacity={0.12} strokeWidth={2} />
              <Area type="monotone" dataKey="repasses" name="Repasses" fill="#f59e0b" stroke="#f59e0b" fillOpacity={0.12} strokeWidth={2} />
              <Line type="monotone" dataKey="liquida" name="Receita Líquida" stroke="#1a365d" strokeWidth={3} dot={{ r: 4, fill: '#1a365d' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── RECEITA POR CANAL + TICKET POR PSICÓLOGO ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Receita por Canal */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Receita por Canal</h3>
          <div className="h-[250px] w-full">
            {receitaPorCanal.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={receitaPorCanal} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" fontSize={10} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="nome" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} width={75} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: any) => `R$ ${fmt(Number(v))}`} />
                  <Bar dataKey="receita" name="Receita" radius={[0, 8, 8, 0]}>
                    {receitaPorCanal.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </div>
          {/* Legenda de mix */}
          <div className="mt-3 space-y-1">
            {receitaPorCanal.map((c, i) => (
              <div key={c.nome} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-zinc-600">{c.nome}</span>
                </div>
                <span className="font-bold text-zinc-500">{c.percentMix.toFixed(1)}% do mix | Ticket: R$ {fmt(c.ticketMedio)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ticket Médio por Psicólogo */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Ticket Médio por Psicólogo</h3>
          <div className="h-[250px] w-full">
            {ticketMedioPorPsicologo.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketMedioPorPsicologo} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" fontSize={10} tickFormatter={v => `R$${v.toFixed(0)}`} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="nome" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} width={75} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: any) => `R$ ${fmt(Number(v))}`} />
                  <Bar dataKey="ticketMedio" name="Ticket Médio" fill="#1a365d" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </div>
        </div>
      </div>

      {/* ── TABELA: Repasse por Psicólogo ── */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Detalhe de Repasse por Psicólogo</h3>
        {repassePorPsicologo.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Profissional</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Sessões</th>
                <th className="text-right py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Valor Bruto</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Regra</th>
                <th className="text-right py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Repasse</th>
                <th className="text-right py-2 px-3 text-xs font-bold text-zinc-400 uppercase">% Receita</th>
              </tr>
            </thead>
            <tbody>
              {repassePorPsicologo.map(p => (
                <tr key={p.nome} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition">
                  <td className="py-2.5 px-3 font-semibold text-priori-navy">{p.nome}</td>
                  <td className="py-2.5 px-3 text-center text-zinc-600">{p.sessoes}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-600">R$ {fmtShort(Math.round(p.bruto))}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="px-2 py-0.5 bg-zinc-100 rounded-lg text-xs font-bold text-zinc-600">{p.regra}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-amber-600">R$ {fmtShort(Math.round(p.repasse))}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-500">{p.percentReceita.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState />}
      </div>

      {/* ── TABELA: Glosa por Convênio ── */}
      {glosaPorConvenio.length > 0 && (
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm overflow-x-auto">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Taxa de Glosa por Convênio</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Plano</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Guias Enviadas</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Glosadas</th>
                <th className="text-center py-2 px-3 text-xs font-bold text-zinc-400 uppercase">% Glosa</th>
                <th className="text-left py-2 px-3 text-xs font-bold text-zinc-400 uppercase">Motivo Frequente</th>
              </tr>
            </thead>
            <tbody>
              {glosaPorConvenio.map(g => (
                <tr key={g.plano} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition">
                  <td className="py-2.5 px-3 font-semibold text-priori-navy">{g.plano}</td>
                  <td className="py-2.5 px-3 text-center text-zinc-600">{g.guiasEnviadas}</td>
                  <td className="py-2.5 px-3 text-center text-red-500 font-bold">{g.guiasGlosadas}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${g.taxaGlosa > 10 ? 'bg-red-50 text-red-600' : g.taxaGlosa > 5 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {g.taxaGlosa.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-zinc-500 text-xs">{g.motivoFrequente}</td>
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
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
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

function EmptyState() {
  return <div className="h-full flex items-center justify-center text-zinc-400 text-sm italic py-8">Sem dados no período</div>;
}
