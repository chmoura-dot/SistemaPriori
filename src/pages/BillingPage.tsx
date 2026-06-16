import React from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { useBillingData } from '../hooks/useBillingData';
import { BillingSummaryCards } from '../components/billing/BillingSummaryCards';
import { BillingBatchTable } from '../components/billing/BillingBatchTable';
import { CreateBatchModal } from '../components/billing/CreateBatchModal';
import { BatchDetailsModal } from '../components/billing/BatchDetailsModal';
import { RegisterPaymentModal } from '../components/billing/RegisterPaymentModal';
import { Button } from '../components/Button';

export const BillingPage = () => {
  const billing = useBillingData();

  if (billing.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-priori-navy" size={32} />
      </div>
    );
  }

  const eligibleAppointments = billing.getEligibleAppointments();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-priori-navy tracking-tight">Faturamento</h1>
          <p className="text-zinc-500 mt-1">Gerencie lotes e envios para operadoras</p>
        </div>
        <Button
          onClick={() => billing.openCreateModal()}
          className="bg-priori-navy hover:bg-priori-navy/90 shadow-sm"
        >
          <Plus size={20} className="mr-2" />
          Novo Lote
        </Button>
      </div>

      {/* Cards de Resumo */}
      <BillingSummaryCards
        pendingCount={billing.pendingBatches.length}
        totalPendingAmount={billing.totalPendingAmount}
        totalPaidAmount={billing.totalPaidAmount}
        totalDenied={billing.totalDenied}
        draftCount={billing.draftBatches.length}
        totalDraftAmount={billing.totalDraftAmount}
      />

      {/* Tabela de Lotes */}
      <BillingBatchTable
        batches={billing.batches}
        appointments={billing.appointments}
        onDetails={(batch) => billing.setSelectedBatch(batch)}
        onMarkAsPaid={billing.handleMarkAsPaid}
        onExport={billing.handleExportBatch}
        onDelete={billing.handleDeleteBatch}
        onEditDraft={(batch) => billing.openCreateModal(batch)}
      />

      {/* Modal: Novo Lote / Editar Rascunho */}
      <CreateBatchModal
        isOpen={billing.isCreateModalOpen}
        selectedPlan={billing.selectedPlan}
        batchNumber={billing.batchNumber}
        patientFilter={billing.patientFilter}
        monthFilter={billing.monthFilter}
        selectedAppointmentIds={billing.selectedAppointmentIds}
        neuropsicoDecisions={billing.neuropsicoDecisions}
        customers={billing.customers}
        psychologists={billing.psychologists}
        plans={billing.plans}
        eligibleAppointments={eligibleAppointments}
        totalSelectedAmount={billing.calculateTotalSelectedAmount()}
        editingDraftBatch={billing.editingDraftBatch}
        includePrevMonth={billing.includePrevMonth}
        blockedPlans={billing.getPlansWithEarlierDrafts(billing.monthFilter)}
        pendingCountByPlan={billing.getPendingCountByPlan()}
        getNeuropsicoStatus={billing.getNeuropsicoStatus}
        getAppPrice={billing.getAppPrice}
        getTussCode={billing.getTussCode}
        getAmsNeuropsicoSessionIndex={billing.getAmsNeuropsicoSessionIndex}
        getPlanProcedures={billing.getPlanProcedures}
        onClose={billing.closeCreateModal}
        onPlanChange={billing.handlePlanChange}
        onBatchNumberChange={billing.setBatchNumber}
        onPatientFilterChange={billing.setPatientFilter}
        onMonthFilterChange={billing.handleMonthFilterChange}
        onToggleSelection={billing.toggleAppointmentSelection}
        onSelectAll={() => {
          const selectable = eligibleAppointments.filter(a => !a.billingIgnored);
          const allSelectableSelected = selectable.every(a => billing.selectedAppointmentIds.includes(a.id));
          if (allSelectableSelected) {
            billing.setSelectedAppointmentIds([]);
          } else {
            billing.setSelectedAppointmentIds(selectable.map(a => a.id));
          }
        }}
        onConfirmAppointment={billing.handleConfirmAppointment}
        onIgnoreAppointment={billing.handleIgnoreAppointment}
        onUnignoreAppointment={billing.handleUnignoreAppointment}
        onToggleNeuropsico={billing.toggleNeuropsicoDecision}
        onIncludePrevMonthChange={billing.setIncludePrevMonth}
        includeNextMonth={billing.includeNextMonth}
        onIncludeNextMonthChange={billing.setIncludeNextMonth}
        autoSaveStatus={billing.autoSaveStatus}
        onSaveAsDraft={billing.handleSaveAsDraft}
        onQuickAddToDraft={billing.handleQuickAddToDraft}
        onOverrideProcedureCode={billing.handleOverrideProcedureCode}
        onSubmit={billing.handleCreateBatch}
        onFinalizeDraft={billing.handleFinalizeBatch}
      />

      {/* Modal: Detalhes do Lote */}
      <BatchDetailsModal
        batch={billing.selectedBatch}
        appointments={billing.appointments}
        customers={billing.customers}
        psychologists={billing.psychologists}
        getAppPrice={billing.getAppPrice}
        onClose={() => billing.setSelectedBatch(null)}
        onExport={billing.handleExportBatch}
      />

      {/* Modal: Registrar Pagamento */}
      <RegisterPaymentModal
        isOpen={billing.isPaymentModalOpen}
        batch={billing.batchToPay}
        appointments={billing.appointments}
        customers={billing.customers}
        appointmentStatuses={billing.appointmentStatuses}
        getAppPrice={billing.getAppPrice}
        onUpdateStatus={billing.updateAppointmentPaymentStatus}
        onClose={() => billing.setIsPaymentModalOpen(false)}
        onSubmit={billing.submitPayment}
      />
    </div>
  );
};
