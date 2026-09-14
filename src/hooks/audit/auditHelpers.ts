import {
  AuditLogEntry,
  EnrichedAuditLogEntry,
  AuditOperationGroup,
  Customer,
  BillingBatch,
  Psychologist,
} from '../../services/types';
import { formatCurrency } from '../../lib/utils';
import { format } from 'date-fns';

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

// Campos cujo valor bruto é um timestamp e deve ser exibido formatado (não ISO cru)
const DATE_FIELDS = new Set(['paid_at', 'sent_at', 'billing_ignored_at']);

// Campos monetários que devem ser exibidos com formatCurrency
const CURRENCY_FIELDS = new Set(['custom_price', 'custom_repass_amount', 'total_amount']);

// Campos booleanos que devem ser exibidos como Sim/Não
const BOOLEAN_FIELDS = new Set(['billing_ignored']);

/**
 * Compara dois valores vindos do audit_log (JSONB) de forma tolerante,
 * evitando "falsos positivos" de diff causados por null vs undefined vs '',
 * diferenças de formatação de timestamp ou tipo string/number.
 */
function valuesAreEquivalent(field: string, a: any, b: any): boolean {
  const normA = a === undefined || a === null || a === '' ? null : a;
  const normB = b === undefined || b === null || b === '' ? null : b;

  if (normA === null && normB === null) return true;
  if (normA === null || normB === null) return false;

  if (DATE_FIELDS.has(field)) {
    const tA = new Date(normA).getTime();
    const tB = new Date(normB).getTime();
    if (!Number.isNaN(tA) && !Number.isNaN(tB)) return tA === tB;
  }

  if (CURRENCY_FIELDS.has(field) || typeof normA === 'number' || typeof normB === 'number') {
    const nA = Number(normA);
    const nB = Number(normB);
    if (!Number.isNaN(nA) && !Number.isNaN(nB)) return nA === nB;
  }

  return normA === normB;
}

/** Compara arrays (ex: appointment_ids) ignorando a ordem dos itens. */
function arraysAreEquivalent(a: any[] | null | undefined, b: any[] | null | undefined): boolean {
  const arrA = Array.isArray(a) ? [...a].sort() : [];
  const arrB = Array.isArray(b) ? [...b].sort() : [];
  if (arrA.length !== arrB.length) return false;
  return arrA.every((v, i) => v === arrB[i]);
}

/** Formata o valor de um campo para exibição no diff, de acordo com seu tipo semântico. */
function formatValueForDisplay(field: string, value: any): any {
  if (value === undefined || value === null || value === '') return null;

  if (DATE_FIELDS.has(field)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : format(d, 'dd/MM/yyyy HH:mm');
  }
  if (CURRENCY_FIELDS.has(field)) {
    return formatCurrency(Number(value));
  }
  if (BOOLEAN_FIELDS.has(field)) {
    return value ? 'Sim' : 'Não';
  }
  return value;
}

