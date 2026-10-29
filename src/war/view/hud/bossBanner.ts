/**
 * W-67 the guardians' voice (docs/impl/neutral-polish.md "boss-voice"): a landmark guardian reads as a set piece.
 *
 *   top centre, under the guardian bar     the wake: "The guardian wakes", ✦ its name ✦, its title, its taunt; a
 *                                          phase: its name and the phase's line; its death: "Slain", its name, its
 *                                          epitaph (as the loot's beam rises); the Bandit King's escape and return.
 *
 * The lines live in src/data/warBosses.ts `voice`; a beast's are told, not said (no quotes). One banner at a time, the
 * rest wait their turn. `voices` reads them off snapshot changes (../bossFx.ts calls it per guardian, plays the beats
 * and hands each line here): a wake is the first time a guardian fights (or is hurt) since it came; a guardian already
 * fighting when first seen (a resume, a reconnect) never wakes again, and phases skipped at once each say their line.
 */
import type { BossSnap } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { warBoss } from '../../../data/warBosses';
import { uiZoom } from './kit';
import { laneBusy, Z } from './layout';
import { esc } from './roster/ui';

export type VoiceKind = 'wake' | 'phase' | 'slain' | 'fled' | 'back';
export interface Voice { kind: VoiceKind; boss: string; phase: number }
/** What `voices` remembers of a guardian between snapshots. */
export interface VoiceMem { phase: number; state: BossSnap['state']; woke: boolean }

const gone = (s: BossSnap['state']) => s === 'slain' || s === 'away';
/** Fighting, hurt or past its first phase: awake (a perched one shooting at nobody is not). */
const awake = (b: BossSnap) => b.state === 'fight' || b.state === 'flight' || b.state === 'flee' || b.phase > 0 || b.hp < b.maxHp * 0.999;

/** The first sight of a guardian: one already awake (or down) does not wake again. */
export const voiceMem = (b: BossSnap): VoiceMem => ({ phase: b.phase, state: b.state, woke: gone(b.state) || awake(b) });

/** What a guardian says since the last snapshot `m` (updated): back, fled or slain, the wake, then each phase entered. */
export function voices(m: VoiceMem, b: BossSnap): Voice[] {
  const out: Voice[] = [];
  const say = (kind: VoiceKind, phase = b.phase) => out.push({ kind, boss: b.id, phase });
  if (gone(m.state) && !gone(b.state)) {
    if (m.state === 'away') say('back');
    m.woke = false;
  }
  if (b.state === 'away' && m.state !== 'away') say('fled');
  else if (b.state === 'slain' && m.state !== 'slain') say('slain');
  if (!gone(b.state)) {
    if (!m.woke && awake(b)) (m.woke = true), say('wake');
    for (let p = m.phase + 1; p <= b.phase; p++) say('phase', p);
  }
  m.phase = b.phase;
  m.state = b.state;
  return out;
}

/** A voice's line from the boss's data (null: it has none, e.g. a flight for a guardian that never flees). */
export function voiceLine(v: Voice): string | null {
  const d = warBoss(v.boss)?.voice;
  if (!d) return null;
  if (v.kind === 'wake') return d.wake;
  if (v.kind === 'phase') return d.phases[v.phase - 1] ?? null;
  if (v.kind === 'slain') return d.epitaph;
  return d[v.kind] ?? null;
}

