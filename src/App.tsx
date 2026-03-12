import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersPage } from './pages/CustomersPage';
import { PlansPage } from './pages/PlansPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { FinancialPage } from './pages/FinancialPage';
import { SchedulePage } from './pages/SchedulePage';
import { PsychologistsPage } from './pages/PsychologistsPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { BillingPage } from './pages/BillingPage';
import { api } from './services/api';
import { UserRole } from './services/types';
import { cn } from './lib/utils';

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
    if (!isAuthenticated && currentPath !== '/login') {
      navigate('/login');
    }
  }, [isAuthenticated, currentPath]);

  const renderPage = () => {
    if (!isAuthenticated || currentPath === '/login') {
      return <LoginPage onNavigate={navigate} />;
    }

    const user = api.getCurrentUser();
    const isAdmin = user?.role === UserRole.ADMIN;

    if (currentPath.startsWith('/confirmacao/')) {
      return <ConfirmationPage />;
    }

    switch (currentPath) {
      case '/':
      case '/dashboard':
        return <DashboardPage onNavigate={navigate} />;
      case '/agenda':
        return <SchedulePage />;
      case '/clientes':
        return <CustomersPage />;
      case '/planos':
        return <PlansPage />;
      case '/financeiro':
        return isAdmin ? <FinancialPage key="financeiro-page" /> : <DashboardPage onNavigate={navigate} />;
      case '/pagamentos':
        return <PaymentsPage />;
      case '/faturamento':
        return isAdmin ? <BillingPage /> : <DashboardPage onNavigate={navigate} />;
      case '/despesas':
        return isAdmin ? <ExpensesPage /> : <DashboardPage onNavigate={navigate} />;
      case '/psicologos':
        return <PsychologistsPage />;
      default:
        return <DashboardPage onNavigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-priori-bg text-priori-text flex">
      {isAuthenticated && currentPath !== '/login' && !currentPath.startsWith('/confirmacao/') && (
        <Sidebar currentPath={currentPath} onNavigate={navigate} />
      )}
      
      <main className={cn(
        "flex-1",
        isAuthenticated && currentPath !== '/login' && !currentPath.startsWith('/confirmacao/') ? "lg:pl-64 pt-20 lg:pt-0" : ""
      )}>
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
