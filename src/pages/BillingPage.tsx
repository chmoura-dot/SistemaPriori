import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  Calendar as CalendarIcon,
  ChevronRight,
  Trash2,
  AlertCircle,
  Loader2,
  Download
} from 'lucide-react';
import { api } from '../services/api';
import { exportToExcel } from '../lib/excel';
import { 
  BillingBatch, 
  BillingBatchStatus, 
  Appointment, 
  HealthPlan,
  Customer,
  Plan,
  Psychologist
} from '../services/types';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

export const BillingPage = () => {
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<BillingBatch | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [batchToPay, setBatchToPay] = useState<BillingBatch | null>(null);
  
  // Payment Form State
  const [appointmentStatuses, setAppointmentStatuses] = useState<Record<string, {
    status: 'paid' | 'denied',
    reason?: string,
    resolution?: 'accepted' | 'appealed'
  }>>({});
  const [selectedPlan, setSelectedPlan] = useState<HealthPlan>(HealthPlan.AMS_PETROBRAS);
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [batchNumber, setBatchNumber] = useState('');
  const [selectedAppointmentIds, setSelectedAppointmentIds] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [batchesData, appsData, customersData, plansData, psyData] = await Promise.all([
        api.getBillingBatches(),
        api.getAppointments(),
        api.getCustomers(),
        api.getPlans(),
        api.getPsychologists()
      ]);
      setBatches(batchesData.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setAppointments(appsData);
      setCustomers(customersData);
      setPlans(plansData);
      setPsychologists(psyData);
    } catch (error) {
      console.error('Error fetching billing data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper: busca o valor do atendimento considerando preço customizado, preço do paciente e preço do plano
  const getAppPrice = (app: Appointment): number => {
    const customer = customers.find(c => c.id === app.customerId);
    const plan = plans.find(p => p.name.toUpperCase() === (customer?.healthPlan ?? '').toUpperCase());
    const procedure = plan?.procedures?.find(proc => proc.type === app.type);
    return app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
  };

  const handleCreateBatch = async () => {
    if (!batchNumber || selectedAppointmentIds.length === 0) return;

    const totalAmount = appointments
      .filter(a => selectedAppointmentIds.includes(a.id))
      .reduce((sum, a) => sum + getAppPrice(a), 0);

    try {
      const batch = await api.createBillingBatch({
        batchNumber,
        sentAt: new Date().toISOString(),
        status: BillingBatchStatus.SENT,
        healthPlan: selectedPlan,
        totalAmount,
        appointmentIds: selectedAppointmentIds
      });

      // Marcar cada atendimento com o billingBatchId para não aparecer em lotes futuros
      await Promise.all(
        selectedAppointmentIds.map(id =>
          api.updateAppointment(id, { billingBatchId: batch.id })
        )
      );

      setIsCreateModalOpen(false);
      setBatchNumber('');
      setSelectedAppointmentIds([]);
      fetchData();
    } catch (error) {
      console.error('Error creating batch:', error);
    }
  };

  const handleMarkAsPaid = async (batch: BillingBatch) => {
    setBatchToPay(batch);
    const initialStatuses: Record<string, any> = {};
    batch.appointmentIds.forEach(id => {
      initialStatuses[id] = { status: 'paid' };
    });
    setAppointmentStatuses(initialStatuses);
    setIsPaymentModalOpen(true);
  };

  const submitPayment = async () => {
    if (!batchToPay) return;

    try {
      // Update each appointment
      await Promise.all(batchToPay.appointmentIds.map(id => {
        const statusData = appointmentStatuses[id];
        return api.updateAppointment(id, {
          billingStatus: statusData.status,
          denialReason: statusData.reason,
          denialResolution: statusData.resolution
        });
      }));

      // Update batch status
      await api.updateBillingBatch(batchToPay.id, {
        status: BillingBatchStatus.PAID,
        paidAt: new Date().toISOString()
      });

      setIsPaymentModalOpen(false);
      setBatchToPay(null);
      fetchData();
    } catch (error) {
      console.error('Error processing payment:', error);
    }
  };

  const handleDeleteBatch = async (id: string) => {
    if (!confirm('Deseja realmente excluir este lote? Os atendimentos voltarão a ficar disponíveis para faturamento.')) return;

    try {
      await api.deleteBillingBatch(id);
      fetchData();
    } catch (error) {
      console.error('Error deleting batch:', error);
    }
  };
  
  const handleExportBatch = (batch: BillingBatch) => {
    const batchAppointments = appointments.filter(a => batch.appointmentIds.includes(a.id));
    
    const exportData = batchAppointments.map(app => {
      const customer = customers.find(c => c.id === app.customerId);
      const psychologist = psychologists.find(p => p.id === app.psychologistId);
      
      return {
        'Lote': `#${batch.batchNumber}`,
        'Operadora': batch.healthPlan,
        'Paciente': customer?.name || '---',
        'Profissional': psychologist?.name || '---',
        'Data da Sessão': format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy'),
        'Horário': app.startTime,
        'Valor (R$)': app.customPrice || 0,
        'Status de Faturamento': app.billingStatus === 'paid' ? 'Pago' : app.billingStatus === 'denied' ? 'Glosa' : 'Pendente',
        'Motivo Glosa': app.denialReason || '',
        'Resolução Glosa': app.denialResolution === 'appealed' ? 'Recursada' : app.denialResolution === 'accepted' ? 'Aceite' : ''
      };
    });
    
    exportToExcel(
      exportData, 
      `Lote_${batch.batchNumber}_${batch.healthPlan}_${format(new Date(), 'yyyyMMdd')}`,
      'Atendimentos'
    );
  };

  const getEligibleAppointments = () => {
    return appointments.filter(a => {
      const customer = customers.find(c => c.id === a.customerId);
      return (
        customer?.healthPlan === selectedPlan &&
        !a.billingBatchId &&
        a.date >= startDate &&
        a.date <= endDate &&
        a.confirmedPsychologist // Only bill confirmed ones
      );
    });
  };

  const toggleAppointmentSelection = (id: string) => {
    setSelectedAppointmentIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-priori-navy" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-priori-navy">Faturamento</h1>
          <p className="text-zinc-500 mt-1">Gerencie lotes e envios para operadoras</p>
        </div>
        <Button 
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-priori-navy hover:bg-priori-navy/90"
        >
          <Plus size={20} className="mr-2" />
          Novo Lote
        </Button>
      </div>

      {/* Batches List */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/50 border-b border-zinc-100">
                <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Lote</th>
                <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Operadora</th>
                <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Data Envio</th>
                <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Atendimentos</th>
                <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Valor Total</th>
                <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                    Nenhum lote de faturamento encontrado.
                  </td>
                </tr>
              ) : (
                batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-priori-navy">#{batch.batchNumber}</div>
                    </td>
                    <td className="px-6 py-4 text-zinc-600">{batch.healthPlan}</td>
                    <td className="px-6 py-4 text-zinc-600">
                      {format(new Date(batch.sentAt), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-6 py-4 text-zinc-600">
                      {batch.appointmentIds.length} sessões
                    </td>
                    <td className="px-6 py-4 font-medium text-priori-navy">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(batch.totalAmount)}
                    </td>
                    <td className="px-6 py-4">
                      {batch.status === BillingBatchStatus.PAID ? (
                        <div className="space-y-1">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                            <CheckCircle2 size={12} className="mr-1" />
                            Pago em {format(new Date(batch.paidAt!), 'dd/MM/yyyy')}
                          </span>
                          {appointments.filter(a => batch.appointmentIds.includes(a.id) && a.billingStatus === 'denied').length > 0 && (
                            <div className="text-[10px] text-red-500 font-medium flex items-center gap-1">
                              <AlertCircle size={10} />
                              {appointments.filter(a => batch.appointmentIds.includes(a.id) && a.billingStatus === 'denied').length} glosa(s)
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-100">
                          <Clock size={12} className="mr-1" />
                          Enviado
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedBatch(batch)}
                        className="text-priori-navy border-zinc-200"
                      >
                        Detalhes
                      </Button>
                      {batch.status === BillingBatchStatus.SENT && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkAsPaid(batch)}
                          className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                        >
                          Registrar Pagamento
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportBatch(batch)}
                        className="text-priori-gold border-priori-gold/30 hover:bg-priori-gold/5"
                        title="Exportar Excel"
                      >
                        <Download size={16} />
                      </Button>
                      <button
                        onClick={() => handleDeleteBatch(batch.id)}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Excluir Lote"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Batch Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Novo Lote de Faturamento"
        className="max-w-4xl"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-priori-navy mb-1">Operadora</label>
              <select
                value={selectedPlan}
                onChange={(e) => {
                  setSelectedPlan(e.target.value as HealthPlan);
                  setSelectedAppointmentIds([]);
                }}
                className="w-full rounded-xl border-zinc-200 bg-zinc-50 text-sm focus:ring-priori-navy focus:border-priori-navy"
              >
                {Object.values(HealthPlan).filter(p => p !== HealthPlan.PARTICULAR).map(plan => (
                  <option key={plan} value={plan}>{plan}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-priori-navy mb-1">Início</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setSelectedAppointmentIds([]);
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-priori-navy mb-1">Fim</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setSelectedAppointmentIds([]);
                }}
              />
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h4 className="font-semibold text-priori-navy">Atendimentos Disponíveis</h4>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-zinc-500 font-medium">
                  {selectedAppointmentIds.length} selecionados
                </div>
                {getEligibleAppointments().length > 0 && (
                  <button
                    onClick={() => {
                      const eligibleIds = getEligibleAppointments().map(a => a.id);
                      if (selectedAppointmentIds.length === eligibleIds.length) {
                        setSelectedAppointmentIds([]);
                      } else {
                        setSelectedAppointmentIds(eligibleIds);
                      }
                    }}
                    className="text-priori-navy hover:text-priori-navy/80 hover:underline font-semibold"
                  >
                    {selectedAppointmentIds.length === getEligibleAppointments().length 
                      ? 'Desmarcar Todos' 
                      : 'Selecionar Todos'}
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto border border-zinc-100 rounded-xl divide-y divide-zinc-100">
              {getEligibleAppointments().length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-sm">
                  Nenhum atendimento confirmado encontrado para este período e operadora.
                </div>
              ) : (
                getEligibleAppointments().map(app => {
                  const customer = customers.find(c => c.id === app.customerId);
                  const psychologist = psychologists.find(p => p.id === app.psychologistId);
                  return (
                    <div 
                      key={app.id}
                      className={cn(
                        "flex items-center gap-4 p-3 hover:bg-zinc-50 cursor-pointer transition-colors",
                        selectedAppointmentIds.includes(app.id) && "bg-priori-navy/5"
                      )}
                      onClick={() => toggleAppointmentSelection(app.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAppointmentIds.includes(app.id)}
                        onChange={() => {}} // Handled by div click
                        className="rounded border-zinc-300 text-priori-navy focus:ring-priori-navy"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-priori-navy truncate">{customer?.name}</div>
                        <div className="text-xs text-zinc-500 truncate">
                          {psychologist?.name} • {format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy')} • {app.startTime}
                        </div>
                      </div>
                      <div className="text-sm font-medium text-priori-navy">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(getAppPrice(app))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-priori-navy mb-1">Número do Lote / Protocolo</label>
                <Input
                  placeholder="Ex: 20240311-01"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateBatch}
                  disabled={!batchNumber || selectedAppointmentIds.length === 0}
                  className="bg-priori-navy hover:bg-priori-navy/90"
                >
                  Gerar Lote de Faturamento
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Batch Details Modal */}
      <Modal
        isOpen={!!selectedBatch}
        onClose={() => setSelectedBatch(null)}
        title={`Detalhes do Lote #${selectedBatch?.batchNumber}`}
        className="max-w-2xl"
      >
        {selectedBatch && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-zinc-500 block">Operadora</span>
                <span className="font-medium text-priori-navy">{selectedBatch.healthPlan}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Data de Envio</span>
                <span className="font-medium text-priori-navy">{format(new Date(selectedBatch.sentAt), 'dd/MM/yyyy')}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Status</span>
                <span className="font-medium text-priori-navy">
                  {selectedBatch.status === BillingBatchStatus.PAID ? 'Pago' : 'Enviado'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block">Valor Total</span>
                <span className="font-medium text-priori-navy">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedBatch.totalAmount)}
                </span>
              </div>
            </div>

            <div className="border-t border-zinc-100 pt-4">
              <h4 className="font-semibold text-priori-navy mb-3">Atendimentos no Lote</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {selectedBatch.appointmentIds.map(id => {
                  const app = appointments.find(a => a.id === id);
                  const customer = customers.find(c => c.id === app?.customerId);
                  const psychologist = psychologists.find(p => p.id === app?.psychologistId);
                  return (
                    <div key={id} className="flex flex-col p-3 bg-zinc-50 rounded-xl text-sm gap-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-priori-navy">{customer?.name}</div>
                          <div className="text-xs text-zinc-500">
                            {psychologist?.name} • {app ? format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy') : ''}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-priori-navy">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(app ? getAppPrice(app) : 0)}
                          </div>
                          {app?.billingStatus && (
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider",
                              app.billingStatus === 'paid' ? "text-emerald-600" : "text-red-500"
                            )}>
                              {app.billingStatus === 'paid' ? 'Pago' : 'Glosa'}
                            </span>
                          )}
                        </div>
                      </div>
                      {app?.billingStatus === 'denied' && (
                        <div className="mt-1 p-2 bg-red-50 rounded-lg border border-red-100 text-xs">
                          <div className="font-semibold text-red-700">Motivo: {app.denialReason}</div>
                          <div className="text-red-600 mt-0.5">
                            Resolução: {app.denialResolution === 'appealed' ? 'Recursada' : 'Aceite'}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-zinc-100">
              <Button 
                variant="outline"
                onClick={() => handleExportBatch(selectedBatch)}
                className="text-priori-gold border-priori-gold/50"
              >
                <Download size={18} className="mr-2" />
                Exportar Excel
              </Button>
              <Button onClick={() => setSelectedBatch(null)} className="bg-priori-navy">
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Register Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Registrar Pagamento - Lote #${batchToPay?.batchNumber}`}
        className="max-w-4xl"
      >
        {batchToPay && (
          <div className="space-y-6">
            <p className="text-sm text-zinc-500">
              Indique o status de cada atendimento deste lote. Para glosas, informe o motivo e a resolução.
            </p>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {batchToPay.appointmentIds.map(id => {
                const app = appointments.find(a => a.id === id);
                const customer = customers.find(c => c.id === app?.customerId);
                const statusData = appointmentStatuses[id] || { status: 'paid' };

                return (
                  <div key={id} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-priori-navy">{customer?.name}</div>
                        <div className="text-xs text-zinc-500">
                          {app ? format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy') : ''} • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(app ? getAppPrice(app) : 0)}
                        </div>
                      </div>
                      <div className="flex bg-white rounded-xl border border-zinc-200 p-1">
                        <button
                          onClick={() => setAppointmentStatuses(prev => ({
                            ...prev,
                            [id]: { ...prev[id], status: 'paid' }
                          }))}
                          className={cn(
                            "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                            statusData.status === 'paid' 
                              ? "bg-emerald-500 text-white shadow-sm" 
                              : "text-zinc-500 hover:bg-zinc-50"
                          )}
                        >
                          Pago
                        </button>
                        <button
                          onClick={() => setAppointmentStatuses(prev => ({
                            ...prev,
                            [id]: { ...prev[id], status: 'denied', resolution: 'accepted' }
                          }))}
                          className={cn(
                            "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                            statusData.status === 'denied' 
                              ? "bg-red-500 text-white shadow-sm" 
                              : "text-zinc-500 hover:bg-zinc-50"
                          )}
                        >
                          Glosa
                        </button>
                      </div>
                    </div>

                    {statusData.status === 'denied' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Motivo da Glosa</label>
                          <Input
                            placeholder="Ex: Falta de guia, Código inválido..."
                            value={statusData.reason || ''}
                            onChange={(e) => setAppointmentStatuses(prev => ({
                              ...prev,
                              [id]: { ...prev[id], reason: e.target.value }
                            }))}
                            className="h-9 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Resolução</label>
                          <select
                            value={statusData.resolution}
                            onChange={(e) => setAppointmentStatuses(prev => ({
                              ...prev,
                              [id]: { ...prev[id], resolution: e.target.value as any }
                            }))}
                            className="w-full h-9 rounded-xl border-zinc-200 bg-white text-xs focus:ring-priori-navy focus:border-priori-navy"
                          >
                            <option value="accepted">Aceite (Perda)</option>
                            <option value="appealed">Recursada (Em recurso)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100">
              <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={submitPayment} className="bg-priori-navy">
                Confirmar Recebimento do Lote
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
