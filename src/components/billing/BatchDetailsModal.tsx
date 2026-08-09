import React, { useState, useEffect, useMemo } from 'react';
import { Download, Pencil, Check, X, CircleDollarSign, RotateCcw, Search, Trash2, Plus, Lock } from 'lucide-react';

import { format } from 'date-fns';
import { BillingBatch, BillingBatchStatus, Appointment, AppointmentStatus, Customer, Psychologist, HealthPlan } from '../../services/types';
import { isRepassBlocked } from '../../lib/pricing';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { formatCurrency, cn } from '../../lib/utils';
import { RemoveFromBatchModal, RemoveFromBatchMode } from './RemoveFromBatchModal';

interface Props {
  batch: BillingBatch | null;
  appointments: Appointment[];
  customers: Customer[];
  psychologists: Psychologist[];
  getAppPrice: (app: Appointment) => number;
  onUpdatePrice?: (appointmentId: string, newPrice: number) => Promise<void>;
  onMarkPaid?: (appointmentId: string) => Promise<void>;
  onUnmarkPaid?: (appointmentId: string) => Promise<void>;
  onRemoveFromBatch?: (batch: BillingBatch, appointmentId: string, mode?: RemoveFromBatchMode, reason?: string) => Promise<void>;
  onAddToBatch?: (batch: BillingBatch, appointmentId: string) => Promise<void>;
  getAvailableToAdd?: (batch: BillingBatch) => Appointment[];
  onClose: () => void;
  onExport: (batch: BillingBatch) => void;
}

