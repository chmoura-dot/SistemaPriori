import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, CreditCard, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { 
  Subscription, 
  SubscriptionStatus, 
  Customer, 
  Plan 
} from '../services/types';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { cn } from '../lib/utils';

export const SubscriptionsPage = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    customerId: '',
    planId: '',
    startDate: new Date().toISOString().split('T')[0],
    nextRenewal: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0],
    status: SubscriptionStatus.ACTIVE
  });

  const loadData = async () => {
    setIsLoading(true);
    const [s, c, p] = await Promise.all([
      api.getSubscriptions(),
      api.getCustomers(),
      api.getPlans()
    ]);
    setSubscriptions(s);
    setCustomers(c.filter(cust => cust.status === 'active'));
    setPlans(p.filter(plan => plan.active));
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (sub?: Subscription) => {
    if (sub) {
      setSelectedSub(sub);
      setFormData({
        customerId: sub.customerId,
        planId: sub.planId,
        startDate: sub.startDate,
        nextRenewal: sub.nextRenewal,
        status: sub.status
      });
    } else {
      setSelectedSub(null);
      setFormData({
        customerId: '',
        planId: '',
        startDate: new Date().toISOString().split('T')[0],
        nextRenewal: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0],
        status: SubscriptionStatus.ACTIVE
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (selectedSub) {
        await api.updateSubscription(selectedSub.id, formData);
      } else {
        await api.createSubscription(formData);
      }
      await loadData();
      setIsModalOpen(false);
    } catch (error) {
      alert('Erro ao salvar assinatura');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegisterPayment = async (sub: Subscription) => {
    const plan = plans.find(p => p.id === sub.planId);
    if (!plan) return;

    const price = plan.procedures?.[0]?.price || 0;
    const repass = plan.procedures?.[0]?.repassAmount || 0;

    if (confirm(`Registrar pagamento de R$ ${price} para esta assinatura? Isso renovará por mais 30 dias.`)) {
      setIsSaving(true);
      try {
        await api.createPayment({
          subscriptionId: sub.id,
          amount: price,
          repassAmount: repass,
          paidAt: new Date().toISOString().split('T')[0]
        });
        await loadData();
        alert('Pagamento registrado com sucesso!');
      } catch (error) {
        alert('Erro ao registrar pagamento');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta assinatura?')) {
      await api.deleteSubscription(id);
      await loadData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Assinaturas</h2>
          <p className="text-zinc-500">Controle de renovações e planos ativos.</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="w-full sm:w-auto bg-priori-navy hover:bg-priori-navy/90">
          <Plus size={20} className="mr-2" />
          Nova Assinatura
        </Button>
      </div>

      <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50">
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Paciente / Plano</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Próxima Renovação</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-priori-navy border-t-transparent mx-auto" />
                  </td>
                </tr>
              ) : subscriptions.map((sub) => {
                const customer = customers.find(c => c.id === sub.customerId);
                const plan = plans.find(p => p.id === sub.planId);
                const isExpired = sub.status === SubscriptionStatus.EXPIRED;

                return (
                  <tr key={sub.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-priori-navy">{customer?.name || 'Paciente removido'}</p>
                        <p className="text-xs text-zinc-500">{plan?.name || 'Plano removido'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                        sub.status === SubscriptionStatus.ACTIVE ? "bg-priori-navy/5 text-priori-navy" : 
                        sub.status === SubscriptionStatus.EXPIRED ? "bg-red-500/10 text-red-500" :
                        "bg-zinc-100 text-zinc-500"
                      )}>
                        {sub.status === SubscriptionStatus.ACTIVE ? 'Ativa' : 
                         sub.status === SubscriptionStatus.EXPIRED ? 'Vencida' : 'Cancelada'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm",
                          isExpired ? "text-red-500 font-medium" : "text-zinc-500"
                        )}>
                          {new Date(sub.nextRenewal).toLocaleDateString()}
                        </span>
                        {isExpired && <AlertCircle size={14} className="text-red-500" />}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleRegisterPayment(sub)}
                          className="p-2 text-priori-navy hover:bg-priori-navy/5 rounded-lg transition-all"
                          title="Registrar Pagamento"
                        >
                          <CreditCard size={16} />
                        </button>
                        <button 
                          onClick={() => handleOpenModal(sub)}
                          className="p-2 text-zinc-400 hover:text-priori-navy hover:bg-priori-navy/5 rounded-lg transition-all"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(sub.id)}
                          className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && subscriptions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-zinc-500 text-sm">
                    Nenhuma assinatura encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedSub ? 'Editar Assinatura' : 'Nova Assinatura'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Paciente</label>
            <select
              className="w-full rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20 focus:border-priori-navy/50 transition-all"
              value={formData.customerId}
              onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
              required
            >
              <option value="">Selecione um paciente...</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Plano</label>
            <select
              className="w-full rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20 focus:border-priori-navy/50 transition-all"
              value={formData.planId}
              onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
              required
            >
              <option value="">Selecione um plano...</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name} - R$ {p.procedures?.[0]?.price || 0}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Data Início</label>
              <input
                type="date"
                className="w-full rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20 focus:border-priori-navy/50 transition-all"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Próxima Renovação</label>
              <input
                type="date"
                className="w-full rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20 focus:border-priori-navy/50 transition-all"
                value={formData.nextRenewal}
                onChange={(e) => setFormData({ ...formData, nextRenewal: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</label>
            <select
              className="w-full rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20 focus:border-priori-navy/50 transition-all"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as SubscriptionStatus })}
            >
              <option value={SubscriptionStatus.ACTIVE}>Ativa</option>
              <option value={SubscriptionStatus.EXPIRED}>Vencida</option>
              <option value={SubscriptionStatus.CANCELLED}>Cancelada</option>
            </select>
          </div>
          <div className="flex gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 border-zinc-200 text-zinc-600 hover:bg-zinc-50" 
              onClick={() => setIsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-priori-navy hover:bg-priori-navy/90" 
              isLoading={isSaving}
            >
              {selectedSub ? 'Salvar Alterações' : 'Criar Assinatura'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
