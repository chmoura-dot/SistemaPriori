import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Package, 
  LogOut, 
  Menu, 
  X,
  Activity,
  Calendar as CalendarIcon,
  BarChart3,
  Trash2,
  TrendingDown,
  FileText
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../services/api';
import { UserRole } from '../services/types';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Sidebar = ({ currentPath, onNavigate }: SidebarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const user = api.getCurrentUser();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: CalendarIcon, label: 'Agenda', path: '/agenda' },
    { icon: Users, label: 'Clientes', path: '/clientes' },
    { icon: Package, label: 'Planos', path: '/planos' },
    { icon: BarChart3, label: 'Financeiro', path: '/financeiro', adminOnly: true },
    { icon: CreditCard, label: 'Pagamentos', path: '/pagamentos' },
    { icon: FileText, label: 'Faturamento', path: '/faturamento', adminOnly: true },
    { icon: TrendingDown, label: 'Despesas', path: '/despesas', adminOnly: true },
    { icon: Users, label: 'Psicólogos', path: '/psicologos' },
  ].filter(item => !item.adminOnly || user?.role === UserRole.ADMIN);

  const handleLogout = () => {
    api.logout();
    onNavigate('/login');
  };

  return (
    <>
      {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between bg-priori-navy border-b border-priori-navy px-4 py-4 fixed top-0 w-full z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-priori-gold flex items-center justify-center">
            <Activity size={20} className="text-white" />
          </div>
          <span className="font-bold text-white tracking-tight">Núcleo Priori</span>
        </div>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-zinc-300 hover:text-white"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Content */}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-64 bg-priori-navy z-50 transition-transform lg:translate-x-0 flex flex-col",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-priori-gold flex items-center justify-center shadow-lg shadow-priori-gold/20">
            <Activity size={24} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white leading-none">Núcleo Priori</h1>
            <p className="text-[10px] text-zinc-300 uppercase tracking-widest mt-1 font-semibold">Neuropsicologia</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => {
                onNavigate(item.path);
                setIsOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                currentPath === item.path 
                  ? "bg-priori-gold text-white shadow-lg shadow-priori-gold/20" 
                  : "text-zinc-300 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <button 
            onClick={() => {
              if (confirm('Deseja resetar todos os dados do sistema para os padrões (incluindo os novos nomes dos planos)? Isso excluirá seus cadastros atuais.')) {
                localStorage.clear();
                window.location.reload();
              }
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-all"
          >
            <Trash2 size={14} />
            Resetar Dados
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-300 hover:bg-red-500/10 hover:text-red-500 transition-all"
          >
            <LogOut size={20} />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
};
