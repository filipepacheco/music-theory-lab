import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { requestPersistentStorage } from '@/services/persistentStorage';
import { registerOfflineWorker } from '@/services/offlineRegistration';

void requestPersistentStorage();
void registerOfflineWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
