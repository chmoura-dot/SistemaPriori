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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const user = await api.login(email, password);
    if (user) {
      onNavigate('/dashboard');
    } else {
      setIsLoading(false);
      alert('E-mail ou senha incorretos.');
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

          <div className="space-y-2">
            <p className="text-[10px] text-zinc-400 text-center uppercase tracking-widest font-bold">Acessos de Teste</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-zinc-50 rounded-lg border border-zinc-100 text-[10px]">
                <p className="font-bold text-priori-navy">Admin:</p>
                <p className="text-zinc-500">admin@prioriclinica.com.br</p>
                <p className="text-zinc-500">admin123</p>
              </div>
              <div className="p-2 bg-zinc-50 rounded-lg border border-zinc-100 text-[10px]">
                <p className="font-bold text-priori-navy">Secretaria:</p>
                <p className="text-zinc-500">secretaria@prioriclinica.com.br</p>
                <p className="text-zinc-500">sec123</p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
