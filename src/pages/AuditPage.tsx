import React, { useState } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  RotateCcw,
  Eye,
  ArrowRight,
  User,
  Calendar,
  Layers,
  CheckCircle,
  Clock,
  FileText,
  AlertTriangle,
  RefreshCw,
  Info,
  BadgeAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuditData } from '../hooks/useAuditData';
import { EnrichedAuditLogEntry } from '../services/types';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

export const AuditPage = () => {
  const {
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
    refreshData,
    handleRevert,
  } = useAuditData();

  const [selectedEntry, setSelectedEntry] = useState<EnrichedAuditLogEntry | null>(null);
  const [revertingEntry, setRevertingEntry] = useState<EnrichedAuditLogEntry | null>(null);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [isConfirmRevertOpen, setIsConfirmRevertOpen] = useState(false);

  const openDiffModal = (entry: EnrichedAuditLogEntry) => {
    setSelectedEntry(entry);
    setIsDiffModalOpen(true);
  };

  const openRevertModal = (entry: EnrichedAuditLogEntry) => {
    setRevertingEntry(entry);
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-priori-navy tracking-tight">Auditoria & Rastreabilidade</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-priori-navy/10 text-priori-navy">
              Admin
            </span>
          </div>
          <p className="text-zinc-500 mt-1">
            Histórico completo de alterações em faturamento, lotes e repasses com auditoria de motivos e reversão (Undo).
          </p>
        </div>
        <Button
          onClick={refreshData}
          disabled={isLoading}
          variant="outline"
          className="border-zinc-200 text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw size={16} className={cn(isLoading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {/* Cards de Métricas / KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total de Alterações</span>
            <Layers size={18} className="text-priori-navy" />
          </div>
          <div className="text-2xl font-bold text-priori-navy">{metrics.totalChanges}</div>
          <p className="text-[11px] text-zinc-400 mt-1">Registros financeiros monitorados</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Por Secretaria</span>
            <User size={18} className="text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600">{metrics.secretariaChanges}</div>
          <p className="text-[11px] text-zinc-400 mt-1">Ações executadas pelo perfil secretária</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm border-l-4 border-l-rose-500">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">Remoções de Lote</span>
            <AlertTriangle size={18} className="text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600">{metrics.batchRemovals}</div>
          <p className="text-[11px] text-zinc-400 mt-1">Atendimentos retirados de lotes</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Pagamentos / Baixas</span>
            <CheckCircle size={18} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">{metrics.paymentChanges}</div>
          <p className="text-[11px] text-zinc-400 mt-1">Baixas de faturamento e quitações</p>
        </div>
      </div>

    setIsConfirmRevertOpen(true);
      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por paciente, lote, psicólogo, operador ou motivo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white border border-zinc-200 rounded-xl text-xs sm:text-sm text-zinc-800 focus:ring-2 focus:ring-priori-navy/10 focus:border-priori-navy transition-all outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro de Operador */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700 font-medium outline-none focus:border-priori-navy"
            >
              <option value="ALL">👤 Todos os Operadores</option>
              <option value="secretaria">🟡 Apenas Secretaria</option>
              <option value="admin">🔵 Apenas Administrador</option>
            </select>

            {/* Filtro de Tabela/Módulo */}
            <select
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700 font-medium outline-none focus:border-priori-navy"
            >
              <option value="ALL">📂 Todos os Módulos</option>
              <option value="billing_batches">📦 Lotes de Faturamento</option>
              <option value="appointments">🩺 Atendimentos (Remoções/Pagamentos)</option>
              <option value="repasses">💸 Repasses</option>
            </select>

            {/* Filtro de Ação */}
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700 font-medium outline-none focus:border-priori-navy"
            >
              <option value="ALL">⚡ Todas as Ações</option>
              <option value="UPDATE">✏️ Edição / Atualização</option>
              <option value="INSERT">➕ Criação / Inclusão</option>
              <option value="DELETE">🗑️ Exclusão</option>
      {/* Tabela de Auditoria */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-50/70 border-b border-zinc-100 text-zinc-500 font-bold text-[10px] uppercase tracking-wider">
                <th className="px-4 py-3.5">Data / Hora</th>
                <th className="px-4 py-3.5">Operador</th>
                <th className="px-4 py-3.5">Módulo / Ação</th>
                <th className="px-4 py-3.5">Registro Afetado</th>
                <th className="px-4 py-3.5">Motivo / Detalhes</th>
                <th className="px-4 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-600">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-400">
                    <Info size={28} className="mx-auto mb-2 opacity-40" />
                    Nenhum registro de auditoria encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isSecretaria = log.operatorRole === 'secretaria';
                  const isRemoval = log.actionLabel.includes('Remoção');
                  const isPaid = log.actionLabel.includes('Pago');

                  return (
                    <tr key={log.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-zinc-700">
                          {format(new Date(log.createdAt), 'dd/MM/yyyy')}
                        </div>
                        <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                          <Clock size={10} />
                          {format(new Date(log.createdAt), 'HH:mm:ss')}
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold',
                            isSecretaria
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-priori-navy/10 text-priori-navy border border-priori-navy/20'
                          )}
                        >
                          <User size={10} />
                          {isSecretaria ? 'Secretaria' : 'Admin'}
                        </span>
                        <div className="text-[10px] text-zinc-400 mt-0.5 max-w-[140px] truncate" title={log.userEmail}>
                          {log.userEmail || 'Sistema'}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-priori-navy flex items-center gap-1.5">
                          {isRemoval && <AlertTriangle size={12} className="text-rose-500 flex-shrink-0" />}
                          {isPaid && <CheckCircle size={12} className="text-emerald-500 flex-shrink-0" />}
                          <span>{log.actionLabel}</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 uppercase font-medium">
                          {log.entityLabel} ({log.action})
                        </span>
                      </td>

                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="font-medium text-zinc-800 truncate" title={log.recordDescription}>
                          {log.recordDescription}
                        </div>
                        <div className="text-[9px] font-mono text-zinc-400">ID: {log.recordId.slice(0, 8)}...</div>
                      </td>

            </select>
          </div>
        </div>
                      <td className="px-4 py-3 max-w-[260px]">
                        {log.extractedReason ? (
                          <div className="p-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-700 text-[11px] leading-tight">
                            <span className="font-semibold text-priori-navy">Motivo: </span>
                            {log.extractedReason}
                          </div>
                        ) : log.fieldDiffs.length > 0 ? (
                          <div className="text-[11px] text-zinc-500">
                            {log.fieldDiffs.length} campo(s) modificado(s)
                          </div>
                        ) : (
                          <span className="text-[11px] text-zinc-400 italic">Sem justificativa registrada</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openDiffModal(log)}
                            className="p-1.5 rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-priori-navy transition-colors"
                            title="Visualizar Detalhes e Diff"
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            onClick={() => openRevertModal(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
                            title="Desfazer esta alteração"
                          >
                            <RotateCcw size={12} />
                            Desfazer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
      {/* Modal: Visualizador de Diff */}
      <Modal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        title="Detalhes da Alteração (Diff)"
        className="max-w-2xl"
      >
        {selectedEntry && (
          <div className="space-y-4">
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-bold block">Operador</span>
                <span className="font-semibold text-priori-navy">{selectedEntry.operatorName}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-bold block">Data / Hora</span>
                <span className="font-semibold text-zinc-700">
                  {format(new Date(selectedEntry.createdAt), 'dd/MM/yyyy HH:mm:ss')}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-bold block">Ação</span>
                <span className="font-semibold text-priori-navy">{selectedEntry.actionLabel}</span>
              </div>
            </div>

            {selectedEntry.extractedReason && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                <span className="font-bold">Motivo / Justificativa: </span>
                {selectedEntry.extractedReason}
              </div>
            )}

            {/* Diffs de Campos */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-priori-navy uppercase tracking-wider">Campos Modificados:</h4>
              {selectedEntry.fieldDiffs.length === 0 ? (
                <div className="p-3 text-center text-xs text-zinc-400 bg-zinc-50 rounded-xl border border-zinc-100">
                  Nenhum campo com alteração direta de valor detectado (ex: criação/exclusão).
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedEntry.fieldDiffs.map((diff, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl border border-zinc-200 text-xs space-y-1 bg-white">
                      <div className="font-bold text-priori-navy">{diff.label}</div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2 rounded-lg bg-rose-50 border border-rose-100 text-rose-900 overflow-hidden">
                          <span className="font-bold text-rose-600 block text-[10px] uppercase">Antes:</span>
                          <span className="font-mono break-all">{String(diff.oldValue ?? '—')}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-900 overflow-hidden">
                          <span className="font-bold text-emerald-600 block text-[10px] uppercase">Depois:</span>
                          <span className="font-mono break-all">{String(diff.newValue ?? '—')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detalhes Técnicos JSON */}
            <details className="mt-2 text-xs">
              <summary className="text-[11px] font-semibold text-zinc-500 cursor-pointer hover:text-priori-navy">
                Inspecionar Payload JSON Bruto
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 block mb-1">OLD DATA</span>
                  <pre className="p-2 bg-zinc-900 text-zinc-100 rounded-lg text-[10px] overflow-auto max-h-48">
                    {JSON.stringify(selectedEntry.oldData, null, 2)}
                  </pre>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 block mb-1">NEW DATA</span>
                  <pre className="p-2 bg-zinc-900 text-zinc-100 rounded-lg text-[10px] overflow-auto max-h-48">
                    {JSON.stringify(selectedEntry.newData, null, 2)}
      {/* Modal: Confirmação de Reversão */}
      <Modal
        isOpen={isConfirmRevertOpen}
        onClose={() => setIsConfirmRevertOpen(false)}
        title="Desfazer Alteração Financeira"
        className="max-w-md"
      >
        {revertingEntry && (
          <div className="space-y-4">
            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 text-rose-800 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-900">
                <AlertTriangle size={16} />
                Atenção ao Desfazer (Undo)
              </div>
              <p>
                Você está prestes a reverter a seguinte operação realizada por{' '}
                <strong>{revertingEntry.operatorName}</strong> em{' '}
                {format(new Date(revertingEntry.createdAt), 'dd/MM/yyyy HH:mm')}:
              </p>
              <div className="p-2 bg-white/80 rounded-xl border border-rose-200 font-semibold text-priori-navy">
                {revertingEntry.actionLabel} — {revertingEntry.recordDescription}
              </div>
              <p className="text-[11px] text-rose-700">
                O sistema irá restaurar atomicamente os valores anteriores no banco de dados. Esta ação também será
                registrada na trilha de auditoria.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
              <Button variant="outline" onClick={() => setIsConfirmRevertOpen(false)} disabled={isReverting}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={confirmRevert}
                isLoading={isReverting}
                className="flex items-center gap-1.5"
              >
                <RotateCcw size={14} />
                Confirmar Reversão
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
