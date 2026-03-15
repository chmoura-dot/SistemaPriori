import React, { useState, useEffect } from 'react';
import { CreditCard, Search, Calendar, User, DollarSign } from 'lucide-react';
import { api } from '../services/api';
import { Payment, Subscription, Customer, Plan, Appointment, Psychologist, AttendanceMode } from '../services/types';
import { cn } from '../lib/utils';
import { calcRepass } from '../lib/repassRules';

export const PaymentsPage = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'subscription' | 'appointment'>('all');
  const [filterSub, setFilterSub] = useState('');

  useEffect(() => {
    const loadData = async () => {
      const [pay, sub, cust, pl, app, psy] = await Promise.all([
        api.getPayments(),
        api.getSubscriptions(),
        api.getCustomers(),
        api.getPlans(),
        api.getAppointments(),
        api.getPsychologists()
      ]);
      setPayments(pay);
      setSubscriptions(sub);
      setCustomers(cust);
      setPlans(pl);
      setAppointments(app.filter(a => a.confirmedPsychologist));
      setPsychologists(psy);
      setIsLoading(false);
    };
    loadData();
  }, []);

  // Map appointments to a payment-like structure
  const invoicedAppointments = React.useMemo(() => {
    // Group by customer and type to handle one-time charges
    const grouped = appointments.reduce((acc: Record<string, Appointment[]>, app) => {
      const key = `${app.customerId}-${app.type}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(app);
      return acc;
    }, {} as Record<string, Appointment[]>);

    const items: any[] = [];

    (Object.values(grouped) as Appointment[][]).forEach(customerApps => {
      // Sort by date to identify the first one
      const sortedApps = [...customerApps].sort((a, b) => a.date.localeCompare(b.date));
      const firstApp = sortedApps[0];
      const customer = customers.find(c => c.id === firstApp.customerId);
      const plan = plans.find(p => p.name.toUpperCase() === (customer?.healthPlan ?? '').toUpperCase());
      const procedure = plan?.procedures?.find(proc => proc.type === firstApp.type);

      sortedApps.forEach((app, idx) => {
        const isOneTime = procedure?.isOneTimeCharge;
        const isFirst = idx === 0;

        // If it's a one-time charge and not the first session, the amount is 0
        const amount = (isOneTime && !isFirst) ? 0 : (app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0);
        const psy = psychologists.find(p => p.id === app.psychologistId);
        const fixedRepass = (isOneTime && !isFirst) ? 0 : (app.customRepassAmount ?? customer?.customRepassAmount ?? procedure?.repassAmount ?? 0);
        const repassAmount = (isOneTime && !isFirst) ? 0 : calcRepass(amount, psy?.name, fixedRepass);

        items.push({
          id: app.id,
          customerId: app.customerId,
          amount,
          repassAmount,
          date: app.date,
          type: 'appointment' as const,
          planName: plan?.name || 'N/A',
          customerName: customer?.name || 'N/A',
          isSubsequentOneTime: isOneTime && !isFirst
        });
      });
    });

    return items;
  }, [appointments, customers, plans, psychologists]);

  const subscriptionPayments = payments.map(p => {
    const sub = subscriptions.find(s => s.id === p.subscriptionId);
    const customer = customers.find(c => c.id === sub?.customerId);
    const plan = plans.find(p => p.id === sub?.planId);
    return {
      id: p.id,
      customerId: sub?.customerId || '',
      amount: p.amount,
      repassAmount: p.repassAmount || 0,
      date: p.paidAt,
      type: 'subscription' as const,
      planName: plan?.name || 'N/A',
      customerName: customer?.name || 'N/A',
      subscriptionId: p.subscriptionId
    };
  });

  const allItems = [...subscriptionPayments, ...invoicedAppointments].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const filteredItems = allItems.filter(item => {
    if (filterType !== 'all' && item.type !== filterType) return false;
    if (filterSub && 'subscriptionId' in item && item.subscriptionId !== filterSub) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-priori-navy">Pagamentos</h2>
        <p className="text-zinc-500">Histórico financeiro da clínica.</p>
      </div>

      <div className="bg-white border border-zinc-100 p-4 rounded-2xl flex flex-col lg:flex-row gap-4 items-end shadow-sm">
        <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 block">Tipo de Lançamento</label>
            <select
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
            >
              <option value="all">Todos os lançamentos</option>
              <option value="subscription">Assinaturas</option>
              <option value="appointment">Consultas Confirmadas</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 block">Filtrar por Assinatura</label>
            <select
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20"
              value={filterSub}
              onChange={(e) => setFilterSub(e.target.value)}
              disabled={filterType === 'appointment'}
            >
              <option value="">Todas as assinaturas</option>
              {subscriptions.map(sub => {
                const customer = customers.find(c => c.id === sub.customerId);
                const plan = plans.find(p => p.id === sub.planId);
                return (
                  <option key={sub.id} value={sub.id}>
                    {customer?.name} ({plan?.name})
                  </option>
                );
              })}
            </select>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-4 w-full lg:w-auto">
          <div className="bg-priori-navy/5 border border-priori-navy/10 px-4 py-3 rounded-2xl flex items-center gap-3 flex-1 min-w-[160px]">
            <div className="p-1.5 bg-priori-navy rounded-lg text-white">
              <DollarSign size={16} />
            </div>
            <div className="text-left">
              <p className="text-[9px] font-bold text-priori-navy uppercase tracking-widest">Total Bruto</p>
              <p className="text-lg font-bold text-priori-navy">
                R$ {filteredItems.reduce((acc, p) => acc + p.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="bg-priori-gold/5 border border-priori-gold/10 px-4 py-3 rounded-2xl flex items-center gap-3 flex-1 min-w-[160px]">
            <div className="p-1.5 bg-priori-gold rounded-lg text-white">
              <User size={16} />
            </div>
            <div className="text-left">
              <p className="text-[9px] font-bold text-priori-gold uppercase tracking-widest">Total Repasse</p>
              <p className="text-lg font-bold text-priori-navy">
                R$ {filteredItems.reduce((acc, p) => acc + (p.repassAmount || 0), 0).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="bg-zinc-100 border border-zinc-200 px-4 py-3 rounded-2xl flex items-center gap-3 flex-1 min-w-[160px]">
            <div className="p-1.5 bg-zinc-500 rounded-lg text-white">
              <CreditCard size={16} />
            </div>
            <div className="text-left">
              <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Lucro Líquido</p>
              <p className="text-lg font-bold text-priori-navy">
                R$ {filteredItems.reduce((acc, p) => acc + (p.amount - (p.repassAmount || 0)), 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50">
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Paciente</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor Bruto</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Repasse</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Líq. Clínica</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Data</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-priori-navy border-t-transparent mx-auto" />
                  </td>
                </tr>
              ) : filteredItems.map((item) => {
                return (
                  <tr key={item.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                          <User size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-priori-navy">{item.customerName}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{item.planName}</p>
                            {item.isSubsequentOneTime && (
                              <span className="text-[8px] bg-priori-navy/5 text-priori-navy px-1 py-0.5 rounded border border-priori-navy/10 uppercase font-bold tracking-tighter">Sessão Excedente (Cobrança Única)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                        item.type === 'subscription' ? "bg-priori-navy/5 text-priori-navy" : "bg-priori-gold/5 text-priori-gold"
                      )}>
                        {item.type === 'subscription' ? 'Assinatura' : 'Consulta'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-priori-navy">
                        R$ {item.amount.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-priori-gold font-medium">
                        R$ {(item.repassAmount || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-priori-navy">
                        R$ {(item.amount - (item.repassAmount || 0)).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-zinc-500 text-sm">
                        <Calendar size={14} />
                        {new Date(item.date + (item.type === 'appointment' ? 'T12:00:00' : '')).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                        item.type === 'subscription' ? "bg-priori-navy/10 text-priori-navy" : "bg-zinc-100 text-zinc-500"
                      )}>
                        {item.type === 'subscription' ? 'Pago' : 'Faturada'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-500 text-sm">
                    Nenhum lançamento registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
