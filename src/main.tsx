import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as AppModule from './App.tsx';
import './index.css';
import './contrast-fixes.css';
import {initTheme} from './utils/theme';

// Apply the saved (or system-preferred) theme before the React tree paints.
// index.html's inline pre-paint script already set the class; this syncs the
// in-memory state and wires the OS-preference listener.
try {
  initTheme();
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
