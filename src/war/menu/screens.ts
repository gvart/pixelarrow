/**
 * The menu's screens (./main.ts drives them): sign in, the title menu (Continue), alliance, home region on the world
 * map, path, and the march-in choice. Each renders into the stage and calls back with the player's choice; mouse and
 * keyboard both work (Tab and Enter everywhere, arrows across cards and lists, Esc goes back).
 */
import type { Family } from '../sim/skills';
import { ALLIANCES } from '../world/alliances';
import { worldRegion } from '../world/graph';
import type { AllianceId } from '../world/types';
import { WorldMap, type MapState } from '../world-view/map';
import type { RegionState, WorldSnapshot } from '../net/world';
import { icon, uiZoom } from '../view/hud/kit';
import { FAMILIES, FAMILY_IDS, PATH_IDS, PATHS, type PathId } from '../world/start';
import { call, type StartView, type TunnelInfo } from './api';
import { span, TUNNEL, wipeLine, wipeNext } from '../sim/tunnel';
import { DIFFICULTY_NAME, HOME_LORE } from './homeLore';

export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Arrow keys move focus across a row (or grid) of items. */
function arrows(items: HTMLElement[], cols = items.length): (e: KeyboardEvent) => void {
  return (e) => {
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? cols : e.key === 'ArrowUp' ? -cols : 0;
    if (!d) return;
    e.preventDefault();
    items[(i + d + items.length) % items.length].focus();
  };
}

// ------------------------------------------------------------------ sign in

export interface SignInHandlers {
  signIn(email: string, password: string, slot: HTMLElement): Promise<void>;
  register(email: string, password: string, slot: HTMLElement): Promise<void>;
  reset(email: string, slot: HTMLElement): Promise<void>;
  dev?(id: number): Promise<void>;
}

export function signInScreen(stage: HTMLElement, h: SignInHandlers): void {
  let mode: 'in' | 'new' = 'in';
  const devId = (() => { try { return Number(localStorage.getItem('war.lastDevId')) || 1; } catch { return 1; } })();
  stage.innerHTML = `<div class="rf-card mn-card" style="width:340px">
    <div class="mn-tabs" role="tablist"><button class="rf-tab on" data-m="in">Sign in</button><button class="rf-tab" data-m="new">Create account</button></div>
    <form novalidate>
      <label class="mn-lab" for="mnEmail">Email</label><input class="mn-in" id="mnEmail" type="email" autocomplete="email" required>
      <label class="mn-lab" for="mnPass">Password</label><input class="mn-in" id="mnPass" type="password" autocomplete="current-password" required minlength="8">
      <div class="mn-ts"></div>
      <div class="mn-msg" aria-live="polite"></div>
      <button class="mn-big pri" type="submit" style="justify-content:center"><span class="t">Enter Metaxy</span></button>
      <div class="mn-row" style="justify-content:space-between;margin-top:2px"><button type="button" class="mn-link" data-k="forgot">Forgot the password?</button><span class="rf-dim" style="font-size:11px">One account, every device</span></div>
    </form>
    ${h.dev ? `<div style="margin-top:12px;padding-top:8px;border-top:1px dashed var(--rf-rule)"><div class="mn-lab" style="margin-bottom:4px">Local server: dev player</div>
      <div class="mn-row"><input class="mn-in" id="mnDev" type="number" min="1" value="${devId}" style="width:90px;margin:0"><button type="button" class="rf-tbtn" data-k="dev" style="height:28px">Play as dev player</button></div></div>` : ''}
  </div>`;
  const form = stage.querySelector('form')!, msg = stage.querySelector<HTMLElement>('.mn-msg')!, ts = stage.querySelector<HTMLElement>('.mn-ts')!;
  const email = stage.querySelector<HTMLInputElement>('#mnEmail')!, pass = stage.querySelector<HTMLInputElement>('#mnPass')!;
  const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
  const say = (t: string, tone: '' | 'good' | 'bad' = '') => { msg.textContent = t; msg.className = `mn-msg ${tone}`; };
  const busy = async (f: () => Promise<void>) => {
    submit.disabled = true;
    say('');
    msg.innerHTML = '<span class="mn-spin"></span>';
    try { await f(); } catch (e) { say((e as Error).message, 'bad'); } finally { submit.disabled = false; }
  };
  for (const b of stage.querySelectorAll<HTMLElement>('[data-m]')) b.onclick = () => {
    mode = b.dataset.m as 'in' | 'new';
    for (const x of stage.querySelectorAll<HTMLElement>('[data-m]')) x.classList.toggle('on', x === b);
    submit.querySelector('.t')!.textContent = mode === 'in' ? 'Enter Metaxy' : 'Create account';
    pass.autocomplete = mode === 'in' ? 'current-password' : 'new-password';
    say(mode === 'new' ? 'We mail you a link; it signs you in and brings you back here.' : '');
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!email.value.includes('@')) return say('Enter your email address.', 'bad');
    if (pass.value.length < 8) return say('The password has at least 8 characters.', 'bad');
    void busy(async () => {
      if (mode === 'in') await h.signIn(email.value.trim(), pass.value, ts);
      else { await h.register(email.value.trim(), pass.value, ts); say(`Check ${email.value.trim()}: the link in the mail signs you in.`, 'good'); }
    });
  };
  stage.querySelector<HTMLElement>('[data-k=forgot]')!.onclick = () => {
    if (!email.value.includes('@')) return say('Enter your email address first.', 'bad');
    void busy(async () => { await h.reset(email.value.trim(), ts); say('If the address has an account, a reset link is on its way.', 'good'); });
  };
  const dev = stage.querySelector<HTMLElement>('[data-k=dev]');
  if (dev && h.dev) dev.onclick = () => {
    const id = Number(stage.querySelector<HTMLInputElement>('#mnDev')!.value) || 1;
    try { localStorage.setItem('war.lastDevId', String(id)); } catch { /* fine */ }
    void busy(() => h.dev!(id));
  };
  email.focus();
}

