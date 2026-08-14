import React, { useState, useEffect } from 'react';
import { Save, Loader2, Link2, MessageSquare, AlertCircle, KeyRound, ShieldCheck, Play, RefreshCw, CheckCircle, Check, Mail } from 'lucide-react';
import { api } from '../services/api';
import { Settings } from '../services/types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';

export const SettingsPage = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    zapiUrl: '',
    zapiToken: ''
  });
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [failures, setFailures] = useState<any[]>([]);
  const [isTriggering, setIsTriggering] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadFailures = async () => {
    try {
      const data = await api.getOperationFailures();
      setFailures(data || []);
    } catch (error) {
      console.error('Erro ao buscar logs de falhas:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
      setFormData({
        zapiUrl: data.zapiUrl || '',
        zapiToken: data.zapiToken || ''
      });
      await loadFailures();
    } catch (error) {
      console.error('Erro ao buscar configurações:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTrigger = async (type: 'whatsapp' | 'agenda' | 'summary') => {
    setIsTriggering(prev => ({ ...prev, [type]: true }));
    try {
      let result;
      if (type === 'whatsapp') {
        result = await api.triggerWhatsappReminders();
      } else if (type === 'agenda') {
        result = await api.triggerDailyAgendaEmails();
      } else {
        result = await api.triggerClinicDailySummary();
      }
      
      console.log('Resultado do disparo:', result);
      
      const failuresCount = result?.processed?.filter((r: any) => r.status === 'error' || r.status === 'fetch_error' || r.status === 'mail_error')?.length || 0;
      const successCount = result?.processed?.filter((r: any) => r.status === 'sent')?.length || 0;
      
      if (failuresCount > 0) {
        alert(`Disparo concluído com falhas: ${successCount} enviados, ${failuresCount} falharam. Verifique o painel de diagnósticos abaixo.`);
      } else {
        alert('Disparo executado com sucesso!');
      }
      
      await loadFailures();
    } catch (error: any) {
      alert(`Falha ao acionar a rotina: ${error.message}`);
    } finally {
      setIsTriggering(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleAckFailure = async (id: string) => {
    try {
      await api.acknowledgeOperationFailure(id);
      await loadFailures();
    } catch (error: any) {
      alert(`Erro ao marcar como resolvido: ${error.message}`);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await api.updateSettings(settings.id, formData);
      alert('Configurações salvas com sucesso!');
    } catch (error) {
      alert('Erro ao salvar as configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.newPassword) {
      alert('Por favor, digite a nova senha.');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('As senhas não coincidem.');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await api.updatePassword(passwordData.newPassword);
      alert('Senha alterada com sucesso!');
      setPasswordData({ newPassword: '', confirmPassword: '' });
    } catch (error) {
      alert('Erro ao alterar a senha. Tente novamente.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader2 className="w-8 h-8 animate-spin text-priori-navy" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-priori-navy">Integrações</h1>
        <p className="text-zinc-500 mt-1">Configure serviços externos conectados ao Sistema Priori</p>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm">
        <div className="flex items-start gap-4 mb-6 pb-6 border-b border-zinc-100">
          <div className="p-3 bg-[#25D366]/10 rounded-xl text-[#25D366]">
            <MessageSquare size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-priori-navy">WhatsApp (Z-API / Evolution)</h2>
            <p className="text-zinc-600 text-sm mt-1">
              Preencha os dados da sua API não-oficial de WhatsApp para ativar o disparo automático de lembretes.
              Quando ativo, o sistema enviará uma mensagem de confirmação de consulta para o paciente exatamente <strong>12 horas antes</strong> do agendamento.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-priori-navy mb-1" htmlFor="zapi_url">URL da Instância</label>
            <Input
              id="zapi_url"
              placeholder="Ex: https://api.z-api.io/instances/SUA_INSTANCIA/token/SEU_TOKEN"
              value={formData.zapiUrl}
              onChange={(e) => setFormData({ ...formData, zapiUrl: e.target.value })}
            />
            <p className="text-xs text-zinc-400 mt-1">O link base fornecido pela plataforma de envio.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-priori-navy mb-1" htmlFor="zapi_token">Client-Token de Segurança (Opcional)</label>
            <Input
              id="zapi_token"
              type="password"
              placeholder="Caso sua plataforma exija um token no cabeçalho"
              value={formData.zapiToken}
              onChange={(e) => setFormData({ ...formData, zapiToken: e.target.value })}
            />
          </div>

          {!formData.zapiUrl && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-4 rounded-xl text-sm border border-amber-100">
              <AlertCircle size={18} />
              <span>O robô de lembretes automáticos está <strong>inativo</strong> no momento. Preencha a URL para ativá-lo.</span>
            </div>
          )}

          <div className="pt-4 flex justify-end">
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              className="bg-priori-navy hover:bg-priori-navy/90"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin mr-2" /> : <Save size={18} className="mr-2" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Seção de Diagnóstico e Reenvio Manual */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm">
        <div className="flex items-start gap-4 mb-6 pb-6 border-b border-zinc-100">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-600">
            <RefreshCw size={24} className={Object.values(isTriggering).some(Boolean) ? "animate-spin" : ""} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-priori-navy">Rotinas Diárias e Envio Manual</h2>
            <p className="text-zinc-600 text-sm mt-1">
              Monitore a execução automática das rotinas e execute-as manualmente em caso de emergência ou falha externa.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Ações de Disparo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-zinc-100 rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-zinc-800 font-bold text-sm">
                  <MessageSquare size={16} className="text-[#25D366]" />
                  <span>Lembretes de WhatsApp</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Envia lembretes diários para pacientes via WhatsApp (Z-API). Cron padrão: 06h BRT.
                </p>
              </div>
              <Button
                onClick={() => handleTrigger('whatsapp')}
                disabled={isTriggering['whatsapp']}
                className="w-full text-xs py-2 bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
              >
                {isTriggering['whatsapp'] ? <Loader2 size={14} className="animate-spin mr-1" /> : <Play size={14} className="mr-1" />}
                Disparar WhatsApps
              </Button>
            </div>

            <div className="border border-zinc-100 rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-zinc-800 font-bold text-sm">
                  <Mail size={16} className="text-blue-500" />
                  <span>Agenda de Psicólogos</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Envia a agenda do dia por e-mail para cada psicólogo com atendimentos ativos. Cron padrão: 06h BRT.
                </p>
              </div>
              <Button
                onClick={() => handleTrigger('agenda')}
                disabled={isTriggering['agenda']}
                className="w-full text-xs py-2 bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
              >
                {isTriggering['agenda'] ? <Loader2 size={14} className="animate-spin mr-1" /> : <Play size={14} className="mr-1" />}
                Disparar Agendas (Email)
              </Button>
            </div>

            <div className="border border-zinc-100 rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-zinc-800 font-bold text-sm">
                  <Mail size={16} className="text-purple-500" />
                  <span>Resumo da Clínica</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Envia o resumo geral de agendamentos e salas do dia para a coordenação. Cron padrão: 07h BRT.
                </p>
              </div>
              <Button
                onClick={() => handleTrigger('summary')}
                disabled={isTriggering['summary']}
                className="w-full text-xs py-2 bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
              >
                {isTriggering['summary'] ? <Loader2 size={14} className="animate-spin mr-1" /> : <Play size={14} className="mr-1" />}
                Disparar Resumo Geral
              </Button>
            </div>
          </div>

          {/* Histórico de Falhas */}
          <div className="border-t border-zinc-100 pt-6" id="diagnostics-panel">
            <h3 className="font-bold text-sm text-priori-navy mb-3 flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-500" />
              <span>Painel de Diagnóstico de Falhas Recentes</span>
            </h3>

            {failures.length === 0 ? (
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-4 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-500" />
                <span>Excelente! Nenhuma falha recente foi registrada no monitor de execução.</span>
              </div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {failures.map((f) => (
                  <div key={f.id} className={`p-3.5 rounded-xl border text-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-3 ${f.acknowledged ? 'bg-zinc-50/50 border-zinc-100 text-zinc-500' : 'bg-red-50/40 border-red-100 text-zinc-800'}`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${f.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {f.severity.toUpperCase()}
                        </span>
                        <strong className="text-priori-navy font-bold">{f.context}</strong>
                        <span className="text-[10px] text-zinc-400">
                          {new Date(f.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-xs">{f.message}</p>
                      {f.details && (
                        <details className="mt-1">
                          <summary className="text-[10px] text-zinc-400 cursor-pointer hover:underline">Ver detalhes técnicos</summary>
                          <pre className="mt-1 p-2 bg-zinc-900 text-zinc-100 rounded text-[10px] overflow-x-auto max-w-full">
                            {JSON.stringify(f.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                    {!f.acknowledged && (
                      <Button
                        onClick={() => handleAckFailure(f.id)}
                        className="text-[10px] py-1 px-2.5 bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 font-medium"
                      >
                        <Check size={12} className="mr-1" /> Marcar como Resolvido
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Seção de Segurança / Senha */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm mb-12">
        <div className="flex items-start gap-4 mb-6 pb-6 border-b border-zinc-100">
          <div className="p-3 bg-priori-navy/10 rounded-xl text-priori-navy">
            <KeyRound size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-priori-navy">Segurança da Conta</h2>
            <p className="text-zinc-600 text-sm mt-1">
              Atualize sua senha de acesso ao sistema. Escolha uma senha forte para manter seus dados seguros.
            </p>
          </div>
        </div>

        <div className="max-w-md space-y-4">
          <div>
            <label className="block text-sm font-medium text-priori-navy mb-1" htmlFor="new_password">Nova Senha</label>
            <Input
              id="new_password"
              type="password"
              placeholder="Digite a nova senha"
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-priori-navy mb-1" htmlFor="confirm_password">Confirmar Nova Senha</label>
            <Input
              id="confirm_password"
              type="password"
              placeholder="Confirme a nova senha"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
            />
          </div>

          <div className="pt-2 flex justify-start">
            <Button 
              onClick={handleChangePassword} 
              disabled={isUpdatingPassword}
              className="bg-priori-navy hover:bg-priori-navy/90"
            >
              {isUpdatingPassword ? <Loader2 size={18} className="animate-spin mr-2" /> : <ShieldCheck size={18} className="mr-2" />}
              Atualizar Senha
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
