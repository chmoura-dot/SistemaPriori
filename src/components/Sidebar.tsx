import React, { useState } from 'react';
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
  FileText,
  ArrowRightLeft,
  Blocks,
  ClipboardList
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../services/api';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: CalendarIcon, label: 'Agenda', path: '/agenda' },
  { icon: ClipboardList, label: 'Pendentes', path: '/pendentes' },
  { icon: Users, label: 'Pacientes', path: '/clientes' },
  { icon: Package, label: 'Planos', path: '/planos' },
  { icon: BarChart3, label: 'Financeiro', path: '/financeiro' },
  { icon: CreditCard, label: 'Pagamentos', path: '/pagamentos' },
  { icon: FileText, label: 'Faturamento', path: '/faturamento' },
  { icon: ArrowRightLeft, label: 'Repasse', path: '/repasse' },
  { icon: BarChart3, label: 'Capacidade', path: '/capacidade' },
  { icon: TrendingDown, label: 'Despesas', path: '/despesas' },
  { icon: Users, label: 'Psicólogos', path: '/psicologos' },
  { icon: Blocks, label: 'Integrações', path: '/settings' },
];

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Sidebar = ({ currentPath, onNavigate }: SidebarProps) => {
  const [isOpen, setIsOpen] = useState(false);

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
        <div className="p-8 flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center shadow-2xl shadow-black/20 p-4">
            <Activity size={40} className="text-priori-navy" />
          </div>
          <div className="text-center">
            <h1 className="font-bold text-xl text-white tracking-tight">Núcleo Priori</h1>
            <p className="text-[10px] text-white/60 uppercase tracking-[0.2em] mt-1 font-bold">Neuropsicologia</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto custom-scrollbar">
          {menuItems.map((item, index) => (
            <button
              key={`${item.path}-${index}`}
              onClick={() => {
                onNavigate(item.path);
                setIsOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-300",
                currentPath === item.path 
                  ? "bg-priori-gold text-priori-navy shadow-lg shadow-priori-gold/30 scale-[1.02]" 
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon size={20} className={cn(
                "transition-colors",
                currentPath === item.path ? "text-priori-navy" : "text-white/40"
              )} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5 space-y-2 bg-black/10">
          <button 
            onClick={() => {
              if (confirm('Deseja resetar todos os dados do sistema para os padrões?')) {
                localStorage.clear();
                window.location.reload();
              }
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-all"
          >
            <Trash2 size={14} />
            Resetar Dados
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold text-white/60 hover:bg-red-500/20 hover:text-red-400 transition-all duration-300"
          >
            <LogOut size={20} />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
};
