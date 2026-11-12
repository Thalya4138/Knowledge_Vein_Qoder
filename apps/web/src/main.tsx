import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './app.css';

// HashRouter 是 ADR-0002 结论出来之前的临时选择：它在任何静态托管上都能跑深链。
// 探针实测支持回退后换 BrowserRouter，改动只在这一行。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HashRouter>
  </StrictMode>,
);
