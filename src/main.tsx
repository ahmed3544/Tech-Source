import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as AppModule from './App.tsx';
import './index.css';
import './contrast-fixes.css';

// TechSource uses light mode only. Clear any legacy dark-theme state from older sessions.
try {
  document.documentElement.classList.remove('dark');
  localStorage.removeItem('tech-source-theme');
} catch {}

const App = (AppModule as any).default ?? (AppModule as any).App;

if (!App) {
  throw new Error('App component export is missing');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
