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
  FileText,
  ArrowRightLeft,
  Blocks,
  ClipboardList,
  KeySquare,
  ListOrdered,
  CalendarOff,
  RefreshCw
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../services/api';
import { UserRole } from '../services/types';

const menuItems = [
  { icon: FileText, label: 'NFS-e', path: '/nfse' }, // Adicionando item para NFS-e
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', adminOnly: true },
  { icon: CalendarIcon, label: 'Agenda', path: '/agenda' },
  { icon: KeySquare, label: 'Senhas AMS / PAE', path: '/senhas-ams' },
  { icon: ClipboardList, label: 'Validações', path: '/pendentes' },
  { icon: Users, label: 'Pacientes', path: '/clientes' },
  { icon: Package, label: 'Planos', path: '/planos' },
  { icon: BarChart3, label: 'Financeiro', path: '/financeiro' },
  { icon: CreditCard, label: 'Pagamentos', path: '/pagamentos' },
  { icon: FileText, label: 'Faturamento', path: '/faturamento' },
  { icon: ArrowRightLeft, label: 'Repasse', path: '/repasse' },
  { icon: BarChart3, label: 'Capacidade', path: '/capacidade', adminOnly: true },
  { icon: TrendingDown, label: 'Despesas', path: '/despesas', adminOnly: true },
  { icon: Users, label: 'Psicólogos', path: '/psicologos' },
  { icon: ListOrdered, label: 'Fila de Espera', path: '/fila-espera' },
  { icon: CalendarOff, label: 'Feriados', path: '/feriados' },
  { icon: Blocks, label: 'Integrações', path: '/settings', adminOnly: true },
];

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Sidebar = ({ currentPath, onNavigate }: SidebarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [renewalCount, setRenewalCount] = useState(0);
  const user = api.getCurrentUser();

  useEffect(() => {
    const loadRenewalCount = async () => {
      if (!api.isAuthenticated()) return;
      try {
        const appointments = await api.getAppointmentsNeedingRenewal();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Conta agendamentos que vencem em até 7 dias
        const count = appointments.filter(app => {
          const due = new Date(app.date + 'T12:00:00');
          due.setHours(0, 0, 0, 0);
          const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return daysUntil <= 7;
        }).length;
        setRenewalCount(count);
      } catch {
        // silencioso
      }
    };
    loadRenewalCount();
    const interval = setInterval(loadRenewalCount, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
          {menuItems.filter((item: any) => !item.adminOnly || user?.role === UserRole.ADMIN).map((item, index) => {
            const isAgenda = item.path === '/agenda';
            const isActive = currentPath === item.path;
            return (
              <button
                key={`${item.path}-${index}`}
                onClick={() => {
                  onNavigate(item.path);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-300 relative",
                  isActive
                    ? "bg-priori-gold text-priori-navy shadow-lg shadow-priori-gold/30 scale-[1.02]" 
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon size={20} className={cn(
                  "transition-colors",
                  isActive ? "text-priori-navy" : "text-white/40"
                )} />
                {item.label}
                {isAgenda && renewalCount > 0 && (
                  <span className={cn(
                    "ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold",
                    isActive ? "bg-priori-navy text-white" : "bg-red-500 text-white"
                  )}>
                    {renewalCount > 9 ? '9+' : renewalCount}
                  </span>
                )}
              </button>
            );
          })}
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
