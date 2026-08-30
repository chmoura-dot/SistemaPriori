/**
 * DeniedAppointmentsModal
 * Central de Glosas: lista TODOS os atendimentos com billingStatus === 'denied'
 * do sistema, independentemente do status atual do lote pai (inclusive lotes
 * já fechados como PAID — um lote fecha como PAID quando todos os seus itens
 * estão "resolvidos", seja pago OU glosado).
 *
 * Permite:
 *   - Ver motivo e resolução (Aceite/Recursada) de cada glosa.
 *   - Filtrar por operadora e por resolução.
 *   - Navegar direto para o lote (fecha este modal e abre o BatchDetailsModal).
 *   - Reverter a glosa (volta o atendimento a "pendente", reabrindo a decisão
 *     de marcá-lo como pago), reaproveitando handleUnmarkAppointmentPaid.
 */
import React, { useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { Appointment, BillingBatch, Customer, HealthPlan } from '../../services/types';
import { Modal } from '../Modal';
import { formatCurrency, cn } from '../../lib/utils';

interface DeniedEntry {
  appointment: Appointment;
  batch?: BillingBatch;
}

interface Props {
  isOpen: boolean;
  entries: DeniedEntry[];
  customers: Customer[];
  getAppPrice: (app: Appointment) => number;
  onClose: () => void;
  onOpenBatch: (batch: BillingBatch) => void;
  onRevert: (appointmentId: string) => Promise<void>;
}

const RESOLUTION_LABEL: Record<string, string> = {
  accepted: 'Aceite (Perda)',
  appealed: 'Recursada (Em recurso)',
};

export const DeniedAppointmentsModal: React.FC<Props> = ({
  isOpen,
  entries,
  customers,
  getAppPrice,
  onClose,
  onOpenBatch,
  onRevert,
}) => {
  const [planFilter, setPlanFilter] = useState('');
  const [resolutionFilter, setResolutionFilter] = useState('');
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const availablePlans = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(({ appointment, batch }) => {
      const customer = customers.find(c => c.id === appointment.customerId);
      const plan = batch?.healthPlan || (appointment.healthPlanAtTime as HealthPlan | undefined) || customer?.healthPlan;
      if (plan) set.add(plan);
    });
    return Array.from(set).sort();
  }, [entries, customers]);

  const filtered = useMemo(() => {
    return entries.filter(({ appointment, batch }) => {
      const customer = customers.find(c => c.id === appointment.customerId);
      const plan = batch?.healthPlan || (appointment.healthPlanAtTime as HealthPlan | undefined) || customer?.healthPlan;
      if (planFilter && plan !== planFilter) return false;
      if (resolutionFilter && appointment.denialResolution !== resolutionFilter) return false;
      return true;
    });
  }, [entries, customers, planFilter, resolutionFilter]);

  const handleRevert = async (appointmentId: string) => {
    if (revertingId) return;
    setRevertingId(appointmentId);
    try {
      await onRevert(appointmentId);
    } finally {
      setRevertingId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Central de Glosas"
      className="max-w-4xl"
    >
      <div className="space-y-4">
        <p className="text-sm text-zinc-500">
          Todos os atendimentos glosados registrados no faturamento, com motivo e resolução informados
          na tela &quot;Registrar Pagamento&quot;.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="h-9 rounded-xl border-zinc-200 bg-white text-xs px-3 focus:ring-priori-navy focus:border-priori-navy"
          >
            <option value="">Todas as operadoras</option>
            {availablePlans.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={resolutionFilter}
            onChange={(e) => setResolutionFilter(e.target.value)}
            className="h-9 rounded-xl border-zinc-200 bg-white text-xs px-3 focus:ring-priori-navy focus:border-priori-navy"
          >
            <option value="">Todas as resoluções</option>
            <option value="accepted">Aceite (Perda)</option>
            <option value="appealed">Recursada (Em recurso)</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-zinc-400 text-sm flex flex-col items-center gap-2">
            <AlertCircle size={28} className="text-zinc-300" />
            {entries.length === 0 ? 'Nenhuma glosa registrada no momento.' : 'Nenhuma glosa corresponde aos filtros selecionados.'}
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {filtered.map(({ appointment: app, batch }) => {
              const customer = customers.find(c => c.id === app.customerId);
              const plan = batch?.healthPlan || (app.healthPlanAtTime as HealthPlan | undefined) || customer?.healthPlan;
              const price = getAppPrice(app);
              const isReverting = revertingId === app.id;
              return (
                <div key={app.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-priori-navy">{customer?.name ?? '—'}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {plan ?? '—'} • {format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy')}
                        {batch && <> • Lote #{batch.batchNumber}</>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-priori-navy">{formatCurrency(price)}</div>
                      <span className={cn(
                        'inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                        app.denialResolution === 'appealed'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-red-50 text-red-600 border border-red-200'
                      )}>
                        {app.denialResolution ? RESOLUTION_LABEL[app.denialResolution] : 'Sem resolução'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 p-2 bg-white rounded-lg border border-zinc-100 text-xs">
                    <span className="font-semibold text-red-700">Motivo: </span>
                    <span className="text-zinc-600">{app.denialReason || 'Não informado'}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-end gap-2">
                    {batch && (
                      <button
                        onClick={() => onOpenBatch(batch)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-priori-navy hover:bg-priori-navy/10 px-2 py-1 rounded-lg transition-colors border border-priori-navy/20"
                        title="Abrir o lote deste atendimento"
                      >
                        <ExternalLink size={12} />
                        Ver lote
                      </button>
                    )}
                    <button
                      onClick={() => handleRevert(app.id)}
                      disabled={isReverting}
                      className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                      title="Reverter esta glosa (volta o atendimento a pendente)"
                    >
                      <RotateCcw size={12} />
                      {isReverting ? 'Revertendo...' : 'Reverter glosa'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
