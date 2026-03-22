import React, { useState } from 'react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { api } from '../services/api';

export const AccountSecurityPage = () => {
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChangePassword = async () => {
    if (!passwordData.newPassword) {
      setError('Por favor, digite a nova senha.');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setIsUpdatingPassword(true);
    setError(null);
    try {
      await api.updatePassword(passwordData.newPassword);
      alert('Senha alterada com sucesso!');
      setPasswordData({ newPassword: '', confirmPassword: '' });
    } catch (error) {
      setError('Erro ao alterar a senha. Tente novamente.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-2xl">
          {error}
        </div>
      )}
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
          {isUpdatingPassword ? 'Atualizando...' : 'Atualizar Senha'}
        </Button>
      </div>
    </div>
  );
};