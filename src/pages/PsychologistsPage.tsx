import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Phone, Calendar, MessageCircle, FileText, X, Globe, Home, Layers, Mail } from 'lucide-react';
import { api } from '../services/api';
import { Psychologist, PsychologistAvailability } from '../services/types';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { cn } from '../lib/utils';

const DAYS_OF_WEEK = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'
];

export const PsychologistsPage = () => {
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPsychologist, setEditingPsychologist] = useState<Psychologist | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    specialties: [] as string[],
    phone: '',
    active: true,
    availability: [] as PsychologistAvailability[],
    repassRate: 0.50,
    repassFixedAmount: undefined as number | undefined
  });

  const [newSpecialty, setNewSpecialty] = useState('');

  const loadPsychologists = async () => {
    setIsLoading(true);
    const data = await api.getPsychologists();
    setPsychologists(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadPsychologists();
  }, []);

  const handleOpenModal = (psy?: Psychologist) => {
    if (psy) {
      setEditingPsychologist(psy);
      setFormData({
        name: psy.name,
        email: psy.email || '',
        specialties: psy.specialties || [],
        phone: psy.phone || '',
        active: psy.active,
        availability: psy.availability || [],
        repassRate: psy.repassRate ?? 0.50,
        repassFixedAmount: psy.repassFixedAmount
      });
    } else {
      setEditingPsychologist(null);
      setFormData({
        name: '',
        email: '',
        specialties: [],
        phone: '',
        active: true,
        availability: [],
        repassRate: 0.50,
        repassFixedAmount: undefined
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editingPsychologist) {
        await api.updatePsychologist(editingPsychologist.id, formData);
      } else {
        await api.createPsychologist(formData);
      }
      await loadPsychologists();
      setIsModalOpen(false);
    } catch (error) {
      alert('Erro ao salvar psicólogo');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este psicólogo?')) {
      await api.deletePsychologist(id);
      await loadPsychologists();
    }
  };

  const addSpecialty = () => {
    if (newSpecialty.trim() && !formData.specialties.includes(newSpecialty.trim())) {
      setFormData({
        ...formData,
        specialties: [...formData.specialties, newSpecialty.trim()]
      });
      setNewSpecialty('');
    }
  };

  const removeSpecialty = (index: number) => {
    setFormData({
      ...formData,
      specialties: formData.specialties.filter((_, i) => i !== index)
    });
  };

  const addAvailability = () => {
    setFormData({
      ...formData,
      availability: [
        ...formData.availability,
        { dayOfWeek: 1, startTime: '08:00', endTime: '20:00', mode: 'Ambos' as const }
      ]
    });
  };

  const removeAvailability = (index: number) => {
    setFormData({
      ...formData,
      availability: formData.availability.filter((_, i) => i !== index)
    });
  };

  const updateAvailability = (index: number, field: keyof PsychologistAvailability, value: any) => {
    const newAvailability = [...formData.availability];
    newAvailability[index] = { ...newAvailability[index], [field]: value };
    setFormData({ ...formData, availability: newAvailability });
  };

  const sendWhatsApp = (phone: string, message: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Psicólogos</h2>
          <p className="text-zinc-500">Gestão de profissionais, especialidades e agendas.</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="w-full sm:w-auto bg-priori-navy hover:bg-priori-navy/90 text-white">
          <Plus size={20} className="mr-2" />
          Novo Psicólogo
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-zinc-100 rounded-2xl p-6 animate-pulse">
              <div className="h-4 bg-zinc-100 rounded w-1/2 mb-4" />
              <div className="h-8 bg-zinc-100 rounded w-1/3 mb-6" />
              <div className="h-10 bg-zinc-100 rounded w-full" />
            </div>
          ))
        ) : psychologists.map((psy) => (
          <div key={psy.id} className="bg-white border border-zinc-100 rounded-2xl p-6 flex flex-col hover:border-priori-gold/30 shadow-sm transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-priori-navy">{psy.name}</h3>
                <div className="flex flex-wrap gap-1 mt-1">
                  {psy.specialties.map((spec, idx) => (
                    <span key={idx} className="text-[9px] bg-zinc-50 text-zinc-500 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider border border-zinc-100">
                      {spec}
                    </span>
                  ))}
                </div>
              </div>
              <span className={cn(
                "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                psy.active ? "bg-priori-gold/10 text-priori-gold" : "bg-zinc-100 text-zinc-500"
              )}>
                {psy.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            <div className="space-y-4 mb-6 flex-1">
              <div className="flex items-center gap-2 text-zinc-500">
                <Phone size={14} className="text-priori-navy" />
                <span className="text-sm">{psy.phone || 'Sem telefone'}</span>
              </div>

              <div className="flex items-center gap-2 text-zinc-500">
                <Mail size={14} className="text-priori-navy" />
                <span className="text-sm truncate" title={psy.email}>{psy.email || 'Sem e-mail (agenda desativada)'}</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
                  <Calendar size={12} /> Agenda Disponível
                </div>
                <div className="space-y-1">
                  {psy.availability.length > 0 ? (
                    psy.availability.sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((slot, idx) => {
                      const slotMode = slot.mode ?? 'Ambos';
                      const modeColor = slotMode === 'Presencial'
                        ? 'bg-blue-50 text-blue-600 border-blue-100'
                        : slotMode === 'On-line'
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                        : 'bg-violet-50 text-violet-600 border-violet-100';
                      const ModeIcon = slotMode === 'Presencial' ? Home : slotMode === 'On-line' ? Globe : Layers;
                      return (
                        <div key={idx} className="flex items-center justify-between text-xs text-zinc-600 bg-zinc-50 p-1.5 rounded border border-zinc-100 gap-2">
                          <span className="font-medium shrink-0">{DAYS_OF_WEEK[slot.dayOfWeek]}</span>
                          <span className="text-zinc-500 flex-1 text-right">{slot.startTime} – {slot.endTime}</span>
                          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${modeColor}`}>
                            <ModeIcon size={9} />{slotMode}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-zinc-400 italic">Nenhum horário configurado</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <button 
                onClick={() => sendWhatsApp(psy.phone, `Olá ${psy.name}, gostaria de confirmar sua agenda para esta semana.`)}
                className="flex items-center justify-center gap-2 py-2 px-3 bg-priori-navy/5 text-priori-navy rounded-xl text-xs font-bold hover:bg-priori-navy/10 transition-all"
              >
                <MessageCircle size={14} />
                Confirmar
              </button>
              <button 
                onClick={() => sendWhatsApp(psy.phone, `Olá ${psy.name}, segue o relatório de atendimentos da semana.`)}
                className="flex items-center justify-center gap-2 py-2 px-3 bg-zinc-100 text-zinc-600 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-all"
              >
                <FileText size={14} />
                Relatório
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-100">
              <button 
                onClick={() => handleOpenModal(psy)}
                className="p-2 text-zinc-400 hover:text-priori-navy hover:bg-priori-navy/5 rounded-lg transition-all"
              >
                <Edit2 size={16} />
              </button>
              <button 
                onClick={() => handleDelete(psy.id)}
                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-500/5 rounded-lg transition-all"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPsychologist ? 'Editar Psicólogo' : 'Novo Psicólogo'}
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
              form="psychologist-form"
              className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" 
              isLoading={isSaving}
            >
              {editingPsychologist ? 'Salvar Alterações' : 'Criar Psicólogo'}
            </Button>
          </div>
        }
      >
        <form id="psychologist-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Nome Completo</label>
              <input
                className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Dra. Ana Beatriz"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">E-mail para Agenda</label>
              <input
                className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Ex: ana@prioriclinica.com.br"
                type="email"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Telefone (WhatsApp)</label>
                <input
                  className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Status</label>
                <select
                  className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5"
                  value={formData.active ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, active: e.target.value === 'true' })}
                >
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </div>
            </div>

            <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-4">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold text-priori-navy uppercase tracking-widest">Repasse (Atendimentos Particulares)</p>
                <span className="px-1.5 py-0.5 rounded bg-priori-navy/5 text-[8px] font-bold text-priori-navy uppercase tracking-tighter">Exclusivo Particular</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Percentual (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-2 text-sm text-priori-navy focus:outline-none"
                      value={formData.repassRate * 100}
                      onChange={(e) => setFormData({ ...formData, repassRate: parseFloat(e.target.value) / 100 })}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">%</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Valor Fixo (Opcional)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full bg-white border border-zinc-100 rounded-xl pl-9 pr-4 py-2 text-sm text-priori-navy focus:outline-none"
                      value={formData.repassFixedAmount || ''}
                      onChange={(e) => setFormData({ ...formData, repassFixedAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                      placeholder="0,00"
                    />
                  </div>
                </div>
              </div>
              <p className="text-[9px] text-zinc-400 italic">* Se o valor fixo for preenchido, ele terá prioridade sobre o percentual.</p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Especialidades</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-white border border-zinc-100 rounded-xl px-4 py-2 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5"
                  value={newSpecialty}
                  onChange={(e) => setNewSpecialty(e.target.value)}
                  placeholder="Ex: TCC, Infantil..."
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSpecialty())}
                />
                <Button type="button" variant="outline" onClick={addSpecialty} className="border-zinc-100 text-priori-navy hover:bg-zinc-50">
                  <Plus size={18} />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.specialties.map((spec, idx) => (
                  <span key={idx} className="flex items-center gap-1.5 px-2 py-1 bg-zinc-50 text-zinc-600 rounded-lg text-xs font-medium border border-zinc-100">
                    {spec}
                    <button type="button" onClick={() => removeSpecialty(idx)} className="text-zinc-400 hover:text-red-500">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Agenda de Disponibilidade</label>
                <Button type="button" variant="outline" size="sm" onClick={addAvailability} className="border-zinc-100 text-priori-navy hover:bg-zinc-50">
                  <Plus size={14} className="mr-1" /> Add Horário
                </Button>
              </div>
              <div className="space-y-3">
                {formData.availability.map((slot, idx) => (
                  <div key={idx} className="flex flex-col gap-2 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <select
                          className="w-full bg-white border border-zinc-100 rounded-lg px-2 py-1.5 text-xs text-priori-navy focus:outline-none"
                          value={slot.dayOfWeek}
                          onChange={(e) => updateAvailability(idx, 'dayOfWeek', parseInt(e.target.value))}
                        >
                          {DAYS_OF_WEEK.map((day, i) => (
                            <option key={i} value={i}>{day}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <input
                          type="time"
                          className="w-full bg-white border border-zinc-100 rounded-lg px-2 py-1.5 text-xs text-priori-navy focus:outline-none"
                          value={slot.startTime}
                          onChange={(e) => updateAvailability(idx, 'startTime', e.target.value)}
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="time"
                          className="w-full bg-white border border-zinc-100 rounded-lg px-2 py-1.5 text-xs text-priori-navy focus:outline-none"
                          value={slot.endTime}
                          onChange={(e) => updateAvailability(idx, 'endTime', e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button type="button" onClick={() => removeAvailability(idx)} className="text-zinc-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {/* Mode selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest shrink-0">Modalidade:</span>
                      <div className="flex gap-1 flex-1">
                        {(['Presencial', 'On-line', 'Ambos'] as const).map(m => {
                          const isSelected = (slot.mode ?? 'Ambos') === m;
                          const colors = m === 'Presencial'
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : m === 'On-line'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-violet-200 bg-violet-50 text-violet-700';
                          const ModeIcon = m === 'Presencial' ? Home : m === 'On-line' ? Globe : Layers;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => updateAvailability(idx, 'mode', m)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                                isSelected ? colors : 'border-zinc-100 bg-white text-zinc-400 hover:border-zinc-200'
                              }`}
                            >
                              <ModeIcon size={10} />{m}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
