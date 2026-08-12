import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  User, 
  ArrowUpDown, 
  RefreshCw,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { useNeuroReportData, NeuroReportItem } from '../hooks/useNeuroReportData';
import { cn } from '../lib/utils';

type SortKey = 'psychologistName' | 'customerName' | 'firstAppointmentDate' | 'lastAppointmentDate' | 'cycleTimeDays' | 'sessionsPerformedCount' | 'patientAbsencesCount' | 'psychologistAbsencesCount';

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export const NeuroReportPage = () => {
  const { reportItems, isLoading, error, refetch } = useNeuroReportData();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortKey>('cycleTimeDays');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Controle de Ordenação
  const handleSort = (field: SortKey) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Filtragem dos dados baseado na busca (nome do paciente ou psicólogo)
  const filteredAndSortedItems = useMemo(() => {
    let result = [...reportItems];

    if (searchTerm.trim() !== '') {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(
        item =>
          item.customerName.toLowerCase().includes(searchLower) ||
          item.psychologistName.toLowerCase().includes(searchLower)
      );
    }

    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal, 'pt-BR') 
          : bVal.localeCompare(aVal, 'pt-BR');
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });

    return result;
  }, [reportItems, searchTerm, sortField, sortDirection]);

  // Ícone indicador de ordenação
  const renderSortIcon = (field: SortKey) => {
    return (
      <ArrowUpDown 
        size={13} 
        className={cn(
          "inline-block ml-1 transition-colors",
          sortField === field ? "text-priori-navy font-bold" : "text-zinc-300 hover:text-zinc-400"
        )} 
      />
    );
  };
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="animate-spin text-priori-navy" size={40} />
        <p className="text-sm text-zinc-500 font-medium">Carregando relatório de gestão...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center max-w-lg mx-auto my-12 flex flex-col items-center gap-4">
        <AlertCircle size={40} className="text-red-500" />
        <div>
          <h3 className="text-lg font-bold text-red-800">Falha ao carregar relatório</h3>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
        <button 
          onClick={refetch}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-4 py-2 rounded-xl transition-all shadow-sm"
        >
          <RefreshCw size={14} />
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-priori-navy tracking-tight flex items-center gap-3">
            <FileText className="text-priori-navy" size={32} />
            Gestão Neuropsicológica
          </h1>
          <p className="text-zinc-500 mt-1">
            Análise automática de ciclos de tratamento e faltas para Avaliações Neuropsicológicas
          </p>
        </div>
        
        <button
          onClick={refetch}
          className="self-start md:self-auto inline-flex items-center gap-2 bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-800 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-zinc-50 transition-all shadow-sm"
          title="Recarregar relatório"
        >
          <RefreshCw size={15} />
          Atualizar Dados
        </button>
      </div>

      {/* Controles de busca e filtros */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm print:hidden">
        <div className="relative flex-1 w-full">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por paciente ou psicólogo..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white border border-zinc-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:ring-2 focus:ring-priori-navy/10 focus:border-priori-navy transition-all"
          />
        </div>
        
        <div className="text-xs text-zinc-400 font-medium sm:ml-auto whitespace-nowrap">
          Exibindo {filteredAndSortedItems.length} de {reportItems.length} registros
        </div>
      </div>

      {/* Tabela de Relatório */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50">
                <th 
                  onClick={() => handleSort('psychologistName')}
                  className="px-6 py-4 text-left text-xs font-bold text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-100/30 transition-colors whitespace-nowrap"
                >
                  Psicólogo {renderSortIcon('psychologistName')}
                </th>
                <th 
                  onClick={() => handleSort('customerName')}
                  className="px-6 py-4 text-left text-xs font-bold text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-100/30 transition-colors whitespace-nowrap"
                >
                  Paciente {renderSortIcon('customerName')}
                </th>
                <th 
                  onClick={() => handleSort('firstAppointmentDate')}
                  className="px-6 py-4 text-left text-xs font-bold text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-100/30 transition-colors whitespace-nowrap"
                >
                  Início do Trat. {renderSortIcon('firstAppointmentDate')}
                </th>
                <th 
                  onClick={() => handleSort('lastAppointmentDate')}
                  className="px-6 py-4 text-left text-xs font-bold text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-100/30 transition-colors whitespace-nowrap"
                >
                  Última Consulta {renderSortIcon('lastAppointmentDate')}
                </th>
                <th 
                  onClick={() => handleSort('cycleTimeDays')}
                  className="px-6 py-4 text-left text-xs font-bold text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-100/30 transition-colors whitespace-nowrap"
                >
                  Tempo de Ciclo {renderSortIcon('cycleTimeDays')}
                </th>
                <th 
                  onClick={() => handleSort('sessionsPerformedCount')}
                  className="px-6 py-4 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-100/30 transition-colors whitespace-nowrap"
                >
                  Sessões {renderSortIcon('sessionsPerformedCount')}
                </th>
                <th 
                  onClick={() => handleSort('patientAbsencesCount')}
                  className="px-6 py-4 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-100/30 transition-colors whitespace-nowrap"
                >
                  Faltas (Pac.) {renderSortIcon('patientAbsencesCount')}
                </th>
                <th 
                  onClick={() => handleSort('psychologistAbsencesCount')}
                  className="px-6 py-4 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-100/30 transition-colors whitespace-nowrap"
                >
                  Faltas (Psi.) {renderSortIcon('psychologistAbsencesCount')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredAndSortedItems.length > 0 ? (
                filteredAndSortedItems.map((item) => (
                  <tr 
                    key={`${item.psychologistId}-${item.customerId}`} 
                    className="hover:bg-zinc-50/40 transition-colors group"
                  >
                    {/* Psicólogo */}
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-zinc-800">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-priori-navy/10 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                          <User size={14} className="text-priori-navy" />
                        </div>
                        <span className="font-semibold">{item.psychologistName}</span>
                      </div>
                    </td>

                    {/* Paciente */}
                    <td className="px-6 py-4 whitespace-nowrap text-zinc-700">
                      <span className="font-medium">{item.customerName}</span>
                    </td>

                    {/* Início Tratamento */}
                    <td className="px-6 py-4 whitespace-nowrap text-zinc-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={13} className="text-zinc-300" />
                        <span>{formatDate(item.firstAppointmentDate)}</span>
                      </div>
                    </td>

                    {/* Última Consulta */}
                    <td className="px-6 py-4 whitespace-nowrap text-zinc-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={13} className="text-zinc-300" />
                        <span>{formatDate(item.lastAppointmentDate)}</span>
                      </div>
                    </td>

                    {/* Tempo de Ciclo */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Clock size={13} className="text-zinc-400" />
                        <span className="font-bold text-zinc-900 bg-zinc-50 px-2.5 py-1 rounded-lg border border-zinc-100">
                          {item.cycleTimeDays} {item.cycleTimeDays === 1 ? 'dia' : 'dias'}
                        </span>
                      </div>
                    </td>

                    {/* Sessões Realizadas */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center justify-center gap-1 min-w-[2.25rem] h-7 px-2.5 rounded-full bg-priori-navy/5 text-priori-navy font-bold text-xs border border-priori-navy/10">
                        <CheckCircle2 size={12} className="text-priori-navy" />
                        {item.sessionsPerformedCount}
                      </span>
                    </td>

                    {/* Faltas do Paciente */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {item.patientAbsencesCount > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-100">
                          <XCircle size={12} className="text-amber-600" />
                          {item.patientAbsencesCount}
                        </span>
                      ) : (
                        <span className="text-zinc-400 font-medium">—</span>
                      )}
                    </td>

                    {/* Faltas do Psicólogo */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {item.psychologistAbsencesCount > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold border border-red-100">
                          <XCircle size={12} className="text-red-500" />
                          {item.psychologistAbsencesCount}
                        </span>
                      ) : (
                        <span className="text-zinc-400 font-medium">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-zinc-400">
                    Nenhum registro de Avaliação Neuropsicológica encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
