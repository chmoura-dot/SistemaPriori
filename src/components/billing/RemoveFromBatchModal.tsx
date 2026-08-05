/**
 * RemoveFromBatchModal
 * Exibido ao remover um atendimento de um lote de faturamento já enviado
 * (BatchDetailsModal > "Remover do lote"). Separa duas intenções distintas:
 *
 *   1. "Apenas remover do lote": o atendimento entrou por engano; volta a
 *      ficar disponível para um próximo lote de faturamento.
 *   2. "Desconsiderar de faturamento futuro": o atendimento nunca deve ser
 *      cobrado (glosa definitiva, duplicata, cortesia etc.). Marca
 *      billingIgnored = true e EXIGE uma justificativa, registrada para
 *      auditoria (billingIgnoredReason + billingIgnoredAt).
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { Appointment, BillingBatch, Customer } from '../../services/types';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { cn, formatCurrency } from '../../lib/utils';

export type RemoveFromBatchMode = 'remove_only' | 'ignore_permanently';

// Justificativas pré-definidas para desconsiderar de faturamento futuro.
// "Outro" libera um campo de texto livre (também obrigatório).
export const BILLING_IGNORE_REASONS = [
  'Glosa definitiva do convênio',
  'Atendimento cobrado em duplicata',
  'Atendimento não elegível pelo plano',
  'Erro de cadastro (paciente, data ou plano incorretos)',
  'Cortesia / Isenção aprovada pela clínica',
  'Outro',
] as const;

// Tamanho mínimo exigido para a justificativa livre quando "Outro" é escolhido.
const MIN_CUSTOM_REASON_LENGTH = 5;

interface Props {
  batch: BillingBatch;
  appointment: Appointment;
  customer?: Customer;
  price: number;
  onClose: () => void;
  onConfirm: (mode: RemoveFromBatchMode, reason?: string) => Promise<void> | void;
}

export const RemoveFromBatchModal: React.FC<Props> = ({
  batch, appointment, customer, price, onClose, onConfirm,
}) => {
  const [mode, setMode] = useState<RemoveFromBatchMode>('remove_only');
  const [reasonOption, setReasonOption] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reseta a seleção sempre que o modal abre para outro atendimento.
  useEffect(() => {
    setMode('remove_only');
    setReasonOption('');
    setCustomReason('');
  }, [appointment.id]);

  const isOther = reasonOption === 'Outro';
  const finalReason = isOther ? customReason.trim() : reasonOption;

  // Trava o botão de confirmar: no modo "desconsiderar", é obrigatório
  // selecionar uma justificativa (e, se "Outro", descrevê-la com conteúdo mínimo).
  const canConfirm =
    mode === 'remove_only'
      ? true
      : !!reasonOption && (!isOther || customReason.trim().length >= MIN_CUSTOM_REASON_LENGTH);

  const handleSubmit = async () => {
    if (!canConfirm || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm(mode, mode === 'ignore_permanently' ? finalReason : undefined);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Remover atendimento do lote" className="max-w-lg">
      <div className="space-y-5">
        <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 text-sm">
          <div className="font-medium text-priori-navy">{customer?.name ?? '-'}</div>
          <div className="text-xs text-zinc-500 mt-0.5">
            Lote #{batch.batchNumber} • {format(new Date(appointment.date + 'T12:00:00'), 'dd/MM/yyyy')} • {formatCurrency(price)}
          </div>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setMode('remove_only')}
            className={cn(
              'w-full text-left p-4 rounded-2xl border-2 transition-all',
              mode === 'remove_only' ? 'border-priori-navy bg-priori-navy/5' : 'border-zinc-200 hover:bg-zinc-50'
            )}
          >
            <span className="block text-sm font-bold text-priori-navy">Apenas remover do lote</span>
            <span className="block text-xs font-normal mt-0.5 text-zinc-500">
              O atendimento entrou neste lote por engano. Ele volta a ficar disponível para um próximo lote de faturamento.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMode('ignore_permanently')}
            className={cn(
              'w-full text-left p-4 rounded-2xl border-2 transition-all',
              mode === 'ignore_permanently' ? 'border-red-400 bg-red-50' : 'border-zinc-200 hover:bg-zinc-50'
            )}
          >
            <span className="block text-sm font-bold text-red-700">Desconsiderar de faturamento futuro</span>
            <span className="block text-xs font-normal mt-0.5 text-red-600/80">
              Este atendimento nunca deve ser cobrado. Não aparecerá em nenhum lote novo — exige justificativa.
            </span>
          </button>
        </div>

        {mode === 'ignore_permanently' && (
          <div className="space-y-3 p-4 bg-red-50/50 rounded-2xl border border-red-100 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-2 text-xs text-red-700">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Essa ação é registrada para auditoria (motivo e data) e o atendimento não voltará a aparecer em nenhum lote futuro.</span>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                Justificativa *
              </label>
              <select
                value={reasonOption}
                onChange={(e) => setReasonOption(e.target.value)}
                className="w-full h-9 rounded-xl border-zinc-200 bg-white text-xs focus:ring-priori-navy focus:border-priori-navy"
              >
                <option value="">Selecione um motivo...</option>
                {BILLING_IGNORE_REASONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            {isOther && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                  Descreva o motivo *
                </label>
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Descreva o motivo para desconsiderar este atendimento..."
                  rows={3}
                  className="w-full rounded-xl border border-zinc-200 bg-white text-xs px-3 py-2 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy resize-none"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={!canConfirm}
            variant={mode === 'ignore_permanently' ? 'danger' : 'primary'}
          >
            {mode === 'ignore_permanently' ? 'Desconsiderar atendimento' : 'Remover do lote'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
