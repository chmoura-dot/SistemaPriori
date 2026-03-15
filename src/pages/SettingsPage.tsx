import React, { useState, useEffect } from 'react';
import { Save, Loader2, Link2, MessageSquare, AlertCircle, KeyRound, ShieldCheck } from 'lucide-react';
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

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
      setFormData({
        zapiUrl: data.zapiUrl || '',
        zapiToken: data.zapiToken || ''
      });
    } catch (error) {
      console.error('Erro ao buscar configurações:', error);
    } finally {
      setIsLoading(false);
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
