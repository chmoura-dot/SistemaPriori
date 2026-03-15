import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, DollarSign, TrendingUp, Check, AlertCircle, Hash, FileText } from 'lucide-react';
import { api } from '../services/api';
import { Plan, AppointmentType, PlanProcedure } from '../services/types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { cn } from '../lib/utils';

export const PlansPage = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkData, setBulkData] = useState({
    amount: 0,
    adjustPrice: true,
    adjustRepass: true,
    selectedPlanIds: [] as string[],
    effectiveDate: new Date().toISOString().split('T')[0]
  });

  const [formData, setFormData] = useState({
    name: '',
    procedures: [] as PlanProcedure[],
    active: true
  });

  const loadPlans = async () => {
    setIsLoading(true);
    const data = await api.getPlans();
    setPlans(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const handleOpenModal = (plan?: Plan) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        name: plan.name,
        procedures: plan.procedures || [],
        active: plan.active
      });
    } else {
      setEditingPlan(null);
      setFormData({
        name: '',
        procedures: Object.values(AppointmentType).map(type => ({
          type,
          code: '',
          description: type,
          price: 0,
          repassAmount: 0,
          isOneTimeCharge: type === AppointmentType.NEUROPSICOLOGICA
        })),
        active: true
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenBulkModal = () => {
    setBulkData({
      amount: 0,
      adjustPrice: true,
      adjustRepass: true,
      selectedPlanIds: plans.filter(p => p.active).map(p => p.id),
      effectiveDate: new Date().toISOString().split('T')[0]
    });
    setIsBulkModalOpen(true);
  };

  const handleBulkAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const plansToUpdate = plans.filter(p => bulkData.selectedPlanIds.includes(p.id));
      const planNames = plansToUpdate.map(p => p.name.toUpperCase());
      
      // 1. Update Plans
      await Promise.all(plansToUpdate.map(plan => {
        const updatedProcedures = (plan.procedures || []).map(proc => ({
          ...proc,
          price: bulkData.adjustPrice ? proc.price + bulkData.amount : proc.price,
          repassAmount: bulkData.adjustRepass ? proc.repassAmount + bulkData.amount : proc.repassAmount
        }));
        return api.updatePlan(plan.id, { procedures: updatedProcedures });
      }));

      // 2. Update Appointments (Retroactive)
      // Only for non-billed appointments after effectiveDate
      const allApps = await api.getAppointments();
      const customers = await api.getCustomers();
      
      const appsToUpdate = allApps.filter(app => {
        if (app.billingBatchId) return false;
        if (app.date < bulkData.effectiveDate) return false;
        
        const customer = customers.find(c => c.id === app.customerId);
        if (!customer) return false;
        
        return planNames.includes((customer.healthPlan || '').toUpperCase());
      });

      await Promise.all(appsToUpdate.map(app => {
        const customer = customers.find(c => c.id === app.customerId);
        const plan = plansToUpdate.find(p => p.name.toUpperCase() === (customer?.healthPlan || '').toUpperCase());
        const proc = plan?.procedures?.find(pr => pr.type === app.type);
        
        if (!proc) return Promise.resolve();

        const updates: any = {};
        if (bulkData.adjustPrice) {
          const currentPrice = app.customPrice ?? proc.price;
          updates.customPrice = currentPrice + bulkData.amount;
        }
        if (bulkData.adjustRepass) {
          const currentRepass = app.customRepassAmount ?? proc.repassAmount;
          updates.customRepassAmount = currentRepass + bulkData.amount;
        }

        return api.updateAppointment(app.id, updates);
      }));

      await loadPlans();
      setIsBulkModalOpen(false);
      alert(`${plansToUpdate.length} planos e ${appsToUpdate.length} agendamentos reajustados com sucesso!`);
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
      if (editingPlan) {
        await api.updatePlan(editingPlan.id, formData);
      } else {
        await api.createPlan(formData);
      }
      await loadPlans();
      setIsModalOpen(false);
    } catch (error) {
      alert('Erro ao salvar plano');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este plano?')) {
      await api.deletePlan(id);
      await loadPlans();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Planos</h2>
          <p className="text-zinc-500">Defina os valores recebidos por consulta de cada plano de saúde.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={handleOpenBulkModal} className="flex-1 sm:flex-none border-priori-navy text-priori-navy hover:bg-priori-navy/5">
            <TrendingUp size={20} className="mr-2 text-priori-gold" />
            Reajuste Anual
          </Button>
          <Button onClick={() => handleOpenModal()} className="flex-1 sm:flex-none bg-priori-navy hover:bg-priori-navy/90">
            <Plus size={20} className="mr-2" />
            Novo Plano
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-zinc-100 rounded-2xl p-6 animate-pulse">
              <div className="h-4 bg-zinc-100 rounded w-1/2 mb-4" />
              <div className="h-8 bg-zinc-100 rounded w-1/3 mb-6" />
              <div className="h-10 bg-zinc-100 rounded w-full" />
            </div>
          ))
        ) : plans.map((plan) => (
          <div key={plan.id} className="bg-white border border-zinc-100 rounded-2xl p-6 flex flex-col hover:border-priori-navy/30 transition-all shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-priori-navy">{plan.name}</h3>
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-[8px] bg-priori-gold/10 text-priori-gold px-1.5 py-0.5 rounded border border-priori-gold/20 font-bold uppercase tracking-widest">TUSS Ativo</span>
                <span className={cn(
                  "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                  plan.active ? "bg-priori-navy/10 text-priori-navy" : "bg-zinc-100 text-zinc-500"
                )}>
                  {plan.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>
            
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">Códigos TUSS Autorizados: {plan.procedures?.length || 0}</span>
            </div>

            <div className="mb-6 space-y-3 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
              {plan.procedures?.map((proc, idx) => (
                <div key={idx} className="p-2 bg-zinc-50 rounded-lg border border-zinc-100 group/proc">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-bold text-priori-navy truncate max-w-[140px]">{proc.description}</span>
                    <span className="text-[10px] font-bold text-priori-gold">R$ {proc.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-zinc-500 font-mono">TUSS: {proc.code || '---'}</span>
                    <span className="text-[9px] text-zinc-400">Repasse: R$ {proc.repassAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1 border-priori-navy text-priori-navy hover:bg-priori-navy/5"
                onClick={() => handleOpenModal(plan)}
              >
                <Edit2 size={16} className="mr-2" />
                Editar
              </Button>
              <Button 
                variant="ghost" 
                className="text-red-500 hover:bg-red-50"
                onClick={() => handleDelete(plan.id)}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          </div>
        ))}
        {!isLoading && plans.length === 0 && (
          <div className="col-span-full py-12 text-center text-zinc-500">
            Nenhum plano cadastrado.
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPlan ? 'Editar Plano' : 'Novo Plano'}
        footer={
          <div className="flex gap-3">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" 
              onClick={() => setIsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              form="plan-form"
              className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" 
              isLoading={isSaving}
            >
              {editingPlan ? 'Salvar Alterações' : 'Criar Plano'}
            </Button>
          </div>
        }
      >
        <form id="plan-form" onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Nome do Plano"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="Ex: AMS Petrobras"
          />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Códigos TUSS e Valores</label>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px]"
                onClick={() => {
                  setFormData({
                    ...formData,
                    procedures: [
                      ...formData.procedures,
                      {
                        type: AppointmentType.ADULTO,
                        code: '',
                        description: '',
                        price: 0,
                        repassAmount: 0,
                        isOneTimeCharge: false
                      }
                    ]
                  });
                }}
              >
                <Plus size={12} className="mr-1" />
                Adicionar Código
              </Button>
            </div>

            <div className="space-y-4 divide-y divide-zinc-100">
              {formData.procedures.map((proc, idx) => (
                <div key={idx} className="pt-4 first:pt-0 space-y-3 relative group/form-proc">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-priori-gold" />
                      <select
                        className="bg-transparent text-xs font-bold text-priori-navy focus:outline-none border-none p-0 cursor-pointer"
                        value={proc.type}
                        onChange={(e) => {
                          const newProcs = [...formData.procedures];
                          newProcs[idx].type = e.target.value as AppointmentType;
                          setFormData({ ...formData, procedures: newProcs });
                        }}
                      >
                        {Object.values(AppointmentType).map(type => (
                          <option key={type} value={type} className="bg-white">{type}</option>
                        ))}
                      </select>
                      {proc.isOneTimeCharge && (
                        <span className="text-[8px] bg-priori-navy/10 text-priori-navy px-1.5 py-0.5 rounded border border-priori-navy/20 uppercase font-bold tracking-tighter">Cobrança Única</span>
                      )}
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        const newProcs = formData.procedures.filter((_, i) => i !== idx);
                        setFormData({ ...formData, procedures: newProcs });
                      }}
                      className="text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                        <Hash size={10} /> Código TUSS
                      </label>
                      <input
                        className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20"
                        value={proc.code}
                        onChange={(e) => {
                          const newProcs = [...formData.procedures];
                          newProcs[idx].code = e.target.value;
                          setFormData({ ...formData, procedures: newProcs });
                        }}
                        placeholder="Ex: 50000470"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                        <FileText size={10} /> Nome do Procedimento
                      </label>
                      <input
                        className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20"
                        value={proc.description}
                        onChange={(e) => {
                          const newProcs = [...formData.procedures];
                          newProcs[idx].description = e.target.value;
                          setFormData({ ...formData, procedures: newProcs });
                        }}
                        placeholder="Ex: Sessão de Psicoterapia"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                        <DollarSign size={10} /> Valor (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20"
                        value={proc.price}
                        onChange={(e) => {
                          const newProcs = [...formData.procedures];
                          newProcs[idx].price = Number(e.target.value);
                          setFormData({ ...formData, procedures: newProcs });
                        }}
                        min="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                        <TrendingUp size={10} /> Repasse (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20"
                        value={proc.repassAmount}
                        onChange={(e) => {
                          const newProcs = [...formData.procedures];
                          newProcs[idx].repassAmount = Number(e.target.value);
                          setFormData({ ...formData, procedures: newProcs });
                        }}
                        min="0"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id={`onetime-${idx}`}
                      checked={proc.isOneTimeCharge}
                      onChange={(e) => {
                        const newProcs = [...formData.procedures];
                        newProcs[idx].isOneTimeCharge = e.target.checked;
                        setFormData({ ...formData, procedures: newProcs });
                      }}
                      className="w-3 h-3 rounded border-zinc-300 bg-white text-priori-navy focus:ring-priori-navy/20"
                    />
                    <label htmlFor={`onetime-${idx}`} className="text-[10px] text-zinc-500">Cobrar apenas uma vez (independente do nº de sessões)</label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 py-2 border-t border-zinc-100 pt-4">
            <input
              type="checkbox"
              id="active"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              className="w-4 h-4 rounded border-zinc-300 bg-white text-priori-navy focus:ring-priori-navy/20"
            />
            <label htmlFor="active" className="text-sm text-zinc-600">Plano Ativo</label>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        title="Reajuste Anual de Preços"
        footer={
          <div className="flex gap-3">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" 
              onClick={() => setIsBulkModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              form="bulk-plan-form"
              className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" 
              isLoading={isSaving}
              disabled={bulkData.selectedPlanIds.length === 0 || bulkData.amount === 0}
            >
              Aplicar Reajuste
            </Button>
          </div>
        }
      >
        <form id="bulk-plan-form" onSubmit={handleBulkAdjustment} className="space-y-6">
          <div className="bg-priori-navy/5 border border-priori-navy/10 p-4 rounded-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-priori-navy rounded-lg text-white">
                <TrendingUp size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-priori-navy">Ajuste de Valor Fixo</h4>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Adicione um valor fixo aos planos selecionados</p>
              </div>
            </div>

            <div className="bg-priori-gold/10 border border-priori-gold/20 p-3 rounded-lg flex items-start gap-3">
              <AlertCircle size={16} className="text-priori-gold mt-0.5 shrink-0" />
              <p className="text-[10px] text-priori-gold leading-relaxed">
                <span className="font-bold uppercase">Impacto:</span> Este reajuste será aplicado em planos e em todos os agendamentos **não faturados** a partir da data de vigência selecionada abaixo. Agendamentos já vinculados a lotes de faturamento não serão alterados.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex-1">
                <Input
                  label="Data de Vigência"
                  type="date"
                  value={bulkData.effectiveDate}
                  onChange={(e) => setBulkData({ ...bulkData, effectiveDate: e.target.value })}
                  required
                />
              </div>
              <div className="flex-1">
                <Input
                  label="Valor do Aumento (R$)"
                  type="number"
                  step="0.01"
                  value={bulkData.amount}
                  onChange={(e) => setBulkData({ ...bulkData, amount: Number(e.target.value) })}
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-2 pt-5">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center transition-all",
                    bulkData.adjustPrice ? "bg-priori-navy border-priori-navy" : "border-zinc-300 bg-white"
                  )} onClick={() => setBulkData({ ...bulkData, adjustPrice: !bulkData.adjustPrice })}>
                    {bulkData.adjustPrice && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-priori-navy">Preço</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center transition-all",
                    bulkData.adjustRepass ? "bg-priori-navy border-priori-navy" : "border-zinc-300 bg-white"
                  )} onClick={() => setBulkData({ ...bulkData, adjustRepass: !bulkData.adjustRepass })}>
                    {bulkData.adjustRepass && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-priori-navy">Repasse</span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Planos a Reajustar</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {plans.map(plan => (
                <div 
                  key={plan.id}
                  onClick={() => {
                    const newIds = bulkData.selectedPlanIds.includes(plan.id)
                      ? bulkData.selectedPlanIds.filter(id => id !== plan.id)
                      : [...bulkData.selectedPlanIds, plan.id];
                    setBulkData({ ...bulkData, selectedPlanIds: newIds });
                  }}
                  className={cn(
                    "p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
                    bulkData.selectedPlanIds.includes(plan.id)
                      ? "bg-priori-gold/10 border-priori-gold/50 text-priori-gold"
                      : "bg-white border-zinc-100 text-zinc-500 hover:border-priori-navy/30"
                  )}
                >
                  <span className="text-xs font-medium">{plan.name}</span>
                  {bulkData.selectedPlanIds.includes(plan.id) && <Check size={14} />}
                </div>
              ))}
            </div>
          </div>

        </form>
      </Modal>
    </div>
  );
};
