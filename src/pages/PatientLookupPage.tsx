import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  User,
  Users,
  Calendar,
  ChevronRight,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import type { Customer, Psychologist, Appointment } from '../services/types';

// ── Tipos locais ──────────────────────────────────────────────────────────────

interface PsychologistSummary {
  psychologist: Psychologist;
  appointmentCount: number;
  firstDate: string;
  lastDate: string;
}

// ── Utilitários ──────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

// ── Componente principal ──────────────────────────────────────────────────────

export const PatientLookupPage = () => {
  // ── Estado global ──
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // ── Estado de busca ──
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Estado de seleção ──
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);

  // ── Carga inicial: clientes + psicólogos ──────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [c, p] = await Promise.all([
          api.getCustomers(),
          api.getPsychologists(),
        ]);
        setCustomers(c);
        setPsychologists(p);
      } catch (e: any) {
        setInitError(e?.message ?? 'Erro ao carregar dados.');
      } finally {
        setLoadingInit(false);
      }
    };
    load();
  }, []);

  // ── Fechar dropdown ao clicar fora ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Pacientes filtrados para o dropdown ───────────────────────────────────
  const filteredCustomers = useMemo<Customer[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q || !dropdownOpen) return [];
    return customers
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, customers, dropdownOpen]);

  // ── Selecionar paciente e buscar atendimentos ─────────────────────────────
  const handleSelectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setQuery(customer.name);
    setDropdownOpen(false);
    setAppointments([]);
    setAppsError(null);
    setLoadingApps(true);

    try {
      const data = await api.getAppointmentsByCustomer(customer.id);
      setAppointments(data);
    } catch (e: any) {
      setAppsError(e?.message ?? 'Erro ao carregar atendimentos.');
    } finally {
      setLoadingApps(false);
    }
  };

  // ── Limpar seleção ────────────────────────────────────────────────────────
  const handleClear = () => {
    setQuery('');
    setSelectedCustomer(null);
    setAppointments([]);
    setAppsError(null);
    setDropdownOpen(false);
    inputRef.current?.focus();
  };

  // ── Agrupar atendimentos por psicólogo ────────────────────────────────────
  const summaries = useMemo<PsychologistSummary[]>(() => {
    if (!appointments.length) return [];

    const map = new Map<string, Appointment[]>();
    appointments.forEach((a) => {
      if (!a.psychologistId) return;
      if (!map.has(a.psychologistId)) map.set(a.psychologistId, []);
      map.get(a.psychologistId)!.push(a);
    });

    return Array.from(map.entries())
      .map(([psychologistId, apps]) => {
        const psychologist = psychologists.find((p) => p.id === psychologistId);
        if (!psychologist) return null;
        const sorted = [...apps].sort((a, b) => a.date.localeCompare(b.date));
        return {
          psychologist,
          appointmentCount: apps.length,
          firstDate: sorted[0].date,
          lastDate: sorted[sorted.length - 1].date,
        };
      })
      .filter((s): s is PsychologistSummary => s !== null)
      .sort((a, b) => b.appointmentCount - a.appointmentCount);
  }, [appointments, psychologists]);

  const total = appointments.length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-priori-navy">Consulta de Paciente</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Pesquise um paciente para visualizar quais psicólogos o atenderam e a quantidade de atendimentos de cada um.
        </p>
      </div>

      {/* Erro de inicialização */}
      {initError && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span>{initError}</span>
        </div>
      )}

      {/* Campo de busca */}
      <div className="relative max-w-xl">
        <div className="relative">
          {loadingInit ? (
            <Loader2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 animate-spin" />
          ) : (
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
          )}

          <input
            ref={inputRef}
            type="text"
            value={query}
            disabled={loadingInit}
            placeholder={loadingInit ? 'Carregando pacientes...' : 'Digite o nome do paciente...'}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
              // Se o usuário apagou o texto, limpa a seleção
              if (!e.target.value.trim()) {
                setSelectedCustomer(null);
                setAppointments([]);
                setAppsError(null);
              }
            }}
            onFocus={() => {
              if (query.trim()) setDropdownOpen(true);
            }}
            className="w-full pl-11 pr-10 py-3.5 border border-zinc-200 rounded-2xl text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-priori-navy/20 focus:border-priori-navy
                       disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm"
          />

          {/* Botão de limpar */}
          {query && !loadingInit && (
            <button
              onClick={handleClear}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
              aria-label="Limpar busca"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Dropdown de sugestões */}
        {filteredCustomers.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-20 mt-1.5 w-full bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden"
          >
            {filteredCustomers.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectCustomer(c)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-priori-navy/5 text-left
                           transition-colors border-b border-zinc-50 last:border-0 group"
              >
                <div className="w-8 h-8 rounded-full bg-priori-navy/10 flex items-center justify-center flex-shrink-0">
                  <User size={14} className="text-priori-navy" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-800 truncate">{c.name}</p>
                  <p className="text-xs text-zinc-400 truncate">
                    {c.healthPlan} · {c.status === 'active' ? 'Ativo' : 'Inativo'}
                  </p>
                </div>
                <ChevronRight size={14} className="text-zinc-300 group-hover:text-zinc-500 transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Área de resultados */}
      {selectedCustomer && (
        <div className="space-y-4">
          {/* Card do paciente */}
          <div className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-priori-navy flex items-center justify-center flex-shrink-0">
                <User size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-zinc-800 truncate">{selectedCustomer.name}</h2>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <span className="text-xs bg-zinc-100 text-zinc-600 px-2.5 py-0.5 rounded-full font-medium">
                    {selectedCustomer.healthPlan}
                  </span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                      selectedCustomer.status === 'active'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {selectedCustomer.status === 'active' ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                {loadingApps ? (
                  <Loader2 size={20} className="animate-spin text-zinc-300 ml-auto" />
                ) : (
                  <>
                    <p className="text-3xl font-bold text-priori-navy leading-none">{total}</p>
                    <p className="text-xs text-zinc-400 font-medium mt-1">
                      atendimento{total !== 1 ? 's' : ''} no total
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Erro ao carregar atendimentos */}
          {appsError && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm">
              <AlertCircle size={18} className="flex-shrink-0" />
              <span>{appsError}</span>
            </div>
          )}

          {/* Loading */}
          {loadingApps && (
            <div className="flex items-center justify-center py-16 text-zinc-400 gap-3">
              <Loader2 size={22} className="animate-spin" />
              <span className="text-sm font-medium">Carregando atendimentos...</span>
            </div>
          )}

          {/* Tabela de psicólogos */}
          {!loadingApps && !appsError && summaries.length > 0 && (
            <div className="bg-white border border-zinc-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-50 flex items-center gap-2">
                <Users size={16} className="text-priori-navy" />
                <h3 className="font-semibold text-zinc-800">
                  {summaries.length === 1 ? '1 psicólogo atendeu' : `${summaries.length} psicólogos atenderam`} este paciente
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-50 bg-zinc-50/60">
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-zinc-400 uppercase tracking-wider">
                        Psicólogo
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-zinc-400 uppercase tracking-wider">
                        Código (ID)
                      </th>
                      <th className="px-5 py-3.5 text-center text-xs font-bold text-zinc-400 uppercase tracking-wider">
                        Atendimentos
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-zinc-400 uppercase tracking-wider">
                        Primeiro
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-zinc-400 uppercase tracking-wider">
                        Último
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {summaries.map((s) => (
                      <tr key={s.psychologist.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-priori-navy/10 flex items-center justify-center flex-shrink-0">
                              <User size={14} className="text-priori-navy" />
                            </div>
                            <span className="font-semibold text-zinc-800">{s.psychologist.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <code className="text-xs bg-zinc-100 text-zinc-500 px-2.5 py-1 rounded-lg font-mono tracking-wide">
                            {shortId(s.psychologist.id)}
                          </code>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className="inline-flex items-center justify-center min-w-[2rem] h-7 px-3 rounded-full bg-priori-navy text-white text-xs font-bold">
                            {s.appointmentCount}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-zinc-500">
                            <Calendar size={12} className="text-zinc-300 flex-shrink-0" />
                            <span>{formatDate(s.firstDate)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-zinc-500">
                            <Calendar size={12} className="text-zinc-300 flex-shrink-0" />
                            <span>{formatDate(s.lastDate)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-100 bg-zinc-50/60">
                      <td colSpan={2} className="px-5 py-3.5 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        Total geral
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex items-center justify-center min-w-[2rem] h-7 px-3 rounded-full bg-priori-gold text-priori-navy text-xs font-bold">
                          {total}
                        </span>
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Estado vazio (sem atendimentos) */}
          {!loadingApps && !appsError && summaries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
              <Calendar size={36} className="text-zinc-200" />
              <p className="text-sm font-medium">Nenhum atendimento encontrado para este paciente.</p>
            </div>
          )}
        </div>
      )}

      {/* Estado inicial (nenhum paciente selecionado ainda) */}
      {!selectedCustomer && !loadingInit && !initError && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-300 gap-3">
          <Search size={48} strokeWidth={1.5} />
          <p className="text-base font-medium text-zinc-400">
            Digite o nome de um paciente para iniciar a consulta
          </p>
        </div>
      )}
    </div>
  );
};
