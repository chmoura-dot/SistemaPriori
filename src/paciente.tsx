import { createRoot } from 'react-dom/client';
import { ConfirmationPage } from './pages/ConfirmationPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <div className="min-h-screen bg-priori-bg">
    <ConfirmationPage />
  </div>
);