const CSS = `
#rfBossBanner{left:50%;top:120px;z-index:${Z.banner};pointer-events:none;min-width:300px;padding:8px 26px 11px;text-align:center;transform:translateX(-50%);transition:opacity .5s,transform .5s;animation:bbIn .45s cubic-bezier(.2,.7,.3,1)}
#rfBossBanner.out{opacity:0;transform:translateX(-50%) translateY(-6px)}
@keyframes bbIn{from{opacity:0;transform:translateX(-50%) scale(.94)}to{opacity:1;transform:translateX(-50%) scale(1)}}
#rfBossBanner .bb-k{font:700 10px/1 Inter,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:var(--rf-gold)}
#rfBossBanner.wake .bb-k{color:var(--hud-bad)}
#rfBossBanner.slain .bb-k{color:var(--rf-good)}
#rfBossBanner .bb-n{margin-top:6px;font:700 21px/1.1 Cinzel,serif;letter-spacing:.04em;white-space:nowrap;color:var(--rf-title);text-shadow:0 1px 0 #000,0 0 14px rgba(226,189,104,.35)}
#rfBossBanner.slain .bb-n{font-size:18px}
#rfBossBanner .bb-n i{font-style:normal;color:var(--hud-gold-lo);font-size:.7em;vertical-align:.18em;margin:0 .45em}
#rfBossBanner .bb-t{margin-top:4px;font:italic 12.5px/1.2 Georgia,serif;color:var(--rf-muted)}
#rfBossBanner .bb-r{height:1px;margin:8px auto 7px;width:62%;background:linear-gradient(90deg,transparent,var(--hud-gold-lo),transparent)}
#rfBossBanner .bb-l{max-width:380px;margin:5px auto 0;font:italic 15px/1.35 Georgia,serif;color:var(--rf-ink)}
#rfBossBanner .bb-r+.bb-l{margin-top:0}
#rfBossBanner .bb-k{white-space:nowrap}
#rfBossBanner .bb-l.told{color:#d6cdb9}
`;
let styled = false;
const style = () => {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
};

/** How long each kind stays (ms), and the epitaph's wait for the loot's beam (../bossFx.ts death). */
const LIFE: Record<VoiceKind, number> = { wake: 6000, phase: 4200, slain: 6500, fled: 4200, back: 4200 };
const EPITAPH_AFTER = 1600;

const queue: { v: Voice; name: string }[] = [];
let showing = false;

/** Show a guardian's line (one banner at a time; later ones wait their turn). `name`: its name as the bar shows it. */
export function bossVoice(v: Voice, name: string): void {
  if (!voiceLine(v)) return;
  if (v.kind === 'slain') return void setTimeout(() => enqueue(v, name), EPITAPH_AFTER);
  enqueue(v, name);
}
function enqueue(v: Voice, name: string): void {
  style();
  queue.push({ v, name });
  if (!showing) next();
}

/** The banner's inner html. */
export function bannerHtml(v: Voice, name: string): string {
  const d = warBoss(v.boss)?.voice, line = voiceLine(v) ?? '', told = !!d?.mute;
  const said = `<div class="bb-l${told ? ' told' : ''}">${told ? esc(line) : `“${esc(line)}”`}</div>`;
  const Name = esc(name.charAt(0).toUpperCase() + name.slice(1));
  switch (v.kind) {
    case 'wake': return `<div class="bb-k">The guardian wakes</div><div class="bb-n"><i>✦</i>${Name}<i>✦</i></div><div class="bb-t">${esc(d?.title ?? '')}</div><div class="bb-r"></div>${said}`;
    case 'slain': return `<div class="bb-k">Slain</div><div class="bb-n">${Name}</div><div class="bb-r"></div>${said}`;
    case 'fled': return `<div class="bb-k">${Name} escapes</div>${said}`;
    case 'back': return `<div class="bb-k">${Name} returns</div>${said}`;
    default: return `<div class="bb-k">${Name}</div>${said}`;
  }
}

function next(): void {
  const q = queue.shift();
  let el = document.getElementById('rfBossBanner');
  if (!q) {
    showing = false;
    return;
  }
  showing = true;
  // the centre lane takes one banner at a time (./layout.ts): a quest banner up finishes first
  if (laneBusy('rfBossBanner')) { queue.unshift(q); setTimeout(next, 400); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'rfBossBanner';
    document.body.appendChild(el);
  }
  el.className = `rf rf-card ${q.v.kind}`;
  el.style.zoom = String(uiZoom());
  el.innerHTML = bannerHtml(q.v, q.name);
  el.style.display = '';
  // restart the entrance
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  const life = LIFE[q.v.kind];
  setTimeout(() => el!.classList.add('out'), life);
  setTimeout(() => { el!.style.display = 'none'; next(); }, life + 500);
}

/** Wire the guardians' FX (../bossFx.ts) to the banner. */
export function mountBossBanner(s: SandboxScene): void {
  s.guardians.fx.onVoice = (v, b) => bossVoice(v, b.name);
}
