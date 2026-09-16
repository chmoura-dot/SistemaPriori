import React from 'react';
import { Modal } from '../../components/Modal';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Room, Psychologist, RecurrenceFrequency } from '../../services/types';
import { getTodayISO } from '../../lib/dateUtils';

export interface RoomRentalFormData {
  roomId: string;
  psychologistId: string;
  date: string;
  startTime: string;
  endTime: string;
  amount: number;
  isRecurring: boolean;
  recurrenceFrequency: RecurrenceFrequency;
  notes: string;
}

export const DEFAULT_ROOM_RENTAL_FORM: RoomRentalFormData = {
  roomId: '',
  psychologistId: '',
  date: getTodayISO(),
  startTime: '',
  endTime: '',
  amount: 0,
  isRecurring: false,
  recurrenceFrequency: RecurrenceFrequency.SEMANAL,
  notes: '',
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rooms: Room[];
  psychologists: Psychologist[];
  formData: RoomRentalFormData;
  setFormData: React.Dispatch<React.SetStateAction<RoomRentalFormData>>;
  amountInput: string;
  handleAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  isSaving: boolean;
}

export const RoomRentalFormModal = ({
  isOpen,
  onClose,
  rooms,
  psychologists,
  formData,
  setFormData,
  amountInput,
  handleAmountChange,
  handleSubmit,
  isSaving,
}: Props) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Nova Sublocação de Sala">
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Sala</label>
          <select
            className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 focus:border-priori-navy"
            value={formData.roomId}
            onChange={(e) => setFormData({ ...formData, roomId: e.target.value })}
            required
          >
            <option value="">Selecione...</option>
            {rooms.filter(r => r.active).map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Psicólogo(a)</label>
          <select
            className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 focus:border-priori-navy"
            value={formData.psychologistId}
            onChange={(e) => setFormData({ ...formData, psychologistId: e.target.value })}
            required
          >
            <option value="">Selecione...</option>
            {psychologists.filter(p => p.active).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Input
          label="Data"
          type="date"
          value={formData.date}
          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          required
        />
        <Input
          label="Início"
          type="time"
          value={formData.startTime}
          onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
          required
        />
        <Input
          label="Término"
          type="time"
          value={formData.endTime}
          onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
          required
        />
      </div>

      <Input
        label="Valor Cobrado (R$)"
        type="text"
        inputMode="decimal"
        placeholder="Ex: 80,00"
        value={amountInput}
        onChange={handleAmountChange}
        required
      />

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="isRecurringRental"
          className="w-4 h-4 rounded border-zinc-300 bg-white text-priori-navy focus:ring-priori-navy/20"
          checked={formData.isRecurring}
          onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
        />
        <label htmlFor="isRecurringRental" className="text-sm text-zinc-600 cursor-pointer">
          Reserva recorrente
        </label>
      </div>

      {formData.isRecurring && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Frequência</label>
          <select
            className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 focus:border-priori-navy"
            value={formData.recurrenceFrequency}
            onChange={(e) => setFormData({ ...formData, recurrenceFrequency: e.target.value as RecurrenceFrequency })}
          >
            <option value={RecurrenceFrequency.SEMANAL}>Semanal</option>
            <option value={RecurrenceFrequency.QUINZENAL}>Quinzenal</option>
          </select>
          <p className="text-[11px] text-zinc-400">
            Cria automaticamente as ocorrências até o fim do mês seguinte.
          </p>
        </div>
      )}

      <Input
        label="Observações"
        placeholder="Opcional"
        value={formData.notes}
        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
      />

      <div className="pt-4 flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1 border-priori-navy text-priori-navy hover:bg-priori-navy/5"
          onClick={onClose}
        >
          Cancelar
        </Button>
        <Button type="submit" className="flex-1 bg-priori-navy hover:bg-priori-navy/90" isLoading={isSaving}>
          Reservar Sala
        </Button>
      </div>
    </form>
  </Modal>
);
