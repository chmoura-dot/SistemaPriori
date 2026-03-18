import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Activity, 
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  ChevronRight,
  Lock
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { api } from '../services/api';
import { Appointment, Subscription, HealthPlan, Psychologist, Customer, CustomerStatus, SubscriptionStatus, AppointmentStatus, ParticularBillingType, Plan, Expense, ExpenseCategory } from '../services/types';
import { cn } from '../lib/utils';
import { calcRepass } from '../lib/repassRules';

export const DashboardPage = ({ onNavigate }: { onNavigate: (path: string) => void }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [psychologists, setPsychologists] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const user = api.getCurrentUser();

  useEffect(() => {
    const loadData = async () => {
      const [c, s, p, a, psy, exp] = await Promise.all([
        api.getCustomers(),
        api.getSubscriptions(),
        api.getPlans(),
        api.getAppointments(),
        api.getPsychologists(),
        api.getExpenses()
      ]);
      setCustomers(c);
      setSubscriptions(s);
      setPlans(p);
      setAppointments(a); // Mantém todos para poder separar Previsto de Realizado
      setPsychologists(psy);
      setExpenses(exp);
      setIsLoading(false);
    };
    loadData();
  }, []);

  const activeSubs = subscriptions.filter(s => s.status === SubscriptionStatus.ACTIVE);
  
  const subscriptionRevenue = activeSubs.reduce((acc, sub) => {
    const plan = plans.find(p => p.id === sub.planId);
    // Use the first procedure price as the subscription price if no top-level price exists
    const price = plan?.procedures?.[0]?.price || 0;
    return acc + price;
  }, 0);

  // Helper: busca de plano case-insensitive (banco usa MAIÚSCULAS, pacientes usam capitalização mista)
  const findPlan = (healthPlan?: string) =>
    plans.find(p => p.name.toUpperCase() === (healthPlan ?? '').toUpperCase());

  const calculateRevenue = (apps: Appointment[]) => {
    // Group by customer and type to handle one-time charges
    const grouped = apps.reduce((acc: Record<string, Appointment[]>, app) => {
      const key = `${app.customerId}-${app.type}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(app);
      return acc;
    }, {});

    return Object.values(grouped).reduce((total, customerApps) => {
      const firstApp = customerApps[0];
      const customer = customers.find(c => c.id === firstApp.customerId);
      const plan = findPlan(customer?.healthPlan);
      const procedure = plan?.procedures?.find(proc => proc.type === firstApp.type);
      
      const isPackage = customer?.healthPlan === HealthPlan.PARTICULAR && customer?.particularBillingType === ParticularBillingType.PACKAGE;
      
      if (procedure?.isOneTimeCharge || isPackage) {
        // One-time charge or package: only count the first one
        const amount = firstApp.customPrice ?? customer?.customPrice ?? (procedure?.price || 0);
        return total + amount;
      } else {
        // Regular charge: count all
        const appTotal = customerApps.reduce((sum, app) => {
          const amount = app.customPrice ?? customer?.customPrice ?? (procedure?.price || 0);
          return sum + amount;
        }, 0);
        return total + appTotal;
      }
    }, 0);
  };

  const isCanceledButBilled = (app: Appointment) => 
    app.status === AppointmentStatus.CANCELED && 
    (app.cancellationBilling === 'plan' || app.cancellationBilling === 'particular');

  const appsRealizados = appointments.filter(app => app.confirmedPsychologist || isCanceledButBilled(app));
  const appsPrevistos = appointments.filter(app => !app.confirmedPsychologist && app.status !== AppointmentStatus.CANCELED);

  const revenueRealizado = calculateRevenue(appsRealizados) + subscriptionRevenue;
  const revenuePrevisto = calculateRevenue(appsPrevistos);
  const totalGeralPrevisto = revenueRealizado + revenuePrevisto;

  const totalExpenses = expenses.reduce((acc, exp) => acc + exp.amount, 0);
  const netProfit = revenueRealizado - totalExpenses;

  const stats = [
    { label: 'Pacientes Ativos', value: customers.filter(c => c.status === CustomerStatus.ACTIVE).length, icon: Users, color: 'text-priori-navy', bg: 'bg-priori-navy/10', path: '/clientes' },
    { label: 'Faturamento Realizado', value: `R$ ${revenueRealizado.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', path: '/financeiro' },
    { label: 'Faturamento Previsto', value: `R$ ${totalGeralPrevisto.toLocaleString()}`, icon: Activity, color: 'text-priori-gold', bg: 'bg-priori-gold/10', path: '/financeiro' },
    { label: 'Resultado Líquido Atual', value: `R$ ${netProfit.toLocaleString()}`, icon: ShieldCheck, color: netProfit >= 0 ? 'text-priori-gold' : 'text-red-500', bg: netProfit >= 0 ? 'bg-priori-gold/10' : 'bg-red-500/10', path: '/despesas' },
  ];

  // Summaries
  const revenueByPlan = plans.map(plan => {
    const subRevenue = activeSubs
      .filter(s => s.planId === plan.id)
      .reduce((acc, s) => acc + (plan.procedures?.[0]?.price || 0), 0);
    
    const planApps = appsRealizados.filter(app => {
      const customer = customers.find(c => c.id === app.customerId);
      return (customer?.healthPlan ?? '').toUpperCase() === plan.name.toUpperCase();
    });

    const appRevenue = calculateRevenue(planApps);

    return { name: plan.name, total: subRevenue + appRevenue };
  }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

  const revenueByPsychologist = psychologists.map(psy => {
    const psyApps = appsRealizados.filter(app => app.psychologistId === psy.id);
    const appRevenue = calculateRevenue(psyApps);
    
    return { name: psy.name, total: appRevenue };
  }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

  const monthlyRevenue = appointments
    .filter(app => app.status !== AppointmentStatus.CANCELED || isCanceledButBilled(app))
    .reduce((acc: any, app) => {
      const month = new Date(app.date + 'T12:00:00').toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
      
      if (!acc[month]) {
        acc[month] = { realizado: 0, previsto: 0 };
      }

      const customer = customers.find(c => c.id === app.customerId);
      const plan = findPlan(customer?.healthPlan);
      const procedure = plan?.procedures?.find(proc => proc.type === app.type);

      const isPackage = customer?.healthPlan === HealthPlan.PARTICULAR && customer?.particularBillingType === ParticularBillingType.PACKAGE;

      let amount = 0;
      if (procedure?.isOneTimeCharge || isPackage) {
        const firstApp = appointments
          .filter(a => a.customerId === app.customerId && a.type === app.type && (a.status !== AppointmentStatus.CANCELED || isCanceledButBilled(a)))
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        
        if (firstApp.id === app.id) {
          amount = app.customPrice ?? customer?.customPrice ?? (procedure?.price || 0);
        }
      } else {
        amount = app.customPrice ?? customer?.customPrice ?? (procedure?.price || 0);
      }
      
      if (app.confirmedPsychologist || isCanceledButBilled(app)) {
        acc[month].realizado += amount;
      } else {
        acc[month].previsto += amount;
      }
      
      return acc;
    }, {});

  const monthlyData = Object.entries(monthlyRevenue).map(([month, data]: [string, any]) => ({ 
    month, 
    realizado: data.realizado,
    previsto: data.previsto,
    total: data.realizado + data.previsto
  }));

  const modalityData = [
    { name: 'Presencial', value: appsRealizados.filter(app => app.mode === 'Presencial').length },
    { name: 'On-line', value: appsRealizados.filter(app => app.mode === 'On-line').length },
  ].filter(d => d.value > 0);

  const MODALITY_COLORS = ['#1a365d', '#d4af37']; // Priori Navy and Priori Gold

  const amsAlerts = customers.filter(c => {
    if (c.healthPlan !== HealthPlan.AMS_PETROBRAS || !c.amsPasswordExpiry || c.status !== CustomerStatus.ACTIVE) return false;
    
    const expiry = new Date(c.amsPasswordExpiry + 'T12:00:00');
    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays <= 7;
  });

  return (
    <div className="space-y-8 min-h-[400px]">
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-priori-navy border-t-transparent" />
        </div>
      ) : (
        <>
          {amsAlerts.length > 0 && (
            <div className="space-y-3">
              {amsAlerts.map(customer => {
                const expiry = new Date(customer.amsPasswordExpiry! + 'T12:00:00');
                const today = new Date();
                const diffTime = expiry.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const isExpired = diffDays <= 0;

                return (
                  <div 
                    key={customer.id} 
                    className={cn(
                      "flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border animate-in fade-in slide-in-from-top-4 duration-500",
                      isExpired 
                        ? "bg-red-50 border-red-100 text-red-900" 
                        : "bg-amber-50 border-amber-100 text-amber-900"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "p-3 rounded-xl",
                        isExpired ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                      )}>
                        <Lock size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm">Vencimento de Senha AMS</h4>
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                            isExpired ? "bg-red-600 text-white" : "bg-amber-600 text-white"
                          )}>
                            {isExpired ? 'Expirada' : `Vence em ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}`}
                          </span>
                        </div>
                        <p className="text-xs opacity-80 mt-0.5">
                          A senha do portal AMS do paciente <span className="font-bold">{customer.name}</span> {isExpired ? 'expirou em' : 'vencerá em'} {new Date(customer.amsPasswordExpiry! + 'T12:00:00').toLocaleDateString('pt-BR')}.
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => onNavigate('/clientes')}
                      className={cn(
                        "mt-4 sm:mt-0 flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all hover:translate-x-1",
                        isExpired ? "text-red-600" : "text-amber-600"
                      )}
                    >
                      Atualizar no Cadastro
                      <ChevronRight size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <h2 className="text-2xl font-bold text-priori-navy">Visão Geral</h2>
            <p className="text-zinc-500">Acompanhe o desempenho da clínica em tempo real.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat) => (
              <div 
                key={stat.label} 
                className="glass-card p-6 rounded-[2.5rem] btn-premium group"
                onClick={() => stat.path && onNavigate(stat.path)}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={cn("p-4 rounded-3xl", stat.bg)}>
                    <stat.icon size={24} className={stat.color} />
                  </div>
                  <ArrowUpRight size={18} className="text-zinc-300 group-hover:text-priori-gold transition-colors" />
                </div>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">{stat.label}</p>
                <h3 className="text-2xl font-bold text-priori-navy mt-1">{stat.value}</h3>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue by Plan */}
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Faturamento por Plano</h3>
              <div className="space-y-4">
                {revenueByPlan.map(item => (
                  <div key={item.name} className="flex items-center justify-between">
                    <span className="text-sm text-priori-navy">{item.name}</span>
                    <span className="text-sm font-bold text-priori-gold">R$ {item.total.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Revenue by Psychologist */}
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Faturamento por Psicólogo</h3>
              <div className="space-y-4">
                {revenueByPsychologist.map(item => (
                  <div key={item.name} className="flex items-center justify-between">
                    <span className="text-sm text-priori-navy">{item.name}</span>
                    <span className="text-sm font-bold text-priori-gold">R$ {item.total.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly Revenue */}
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Faturamento Mensal (Consultas)</h3>
              <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                {monthlyData.map(item => (
                  <div key={item.month} className="flex flex-col gap-1 py-1 border-b border-zinc-50 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-priori-navy capitalize">{item.month}</span>
                      <span className="text-sm font-bold text-priori-navy">Total: R$ {item.total.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-emerald-600">Realizado: R$ {item.realizado.toLocaleString()}</span>
                      <span className="text-priori-gold">Previsto: R$ {item.previsto.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
                {monthlyData.length === 0 && (
                  <p className="text-sm text-zinc-400 text-center py-4">Nenhum dado financeiro</p>
                )}
              </div>
            </div>

            {/* Modality Comparison */}
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-2 text-center">Distribuição por Modalidade</h3>
              <div className="h-[220px] w-full">
                {modalityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={modalityData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        animationBegin={0}
                        animationDuration={1500}
                      >
                        {modalityData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={MODALITY_COLORS[index % MODALITY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: number) => [`${value} atendimentos`, 'Quantidade']}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-400 text-sm italic">
                    Nenhum atendimento realizado
                  </div>
                )}
              </div>
              {modalityData.length > 0 && (
                <div className="mt-4 flex justify-around text-[10px] font-bold uppercase tracking-tight text-zinc-400">
                  {modalityData.map((d, i) => {
                    const total = modalityData.reduce((acc, curr) => acc + curr.value, 0);
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

            {/* Expenses Summary */}
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Resumo de Despesas por Categoria</h3>
                <span className="text-xs font-bold text-red-500">Total: R$ {totalExpenses.toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.values(ExpenseCategory).map(cat => {
                  const catTotal = expenses.filter(e => e.category === cat).reduce((acc, e) => acc + e.amount, 0);
                  if (catTotal === 0) return null;
                  return (
                    <div key={cat} className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">{cat}</p>
                      <p className="text-lg font-bold text-priori-navy">R$ {catTotal.toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm flex flex-col justify-center items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-priori-gold/10 flex items-center justify-center">
              <Activity size={32} className="text-priori-gold" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-priori-navy">Núcleo Priori</h3>
              <p className="text-zinc-500 text-sm max-w-xs">
                Neuropsicologia e Psicoterapia. Use o menu lateral para gerenciar seus pacientes e agenda.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
