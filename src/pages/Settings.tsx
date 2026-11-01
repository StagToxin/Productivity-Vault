import { useEffect, useState } from 'react';
import { Field, Seg, Swatches, Switch, toast } from '../components/ui';
import { ACCENTS, DARK_BGS, LIGHT_BGS, seedSample, updatePrefs } from '../lib/actions';
import { db, table } from '../lib/db';
import { APP_VERSION, canInstall, checkDesktopUpdate, isIos, isStandalone, isTauri, notifPermission, notify, onInstallable, promptInstall, requestNotif, type NotifPermission } from '../lib/platform';
import { useData } from '../lib/store';
import { getSupaConfig, setSupaConfig } from '../lib/supabase';
import { signIn, signOut, signUp, syncNow, useSyncStatus, wipeLocal } from '../lib/sync';
import { SYNC_TABLES, type Lang, type ThemeMode } from '../lib/types';

export default function SettingsPage({ onCheckWebUpdate }: { onCheckWebUpdate: () => Promise<boolean> }) {
  const { t, prefs } = useData();
  const set = updatePrefs;

  return (
    <div className="settings">
      <div className="page-head">
        <h1>⚙️ {t('nav_settings')}</h1>
      </div>

      <SyncSection />

      <div className="group">
        <h3>{t('s_appearance')}</h3>
        <div className="set-row">
          <div>{t('s_theme')}</div>
          <Seg<ThemeMode>
            value={prefs.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { v: 'dark', l: '🌙 ' + t('theme_dark') },
              { v: 'light', l: '☀️ ' + t('theme_light') },
              { v: 'system', l: '💻 ' + t('theme_system') },
              { v: 'time', l: '🕒 ' + t('theme_time') },
            ]}
          />
        </div>
        {prefs.theme === 'time' && (
          <div className="set-row">
            <div>{t('s_lightHours')}</div>
            <div className="row">
              <HourSelect value={prefs.lightFrom} onChange={(lightFrom) => set({ lightFrom })} />
              –
              <HourSelect value={prefs.lightTo} onChange={(lightTo) => set({ lightTo })} />
            </div>
          </div>
        )}
        <div className="set-row">
          <div>
            {t('s_themeColor')} — {t('s_bgDark')}
          </div>
          <Swatches value={prefs.bgDark} colors={DARK_BGS} onChange={(bgDark) => set({ bgDark })} />
        </div>
        <div className="set-row">
          <div>
            {t('s_themeColor')} — {t('s_bgLight')}
            <div className="small muted">{t('s_themeHint')}</div>
          </div>
          <Swatches value={prefs.bgLight} colors={LIGHT_BGS} onChange={(bgLight) => set({ bgLight })} />
        </div>
        <div className="set-row">
          <div>{t('s_accent')}</div>
          <Swatches value={prefs.accent} colors={ACCENTS} onChange={(accent) => set({ accent })} />
        </div>
        <div className="set-row">
          <div>{t('s_language')}</div>
          <Seg<Lang> value={prefs.lang} onChange={(lang) => set({ lang })} options={[{ v: 'tr', l: '🇹🇷 Türkçe' }, { v: 'en', l: '🇬🇧 English' }]} />
        </div>
        <div className="set-row">
          <div>{t('s_displayName')}</div>
          <input className="input" style={{ maxWidth: 220 }} defaultValue={prefs.displayName} onBlur={(e) => set({ displayName: e.target.value.trim() })} />
        </div>
      </div>

      <div className="group">
        <h3>{t('s_goals')}</h3>
        <div className="set-row">
          <div>{t('s_dailyGoal')}</div>
          <Seg value={prefs.dailyGoalXp} onChange={(dailyGoalXp) => set({ dailyGoalXp })} options={[10, 20, 30, 50, 80].map((v) => ({ v, l: String(v) }))} />
        </div>
        <div className="set-row">
          <div>{t('s_weekStart')}</div>
          <Switch on={prefs.weekStartsMonday} onChange={(weekStartsMonday) => set({ weekStartsMonday })} />
        </div>
        <div className="set-row">
          <div>{t('s_dayStart')}</div>
          <Seg value={prefs.dayStartHour} onChange={(dayStartHour) => set({ dayStartHour })} options={[0, 1, 2, 3, 4].map((v) => ({ v, l: `0${v}:00` }))} />
        </div>
        <div className="set-row">
          <div>{t('s_focus')}</div>
          <div className="row">
            <NumberIn label={t('focus')} value={prefs.focusMinutes} onChange={(focusMinutes) => set({ focusMinutes })} />
            <NumberIn label={t('short_break')} value={prefs.shortBreak} onChange={(shortBreak) => set({ shortBreak })} />
            <NumberIn label={t('long_break')} value={prefs.longBreak} onChange={(longBreak) => set({ longBreak })} />
          </div>
        </div>
      </div>

      <NotifSection />
      <DataSection />

      <div className="group">
        <h3>{t('s_about')}</h3>
        <div className="set-row">
          <div>
            {t('s_version')}: <b>{APP_VERSION}</b> {isTauri ? '(Desktop)' : isStandalone ? '(App)' : '(Web)'}
          </div>
          <button
            className="btn sm"
            onClick={async () => {
              if (isTauri) {
                const u = await checkDesktopUpdate().catch((e) => (toast(String(e)), null));
                if (u) {
                  toast(`${t('update_ready')} v${u.version}`, { label: t('update_now'), run: () => void u.install() }, 15000);
                } else toast(t('s_upToDate'));
              } else {
                const found = await onCheckWebUpdate();
                if (!found) toast(t('s_upToDate'));
              }
            }}
          >
            🔄 {t('s_checkUpdate')}
          </button>
        </div>
        {!isTauri && !isStandalone && <InstallRow />}
        {!isTauri && import.meta.env.VITE_REPO && (
          <div className="set-row">
            <div>💻 Windows / macOS / Linux</div>
            <a className="btn sm" href={`https://github.com/${import.meta.env.VITE_REPO}/releases/latest`} target="_blank" rel="noreferrer">
              ⬇ {t('s_desktopDownload')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function HourSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select className="input" style={{ width: 90 }} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, '0')}:00
        </option>
      ))}
    </select>
  );
}

