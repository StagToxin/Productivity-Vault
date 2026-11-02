// Masaüstü: her zaman üstte duran küçük odak penceresi.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MiniApp } from './components/MiniTimer';
import { db } from './lib/db';
import { DataProvider, useData } from './lib/store';
import { useTheme } from './lib/theme';
import './styles.css';

function Themed() {
  const { prefs, ready } = useData();
  useTheme(prefs);
  return ready ? <MiniApp /> : null;
}

void db.open().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DataProvider>
        <Themed />
      </DataProvider>
    </StrictMode>,
  ),
);