// ------------------------------------------------------------------ title (returning players)

export interface TitleInfo { name: string; alliance: AllianceId | null; home: string | null; men: number; where: string | null; favour?: { level: number; title: string } }
export interface TitleHandlers { continue(): void; world(): void; settings(): void; signOut(): void }

export function titleScreen(stage: HTMLElement, t: TitleInfo, h: TitleHandlers): void {
  const a = t.alliance !== null ? ALLIANCES[t.alliance] : null, place = worldRegion(t.where ?? t.home ?? '')?.name ?? '';
  stage.innerHTML = `<div class="rf-card mn-card" style="width:360px">
    ${a ? `<div class="mn-row" style="gap:10px;margin-bottom:10px"><img src="war/world/banners/${a.key}.png" srcset="war/world/banners/${a.key}@2x.png 2x" width="29" height="47" alt="" style="image-rendering:pixelated">
      <div><div class="rf-name">${esc(t.name)}${t.favour ? ` <span class="mn-fav" title="Divine favour: ${esc(t.favour.title)}">L${t.favour.level} ${esc(t.favour.title)}</span>` : ''}</div><div class="rf-dim" style="font-size:11.5px">Serves ${a.name} · ${plural(t.men, 'man', 'men')}${place ? ` · ${t.where ? 'in' : 'home'} ${esc(place)}` : ''}</div></div></div>` : ''}
    <button class="mn-big pri" data-k="continue">${icon('act-move', 24)}<div><div class="t">Continue</div><div class="d">${place ? `March into ${esc(place)}` : 'Back to the war'}</div></div><kbd>Enter</kbd></button>
    <button class="mn-big" data-k="world">${icon('mode-biomes', 24)}<div><div class="t">World map</div><div class="d">Regions, borders and your squads on the road</div></div></button>
    <button class="mn-big" data-k="settings">${icon('act-upgrade', 24)}<div><div class="t">Settings</div><div class="d">Controls, display and sound</div></div></button>
    <button class="mn-big" data-k="out">${icon('act-cancel', 24)}<div><div class="t">Sign out</div></div></button>
  </div>`;
  const by = (k: string) => stage.querySelector<HTMLElement>(`[data-k=${k}]`)!;
  by('continue').onclick = h.continue;
  by('world').onclick = h.world;
  by('settings').onclick = h.settings;
  by('out').onclick = h.signOut;
  const items = [...stage.querySelectorAll<HTMLElement>('.mn-big')];
  stage.onkeydown = arrows(items, 1);
  by('continue').focus();
}

