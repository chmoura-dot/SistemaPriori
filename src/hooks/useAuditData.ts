import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import {
  AuditLogEntry,
  EnrichedAuditLogEntry,
  Customer,
  BillingBatch,
  Psychologist,
} from '../services/types';
import { toastSuccess, toastError } from '../lib/toast';
import { logger } from '../lib/logger';
import { enrichAuditLogs } from './audit/auditHelpers';

export function useAuditData() {
  const [rawLogs, setRawLogs] = useState<AuditLogEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReverting, setIsReverting] = useState(false);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [tableFilter, setTableFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [logsData, custData, batchData, psyData] = await Promise.all([
        api.getFinancialAuditLogs(300),
        api.getCustomers(),
        api.getBillingBatches(),
        api.getPsychologists(),
      ]);
      setRawLogs(logsData);
      setCustomers(custData);
      setBatches(batchData);
      setPsychologists(psyData);
    } catch (err) {
      logger.error('Erro ao carregar logs de auditoria:', err);
      toastError('Erro ao carregar dados de auditoria.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const enrichedLogs = useMemo<EnrichedAuditLogEntry[]>(() => {
    return enrichAuditLogs(rawLogs, customers, batches, psychologists);
  }, [rawLogs, customers, batches, psychologists]);

  const filteredLogs = useMemo(() => {
    return enrichedLogs.filter(item => {
      if (tableFilter !== 'ALL' && item.tableName !== tableFilter) return false;
      if (roleFilter !== 'ALL' && item.operatorRole !== roleFilter) return false;
      if (actionFilter !== 'ALL' && item.action !== actionFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText =
          item.operatorName.toLowerCase().includes(q) ||
          item.actionLabel.toLowerCase().includes(q) ||
          item.recordDescription.toLowerCase().includes(q) ||
          (item.extractedReason && item.extractedReason.toLowerCase().includes(q)) ||
          item.recordId.toLowerCase().includes(q);

        if (!matchesText) return false;
      }

      return true;
    });
  }, [enrichedLogs, tableFilter, roleFilter, actionFilter, searchQuery]);

  const metrics = useMemo(() => {
    const totalChanges = enrichedLogs.length;
    const secretariaChanges = enrichedLogs.filter(l => l.operatorRole === 'secretaria').length;
    const batchRemovals = enrichedLogs.filter(l => l.actionLabel.includes('Remoção')).length;
    const paymentChanges = enrichedLogs.filter(l => l.actionLabel.includes('Pago') || l.actionLabel.includes('Pagamento')).length;

    return {
      totalChanges,
      secretariaChanges,
      batchRemovals,
      paymentChanges,
    };
  }, [enrichedLogs]);

  const handleRevert = async (entry: EnrichedAuditLogEntry) => {
    setIsReverting(true);
    try {
      const res = await api.revertFinancialAuditLog(entry.id);
      if (res?.success) {
        toastSuccess(res.message || 'Alteração revertida com sucesso!');
        await loadData();
      } else {
        toastError(res?.message || 'Falha ao reverter a alteração.');
      }
    } catch (err: any) {
      logger.critical('audit.handleRevert', err, { auditId: entry.id, table: entry.tableName });
      toastError(`Erro ao reverter: ${err.message || 'Falha desconhecida'}`);
    } finally {
      setIsReverting(false);
    }
  };

  return {
    rawLogs,
    enrichedLogs,
    filteredLogs,
    metrics,
    isLoading,
    isReverting,
    searchQuery,
    setSearchQuery,
    tableFilter,
    setTableFilter,
    roleFilter,
    setRoleFilter,
    actionFilter,
    setActionFilter,
    refreshData: loadData,
    handleRevert,
  };
}
