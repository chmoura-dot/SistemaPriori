import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersPage } from './pages/CustomersPage';
import { WaitingListPage } from './pages/WaitingListPage';
import { PlansPage } from './pages/PlansPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { FinancialPage } from './pages/FinancialPage';
import { SchedulePage } from './pages/SchedulePage';
import { PsychologistsPage } from './pages/PsychologistsPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { MagicConfirmationPage } from './pages/MagicConfirmationPage';
import { BillingPage } from './pages/BillingPage';
import NfsePage from './pages/NfsePage'; // Corrigindo a importação
import { RepassePage } from './pages/RepassePage';
import { CapacityPage } from './pages/CapacityPage';
import { SettingsPage } from './pages/SettingsPage';
import { AccountSecurityPage } from './pages/AccountSecurityPage';
import { PendingConfirmationsPage } from './pages/PendingConfirmationsPage';
import { AmsPasswordsPage } from './pages/AmsPasswordsPage';
import { HolidaysPage } from './pages/HolidaysPage';
import { RenewalAlert } from './components/RenewalAlert';
import { api } from './services/api';
import { cn } from './lib/utils';
import { UserRole } from './services/types';

export default function App() {
  // Inicialização ultra-robusta: checa Hash e Pathname
  const getInitialPath = () => {
    const hashPath = window.location.hash.replace('#', '');
    if (hashPath && hashPath !== '') return hashPath;
    return window.location.pathname;
  };

  const [currentPath, setCurrentPath] = useState(getInitialPath());
  const [isAuthenticated, setIsAuthenticated] = useState(api.isAuthenticated());

  useEffect(() => {
    const handleRoutechange = () => {
      const path = window.location.hash.replace('#', '') || window.location.pathname;
      setCurrentPath(path);
      setIsAuthenticated(api.isAuthenticated());
    };

    window.addEventListener('hashchange', handleRoutechange);
    window.addEventListener('popstate', handleRoutechange);
    
    return () => {
      window.removeEventListener('hashchange', handleRoutechange);
      window.removeEventListener('popstate', handleRoutechange);
    };
  }, []);

  const navigate = (path: string) => {
    if (path.startsWith('/')) {
      window.history.pushState({}, '', path);
    } else {
      window.location.hash = path;
    }
    setCurrentPath(path);
    setIsAuthenticated(api.isAuthenticated());
  };

  // Auth Guard Effect
  useEffect(() => {
    const isPublicRoute = currentPath === '/login' || currentPath.startsWith('/confirmacao');
    
    if (!isAuthenticated && !isPublicRoute) {
      navigate('/login');
    }
  }, [isAuthenticated, currentPath]);

  const renderPage = () => {
    const user = api.getCurrentUser();
    const isAdmin = user?.role === UserRole.ADMIN;

    // Rotas Públicas (acessíveis sem login)
    if (currentPath.startsWith('/confirmacao')) {
      // Distingue a página do psicólogo (magic link com token) da página do paciente (appointmentId)
      // Verifica tanto query params quanto hash para máxima compatibilidade
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(
        window.location.hash.includes('?') 
          ? window.location.hash.split('?')[1] 
          : window.location.hash.includes('token=') 
            ? window.location.hash.split('token=').map((p, i) => i === 0 ? '' : `token=${p}`).join('') 
            : ''
      );
      const hasPsychologistToken = searchParams.has('token') || hashParams.has('token') || window.location.hash.includes('token=');
      
      if (hasPsychologistToken) {
        return <MagicConfirmationPage />;
      }
      return <ConfirmationPage />;
    }

    if (!isAuthenticated || currentPath === '/login') {
      return <LoginPage onNavigate={navigate} />;
    }

    switch (currentPath) {
      case '/':
      case '/dashboard':
        return isAdmin ? <DashboardPage onNavigate={navigate} /> : <SchedulePage />;
      case '/agenda':
        return <SchedulePage />;
      case '/capacidade':
        return isAdmin ? <CapacityPage /> : <SchedulePage />;
      case '/clientes':
        return <CustomersPage />;
      case '/planos':
        return <PlansPage />;
      case '/financeiro':
        return <FinancialPage key="financeiro-page" />;
      case '/pagamentos':
        return <PaymentsPage />;
      case '/faturamento':
        return <BillingPage />;
      case '/nfse': // Rota para a página de NFS-e
        return <NfsePage />;
      case '/repasse': // Rota para a página de Repasse
        return <RepassePage />;
      case '/despesas':
        return isAdmin ? <ExpensesPage /> : <SchedulePage />;
      case '/psicologos':
        return <PsychologistsPage />;
      case '/fila-espera':
        return <WaitingListPage />;
      case '/settings':
        return isAdmin ? <SettingsPage /> : <AccountSecurityPage />;
      case '/minha-conta':
        return <AccountSecurityPage />;
      case '/pendentes':
        return <PendingConfirmationsPage />;
      case '/senhas-ams':
        return <AmsPasswordsPage />;
      case '/feriados':
        return <HolidaysPage />;
      default:
        return <DashboardPage onNavigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-priori-bg text-priori-text flex overflow-hidden relative">
      {/* Background Blobs */}
      <div className="bg-blob blob-navy w-[600px] h-[600px] -top-48 -left-48 opacity-10"></div>
      <div className="bg-blob blob-gold w-[400px] h-[400px] top-1/2 -right-24 opacity-[0.08]"></div>
      <div className="bg-blob blob-green w-[300px] h-[300px] bottom-0 left-1/4 opacity-[0.05]"></div>
      <div className="bg-blob blob-orange w-[500px] h-[500px] -bottom-24 -right-24 opacity-[0.07]"></div>

      {isAuthenticated && currentPath !== '/login' && !currentPath.startsWith('/confirmacao') && (
        <Sidebar currentPath={currentPath} onNavigate={navigate} />
      )}
      
      <main className={cn(
        "flex-1",
        isAuthenticated && currentPath !== '/login' && !currentPath.startsWith('/confirmacao') ? "lg:pl-64 pt-20 lg:pt-0" : ""
      )}>
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          {renderPage()}
        </div>
      </main>

      {isAuthenticated && <RenewalAlert />}
    </div>
  );
}
