/**
 * The menu's screens (./main.ts drives them): sign in, the title menu (Continue), alliance, home region on the world
 * map, squad, and the march-in choice. Each renders into the stage and calls back with the player's choice; mouse and
 * keyboard both work (Tab and Enter everywhere, arrows across cards and lists, Esc goes back).
 */
import { CLASSES, isClassId } from '../../data/classes';
import { warStats } from '../sim/classes';
import { FAMILY_OF } from '../sim/skills';
import { ALLIANCES } from '../world/alliances';
import { worldRegion } from '../world/graph';
import type { AllianceId } from '../world/types';
import { WorldMap, type MapState } from '../world-view/map';
import type { RegionState, WorldSnapshot } from '../net/world';
import { bar, icon, UNIT_ICON, uiZoom } from '../view/hud/kit';
import { card, fx, term, termCard, val } from '../view/hud/codex';
import { placeTip } from '../view/hud/kit';
import { call, type StartView } from './api';

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
      <div class="mn-row" style="justify-content:space-between"><button type="button" class="mn-link" data-k="forgot">Forgot the password?</button><span class="rf-dim" style="font-size:11px">One account plays on every device</span></div>
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

export interface TitleInfo { name: string; alliance: AllianceId | null; home: string | null; men: number; where: string | null }
export interface TitleHandlers { continue(): void; world(): void; settings(): void; signOut(): void }

