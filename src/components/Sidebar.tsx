import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, 
  Users, 
  Package, 
  LogOut, 
  Menu, 
  X,
  Activity,
  Calendar as CalendarIcon,
  BarChart3,
  TrendingDown,
  FileText,
  ArrowRightLeft,
  Blocks,
  ClipboardList,
  KeySquare,
  ListOrdered,
  CalendarOff,
  SearchCheck,
  CalendarSearch,
  User as UserIcon,
  UserCheck,
  ShieldAlert,

} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../services/api';
import { UserRole } from '../services/types';

interface MenuItem {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  path: string;
  adminOnly?: boolean;
}

interface MenuGroup {
  category: string;
  items: MenuItem[];
}

const menuGroups: MenuGroup[] = [
  {
    category: 'Atendimento & Clínico',
    items: [
      { icon: CalendarIcon, label: 'Agenda', path: '/agenda' },
      { icon: Users, label: 'Pacientes', path: '/clientes' },
      { icon: SearchCheck, label: 'Consulta Paciente', path: '/consulta-paciente' },
      { icon: ListOrdered, label: 'Fila de Espera', path: '/fila-espera' },
      { icon: KeySquare, label: 'Senhas AMS / PAE', path: '/senhas-ams' },
      { icon: ClipboardList, label: 'Validações', path: '/pendentes' },
    ]
  },
  {
    category: 'Gestão & Faturamento',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
      { icon: UserCheck, label: 'Gestão de Carteira', path: '/carteira', adminOnly: true },
      { icon: FileText, label: 'Faturamento', path: '/faturamento' },
      { icon: ArrowRightLeft, label: 'Repasse', path: '/repasse' },
      { icon: CalendarSearch, label: 'Previsão Atendimentos', path: '/previsao' },
      { icon: FileText, label: 'Gestão Neuropsicológica', path: '/relatorio-neuro', adminOnly: true },
      { icon: BarChart3, label: 'Capacidade', path: '/capacidade' },
      { icon: FileText, label: 'NFS-e', path: '/nfse' },
      { icon: ShieldAlert, label: 'Auditoria Financeira', path: '/auditoria', adminOnly: true },

    ]
  },
  {
    category: 'Financeiro & Equipe',
    items: [
      { icon: BarChart3, label: 'Financeiro', path: '/financeiro' },
      { icon: TrendingDown, label: 'Despesas', path: '/despesas' },
      { icon: Package, label: 'Planos', path: '/planos' },
      { icon: Users, label: 'Psicólogos', path: '/psicologos' },
    ]
  },
  {
    category: 'Configurações',
    items: [
      { icon: CalendarOff, label: 'Feriados', path: '/feriados' },
      { icon: Blocks, label: 'Integrações', path: '/settings', adminOnly: true },
    ]
  }
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
      } catch (err) {
        console.warn('[Sidebar] Falha ao carregar contagem de renovações:', err);
      }
    };
    // Diferir a primeira chamada em 6s para não competir com a renderização da página principal
    const startupDelay = setTimeout(loadRenewalCount, 6_000);
    const interval = setInterval(loadRenewalCount, 5 * 60 * 1000);

    // Escuta evento customizado para refresh imediato após ação na Agenda
    const handleRenewalUpdated = () => loadRenewalCount();
    window.addEventListener('renewal-updated', handleRenewalUpdated);

    return () => {
      clearTimeout(startupDelay);
      clearInterval(interval);
      window.removeEventListener('renewal-updated', handleRenewalUpdated);
    };
  }, []);

  const handleLogout = () => {
    api.logout();
    onNavigate('/login');
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden print:hidden flex items-center justify-between bg-priori-navy border-b border-priori-navy px-4 py-4 fixed top-0 w-full z-40">
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
        "fixed top-0 left-0 h-full w-64 bg-priori-navy z-50 transition-transform lg:translate-x-0 flex flex-col print:hidden shadow-xl",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Header / Brand */}
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-md p-2 flex-shrink-0">
            <Activity size={24} className="text-priori-navy" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white tracking-tight leading-tight">Núcleo Priori</h1>
            <p className="text-[10px] text-priori-gold uppercase tracking-[0.2em] font-bold">Gestão Clínica</p>
          </div>
        </div>

        {/* Navigation Categories */}
        <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto custom-scrollbar">
          {menuGroups.map((group, groupIdx) => {
            const visibleItems = group.items.filter(item => !item.adminOnly || user?.role === UserRole.ADMIN);
            if (visibleItems.length === 0) return null;

            return (
              <div key={groupIdx} className="space-y-1">
                <p className="px-3 text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">
                  {group.category}
                </p>
                {visibleItems.map((item, index) => {
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
                        "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 relative group",
                        isActive
                          ? "bg-priori-gold text-priori-navy shadow-md shadow-priori-gold/20 scale-[1.01]" 
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <item.icon size={17} className={cn(
                        "transition-colors flex-shrink-0",
                        isActive ? "text-priori-navy" : "text-white/50 group-hover:text-white"
                      )} />
                      <span className="truncate">{item.label}</span>
                      {isAgenda && renewalCount > 0 && (
                        <span
                          title={`${renewalCount} agendamento${renewalCount > 1 ? 's' : ''} precisam de renovação nos próximos 7 dias`}
                          className={cn(
                            "ml-auto flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[9px] font-bold cursor-help",
                            isActive ? "bg-priori-navy text-white" : "bg-rose-500 text-white animate-pulse"
                          )}
                        >
                          {renewalCount > 9 ? '9+' : renewalCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* User profile & Logout footer */}
        <div className="p-3 border-t border-white/10 bg-black/15 space-y-2">
          {user && (
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/5 text-white">
              <div className="w-7 h-7 rounded-lg bg-priori-gold/20 flex items-center justify-center text-priori-gold flex-shrink-0">
                <UserIcon size={14} />
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-white/90 truncate">{user.email}</p>
                <p className="text-[9px] text-priori-gold font-bold uppercase tracking-wider">
                  {user.role === UserRole.ADMIN ? 'Administrador' : 'Profissional'}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 transition-all duration-200"
          >
            <LogOut size={15} />
            Encerrar Sessão
          </button>
        </div>
      </aside>
    </>
  );
};