// Campos técnicos que, para determinadas ações já traduzidas em `actionLabel`/
// `extractedReason`, seriam redundantes se também aparecessem em "Campos Modificados".
const REDUNDANT_APPOINTMENT_FIELDS_BY_ACTION: Record<string, string[]> = {
  'Remoção do Lote': ['billing_batch_id', 'billing_ignored', 'billing_ignored_reason', 'billing_ignored_at'],
  'Inclusão em Lote': ['billing_batch_id'],
  'Desconsiderado de Faturamento': ['billing_ignored', 'billing_ignored_reason'],
  'Restaurado para Faturamento': ['billing_ignored', 'billing_ignored_reason', 'billing_ignored_at'],
  'Atendimento Marcado como Pago': ['billing_status'],
  'Pagamento Desfeito': ['billing_status'],
  'Atendimento Glosado': ['billing_status', 'denial_reason'],
};

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
    let actionLabel: string = log.action;
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
        const hasFinancialDiff = FINANCIAL_APPOINTMENT_FIELDS.some(f => !valuesAreEquivalent(f, oldD[f], newD[f]));
        if (!hasFinancialDiff && log.action === 'UPDATE') {
          isRelevant = false;
        } else {
          actionLabel = 'Atualização Financeira';
        }
      }

      if (isRelevant) {
        const redundantFields = REDUNDANT_APPOINTMENT_FIELDS_BY_ACTION[actionLabel] || [];
        FINANCIAL_APPOINTMENT_FIELDS.forEach(f => {
          if (redundantFields.includes(f)) return;
          if (!valuesAreEquivalent(f, oldD[f], newD[f])) {
            fieldDiffs.push({
              field: f,
              label: FIELD_LABELS[f] || f,
              oldValue: f === 'billing_batch_id' && oldD[f] ? (batchMap.get(oldD[f]) || oldD[f]) : formatValueForDisplay(f, oldD[f]),
              newValue: f === 'billing_batch_id' && newD[f] ? (batchMap.get(newD[f]) || newD[f]) : formatValueForDisplay(f, newD[f]),
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

      // 'status' é omitido aqui pois já está traduzido no actionLabel acima.
      ['total_amount', 'health_plan', 'batch_number', 'paid_at', 'sent_at', 'appointment_ids'].forEach(f => {
        if (f === 'appointment_ids') {
          if (!arraysAreEquivalent(oldD[f], newD[f])) {
            fieldDiffs.push({
              field: f,
              label: 'Qtd. Atendimentos',
              oldValue: oldD[f]?.length ?? 0,
              newValue: newD[f]?.length ?? 0,
            });
          }
          return;
        }
        if (!valuesAreEquivalent(f, oldD[f], newD[f])) {
          fieldDiffs.push({
            field: f,
            label: FIELD_LABELS[f] || f,
            oldValue: formatValueForDisplay(f, oldD[f]),
            newValue: formatValueForDisplay(f, newD[f]),
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

      // 'status' é omitido aqui pois já está traduzido no actionLabel acima.
      ['total_amount', 'paid_at', 'notes', 'appointment_ids'].forEach(f => {
        if (f === 'appointment_ids') {
          if (!arraysAreEquivalent(oldD[f], newD[f])) {
            fieldDiffs.push({
              field: f,
              label: 'Qtd. Atendimentos',
              oldValue: oldD[f]?.length ?? 0,
              newValue: newD[f]?.length ?? 0,
            });
          }
          return;
        }
        if (!valuesAreEquivalent(f, oldD[f], newD[f])) {
          fieldDiffs.push({
            field: f,
            label: FIELD_LABELS[f] || f,
            oldValue: formatValueForDisplay(f, oldD[f]),
            newValue: formatValueForDisplay(f, newD[f]),
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

/**
 * Agrupa entradas enriquecidas por operationId, para que uma única ação do
 * usuário (ex.: pagar um lote com 8 atendimentos) apareça como um único
 * evento na Auditoria Financeira, expansível para ver cada registro afetado.
 * Entradas sem operationId (linhas antigas, ou qualquer escrita fora das RPCs
 * que o definem) viram "grupos de 1", preservando o comportamento anterior.
 */
export function groupAuditLogs(logs: EnrichedAuditLogEntry[]): AuditOperationGroup[] {
  const byOperation = new Map<string, EnrichedAuditLogEntry[]>();
  const groups: AuditOperationGroup[] = [];

  for (const log of logs) {
    if (log.operationId) {
      const existing = byOperation.get(log.operationId);
      if (existing) {
        existing.push(log);
      } else {
        byOperation.set(log.operationId, [log]);
      }
    } else {
      groups.push(buildOperationGroup(null, [log]));
    }
  }

  for (const [operationId, entries] of byOperation) {
    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    groups.push(buildOperationGroup(operationId, entries));
  }

  groups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return groups;
}

function buildOperationGroup(operationId: string | null, entries: EnrichedAuditLogEntry[]): AuditOperationGroup {
  const head = entries[0];
  return {
    operationId,
    groupKey: operationId ?? head.id,
    entries,
    createdAt: head.createdAt,
    operatorName: head.operatorName,
    operatorRole: head.operatorRole,
    summaryLabel: buildSummaryLabel(entries),
    affectedCount: entries.length,
    isReversible: entries.every(e => e.isReversible),
  };
}

/** Monta um rótulo legível para o grupo a partir do padrão predominante entre seus membros. */
function buildSummaryLabel(entries: EnrichedAuditLogEntry[]): string {
  const head = entries[0];
  if (entries.length === 1) {
    return `${head.actionLabel} — ${head.recordDescription}`;
  }

  const appointmentEntries = entries.filter(e => e.tableName === 'appointments');
  const batchEntry = entries.find(e => e.tableName === 'billing_batches');
  const repasseEntry = entries.find(e => e.tableName === 'repasses');

  const allSameLabel = (label: string) => appointmentEntries.length > 0 && appointmentEntries.every(e => e.actionLabel === label);

  let verb: string | null = null;
  if (allSameLabel('Atendimento Marcado como Pago')) {
    verb = `Marcou ${appointmentEntries.length} atendimentos como pagos`;
  } else if (allSameLabel('Pagamento Desfeito')) {
    verb = `Desfez o pagamento de ${appointmentEntries.length} atendimentos`;
  } else if (allSameLabel('Inclusão em Lote')) {
    verb = `Incluiu ${appointmentEntries.length} atendimentos`;
  } else if (allSameLabel('Remoção do Lote')) {
    verb = `Removeu ${appointmentEntries.length} atendimentos`;
  } else if (appointmentEntries.length > 0) {
    verb = `${appointmentEntries.length} atendimentos alterados`;
  }

  const target = batchEntry?.recordDescription || repasseEntry?.recordDescription;
  if (verb && target) return `${verb} — ${target}`;
  if (verb) return verb;
  if (batchEntry) return `${batchEntry.actionLabel} — ${batchEntry.recordDescription}`;
  return `${entries.length} alterações — ${head.actionLabel}`;
}
