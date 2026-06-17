import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Upload, Users, AlertCircle, Edit2 } from 'lucide-react';
import { api } from '../services/api';
import { supabase } from '../lib/supabase';
import { Customer, CustomerStatus, HealthPlan, InactivationReason, Psychologist } from '../services/types';
import { Button } from '../components/Button';
import { cn } from '../lib/utils';
import { CustomerFormData, CustomerFormModal } from './customers/CustomerFormModal';
import { CustomerInactivationModal } from './customers/CustomerInactivationModal';
import { CustomerBulkModal } from './customers/CustomerBulkModal';
import { CustomerImportModal } from './customers/CustomerImportModal';
import { getIncompleteFields, inferGenderByName, formatDate, calculateAge } from './customers/customerUtils';

const ITEMS_PER_PAGE = 20;

const DEFAULT_FORM: CustomerFormData = {
  name: '', email: '', phone: '', birthDate: '', gender: '', healthPlan: HealthPlan.PARTICULAR,
  psychologistId: '', customPrice: undefined, customRepassAmount: undefined,
  notes: '', amsPassword: '', amsPasswordExpiry: '',
};

const PLAN_BADGE: Record<string, string> = {
  PARTICULAR:     'bg-blue-50 text-blue-700',
  AMS_PETROBRAS:  'bg-emerald-50 text-emerald-700',
  PAE:            'bg-orange-50 text-orange-700',
  PORTO_SAUDE:    'bg-sky-50 text-sky-700',
  MEDSENIOR:      'bg-indigo-50 text-indigo-700',
  GAMA:           'bg-rose-50 text-rose-700',
  SAUDE_CAIXA:    'bg-cyan-50 text-cyan-700',
};

