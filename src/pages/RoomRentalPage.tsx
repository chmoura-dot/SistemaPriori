import React, { useState, useEffect, useMemo } from 'react';
import { Plus, DoorOpen, Clock, CheckCircle2, XCircle, Filter } from 'lucide-react';
import { api } from '../services/api';
import { toastError, toastSuccess } from '../lib/toast';
import { logger } from '../lib/logger';
import {
  Room,
  Psychologist,
  RoomRental,
  RoomRentalStatus,
  RoomRentalPaymentStatus,
} from '../services/types';
import { Button } from '../components/Button';
import { cn } from '../lib/utils';
import { RoomRentalFormData, RoomRentalFormModal, DEFAULT_ROOM_RENTAL_FORM } from './roomRentals/RoomRentalFormModal';

export const RoomRentalPage = () => {
  const [rentals, setRentals] = useState<RoomRental[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<RoomRentalFormData>(DEFAULT_ROOM_RENTAL_FORM);
  const [amountInput, setAmountInput] = useState('');

  // Filtros
  const [filterMonth, setFilterMonth] = useState('');
  const [filterRoomId, setFilterRoomId] = useState('');
  const [filterPsyId, setFilterPsyId] = useState('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('');
  const [showCanceled, setShowCanceled] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [rentalsData, roomsData, psyData] = await Promise.all([
        api.getRoomRentals(),
        api.getRooms(),
        api.getPsychologists(),
      ]);
      setRentals(rentalsData);
      setRooms(roomsData);
      setPsychologists(psyData);
    } catch (err) {
      logger.error('Erro ao carregar sublocações:', err);
      toastError('Erro ao carregar sublocações.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const roomMap = useMemo(() => new Map(rooms.map(r => [r.id, r.name])), [rooms]);
  const psyMap = useMemo(() => new Map(psychologists.map(p => [p.id, p.name])), [psychologists]);

  const filteredRentals = useMemo(() => {
    return rentals
      .filter(r => showCanceled || r.status === RoomRentalStatus.ACTIVE)
      .filter(r => !filterMonth || r.date.startsWith(filterMonth))
      .filter(r => !filterRoomId || r.roomId === filterRoomId)
      .filter(r => !filterPsyId || r.psychologistId === filterPsyId)
      .filter(r => !filterPaymentStatus || r.paymentStatus === filterPaymentStatus)
      .sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime));
  }, [rentals, showCanceled, filterMonth, filterRoomId, filterPsyId, filterPaymentStatus]);

  const summary = useMemo(() => {
    const active = rentals.filter(r => r.status === RoomRentalStatus.ACTIVE);
    const pending = active.filter(r => r.paymentStatus === RoomRentalPaymentStatus.PENDING);
    const paidThisMonth = active.filter(r =>
      r.paymentStatus === RoomRentalPaymentStatus.PAID &&
      r.paidAt && r.paidAt.startsWith(new Date().toISOString().slice(0, 7))
    );
    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((acc, r) => acc + r.amount, 0),
      paidThisMonthCount: paidThisMonth.length,
      paidThisMonthAmount: paidThisMonth.reduce((acc, r) => acc + r.amount, 0),
    };
  }, [rentals]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = e.target.value.replace(/[^0-9.,]/g, '');
    setAmountInput(filtered);
    const numeric = parseFloat(filtered.replace(',', '.'));
    setFormData(prev => ({ ...prev, amount: isNaN(numeric) ? 0 : numeric }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.endTime <= formData.startTime) {
      toastError('O horário de término deve ser depois do início.');
      return;
    }
    setIsSaving(true);
    try {
      await api.createRoomRental({
        roomId: formData.roomId,
        psychologistId: formData.psychologistId,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        amount: formData.amount,
        isRecurring: formData.isRecurring,
        recurrenceFrequency: formData.isRecurring ? formData.recurrenceFrequency : undefined,
        notes: formData.notes || undefined,
        operationId: crypto.randomUUID(),
      });
      toastSuccess('Sublocação registrada com sucesso!');
      await loadData();
      setIsModalOpen(false);
      setFormData(DEFAULT_ROOM_RENTAL_FORM);
      setAmountInput('');
    } catch (err: any) {
      toastError(err.message || 'Erro ao registrar sublocação.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkPaid = async (rental: RoomRental) => {
    try {
      await api.markRoomRentalsPaid([rental.id], new Date().toISOString(), crypto.randomUUID());
      toastSuccess('Sublocação marcada como paga!');
      await loadData();
    } catch (err: any) {
      logger.error('Erro ao marcar sublocação como paga:', err);
      toastError(err.message || 'Erro ao marcar como paga.');
    }
  };

  const handleCancel = async (rental: RoomRental) => {
    const reason = prompt('Motivo do cancelamento (opcional):') || '';

    if (rental.isRecurring && rental.recurrenceGroupId) {
      const choice = confirm('Cancelar TODAS as sublocações FUTURAS desta série?\n\nOK = todas futuras | Cancelar = apenas esta ocorrência');
      try {
        if (choice) {
          await api.cancelFutureRoomRentals(rental.recurrenceGroupId, rental.date, reason, crypto.randomUUID());
        } else {
          await api.cancelRoomRental(rental.id, reason);
        }
        toastSuccess('Sublocação cancelada.');
        await loadData();
      } catch (err: any) {
        logger.error('Erro ao cancelar sublocação:', err);
        toastError(err.message || 'Erro ao cancelar sublocação.');
      }
      return;
    }

    if (!confirm('Cancelar esta sublocação?')) return;
    try {
      await api.cancelRoomRental(rental.id, reason);
      toastSuccess('Sublocação cancelada.');
      await loadData();
    } catch (err: any) {
      logger.error('Erro ao cancelar sublocação:', err);
      toastError(err.message || 'Erro ao cancelar sublocação.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Sublocação de Sala</h2>
          <p className="text-zinc-500">Psicólogos que reservam e pagam pelo uso da sala — sem repasse.</p>
        </div>
        <Button
          onClick={() => { setFormData(DEFAULT_ROOM_RENTAL_FORM); setAmountInput(''); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-priori-navy hover:bg-priori-navy/90"
        >
          <Plus size={18} /> Nova Sublocação
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-50 rounded-lg text-amber-500"><Clock size={20} /></div>
            <p className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Pendente de Pagamento</p>
          </div>
          <p className="text-3xl font-bold text-priori-navy">
            R$ {summary.pendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-zinc-400 mt-1">{summary.pendingCount} sublocação(ões)</p>
        </div>
        <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-500"><CheckCircle2 size={20} /></div>
            <p className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Pago no Mês Atual</p>
          </div>
          <p className="text-3xl font-bold text-priori-navy">
            R$ {summary.paidThisMonthAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-zinc-400 mt-1">{summary.paidThisMonthCount} sublocação(ões)</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <Filter size={16} className="text-zinc-400" />
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700 font-medium outline-none focus:border-priori-navy"
        />
        <select
          value={filterRoomId}
          onChange={(e) => setFilterRoomId(e.target.value)}
          className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700 font-medium outline-none focus:border-priori-navy"
        >
          <option value="">Todas as Salas</option>
          {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select
          value={filterPsyId}
          onChange={(e) => setFilterPsyId(e.target.value)}
          className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700 font-medium outline-none focus:border-priori-navy"
        >
          <option value="">Todos os Psicólogos</option>
          {psychologists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={filterPaymentStatus}
          onChange={(e) => setFilterPaymentStatus(e.target.value)}
          className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700 font-medium outline-none focus:border-priori-navy"
        >
          <option value="">Todos os Status</option>
          <option value={RoomRentalPaymentStatus.PENDING}>Pendente</option>
          <option value={RoomRentalPaymentStatus.PAID}>Pago</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={showCanceled}
            onChange={(e) => setShowCanceled(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-300"
          />
          Mostrar canceladas
        </label>
      </div>

      {/* Tabela */}
      <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Psicólogo</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Sala</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Data / Horário</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Recorrência</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Valor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-priori-navy border-t-transparent mx-auto" />
                  </td>
                </tr>
              ) : filteredRentals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-400">Nenhuma sublocação encontrada.</td>
                </tr>
              ) : (
                filteredRentals.map(rental => {
                  const isCanceled = rental.status === RoomRentalStatus.CANCELED;
                  const isPaid = rental.paymentStatus === RoomRentalPaymentStatus.PAID;
                  return (
                    <tr key={rental.id} className={cn('hover:bg-zinc-50 transition-colors group', isCanceled && 'opacity-50')}>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-priori-navy">{psyMap.get(rental.psychologistId) || 'Desconhecido'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-500 border border-zinc-200">
                          <DoorOpen size={10} />{roomMap.get(rental.roomId) || 'Sala removida'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-zinc-500">
                          {new Date(rental.date + 'T12:00:00').toLocaleDateString('pt-BR')} • {rental.startTime}–{rental.endTime}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn('text-[10px] font-bold uppercase tracking-wider', rental.isRecurring ? 'text-priori-navy' : 'text-zinc-400')}>
                          {rental.isRecurring ? (rental.recurrenceFrequency || 'Recorrente') : 'Avulsa'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-priori-navy">
                          R$ {rental.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        {isCanceled ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-zinc-400">
                            <XCircle size={12} /> Cancelada
                          </span>
                        ) : isPaid ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-600">
                            <CheckCircle2 size={12} /> Paga
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-amber-600">
                            <Clock size={12} /> Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {!isCanceled && (
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!isPaid && (
                              <button onClick={() => handleMarkPaid(rental)} className="p-2 text-zinc-400 hover:text-emerald-600 transition-colors" title="Marcar como Paga">
                                <CheckCircle2 size={16} />
                              </button>
                            )}
                            <button onClick={() => handleCancel(rental)} className="p-2 text-zinc-400 hover:text-red-500 transition-colors" title="Cancelar">
                              <XCircle size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RoomRentalFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        rooms={rooms}
        psychologists={psychologists}
        formData={formData}
        setFormData={setFormData}
        amountInput={amountInput}
        handleAmountChange={handleAmountChange}
        handleSubmit={handleSubmit}
        isSaving={isSaving}
      />
    </div>
  );
};
