import {
  AuditLogEntry,
  EnrichedAuditLogEntry,
  Customer,
  BillingBatch,
  Psychologist,
} from '../../services/types';
import { formatCurrency } from '../../lib/utils';

export const FINANCIAL_APPOINTMENT_FIELDS = [
  'billing_batch_id',
  'billing_status',
  'billing_ignored',
  'billing_ignored_reason',
  'billing_ignored_at',
  'paid_at',
  'custom_price',
  'custom_repass_amount',
  'denial_reason',
  'denial_resolution',
  'procedure_code',
];

export const FIELD_LABELS: Record<string, string> = {
  billing_batch_id: 'Lote de Faturamento',
  billing_status: 'Status do Faturamento',
  billing_ignored: 'Desconsiderado do Faturamento',
  billing_ignored_reason: 'Justificativa para Desconsiderar',
  billing_ignored_at: 'Data da Desconsideração',
  paid_at: 'Data de Pagamento',
  custom_price: 'Preço Customizado (R$)',
  custom_repass_amount: 'Valor de Repasse Customizado (R$)',
  denial_reason: 'Motivo da Glosa',
  denial_resolution: 'Resolução da Glosa',
  procedure_code: 'Código TUSS/Procedimento',
  batch_number: 'Número do Lote',
  status: 'Status',
  health_plan: 'Convênio / Operadora',
  total_amount: 'Valor Total (R$)',
  appointment_ids: 'IDs dos Atendimentos',
  psychologist_id: 'Psicólogo(a)',
  notes: 'Observações / Notas',
  sent_at: 'Data de Envio',
};

