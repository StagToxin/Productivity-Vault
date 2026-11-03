// Arkadaşlar: davet kodu, liderlik tabloları (haftalık / aylık / seri) ve ortak alışkanlıklar.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cellStyle } from '../components/blocks';
import { fmtDate } from '../components/HabitViews';
import { Field, Modal, Seg, Switch, toast } from '../components/ui';
import { saveHabit } from '../lib/actions';
import { uid } from '../lib/db';
import { fromKey, timeOfTs, todayKey } from '../lib/dates';
import { lastDays, summarize, type GroupDef } from '../lib/groupStats';
import {
  addFriend, createGroupFromHabit, ensureProfile, groupOverview, inviteToGroup, joinWithHabit, leaderboard, leaveGroup, myFriends, myGroups, myInvites,
  react, regenerateCode, removeFriend, respondInvite, SocialError, updateProfile,
  type Board, type BoardRow, type Friend, type Group, type GroupOverview, type Invite, type Profile,
} from '../lib/social';
import { useData } from '../lib/store';
import { useSyncStatus } from '../lib/sync';
import type { Habit } from '../lib/types';

type T = ReturnType<typeof useData>['t'];

function errText(e: unknown, t: T) {
  if (e instanceof SocialError) {
    const k = { signedOut: 'fr_errSignedOut', serverOutdated: 'fr_errServer', invalidCode: 'fr_errCode', ownCode: 'fr_errOwn', tooMany: 'fr_errTooMany', offline: 'fr_errOffline', other: '' }[e.code];
    if (k) return t(k as 'fr_errCode');
    return e.message;
  }
  return String(e);
}

const fmtCode = (c: string) => `VERIM-${c.slice(0, 4)}-${c.slice(4)}`;

