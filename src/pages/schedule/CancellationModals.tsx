import React from 'react';
import { ChevronLeft, ChevronRight, UserX, CalendarOff } from 'lucide-react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { CANCELLATION_REASONS } from './scheduleUtils';

interface CancellationModalsProps {
  // ── Cancel session modal ──
  cancellationModalAppId: string | null;
  setCancellationModalAppId: (id: string | null) => void;
  cancellationReason: string;
  setCancellationReason: (r: string) => void;
  cancellationStep: 'reason' | 'scope' | 'billing';
  setCancellationStep: (s: 'reason' | 'scope' | 'billing') => void;
  cancellationScope: 'single' | 'stop_treatment';
  setCancellationScope: (s: 'single' | 'stop_treatment') => void;
  isRecurring: boolean;
  isSaving: boolean;
  handleCancelBillingChoice: (mode: 'none' | 'plan' | 'particular') => void;
  // ── Delete modal ──
  deleteModalAppId: string | null;
  setDeleteModalAppId: (id: string | null) => void;
  confirmDelete: () => void;
}

export const CancellationModals: React.FC<CancellationModalsProps> = ({
  cancellationModalAppId,
  setCancellationModalAppId,
  cancellationReason,
  setCancellationReason,
  cancellationStep,
  setCancellationStep,
  cancellationScope,
  setCancellationScope,
  isRecurring,
  isSaving,
  handleCancelBillingChoice,
  deleteModalAppId,
  setDeleteModalAppId,
  confirmDelete,
}) => {
  const closeCancelModal = () => {
    setCancellationModalAppId(null);
    setCancellationStep('reason');
    setCancellationReason('');
    setCancellationScope('single');
  };

  const closeDeleteModal = () => {
    setDeleteModalAppId(null);
    setCancellationReason('');
  };

  const handleNextAfterReason = () => {
    if (isRecurring) {
      setCancellationStep('scope');
    } else {
      setCancellationStep('billing');
    }
  };

  return (
    <>
      {/* Cancel Session Modal */}
      <Modal isOpen={!!cancellationModalAppId} onClose={closeCancelModal} title="Cancelar Sessão">
        <div className="space-y-4">
          {cancellationStep === 'reason' ? (
            <>
              <p className="text-sm text-zinc-600">
                Selecione o motivo do cancelamento. Esta informação será enviada ao paciente e ao psicólogo.
              </p>
              <div className="space-y-2">
                {CANCELLATION_REASONS.map(reason => (
                  <label
                    key={reason}
                    className="flex items-center space-x-3 p-3 border border-zinc-200 rounded-lg cursor-pointer hover:bg-zinc-50"
                  >
                    <input
                      type="radio"
                      name="cancel_reason"
                      value={reason}
                      checked={cancellationReason === reason}
                      onChange={e => setCancellationReason(e.target.value)}
                      className="text-priori-navy focus:ring-priori-navy"
                    />
                    <span className="text-sm text-zinc-700">{reason}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={handleNextAfterReason} disabled={!cancellationReason}>
                  Próximo <ChevronRight size={16} className="ml-2" />
                </Button>
              </div>
            </>
          ) : cancellationStep === 'scope' ? (
            <>
              <p className="text-sm text-zinc-600 font-medium">
                Este agendamento faz parte de uma série recorrente. O que deseja fazer?
              </p>
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => { setCancellationScope('single'); setCancellationStep('billing'); }}
                  className="flex items-center gap-3 p-4 border-2 border-zinc-200 rounded-xl hover:border-priori-navy/40 hover:bg-priori-navy/5 transition-all text-left"
                >
                  <CalendarOff size={20} className="text-zinc-500 shrink-0" />
                  <div>
                    <span className="block font-bold text-zinc-700 text-sm">Cancelar apenas esta sessão</span>
                    <span className="block text-xs text-zinc-500 mt-0.5">As sessões futuras continuam normalmente</span>
                  </div>
                </button>
                <button
                  onClick={() => { setCancellationScope('stop_treatment'); setCancellationStep('billing'); }}
                  className="flex items-center gap-3 p-4 border-2 border-red-200 rounded-xl hover:border-red-400 hover:bg-red-50 transition-all text-left"
                >
                  <UserX size={20} className="text-red-500 shrink-0" />
                  <div>
                    <span className="block font-bold text-red-700 text-sm">Paciente encerrou tratamento</span>
                    <span className="block text-xs text-red-500 mt-0.5">Cancela esta e todas as sessões futuras desta série</span>
                  </div>
                </button>
              </div>
              <div className="flex justify-start pt-2">
                <button
                  onClick={() => setCancellationStep('reason')}
                  className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center"
                >
                  <ChevronLeft size={16} className="mr-1" /> Voltar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-600">
                {cancellationScope === 'stop_treatment'
                  ? 'O paciente encerrou o tratamento. Como registrar o faturamento desta última sessão?'
                  : 'O paciente faltou ou cancelou esta sessão. Como deseja registrar o faturamento?'}
              </p>
              {cancellationScope === 'stop_treatment' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700 font-bold">⚠️ Todas as sessões futuras desta série serão canceladas.</p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => handleCancelBillingChoice('none')}
                  disabled={isSaving}
                  className="flex items-center justify-center p-3 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors disabled:opacity-50"
                >
                  <div className="text-center">
                    <span className="block font-bold text-zinc-700 text-sm">Não Cobrar</span>
                    <span className="block text-xs text-zinc-500 mt-1">Sessão cancelada sem custo</span>
                  </div>
                </button>
                <button
                  onClick={() => handleCancelBillingChoice('plan')}
                  disabled={isSaving}
                  className="flex items-center justify-center p-3 border border-priori-navy/20 bg-priori-navy/5 rounded-xl hover:bg-priori-navy/10 transition-colors disabled:opacity-50"
                >
                  <div className="text-center">
                    <span className="block font-bold text-priori-navy text-sm">Cobrar no Convênio</span>
                    <span className="block text-xs text-priori-navy/70 mt-1">
                      Sessão será faturada via convênio normalmente
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => handleCancelBillingChoice('particular')}
                  disabled={isSaving}
                  className="flex items-center justify-center p-3 border border-emerald-200 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  <div className="text-center">
                    <span className="block font-bold text-emerald-700 text-sm">Cobrar Particular</span>
                    <span className="block text-xs text-emerald-600/70 mt-1">
                      Sessão será faturada do particular
                    </span>
                  </div>
                </button>
              </div>
              <div className="flex justify-start pt-2">
                <button
                  onClick={() => setCancellationStep(isRecurring ? 'scope' : 'reason')}
                  className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center"
                >
                  <ChevronLeft size={16} className="mr-1" /> Voltar
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={!!deleteModalAppId} onClose={closeDeleteModal} title="Excluir Agendamento">
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">
            Selecione o motivo da exclusão. Esta informação será enviada ao paciente e ao psicólogo antes de o
            horário ser removido.
          </p>
          <div className="space-y-2">
            {CANCELLATION_REASONS.map(reason => (
              <label
                key={reason}
                className="flex items-center space-x-3 p-3 border border-zinc-200 rounded-lg cursor-pointer hover:bg-zinc-50"
              >
                <input
                  type="radio"
                  name="delete_reason"
                  value={reason}
                  checked={cancellationReason === reason}
                  onChange={e => setCancellationReason(e.target.value)}
                  className="text-priori-navy focus:ring-priori-navy"
                />
                <span className="text-sm text-zinc-700">{reason}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={closeDeleteModal} disabled={isSaving}>
              Cancelar
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={!cancellationReason || isSaving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isSaving ? 'Excluindo...' : 'Confirmar Exclusão'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
