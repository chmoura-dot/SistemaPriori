import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Holiday, ClinicClosure, Appointment } from '../services/types';
import { cn } from '../lib/utils';
import { HolidayFormModal, HolidayFormData } from './holidays/HolidayFormModal';
import { ClosureFormModal, ClosureFormData } from './holidays/ClosureFormModal';
import { ConflictModal } from './holidays/ConflictModal';
import { HolidaysTab } from './holidays/HolidaysTab';
import { ClosuresTab } from './holidays/ClosuresTab';

export const HolidaysPage = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [closures, setClosures] = useState<ClinicClosure[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'holidays' | 'closures'>('holidays');

  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
  const [isSavingHoliday, setIsSavingHoliday] = useState(false);
  const [holidayForm, setHolidayForm] = useState<HolidayFormData>({ date: '', name: '', type: 'nacional', recurring: false, clinicOpen: false });

  const [isClosureModalOpen, setIsClosureModalOpen] = useState(false);
  const [editingClosureId, setEditingClosureId] = useState<string | null>(null);
  const [isSavingClosure, setIsSavingClosure] = useState(false);
  const [closureForm, setClosureForm] = useState<ClosureFormData>({ startDate: '', endDate: '', reason: '' });

  const [conflictModalData, setConflictModalData] = useState<{ affectedAppointments: Appointment[]; onConfirm: () => void } | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    const [h, c, a] = await Promise.all([api.getHolidays(), api.getClinicClosures(), api.getAppointments()]);
    setHolidays(h); setClosures(c); setAppointments(a);
    setIsLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // ── Holiday handlers ──
  const openNewHoliday = () => {
    setHolidayForm({ date: '', name: '', type: 'nacional', recurring: false, clinicOpen: false });
    setEditingHolidayId(null);
    setIsHolidayModalOpen(true);
  };

  const openEditHoliday = (h: Holiday) => {
    setHolidayForm({ date: h.date, name: h.name, type: h.type, recurring: h.recurring, clinicOpen: h.clinicOpen });
    setEditingHolidayId(h.id);
    setIsHolidayModalOpen(true);
  };

  const doSaveHoliday = async () => {
    if (editingHolidayId) { await api.updateHoliday(editingHolidayId, holidayForm); }
    else { await api.createHoliday(holidayForm); }
    await loadData();
    setIsHolidayModalOpen(false);
    setEditingHolidayId(null);
  };

  const handleSaveHoliday = async () => {
    if (!holidayForm.date || !holidayForm.name) return;
    setIsSavingHoliday(true);
    try {
      if (!editingHolidayId && !holidayForm.clinicOpen) {
        const affected = appointments.filter(a => a.date === holidayForm.date && a.status !== 'canceled');
        if (affected.length > 0) {
          setConflictModalData({ affectedAppointments: affected, onConfirm: async () => { await doSaveHoliday(); setConflictModalData(null); } });
          setIsSavingHoliday(false);
          return;
        }
      }
      await doSaveHoliday();
    } catch (e: any) { alert(e.message || 'Erro ao salvar feriado'); }
    finally { setIsSavingHoliday(false); }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (!confirm('Deseja excluir este feriado?')) return;
    await api.deleteHoliday(id);
    await loadData();
  };

  // ── Closure handlers ──
  const openNewClosure = () => {
    setClosureForm({ startDate: '', endDate: '', reason: '' });
    setEditingClosureId(null);
    setIsClosureModalOpen(true);
  };

  const openEditClosure = (c: ClinicClosure) => {
    setClosureForm({ startDate: c.startDate, endDate: c.endDate, reason: c.reason });
    setEditingClosureId(c.id);
    setIsClosureModalOpen(true);
  };

  const doSaveClosure = async () => {
    if (editingClosureId) { await api.updateClinicClosure(editingClosureId, closureForm); }
    else { await api.createClinicClosure(closureForm); }
    await loadData();
    setIsClosureModalOpen(false);
    setEditingClosureId(null);
  };

  const handleSaveClosure = async () => {
    if (!closureForm.startDate || !closureForm.endDate || !closureForm.reason) return;
    if (closureForm.endDate < closureForm.startDate) { alert('A data de fim deve ser igual ou posterior à data de início.'); return; }
    setIsSavingClosure(true);
    try {
      if (!editingClosureId) {
        const affected = appointments.filter(a => a.date >= closureForm.startDate && a.date <= closureForm.endDate && a.status !== 'canceled');
        if (affected.length > 0) {
          setConflictModalData({ affectedAppointments: affected, onConfirm: async () => { await doSaveClosure(); setConflictModalData(null); } });
          setIsSavingClosure(false);
          return;
        }
      }
      await doSaveClosure();
    } catch (e: any) { alert(e.message || 'Erro ao salvar período de fechamento'); }
    finally { setIsSavingClosure(false); }
  };

  const handleDeleteClosure = async (id: string) => {
    if (!confirm('Deseja excluir este período de fechamento?')) return;
    await api.deleteClinicClosure(id);
    await loadData();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-priori-navy border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Feriados & Fechamentos</h2>
          <p className="text-zinc-500">Gerencie feriados e períodos de recesso da clínica.</p>
        </div>
      </div>

      <div className="flex bg-white border border-zinc-100 rounded-2xl p-1 shadow-sm w-fit">
        <button onClick={() => setActiveTab('holidays')} className={cn('px-6 py-2.5 text-sm font-bold rounded-xl transition-all', activeTab === 'holidays' ? 'bg-priori-navy text-white shadow-md' : 'text-zinc-400 hover:text-priori-navy')}>
          🎌 Feriados ({holidays.length})
        </button>
        <button onClick={() => setActiveTab('closures')} className={cn('px-6 py-2.5 text-sm font-bold rounded-xl transition-all', activeTab === 'closures' ? 'bg-priori-navy text-white shadow-md' : 'text-zinc-400 hover:text-priori-navy')}>
          🏖️ Períodos de Fechamento ({closures.length})
        </button>
      </div>

      {activeTab === 'holidays' && (
        <HolidaysTab holidays={holidays} appointments={appointments} onNew={openNewHoliday} onEdit={openEditHoliday} onDelete={handleDeleteHoliday} />
      )}
      {activeTab === 'closures' && (
        <ClosuresTab closures={closures} appointments={appointments} onNew={openNewClosure} onEdit={openEditClosure} onDelete={handleDeleteClosure} />
      )}

      <HolidayFormModal
        isOpen={isHolidayModalOpen}
        editingHolidayId={editingHolidayId}
        holidayForm={holidayForm}
        isSaving={isSavingHoliday}
        onClose={() => { setIsHolidayModalOpen(false); setEditingHolidayId(null); }}
        onSave={handleSaveHoliday}
        setHolidayForm={setHolidayForm}
      />

      <ClosureFormModal
        isOpen={isClosureModalOpen}
        editingClosureId={editingClosureId}
        closureForm={closureForm}
        isSaving={isSavingClosure}
        onClose={() => { setIsClosureModalOpen(false); setEditingClosureId(null); }}
        onSave={handleSaveClosure}
        setClosureForm={setClosureForm}
      />

      {conflictModalData && (
        <ConflictModal
          affectedAppointments={conflictModalData.affectedAppointments}
          onClose={() => setConflictModalData(null)}
          onConfirm={conflictModalData.onConfirm}
        />
      )}
    </div>
  );
};