function NumberIn({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="small muted" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {label}
      <input className="input" style={{ width: 80 }} type="number" min={1} max={180} defaultValue={value} onBlur={(e) => onChange(Math.max(1, Math.min(180, Number(e.target.value) || value)))} />
    </label>
  );
}

function InstallRow() {
  const { t } = useData();
  const [can, setCan] = useState(canInstall());
  useEffect(() => {
    const off = onInstallable(() => setCan(canInstall()));
    return () => void off();
  }, []);
  return (
    <div className="set-row">
      <div>{isIos ? t('s_installIos') : t('s_install')}</div>
      {can && (
        <button className="btn primary sm" onClick={promptInstall}>
          ⬇ {t('s_install')}
        </button>
      )}
    </div>
  );
}

function SyncSection() {
  const { t } = useData();
  const st = useSyncStatus();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const cfg = getSupaConfig();

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      toast('⚠️ ' + (e instanceof Error ? e.message : String(e)), undefined, 6000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group">
      <h3>{t('s_sync')}</h3>
      {!cfg ? (
        <p className="muted">{t('s_syncDisabled')}</p>
      ) : st.email ? (
        <>
          <div className="set-row">
            <div>
              {t('s_signedInAs')} <b>{st.email}</b>
              <div className="small muted">
                <span className={'dot ' + st.state} style={{ display: 'inline-block', marginRight: 6 }} />
                {t(`sync_${st.state}` as 'sync_idle')}
                {st.lastSync && ` · ${t('s_lastSync')}: ${new Date(st.lastSync).toLocaleTimeString()}`}
                {st.error && <span className="bad"> · {st.error}</span>}
              </div>
            </div>
            <button className="btn sm" disabled={st.state === 'syncing'} onClick={() => syncNow()}>
              🔄 {t('s_syncNow')}
            </button>
          </div>
          <div className="set-row">
            <button className="btn sm" onClick={() => signOut(false)}>
              {t('s_signOut')}
            </button>
            <button className="btn sm danger" onClick={() => confirm(t('confirm_delete')) && signOut(true)}>
              {t('s_signOutWipe')}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={(e) => (e.preventDefault(), run(() => signIn(email, pw)))}>
          <p className="small muted">{t('s_syncHint')}</p>
          <div className="row">
            <Field label={t('s_email')}>
              <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label={t('s_password')}>
              <input className="input" type="password" autoComplete="current-password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required />
            </Field>
          </div>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn primary" disabled={busy}>
              {t('s_signIn')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !email || pw.length < 6}
              onClick={() =>
                run(async () => {
                  const r = await signUp(email, pw);
                  if (r.needsConfirm) toast(t('s_confirmEmail'), undefined, 8000);
                })
              }
            >
              {t('s_signUp')}
            </button>
          </div>
        </form>
      )}
      <details style={{ marginTop: 10 }}>
        <summary className="small muted" style={{ cursor: 'pointer' }}>
          {t('s_advanced')}
        </summary>
        <AdvancedSupa />
      </details>
    </div>
  );
}

