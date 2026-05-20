import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../services/api';
import { Psychologist, PsychologistAvailability } from '../services/types';
import { Button } from '../components/Button';
import { PsychologistCard } from './psychologists/PsychologistCard';
import { PsychologistFormModal, PsyFormData } from './psychologists/PsychologistFormModal';

const DEFAULT_FORM: PsyFormData = {
  name: '', email: '', specialties: [], phone: '', active: true,
  availability: [], repassRate: 0.50, repassFixedAmount: undefined
};

export const PsychologistsPage = () => {
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPsychologist, setEditingPsychologist] = useState<Psychologist | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<PsyFormData>(DEFAULT_FORM);
  const [newSpecialty, setNewSpecialty] = useState('');

  const loadPsychologists = async () => {
    setIsLoading(true);
    const data = await api.getPsychologists();
    setPsychologists(data);
    setIsLoading(false);
  };

  useEffect(() => { loadPsychologists(); }, []);

  const handleOpenModal = (psy?: Psychologist) => {
    if (psy) {
      setEditingPsychologist(psy);
      setFormData({ name: psy.name, email: psy.email || '', specialties: psy.specialties || [], phone: psy.phone || '', active: psy.active, availability: psy.availability || [], repassRate: psy.repassRate ?? 0.50, repassFixedAmount: psy.repassFixedAmount });
    } else {
      setEditingPsychologist(null);
      setFormData(DEFAULT_FORM);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editingPsychologist) { await api.updatePsychologist(editingPsychologist.id, formData); }
      else { await api.createPsychologist(formData); }
      await loadPsychologists();
      setIsModalOpen(false);
    } catch { alert('Erro ao salvar psicólogo'); }
    finally { setIsSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este psicólogo?')) {
      await api.deletePsychologist(id);
      await loadPsychologists();
    }
  };

  const handleInvite = async (email: string) => {
    if (!email) { alert('Este psicólogo não possui um e-mail cadastrado.'); return; }
    if (confirm('Deseja enviar um e-mail de convite de acesso ao aplicativo?')) {
      try { await api.invitePsychologist(email); alert('Convite enviado com sucesso!'); }
      catch (error: any) { alert(`Erro ao enviar convite: ${error?.message || error}`); }
    }
  };

  const addSpecialty = () => {
    if (newSpecialty.trim() && !formData.specialties.includes(newSpecialty.trim())) {
      setFormData({ ...formData, specialties: [...formData.specialties, newSpecialty.trim()] });
      setNewSpecialty('');
    }
  };

  const removeSpecialty = (index: number) => setFormData({ ...formData, specialties: formData.specialties.filter((_, i) => i !== index) });
  const addAvailability = () => setFormData({ ...formData, availability: [...formData.availability, { dayOfWeek: 1, startTime: '08:00', endTime: '20:00', mode: 'Ambos' as const }] });
  const removeAvailability = (index: number) => setFormData({ ...formData, availability: formData.availability.filter((_, i) => i !== index) });
  const updateAvailability = (index: number, field: keyof PsychologistAvailability, value: any) => {
    const newA = [...formData.availability];
    newA[index] = { ...newA[index], [field]: value };
    setFormData({ ...formData, availability: newA });
  };
  const sendWhatsApp = (phone: string, message: string) => {
    window.open(`https://wa.me/55${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Psicólogos</h2>
          <p className="text-zinc-500">Gestão de profissionais, especialidades e agendas.</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="w-full sm:w-auto bg-priori-navy hover:bg-priori-navy/90 text-white">
          <Plus size={20} className="mr-2" /> Novo Psicólogo
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
          <PsychologistCard
            key={psy.id}
            psy={psy}
            onEdit={handleOpenModal}
            onDelete={handleDelete}
            onInvite={handleInvite}
            onWhatsApp={sendWhatsApp}
          />
        ))}
      </div>

      <PsychologistFormModal
        isOpen={isModalOpen}
        editingPsychologist={editingPsychologist}
        formData={formData}
        setFormData={setFormData}
        newSpecialty={newSpecialty}
        setNewSpecialty={setNewSpecialty}
        isSaving={isSaving}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
        addSpecialty={addSpecialty}
        removeSpecialty={removeSpecialty}
        addAvailability={addAvailability}
        removeAvailability={removeAvailability}
        updateAvailability={updateAvailability}
      />
    </div>
  );
};
