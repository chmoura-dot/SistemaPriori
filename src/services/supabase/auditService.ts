import { supabase, throwOnError } from './helpers';
import { AuditLogEntry } from '../types/audit';

export const auditService = {
  getFinancialAuditLogs: async (limit: number = 200): Promise<AuditLogEntry[]> => {
    const { data, error } = await supabase
      .from('audit_log')
      .select('id, user_id, user_email, action, table_name, record_id, old_data, new_data, created_at')
      .in('table_name', ['billing_batches', 'repasses', 'appointments'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: row.user_email,
      action: row.action,
      tableName: row.table_name,
      recordId: row.record_id,
      oldData: row.old_data,
      newData: row.new_data,
      createdAt: row.created_at,
    }));
  },

  revertFinancialAuditLog: async (auditId: string): Promise<{ success: boolean; message: string }> => {
    const { data, error } = await supabase.rpc('revert_financial_audit_log', {
      p_audit_id: auditId,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data as { success: boolean; message: string };
  },
};
