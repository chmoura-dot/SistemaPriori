import React, { useState, useEffect } from 'react';
import { Plus, Search, MoreVertical, Edit2, Trash2, Mail, Phone, User, UserX, UserCheck, TrendingUp, Check, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { Customer, CustomerStatus, HealthPlan, Psychologist, UserRole } from '../services/types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { cn } from '../lib/utils';

export const CustomersPage = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const user = api.getCurrentUser();
  const [bulkData, setBulkData] = useState({
    amount: 0,
    adjustPrice: true,
    adjustRepass: true,
    selectedCustomerIds: [] as string[]
  });

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    healthPlan: HealthPlan.PARTICULAR,
    psychologistId: '',
    status: CustomerStatus.ACTIVE,
    notes: '',
    customPrice: undefined as number | undefined,
    customRepassAmount: undefined as number | undefined
  });

  const loadData = async () => {
    setIsLoading(true);
    const [c, p] = await Promise.all([
      api.getCustomers(),
      api.getPsychologists()
    ]);
    setCustomers(c);
    setPsychologists(p);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name,
        phone: customer.phone || '',
        healthPlan: customer.healthPlan || HealthPlan.PARTICULAR,
        psychologistId: customer.psychologistId || '',
        status: customer.status,
        notes: customer.notes || '',
        customPrice: customer.customPrice,
        customRepassAmount: customer.customRepassAmount
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: '',
        phone: '',
        healthPlan: HealthPlan.PARTICULAR,
        psychologistId: psychologists[0]?.id || '',
        status: CustomerStatus.ACTIVE,
        notes: '',
        customPrice: undefined,
        customRepassAmount: undefined
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenBulkModal = () => {
    const particularWithCustom = customers.filter(c => 
      c.healthPlan === HealthPlan.PARTICULAR && 
      (c.customPrice !== undefined || c.customRepassAmount !== undefined)
    );
    setBulkData({
      amount: 0,
      adjustPrice: true,
      adjustRepass: true,
      selectedCustomerIds: particularWithCustom.map(c => c.id)
    });
    setIsBulkModalOpen(true);
  };

  const handleBulkAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const customersToUpdate = customers.filter(c => bulkData.selectedCustomerIds.includes(c.id));
      
      await Promise.all(customersToUpdate.map(customer => {
        const updates: Partial<Customer> = {};
        if (bulkData.adjustPrice && customer.customPrice !== undefined) {
          updates.customPrice = customer.customPrice + bulkData.amount;
        }
        if (bulkData.adjustRepass && customer.customRepassAmount !== undefined) {
          updates.customRepassAmount = customer.customRepassAmount + bulkData.amount;
        }
        return api.updateCustomer(customer.id, updates);
      }));

      await loadData();
      setIsBulkModalOpen(false);
    } catch (error) {
      alert('Erro ao aplicar reajuste');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, formData);
      } else {
        await api.createCustomer(formData);
      }
      await loadData();
      setIsModalOpen(false);
    } catch (error) {
      alert('Erro ao salvar cliente');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este cliente?')) {
      await api.deleteCustomer(id);
      await loadData();
    }
  };

  const handleToggleStatus = async (customer: Customer) => {
    const newStatus = customer.status === CustomerStatus.ACTIVE ? CustomerStatus.INACTIVE : CustomerStatus.ACTIVE;
    try {
      await api.updateCustomer(customer.id, { status: newStatus });
      await loadData();
    } catch (error) {
      alert('Erro ao alterar status do cliente');
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Clientes</h2>
          <p className="text-zinc-500">Gerencie os pacientes da clínica.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {user?.role === UserRole.ADMIN && (
            <Button variant="outline" onClick={handleOpenBulkModal} className="flex-1 sm:flex-none border-zinc-100 text-priori-navy hover:bg-zinc-50">
              <TrendingUp size={20} className="mr-2 text-priori-gold" />
              Reajuste Particular
            </Button>
          )}
          <Button onClick={() => handleOpenModal()} className="flex-1 sm:flex-none bg-priori-navy hover:bg-priori-navy/90 text-white">
            <Plus size={20} className="mr-2" />
            Novo Cliente
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
        <input
          type="text"
          placeholder="Buscar por nome, e-mail ou plano..."
          className="w-full bg-white border border-zinc-100 rounded-xl pl-10 pr-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5 transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Paciente</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Telefone</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Plano / Psicólogo</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-priori-navy border-t-transparent mx-auto" />
                  </td>
                </tr>
              ) : filteredCustomers.map((customer) => {
                const psy = psychologists.find(p => p.id === customer.psychologistId);
                return (
                  <tr key={customer.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-400 border border-zinc-100">
                          <User size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-priori-navy">{customer.name}</p>
                          <p className="text-[10px] text-zinc-400 uppercase tracking-wider">ID: {customer.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                        <Phone size={14} className="text-priori-navy" />
                        {customer.phone}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm text-priori-navy">{customer.healthPlan}</p>
                        <p className="text-xs text-priori-gold font-medium">{psy?.name || 'Não atribuído'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                        customer.status === CustomerStatus.ACTIVE 
                          ? "bg-priori-gold/10 text-priori-gold" 
                          : "bg-zinc-100 text-zinc-500"
                      )}>
                        {customer.status === CustomerStatus.ACTIVE ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleToggleStatus(customer)}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            customer.status === CustomerStatus.ACTIVE 
                              ? "text-zinc-400 hover:text-amber-500 hover:bg-amber-500/5" 
                              : "text-zinc-400 hover:text-priori-gold hover:bg-priori-gold/5"
                          )}
                          title={customer.status === CustomerStatus.ACTIVE ? "Desativar Cliente" : "Ativar Cliente"}
                        >
                          {customer.status === CustomerStatus.ACTIVE ? <UserX size={16} /> : <UserCheck size={16} />}
                        </button>
                        <button 
                          onClick={() => handleOpenModal(customer)}
                          className="p-2 text-zinc-400 hover:text-priori-navy hover:bg-priori-navy/5 rounded-lg transition-all"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(customer.id)}
                          className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-500/5 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <Input
              label="Nome Completo"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input
              label="Telefone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
              placeholder="(00) 00000-0000"
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Plano de Saúde</label>
              <select
                className="w-full rounded-lg bg-white border border-zinc-100 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5 transition-all"
                value={formData.healthPlan}
                onChange={(e) => setFormData({ ...formData, healthPlan: e.target.value as HealthPlan })}
              >
                {Object.values(HealthPlan).map(plan => (
                  <option key={plan} value={plan}>{plan}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Psicólogo Responsável</label>
              <select
                className="w-full rounded-lg bg-white border border-zinc-100 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5 transition-all"
                value={formData.psychologistId}
                onChange={(e) => setFormData({ ...formData, psychologistId: e.target.value })}
              >
                {psychologists.map(psy => (
                  <option key={psy.id} value={psy.id}>{psy.name}</option>
                ))}
              </select>
            </div>
          </div>

          {(() => {
            const canSeeValues = user?.role === UserRole.ADMIN || formData.healthPlan === HealthPlan.PARTICULAR;
            if (canSeeValues) {
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-priori-gold/5 border border-priori-gold/10 rounded-xl">
                  <Input
                    label="Valor da Sessão (R$)"
                    type="number"
                    value={formData.customPrice || ''}
                    onChange={(e) => setFormData({ ...formData, customPrice: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="Ex: 150"
                  />
                  <Input
                    label="Valor do Repasse (R$)"
                    type="number"
                    value={formData.customRepassAmount || ''}
                    onChange={(e) => setFormData({ ...formData, customRepassAmount: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="Ex: 100"
                  />
                  <p className="col-span-full text-[10px] text-priori-gold font-medium uppercase tracking-wider">
                    * {formData.healthPlan === HealthPlan.PARTICULAR ? 'Valores específicos para este paciente particular' : 'Sobrescrita de valor do plano (Admin)'}
                  </p>
                </div>
              );
            }
            return null;
          })()}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Status</label>
            <select
              className="w-full rounded-lg bg-white border border-zinc-100 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5 transition-all"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as CustomerStatus })}
            >
              <option value={CustomerStatus.ACTIVE}>Ativo</option>
              <option value={CustomerStatus.INACTIVE}>Inativo</option>
            </select>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Notas</label>
            <textarea
              className="w-full rounded-lg bg-white border border-zinc-100 px-4 py-2.5 text-sm text-priori-navy placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-priori-navy/5 transition-all min-h-[80px]"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Observações sobre o paciente..."
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 border-zinc-100 text-priori-navy hover:bg-zinc-50" 
              onClick={() => setIsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" 
              isLoading={isSaving}
            >
              {editingCustomer ? 'Salvar Alterações' : 'Criar Cliente'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        title="Reajuste de Taxas Particulares"
      >
        <form onSubmit={handleBulkAdjustment} className="space-y-6">
          <div className="bg-priori-gold/5 border border-priori-gold/10 p-4 rounded-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-priori-gold rounded-lg text-white">
                <TrendingUp size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-priori-navy">Ajuste de Valor Fixo</h4>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Adicione um valor fixo aos valores negociados</p>
              </div>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-lg flex items-start gap-3">
              <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-amber-700 leading-relaxed">
                <span className="font-bold text-amber-600 uppercase">Atenção:</span> Este reajuste será aplicado apenas em **novos agendamentos** realizados a partir de agora. Agendamentos já existentes (passados ou futuros) manterão os valores originais de quando foram marcados.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Input
                  label="Valor do Aumento (R$)"
                  type="number"
                  value={bulkData.amount}
                  onChange={(e) => setBulkData({ ...bulkData, amount: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="flex flex-col gap-2 pt-5">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center transition-all",
                    bulkData.adjustPrice ? "bg-priori-navy border-priori-navy" : "border-zinc-200 bg-white"
                  )} onClick={() => setBulkData({ ...bulkData, adjustPrice: !bulkData.adjustPrice })}>
                    {bulkData.adjustPrice && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-priori-navy">Preço</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center transition-all",
                    bulkData.adjustRepass ? "bg-priori-navy border-priori-navy" : "border-zinc-200 bg-white"
                  )} onClick={() => setBulkData({ ...bulkData, adjustRepass: !bulkData.adjustRepass })}>
                    {bulkData.adjustRepass && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-priori-navy">Repasse</span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Pacientes a Reajustar</label>
            <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {customers.filter(c => c.healthPlan === HealthPlan.PARTICULAR && (c.customPrice !== undefined || c.customRepassAmount !== undefined)).map(customer => (
                <div 
                  key={customer.id}
                  onClick={() => {
                    const newIds = bulkData.selectedCustomerIds.includes(customer.id)
                      ? bulkData.selectedCustomerIds.filter(id => id !== customer.id)
                      : [...bulkData.selectedCustomerIds, customer.id];
                    setBulkData({ ...bulkData, selectedCustomerIds: newIds });
                  }}
                  className={cn(
                    "p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
                    bulkData.selectedCustomerIds.includes(customer.id)
                      ? "bg-priori-navy/5 border-priori-navy/30 text-priori-navy"
                      : "bg-white border-zinc-100 text-zinc-500 hover:border-priori-gold/30"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold">{customer.name}</span>
                    <span className="text-[10px] opacity-70">
                      Atual: R$ {customer.customPrice || 0} / R$ {customer.customRepassAmount || 0}
                    </span>
                  </div>
                  {bulkData.selectedCustomerIds.includes(customer.id) && <Check size={14} className="text-priori-gold" />}
                </div>
              ))}
              {customers.filter(c => c.healthPlan === HealthPlan.PARTICULAR && (c.customPrice !== undefined || c.customRepassAmount !== undefined)).length === 0 && (
                <p className="text-xs text-zinc-400 text-center py-4">Nenhum paciente particular com valor customizado encontrado.</p>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-zinc-100">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 border-zinc-100 text-priori-navy hover:bg-zinc-50" 
              onClick={() => setIsBulkModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" 
              isLoading={isSaving}
              disabled={bulkData.selectedCustomerIds.length === 0 || bulkData.amount === 0}
            >
              Aplicar Reajuste
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
