import { supabaseService } from './supabaseService';
import { supabase } from '../lib/supabase';

// Toggle this to switch between mock and real service
// export const api = mockService; // ← use this line to revert to mock data
export const api = {
  ...supabaseService,
  updateUserPassword: async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },
};