export const BatchDetailsModal: React.FC<Props> = ({
  batch,
  appointments,
  customers,
  psychologists,
  getAppPrice,
  onUpdatePrice,
  onMarkPaid,
  onUnmarkPaid,
  onRemoveFromBatch,
  onAddToBatch,
  getAvailableToAdd,
  onClose,
  onExport,
}) => {

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [search, setSearch] = useState('');
  // Busca do bloco "adicionar atendimento ao lote".
  const [addSearch, setAddSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  // Id do atendimento cujo modal "Remover do lote" (remover vs. desconsiderar
  // definitivamente) está aberto. null = nenhum modal aberto.
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);

  const { totalAmount, totalBlocked, totalRepassable } = useMemo(() => {
    if (!batch) return { totalAmount: 0, totalBlocked: 0, totalRepassable: 0 };
    let amount = 0;
    let blocked = 0;
    let repassable = 0;
    batch.appointmentIds.forEach(id => {
      const app = appointments.find(a => a.id === id);
      if (app) {
        const price = getAppPrice(app);
        amount += price;
        if (isRepassBlocked(app)) {
          blocked += price;
        } else {
          repassable += price;
        }
      }
    });
    return { totalAmount: amount, totalBlocked: blocked, totalRepassable: repassable };
  }, [batch, appointments, getAppPrice]);


  // Normaliza texto para busca tolerante a acentos/caixa (ex.: "joao" casa com "João").
  const normalize = (value: string) =>
    value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  // Reseta a busca (e cancela edições) sempre que o modal abre com outro lote,
  // evitando que o texto pesquisado "vaze" de um lote para outro.
  useEffect(() => {
    setSearch('');
    setEditingId(null);
    setEditValue('');
    setAddSearch('');
    setRemoveTargetId(null);
    // Lotes editáveis (enviados / parcialmente pagos) já abrem com a seção de
    // "Adicionar atendimento ao lote" expandida, deixando a edição à mão.
    const editable = batch?.status === BillingBatchStatus.SENT
      || batch?.status === BillingBatchStatus.PARTIALLY_PAID;
    setIsAddOpen(!!editable);
  }, [batch?.id]);



  // Cancela qualquer edição de valor em andamento ao digitar na busca,
  // evitando um input de edição "fantasma" caso o item saia da lista filtrada.
  useEffect(() => {
    setEditingId(null);
    setEditValue('');
  }, [search]);


  const startEdit = (id: string, currentPrice: number) => {

    setEditingId(id);
    setEditValue(String(currentPrice));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const confirmEdit = async (id: string) => {
    const parsed = parseFloat(editValue.replace(',', '.'));
    if (isNaN(parsed) || parsed < 0) { cancelEdit(); return; }
    if (onUpdatePrice) await onUpdatePrice(id, parsed);
    setEditingId(null);
    setEditValue('');
  };

  return (
    <Modal
      isOpen={!!batch}
      onClose={onClose}
      title={`Detalhes do Lote #${batch?.batchNumber}`}
      className="max-w-2xl"
    >
      {batch && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-zinc-500 block">Operadora</span>
              <span className="font-medium text-priori-navy">{batch.healthPlan}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Data de Envio</span>
              <span className="font-medium text-priori-navy">
                {format(new Date(batch.sentAt), 'dd/MM/yyyy')}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Status</span>
              <span className="font-medium text-priori-navy">
                {batch.status === BillingBatchStatus.PAID
                  ? 'Pago'
                  : batch.status === BillingBatchStatus.PARTIALLY_PAID
                    ? 'Parcialmente Pago'
                    : 'Enviado'}
              </span>
            </div>

            <div>
              <span className="text-zinc-500 block">Valor Total</span>
              <span className="font-bold text-priori-navy text-base">
                {formatCurrency(totalAmount)}
              </span>
              {totalBlocked > 0 && (
                <div className="mt-1 text-xs space-y-0.5">
                  <span className="text-zinc-400 block">
                    Repassável: <strong className="text-zinc-600 font-medium">{formatCurrency(totalRepassable)}</strong>
                  </span>
                  <span className="text-purple-600 block bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 inline-block font-semibold mt-1">
                    Sem repasse: {formatCurrency(totalBlocked)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {batch.status !== BillingBatchStatus.DRAFT && (() => {
            // Considera apenas atendimentos COBRÁVEIS (valor > 0). Itens de R$0
            // (ex.: 4ª+ sessão neuropsico AMS, cancelamento isento) não aparecem
            // na lista nem têm ação de pagamento, então NÃO podem entrar na
            // contagem de progresso — senão a barra nunca chega a 100%.
            const batchApps = batch.appointmentIds
              .map(id => appointments.find(a => a.id === id))
              .filter((a): a is Appointment => !!a && getAppPrice(a) > 0);
            const total = batchApps.length;
            const resolved = batchApps.filter(a => a.billingStatus === 'paid' || a.billingStatus === 'denied').length;
            const pct = total > 0 ? Math.round((resolved / total) * 100) : 0;

            return (
              <div className="border-t border-zinc-100 pt-4">
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-zinc-500">Progresso de pagamento</span>
                  <span className="font-medium text-priori-navy">{resolved}/{total} atendimentos</span>
                </div>
                <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-priori-gold')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })()}

          <div className="border-t border-zinc-100 pt-4">
            <h4 className="font-semibold text-priori-navy mb-3">Atendimentos no Lote</h4>

            {/* Campo de busca por nome do paciente para localizar e confirmar pagamentos rapidamente. */}
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por nome do paciente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 text-sm pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy"
              />
            </div>

            {(() => {
              const searchTerm = normalize(search);
              const visibleIds = batch.appointmentIds
                // Oculta atendimentos com valor R$0,00 (ex: sessão AMS sem cobrança,
                // cancelamento isento) para não poluir a listagem.
                .filter(id => {
                  const a = appointments.find(app => app.id === id);
                  return a ? getAppPrice(a) > 0 : false;
                })
                // Filtra pelo nome do paciente (tolerante a acentos/caixa).
                .filter(id => {
                  if (!searchTerm) return true;
                  const a = appointments.find(app => app.id === id);
                  const customer = customers.find(c => c.id === a?.customerId);
                  return customer ? normalize(customer.name).includes(searchTerm) : false;
                })
                // Ordena: pendentes de pagamento primeiro; pagos/glosados no final
                // (ordenação estável, mantendo a ordem original dentro de cada grupo).
                .sort((idA, idB) => {
                  const a = appointments.find(app => app.id === idA);
                  const b = appointments.find(app => app.id === idB);
                  const rank = (ap?: Appointment) => (ap?.billingStatus ? 1 : 0);
                  return rank(a) - rank(b);
                });

              if (visibleIds.length === 0) {

                return (
                  <div className="p-8 text-center text-zinc-500 text-sm">
                    {search.trim()
                      ? `Nenhum atendimento encontrado para "${search.trim()}".`
                      : 'Nenhum atendimento com valor a exibir neste lote.'}
                  </div>
                );
              }

              return (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {visibleIds
                .map(id => {

                const app = appointments.find(a => a.id === id);
                const customer = customers.find(c => c.id === app?.customerId);

                const psychologist = psychologists.find(p => p.id === app?.psychologistId);
                const price = app ? getAppPrice(app) : 0;
                const isParticular = customer?.healthPlan === HealthPlan.PARTICULAR;
                const isEditing = editingId === id;
                // Faltas cobradas do convênio mas SEM repasse ao psicólogo (isRepassBlocked):
                const isNoRepassBilled = !!app && Boolean(isRepassBlocked(app)) && price > 0;

                return (
                  <div key={id} className="flex flex-col p-3 bg-zinc-50 rounded-xl text-sm gap-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-priori-navy">{customer?.name}</div>
                        <div className="text-xs text-zinc-500">
                          {psychologist?.name} •{' '}
                          {app ? format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy') : ''}
                        </div>
                        {isNoRepassBilled && (
                          <span
                            title={
                              app?.cancellationFault === 'psychologist'
                                ? 'Falta do psicólogo: cobrada do convênio (autorização consumida), mas SEM repasse ao profissional.'
                                : 'Falta do paciente (Isento): cobrada do convênio (autorização consumida), mas SEM repasse ao profissional.'
                            }
                            className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200 font-semibold"
                          >
                            Faturado, sem repasse
                          </span>
                        )}
                      </div>
                      <div className="text-right flex items-center gap-1.5">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-zinc-400">R$</span>
                            <input
                              type="text"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') confirmEdit(id);
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              autoFocus
                              className="w-20 text-right text-sm font-medium border border-priori-navy/30 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-priori-navy"
                            />
                            <button
                              onClick={() => confirmEdit(id)}
                              className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="Confirmar"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-0.5 text-red-400 hover:bg-red-50 rounded transition-colors"
                              title="Cancelar"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="font-medium text-priori-navy">
                              {formatCurrency(price)}
                            </div>
                            {isParticular && onUpdatePrice && (
                              <button
                                onClick={() => startEdit(id, price)}
                                className="p-0.5 text-zinc-300 hover:text-priori-navy hover:bg-priori-navy/5 rounded transition-colors"
                                title="Corrigir valor deste atendimento"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {!isEditing && app && batch.status !== BillingBatchStatus.DRAFT && (
                      <div className="flex items-center justify-end gap-2">
                        {app.billingStatus && (
                          <span className={cn(
                            'text-[10px] font-bold uppercase tracking-wider',
                            app.billingStatus === 'paid' ? 'text-emerald-600' : 'text-red-500'
                          )}>
                            {app.billingStatus === 'paid' ? 'Pago' : 'Glosa'}
                          </span>
                        )}
                        {app.billingStatus === 'paid' && onUnmarkPaid && (
                          <button
                            onClick={() => onUnmarkPaid(id)}
                            className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                            title="Desfazer pagamento deste atendimento"
                          >
                            <RotateCcw size={12} />
                            Desfazer
                          </button>
                        )}
                        {!app.billingStatus && onMarkPaid && (
                          <button
                            onClick={() => onMarkPaid(id)}
                            className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors border border-emerald-200"
                            title="Marcar este atendimento como pago"
                          >
                            <CircleDollarSign size={13} />
                            Marcar como pago
                          </button>
                        )}
                        {/* Remover do lote: só para atendimentos AINDA NÃO resolvidos
                            (pendentes). Se já pago/glosado, o usuário deve desfazer o
                            pagamento antes — proteção financeira. */}
                        {!app.billingStatus && onRemoveFromBatch && (
                          <button
                            onClick={() => setRemoveTargetId(id)}
                            className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                            title="Remover este atendimento do lote (caso tenha entrado por engano) ou desconsiderá-lo definitivamente"
                          >
                            <Trash2 size={12} />
                            Remover do lote
                          </button>
                        )}
                      </div>
                    )}

                    {app?.billingStatus === 'denied' && (
                      <div className="mt-1 p-2 bg-red-50 rounded-lg border border-red-100 text-xs">
                        <div className="font-semibold text-red-700">Motivo: {app.denialReason}</div>
                        <div className="text-red-600 mt-0.5">
                          Resolução: {app.denialResolution === 'appealed' ? 'Recursada' : 'Aceite'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
              );
            })()}
          </div>

          {/* ─── Adicionar atendimento ao lote (lote enviado, sem repasse) ───── */}
          {batch.status !== BillingBatchStatus.DRAFT && onAddToBatch && getAvailableToAdd && (() => {
            const available = getAvailableToAdd(batch);
            const addTerm = normalize(addSearch);
            const filtered = available.filter(a => {
              if (!addTerm) return true;
              const customer = customers.find(c => c.id === a.customerId);
              return customer ? normalize(customer.name).includes(addTerm) : false;
            });

            return (
              <div className="border-t border-zinc-100 pt-4">
                {!isAddOpen ? (
                  <button
                    onClick={() => setIsAddOpen(true)}
                    className="flex items-center gap-1.5 text-sm font-medium text-priori-navy hover:bg-priori-navy/5 px-3 py-2 rounded-lg transition-colors"
                    title="Incluir um atendimento que ficou de fora deste lote"
                  >
                    <Plus size={15} />
                    Adicionar atendimento ao lote
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-priori-navy">Adicionar atendimento</h4>
                      <button
                        onClick={() => { setIsAddOpen(false); setAddSearch(''); }}
                        className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded transition-colors"
                        title="Fechar"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                      <Lock size={11} />
                      Só é possível editar enquanto o lote não tiver repasse gerado.
                    </p>

                    <div className="relative">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Buscar paciente elegível..."
                        value={addSearch}
                        onChange={e => setAddSearch(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 text-sm pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy"
                      />
                    </div>

                    {filtered.length === 0 ? (
                      <div className="p-6 text-center text-zinc-500 text-sm">
                        {addSearch.trim()
                          ? `Nenhum atendimento elegível para "${addSearch.trim()}".`
                          : `Nenhum atendimento elegível de ${batch.healthPlan} disponível para adicionar.`}
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-2">
                        {filtered.map(a => {
                          const customer = customers.find(c => c.id === a.customerId);
                          const psychologist = psychologists.find(p => p.id === a.psychologistId);
                          return (
                            <div key={a.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl text-sm gap-2">
                              <div>
                                <div className="font-medium text-priori-navy">{customer?.name}</div>
                                <div className="text-xs text-zinc-500">
                                  {psychologist?.name} • {format(new Date(a.date + 'T12:00:00'), 'dd/MM/yyyy')}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-priori-navy">{formatCurrency(getAppPrice(a))}</span>
                                <button
                                  onClick={() => onAddToBatch(batch, a.id)}
                                  className="flex items-center gap-1 text-[11px] font-semibold text-priori-navy hover:bg-priori-navy/10 px-2 py-1 rounded-lg transition-colors border border-priori-navy/20"
                                  title="Adicionar este atendimento ao lote"
                                >
                                  <Plus size={13} />
                                  Adicionar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex justify-between items-center pt-4 border-t border-zinc-100">


            <Button
              variant="outline"
              onClick={() => onExport(batch)}
              className="text-priori-gold border-priori-gold/50"
            >
              <Download size={18} className="mr-2" />
              Exportar Excel
            </Button>
            <Button onClick={onClose} className="bg-priori-navy">
              Fechar
            </Button>
          </div>

          {removeTargetId && (() => {
            const targetApp = appointments.find(a => a.id === removeTargetId);
            if (!targetApp) return null;
            const targetCustomer = customers.find(c => c.id === targetApp.customerId);
            return (
              <RemoveFromBatchModal
                batch={batch}
                appointment={targetApp}
                customer={targetCustomer}
                price={getAppPrice(targetApp)}
                onClose={() => setRemoveTargetId(null)}
                onConfirm={async (mode, reason) => {
                  if (onRemoveFromBatch) await onRemoveFromBatch(batch, removeTargetId, mode, reason);
                }}
              />
            );
          })()}
        </div>
      )}
    </Modal>
  );
};
