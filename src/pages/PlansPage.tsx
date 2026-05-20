import React, { useState, useEffect } from 'react';
import { TrendingUp, Plus, Edit2, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { Plan, AppointmentType, PlanProcedure } from '../services/types';
import { Button } from '../components/Button';
import { cn } from '../lib/utils';
import { PlanFormModal, PlanFormData } from './plans/PlanFormModal';
import { BulkAdjustmentModal, BulkData } from './plans/BulkAdjustmentModal';

export const PlansPage = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkData, setBulkData] = useState<BulkData>({
    amount: 0, adjustPrice: true, adjustRepass: true,
    selectedPlanIds: [], effectiveDate: new Date().toISOString().split('T')[0]
  });
  const [formData, setFormData] = useState<PlanFormData>({ name: '', procedures: [], active: true });

  const loadPlans = async () => {
    setIsLoading(true);
    const data = await api.getPlans();
    setPlans(data);
    setIsLoading(false);
  };

  useEffect(() => { loadPlans(); }, []);

  const handleOpenModal = (plan?: Plan) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({ name: plan.name, procedures: plan.procedures || [], active: plan.active });
    } else {
      setEditingPlan(null);
      setFormData({
        name: '',
        procedures: Object.values(AppointmentType).map(type => ({
          type, code: '', description: type, price: 0, repassAmount: 0,
          isOneTimeCharge: type === AppointmentType.NEUROPSICOLOGICA
        })),
        active: true
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenBulkModal = () => {
    setBulkData({ amount: 0, adjustPrice: true, adjustRepass: true, selectedPlanIds: plans.filter(p => p.active).map(p => p.id), effectiveDate: new Date().toISOString().split('T')[0] });
    setIsBulkModalOpen(true);
  };

  const handleBulkAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const plansToUpdate = plans.filter(p => bulkData.selectedPlanIds.includes(p.id));
      const planNames = plansToUpdate.map(p => p.name.toUpperCase());
      await Promise.all(plansToUpdate.map(plan => {
        const updatedProcedures = (plan.procedures || []).map(proc => ({
          ...proc,
          price: bulkData.adjustPrice ? proc.price + bulkData.amount : proc.price,
          repassAmount: bulkData.adjustRepass ? proc.repassAmount + bulkData.amount : proc.repassAmount
        }));
        return api.updatePlan(plan.id, { procedures: updatedProcedures });
      }));
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
        if (bulkData.adjustPrice) updates.customPrice = (app.customPrice ?? proc.price) + bulkData.amount;
        if (bulkData.adjustRepass) updates.customRepassAmount = (app.customRepassAmount ?? proc.repassAmount) + bulkData.amount;
        return api.updateAppointment(app.id, updates);
      }));
      await loadPlans();
      setIsBulkModalOpen(false);
      alert(`${plansToUpdate.length} planos e ${appsToUpdate.length} agendamentos reajustados com sucesso!`);
    } catch { alert('Erro ao aplicar reajuste'); }
    finally { setIsSaving(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editingPlan) { await api.updatePlan(editingPlan.id, formData); }
      else { await api.createPlan(formData); }
      await loadPlans();
      setIsModalOpen(false);
    } catch { alert('Erro ao salvar plano'); }
    finally { setIsSaving(false); }
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
            <TrendingUp size={20} className="mr-2 text-priori-gold" /> Reajuste Anual
          </Button>
          <Button onClick={() => handleOpenModal()} className="flex-1 sm:flex-none bg-priori-navy hover:bg-priori-navy/90">
            <Plus size={20} className="mr-2" /> Novo Plano
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
                <span className={cn('px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider', plan.active ? 'bg-priori-navy/10 text-priori-navy' : 'bg-zinc-100 text-zinc-500')}>
                  {plan.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">Códigos TUSS Autorizados: {plan.procedures?.length || 0}</span>
            </div>
            <div className="mb-6 space-y-3 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
              {plan.procedures?.map((proc, idx) => (
                <div key={idx} className="p-2 bg-zinc-50 rounded-lg border border-zinc-100">
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
              <Button variant="outline" className="flex-1 border-priori-navy text-priori-navy hover:bg-priori-navy/5" onClick={() => handleOpenModal(plan)}>
                <Edit2 size={16} className="mr-2" /> Editar
              </Button>
              <Button variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => handleDelete(plan.id)}>
                <Trash2 size={16} />
              </Button>
            </div>
          </div>
        ))}
        {!isLoading && plans.length === 0 && (
          <div className="col-span-full py-12 text-center text-zinc-500">Nenhum plano cadastrado.</div>
        )}
      </div>

      <PlanFormModal
        isOpen={isModalOpen}
        editingPlan={editingPlan}
        formData={formData}
        setFormData={setFormData}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
        isSaving={isSaving}
      />

      <BulkAdjustmentModal
        isOpen={isBulkModalOpen}
        plans={plans}
        bulkData={bulkData}
        setBulkData={setBulkData}
        onClose={() => setIsBulkModalOpen(false)}
        onSubmit={handleBulkAdjustment}
        isSaving={isSaving}
      />
    </div>
  );
};
