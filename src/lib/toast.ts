/**
 * Toast Notifications — wrapper sobre react-hot-toast
 * Centraliza as notificações do sistema, substituindo alert() nativo.
 * Uso: import { toast } from '../lib/toast';
 *      toast.success('Salvo!');
 *      toast.error('Erro ao salvar');
 */
import toast from 'react-hot-toast';

export { toast };

export const toastSuccess = (msg: string) =>
  toast.success(msg, {
    duration: 3000,
    style: { background: '#1B365D', color: '#fff', borderRadius: '12px', fontWeight: 600, fontSize: '14px' },
    iconTheme: { primary: '#C5A059', secondary: '#fff' },
  });

export const toastError = (msg: string) =>
  toast.error(msg, {
    duration: 4000,
    style: { background: '#1B365D', color: '#fff', borderRadius: '12px', fontWeight: 600, fontSize: '14px' },
    iconTheme: { primary: '#ef4444', secondary: '#fff' },
  });

export const toastInfo = (msg: string) =>
  toast(msg, {
    duration: 3000,
    style: { background: '#1B365D', color: '#fff', borderRadius: '12px', fontWeight: 600, fontSize: '14px' },
  });