export const CustomersPage = () => {
  // ── Data state ────────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ── Filter / pagination state ─────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterPsy, setFilterPsy] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [page, setPage] = useState(1);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>(DEFAULT_FORM);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [inactivateId, setInactivateId] = useState<string | null>(null);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [c, p] = await Promise.all([api.getCustomers(), api.getPsychologists()]);
      setCustomers(c);
      setPsychologists(p);
    } catch { alert('Erro ao carregar dados'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = customers;
    if (filterStatus === 'active') list = list.filter(c => c.status === CustomerStatus.ACTIVE);
    else if (filterStatus === 'inactive') list = list.filter(c => c.status !== CustomerStatus.ACTIVE);
    if (search.trim()) list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    if (filterPlan) list = list.filter(c => c.healthPlan === filterPlan);
    if (filterPsy) list = list.filter(c => c.psychologistId === filterPsy);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, search, filterPlan, filterPsy, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const selectedCustomers = customers.filter(c => selectedIds.has(c.id));

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setFormData(DEFAULT_FORM);
    setEditingId(null);
    setIsFormOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setFormData({
      name: customer.name, email: customer.email || '', phone: customer.phone || '',
      birthDate: customer.birthDate || '', gender: customer.gender || '',
      healthPlan: customer.healthPlan, psychologistId: customer.psychologistId || '',
      customPrice: customer.customPrice, customRepassAmount: customer.customRepassAmount,
      notes: customer.notes || '', amsPassword: customer.amsPassword || '',
      amsPasswordExpiry: customer.amsPasswordExpiry || '',
    });
    setEditingId(customer.id);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const gender = (formData.gender || inferGenderByName(formData.name) || null) as 'M' | 'F' | null;
      const payload = {
        ...formData,
        name: formData.name.toUpperCase(),
        gender,
        status: CustomerStatus.ACTIVE,
      } as any;
      if (editingId) await api.updateCustomer(editingId, payload);
      else await api.createCustomer(payload);

      // ── Propagação automática de valor para atendimentos não faturados ──
      if (editingId && formData.healthPlan === HealthPlan.PARTICULAR && formData.customPrice !== undefined) {
        const existing = customers.find(c => c.id === editingId);
        if (existing && existing.customPrice !== formData.customPrice) {
          try {
            // Busca lotes já enviados/pagos para excluí-los
            const { data: sentBatches } = await supabase
              .from('billing_batches')
              .select('appointment_ids')
              .in('status', ['SENT', 'PAID']);

            const lockedAppIds = new Set<string>();
            sentBatches?.forEach(b => (b.appointment_ids as string[])?.forEach(id => lockedAppIds.add(id)));

            // Busca atendimentos não faturados desse paciente
            const { data: apps } = await supabase
              .from('appointments')
              .select('id')
              .eq('customer_id', editingId)
              .is('billing_batch_id', null);

            const idsToUpdate = (apps || []).map(a => a.id).filter(id => !lockedAppIds.has(id));

            if (idsToUpdate.length > 0) {
              await supabase
                .from('appointments')
                .update({ custom_price: formData.customPrice })
                .in('id', idsToUpdate);
            }
          } catch {
            // Erro silencioso — propagação é best-effort
          }
        }
      }

      await loadData();
      setIsFormOpen(false);
    } catch (err: any) { alert(err.message || 'Erro ao salvar paciente'); }
    finally { setIsSaving(false); }
  };

  const handleInactivate = async (reason: string) => {
    if (!inactivateId) return;
    setIsSaving(true);
    try {
      const customer = customers.find(c => c.id === inactivateId);
      const psy = psychologists.find(p => p.id === customer?.psychologistId);

      // 1. Atualizar status do paciente
      await api.updateCustomer(inactivateId, { status: CustomerStatus.INACTIVE, inactivationReason: reason as unknown as InactivationReason } as any);

      // 2. Cancelar todas as consultas futuras do paciente
      const today = new Date().toISOString().split('T')[0];
      const { data: futureApps, error: fetchErr } = await supabase
        .from('appointments')
        .select('id')
        .eq('customer_id', inactivateId)
        .gte('date', today)
        .in('status', ['active', 'released']);

      if (fetchErr) console.error('[Inativação] Erro ao buscar consultas futuras:', fetchErr.message);

      const futureIds = (futureApps || []).map(a => a.id);
      if (futureIds.length > 0) {
        const { error: cancelErr } = await supabase
          .from('appointments')
          .update({ status: 'canceled', cancellation_billing: 'none' })
          .in('id', futureIds);
        if (cancelErr) console.error('[Inativação] Erro ao cancelar consultas:', cancelErr.message);
      }

      // 3. Registrar evento de alta (discharge_events) para notificação ao admin
      await supabase.from('discharge_events').insert({
        customer_id: inactivateId,
        psychologist_id: customer?.psychologistId || null,
        customer_name: customer?.name || 'Paciente',
        psychologist_name: psy?.name || 'Psicólogo',
        appointments_canceled: futureIds.length,
      });

      // 4. Pausar assinaturas ativas do paciente
      const { error: subErr } = await supabase
        .from('subscriptions')
        .update({ status: 'inactive' })
        .eq('customer_id', inactivateId)
        .eq('status', 'active');
      if (subErr) console.error('[Inativação] Erro ao pausar assinaturas:', subErr.message);

      await loadData();
      setInactivateId(null);
      setIsFormOpen(false);
    } catch (err: any) { alert(err.message || 'Erro ao inativar paciente'); }
    finally { setIsSaving(false); }
  };

  const handleBulkApply = async (changes: { healthPlan?: HealthPlan; psychologistId?: string }) => {
    setIsSaving(true);
    try {
      await Promise.all([...selectedIds].map(id => api.updateCustomer(id, changes)));
      await loadData();
      setIsBulkOpen(false);
      setSelectedIds(new Set());
    } catch { alert('Erro ao aplicar alterações em massa'); }
    finally { setIsSaving(false); }
  };

  const handleImport = async (rows: { name: string; phone: string; healthPlan: HealthPlan; birthDate: string }[]) => {
    setIsSaving(true);
    try {
      await Promise.all(rows.map(r => api.createCustomer({ ...r, name: r.name.toUpperCase(), email: '', psychologistId: '', status: CustomerStatus.ACTIVE, gender: inferGenderByName(r.name) || null } as any)));
      await loadData();
      setIsImportOpen(false);
      alert(`${rows.length} paciente(s) importado(s) com sucesso!`);
    } catch { alert('Erro ao importar pacientes'); }
    finally { setIsSaving(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Pacientes</h2>
          <p className="text-zinc-500">{filtered.length} paciente(s) · {customers.filter(c => c.status === CustomerStatus.ACTIVE).length} ativos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <Button variant="outline" onClick={() => setIsBulkOpen(true)} className="border-priori-navy/30 text-priori-navy">
              <Users size={16} className="mr-2" /> Editar {selectedIds.size} selecionados
            </Button>
          )}
          <Button variant="outline" onClick={() => setIsImportOpen(true)} className="border-zinc-200 text-zinc-600">
            <Upload size={16} className="mr-2" /> Importar CSV
          </Button>
          <Button onClick={openCreate} className="bg-priori-navy hover:bg-priori-navy/90 text-white">
            <Plus size={20} className="mr-2" /> Novo Paciente
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-4 flex flex-wrap gap-3 shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-zinc-50 rounded-xl px-3 py-2">
          <Search size={14} className="text-zinc-400" />
          <input className="bg-transparent flex-1 text-sm text-priori-navy focus:outline-none placeholder-zinc-400" placeholder="Buscar paciente..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="rounded-xl border border-zinc-100 px-3 py-2 text-sm text-priori-navy bg-zinc-50 focus:outline-none" value={filterStatus} onChange={e => { setFilterStatus(e.target.value as any); setPage(1); }}>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="all">Todos</option>
        </select>
        <select className="rounded-xl border border-zinc-100 px-3 py-2 text-sm text-priori-navy bg-zinc-50 focus:outline-none" value={filterPlan} onChange={e => { setFilterPlan(e.target.value); setPage(1); }}>
          <option value="">Todos os planos</option>
          {Object.values(HealthPlan).map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select className="rounded-xl border border-zinc-100 px-3 py-2 text-sm text-priori-navy bg-zinc-50 focus:outline-none" value={filterPsy} onChange={e => { setFilterPsy(e.target.value); setPage(1); }}>
          <option value="">Todos os psicólogos</option>
          {psychologists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-priori-navy border-t-transparent" />
        </div>
      ) : (
        <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead className="bg-zinc-50/70 border-b border-zinc-100">
              <tr>
                <th className="p-3 w-10"><input type="checkbox" className="rounded" checked={selectedIds.size === paginated.length && paginated.length > 0} onChange={e => { if (e.target.checked) setSelectedIds(new Set(paginated.map(c => c.id))); else setSelectedIds(new Set()); }} /></th>
                <th className="p-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest">Nome</th>
                <th className="p-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest hidden md:table-cell">Convênio</th>
                <th className="p-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest hidden lg:table-cell">Psicólogo</th>
                <th className="p-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest hidden lg:table-cell">Idade</th>
                <th className="p-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest hidden xl:table-cell">Status</th>
                <th className="p-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {paginated.map(customer => {
                const incomplete = getIncompleteFields(customer);
                const psyName = psychologists.find(p => p.id === customer.psychologistId)?.name;
                const isActive = customer.status === CustomerStatus.ACTIVE;
                return (
                  <tr key={customer.id} className={cn('hover:bg-zinc-50/50 transition-colors', !isActive && 'opacity-60')}>
                    <td className="p-3"><input type="checkbox" className="rounded" checked={selectedIds.has(customer.id)} onChange={() => toggleSelect(customer.id)} /></td>
                    <td className="p-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-priori-navy">{customer.name}</span>
                        {customer.phone && <span className="text-xs text-zinc-400">{customer.phone}</span>}
                        {incomplete.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <AlertCircle size={10} className="text-amber-500" />
                            <span className="text-[10px] text-amber-600">{incomplete.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase', PLAN_BADGE[customer.healthPlan] || 'bg-zinc-100 text-zinc-600')}>
                        {customer.healthPlan}
                      </span>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-sm text-zinc-600">{psyName || '—'}</td>
                    <td className="p-3 hidden lg:table-cell text-xs text-zinc-500">{calculateAge(customer.birthDate) || '—'}</td>
                    <td className="p-3 hidden xl:table-cell">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500')}>
                        {isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="p-3">
                      <button onClick={() => openEdit(customer)} className="p-1.5 text-zinc-400 hover:text-priori-navy transition-colors rounded-lg hover:bg-zinc-100">
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr><td colSpan={7} className="p-10 text-center text-zinc-400 text-sm">Nenhum paciente encontrado.</td></tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-zinc-100 p-3 flex items-center justify-between">
              <span className="text-xs text-zinc-500">{((page-1)*ITEMS_PER_PAGE)+1}–{Math.min(page*ITEMS_PER_PAGE, filtered.length)} de {filtered.length}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} className="px-3 py-1 text-xs border border-zinc-100 rounded-lg disabled:opacity-40 hover:bg-zinc-50">←</button>
                <span className="px-3 py-1 text-xs text-zinc-600">{page}/{totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} className="px-3 py-1 text-xs border border-zinc-100 rounded-lg disabled:opacity-40 hover:bg-zinc-50">→</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <CustomerFormModal
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingId(null); }}
        editingId={editingId}
        formData={formData}
        setFormData={setFormData}
        handleSubmit={handleSubmit}
        isSaving={isSaving}
        psychologists={psychologists}
        existingCustomers={customers}
        onInactivate={editingId ? () => setInactivateId(editingId) : undefined}
      />
      <CustomerInactivationModal
        isOpen={!!inactivateId}
        customerName={customers.find(c => c.id === inactivateId)?.name || ''}
        isSaving={isSaving}
        onConfirm={handleInactivate}
        onClose={() => setInactivateId(null)}
      />
      <CustomerBulkModal
        isOpen={isBulkOpen}
        onClose={() => setIsBulkOpen(false)}
        selectedCustomers={selectedCustomers}
        psychologists={psychologists}
        isSaving={isSaving}
        onApply={handleBulkApply}
      />
      <CustomerImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        isSaving={isSaving}
        onImport={handleImport}
      />
    </div>
  );
};
