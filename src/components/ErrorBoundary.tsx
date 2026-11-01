// Ekranda beklenmeyen bir hata olursa uygulama bembeyaz kalmasın:
// hatayı göster, pano düzenini sıfırlama ve yeniden yükleme seçeneği sun.
import { Component, type ReactNode } from 'react';
import { defaultPrefs } from '../lib/actions';
import { db, now } from '../lib/db';
import { dicts } from '../lib/i18n';
import { checkDesktopUpdate, isTauri } from '../lib/platform';

interface State {
  error: Error | null;
  update: null | 'checking' | 'ready' | 'none';
  install?: () => Promise<void>;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, update: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[vault] ekran hatası', error);
    void this.lookForFix();
  }

  /** Çökme anında düzeltilmiş bir sürüm yayınlanmış mı bak — uygulama çökse bile güncellenebilsin. */
  private lookForFix = async () => {
    this.setState({ update: 'checking' });
    try {
      if (isTauri) {
        const u = await checkDesktopUpdate();
        if (u) return this.setState({ update: 'ready', install: u.install });
      } else {
        const reg = await navigator.serviceWorker?.getRegistration();
        await reg?.update();
        await new Promise((r) => setTimeout(r, 2000));
        const waiting = reg?.waiting;
        if (waiting)
          return this.setState({
            update: 'ready',
            install: async () => {
              navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
              waiting.postMessage({ type: 'SKIP_WAITING' });
              setTimeout(() => location.reload(), 3000);
            },
          });
      }
    } catch {
      /* çevrimdışı vb. */
    }
    this.setState({ update: 'none' });
  };

  private resetLayout = async () => {
    try {
      const cur = await db.prefs.get('prefs');
      const widgets = defaultPrefs().widgets;
      if (cur) await db.prefs.update('prefs', { widgets, updatedAt: now(), dirty: 1 });
    } finally {
      location.reload();
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    const d = navigator.language?.startsWith('tr') ? dicts.tr : dicts.en;
    return (
      <div style={{ maxWidth: 520, margin: '12vh auto', padding: 24, fontFamily: 'system-ui, sans-serif', color: '#e6e6e3' }}>
        <div style={{ fontSize: 48 }}>🛠️</div>
        <h1 style={{ fontSize: 22 }}>{d.crash_title}</h1>
        <p style={{ color: '#a5a5a0' }}>{d.crash_body}</p>
        {this.state.update === 'ready' && (
          <button className="btn primary" style={{ marginTop: 8 }} onClick={() => void this.state.install?.()}>
            🎉 {d.update_ready} {d.update_now}
          </button>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
          <button className="btn primary" onClick={this.resetLayout}>
            {d.crash_reset}
          </button>
          <button className="btn" onClick={() => location.reload()}>
            {d.crash_reload}
          </button>
        </div>
        <pre style={{ fontSize: 11, color: '#6f6f6b', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(this.state.error?.stack ?? this.state.error).slice(0, 800)}</pre>
      </div>
    );
  }
}
