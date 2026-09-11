import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

interface AmsNeuropsicoCycleAlertProps {
  customerName: string;
  onAcknowledge: () => void;
}

/**
 * Aviso exibido ao tentar marcar um novo atendimento de Avaliação
 * Neuropsicológica para um paciente AMS Petrobras cujo ciclo atual já
 * esgotou as 3 tentativas (comparecendo ou faltando) sem que a avaliação
 * tenha sido de fato entregue nenhuma vez. É apenas informativo — a
 * secretária decide manualmente como proceder (nova autorização, novo
 * ciclo, etc.); confirmar aqui segue com o agendamento normalmente.
 */
export const AmsNeuropsicoCycleAlert: React.FC<AmsNeuropsicoCycleAlertProps> = ({
  customerName,
  onAcknowledge,
}) => {
  return (
    <Modal isOpen={true} onClose={onAcknowledge} title="Atenção: Ciclo AMS Petrobras esgotado ⚠️" className="max-w-md">
      <div className="space-y-5">
        <div className="flex items-start gap-4 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
          <div className="p-2 bg-amber-100 rounded-lg shrink-0">
            <AlertTriangle className="text-amber-600" size={24} />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-amber-900">{customerName}</h4>
            <p className="text-sm text-amber-800 leading-relaxed">
              Este paciente já teve 3 tentativas de Avaliação Neuropsicológica dentro do ciclo
              atual da AMS Petrobras, mas nunca compareceu a nenhuma delas — a avaliação nunca
              foi de fato entregue. Um novo agendamento sozinho não resolve a autorização junto
              ao convênio; pode ser necessário verificar manualmente se é preciso abrir um novo
              ciclo antes de prosseguir.
            </p>
          </div>
        </div>

        <Button
          onClick={onAcknowledge}
          className="w-full bg-priori-navy hover:bg-priori-navy/90 text-white h-12 rounded-xl"
        >
          Entendi, continuar com o agendamento
        </Button>
      </div>
    </Modal>
  );
};
