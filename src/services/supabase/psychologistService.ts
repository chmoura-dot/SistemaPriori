import { supabase, toPsychologist, toRoom, throwOnError, PSYCHOLOGIST_COLUMNS, ROOM_COLUMNS } from './helpers';
import { getTodayISO } from '../../lib/dateUtils';
import { Psychologist, Room, PortfolioItem } from '../types';

export const psychologistService = {
  getPsychologists: async (): Promise<Psychologist[]> => {
    const { data, error } = await supabase.from('psychologists').select(PSYCHOLOGIST_COLUMNS).order('name');
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
          accepted_health_plans: p.acceptedHealthPlans ?? [],
        })
        .select()
        .single()
    );

    if (p.pixKey) {
      await psychologistService.setBankInfo(row.id, p.pixKeyType, p.pixKey);
    }

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
    if (p.acceptedHealthPlans !== undefined) updates.accepted_health_plans = p.acceptedHealthPlans;

    // Chave PIX: "em branco" significa "não alterar" — evita apagar um valor
    // já cadastrado se algum chamador enviar um update parcial sem essa chave.
    if (p.pixKey) {
      await psychologistService.setBankInfo(id, p.pixKeyType, p.pixKey);
    }

    const row = await throwOnError(
      supabase.from('psychologists').update(updates).eq('id', id).select().single()
    );
    return toPsychologist(row);
  },

  deletePsychologist: async (id: string): Promise<void> => {
    const { error } = await supabase.from('psychologists').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Chave PIX (tabela dedicada, leitura restrita a staff via RLS) ───────────
  getAllBankInfo: async (): Promise<Record<string, { pixKeyType?: Psychologist['pixKeyType']; pixKey?: string }>> => {
    const { data, error } = await supabase.from('psychologist_bank_info').select('psychologist_id, pix_key_type, pix_key');
    if (error) throw new Error(error.message);
    const map: Record<string, { pixKeyType?: Psychologist['pixKeyType']; pixKey?: string }> = {};
    for (const row of data ?? []) {
      map[row.psychologist_id] = { pixKeyType: row.pix_key_type ?? undefined, pixKey: row.pix_key ?? undefined };
    }
    return map;
  },

  setBankInfo: async (psychologistId: string, pixKeyType: Psychologist['pixKeyType'], pixKey: string): Promise<void> => {
    const { error } = await supabase
      .from('psychologist_bank_info')
      .upsert({
        psychologist_id: psychologistId,
        pix_key_type: pixKeyType || null,
        pix_key: pixKey,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
  },

  invitePsychologist: async (email: string): Promise<void> => {
    const { data, error } = await supabase.functions.invoke('invite-psychologist', { body: { email } });
    if (error) throw new Error(error.message);
    if (data && data.success === false) throw new Error(data.error || 'Erro desconhecido');
  },

  getRooms: async (): Promise<Room[]> => {
    const { data, error } = await supabase.from('rooms').select(ROOM_COLUMNS).order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toRoom);
  },

  getPsychologistPortfolio: async (referenceDate?: string): Promise<PortfolioItem[]> => {
    const today = referenceDate || getTodayISO();
    const { data, error } = await supabase.rpc('get_portfolio_by_psychologist', {
      p_reference_date: today,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      psychologistId: row.psychologist_id,
      psychologistName: row.psychologist_name,
      customerId: row.customer_id,
      customerName: row.customer_name,
      modality: row.modality,
      lastSessionDate: row.last_session_date,
      nextSessionDate: row.next_session_date,
      frequency: row.frequency,
      cycleStartDate: row.cycle_start_date,
      cycleDays: row.cycle_days,
      neuroStatus: row.neuro_status,
      totalSessions: Number(row.total_sessions ?? 0),
    }));
  },
};
