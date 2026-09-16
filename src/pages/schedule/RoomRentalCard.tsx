import React from 'react';
import { DoorOpen } from 'lucide-react';
import { RoomRental, RoomRentalPaymentStatus } from '../../services/types';
import { getSlotCount } from './scheduleUtils';

interface RoomRentalCardProps {
  rental: RoomRental;
  psychologistName: string;
  /** Current time slot string for vertical offset calculation */
  slot: string;
}

// Bloco visual de sublocação de sala na Agenda — deliberadamente sem ações de
// editar/excluir (isso é feito na página de Sublocação); serve só para a
// secretária ver, de relance, que a sala está ocupada e por quem, evitando
// tentar marcar um atendimento presencial no mesmo horário.
export const RoomRentalCard: React.FC<RoomRentalCardProps> = ({ rental, psychologistName, slot }) => {
  const slotCount = getSlotCount(rental.startTime, rental.endTime);
  const [hS, mS] = rental.startTime.split(':').map(Number);
  const [hSlot, mSlot] = slot.split(':').map(Number);
  const minutesOffset = hS * 60 + mS - (hSlot * 60 + mSlot);
  const topOffset = (minutesOffset / 30) * 100;

  return (
    <div
      className="absolute left-0.5 right-0.5 border rounded-md p-1.5 flex flex-col justify-between z-20 shadow-sm border-l-4 bg-purple-50/70 border-purple-200 border-l-purple-400"
      style={{
        height: `calc(${slotCount * 100}% + ${Math.floor(slotCount) - 1}px)`,
        top: `calc(${topOffset}% + 2px)`,
      }}
      title="Sublocação de sala"
    >
      <div className="flex items-center gap-1">
        <DoorOpen size={9} className="text-purple-500 shrink-0" />
        <p className="text-[10px] font-black truncate leading-none text-purple-700">Sublocação</p>
      </div>
      <p className="text-[8px] text-zinc-600 font-bold truncate leading-none mt-1">{psychologistName}</p>
      <div className="flex items-center gap-1 mt-1">
        <span className="text-[7px] font-black text-purple-700/70 uppercase tracking-tighter">
          {rental.startTime}-{rental.endTime}
        </span>
        {rental.paymentStatus === RoomRentalPaymentStatus.PENDING && (
          <span className="text-[7px] font-black uppercase tracking-tight px-1 py-0.5 rounded-sm bg-amber-100 text-amber-700 leading-none">
            Pendente
          </span>
        )}
      </div>
    </div>
  );
};
