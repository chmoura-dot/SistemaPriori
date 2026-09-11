/**
 * useWaitingListMatches
 *
 * Recalcula periodicamente as vagas estruturais compatíveis com a Fila de
 * Espera (ver lib/waitingListMatch.ts), reaproveitando o mesmo padrão de
 * polling + evento customizado já usado pelo Sidebar para o badge de
 * renovação (`renewal-updated`).
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { logger } from '../../lib/logger';
import { toISODateLocal } from '../../lib/dateUtils';
import { findWaitingListMatches, WaitingListMatch, MATCH_HORIZON_DAYS } from '../../lib/waitingListMatch';

export function useWaitingListMatches() {
  const [matches, setMatches] = useState<WaitingListMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!api.isAuthenticated()) return;
    try {
      const today = new Date();
      const horizonEnd = new Date(today);
      horizonEnd.setDate(horizonEnd.getDate() + MATCH_HORIZON_DAYS);

      const [waitingList, psychologists, appointments, holidays, closures] = await Promise.all([
        api.getWaitingList(),
        api.getPsychologists(),
        api.getAppointmentsByRange(toISODateLocal(today), toISODateLocal(horizonEnd)),
        api.getHolidays(),
        api.getClinicClosures(),
      ]);

      setMatches(findWaitingListMatches(waitingList, psychologists, appointments, holidays, closures));
    } catch (err) {
      logger.warn('[useWaitingListMatches] Falha ao calcular vagas compatíveis:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Diferir a primeira chamada para não competir com a renderização da página principal
    // (mesmo padrão usado pelo Sidebar para renewalCount).
    const startupDelay = setTimeout(load, 6_000);
    const interval = setInterval(load, 5 * 60 * 1000);

    const handleUpdate = () => load();
    window.addEventListener('waiting-match-updated', handleUpdate);
    window.addEventListener('renewal-updated', handleUpdate); // agenda mudou → recalcular também

    return () => {
      clearTimeout(startupDelay);
      clearInterval(interval);
      window.removeEventListener('waiting-match-updated', handleUpdate);
      window.removeEventListener('renewal-updated', handleUpdate);
    };
  }, [load]);

  return { matches, isLoading, reload: load };
}
