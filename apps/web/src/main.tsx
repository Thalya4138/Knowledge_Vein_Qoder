import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { initTheme, PrefsProvider } from './ui/prefs';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';

// BrowserRouter：Qoder Sites 的 SPA 回退已在 T0-0 探针实测（ADR-0002 已采纳）。
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <PrefsProvider>
          <App />
        </PrefsProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
