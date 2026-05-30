import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary global para capturar erros de renderização
 * em componentes lazy-loaded e prevenir tela branca.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, errorInfo);
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
          <div className="text-red-500 text-5xl mb-2">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-800">
            Ocorreu um erro inesperado
          </h2>
          <p className="text-gray-500 max-w-md">
            A página não pôde ser carregada. Isso pode ser um problema temporário de conexão.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="text-xs text-left bg-red-50 p-3 rounded max-w-lg overflow-auto text-red-700">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            className="mt-4 px-6 py-2 bg-priori-navy text-white rounded-lg hover:bg-priori-navy/90 transition"
          >
            Recarregar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