export default function FriendsPage({ goSettings }: { goSettings: () => void }) {
  const { t, prefs } = useData();
  const sync = useSyncStatus();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [rev, setRev] = useState(0);
  const refresh = useCallback(() => setRev((r) => r + 1), []);
  const signedIn = !!sync.email;

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    (async () => {
      try {
        const p = await ensureProfile(prefs.displayName, prefs.dayStartHour);
        const [f, g, i] = await Promise.all([myFriends(), myGroups(), myInvites()]);
        if (!alive) return;
        setProfile(p);
        setFriends(f);
        setGroups(g);
        setInvites(i);
        setError(null);
      } catch (e) {
        if (alive) setError(errText(e, t));
      }
    })();
    return () => {
      alive = false;
    };
  }, [signedIn, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  // arkadaş etkinliği için arada bir yenile
  useEffect(() => {
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!signedIn)
    return (
      <div>
        <Head t={t} />
        <div className="section empty" style={{ textAlign: 'left' }}>
          <p>{t('fr_needAccount')}</p>
          <button className="btn primary" onClick={goSettings}>
            {t('nav_settings')} →
          </button>
        </div>
      </div>
    );

  if (error && !profile)
    return (
      <div>
        <Head t={t} />
        <div className="section">
          <p className="bad">⚠️ {error}</p>
          <button className="btn" onClick={refresh}>
            ↻ {t('fr_retry')}
          </button>
        </div>
      </div>
    );

  if (!profile) return <Head t={t} loading />;

  return (
    <div>
      <Head t={t} />
      {!profile.league_asked && <AskLeague onDone={(p) => setProfile({ ...profile, ...p })} />}
      <p className="small muted" style={{ marginTop: -6 }}>
        🔒 {t('fr_privacy')}
      </p>
      <div className="dash">
        <div className="dash-col">
          <ProfileCard profile={profile} setProfile={setProfile} onFriend={refresh} />
          <section className="section">
            <div className="section-head">
              <div className="section-title">
                <span className="emoji">🤝</span> {t('fr_friends')} <span className="muted small">({friends.length})</span>
              </div>
            </div>
            {friends.length ? (
              friends.map((f) => (
                <div key={f.user_id} className="set-row">
                  <div>
                    <b>{f.display_name || '—'}</b>
                    <div className="small muted">{t('fr_since', { d: fmtDate(f.since.slice(0, 10), t, false) })}</div>
                  </div>
                  <button
                    className="btn sm"
                    onClick={async () => {
                      if (!confirm(t('fr_removeQ', { n: f.display_name }))) return;
                      try {
                        await removeFriend(f.user_id); // ortak gruplardan da çıkarılırsın; yerel bağ bir sonraki eşitlemede kalkar
                        refresh();
                      } catch (e) {
                        toast('⚠️ ' + errText(e, t));
                      }
                    }}
                  >
                    {t('fr_remove')}
                  </button>
                </div>
              ))
            ) : (
              <div className="empty small">{t('fr_noFriends')}</div>
            )}
          </section>
        </div>
        <div className="dash-col">
          <Leaderboards profile={profile} setProfile={setProfile} rev={rev} />
          <SharedHabits friends={friends} groups={groups} invites={invites} refresh={refresh} rev={rev} />
        </div>
      </div>
    </div>
  );
}

function Head({ t, loading }: { t: T; loading?: boolean }) {
  return (
    <div className="page-head">
      <h1>👥 {t('nav_friends')}</h1>
      {loading && <span className="muted">…</span>}
    </div>
  );
}

function AskLeague({ onDone }: { onDone: (p: Partial<Profile>) => void }) {
  const { t } = useData();
  const answer = async (show: boolean) => {
    try {
      await updateProfile({ show_in_league: show, league_asked: true });
      onDone({ show_in_league: show, league_asked: true });
    } catch (e) {
      toast('⚠️ ' + errText(e, t));
    }
  };
  return (
    <Modal title={'🏆 ' + t('fr_askTitle')} onClose={() => void answer(false)}>
      <p>{t('fr_askBody')}</p>
      <ul className="small" style={{ paddingLeft: 18 }}>
        <li>{t('fr_askSees')}</li>
        <li>{t('fr_askNot')}</li>
        <li>{t('fr_askChange')}</li>
      </ul>
      <div className="actions">
        <button className="btn" onClick={() => void answer(false)}>
          {t('fr_askNo')}
        </button>
        <button className="btn primary" onClick={() => void answer(true)}>
          {t('fr_askYes')}
        </button>
      </div>
    </Modal>
  );
}

function ProfileCard({ profile, setProfile, onFriend }: { profile: Profile; setProfile: (p: Profile) => void; onFriend: () => void }) {
  const { t } = useData();
  const [name, setName] = useState(profile.display_name);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const share = async () => {
    const text = t('fr_shareText', { c: fmtCode(profile.invite_code) });
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(fmtCode(profile.invite_code));
        toast('📋 ' + t('fr_copied'));
      }
    } catch {
      /* iptal */
    }
  };
  return (
    <section className="section">
      <div className="section-head">
        <div className="section-title">
          <span className="emoji">🙂</span> {t('fr_me')}
        </div>
      </div>
      <Field label={t('fr_name')}>
        <form
          className="row"
          style={{ flexWrap: 'nowrap' }}
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await updateProfile({ display_name: name.trim().slice(0, 40) });
              setProfile({ ...profile, display_name: name.trim().slice(0, 40) });
              toast('✓ ' + t('saved'));
            } catch (er) {
              toast('⚠️ ' + errText(er, t));
            }
          }}
        >
          <input className="input" value={name} maxLength={40} placeholder={t('fr_namePh')} onChange={(e) => setName(e.target.value)} />
          <button className="btn" disabled={name.trim() === profile.display_name}>
            {t('save')}
          </button>
        </form>
      </Field>
      {!profile.display_name && <p className="small bad" style={{ marginTop: -6 }}>{t('fr_nameHint')}</p>}
      <div className="field">
        <span>{t('fr_myCode')}</span>
        <div className="row" style={{ alignItems: 'center' }}>
          <code className="invite-code">{fmtCode(profile.invite_code)}</code>
          <button className="btn sm primary" onClick={share}>
            ↗ {t('fr_share')}
          </button>
          <button
            className="btn sm"
            title={t('fr_newCodeHint')}
            onClick={async () => {
              if (!confirm(t('fr_newCodeQ'))) return;
              try {
                setProfile({ ...profile, invite_code: await regenerateCode() });
              } catch (e) {
                toast('⚠️ ' + errText(e, t));
              }
            }}
          >
            ↻
          </button>
        </div>
        <div className="small muted">{t('fr_codeHint')}</div>
      </div>
      <form
        className="field"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!code.trim()) return;
          setBusy(true);
          try {
            const f = await addFriend(code);
            toast('🤝 ' + t('fr_added', { n: f.display_name || '—' }));
            setCode('');
            onFriend();
          } catch (er) {
            toast('⚠️ ' + errText(er, t), undefined, 6000);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span>{t('fr_addByCode')}</span>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="input" value={code} placeholder="VERIM-XXXX-XXXX" onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
          <button className="btn primary" style={{ flexShrink: 0, whiteSpace: 'nowrap' }} disabled={busy || !code.trim()}>
            ＋ {t('fr_add')}
          </button>
        </div>
      </form>
    </section>
  );
}

