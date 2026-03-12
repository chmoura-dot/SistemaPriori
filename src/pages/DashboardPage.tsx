import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Activity, 
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ShieldCheck
} from 'lucide-react';
import { api } from '../services/api';
import { 
  Customer, 
  Subscription, 
  Plan, 
  SubscriptionStatus,
  Appointment,
  Expense,
  ExpenseCategory,
  UserRole
} from '../services/types';
import { cn } from '../lib/utils';

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
      setAppointments(a.filter(app => app.confirmedPsychologist));
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
      const plan = plans.find(p => p.name === customer?.healthPlan);
      const procedure = plan?.procedures?.find(proc => proc.type === firstApp.type);
      
      if (procedure?.isOneTimeCharge) {
        // One-time charge: only count the first one
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

  const appointmentRevenue = calculateRevenue(appointments);

  const totalRevenue = subscriptionRevenue + appointmentRevenue;
  const totalExpenses = expenses.reduce((acc, exp) => acc + exp.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  const stats = [
    { label: 'Total de Clientes', value: customers.length, icon: Users, color: 'text-priori-navy', bg: 'bg-priori-navy/10', path: '/clientes' },
    { label: 'Faturamento Bruto', value: `R$ ${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-priori-gold', bg: 'bg-priori-gold/10', path: '/financeiro', adminOnly: true },
    { label: 'Resultado Líquido', value: `R$ ${netProfit.toLocaleString()}`, icon: ShieldCheck, color: netProfit >= 0 ? 'text-priori-gold' : 'text-red-500', bg: netProfit >= 0 ? 'bg-priori-gold/10' : 'bg-red-500/10', path: '/despesas', adminOnly: true },
  ].filter(stat => !stat.adminOnly || user?.role === UserRole.ADMIN);

  // Summaries
  const revenueByPlan = plans.map(plan => {
    const subRevenue = activeSubs
      .filter(s => s.planId === plan.id)
      .reduce((acc, s) => acc + (plan.procedures?.[0]?.price || 0), 0);
    
    const planApps = appointments.filter(app => {
      const customer = customers.find(c => c.id === app.customerId);
      return customer?.healthPlan === plan.name;
    });

    const appRevenue = calculateRevenue(planApps);

    return { name: plan.name, total: subRevenue + appRevenue };
  }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

  const revenueByPsychologist = psychologists.map(psy => {
    const psyApps = appointments.filter(app => app.psychologistId === psy.id);
    const appRevenue = calculateRevenue(psyApps);
    
    return { name: psy.name, total: appRevenue };
  }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

  const monthlyRevenue = appointments.reduce((acc: any, app) => {
    const month = new Date(app.date + 'T12:00:00').toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    
    // For monthly breakdown, we still need to handle one-time charges correctly.
    // This is tricky because a one-time charge might span multiple months if sessions are spread out.
    // But usually, it's charged in the month of the first session.
    
    const customer = customers.find(c => c.id === app.customerId);
    const plan = plans.find(p => p.name === customer?.healthPlan);
    const procedure = plan?.procedures?.find(proc => proc.type === app.type);

    if (procedure?.isOneTimeCharge) {
      // Check if this is the first appointment of this type for this customer
      const firstApp = appointments
        .filter(a => a.customerId === app.customerId && a.type === app.type)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      
      if (firstApp.id === app.id) {
        const amount = app.customPrice ?? customer?.customPrice ?? (procedure?.price || 0);
        acc[month] = (acc[month] || 0) + amount;
      }
    } else {
      const amount = app.customPrice ?? customer?.customPrice ?? (procedure?.price || 0);
      acc[month] = (acc[month] || 0) + amount;
    }
    
    return acc;
  }, {});

  const monthlyData = Object.entries(monthlyRevenue).map(([month, total]) => ({ month, total: total as number }));

  return (
    <div className="space-y-8 min-h-[400px]">
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-priori-navy border-t-transparent" />
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-2xl font-bold text-priori-navy">Visão Geral</h2>
            <p className="text-zinc-500">Acompanhe o desempenho da clínica em tempo real.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {stats.map((stat) => (
              <div 
                key={stat.label} 
                className="bg-white border border-zinc-100 p-6 rounded-2xl hover:border-priori-gold/30 shadow-sm transition-all cursor-pointer group"
                onClick={() => stat.path && onNavigate(stat.path)}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={cn("p-2 rounded-lg", stat.bg)}>
                    <stat.icon size={20} className={stat.color} />
                  </div>
                  <ArrowUpRight size={16} className="text-zinc-400 group-hover:text-priori-gold transition-colors" />
                </div>
                <p className="text-zinc-500 text-sm font-medium">{stat.label}</p>
                <h3 className="text-2xl font-bold text-priori-navy mt-1">{stat.value}</h3>
              </div>
            ))}
          </div>

          {user?.role === UserRole.ADMIN && (
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
                <div className="space-y-4">
                  {monthlyData.map(item => (
                    <div key={item.month} className="flex items-center justify-between">
                      <span className="text-sm text-priori-navy capitalize">{item.month}</span>
                      <span className="text-sm font-bold text-priori-navy">R$ {item.total.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expenses Summary */}
              <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm lg:col-span-3">
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
          )}

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
