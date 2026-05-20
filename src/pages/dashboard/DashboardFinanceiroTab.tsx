import React from 'react';
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  Area, Line, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { ExpenseCategory } from '../../services/types';
import { fmt, fmtShort, getTrendText, MODALITY_COLORS } from './utils';
import { useDashboardData } from '../../hooks/useDashboardData';

type Props = ReturnType<typeof useDashboardData>;

export const DashboardFinanceiroTab = (props: Props) => {
  const {
    revenueVsExpensesData,
    revenueByPlan,
    revenueByPsychologist,
    monthlyData,
    modalityData,
    expensesFiltered,
    totalExpenses,
    totalExpensesPrev,
  } = props;

  return (
    <div className="space-y-6">

      {/* ── Gráfico Receita vs Despesas ── */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
        <div className="mb-2">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest text-center">Receita vs Despesas ao Longo do Tempo</h3>
          <p className="text-[10px] text-zinc-400 text-center mt-1">Receita baseada em consultas realizadas (histórico completo)</p>
        </div>
        <div className="h-[300px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={revenueVsExpensesData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
              <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: any) => `R$ ${fmt(Number(v))}`} />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Area type="monotone" dataKey="receita"  name="Receita"       fill="#10b981" stroke="#10b981" fillOpacity={0.15} strokeWidth={2} animationDuration={1500} />
              <Area type="monotone" dataKey="despesas" name="Despesas"      fill="#ef4444" stroke="#ef4444" fillOpacity={0.15} strokeWidth={2} animationDuration={1500} />
              <Line type="monotone" dataKey="lucro"    name="Lucro Líquido" stroke="#d4af37" strokeWidth={3} dot={{ r: 4, fill: '#d4af37' }} activeDot={{ r: 6 }} animationDuration={1500} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Faturamento por Plano / Psicólogo / Mensal ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Faturamento por Plano</h3>
          <div className="space-y-4">
            {revenueByPlan.length > 0 ? revenueByPlan.map(item => (
              <div key={item.name} className="flex items-center justify-between">
                <span className="text-sm text-priori-navy">{item.name}</span>
                <span className="text-sm font-bold text-priori-gold">R$ {fmtShort(item.total)}</span>
              </div>
            )) : <p className="text-sm text-zinc-400 text-center py-4">Sem dados no período</p>}
          </div>
        </div>

        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Faturamento por Psicólogo</h3>
          <div className="space-y-4">
            {revenueByPsychologist.length > 0 ? revenueByPsychologist.map(item => (
              <div key={item.name} className="flex items-center justify-between">
                <span className="text-sm text-priori-navy">{item.name}</span>
                <span className="text-sm font-bold text-priori-gold">R$ {fmtShort(item.total)}</span>
              </div>
            )) : <p className="text-sm text-zinc-400 text-center py-4">Sem dados no período</p>}
          </div>
        </div>

        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Faturamento Mensal (Consultas)</h3>
          <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
            {monthlyData.map(item => (
              <div key={item.month} className="flex flex-col gap-1 py-1 border-b border-zinc-50 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-priori-navy capitalize">{item.month}</span>
                  <span className="text-sm font-bold text-priori-navy">Total: R$ {fmtShort(item.total)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-600">Realizado: R$ {fmtShort(item.realizado)}</span>
                  <span className="text-priori-gold">Previsto: R$ {fmtShort(item.previsto)}</span>
                </div>
              </div>
            ))}
            {monthlyData.length === 0 && <p className="text-sm text-zinc-400 text-center py-4">Nenhum dado financeiro</p>}
          </div>
        </div>
      </div>

      {/* ── Modalidade + Despesas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Modalidade */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-2 text-center">Distribuição por Modalidade</h3>
          <div className="h-[220px] w-full">
            {modalityData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={modalityData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" animationBegin={0} animationDuration={1500}>
                    {modalityData.map((_entry, index) => <Cell key={`cell-${index}`} fill={MODALITY_COLORS[index % MODALITY_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(value: any) => [`${Number(value)} atendimentos`, 'Quantidade']} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-400 text-sm italic">Nenhum atendimento realizado</div>
            )}
          </div>
          {modalityData.length > 0 && (
            <div className="mt-4 flex justify-around text-[10px] font-bold uppercase tracking-tight text-zinc-400">
              {modalityData.map((d, i) => {
                const total   = modalityData.reduce((acc, curr) => acc + curr.value, 0);
                const percent = Math.round((d.value / total) * 100);
                return (
                  <div key={d.name} className="flex flex-col items-center">
                    <span style={{ color: MODALITY_COLORS[i] }}>{d.name}</span>
                    <span className="text-lg text-priori-navy">{percent}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Despesas por Categoria */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Resumo de Despesas por Categoria</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-500">Total: R$ {fmtShort(totalExpenses)}</span>
              {getTrendText(totalExpenses, totalExpensesPrev)}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.values(ExpenseCategory).map(cat => {
              const catTotal = expensesFiltered.filter(e => e.category === cat).reduce((acc, e) => acc + e.amount, 0);
              if (catTotal === 0) return null;
              return (
                <div key={cat} className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                  <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">{cat}</p>
                  <p className="text-lg font-bold text-priori-navy">R$ {fmtShort(catTotal)}</p>
                </div>
              );
            })}
            {expensesFiltered.length === 0 && (
              <p className="col-span-4 text-sm text-zinc-400 text-center py-4">Sem despesas no período</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
