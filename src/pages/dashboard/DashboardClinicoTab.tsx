import React from 'react';
import { Activity, Users, UserMinus, BarChart2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '../../lib/utils';
import { getTrendIcon, getTrendText } from './utils';
import { useDashboardData } from '../../hooks/useDashboardData';

type Props = ReturnType<typeof useDashboardData>;

export const DashboardClinicoTab = (props: Props) => {
  const {
    selectedMonthLabel,
    filterMode,
    newPatientsCount,
    newPatientsCountPrev,
    avgSessionsPerPatient,
    noShowApps,
    noShowRate,
    avgTherapyDurationDays,
    returnRate,
    ageProfileData,
    genderProfileData,
    inactivatedThisMonth,
    churnByReason,
    activeCustomersCount,
    retentionRate,
    heatmapData,
    maxHeatmapValue,
  } = props;

  return (
    <div className="space-y-6">

      {/* ── Métricas Clínicas ── */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-teal-50 rounded-xl"><Activity size={18} className="text-teal-500" /></div>
          <div>
            <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Métricas Clínicas</h3>
            <p className="text-[10px] text-zinc-400">Indicadores de saúde terapêutica — {selectedMonthLabel}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">

          {/* Novos Pacientes */}
          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Novos Pacientes</p>
            <p className="text-2xl font-black text-priori-navy">{newPatientsCount}</p>
            <div className="mt-1 flex items-center gap-1">
              {getTrendIcon(newPatientsCount, newPatientsCountPrev)}
              {getTrendText(newPatientsCount, newPatientsCountPrev, { filterMode })}
            </div>
          </div>

          {/* Sessões Médias por Paciente */}
          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Sessões Médias / Paciente</p>
            <p className="text-2xl font-black text-priori-navy">{avgSessionsPerPatient.toFixed(1)}</p>
            <p className="text-[10px] text-zinc-400 mt-1">consultas realizadas</p>
          </div>

          {/* Taxa de No-show */}
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">Taxa de No-show</p>
            <p className="text-2xl font-black text-amber-600">{noShowRate.toFixed(1)}%</p>
            <p className="text-[10px] text-zinc-400 mt-1">
              {noShowApps.length} {noShowApps.length === 1 ? 'ausência' : 'ausências'} sem aviso
            </p>
          </div>

          {/* Tempo Médio em Terapia */}
          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Tempo Médio em Terapia</p>
            {avgTherapyDurationDays > 0 ? (
              <>
                <p className="text-2xl font-black text-priori-navy">
                  {avgTherapyDurationDays >= 30
                    ? `${(avgTherapyDurationDays / 30).toFixed(0)}m`
                    : `${Math.round(avgTherapyDurationDays)}d`}
                </p>
                <p className="text-[10px] text-zinc-400 mt-1">{Math.round(avgTherapyDurationDays)} dias (média)</p>
              </>
            ) : (
              <p className="text-sm text-zinc-400 mt-2">Sem dados</p>
            )}
          </div>

          {/* Taxa de Retorno */}
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">Taxa de Retorno</p>
            <p className="text-2xl font-black text-emerald-600">{returnRate.toFixed(1)}%</p>
            <p className="text-[10px] text-zinc-400 mt-1">voltaram após 1ª sessão</p>
          </div>
        </div>

        <p className="text-[10px] text-zinc-400 mt-4 text-center">
          * No-show = consultas passadas não canceladas e não confirmadas pelo psicólogo.
          Taxa de Retorno calculada sobre o histórico completo.
        </p>
      </div>

      {/* ── Perfil Demográfico ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Perfil de Idade */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-blue-50 rounded-xl"><Users size={18} className="text-blue-500" /></div>
            <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Perfil de Idade</h3>
          </div>
          {ageProfileData.totalComIdade > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="h-[200px] w-full sm:w-[200px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={ageProfileData.data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                      {ageProfileData.data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: any) => {
                        const num = Number(value);
                        return [`${num} paciente${num !== 1 ? 's' : ''} (${((num / ageProfileData.totalComIdade) * 100).toFixed(1)}%)`, ''];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-3 w-full">
                {ageProfileData.data.map(item => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-bold text-priori-navy">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-priori-navy">{item.value}</span>
                      <span className="text-[10px] text-zinc-400 ml-2">{((item.value / ageProfileData.totalComIdade) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
                {ageProfileData.semIdade > 0 && (
                  <div className="pt-3 mt-3 border-t border-zinc-100">
                    <p className="text-[10px] text-zinc-400 text-center">
                      * {ageProfileData.semIdade} paciente{ageProfileData.semIdade !== 1 ? 's' : ''} sem data de nascimento cadastrada.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-zinc-400">
              <Users size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum paciente com data de nascimento preenchida.</p>
            </div>
          )}
        </div>

        {/* Perfil de Gênero */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-pink-50 rounded-xl"><Users size={18} className="text-pink-500" /></div>
            <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Perfil de Gênero</h3>
          </div>
          {genderProfileData.totalIdentificado > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="h-[200px] w-full sm:w-[200px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={genderProfileData.data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                      {genderProfileData.data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: any) => {
                        const num = Number(value);
                        return [`${num} paciente${num !== 1 ? 's' : ''} (${((num / genderProfileData.totalIdentificado) * 100).toFixed(1)}%)`, ''];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-3 w-full">
                {genderProfileData.data.map(item => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-bold text-priori-navy">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-priori-navy">{item.value}</span>
                      <span className="text-[10px] text-zinc-400 ml-2">{((item.value / genderProfileData.totalIdentificado) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
                {genderProfileData.naoIdentificado > 0 && (
                  <div className="pt-3 mt-3 border-t border-zinc-100">
                    <p className="text-[10px] text-zinc-400 text-center">
                      * {genderProfileData.naoIdentificado} paciente{genderProfileData.naoIdentificado !== 1 ? 's' : ''} sem gênero preenchido no cadastro.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-zinc-400">
              <Users size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum paciente com gênero preenchido no cadastro.</p>
              <p className="text-xs mt-1">Acesse Pacientes e preencha o campo Gênero.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Churn / Retenção ── */}
      {inactivatedThisMonth.length > 0 && (
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 bg-red-50 rounded-xl"><UserMinus size={18} className="text-red-500" /></div>
            <div>
              <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Churn — Pacientes Inativados</h3>
              <p className="text-[10px] text-zinc-400">{selectedMonthLabel}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="p-4 bg-red-50 rounded-xl text-center">
              <p className="text-2xl font-black text-red-500">{inactivatedThisMonth.length}</p>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Inativados</p>
            </div>
            <div className="p-4 bg-emerald-50 rounded-xl text-center">
              <p className="text-2xl font-black text-emerald-600">{activeCustomersCount}</p>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Ativos</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-xl text-center">
              <p className="text-2xl font-black text-purple-600">{retentionRate.toFixed(1)}%</p>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Retenção</p>
            </div>
          </div>
          {churnByReason.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Motivos de Inativação</p>
              {churnByReason.map(r => (
                <div key={r.reason} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                  <span className="text-sm text-zinc-600">{r.reason}</span>
                  <span className="text-sm font-bold text-red-500">{r.count} paciente{r.count > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Heatmap de Horários ── */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-priori-navy/10 rounded-xl"><BarChart2 size={18} className="text-priori-navy" /></div>
          <div>
            <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Mapa de Calor — Horários Mais Ocupados</h3>
            <p className="text-[10px] text-zinc-400">{selectedMonthLabel}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs mt-4">
            <thead>
              <tr>
                <th className="text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest pb-3 pr-4 w-16">Hora</th>
                {heatmapData.dayNames.map(d => (
                  <th key={d} className="text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest pb-3 px-1">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapData.hours.map(hour => (
                <tr key={hour}>
                  <td className="text-[10px] font-bold text-zinc-400 pr-4 py-1">{hour}</td>
                  {heatmapData.dayNames.map(day => {
                    const value     = heatmapData.grid[hour]?.[day] || 0;
                    const intensity = value / maxHeatmapValue;
                    const bg        = intensity === 0 ? 'bg-zinc-50' : intensity < 0.33 ? 'bg-priori-navy/10' : intensity < 0.66 ? 'bg-priori-navy/30' : 'bg-priori-navy/70';
                    const textColor = intensity >= 0.66 ? 'text-white' : 'text-priori-navy';
                    return (
                      <td key={day} className="px-1 py-1">
                        <div className={cn('w-full h-8 rounded-lg flex items-center justify-center font-bold transition-all', bg, textColor)}>
                          {value > 0 ? value : ''}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-3 mt-4 justify-end">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Intensidade:</span>
            {[
              { label: 'Vazio', bg: 'bg-zinc-50 border border-zinc-200' },
              { label: 'Baixo', bg: 'bg-priori-navy/10' },
              { label: 'Médio', bg: 'bg-priori-navy/30' },
              { label: 'Alto',  bg: 'bg-priori-navy/70' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1">
                <div className={cn('w-4 h-4 rounded', l.bg)} />
                <span className="text-[10px] text-zinc-400">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
