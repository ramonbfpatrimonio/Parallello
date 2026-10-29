import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

async function iniciar() {
  // Fora do Electron (só durante o desenvolvimento no navegador) usa uma API de demonstração.
  if (!window.api && import.meta.env.DEV) {
    const { criarApiDemo } = await import('./dev/apiDemo.js');
    window.api = criarApiDemo();
  }
  createRoot(document.getElementById('root')).render(<App />);
}
iniciar();
