// Platforma özel işler: bildirim, masaüstü güncelleyici, kurulum istemi.
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__;

// ---------- Bildirimler ----------
export type NotifPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export async function notifPermission(): Promise<NotifPermission> {
  if (isTauri) {
    const n = await import('@tauri-apps/plugin-notification');
    return (await n.isPermissionGranted()) ? 'granted' : 'default';
  }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotif(): Promise<NotifPermission> {
  if (isTauri) {
    const n = await import('@tauri-apps/plugin-notification');
    const r = await n.requestPermission();
    return r === 'granted' ? 'granted' : 'denied';
  }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

export async function notify(title: string, body: string) {
  try {
    if (isTauri) {
      const n = await import('@tauri-apps/plugin-notification');
      n.sendNotification({ title, body });
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Android Chrome yalnızca service worker üzerinden bildirim gösterebilir.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: 'pwa-192.png', badge: 'pwa-192.png' });
    else new Notification(title, { body, icon: 'pwa-192.png' });
  } catch (e) {
    console.warn('notify', e);
  }
}

// ---------- Masaüstü güncelleyici (Tauri) ----------
export interface DesktopUpdate {
  version: string;
  install: () => Promise<void>;
}

export async function checkDesktopUpdate(): Promise<DesktopUpdate | null> {
  if (!isTauri) return null;
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    install: async () => {
      await update.downloadAndInstall();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    },
  };
}

// ---------- PWA kurulum istemi ----------
interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let deferred: BIPEvent | null = null;
const installSubs = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    installSubs.forEach((f) => f());
  });
}
export const canInstall = () => !!deferred;
export const onInstallable = (f: () => void) => {
  installSubs.add(f);
  return () => installSubs.delete(f);
};
export async function promptInstall() {
  if (!deferred) return;
  await deferred.prompt();
  deferred = null;
}

// ---------- Masaüstü küçük zamanlayıcı penceresi (her zaman üstte) ----------
const MINI_POS = 'vault.miniPos';

export async function openMiniWindow() {
  if (!isTauri) return;
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existing = await WebviewWindow.getByLabel('mini');
    if (existing) {
      await existing.show();
      return;
    }
    let pos: { x: number; y: number } | null = null;
    try {
      pos = JSON.parse(localStorage.getItem(MINI_POS) ?? 'null');
    } catch {
      /* */
    }
    const w = new WebviewWindow('mini', {
      url: 'mini.html',
      title: 'Verim',
      width: 260,
      height: 128,
      alwaysOnTop: true,
      decorations: false,
      resizable: false,
      skipTaskbar: true,
      focus: false,
      shadow: true,
      ...(pos ? { x: pos.x, y: pos.y } : { x: Math.max(0, screen.availWidth - 290), y: 40 }),
    });
    w.once('tauri://error', (e) => console.warn('mini window', e));
  } catch (e) {
    console.warn('mini window', e);
  }
}

export async function closeMiniWindow() {
  if (!isTauri) return;
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const w = await WebviewWindow.getByLabel('mini');
    await w?.close();
  } catch {
    /* */
  }
}

/** Küçük pencerenin içinden: konumu hatırla. */
export async function rememberMiniPosition() {
  if (!isTauri) return () => {};
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  const f = await win.scaleFactor();
  return win.onMoved(({ payload }) => {
    try {
      localStorage.setItem(MINI_POS, JSON.stringify({ x: Math.round(payload.x / f), y: Math.round(payload.y / f) }));
    } catch {
      /* */
    }
  });
}

export async function closeSelf() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().close();
}

// ---------- Tarayıcı: Resim içinde resim (Document Picture-in-Picture, Chrome/Edge masaüstü) ----------
export const canPip = typeof window !== 'undefined' && 'documentPictureInPicture' in window && !isTauri;