function AdvancedSupa() {
  const { t } = useData();
  const cur = getSupaConfig();
  const [url, setUrl] = useState(cur?.url ?? '');
  const [key, setKey] = useState(cur?.anonKey ?? '');
  return (
    <div style={{ marginTop: 10 }}>
      <Field label={t('s_supaUrl')}>
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
      </Field>
      <Field label={t('s_supaKey')}>
        <input className="input" value={key} onChange={(e) => setKey(e.target.value)} />
      </Field>
      <button
        className="btn sm"
        onClick={() => {
          setSupaConfig(url && key ? { url: url.trim(), anonKey: key.trim() } : null);
          location.reload();
        }}
      >
        {t('save')}
      </button>
    </div>
  );
}

function NotifSection() {
  const { t, prefs } = useData();
  const [perm, setPerm] = useState<NotifPermission>('default');
  useEffect(() => {
    void notifPermission().then(setPerm);
  }, []);
  return (
    <div className="group">
      <h3>{t('s_notifications')}</h3>
      <div className="set-row">
        <div>{t('s_notifEnable')}</div>
        <Switch
          on={prefs.notifications && perm === 'granted'}
          onChange={async (on) => {
            if (on) {
              const p = await requestNotif();
              setPerm(p);
              if (p !== 'granted') {
                toast(t('s_notifDenied'), undefined, 6000);
                return;
              }
            }
            await updatePrefs({ notifications: on });
          }}
        />
      </div>
      {isIos && !isStandalone && <p className="small muted">{t('s_notifIos')}</p>}
      <div className="set-row">
        <div>{t('s_notifStreak')}</div>
        <input className="input" type="time" style={{ width: 130 }} value={prefs.streakReminderTime} onChange={(e) => updatePrefs({ streakReminderTime: e.target.value })} />
      </div>
      <div className="set-row">
        <div className="small muted">🔔</div>
        <button className="btn sm" onClick={() => notify('Productivity Vault', '🔥 Test')}>
          {t('s_notifTest')}
        </button>
      </div>
    </div>
  );
}

function DataSection() {
  const { t } = useData();
  const exportData = async () => {
    const out: Record<string, unknown[]> = {};
    for (const n of SYNC_TABLES) out[n] = await table(n).toArray();
    const blob = new Blob([JSON.stringify({ app: 'productivity-vault', version: APP_VERSION, exportedAt: new Date().toISOString(), data: out }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vault-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const importData = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      let n = 0;
      await db.transaction('rw', SYNC_TABLES.map((x) => db.table(x)), async () => {
        for (const name of SYNC_TABLES) {
          const rows = (json.data?.[name] ?? []) as { id: string; updatedAt: number }[];
          for (const r of rows) {
            const cur = await table(name).get(r.id);
            if (!cur || r.updatedAt > cur.updatedAt) {
              await table(name).put({ ...r, dirty: 1 } as never);
              n++;
            }
          }
        }
      });
      toast(t('s_imported', { n }));
      void syncNow();
    } catch (e) {
      toast('⚠️ ' + String(e));
    }
  };
  return (
    <div className="group">
      <h3>{t('s_data')}</h3>
      <div className="set-row">
        <button className="btn sm" onClick={exportData}>
          ⬇ {t('s_export')}
        </button>
        <label className="btn sm">
          ⬆ {t('s_import')}
          <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
        </label>
      </div>
      <div className="set-row">
        <button className="btn sm" onClick={() => seedSample()}>
          🧪 {t('s_seed')}
        </button>
        <button className="btn sm danger" onClick={async () => confirm(t('confirm_delete')) && (await wipeLocal(), location.reload())}>
          🗑 {t('s_wipe')}
        </button>
      </div>
    </div>
  );
}