// ------------------------------------------------------------------ alliance

const FLAVOUR: Record<string, string> = {
  dodona: 'Cold pine-and-oak highlands round a lake valley, under the Iron Teeth. Oracles in the oaks; iron in the hills.',
  skythia: 'An open steppe plateau of burial mounds and chalk cliffs. Horse peoples who ride before they walk.',
  kyrene: 'An oasis on a river terrace below red cliffs, at the edge of the dune sea. Copper, trade and old money.',
  elaia: 'Terraced olive hills round a bay, white with marble. Patient farmers, stubborn wall-builders.',
};
const BORDERS: Record<string, string> = { dodona: 'Iron Teeth, Lake Stymphalia', skythia: 'Iron Teeth, the Ammos dunes', kyrene: 'Ammos dunes, the Great River', elaia: 'Lake Stymphalia, the Great River' };

export function allianceScreen(stage: HTMLElement, v: StartView, pick: (a: AllianceId) => Promise<void>, back?: () => void): void {
  stage.innerHTML = `<div style="text-align:center">
    <div class="rf-name" style="font-size:20px">Choose your alliance</div>
    <div class="mn-sub" style="margin:4px 0 12px">You serve it for the whole season. Its men share your home, your wars and your fate.</div>
    <div class="mn-cards">${ALLIANCES.map((a) => {
      const n = v.alliances.find((x) => x.id === a.id)?.members ?? 0;
      return `<div class="rf-card mn-ally${v.alliance === a.id ? ' on' : ''}" tabindex="0" data-a="${a.id}">
        <img class="banner" src="war/world/banners/${a.key}@2x.png" alt="">
        <div class="rf-name"><span class="mn-swatch" style="background:${a.color}"></span>${a.name}</div>
        <div class="q">${a.quadrant} · ${a.specialty}</div>
        <div class="fl">${FLAVOUR[a.key]}</div>
        <div class="facts"><span>Players</span><b class="rf-num">${n}</b><span>Specialty</span><span style="display:flex;align-items:center;gap:3px">${icon(a.specialty === 'horses' ? 'unit-javelineer' : 'res-' + a.specialty)}${a.specialty}</span><span>Borders</span><span>${BORDERS[a.key]}</span></div>
        <button class="rf-tbtn pri" data-a="${a.id}" tabindex="-1">Serve ${a.name}</button>
      </div>`;
    }).join('')}</div>
    <div class="mn-msg bad" style="margin-top:8px"></div>
    ${back ? '<button class="rf-tbtn" data-k="back">Back</button>' : ''}
  </div>`;
  const msg = stage.querySelector<HTMLElement>('.mn-msg')!;
  const cards = [...stage.querySelectorAll<HTMLElement>('.mn-ally')];
  const go = (a: AllianceId) => {
    for (const c of cards) c.classList.toggle('on', Number(c.dataset.a) === a);
    msg.innerHTML = '<span class="mn-spin"></span>';
    pick(a).catch((e) => (msg.textContent = (e as Error).message));
  };
  for (const c of cards) {
    c.onclick = () => go(Number(c.dataset.a) as AllianceId);
    c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(Number(c.dataset.a) as AllianceId); } };
  }
  stage.onkeydown = arrows(cards);
  const b = stage.querySelector<HTMLElement>('[data-k=back]');
  if (b && back) b.onclick = back;
  (cards[v.alliance ?? 0] ?? cards[0]).focus();
}

// ------------------------------------------------------------------ home region