export function enrichAuditLogs(
  rawLogs: AuditLogEntry[],
  customers: Customer[],
  batches: BillingBatch[],
  psychologists: Psychologist[]
): EnrichedAuditLogEntry[] {
  const custMap = new Map(customers.map(c => [c.id, c.name]));
  const psyMap = new Map(psychologists.map(p => [p.id, p.name]));
  const batchMap = new Map(batches.map(b => [b.id, `Lote #${b.batchNumber} (${b.healthPlan})`]));

  const result: EnrichedAuditLogEntry[] = [];

  for (const log of rawLogs) {
    const oldD = log.oldData || {};
    const newD = log.newData || {};

    let operatorRole: 'admin' | 'secretaria' | 'sistema' = 'admin';
    const email = (log.userEmail || '').toLowerCase();
    if (email.includes('secretaria') || email.includes('sec@')) {
      operatorRole = 'secretaria';
    } else if (!email) {
      operatorRole = 'sistema';
    }

    const operatorName = log.userEmail
      ? (operatorRole === 'secretaria' ? `Secretaria (${log.userEmail})` : `Admin (${log.userEmail})`)
      : 'Sistema / Automático';

    let entityLabel = 'Desconhecido';
    let actionLabel = log.action;
    let recordDescription = '';
    let extractedReason: string | undefined = undefined;
    let isRelevant = true;
    const fieldDiffs: Array<{ field: string; label: string; oldValue: any; newValue: any }> = [];

    if (log.tableName === 'appointments') {
      entityLabel = 'Atendimento';
      const custId = newD.customer_id || oldD.customer_id;
      const patientName = custMap.get(custId) || 'Paciente não identificado';
      const dateStr = newD.date || oldD.date;
      const formattedDate = dateStr ? dateStr : '';

      recordDescription = `${patientName}${formattedDate ? ` • ${formattedDate}` : ''}`;

      const oldBatchId = oldD.billing_batch_id;
      const newBatchId = newD.billing_batch_id;
      const oldIgnored = !!oldD.billing_ignored;
      const newIgnored = !!newD.billing_ignored;
      const oldStatus = oldD.billing_status;
      const newStatus = newD.billing_status;

      if (oldBatchId && !newBatchId) {
        actionLabel = 'Remoção do Lote';
        const prevBatchName = batchMap.get(oldBatchId) || `Lote ID: ${String(oldBatchId).slice(0, 8)}...`;
        if (newIgnored) {
          extractedReason = newD.billing_ignored_reason || 'Desconsiderado definitivamente de faturamento';
        } else {
          extractedReason = 'Retornado para fila de pendentes (Apenas remover do lote)';
        }
        recordDescription += ` (Removido de ${prevBatchName})`;
      } else if (!oldBatchId && newBatchId) {
        actionLabel = 'Inclusão em Lote';
        const targetBatchName = batchMap.get(newBatchId) || `Lote ID: ${String(newBatchId).slice(0, 8)}...`;
        recordDescription += ` (Adicionado ao ${targetBatchName})`;
      } else if (!oldIgnored && newIgnored) {
        actionLabel = 'Desconsiderado de Faturamento';
        extractedReason = newD.billing_ignored_reason || 'Glosa ou isenção';
      } else if (oldIgnored && !newIgnored) {
        actionLabel = 'Restaurado para Faturamento';
      } else if (!oldStatus && newStatus === 'paid') {
        actionLabel = 'Atendimento Marcado como Pago';
      } else if (oldStatus === 'paid' && !newStatus) {
        actionLabel = 'Pagamento Desfeito';
      } else if (newStatus === 'denied') {
        actionLabel = 'Atendimento Glosado';
        extractedReason = newD.denial_reason || 'Sem motivo registrado';
      } else {
        const hasFinancialDiff = FINANCIAL_APPOINTMENT_FIELDS.some(f => oldD[f] !== newD[f]);
        if (!hasFinancialDiff && log.action === 'UPDATE') {
          isRelevant = false;
        } else {
          actionLabel = 'Atualização Financeira';
        }
      }

      if (isRelevant) {
        FINANCIAL_APPOINTMENT_FIELDS.forEach(f => {
          if (oldD[f] !== newD[f]) {
            fieldDiffs.push({
              field: f,
              label: FIELD_LABELS[f] || f,
              oldValue: f === 'billing_batch_id' && oldD[f] ? (batchMap.get(oldD[f]) || oldD[f]) : oldD[f],
              newValue: f === 'billing_batch_id' && newD[f] ? (batchMap.get(newD[f]) || newD[f]) : newD[f],
            });
          }
        });
      }
    }

    else if (log.tableName === 'billing_batches') {
      entityLabel = 'Lote de Faturamento';
      const batchNum = newD.batch_number || oldD.batch_number || log.recordId.slice(0, 8);
      const plan = newD.health_plan || oldD.health_plan || '';
      const total = newD.total_amount ?? oldD.total_amount;

      recordDescription = `Lote #${batchNum} • ${plan}${total != null ? ` • ${formatCurrency(Number(total))}` : ''}`;

      if (log.action === 'INSERT') {
        actionLabel = newD.status === 'draft' ? 'Criação de Lote Previsto' : 'Criação e Envio de Lote';
      } else if (log.action === 'DELETE') {
        actionLabel = 'Exclusão de Lote';
      } else {
        if (oldD.status !== newD.status) {
          actionLabel = `Status alterado: ${oldD.status || 'novo'} ➔ ${newD.status}`;
        } else {
          actionLabel = 'Alteração no Lote';
        }
      }

      ['status', 'total_amount', 'health_plan', 'batch_number', 'paid_at', 'sent_at', 'appointment_ids'].forEach(f => {
        const oldVal = f === 'appointment_ids' ? (oldD[f]?.length ?? 0) : oldD[f];
        const newVal = f === 'appointment_ids' ? (newD[f]?.length ?? 0) : newD[f];
        if (JSON.stringify(oldD[f]) !== JSON.stringify(newD[f])) {
          fieldDiffs.push({
            field: f,
            label: f === 'appointment_ids' ? 'Qtd. Atendimentos' : (FIELD_LABELS[f] || f),
            oldValue: f === 'total_amount' && oldVal != null ? formatCurrency(Number(oldVal)) : oldVal,
            newValue: f === 'total_amount' && newVal != null ? formatCurrency(Number(newVal)) : newVal,
          });
        }
      });
    } else if (log.tableName === 'repasses') {
      entityLabel = 'Repasse';
      const psyId = newD.psychologist_id || oldD.psychologist_id;
      const psyName = psyMap.get(psyId) || 'Psicólogo não identificado';
      const total = newD.total_amount ?? oldD.total_amount;

      recordDescription = `${psyName}${total != null ? ` • ${formatCurrency(Number(total))}` : ''}`;

      if (log.action === 'INSERT') {
        actionLabel = 'Geração de Repasse';
      } else if (log.action === 'DELETE') {
        actionLabel = 'Exclusão de Repasse';
      } else {
        if (oldD.status !== newD.status) {
          actionLabel = `Repasse: ${oldD.status || 'pendente'} ➔ ${newD.status}`;
        } else {
          actionLabel = 'Atualização de Repasse';
        }
      }

      ['status', 'total_amount', 'paid_at', 'notes', 'appointment_ids'].forEach(f => {
        const oldVal = f === 'appointment_ids' ? (oldD[f]?.length ?? 0) : oldD[f];
        const newVal = f === 'appointment_ids' ? (newD[f]?.length ?? 0) : newD[f];
        if (JSON.stringify(oldD[f]) !== JSON.stringify(newD[f])) {
          fieldDiffs.push({
            field: f,
            label: f === 'appointment_ids' ? 'Qtd. Atendimentos' : (FIELD_LABELS[f] || f),
            oldValue: f === 'total_amount' && oldVal != null ? formatCurrency(Number(oldVal)) : oldVal,
            newValue: f === 'total_amount' && newVal != null ? formatCurrency(Number(newVal)) : newVal,
          });
        }
      });
    }

    if (isRelevant) {
      result.push({
        ...log,
        operatorName,
        operatorRole,
        entityLabel,
        actionLabel,
        recordDescription,
        extractedReason,
        isReversible: true,
        fieldDiffs,
      });
    }
  }

  return result;
}
