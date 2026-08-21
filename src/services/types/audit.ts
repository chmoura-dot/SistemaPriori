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