const ROLE_NAME = { home: 'Home city', entry: 'Gate region', neutral: 'Neutral', center: 'Centre' } as const;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** One home choice in full: its lore, what it means for play (difficulty, resources, beasts, where it leads), who is there. */
export function homeDetail(h: StartView['homes'][number], alliance: AllianceId): string {
  const r = worldRegion(h.id), l = HOME_LORE[h.id];
  if (!r) return '';
  const d = l?.difficulty ?? 2;
  const res = Object.entries(r.res).map(([k, n]) => `<span class="mn-res">${icon(k === 'horses' ? 'unit-javelineer' : `res-${k}`)}${cap(k)} <b>${n}</b></span>`).join('');
  const leads = r.adj.filter((id) => worldRegion(id)?.alliance !== alliance || r.role === 'home').map((id) => esc(worldRegion(id)?.name ?? id)).join(', ');
  const beasts = r.fauna.length ? r.fauna.map(cap).join(', ') : 'None. A home never falls';
  return `<div class="hd-top"><span class="nm">${esc(r.name)}</span><span class="tag">${ROLE_NAME[r.role]}</span><span class="mn-diff d${d}">${'<i></i>'.repeat(d)}${'<i class="o"></i>'.repeat(3 - d)}${DIFFICULTY_NAME[d]}</span></div>
    ${l ? `<div class="hd-lore">${esc(l.lore)}</div><div class="hd-play">${esc(l.play)}</div>` : ''}
    <div class="hd-facts">
      <span>Resources</span><span class="hd-res">${res}</span>
      <span>Beasts</span><span>${beasts}</span>
      <span>${r.role === 'home' ? 'Gates' : 'Leads to'}</span><span>${leads}</span>
    </div>`;
}

