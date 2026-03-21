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
import { RepassePage } from './pages/RepassePage';
import { CapacityPage } from './pages/CapacityPage';
import { SettingsPage } from './pages/SettingsPage';
import { PendingConfirmationsPage } from './pages/PendingConfirmationsPage';
import { AmsPasswordsPage } from './pages/AmsPasswordsPage';
import { RenewalAlert } from './components/RenewalAlert';
import { api } from './services/api';
import { cn } from './lib/utils';
import { UserRole } from './services/types';

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isAuthenticated, setIsAuthenticated] = useState(api.isAuthenticated());

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
      setIsAuthenticated(api.isAuthenticated());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    setIsAuthenticated(api.isAuthenticated());
  };

  // Auth Guard Effect
  useEffect(() => {
    if (!isAuthenticated && currentPath !== '/login' && !currentPath.startsWith('/confirmacao')) {
      navigate('/login');
    }
  }, [isAuthenticated, currentPath]);

  const renderPage = () => {
    const user = api.getCurrentUser();
    const isAdmin = user?.role === UserRole.ADMIN;

    // Rotas Públicas (acessíveis sem login)
    if (currentPath === '/confirmacao') {
      return <MagicConfirmationPage />;
    }

    if (currentPath.startsWith('/confirmacao/')) {
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
        return isAdmin ? <PlansPage /> : <SchedulePage />;
      case '/financeiro':
        return isAdmin ? <FinancialPage key="financeiro-page" /> : <SchedulePage />;
      case '/pagamentos':
        return isAdmin ? <PaymentsPage /> : <SchedulePage />;
      case '/faturamento':
        return isAdmin ? <BillingPage /> : <SchedulePage />;
      case '/repasse':
        return isAdmin ? <RepassePage /> : <SchedulePage />;
      case '/despesas':
        return isAdmin ? <ExpensesPage /> : <SchedulePage />;
      case '/psicologos':
        return <PsychologistsPage />;
      case '/fila-espera':
        return <WaitingListPage />;
      case '/settings':
        return isAdmin ? <SettingsPage /> : <SchedulePage />;
      case '/pendentes':
        return <PendingConfirmationsPage />;
      case '/senhas-ams':
        return <AmsPasswordsPage />;
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
