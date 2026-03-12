import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart as PieChartIcon, 
  BarChart3, 
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Activity
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar,
  PieChart,
  Cell,
  Legend,
  Pie
} from 'recharts';
import { api } from '../services/api';
import { Payment, Subscription, Customer, Plan, Psychologist } from '../services/types';
import { cn } from '../lib/utils';

const COLORS = ['#1B365D', '#C5A059', '#2D3748', '#4A5568', '#718096', '#A0AEC0'];

export const FinancialPage = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const [pay, sub, cust, pl, psy] = await Promise.all([
        api.getPayments(),
        api.getSubscriptions(),
        api.getCustomers(),
        api.getPlans(),
        api.getPsychologists()
      ]);
      setPayments(pay.sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()));
      setSubscriptions(sub);
      setCustomers(cust);
      setPlans(pl);
      setPsychologists(psy);
      setIsLoading(false);
      
      // Small delay to ensure DOM is ready for charts
      setTimeout(() => setIsReady(true), 100);
    };
    loadData();
  }, []);

  const stats = useMemo(() => {
    const totalGross = payments.reduce((acc, p) => acc + p.amount, 0);
    const totalRepass = payments.reduce((acc, p) => acc + (p.repassAmount || 0), 0);
    const totalNet = totalGross - totalRepass;
    
    return { totalGross, totalRepass, totalNet };
  }, [payments]);

  const chartData = useMemo(() => {
    const monthlyData: { [key: string]: { month: string, gross: number, net: number, repass: number } } = {};
    
    payments.forEach(p => {
      const date = new Date(p.paidAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { month: monthLabel, gross: 0, net: 0, repass: 0 };
      }
      
      monthlyData[monthKey].gross += p.amount;
      monthlyData[monthKey].repass += (p.repassAmount || 0);
      monthlyData[monthKey].net += (p.amount - (p.repassAmount || 0));
    });

    return Object.values(monthlyData);
  }, [payments]);

  const planDistribution = useMemo(() => {
    const distribution: { [key: string]: number } = {};
    
    payments.forEach(p => {
      const sub = subscriptions.find(s => s.id === p.subscriptionId);
      const plan = plans.find(pl => pl.id === sub?.planId);
      const planName = plan?.name || 'Outros';
      
      distribution[planName] = (distribution[planName] || 0) + p.amount;
    });

    return Object.entries(distribution).map(([name, value]) => ({ name, value }));
  }, [payments, subscriptions, plans]);

  const psyDistribution = useMemo(() => {
    const distribution: { [key: string]: number } = {};
    
    payments.forEach(p => {
      const sub = subscriptions.find(s => s.id === p.subscriptionId);
      const customer = customers.find(c => c.id === sub?.customerId);
      const psy = psychologists.find(ps => ps.id === customer?.psychologistId);
      const psyName = psy?.name || 'Não Atribuído';
      
      distribution[psyName] = (distribution[psyName] || 0) + (p.repassAmount || 0);
    });

    return Object.entries(distribution).map(([name, value]) => ({ name, value }));
  }, [payments, subscriptions, customers, psychologists]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-priori-navy border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-priori-navy">Financeiro</h2>
        <p className="text-zinc-500">Visão detalhada da saúde financeira da clínica.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-zinc-100 p-6 rounded-2xl relative overflow-hidden group shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity text-priori-navy">
            <TrendingUp size={80} />
          </div>
          <p className="text-[10px] font-bold text-priori-navy uppercase tracking-widest mb-1">Receita Bruta Total</p>
          <p className="text-3xl font-bold text-priori-navy">R$ {stats.totalGross.toLocaleString()}</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-priori-navy">
            <ArrowUpRight size={14} />
            <span>+12% em relação ao mês anterior</span>
          </div>
        </div>

        <div className="bg-white border border-zinc-100 p-6 rounded-2xl relative overflow-hidden group shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity text-priori-gold">
            <Users size={80} />
          </div>
          <p className="text-[10px] font-bold text-priori-gold uppercase tracking-widest mb-1">Total de Repasses</p>
          <p className="text-3xl font-bold text-priori-navy">R$ {stats.totalRepass.toLocaleString()}</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-priori-gold">
            <ArrowDownRight size={14} />
            <span>Custo operacional de profissionais</span>
          </div>
        </div>

        <div className="bg-white border border-zinc-100 p-6 rounded-2xl relative overflow-hidden group shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity text-priori-navy">
            <DollarSign size={80} />
          </div>
          <p className="text-[10px] font-bold text-priori-navy uppercase tracking-widest mb-1">Lucro Líquido</p>
          <p className="text-3xl font-bold text-priori-navy">R$ {stats.totalNet.toLocaleString()}</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-priori-navy">
            <Activity size={14} />
            <span>Margem de {( (stats.totalNet / stats.totalGross) * 100 ).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-priori-navy uppercase tracking-wider flex items-center gap-2">
              <BarChart3 size={18} className="text-priori-navy" />
              Evolução Mensal
            </h3>
          </div>
          <div className="h-[300px] w-full overflow-hidden">
            {isReady && chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" key="evolution-chart" debounce={100}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1B365D" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#1B365D" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C5A059" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#C5A059" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(value) => `R$ ${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="gross" name="Bruto" stroke="#1B365D" fillOpacity={1} fill="url(#colorGross)" />
                  <Area type="monotone" dataKey="net" name="Líquido" stroke="#C5A059" fillOpacity={1} fill="url(#colorNet)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-400 text-sm italic">
                Aguardando dados para o gráfico...
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-priori-navy uppercase tracking-wider flex items-center gap-2">
              <PieChartIcon size={18} className="text-priori-gold" />
              Distribuição por Plano
            </h3>
          </div>
          <div className="h-[300px] w-full overflow-hidden">
            {isReady && planDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" key="plan-dist-chart" debounce={100}>
                <PieChart>
                  <Pie
                    data={planDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {planDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ fontSize: '12px' }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-400 text-sm italic">
                Sem dados de planos.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-priori-navy uppercase tracking-wider flex items-center gap-2">
              <Users size={18} className="text-priori-gold" />
              Repasse por Psicólogo
            </h3>
          </div>
          <div className="h-[300px] w-full overflow-hidden">
            {isReady && psyDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" key="psy-repass-chart" debounce={100}>
                <BarChart data={psyDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    width={100}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ fontSize: '12px' }}
                  />
                  <Bar dataKey="value" name="Total Repasse" fill="#C5A059" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-400 text-sm italic">
                Sem dados de repasse.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-priori-navy uppercase tracking-wider flex items-center gap-2">
              <Calendar size={18} className="text-priori-navy" />
              Últimos Lançamentos
            </h3>
          </div>
          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {payments.slice().reverse().slice(0, 10).map((payment) => {
              const sub = subscriptions.find(s => s.id === payment.subscriptionId);
              const customer = customers.find(c => c.id === sub?.customerId);
              return (
                <div key={payment.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-zinc-400 border border-zinc-100">
                      <DollarSign size={14} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-priori-navy">{customer?.name || 'N/A'}</p>
                      <p className="text-[10px] text-zinc-500">{new Date(payment.paidAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-priori-navy">R$ {payment.amount.toLocaleString()}</p>
                    <p className="text-[10px] text-zinc-400">Líq: R$ {(payment.amount - (payment.repassAmount || 0)).toLocaleString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
