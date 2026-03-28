import { createRoot } from 'react-dom/client';
import { MagicConfirmationPage } from './pages/MagicConfirmationPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <div className="min-h-screen bg-priori-bg">
    <MagicConfirmationPage />
  </div>
);
