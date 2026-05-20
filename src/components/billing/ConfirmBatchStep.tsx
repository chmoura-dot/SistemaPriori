import React from 'react';
import { AlertTriangle, Info, Send } from 'lucide-react';
import { HealthPlan, AppointmentType } from '../../services/types';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { formatCurrency } from '../../lib/utils';

interface SessionWarning {
  customerName: string;
  type: AppointmentType;
  count: number;
  limit: number;
}

interface Props {
  isOpen: boolean;
  mode: 'send' | 'finalize';
  selectedPlan: HealthPlan;
  monthLabel: string;
  batchNumber: string;
  uniquePatients: number;
  selectedCount: number;
  totalAmount: number;
  sessionWarnings: SessionWarning[];
  onBack: () => void;
  onConfirm: () => void;
}

export const ConfirmBatchStep: React.FC<Props> = ({
  isOpen,
  mode,
  selectedPlan,
  monthLabel,
  batchNumber,
  uniquePatients,
  selectedCount,
  totalAmount,
  sessionWarnings,
  onBack,
  onConfirm,
}) => {
  const isFinalize = mode === 'finalize';
  const title = isFinalize ? 'Finalizar e Enviar Rascunho' : 'Confirmar Criação do Lote';
  const confirmLabel = sessionWarnings.length > 0
    ? isFinalize ? 'Finalizar Assim Mesmo' : 'Criar Assim Mesmo'
    : isFinalize ? '🚀 Finalizar e Enviar' : 'Confirmar e Criar';

  return (
    <Modal isOpen={isOpen} onClose={onBack} title={title} className="max-w-lg">
      <div className="space-y-5">
        {sessionWarnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
            <div>
              <p className="text-sm font-semibold text-amber-800 mb-2">Limite de sessões excedido</p>
              <ul className="space-y-1">
                {sessionWarnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700">
                    • <strong>{w.customerName}</strong>:{' '}
                    <span className="font-semibold">{w.count}</span> sess. de{' '}
                    <em>{w.type}</em> (limite do plano: {w.limit}/mês)
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {isFinalize && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
            <Info className="text-blue-500 flex-shrink-0 mt-0.5" size={15} />
            <p className="text-xs text-blue-700">
              Ao finalizar, o rascunho será convertido em um lote oficial enviado à operadora.
              O número do lote será gerado automaticamente.
            </p>
          </div>
        )}

        <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Resumo do Lote</p>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
            <div className="text-zinc-500">Operadora</div>
            <div className="font-medium text-priori-navy">{selectedPlan}</div>
            <div className="text-zinc-500">Competência</div>
            <div className="font-medium text-priori-navy capitalize">{monthLabel}</div>
            <div className="text-zinc-500">Nº do Lote</div>
            <div className="font-medium text-priori-navy font-mono">{batchNumber}</div>
            <div className="text-zinc-500">Pacientes</div>
            <div className="font-medium text-priori-navy">{uniquePatients}</div>
            <div className="text-zinc-500">Atendimentos</div>
            <div className="font-medium text-priori-navy">{selectedCount}</div>
            <div className="text-zinc-500 font-semibold border-t border-zinc-200 pt-2 mt-1">Total</div>
            <div className="font-bold text-priori-navy text-base border-t border-zinc-200 pt-2 mt-1">
              {formatCurrency(totalAmount)}
            </div>
          </div>
        </div>

        <p className="text-sm text-zinc-500">
          {sessionWarnings.length > 0
            ? 'Deseja prosseguir mesmo com as advertências acima?'
            : isFinalize
              ? 'Tudo certo! Confirmar finalização e envio do lote?'
              : 'Tudo certo! Confirmar criação do lote?'}
        </p>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onBack}>
            Voltar e Revisar
          </Button>
          <Button
            onClick={onConfirm}
            className="bg-priori-navy hover:bg-priori-navy/90 flex items-center gap-2"
          >
            {isFinalize && <Send size={15} />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
