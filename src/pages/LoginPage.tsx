import React, { useState } from 'react';
import { Activity, Lock, Mail } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { api } from '../services/api';

interface LoginPageProps {
  onNavigate: (path: string) => void;
}

export const LoginPage = ({ onNavigate }: LoginPageProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const user = await api.login(email, password);
    if (user) {
      onNavigate('/dashboard');
    } else {
      setIsLoading(false);
      setError('E-mail ou senha incorretos. Verifique se o usuário foi criado no painel do Supabase.');
    }
  };

  return (
    <div className="min-h-screen bg-priori-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-priori-navy shadow-xl shadow-priori-navy/10 mb-4">
            <Activity size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-priori-navy tracking-tight">Núcleo Priori</h1>
          <p className="text-zinc-500">Neuropsicologia e Psicoterapia</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white border border-zinc-100 p-8 rounded-3xl space-y-6 shadow-xl shadow-priori-navy/5">
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-2xl animate-in fade-in slide-in-from-top-1 duration-300">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <Input
              label="E-mail"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Senha"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full bg-priori-navy hover:bg-priori-navy/90 text-white" size="lg" isLoading={isLoading}>
            Entrar no Sistema
          </Button>


        </form>
      </div>
    </div>
  );
}
