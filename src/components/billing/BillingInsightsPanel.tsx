import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { formatCurrency } from '../../lib/utils';
import { MonthlyChartPoint, OperadoraPerformance } from '../../hooks/billing/billingInsights';

interface Props {
  monthlyData: MonthlyChartPoint[];
  operadoraPerf: OperadoraPerformance[];
}

const currencyTick = (value: number): string => {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(value);
};

const ChartTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-priori-navy text-white text-xs rounded-lg px-3 py-2 shadow-lg leading-relaxed">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey}>{p.name}: <span className="font-mono font-semibold">{formatCurrency(p.value)}</span></p>
      ))}
    </div>
  );
};

const MAX_GLOSA_SCALE = 10; // % — acima disso a barrinha satura em 100%

const prazoTone = (dias: number | null): { dot: string; text: string } => {
  if (dias === null) return { dot: 'bg-zinc-300', text: 'text-zinc-400' };
  if (dias < 30) return { dot: 'bg-emerald-500', text: 'text-emerald-700' };
  if (dias <= 45) return { dot: 'bg-amber-500', text: 'text-amber-700' };
  return { dot: 'bg-red-500', text: 'text-red-700' };
};

export const BillingInsightsPanel: React.FC<Props> = ({ monthlyData, operadoraPerf }) => {
  const hasChartData = monthlyData.some(m => m.confirmado > 0 || m.recebido > 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      {/* Recebimentos por mês */}
      <div className="xl:col-span-3 bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <h3 className="text-sm font-bold text-priori-navy">Recebimentos por mês</h3>
          <span className="text-[11px] text-zinc-400">confirmado vs. efetivamente pago</span>
        </div>
        <div className="h-[220px] w-full mt-2">
          {hasChartData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} stroke="#a1a1aa" />
                <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={currencyTick} stroke="#a1a1aa" width={36} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f4f4f5' }} />
                <Legend verticalAlign="top" height={30} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="confirmado" name="Confirmado (faturado)" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="recebido" name="Recebido" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-zinc-400">
              Sem faturamento nos últimos meses.
            </div>
          )}
        </div>
      </div>

      {/* Desempenho por operadora */}
      <div className="xl:col-span-2 bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-priori-navy">Desempenho por operadora</h3>
        </div>
        {operadoraPerf.length === 0 ? (
          <div className="py-10 text-center text-sm text-zinc-400">
            Ainda não há lotes resolvidos para medir desempenho.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="px-1 pb-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Operadora</th>
                  <th className="px-1 pb-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Glosa</th>
                  <th className="px-1 pb-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Prazo médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {operadoraPerf.map(row => {
                  const tone = prazoTone(row.avgDaysToPay);
                  return (
                    <tr key={row.healthPlan}>
                      <td className="px-1 py-2 text-sm font-semibold text-zinc-700 whitespace-nowrap">{row.healthPlan}</td>
                      <td className="px-1 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-12 h-1.5 rounded-full bg-zinc-100 overflow-hidden inline-block">
                            <span
                              className="h-full block bg-red-500 rounded-full"
                              style={{ width: `${Math.min(100, (row.glosaRate / MAX_GLOSA_SCALE) * 100)}%` }}
                            />
                          </span>
                          <span className="text-xs font-mono text-zinc-600">{row.glosaRate.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-1 py-2">
                        {row.avgDaysToPay === null ? (
                          <span className="text-xs text-zinc-400">—</span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                            <span className={`text-xs font-mono font-semibold ${tone.text}`}>{row.avgDaysToPay}d</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