function Leaderboards({ profile, setProfile, rev }: { profile: Profile; setProfile: (p: Profile) => void; rev: number }) {
  const { t } = useData();
  const [tab, setTab] = useState<Board>('week');
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    leaderboard(tab)
      .then((r) => alive && (setRows(r), setErr(null)))
      .catch((e) => alive && setErr(errText(e, t)));
    return () => {
      alive = false;
    };
  }, [tab, rev, profile.show_in_league]); // eslint-disable-line react-hooks/exhaustive-deps
  const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;
  return (
    <section className="section">
      <div className="section-head">
        <div className="section-title">
          <span className="emoji">🏆</span> {t('fr_league')}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Seg<Board> value={tab} onChange={setTab} options={[{ v: 'week', l: t('fr_week') }, { v: 'month', l: t('fr_month') }, { v: 'streak', l: '🔥 ' + t('fr_streak') }]} />
        <label className="row small" style={{ alignItems: 'center', gap: 6 }}>
          {t('fr_showMe')}
          <Switch
            on={profile.show_in_league}
            onChange={async (v) => {
              try {
                await updateProfile({ show_in_league: v, league_asked: true });
                setProfile({ ...profile, show_in_league: v, league_asked: true });
              } catch (e) {
                toast('⚠️ ' + errText(e, t));
              }
            }}
          />
        </label>
      </div>
      {err ? (
        <p className="bad small">⚠️ {err}</p>
      ) : !rows ? (
        <div className="muted small">…</div>
      ) : (
        <div className="board">
          {rows.map((r, i) => (
            <div key={r.user_id} className={'board-row' + (r.is_me ? ' me' : '')}>
              <span className="rank">{medal(i)}</span>
              <span className="nm">
                {r.display_name || '—'}
                {r.is_me && <span className="muted"> ({t('fr_you')}{r.hidden ? ' · ' + t('fr_hidden') : ''})</span>}
              </span>
              <b className="pts">
                {tab === 'streak' ? `🔥 ${r.points}` : `${r.points} XP`}
                {tab === 'streak' && r.longest != null && <span className="small muted"> · {t('max')} {r.longest}</span>}
              </b>
            </div>
          ))}
          {rows.length <= 1 && <div className="empty small">{t('fr_boardEmpty')}</div>}
        </div>
      )}
      <details className="small muted" style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer' }}>{t('fr_rulesTitle')}</summary>
        <ul style={{ paddingLeft: 18, marginBottom: 0 }}>
          <li>{t('fr_rule1')}</li>
          <li>{t('fr_rule2')}</li>
          <li>{t('fr_rule3')}</li>
          <li>{t('fr_rule4')}</li>
          <li>{t('fr_rule5')}</li>
        </ul>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ortak alışkanlıklar
// ---------------------------------------------------------------------------
function SharedHabits({ friends, groups, invites, refresh, rev }: { friends: Friend[]; groups: Group[]; invites: Invite[]; refresh: () => void; rev: number }) {
  const { t, habits } = useData();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<Invite | null>(null);
  return (
    <section className="section">
      <div className="section-head">
        <div className="section-title">
          <span className="emoji">🫂</span> {t('fr_shared')}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn sm primary" disabled={!friends.length} title={!friends.length ? t('fr_needFriend') : ''} onClick={() => setCreating(true)}>
          ＋ {t('fr_startShared')}
        </button>
      </div>
      {invites.map((i) => (
        <div key={i.group_id} className="card invite">
          <div>
            <b>
              {i.icon} {i.name}
            </b>
            <div className="small muted">{t('fr_invitedBy', { n: i.invited_by_name || '—', m: i.members })}</div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm primary" onClick={() => setJoining(i)}>
              {t('fr_join')}
            </button>
            <button className="btn sm" onClick={async () => (await respondInvite(i.group_id, false).catch((e) => toast('⚠️ ' + errText(e, t))), refresh())}>
              {t('fr_decline')}
            </button>
          </div>
        </div>
      ))}
      {groups.length === 0 && invites.length === 0 && <div className="empty small">{t('fr_sharedEmpty')}</div>}
      {groups.map((g) => (
        <GroupCard key={g.group_id} g={g} friends={friends} habit={habits.find((h) => h.share?.groupId === g.group_id)} refresh={refresh} rev={rev} />
      ))}
      {creating && <CreateGroup friends={friends} onClose={() => (setCreating(false), refresh())} />}
      {joining && <JoinGroup inv={joining} onClose={() => (setJoining(null), refresh())} />}
    </section>
  );
}

function GroupCard({ g, friends, habit, refresh, rev }: { g: Group; friends: Friend[]; habit?: Habit; refresh: () => void; rev: number }) {
  const { t, prefs } = useData();
  const today = todayKey();
  const [ov, setOv] = useState<GroupOverview | null>(null);
  const [inviting, setInviting] = useState(false);
  const since = lastDays(today, 90)[0];
  const load = useCallback(() => {
    groupOverview(g.group_id, since)
      .then(setOv)
      .catch((e) => {
        // başka bir yerden (ya da az önce) ayrıldıysak sessizce listeyi yenile
        if (e instanceof SocialError && /not a member/.test(e.message)) refresh();
        else toast('⚠️ ' + errText(e, t));
      });
  }, [g.group_id, since]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load, rev, habit?.updatedAt]);
  const def: GroupDef = g;
  const sum = useMemo(() => (ov ? summarize(def, ov, today, prefs.weekStartsMonday) : null), [ov, today, prefs.weekStartsMonday]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = lastDays(today, 7);
  const fakeHabit = { color: g.color } as Habit;
  const sent = (to: string) => ov?.reactions.find((r) => r.to === to && r.day === today && !sum?.members.find((m) => m.user_id === r.to)?.me);
  const received = ov?.reactions.filter((r) => r.day === today && sum?.members.find((m) => m.user_id === r.to)?.me) ?? [];
  const nameOf = (id: string) => sum?.members.find((m) => m.user_id === id)?.name ?? '—';
  const invitable = friends.filter((f) => !ov?.members.some((m) => m.user_id === f.user_id) && !ov?.invited.some((i) => i.user_id === f.user_id));
  return (
    <div className="card group-card" style={{ ['--c' as string]: g.color }}>
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <b>
          {g.icon} {g.name}
        </b>
        {sum && sum.members.length > 1 && <span className="badge accent">🤝 {t('fr_together', { n: sum.together })}</span>}
      </div>
      {!habit && <p className="small bad">{t('fr_notLinked')}</p>}
      {received.length > 0 && (
        <div className="small">
          {received.map((r) => (
            <span key={r.from} className="badge" style={{ marginRight: 4 }}>
              {r.emoji} {nameOf(r.from)}
            </span>
          ))}
        </div>
      )}
      {!sum ? (
        <div className="muted small">…</div>
      ) : (
        <div className="gm-list">
          {sum.members.map((m) => {
            const r = sent(m.user_id);
            return (
              <div key={m.user_id} className={'gm' + (m.me ? ' me' : '')}>
                <div className="gm-name">
                  <b>{m.me ? t('fr_you') : m.name}</b>
                  <span className="small muted">
                    🔥 {m.streak} {t(m.unit === 'day' ? 'day_unit' : 'week_unit')}
                  </span>
                </div>
                <div className="gm-days">
                  {days.map((k) => {
                    const d = m.idx.get(k);
                    const at = d ? d.at ?? [...d.slots.values()].filter(Boolean).pop() : undefined;
                    return (
                      <i
                        key={k}
                        title={`${fmtDate(k, t)}${d?.count ? ` · ${d.count}/${d.total}${at ? ' · ' + timeOfTs(at) : ''}` : ''}`}
                        className={k === today ? 'today' : ''}
                        style={cellStyle(fakeHabit, d)}
                      >
                        {t.dow[(fromKey(k).getDay() + 6) % 7].slice(0, 2)}
                      </i>
                    );
                  })}
                </div>
                <div className="gm-today small">
                  {m.doneToday ? (
                    <span className="ok-green">✓ {m.todayAt ? timeOfTs(m.todayAt) : t('done')}</span>
                  ) : m.todayCount > 0 ? (
                    <span>
                      {m.todayCount}/{m.todayTotal}
                    </span>
                  ) : (
                    <span className="muted">{t('fr_notYet')}</span>
                  )}
                </div>
                {m.me ? (
                  <div className="gm-react" />
                ) : (
                  <div className="gm-react">
                    {(m.doneToday ? ['👏', '🔥', '💪'] : ['👉', '💪']).map((e) => (
                      <button
                        key={e}
                        className={'icon-btn' + (r?.emoji === e ? ' on' : '')}
                        title={e === '👉' ? t('fr_nudge') : t('fr_cheer')}
                        onClick={async () => {
                          try {
                            await react(g.group_id, m.user_id, today, e);
                            load();
                          } catch (er) {
                            toast('⚠️ ' + errText(er, t));
                          }
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {ov && ov.invited.length > 0 && <div className="small muted">⏳ {t('fr_pending', { n: ov.invited.map((i) => i.name).join(', ') })}</div>}
        </div>
      )}
      <div className="row" style={{ gap: 6, marginTop: 4 }}>
        {invitable.length > 0 && (
          <button className="btn sm" onClick={() => setInviting(!inviting)}>
            ＋ {t('fr_inviteMore')}
          </button>
        )}
        <button
          className="btn sm"
          onClick={async () => {
            if (!confirm(t('fr_leaveQ'))) return;
            try {
              await leaveGroup(g.group_id);
              toast(t('fr_left'));
              refresh();
            } catch (e) {
              toast('⚠️ ' + errText(e, t));
            }
          }}
        >
          🚪 {t('fr_leave')}
        </button>
      </div>
      {inviting && (
        <div className="chip-row" style={{ marginTop: 6 }}>
          {invitable.map((f) => (
            <button
              key={f.user_id}
              className="chip"
              onClick={async () => {
                try {
                  await inviteToGroup(g.group_id, f.user_id);
                  toast('✉️ ' + t('fr_invited', { n: f.display_name }));
                  setInviting(false);
                  load();
                } catch (e) {
                  toast('⚠️ ' + errText(e, t));
                }
              }}
            >
              ＋ {f.display_name || '—'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateGroup({ friends, onClose }: { friends: Friend[]; onClose: () => void }) {
  const { t, habits } = useData();
  const candidates = habits.filter((h) => !h.archived && !h.share);
  const [habitId, setHabitId] = useState(candidates[0]?.id ?? '');
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const h = candidates.find((x) => x.id === habitId);
  return (
    <Modal title={t('fr_startShared')} onClose={onClose}>
      {candidates.length === 0 ? (
        <p>{t('fr_noHabitToShare')}</p>
      ) : (
        <>
          <Field label={t('fr_whichHabit')}>
            <select className="input" value={habitId} onChange={(e) => setHabitId(e.target.value)}>
              {candidates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.icon} {x.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="field">
            <span>{t('fr_withWhom')}</span>
            <div className="chip-row">
              {friends.map((f) => (
                <button key={f.user_id} type="button" className={'chip' + (sel.includes(f.user_id) ? ' active' : '')} onClick={() => setSel(sel.includes(f.user_id) ? sel.filter((x) => x !== f.user_id) : [...sel, f.user_id])}>
                  {sel.includes(f.user_id) ? '✓ ' : ''}
                  {f.display_name || '—'}
                </button>
              ))}
            </div>
          </div>
          <p className="small muted">{t('fr_createHint')}</p>
        </>
      )}
      <div className="actions">
        <button className="btn" onClick={onClose}>
          {t('cancel')}
        </button>
        <button
          className="btn primary"
          disabled={!h || !sel.length || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await createGroupFromHabit(h!, sel);
              toast('✉️ ' + t('fr_createdSent'));
              onClose();
            } catch (e) {
              toast('⚠️ ' + errText(e, t));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('fr_sendInvite')}
        </button>
      </div>
    </Modal>
  );
}

function JoinGroup({ inv, onClose }: { inv: Invite; onClose: () => void }) {
  const { t, habits } = useData();
  const candidates = habits.filter((h) => !h.archived && !h.share);
  const slotted = inv.slots.length > 0;
  // aynı adlı alışkanlık varsa onu öner
  const guess = candidates.find((h) => h.name.trim().toLowerCase() === inv.name.trim().toLowerCase() && (h.slots?.length ?? 0) > 0 === slotted);
  const [mode, setMode] = useState<'link' | 'new'>(guess ? 'link' : 'new');
  const [habitId, setHabitId] = useState(guess?.id ?? candidates[0]?.id ?? '');
  const h = candidates.find((x) => x.id === habitId);
  const autoMap = (hab?: Habit) => {
    const m: Record<string, string> = {};
    (hab?.slots ?? []).forEach((s, i) => {
      const byName = inv.slots.find((gs) => gs.name.trim().toLowerCase() === s.name.trim().toLowerCase());
      const gs = byName ?? inv.slots[i];
      if (gs) m[s.id] = gs.id;
    });
    return m;
  };
  const [slotMap, setSlotMap] = useState<Record<string, string>>(() => autoMap(h));
  useEffect(() => setSlotMap(autoMap(h)), [habitId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    try {
      if (mode === 'new') {
        const slots = inv.slots.map((s) => ({ id: uid(), name: s.name }));
        const id = await saveHabit({ name: inv.name, icon: inv.icon, color: inv.color, weeklyTarget: inv.weekly_target, slots: slots.length ? slots : undefined });
        await joinWithHabit(inv, id, slots.length ? Object.fromEntries(slots.map((s, i) => [s.id, inv.slots[i].id])) : undefined);
      } else {
        if (!h) return;
        await joinWithHabit(inv, h.id, slotted ? slotMap : undefined);
      }
      toast('🤝 ' + t('fr_joined'));
      onClose();
    } catch (e) {
      toast('⚠️ ' + errText(e, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`${inv.icon} ${inv.name}`} onClose={onClose}>
      <p className="small muted">{t('fr_joinIntro', { n: inv.invited_by_name || '—' })}</p>
      <Field label={t('fr_joinHow')}>
        <Seg value={mode} onChange={setMode} options={[{ v: 'link', l: t('fr_linkExisting') }, { v: 'new', l: t('fr_createNew') }]} />
      </Field>
      {mode === 'link' ? (
        candidates.length === 0 ? (
          <p className="small">{t('fr_noHabitToLink')}</p>
        ) : (
          <>
            <Field label={t('fr_whichHabit')}>
              <select className="input" value={habitId} onChange={(e) => setHabitId(e.target.value)}>
                {candidates.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.icon} {x.name}
                    {(x.slots?.length ?? 0) > 0 ? ` (${x.slots!.length})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            {slotted && h && (
              <div className="sub-box">
                <div className="small muted" style={{ marginBottom: 6 }}>
                  {t('fr_mapSlots')}
                </div>
                {(h.slots ?? []).map((s) => (
                  <div key={s.id} className="row" style={{ alignItems: 'center', flexWrap: 'nowrap', marginBottom: 4 }}>
                    <span style={{ flex: 1 }}>{s.name}</span>→
                    <select className="input" style={{ flex: 1 }} value={slotMap[s.id] ?? ''} onChange={(e) => setSlotMap({ ...slotMap, [s.id]: e.target.value })}>
                      <option value="">{t('fr_notShared')}</option>
                      {inv.slots.map((gs) => (
                        <option key={gs.id} value={gs.id}>
                          {gs.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {(h.slots?.length ?? 0) === 0 && <p className="small bad">{t('fr_needSlots')}</p>}
              </div>
            )}
            <p className="small muted">{t('fr_linkHint')}</p>
          </>
        )
      ) : (
        <p className="small muted">{t('fr_newHint')}</p>
      )}
      <div className="actions">
        <button className="btn" onClick={onClose}>
          {t('cancel')}
        </button>
        <button className="btn primary" disabled={busy || (mode === 'link' && (!h || (slotted && !(h.slots?.length ?? 0))))} onClick={join}>
          {t('fr_join')}
        </button>
      </div>
    </Modal>
  );
}
