import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import {
  AuditLogEntry,
  EnrichedAuditLogEntry,
  AuditOperationGroup,
  Customer,
  BillingBatch,
  Psychologist,
} from '../services/types';
import { toastSuccess, toastError } from '../lib/toast';
import { logger } from '../lib/logger';
import { enrichAuditLogs, groupAuditLogs } from './audit/auditHelpers';

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

  // Agrupa por operationId para que uma ação do usuário (ex.: pagar um lote
  // com 8 atendimentos) apareça como 1 evento na tela, não N linhas repetidas.
  const groupedLogs = useMemo<AuditOperationGroup[]>(() => groupAuditLogs(filteredLogs), [filteredLogs]);

  // groupedLogs é montado em cima de filteredLogs (pós-filtro), mas
  // revertFinancialAuditOperation reverte TODAS as linhas daquele
  // operationId no banco, sem saber nada sobre os filtros ativos na tela.
  // Este mapa (operationId -> quantidade real, sem filtro) permite avisar o
  // usuário quando o grupo mostrado é só uma fatia da operação completa,
  // antes de confirmar um "Desfazer tudo" que reverteria mais do que o
  // modal está exibindo.
  const operationFullCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const group of groupAuditLogs(enrichedLogs)) {
      if (group.operationId) map.set(group.operationId, group.affectedCount);
    }
    return map;
  }, [enrichedLogs]);

  // Métricas contam operações (grupos), não linhas cruas — um pagamento de
  // 8 atendimentos conta como 1 "pagamento", não 8.
  const metrics = useMemo(() => {
    const allGroups = groupAuditLogs(enrichedLogs);
    const totalChanges = allGroups.length;
    const secretariaChanges = allGroups.filter(g => g.operatorRole === 'secretaria').length;
    const batchRemovals = allGroups.filter(g => g.entries.some(e => e.actionLabel.includes('Remoção'))).length;
    const paymentChanges = allGroups.filter(g =>
      g.entries.some(e => e.actionLabel.includes('Pago') || e.actionLabel.includes('Pagamento'))
    ).length;

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

  // Reverte um grupo inteiro (todas as linhas da mesma operação, atomicamente
  // no banco). Para grupos legados sem operationId (affectedCount === 1),
  // cai de volta na reversão de linha única de sempre.
  const handleRevertGroup = async (group: AuditOperationGroup) => {
    setIsReverting(true);
    try {
      const res = group.operationId
        ? await api.revertFinancialAuditOperation(group.operationId)
        : await api.revertFinancialAuditLog(group.entries[0].id);
      if (res?.success) {
        toastSuccess(res.message || 'Alteração(ões) revertida(s) com sucesso!');
        await loadData();
      } else {
        toastError(res?.message || 'Falha ao reverter a alteração.');
      }
    } catch (err: any) {
      logger.critical('audit.handleRevertGroup', err, {
        operationId: group.operationId, count: group.entries.length,
      });
      toastError(`Erro ao reverter: ${err.message || 'Falha desconhecida'}`);
    } finally {
      setIsReverting(false);
    }
  };

  return {
    rawLogs,
    enrichedLogs,
    filteredLogs,
    groupedLogs,
    operationFullCounts,
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
    handleRevertGroup,
  };
}
