import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Phone, Calendar, Clock, AlertCircle, CheckCircle2, User, PhoneCall, Check } from 'lucide-react';
import { api } from '../services/api';
import { WaitingListEntry, Psychologist } from '../services/types';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { cn } from '../lib/utils';

const DAYS_OF_WEEK = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'
];

// Gerar lista de horas para seleção rápida
const HOURS = Array.from({ length: 15 }, (_, i) => {
  const hour = i + 8; // 08:00 to 22:00
  return `${hour.toString().padStart(2, '0')}:00`;
});

export const WaitingListPage = () => {
  const [entries, setEntries] = useState<WaitingListEntry[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'called' | 'resolved' | 'all'>('pending');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WaitingListEntry | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<{
    customerName: string;
    phone: string;
    preferredDays: number[];
    preferredHours: string[];
    psychologistId: string;
    notes: string;
    status: 'pending' | 'called' | 'resolved' | 'canceled';
  }>({
    customerName: '',
    phone: '',
    preferredDays: [],
    preferredHours: [],
    psychologistId: '',
    notes: '',
    status: 'pending'
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [wList, psyList] = await Promise.all([
        api.getWaitingList(),
        api.getPsychologists()
      ]);
      setEntries(wList);
      setPsychologists(psyList);
    } catch (error) {
      console.error('Error loading data', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (entry?: WaitingListEntry) => {
    if (entry) {
      setEditingEntry(entry);
      setFormData({
        customerName: entry.customerName,
        phone: entry.phone || '',
        preferredDays: entry.preferredDays || [],
        preferredHours: entry.preferredHours || [],
        psychologistId: entry.psychologistId || '',
        notes: entry.notes || '',
        status: entry.status
      });
    } else {
      setEditingEntry(null);
      setFormData({
        customerName: '',
        phone: '',
        preferredDays: [],
        preferredHours: [],
        psychologistId: '',
        notes: '',
        status: 'pending'
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        psychologistId: formData.psychologistId || undefined
      };

      if (editingEntry) {
        await api.updateWaitingListEntry(editingEntry.id, payload);
      } else {
        await api.createWaitingListEntry(payload);
      }
      await loadData();
      setIsModalOpen(false);
    } catch (error) {
      alert('Erro ao salvar registro na fila de espera');
    } finally {
      setIsSaving(false);
    }
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
    } catch (error) {
      alert('Erro ao atualizar status');
    }
  };

  const toggleDay = (day: number) => {
    setFormData(prev => {
      const days = prev.preferredDays.includes(day)
        ? prev.preferredDays.filter(d => d !== day)
        : [...prev.preferredDays, day].sort();
      return { ...prev, preferredDays: days };
    });
  };

  const toggleHour = (hour: string) => {
    setFormData(prev => {
      const hours = prev.preferredHours.includes(hour)
        ? prev.preferredHours.filter(h => h !== hour)
        : [...prev.preferredHours, hour].sort();
      return { ...prev, preferredHours: hours };
    });
  };

  const filteredEntries = entries.filter(e => {
    const matchesSearch = e.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (e.phone || '').includes(searchTerm);
    
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'pending': return <span className="px-2 py-1 rounded bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider border border-amber-100 flex items-center gap-1"><Clock size={10} /> Aguardando</span>;
      case 'called': return <span className="px-2 py-1 rounded bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider border border-blue-100 flex items-center gap-1"><PhoneCall size={10} /> Contatado</span>;
      case 'resolved': return <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider border border-emerald-100 flex items-center gap-1"><CheckCircle2 size={10} /> Agendado</span>;
      case 'canceled': return <span className="px-2 py-1 rounded bg-zinc-100 text-zinc-500 text-[10px] font-bold uppercase tracking-wider border border-zinc-200 flex items-center gap-1"><AlertCircle size={10} /> Cancelado</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Fila de Espera</h2>
          <p className="text-zinc-500">Registre interesses e não perca oportunidades quando houver desistências.</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="w-full sm:w-auto bg-priori-navy hover:bg-priori-navy/90 text-white">
          <Plus size={20} className="mr-2" />
          Adicionar à Fila
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            className="w-full bg-white border border-zinc-100 rounded-xl pl-10 pr-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex bg-zinc-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setStatusFilter('pending')}
            className={cn(
              "px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all whitespace-nowrap",
              statusFilter === 'pending' ? "bg-white text-priori-navy shadow-sm" : "text-zinc-500 hover:text-priori-navy"
            )}
          >
            Aguardando
          </button>
          <button
            onClick={() => setStatusFilter('called')}
            className={cn(
              "px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all whitespace-nowrap",
              statusFilter === 'called' ? "bg-white text-priori-navy shadow-sm" : "text-zinc-500 hover:text-priori-navy"
            )}
          >
            Contatados
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              "px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all whitespace-nowrap",
              statusFilter === 'all' ? "bg-white text-priori-navy shadow-sm" : "text-zinc-500 hover:text-priori-navy"
            )}
          >
            Todos
          </button>
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
        ) : filteredEntries.map((entry) => {
          const psy = psychologists.find(p => p.id === entry.psychologistId);
          
          return (
            <div key={entry.id} className="bg-white border border-zinc-100 rounded-2xl p-5 flex flex-col hover:border-priori-gold/30 shadow-sm transition-all relative group">
              <div className="absolute top-5 right-5">
                {getStatusBadge(entry.status)}
              </div>
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-priori-navy/5 flex items-center justify-center text-priori-navy">
                  <User size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-priori-navy text-sm">{entry.customerName}</h3>
                  <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-0.5">
                    <Phone size={10} /> {entry.phone || 'Sem telefone'}
                  </div>
                </div>
              </div>

              <div className="space-y-3 flex-1 mb-4 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                {entry.psychologistId && (
                  <p className="text-xs text-zinc-600 flex items-center gap-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Profissional:</span> 
                    <span className="font-medium text-priori-navy">{psy?.name || 'Não encontrado'}</span>
                  </p>
                )}
                
                {entry.preferredDays.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5 w-16">Dias:</span> 
                    <div className="flex flex-wrap gap-1">
                      {entry.preferredDays.map(d => (
                        <span key={d} className="px-1.5 py-0.5 bg-white border border-zinc-200 rounded text-[10px] font-medium text-zinc-600">
                          {DAYS_OF_WEEK[d].substring(0, 3)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {entry.preferredHours.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5 w-16">Horários:</span> 
                    <div className="flex flex-wrap gap-1">
                      {entry.preferredHours.map(h => (
                        <span key={h} className="px-1.5 py-0.5 bg-white border border-zinc-200 rounded text-[10px] font-medium text-zinc-600">
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {entry.notes && (
                  <p className="text-xs text-zinc-500 italic border-t border-zinc-200 pt-2 mt-2">
                    "{entry.notes}"
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-zinc-100">
                <div className="flex gap-1">
                  {entry.status === 'pending' && (
                    <button 
                      onClick={() => updateStatus(entry.id, 'called')}
                      className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                      title="Marcar como Contatado"
                    >
                      <PhoneCall size={14} />
                    </button>
                  )}
                  {(entry.status === 'pending' || entry.status === 'called') && (
                    <button 
                      onClick={() => updateStatus(entry.id, 'resolved')}
                      className="p-1.5 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 transition-colors"
                      title="Marcar como Agendado (Resolvido)"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => handleOpenModal(entry)}
                    className="p-1.5 text-zinc-400 hover:text-priori-navy hover:bg-priori-navy/5 rounded transition-all"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => handleDelete(entry.id)}
                    className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEntry ? 'Editar Interessado' : 'Adicionar à Fila de Espera'}
        footer={
          <div className="flex gap-3">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" 
              onClick={() => setIsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              form="waiting-form"
              className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" 
              isLoading={isSaving}
            >
              {editingEntry ? 'Salvar Alterações' : 'Adicionar Interessado'}
            </Button>
          </div>
        }
      >
        <form id="waiting-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Nome do Paciente</label>
              <input
                className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5"
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                placeholder="Nome do interessado"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Telefone de Contato</label>
                <input
                  className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Status Atual</label>
                <select
                  className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                >
                  <option value="pending">Aguardando Vaga</option>
                  <option value="called">Foi Contatado</option>
                  <option value="resolved">Já Agendado</option>
                  <option value="canceled">Desistiu</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Profissional Desejado (Opcional)</label>
              <select
                className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5"
                value={formData.psychologistId}
                onChange={(e) => setFormData({ ...formData, psychologistId: e.target.value })}
              >
                <option value="">Qualquer profissional</option>
                {psychologists.map(psy => (
                  <option key={psy.id} value={psy.id}>{psy.name}</option>
                ))}
              </select>
            </div>

            <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-priori-navy uppercase tracking-widest">Dias da Semana Preferidos</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day, idx) => {
                    if (idx === 0) return null; // Ignorar domingo por padrão na UI para ficar limpo
                    const isSelected = formData.preferredDays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                          isSelected 
                            ? "bg-priori-navy border-priori-navy text-white shadow-sm" 
                            : "bg-white border-zinc-200 text-zinc-500 hover:border-priori-navy/50"
                        )}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-priori-navy uppercase tracking-widest">Faixas de Horário</label>
                <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                  {HOURS.map(hour => {
                    const isSelected = formData.preferredHours.includes(hour);
                    return (
                      <button
                        key={hour}
                        type="button"
                        onClick={() => toggleHour(hour)}
                        className={cn(
                          "px-2 py-1 rounded border text-xs font-medium transition-colors",
                          isSelected 
                            ? "bg-priori-gold/10 border-priori-gold text-priori-gold font-bold" 
                            : "bg-white border-zinc-200 text-zinc-500 hover:border-priori-gold/50"
                        )}
                      >
                        {hour}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Observações Adicionais</label>
              <textarea
                className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5 min-h-[80px]"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Ex: Prefere atendimento online..."
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
