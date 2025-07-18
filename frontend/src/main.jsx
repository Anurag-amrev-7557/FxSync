import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import AppWithQueryProvider from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppWithQueryProvider />
  </StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/public/service-worker.js')
      .then(reg => {
        console.log('Service worker registered:', reg);
      })
      .catch(err => {
        console.error('Service worker registration failed:', err);
      });
  });
}
