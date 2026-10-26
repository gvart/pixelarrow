/**
 * The game's main menu (index.html, play.pixelarrow.app; docs/WAR.md "Starting a game"): sign in or create an email
 * account (a dev player on a local DEV_AUTH server), then on the first visit the start: alliance, home region, squad
 * (server/src/war/start.ts); then into the home region (sandbox.html, live) or the world map (world.html). A returning
 * player gets Continue. Settings (controls, display, sound) open from here and in game (Esc, F10).
 */
import { keys } from '../input/keys';
import { loadGlyphs } from '../view/hud/glyph';
import { uiZoom } from '../view/hud/kit';
import { worldRegion } from '../world/graph';
import { keptDevId } from '../net/session';
import * as api from './api';
import { allianceScreen, esc, homeScreen, readyScreen, signInScreen, squadScreen, titleScreen } from './screens';
import { openSettings, settingsOpen } from './settings';
import { injectMenuCss } from './style';

injectMenuCss();
void loadGlyphs();
const bg = document.createElement('div');
bg.className = 'mn-bg';
const root = document.createElement('div');
root.className = 'rf mn-root';
root.innerHTML = `<header class="mn-title"><h1>PIXELARROW</h1><div class="mn-orn"><i></i><b></b><i></i></div><p>The War for Metaxy</p></header><main class="mn-stage"></main>`;
const foot = document.createElement('div');
foot.className = 'rf mn-foot';
foot.innerHTML = 'Settings: F10 · Controls: ? · Esc goes back';
document.getElementById('game')?.remove();
document.body.append(bg, root, foot);
const stage = root.querySelector<HTMLElement>('.mn-stage')!;
let stop: (() => void) | null = null;

const zoom = () => { for (const el of [root, foot]) el.style.zoom = String(uiZoom()); };
zoom();
addEventListener('resize', zoom);

/** A fresh stage: the last screen's extras (the map) go; `full` hides the menu (the map screen), `compact` the title. */
function clear(full = false, compact = false): void {
  stop?.();
  stop = null;
  stage.innerHTML = '';
  stage.onkeydown = null;
  root.hidden = full;
  bg.style.display = full ? 'none' : '';
  root.classList.toggle('compact', compact);
  foot.style.display = full || compact ? 'none' : '';
  bg.classList.toggle('dim', false);
}

function wait(text: string): void {
  clear();
  stage.innerHTML = `<div class="rf-card mn-card" style="min-width:220px;text-align:center"><span class="mn-spin"></span> <span class="rf-dim">${esc(text)}</span></div>`;
}

function fail(e: unknown, retry: () => void): void {
  clear();
  stage.innerHTML = `<div class="rf-card mn-card" style="width:360px"><div class="mn-h"><span class="rf-name">The war cannot be reached</span></div>
    <div class="mn-msg bad">${esc((e as Error).message ?? String(e))}</div><div class="mn-row"><button class="rf-tbtn pri" data-k="retry">Try again</button><button class="rf-tbtn" data-k="out" style="margin-left:auto">Sign out</button></div></div>`;
  stage.querySelector<HTMLElement>('[data-k=retry]')!.onclick = retry;
  stage.querySelector<HTMLElement>('[data-k=out]')!.onclick = () => void api.signOut().then(signIn);
  stage.querySelector<HTMLElement>('[data-k=retry]')!.focus();
}

/** A dev player's id rides along (the war pages log in as him); an email account goes by its cookie. */
const devParam = () => (api.signedIn()?.dev && keptDevId() ? `&dev=${keptDevId()}` : '');
function enterRegion(id: string, alliance: number): void {
  location.href = `sandbox.html?region=${encodeURIComponent(id)}&net=${encodeURIComponent(`/ws/war/${id}`)}&world=1&team=${alliance}${devParam()}`;
}
function openWorld(): void {
  location.href = `world.html${devParam().replace('&', '?')}`;
}

function signIn(): void {
  clear();
  signInScreen(stage, {
    signIn: async (e, p, slot) => { await api.signIn(e, p, slot); await route(); },
    register: (e, p, slot) => api.register(e, p, slot),
    reset: (e, slot) => api.requestReset(e, slot),
    ...(import.meta.env.DEV ? { dev: async (id: number) => { await api.devSignIn(id); await route(); } } : {}),
  });
}

async function route(): Promise<void> {
  wait('Reading the war…');
  let v: api.StartView;
  try {
    v = await api.startView();
  } catch (e) {
    if (e instanceof api.ApiError && e.status === 401) return signIn();
    return fail(e, () => void route());
  }
  if (v.step === 'alliance') return alliance(v);
  if (v.step === 'home') return home(v);
  if (v.step === 'squad') return squad(v);
  return titleMenu(v);
}

function alliance(v: api.StartView): void {
  clear();
  allianceScreen(stage, v, async (a) => { home(await api.chooseAlliance(a)); });
}

function home(v: api.StartView): void {
  clear(true);
  stop = homeScreen(v, async (id) => { squad(await api.chooseHome(id)); }, () => alliance(v));
}

function squad(v: api.StartView): void {
  clear(false, true);
  bg.classList.add('dim');
  squadScreen(stage, v, async (classes) => {
    const done = await api.pickSquad(classes);
    clear();
    readyScreen(stage, done.home!, done.ids.length, { region: () => enterRegion(done.home!, done.alliance!), world: openWorld });
  }, () => home(v));
}

async function titleMenu(v: api.StartView): Promise<void> {
  wait('Mustering…');
  let men = 0, where: string | null = null, name = '';
  try {
    const [r, me] = await Promise.all([api.roster(), api.call<{ player: { displayName: string } }>('GET', '/api/me')]);
    const alive = r.persons.filter((p) => p.state !== 'dead');
    men = alive.length;
    // where his men stand (the region with most of them), else his home
    const by = new Map<string, number>();
    for (const p of alive) if (p.region && !p.region.startsWith('>') && worldRegion(p.region)) by.set(p.region, (by.get(p.region) ?? 0) + 1);
    where = [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    name = me.player.displayName;
  } catch (e) {
    return fail(e, () => void route());
  }
  clear();
  titleScreen(stage, { name, alliance: v.alliance, home: v.home, men, where }, {
    continue: () => enterRegion(where ?? v.home!, v.alliance ?? 0),
    world: openWorld,
    settings: () => openSettings('controls', { onScale: zoom }),
    signOut: () => void api.signOut().then(signIn),
  });
}

keys.setContexts(() => ['global']);
addEventListener('keydown', (e: KeyboardEvent) => {
  if (settingsOpen()) return;
  const a = keys.act(e);
  if (a === 'menu.settings') { e.preventDefault(); openSettings('controls', { onScale: zoom }); }
  else if (a === 'help.keys' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); openSettings('controls', { onScale: zoom }); }
});

void api.resume().then((a) => (a ? route() : signIn()), () => signIn());
