import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar } from 'lucide-react';
import { api } from '../services/api';
import { WaitingListEntry, Psychologist } from '../services/types';
import { Button } from '../components/Button';
import { cn } from '../lib/utils';
import { WaitingListCard } from './waitingList/WaitingListCard';
import { WaitingListFormModal, WaitingFormData } from './waitingList/WaitingListFormModal';

const DEFAULT_FORM: WaitingFormData = {
  customerName: '', phone: '', preferredDays: [], preferredHours: [],
  psychologistId: '', notes: '', status: 'pending'
};

export const WaitingListPage = () => {
  const [entries, setEntries] = useState<WaitingListEntry[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'called' | 'resolved' | 'all'>('pending');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WaitingListEntry | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<WaitingFormData>(DEFAULT_FORM);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [wList, psyList] = await Promise.all([api.getWaitingList(), api.getPsychologists()]);
      setEntries(wList);
      setPsychologists(psyList);
    } catch (error) {
      console.error('Error loading data', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleOpenModal = (entry?: WaitingListEntry) => {
    if (entry) {
      setEditingEntry(entry);
      setFormData({ customerName: entry.customerName, phone: entry.phone || '', preferredDays: entry.preferredDays || [], preferredHours: entry.preferredHours || [], psychologistId: entry.psychologistId || '', notes: entry.notes || '', status: entry.status });
    } else {
      setEditingEntry(null);
      setFormData(DEFAULT_FORM);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = { ...formData, psychologistId: formData.psychologistId || undefined };
      if (editingEntry) { await api.updateWaitingListEntry(editingEntry.id, payload); }
      else { await api.createWaitingListEntry(payload); }
      await loadData();
      setIsModalOpen(false);
    } catch { alert('Erro ao salvar registro na fila de espera'); }
    finally { setIsSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja remover este paciente da fila?')) {
      await api.deleteWaitingListEntry(id);
      await loadData();
    }
  };

  const updateStatus = async (id: string, status: 'pending' | 'called' | 'resolved' | 'canceled') => {
    try {
      await api.updateWaitingListEntry(id, { status });
      await loadData();
      const entry = entries.find(e => e.id === id);
      if (status === 'resolved' && entry) {
        if (confirm(`A pessoa "${entry.customerName}" foi marcada como agendada!\nDeseja cadastrá-la agora como paciente no sistema?`)) {
          localStorage.setItem('pending_conversion', JSON.stringify({ name: entry.customerName, phone: entry.phone || '', psychologistId: entry.psychologistId || '' }));
          window.location.href = '/clientes';
        }
      }
    } catch { alert('Erro ao atualizar status'); }
  };

  const filteredEntries = entries.filter(e => {
    const matchesSearch = e.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || (e.phone || '').includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Fila de Espera</h2>
          <p className="text-zinc-500">Registre interesses e não perca oportunidades quando houver desistências.</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="w-full sm:w-auto bg-priori-navy hover:bg-priori-navy/90 text-white">
          <Plus size={20} className="mr-2" /> Adicionar à Fila
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input type="text" placeholder="Buscar por nome ou telefone..." className="w-full bg-white border border-zinc-100 rounded-xl pl-10 pr-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5 transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex bg-zinc-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
          {(['pending', 'called', 'all'] as const).map((f, i) => (
            <button key={f} onClick={() => setStatusFilter(f)} className={cn('px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all whitespace-nowrap', statusFilter === f ? 'bg-white text-priori-navy shadow-sm' : 'text-zinc-500 hover:text-priori-navy')}>
              {['Aguardando', 'Contatados', 'Todos'][i]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-zinc-100 rounded-2xl p-6 animate-pulse">
              <div className="h-4 bg-zinc-100 rounded w-1/2 mb-4" />
              <div className="h-8 bg-zinc-100 rounded w-1/3" />
            </div>
          ))
        ) : filteredEntries.length === 0 ? (
          <div className="col-span-full bg-white border border-zinc-100 rounded-2xl p-10 text-center text-zinc-500">
            <Calendar size={48} className="mx-auto mb-4 text-zinc-300" />
            <p>Nenhum registro encontrado na fila de espera.</p>
          </div>
        ) : filteredEntries.map(entry => (
          <WaitingListCard
            key={entry.id}
            entry={entry}
            psychologist={psychologists.find(p => p.id === entry.psychologistId)}
            onEdit={handleOpenModal}
            onDelete={handleDelete}
            onUpdateStatus={updateStatus}
          />
        ))}
      </div>

      <WaitingListFormModal
        isOpen={isModalOpen}
        editingEntry={editingEntry}
        formData={formData}
        setFormData={setFormData}
        psychologists={psychologists}
        isSaving={isSaving}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
};