/** The world map with the alliance's home choices lit; a side card lists them. Returns a stop function. */
export function homeScreen(v: StartView, pick: (id: string) => Promise<void>, back: () => void): () => void {
  const a = ALLIANCES[v.alliance!];
  const canvas = document.createElement('canvas');
  canvas.className = 'mn-map';
  document.body.appendChild(canvas);
  const side = document.createElement('div');
  side.className = 'rf rf-card mn-card mn-side';
  side.style.zoom = String(uiZoom());
  side.style.zIndex = '5';
  document.body.appendChild(side);
  const free = v.homes.filter((h) => !h.refusal);
  let sel: string | null = v.home ?? free.find((h) => h.role === 'home')?.id ?? free[0]?.id ?? null;
  let hover: string | null = null;
  let map: WorldMap | null = null;
  let regions = new Map<string, RegionState>();
  let alive = true;
  const st = (): MapState => ({ regions, transit: [], squads: new Map(), you: v.alliance, hover, selected: sel, squadAt: null, targets: new Set(free.map((h) => h.id)), routes: false, now: Date.now(), convoys: [], haul: null });

  /** The detail of the hovered choice, else the selected one. */
  const detail = () => {
    const el = side.querySelector<HTMLElement>('[data-k=detail]');
    const h = v.homes.find((x) => x.id === (hover ?? sel));
    if (el) el.innerHTML = h ? homeDetail(h, v.alliance!) : '';
  };
  const setHover = (id: string | null) => { if (id !== hover) { hover = id; detail(); } };
  const render = () => {
    side.innerHTML = `<span class="mn-step">Step 2 of 3</span><div class="mn-h"><span class="rf-name">Choose your home</span><span class="mn-ally-tag"><span class="mn-swatch" style="background:${a.color}"></span>${a.name}</span></div>
      <div class="mn-homes">${v.homes.map((h) => `<button class="mn-home${h.id === sel ? ' on' : ''}" data-h="${h.id}" ${h.refusal ? 'disabled' : ''}>
        <div style="min-width:0;flex:1"><div class="nm">${esc(h.name)}</div>${h.refusal ? `<div class="meta why">${esc(h.refusal)}</div>` : ''}</div>
        ${h.refusal ? '' : `<span class="meta">${plural(h.players, 'player')} · ${h.men}/${h.quota}</span>`}
        <span class="mn-diff d${HOME_LORE[h.id]?.difficulty ?? 2}">${DIFFICULTY_NAME[HOME_LORE[h.id]?.difficulty ?? 2]}</span></button>`).join('')}</div>
      <div class="mn-hd" data-k="detail"></div>
      <div class="mn-msg bad"></div>
      <div class="mn-cta"><button class="mn-link mn-quiet" data-k="back">‹ Back</button><button class="mn-big pri" data-k="ok" ${sel ? '' : 'disabled'}><div><div class="t">Make ${esc(worldRegion(sel ?? '')?.name ?? 'it')} my home</div><div class="d">Next: choose your path</div></div><kbd>Enter</kbd></button></div>`;
    side.querySelector<HTMLElement>('[data-k=back]')!.onclick = back;
    side.querySelector<HTMLElement>('[data-k=ok]')!.onclick = confirm;
    const rows = [...side.querySelectorAll<HTMLButtonElement>('.mn-home')];
    for (const r of rows) {
      r.onclick = () => { sel = r.dataset.h!; render(); side.querySelector<HTMLElement>(`[data-h="${sel}"]`)?.focus(); };
      r.ondblclick = confirm;
      r.onmouseenter = () => setHover(r.dataset.h!);
      r.onmouseleave = () => setHover(null);
      r.onfocus = () => { sel = r.dataset.h!; for (const x of rows) x.classList.toggle('on', x === r); side.querySelector('[data-k=ok] .t')!.textContent = `Make ${worldRegion(sel)?.name ?? sel} my home`; detail(); };
    }
    detail();
    side.onkeydown = (e) => {
      if (e.key === 'Escape') return back();
      if (e.key === 'Enter' && (e.target as HTMLElement).classList.contains('mn-home')) { e.preventDefault(); return confirm(); }
      arrows(rows.filter((x) => !x.disabled), 1)(e);
    };
  };
  const confirm = () => {
    if (!sel) return;
    const m = side.querySelector<HTMLElement>('.mn-msg')!;
    m.innerHTML = '<span class="mn-spin"></span>';
    pick(sel).catch((e) => (m.textContent = (e as Error).message));
  };
  render();
  side.querySelector<HTMLElement>(sel ? `[data-h="${sel}"]` : '.mn-home')?.focus();

  const layout = () => {
    if (!map) return;
    const z = uiZoom(), r = side.getBoundingClientRect(), left = r.right + 16 * z;
    side.style.zoom = String(z);
    map.fit({ top: 16 * z, left, right: 16 * z, bottom: 16 * z });
    // the alliance's quarter, larger: the choices' box fills the free part of the screen
    const art = map.art.regions, ids = v.homes.map((h) => h.id).filter((id) => art[id]);
    if (ids.length) {
      const xs = ids.flatMap((id) => art[id].polygon.map((q) => q[0])), ys = ids.flatMap((id) => art[id].polygon.map((q) => q[1]));
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pad = 60;
      const fw = innerWidth - left - 24 * z, fh = innerHeight - 40 * z;
      map.k = Math.min(fw / (x1 - x0 + pad * 2), fh / (y1 - y0 + pad * 2));
      map.x = (x0 + x1) / 2 - (left + fw / 2) / map.k;
      map.y = (y0 + y1) / 2 - innerHeight / 2 / map.k;
    }
  };
  void WorldMap.load(canvas).then((m) => {
    map = m;
    layout();
    const frame = () => { if (!alive) return; m.draw(st()); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
  call<WorldSnapshot>('GET', '/api/war/world').then((s) => (regions = new Map(s.regions.map((r) => [r.id, r])))).catch(() => undefined);
  const at = (e: MouseEvent) => (map ? map.regionAt(...map.toMap(e.clientX, e.clientY)) : null);
  canvas.onmousemove = (e) => {
    const id = at(e);
    setHover(id && v.homes.some((h) => h.id === id) ? id : null);
    canvas.style.cursor = hover ? 'pointer' : 'default';
  };
  canvas.onclick = (e) => {
    const id = at(e), h = v.homes.find((x) => x.id === id);
    if (h && !h.refusal) { sel = h.id; render(); }
  };
  canvas.ondblclick = (e) => { const id = at(e); if (id && free.some((h) => h.id === id)) { sel = id; confirm(); } };
  addEventListener('resize', layout);
  return () => { alive = false; removeEventListener('resize', layout); canvas.remove(); side.remove(); };
}

// ------------------------------------------------------------------ path

const PATH_ICON: Record<PathId, string> = { warrior: 'act-attack', builder: 'act-build', trader: 'trade-cart' };

/** One path, as its card shows it: what you do, what you start with, how far you grow. */
export function pathCard(id: PathId): string {
  const p = PATHS[id];
  return `<div class="rf-card mn-path" tabindex="0" role="radio" aria-checked="false" data-p="${id}">
    <div class="top"><span class="cx-ic big">${icon(PATH_ICON[id], 32)}</span><span class="nm">${p.name}</span></div>
    <div class="does">${esc(p.does)}</div>
    <div class="facts"><div><span>Start:</span> ${esc(p.startText)}</div><div><span>Grows to</span> ${p.cap} soldiers by claiming souls</div></div>
  </div>`;
}

/** W-83: the season's path, and a warrior's family (W-86). The choice is made once: the button says so. */
export function pathScreen(stage: HTMLElement, done: (path: PathId, family: Family | null) => Promise<void>, back: () => void): void {
  let path: PathId | null = null, family: Family | null = null, busy = false;
  stage.innerHTML = `<div class="mn-pa">
    <div class="mn-mu-h"><span class="mn-step">Step 3 of 3</span><div class="rf-name">Choose your path</div><div class="mn-sub">What you do this season. You choose once and keep it for all 28 days.</div></div>
    <div class="mn-paths" role="radiogroup" aria-label="Path">${PATH_IDS.map(pathCard).join('')}</div>
    <div class="rf-card mn-fams" data-k="fams" hidden>
      <div class="rf-name">Choose your family</div>
      <div class="mn-sub">All your soldiers come from it, this season and as you grow.</div>
      <div class="list" role="radiogroup" aria-label="Family">${FAMILY_IDS.map((id) => `<button class="mn-fam" role="radio" aria-checked="false" data-f="${id}"><span class="nm">${esc(FAMILIES[id].name)}</span><span class="does">${esc(FAMILIES[id].does)}</span><span class="men">${esc(FAMILIES[id].startText)}</span></button>`).join('')}</div>
    </div>
    <div class="mn-msg" data-k="msg"></div>
    <div class="mn-cta"><button class="mn-link mn-quiet" data-k="back">‹ Back to home</button><button class="mn-big pri" data-k="go"><div><div class="t" data-k="go-t"></div><div class="d" data-k="go-d"></div></div></button></div>
  </div>`;
  const q = <T extends HTMLElement>(s: string) => stage.querySelector<T>(s)!;
  const cards = [...stage.querySelectorAll<HTMLElement>('.mn-path')], fams = [...stage.querySelectorAll<HTMLElement>('.mn-fam')];
  const go = q<HTMLButtonElement>('[data-k=go]');
  const render = () => {
    for (const c of cards) { const on = c.dataset.p === path; c.classList.toggle('on', on); c.setAttribute('aria-checked', String(on)); }
    for (const f of fams) { const on = f.dataset.f === family; f.classList.toggle('on', on); f.setAttribute('aria-checked', String(on)); }
    q('[data-k=fams]').hidden = path !== 'warrior';
    const ready = !!path && (path !== 'warrior' || !!family);
    go.disabled = !ready || busy;
    q('[data-k=go-t]').textContent = !path ? 'Choose a path' : !ready ? 'Choose a family' : path === 'warrior' ? `Begin as a warrior of the ${FAMILIES[family!].name}` : `Begin as a ${PATHS[path].name.toLowerCase()}`;
    q('[data-k=go-d]').textContent = ready ? 'You cannot change this until the next season' : 'You can look at each one first';
  };
  const choose = (c: HTMLElement) => { path = c.dataset.p as PathId; if (path !== 'warrior') family = null; render(); };
  for (const c of cards) {
    c.onclick = () => choose(c);
    c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(c); } };
  }
  for (const f of fams) f.onclick = () => { family = f.dataset.f as Family; render(); };
  stage.onkeydown = (e) => {
    if (e.key === 'Escape') return back();
    arrows(cards)(e);
    arrows(fams)(e);
  };
  q('[data-k=back]').onclick = back;
  go.onclick = () => {
    if (!path || busy) return;
    const m = q('[data-k=msg]');
    busy = true;
    m.className = 'mn-msg';
    m.innerHTML = '<span class="mn-spin"></span>';
    render();
    done(path, family).catch((err) => { busy = false; m.className = 'mn-msg bad'; m.textContent = (err as Error).message; render(); });
  };
  render();
}

// ------------------------------------------------------------------ ready: where to land

export function readyScreen(stage: HTMLElement, home: string, men: number, h: { region(): void; world(): void }): void {
  const name = worldRegion(home)?.name ?? home;
  stage.innerHTML = `<div class="rf-card mn-card" style="width:380px;text-align:left">
    <div class="mn-h"><span class="rf-name">Your men are ready</span></div>
    <div class="mn-sub" style="margin:0 0 10px">${plural(men, 'man', 'men')} stand ready in ${esc(name)}. Where do you go first?</div>
    <button class="mn-big pri" data-k="region">${icon('act-move', 24)}<div><div class="t">March into ${esc(name)}</div><div class="d">Command your squad on the ground</div></div><kbd>Enter</kbd></button>
    <button class="mn-big" data-k="world">${icon('mode-biomes', 24)}<div><div class="t">Open the world map</div><div class="d">See the war first; enter your home from there</div></div></button>
  </div>`;
  stage.querySelector<HTMLElement>('[data-k=region]')!.onclick = h.region;
  stage.querySelector<HTMLElement>('[data-k=world]')!.onclick = h.world;
  stage.onkeydown = arrows([...stage.querySelectorAll<HTMLElement>('.mn-big')], 1);
  stage.querySelector<HTMLElement>('[data-k=region]')!.focus();
}

// ------------------------------------------------------------------ W-66: the army destroyed

/** His last man fell: the shades walk back through the Tunnel of Shades at home; the time until the first man rises. */
export function destroyedScreen(stage: HTMLElement, home: string, t: TunnelInfo, h: { watch(): void; back(): void; due?(): void }): () => void {
  const name = worldRegion(home)?.name ?? home;
  stage.innerHTML = `<div class="rf-card mn-card" style="width:380px;text-align:center">
    <div class="mn-h"><span class="rf-name">Your army is destroyed</span></div>
    <div class="mn-sub" style="margin:0 0 10px;font-style:italic">The shades of your fallen walk back through the Tunnel of Shades in ${esc(name)}.</div>
    <div style="margin-bottom:4px"><span data-k="h"></span> <b data-k="t" style="color:#bfe0ff">…</b></div>
    <div data-k="l" style="font-size:12px;margin-bottom:6px"></div>
    <div class="rf-dim" style="font-size:11.5px;margin-bottom:12px">Until ${TUNNEL.floor} men stand again, one rises every ${TUNNEL.everyMs / 60_000} minutes. Past ${TUNNEL.floor}, men come only from souls.</div>
    <button class="mn-big pri" data-k="watch">${icon('act-move', 24)}<div><div class="t">Watch the tunnel</div><div class="d">Go home to ${esc(name)}</div></div><kbd>Enter</kbd></button>
    <button class="mn-big" data-k="back">${icon('act-cancel', 24)}<div><div class="t">Back</div></div></button>
  </div>`;
  const el = stage.querySelector<HTMLElement>('[data-k=t]')!, head = stage.querySelector<HTMLElement>('[data-k=h]')!, line = stage.querySelector<HTMLElement>('[data-k=l]')!;
  // the first man back: the next rise, a wounded man fit or a captive home, whichever comes first
  const show = () => {
    const now = Date.now(), n = wipeNext(t);
    head.textContent = n.text;
    el.textContent = n.at === null ? '…' : span(n.at - now);
    line.textContent = wipeLine(t, now);
    return n.at;
  };
  show();
  const tick = setInterval(() => {
    const at = show();
    // his man is due: read again (the read raises him, or settles the healed and the freed)
    if (at && h.due && Date.now() >= at + 1000) (clearInterval(tick), h.due());
  }, 500);
  stage.querySelector<HTMLElement>('[data-k=watch]')!.onclick = () => (clearInterval(tick), h.watch());
  stage.querySelector<HTMLElement>('[data-k=back]')!.onclick = () => (clearInterval(tick), h.back());
  stage.onkeydown = arrows([...stage.querySelectorAll<HTMLElement>('.mn-big')], 1);
  stage.querySelector<HTMLElement>('[data-k=watch]')!.focus();
  return () => clearInterval(tick);
}
