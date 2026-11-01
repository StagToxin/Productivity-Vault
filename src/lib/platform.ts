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
