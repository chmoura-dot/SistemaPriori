import { supabase } from './helpers';
import { User, UserRole } from '../types';
import { logger } from '../../lib/logger';

let currentUser: User | null = null;

export const authService = {
  login: async (email: string, password: string): Promise<User | null> => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      logger.error('Auth error:', authError);
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from('app_users')
      .select('role')
      .eq('email', email)
      .single();

    if (profileError || !profile) {
      logger.error('Profile fetch error:', profileError);
      return null;
    }

    currentUser = { email: authData.user.email!, role: profile.role as UserRole };
    localStorage.setItem('nucleo_user_v2', JSON.stringify(currentUser));
    return currentUser;
  },

  logout: async (): Promise<void> => {
    await supabase.auth.signOut();
    currentUser = null;
    localStorage.removeItem('nucleo_user_v2');
    localStorage.removeItem('nucleo_user');
  },

  isAuthenticated: (): boolean => {
    if (currentUser) return true;
    try {
      const stored = localStorage.getItem('nucleo_user_v2');
      if (stored) {
        currentUser = JSON.parse(stored);
        return true;
      }
    } catch {
      localStorage.removeItem('nucleo_user_v2');
    }
    return false;
  },

  getCurrentUser: (): User | null => {
    if (currentUser) return currentUser;
    try {
      const stored = localStorage.getItem('nucleo_user_v2');
      if (stored) {
        currentUser = JSON.parse(stored);
        return currentUser;
      }
    } catch {
      localStorage.removeItem('nucleo_user_v2');
    }
    return null;
  },

  updatePassword: async (newPassword: string): Promise<void> => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },

  // Reautentica com a senha atual antes de permitir a troca — sem isso,
  // qualquer sessão comprometida (dispositivo destravado, XSS, token
  // vazado) conseguiria trocar a senha da conta silenciosamente.
  // signInWithPassword é o mecanismo do próprio Supabase Auth para validar
  // a senha atual sem precisar de um endpoint dedicado.
  verifyCurrentPassword: async (password: string): Promise<boolean> => {
    const email = authService.getCurrentUser()?.email;
    if (!email) return false;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return !error;
  },
};
