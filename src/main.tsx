import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { db } from './lib/db';
import { DataProvider } from './lib/store';
import './styles.css';

// Tarayıcıdan verilerin silinmemesi için kalıcı depolama iste (özellikle iOS Safari).
navigator.storage?.persist?.().catch(() => {});

// Hata olursa beyaz ekran yerine okunur mesaj göster (destek için kolaylık).
window.addEventListener('error', (e) => console.error('[vault]', e.error ?? e.message));

db.open()
  .catch((e) => {
    document.body.innerHTML = `<pre style="color:#e5484d;padding:20px;white-space:pre-wrap">Veritabanı açılamadı:\n${e}</pre>`;
    throw e;
  })
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <DataProvider>
          <App />
        </DataProvider>
      </StrictMode>,
    );
  });
