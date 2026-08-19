import React, { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Users,
  Brain,
  HeartHandshake,
  Search,
  Filter,
  RefreshCw,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  UserCheck
} from 'lucide-react';
import { api } from '../services/api';
import { PortfolioItem, Psychologist, CustomerStatus, InactivationReason } from '../services/types';
import { cn } from '../lib/utils';

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export const PortfolioPage: React.FC = () => {
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [selectedPsychologistId, setSelectedPsychologistId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [collapsedPsychologists, setCollapsedPsychologists] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [updatingCustomerId, setUpdatingCustomerId] = useState<string | null>(null);

  // Edição rápida de status: permite inativar (concluir/paralisar) um paciente
  // diretamente na carteira, sem navegar até a tela de Pacientes.
  // Persiste via customers.status + customers.inactivation_reason (Supabase)
  // e atualiza a UI de forma otimista, recalculando KPIs e grupos instantaneamente.
  const handleStatusChange = async (customerId: string, newReason: string): Promise<void> => {
    if (!newReason) return;

    const confirmed = window.confirm(
      `Tem certeza que deseja inativar este paciente pelo motivo: "${newReason}"?`
    );
    if (!confirmed) {
      // Força um novo array para resetar o <select> não controlado de volta ao placeholder
      setPortfolio(prev => [...prev]);
      return;
    }

    setUpdatingCustomerId(customerId);
    try {
      await api.updateCustomer(customerId, {
        status: CustomerStatus.INACTIVE,
        inactivationReason: newReason as InactivationReason,
      });
      toast.success('Status do paciente atualizado com sucesso.');
      // Remove o paciente inativado da carteira ativa exibida em tela
      setPortfolio(prev => prev.filter(p => p.customerId !== customerId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao atualizar status do paciente.';
      console.error('[PortfolioPage] Erro ao atualizar status do paciente:', err);
      toast.error(message);
    } finally {
      setUpdatingCustomerId(null);
    }
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [portfolioData, psychData] = await Promise.all([
        api.getPsychologistPortfolio(),
        api.getPsychologists(),
      ]);
      setPortfolio(portfolioData);
      setPsychologists(psychData.filter(p => p.active));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao buscar dados da carteira.';
      console.error('[PortfolioPage] Erro ao carregar carteira:', err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleCollapse = (id: string) => {
    setCollapsedPsychologists(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const filteredPortfolio = useMemo(() => {
    return portfolio.filter(item => {
      const matchesPsych = selectedPsychologistId === 'all' || item.psychologistId === selectedPsychologistId;
      const matchesSearch = !searchTerm || item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            item.psychologistName.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesPsych && matchesSearch;
    });
  }, [portfolio, selectedPsychologistId, searchTerm]);

  const groupedByPsychologist = useMemo(() => {
    const map = new Map<string, {
      psychologistId: string;
      psychologistName: string;
      neuroItems: PortfolioItem[];
      psicoItems: PortfolioItem[];
    }>();

    psychologists.forEach(p => {
      if (selectedPsychologistId === 'all' || selectedPsychologistId === p.id) {
        map.set(p.id, {
          psychologistId: p.id,
          psychologistName: p.name,
          neuroItems: [],
          psicoItems: [],
        });
      }
    });

    filteredPortfolio.forEach(item => {
      let group = map.get(item.psychologistId);
      if (!group) {
        group = {
          psychologistId: item.psychologistId,
          psychologistName: item.psychologistName,
          neuroItems: [],
          psicoItems: [],
        };
        map.set(item.psychologistId, group);
      }

      if (item.modality === 'Neuropsicologia') {
        group.neuroItems.push(item);
      } else {
        group.psicoItems.push(item);
      }
    });

    return Array.from(map.values()).filter(g => {
      if (searchTerm) {
        return g.neuroItems.length > 0 || g.psicoItems.length > 0;
      }
      return true;
    });
  }, [filteredPortfolio, psychologists, selectedPsychologistId, searchTerm]);

  const kpis = useMemo(() => {
    const totalActive = filteredPortfolio.length;
    const totalPsico = filteredPortfolio.filter(i => i.modality === 'Psicoterapia').length;
    const neuroItems = filteredPortfolio.filter(i => i.modality === 'Neuropsicologia');
    const totalNeuro = neuroItems.length;
    const neuroInProgress = neuroItems.filter(i => i.neuroStatus === 'Em andamento').length;
    const neuroFinished = neuroItems.filter(i => i.neuroStatus === 'Finalizado').length;

    return {
      totalActive,
      totalPsico,
      totalNeuro,
      neuroInProgress,
      neuroFinished,
    };
  }, [filteredPortfolio]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <RefreshCw size={28} className="animate-spin text-priori-navy" />
        <p className="text-sm font-medium text-zinc-500">Carregando carteira de pacientes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertCircle className="text-red-500" size={24} />
          <div>
            <h3 className="text-sm font-bold text-red-800">Falha ao carregar carteira</h3>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all shadow-sm"
        >
          <RefreshCw size={13} />
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-priori-navy tracking-tight flex items-center gap-3">
            <Users className="text-priori-navy" size={28} />
            Gestão de Carteira por Psicólogo
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            Visão consolidada e analítica de pacientes ativos por modalidade de atendimento
          </p>
        </div>

        <button
          onClick={loadData}
          className="self-start md:self-auto inline-flex items-center gap-2 bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-800 font-semibold text-xs px-3.5 py-2.5 rounded-xl hover:bg-zinc-50 transition-all shadow-sm"
        >
          <RefreshCw size={14} />
          Atualizar Dados
        </button>
      </div>

      {/* Filtros Superiores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm">
        <div className="relative">
          <Filter size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <select
            value={selectedPsychologistId}
            onChange={(e) => setSelectedPsychologistId(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-priori-navy/20 focus:border-priori-navy transition-all"
          >
            <option value="all">Todos os Psicólogos ({psychologists.length})</option>
            {psychologists.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por paciente ou psicólogo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-priori-navy/20 focus:border-priori-navy transition-all"
          />
        </div>
      </div>

      {/* Contadores (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <UserCheck size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Pacientes Ativos</p>
            <p className="text-2xl font-bold text-priori-navy mt-0.5">{kpis.totalActive}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <HeartHandshake size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Psicoterapia</p>
            <p className="text-2xl font-bold text-emerald-700 mt-0.5">{kpis.totalPsico}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
            <Brain size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Avaliação Neuropsicológica</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-purple-700">{kpis.totalNeuro}</span>
              <span className="text-[11px] font-medium text-zinc-500">
                ({kpis.neuroInProgress} em andamento / {kpis.neuroFinished} fin.)
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* Lista Agrupada por Psicólogo */}
      <div className="space-y-6">
        {groupedByPsychologist.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-zinc-200/80 shadow-sm">
            <Users className="mx-auto text-zinc-300 mb-3" size={40} />
            <p className="text-sm font-semibold text-zinc-600">Nenhum registro encontrado</p>
            <p className="text-xs text-zinc-400 mt-1">Ajuste os filtros de pesquisa para visualizar os dados.</p>
          </div>
        ) : (
          groupedByPsychologist.map(group => {
            const isCollapsed = collapsedPsychologists[group.psychologistId];
            const totalPsychPatients = group.neuroItems.length + group.psicoItems.length;

            return (
              <div
                key={group.psychologistId}
                className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden transition-all"
              >
                {/* Cabeçalho do Card do Psicólogo */}
                <div
                  onClick={() => toggleCollapse(group.psychologistId)}
                  className="px-5 py-4 bg-zinc-50/70 border-b border-zinc-200/80 flex items-center justify-between cursor-pointer hover:bg-zinc-100/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-priori-navy/10 text-priori-navy flex items-center justify-center font-bold text-xs">
                      {group.psychologistName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-priori-navy">{group.psychologistName}</h2>
                      <p className="text-[11px] text-zinc-500">
                        {totalPsychPatients} paciente{totalPsychPatients === 1 ? '' : 's'} ativo{totalPsychPatients === 1 ? '' : 's'} ({group.psicoItems.length} Psicoterapia, {group.neuroItems.length} Neuropsicologia)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button className="text-zinc-400 hover:text-zinc-600 transition-colors p-1">
                      {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                    </button>
                  </div>
                </div>

                {/* Conteúdo com os dois grupos */}
                {!isCollapsed && (
                  <div className="p-5 space-y-6">
                    {/* Grupo 1: Avaliação Neuropsicológica */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Brain size={16} className="text-purple-600" />
                        <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                          Avaliação Neuropsicológica ({group.neuroItems.length})
                        </h3>
                      </div>

                      {group.neuroItems.length === 0 ? (
                        <p className="text-xs text-zinc-400 italic py-2">Nenhum paciente ativo em avaliação neuropsicológica.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-100 text-zinc-400 font-semibold">
                                <th className="py-2.5 px-3">Paciente</th>
                                <th className="py-2.5 px-3">Última Sessão</th>
                                <th className="py-2.5 px-3">Próxima Sessão</th>
                                <th className="py-2.5 px-3">Ciclo (180 dias)</th>
                                <th className="py-2.5 px-3">Status do Ciclo</th>
<th className="py-2.5 px-3 text-right">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {group.neuroItems.map(item => (
                                <tr key={`neuro-${item.customerId}`} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="py-2.5 px-3 font-semibold text-zinc-800">
                                    {item.customerName}
                                  </td>
                                  <td className="py-2.5 px-3 text-zinc-600">
                                    <span className="inline-flex items-center gap-1.5">
                                      <Clock size={12} className="text-zinc-400" />
                                      {formatDate(item.lastSessionDate)}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-zinc-600">
                                    <span className="inline-flex items-center gap-1.5">
                                      <Calendar size={12} className="text-zinc-400" />
                                      {formatDate(item.nextSessionDate)}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {item.cycleDays !== null && item.cycleDays !== undefined ? (
                                      <span
                                        className={cn(
                                          "px-2 py-0.5 rounded text-[11px] font-bold border",
                                          item.cycleDays > 180
                                            ? "bg-red-50 text-red-700 border-red-200"
                                            : "bg-zinc-50 text-zinc-700 border-zinc-200"
                                        )}
                                      >
                                        {item.cycleDays} dias {item.cycleDays > 180 ? '(Excedido)' : ''}
                                      </span>
                                    ) : (
                                      <span className="text-zinc-400">—</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={cn(
                                        "px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1",
                                        item.neuroStatus === 'Em andamento' && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                                        item.neuroStatus === 'Finalizado' && "bg-zinc-100 text-zinc-600 border border-zinc-200",
                                        item.neuroStatus === 'A iniciar' && "bg-blue-50 text-blue-700 border border-blue-200",
                                        item.neuroStatus === 'Cancelado' && "bg-red-50 text-red-700 border border-red-200"
                                      )}
                                    >
                                      {item.neuroStatus || 'Em andamento'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    {updatingCustomerId === item.customerId ? (
                                      <span className="text-[10px] text-zinc-500 inline-flex items-center gap-1 font-medium">
                                        <RefreshCw size={10} className="animate-spin text-priori-navy" />
                                        Inativando...
                                      </span>
                                    ) : (
                                      <select
                                        value=""
                                        onChange={(e) => handleStatusChange(item.customerId, e.target.value)}
                                        className="bg-white border border-zinc-200 hover:border-zinc-300 rounded-lg px-2 py-1 text-[10px] font-semibold text-zinc-600 cursor-pointer outline-none focus:ring-2 focus:ring-priori-navy/20 transition-all shadow-xs"
                                        title="Alterar status / Inativar paciente"
                                      >
                                        <option value="" disabled hidden>Inativar / Finalizar...</option>
                                        {Object.values(InactivationReason).map((r: InactivationReason) => (
                                          <option key={r} value={r}>{r}</option>
                                        ))}
                                      </select>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <hr className="border-zinc-100" />

                    {/* Grupo 2: Psicoterapia */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <HeartHandshake size={16} className="text-emerald-600" />
                        <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                          Psicoterapia ({group.psicoItems.length})
                        </h3>
                      </div>

                      {group.psicoItems.length === 0 ? (
                        <p className="text-xs text-zinc-400 italic py-2">Nenhum paciente ativo em psicoterapia.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-100 text-zinc-400 font-semibold">
                                <th className="py-2.5 px-3">Paciente</th>
                                <th className="py-2.5 px-3">Frequência</th>
                                <th className="py-2.5 px-3">Última Sessão</th>
                                <th className="py-2.5 px-3">Próxima Sessão</th>
                                <th className="py-2.5 px-3">Status</th>
<th className="py-2.5 px-3 text-right">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {group.psicoItems.map(item => (
                                <tr key={`psico-${item.customerId}`} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="py-2.5 px-3 font-semibold text-zinc-800">
                                    {item.customerName}
                                  </td>
                                  <td className="py-2.5 px-3 text-zinc-600">
                                    <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 font-medium text-[11px]">
                                      {item.frequency || 'Semanal'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-zinc-600">
                                    <span className="inline-flex items-center gap-1.5">
                                      <Clock size={12} className="text-zinc-400" />
                                      {formatDate(item.lastSessionDate)}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-zinc-600">
                                    <span className="inline-flex items-center gap-1.5">
                                      <Calendar size={12} className="text-zinc-400" />
                                      {formatDate(item.nextSessionDate)}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                                      <CheckCircle2 size={10} />
                                      Ativo
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    {updatingCustomerId === item.customerId ? (
                                      <span className="text-[10px] text-zinc-500 inline-flex items-center gap-1 font-medium">
                                        <RefreshCw size={10} className="animate-spin text-priori-navy" />
                                        Inativando...
                                      </span>
                                    ) : (
                                      <select
                                        value=""
                                        onChange={(e) => handleStatusChange(item.customerId, e.target.value)}
                                        className="bg-white border border-zinc-200 hover:border-zinc-300 rounded-lg px-2 py-1 text-[10px] font-semibold text-zinc-600 cursor-pointer outline-none focus:ring-2 focus:ring-priori-navy/20 transition-all shadow-xs"
                                        title="Alterar status / Inativar paciente"
                                      >
                                        <option value="" disabled hidden>Inativar / Finalizar...</option>
                                        {Object.values(InactivationReason).map((r: InactivationReason) => (
                                          <option key={r} value={r}>{r}</option>
                                        ))}
                                      </select>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