export function titleScreen(stage: HTMLElement, t: TitleInfo, h: TitleHandlers): void {
  const a = t.alliance !== null ? ALLIANCES[t.alliance] : null, place = worldRegion(t.where ?? t.home ?? '')?.name ?? '';
  stage.innerHTML = `<div class="rf-card mn-card" style="width:360px">
    ${a ? `<div class="mn-row" style="gap:10px;margin-bottom:10px"><img src="war/world/banners/${a.key}.png" srcset="war/world/banners/${a.key}@2x.png 2x" width="29" height="47" alt="" style="image-rendering:pixelated">
      <div><div class="rf-name">${esc(t.name)}</div><div class="rf-dim" style="font-size:11.5px">Serves ${a.name} · ${plural(t.men, 'man', 'men')}${place ? ` · ${t.where ? 'in' : 'home'} ${esc(place)}` : ''}</div></div></div>` : ''}
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

/** The world map with the alliance's home choices lit; a side card lists them. Returns a stop function. */
export function homeScreen(root: HTMLElement, v: StartView, pick: (id: string) => Promise<void>, back: () => void): () => void {
  const a = ALLIANCES[v.alliance!];
  const canvas = document.createElement('canvas');
  canvas.className = 'mn-map';
  root.prepend(canvas);
  const side = document.createElement('div');
  side.className = 'rf-card mn-card mn-side';
  root.appendChild(side);
  const free = v.homes.filter((h) => !h.refusal);
  let sel: string | null = v.home ?? free.find((h) => h.role === 'home')?.id ?? free[0]?.id ?? null;
  let hover: string | null = null;
  let map: WorldMap | null = null;
  let regions = new Map<string, RegionState>();
  let alive = true;
  const st = (): MapState => ({ regions, transit: [], squads: new Map(), you: v.alliance, hover, selected: sel, squadAt: null, targets: new Set(free.map((h) => h.id)), routes: false, now: Date.now(), convoys: [], haul: null });

  const render = () => {
    side.innerHTML = `<div class="mn-h"><span class="rf-name">Choose your home</span><span class="rf-dim" style="margin-left:auto;font-size:11px">${a.name}</span></div>
      <div class="mn-sub">Your squad musters here, and you come back here. Lit regions on the map are free.</div>
      ${v.homes.map((h) => `<button class="mn-home${h.id === sel ? ' on' : ''}" data-h="${h.id}" ${h.refusal ? 'disabled' : ''}>
        <div style="min-width:0"><div class="nm">${esc(h.name)}</div>
        <div class="meta">${plural(h.players, 'player')} · ${h.men}/${h.quota} men</div>${h.refusal ? `<div class="why">${esc(h.refusal)}</div>` : ''}</div>
        <span class="tag">${ROLE_NAME[h.role]}</span></button>`).join('')}
      <div class="mn-msg bad"></div>
      <div class="mn-row"><button class="rf-tbtn" data-k="back">Back</button><button class="rf-tbtn pri" data-k="ok" style="margin-left:auto" ${sel ? '' : 'disabled'}>Make ${esc(worldRegion(sel ?? '')?.name ?? 'it')} my home</button></div>`;
    side.querySelector<HTMLElement>('[data-k=back]')!.onclick = back;
    side.querySelector<HTMLElement>('[data-k=ok]')!.onclick = confirm;
    const rows = [...side.querySelectorAll<HTMLButtonElement>('.mn-home')];
    for (const r of rows) {
      r.onclick = () => { sel = r.dataset.h!; render(); side.querySelector<HTMLElement>(`[data-h="${sel}"]`)?.focus(); };
      r.ondblclick = confirm;
      r.onmouseenter = () => (hover = r.dataset.h!);
      r.onmouseleave = () => (hover = null);
      r.onfocus = () => (hover = r.dataset.h!);
    }
    side.onkeydown = (e) => {
      if (e.key === 'Escape') return back();
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
    const z = uiZoom(), w = side.getBoundingClientRect().width;
    map.fit({ top: 70 * z, left: w + 40 * z, right: 20 * z, bottom: 20 * z });
    // the alliance's quarter, larger: zoom on the choices' middle
    const art = map.art.regions, ids = v.homes.map((h) => h.id).filter((id) => art[id]);
    if (ids.length) {
      const cx = ids.reduce((s, id) => s + art[id].centroid[0], 0) / ids.length, cy = ids.reduce((s, id) => s + art[id].centroid[1], 0) / ids.length;
      const [sx, sy] = map.toScreen(cx, cy), mid = (w + 40 * z + innerWidth) / 2;
      map.zoom(1.7, sx, sy);
      const [nx, ny] = map.toScreen(cx, cy);
      map.x += (nx - mid) / map.k;
      map.y += (ny - innerHeight / 2 - 20 * z) / map.k;
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
    hover = id && v.homes.some((h) => h.id === id) ? id : null;
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

// ------------------------------------------------------------------ squad

const ROLE: Record<string, { role: string; line: string }> = {
  militia: { role: 'Levy · line', line: 'Cheap spears: bodies to fill a line, haul stone and hold ground. Brittle in a straight fight.' },
  hoplite: { role: 'Heavy infantry · line', line: 'The wall: a big shield and a long spear. Holds a line or a gate against anything on foot.' },
  celt_sword: { role: 'Shock infantry', line: 'Long blades, little armour: breaks a line and finishes the wounded, but melts under arrows.' },
  archer: { role: 'Missile · long range', line: 'The farthest shot: thins a charge before it lands and shoots best from walls and heights. Weak hand to hand.' },
  slinger: { role: 'Missile · mid range', line: 'Stones that crack armour at mid range. Light and quick; never let him be caught.' },
  javelineer: { role: 'Missile · skirmisher', line: 'Heavy javelins thrown close, then a spear: strikes, falls back, strikes again.' },
};

interface ClassFacts { hp: number; melee: number; missile: number; armour: number; block: number; range: number; speed: number; accuracy: number; blow: number; ammo: number }
const facts = (cls: string): ClassFacts => {
  const s = warStats(cls);
  return { hp: s.maxHp, melee: s.dmg, missile: s.ammo > 0 ? s.rangedDmg : 0, armour: s.armor, block: s.block, range: s.range, speed: s.speed, accuracy: s.accuracy, blow: s.atkTicks / 10, ammo: s.ammo };
};
const r1 = (v: number) => String(Math.round(v * 10) / 10), pc = (v: number) => `${Math.round(v * 100)}%`;

/** The class's description card (the HUD's codex style). */
export function classCard(cls: string): string {
  const f = facts(cls), c = isClassId(cls) ? CLASSES[cls] : null, fam = FAMILY_OF[cls as keyof typeof FAMILY_OF];
  return card({
    icon: icon(UNIT_ICON[cls], 32), rawIcon: true, name: c?.name ?? cls, kind: `${ROLE[cls]?.role ?? ''}${fam ? ` · ${fam} family` : ''}`, flavour: c?.desc, w: 262,
    fx: [
      fx('ui:heart', `${term('health')} ${val(String(Math.round(f.hp)), '')}`),
      fx('ui:sword', `${term('melee')} ${val(r1(f.melee), '')} every ${val(r1(f.blow) + ' s', '')} · ${term('reach')} ${val(r1(warStats(cls).reach), '')}`),
      ...(f.missile ? [fx('ui:throw', `${term('missile')} ${val(r1(f.missile), '')} · ${term('range')} ${val(String(Math.round(f.range)), '')} tiles · ${term('ammo')} ${val(String(f.ammo), '')}`)] : []),
      fx('ui:armor', `${term('armour')} ${val(r1(f.armour), '')} · ${term('block')} ${val(pc(f.block), '')}`),
      fx('ui:eye', `${term('accuracy')} ${val(pc(f.accuracy), '')} · pace ${val(`×${r1(f.speed)}`, '')}`),
    ],
    more: `<div>${ROLE[cls]?.line ?? ''}</div>`,
  });
}

export function squadScreen(stage: HTMLElement, v: StartView, done: (classes: string[]) => Promise<void>, back: () => void): void {
  const classes = v.classes, max = v.squadMax;
  const count: Record<string, number> = Object.fromEntries(classes.map((c) => [c, 0]));
  // a sound default: a shield line with missiles behind
  Object.assign(count, { hoplite: 4, celt_sword: 2, archer: 3, slinger: 1, javelineer: 2 });
  for (const c of Object.keys(count)) if (!classes.includes(c)) delete count[c];
  let focus = 'hoplite';
  const all = classes.map(facts), top = (k: keyof ClassFacts) => Math.max(...all.map((f) => f[k] as number), 1e-6);
  const BARS: [keyof ClassFacts, string][] = [['hp', 'Health'], ['melee', 'Melee'], ['missile', 'Missile'], ['armour', 'Armour'], ['speed', 'Pace']];
  const total = () => Object.values(count).reduce((a, b) => a + b, 0);
  stage.innerHTML = `<div style="display:flex;gap:12px;align-items:flex-start">
    <div><div class="rf-name" style="font-size:20px">Muster your squad</div><div class="mn-sub" style="margin:4px 0 10px">Up to ${max} men, any mix. Every man is a person: he levels, is wounded, keeps his gear.</div>
      <div class="mn-sq">${classes.map((c) => {
        const f = facts(c);
        return `<div class="rf-card mn-cls" tabindex="0" data-c="${c}">
          <div class="top"><span class="cx-ic">${icon(UNIT_ICON[c], 32)}</span><div style="min-width:0"><div class="nm">${esc(isClassId(c) ? CLASSES[c].name : c)}</div><div class="role">${ROLE[c]?.role ?? ''}</div></div></div>
          <div class="bars">${BARS.map(([k, n]) => `<span>${n}</span>${bar(k === 'missile' ? 'burn' : k === 'hp' ? 'hp' : 'ok', (f[k] as number) / top(k), 116)}`).join('')}</div>
          <div class="cnt"><button class="rf-tbtn" data-d="-1" data-c="${c}" aria-label="one fewer">−</button><b data-n="${c}">0</b><button class="rf-tbtn" data-d="1" data-c="${c}" aria-label="one more">+</button></div>
        </div>`;
      }).join('')}</div></div>
    <div style="width:290px">
      <div class="rf-card mn-card">
        <div class="mn-row" style="justify-content:space-between"><span class="rf-cap" style="margin:0">Your squad</span><span><span class="mn-count" data-k="total">0</span><span class="rf-dim"> / ${max}</span></span></div>
        <div class="mn-slots" data-k="slots"></div>
        <div class="mn-msg" data-k="msg"></div>
        <div class="mn-row"><button class="rf-tbtn" data-k="back">Back</button><button class="rf-tbtn" data-k="clear">Clear</button><button class="rf-tbtn pri" data-k="go" style="margin-left:auto">Muster ${max} men</button></div>
      </div>
      <div class="rf-card mn-card" data-k="card" style="margin-top:8px;padding:10px 12px"></div>
    </div>
  </div>`;
  const q = <T extends HTMLElement>(s: string) => stage.querySelector<T>(s)!;
  // the class card's game terms: their own cards on hover (the HUD's codex)
  const tip = document.createElement('div');
  tip.className = 'rf rf-tip';
  tip.style.cssText = 'display:none;z-index:30';
  document.body.appendChild(tip);
  stage.addEventListener('mouseover', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.tt[data-term]');
    if (!t) return void (tip.style.display = 'none');
    tip.style.zoom = String(uiZoom());
    tip.innerHTML = termCard(t.dataset.term!);
    tip.style.display = '';
    placeTip(tip, t);
  });
  stage.addEventListener('mouseleave', () => (tip.style.display = 'none'));
  const render = () => {
    const n = total();
    for (const c of classes) q(`[data-n="${c}"]`).textContent = String(count[c] ?? 0);
    for (const b of stage.querySelectorAll<HTMLButtonElement>('[data-d]')) b.disabled = b.dataset.d === '1' ? n >= max : !count[b.dataset.c!];
    for (const el of stage.querySelectorAll<HTMLElement>('.mn-cls')) el.classList.toggle('on', el.dataset.c === focus);
    q('[data-k=total]').textContent = String(n);
    const order = classes.flatMap((c) => Array(count[c] ?? 0).fill(c) as string[]);
    q('[data-k=slots]').innerHTML = Array.from({ length: max }, (_, i) => order[i]
      ? `<button class="mn-slot full" data-rm="${order[i]}" title="${esc(CLASSES[order[i] as 'militia'].name)} (click: send home)">${icon(UNIT_ICON[order[i]], 32)}</button>`
      : '<span class="mn-slot"></span>').join('');
    const go = q<HTMLButtonElement>('[data-k=go]');
    go.disabled = n === 0;
    go.textContent = n ? `Muster ${plural(n, 'man', 'men')}` : 'Pick your men';
    q('[data-k=card]').innerHTML = classCard(focus);
    for (const b of stage.querySelectorAll<HTMLElement>('[data-rm]')) b.onclick = () => { count[b.dataset.rm!]--; render(); };
  };
  stage.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-d]');
    if (b) { const c = b.dataset.c!; count[c] = Math.max(0, (count[c] ?? 0) + Number(b.dataset.d)); focus = c; render(); return; }
    const card = (e.target as HTMLElement).closest<HTMLElement>('.mn-cls');
    if (card) { focus = card.dataset.c!; render(); }
  });
  const cards = [...stage.querySelectorAll<HTMLElement>('.mn-cls')];
  for (const c of cards) {
    c.onfocus = () => { focus = c.dataset.c!; render(); };
    c.onkeydown = (e) => {
      const k = c.dataset.c!;
      if (e.key === '+' || e.key === '=' || e.key === 'Enter') { e.preventDefault(); if (total() < max) count[k]++; render(); }
      else if (e.key === '-' || e.key === 'Backspace') { e.preventDefault(); if (count[k]) count[k]--; render(); }
    };
  }
  stage.onkeydown = (e) => { if (e.key === 'Escape') return back(); arrows(cards, 3)(e); };
  q('[data-k=back]').onclick = back;
  q('[data-k=clear]').onclick = () => { for (const c of classes) count[c] = 0; render(); };
  q('[data-k=go]').onclick = () => {
    const order = classes.flatMap((c) => Array(count[c] ?? 0).fill(c) as string[]);
    const m = q('[data-k=msg]');
    m.className = 'mn-msg';
    m.innerHTML = '<span class="mn-spin"></span>';
    done(order).then(() => tip.remove()).catch((err) => { m.className = 'mn-msg bad'; m.textContent = (err as Error).message; });
  };
  render();
  cards[1]?.focus();
}

// ------------------------------------------------------------------ ready: where to land

export function readyScreen(stage: HTMLElement, home: string, men: number, h: { region(): void; world(): void }): void {
  const name = worldRegion(home)?.name ?? home;
  stage.innerHTML = `<div class="rf-card mn-card" style="width:380px;text-align:left">
    <div class="mn-h"><span class="rf-name">Your men are mustered</span></div>
    <div class="mn-sub" style="margin:0 0 10px">${plural(men, 'man', 'men')} stand ready in ${esc(name)}. Where do you go first?</div>
    <button class="mn-big pri" data-k="region">${icon('act-move', 24)}<div><div class="t">March into ${esc(name)}</div><div class="d">Take command of your squad on the ground</div></div><kbd>Enter</kbd></button>
    <button class="mn-big" data-k="world">${icon('mode-biomes', 24)}<div><div class="t">Open the world map</div><div class="d">See the war first; enter your home from there</div></div></button>
  </div>`;
  stage.querySelector<HTMLElement>('[data-k=region]')!.onclick = h.region;
  stage.querySelector<HTMLElement>('[data-k=world]')!.onclick = h.world;
  stage.onkeydown = arrows([...stage.querySelectorAll<HTMLElement>('.mn-big')], 1);
  stage.querySelector<HTMLElement>('[data-k=region]')!.focus();
}
