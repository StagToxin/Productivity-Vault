// Güncellemeden sonra bir kez "Yenilikler" penceresi. Ayarlar'dan tekrar açılabilir.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { CHANGELOG, cmpVersion, notesBetween, type ReleaseNote } from '../lib/changelog';
import { APP_VERSION } from '../lib/platform';
import { useData } from '../lib/store';
import { Modal } from './ui';

const KEY = 'vault.seenVersion';
let forced: ReleaseNote[] | null = null;
const subs = new Set<() => void>();
export function showReleaseNotes(all = false) {
  forced = all ? CHANGELOG : CHANGELOG.slice(0, 1);
  subs.forEach((f) => f());
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function writeSeen(v: string) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* */
  }
}

export function WhatsNew() {
  const { t, prefs, habits, tasks } = useData();
  const f = useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), () => forced);
  const [auto, setAuto] = useState<ReleaseNote[] | null>(null);
  useEffect(() => {
    const seen = readSeen();
    // İlk kurulumda (hiç veri yokken) gösterme; eski kullanıcı ilk kez bu özelliği alıyorsa 1.2.0'dan sonrasını göster.
    const isNewUser = !habits.length && !tasks.length;
    const from = seen ?? (isNewUser ? APP_VERSION : '1.2.0');
    const notes = notesBetween(from, APP_VERSION);
    if (notes.length) setAuto(notes);
    if (!seen || cmpVersion(APP_VERSION, seen) > 0) writeSeen(APP_VERSION);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const list = f ?? auto;
  if (!list?.length) return null;
  const close = () => {
    forced = null;
    setAuto(null);
    subs.forEach((g) => g());
  };
  const lang = prefs.lang;
  return (
    <Modal title={`🎉 ${t('wn_title')}`} onClose={close}>
      {list.map((n) => {
        const d = n[lang] ?? n.tr;
        return (
          <div key={n.version} className="wn">
            <div className="small muted">
              v{n.version} · {n.date}
            </div>
            {d.added.length > 0 && (
              <>
                <h4>{t('wn_added')}</h4>
                <ul>{d.added.map((x) => <li key={x}>{x}</li>)}</ul>
              </>
            )}
            {d.changed.length > 0 && (
              <>
                <h4>{t('wn_changed')}</h4>
                <ul>{d.changed.map((x) => <li key={x}>{x}</li>)}</ul>
              </>
            )}
            {d.fixed.length > 0 && (
              <>
                <h4>{t('wn_fixed')}</h4>
                <ul>{d.fixed.map((x) => <li key={x}>{x}</li>)}</ul>
              </>
            )}
          </div>
        );
      })}
      <div className="actions">
        <button className="btn primary" onClick={close}>
          {t('wn_ok')}
        </button>
      </div>
    </Modal>
  );
}
