import { supabase, toPsychologist, toRoom, throwOnError } from './helpers';
import { Psychologist, Room } from '../types';

export const psychologistService = {
  getPsychologists: async (): Promise<Psychologist[]> => {
    const { data, error } = await supabase.from('psychologists').select('*').order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toPsychologist);
  },

  createPsychologist: async (p: Omit<Psychologist, 'id'>): Promise<Psychologist> => {
    const row = await throwOnError(
      supabase
        .from('psychologists')
        .insert({
          name: p.name,
          email: p.email,
          specialties: p.specialties,
          phone: p.phone,
          active: p.active,
          availability: p.availability,
          repass_rate: p.repassRate,
          repass_fixed_amount: p.repassFixedAmount,
          pix_key_type: p.pixKeyType ?? null,
          pix_key: p.pixKey ?? null,
        })
        .select()
        .single()
    );

    if (p.email) {
      try {
        await supabase.functions.invoke('invite-psychologist', { body: { email: p.email } });
      } catch (err) {
        console.error('Erro ao enviar convite de acesso:', err);
      }
    }

    return toPsychologist(row);
  },

  updatePsychologist: async (id: string, p: Partial<Psychologist>): Promise<Psychologist> => {
    const updates: Record<string, any> = {};
    if (p.name !== undefined) updates.name = p.name;
    if (p.email !== undefined) updates.email = p.email;
    if (p.specialties !== undefined) updates.specialties = p.specialties;
    if (p.phone !== undefined) updates.phone = p.phone;
    if (p.active !== undefined) updates.active = p.active;
    if (p.availability !== undefined) updates.availability = p.availability;
    if (p.repassRate !== undefined) updates.repass_rate = p.repassRate;
    if (p.repassFixedAmount !== undefined) updates.repass_fixed_amount = p.repassFixedAmount;
    if (p.pixKeyType !== undefined) updates.pix_key_type = p.pixKeyType || null;
    if (p.pixKey !== undefined) updates.pix_key = p.pixKey || null;

    const row = await throwOnError(
      supabase.from('psychologists').update(updates).eq('id', id).select().single()
    );
    return toPsychologist(row);
  },

  deletePsychologist: async (id: string): Promise<void> => {
    const { error } = await supabase.from('psychologists').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  invitePsychologist: async (email: string): Promise<void> => {
    const { data, error } = await supabase.functions.invoke('invite-psychologist', { body: { email } });
    if (error) throw new Error(error.message);
    if (data && data.success === false) throw new Error(data.error || 'Erro desconhecido');
  },

  getRooms: async (): Promise<Room[]> => {
    const { data, error } = await supabase.from('rooms').select('*').order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toRoom);
  },
};
