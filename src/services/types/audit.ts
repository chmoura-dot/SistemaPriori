export interface AuditLogEntry {
  id: string;
  userId?: string;
  userEmail?: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  tableName: 'appointments' | 'billing_batches' | 'repasses' | string;
  recordId: string;
  oldData: Record<string, any> | null;
  newData: Record<string, any> | null;
  createdAt: string;
  // Amarra várias linhas geradas pela mesma ação do usuário (ex.: pagar um
  // lote com N atendimentos). NULL em linhas antigas/ações que não passam
  // por uma RPC de escrita em lote — tratadas como "grupo de 1" na UI.
  operationId: string | null;
}

export interface EnrichedAuditLogEntry extends AuditLogEntry {
  operatorName: string;
  operatorRole: 'admin' | 'secretaria' | 'sistema';
  entityLabel: string;
  actionLabel: string;
  recordDescription: string;
  extractedReason?: string;
  isReversible: boolean;
  fieldDiffs: Array<{
    field: string;
    label: string;
    oldValue: any;
    newValue: any;
  }>;
}

// Um "grupo de operação" reúne todas as EnrichedAuditLogEntry que
// compartilham o mesmo operationId (ou uma única entry, quando operationId
// é null) para exibição/reversão como uma única ação na Auditoria Financeira.
export interface AuditOperationGroup {
  operationId: string | null;
  groupKey: string;
  entries: EnrichedAuditLogEntry[];
  createdAt: string;
  operatorName: string;
  operatorRole: 'admin' | 'secretaria' | 'sistema';
  summaryLabel: string;
  affectedCount: number;
  isReversible: boolean;
}
