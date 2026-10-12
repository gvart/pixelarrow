// Regression: one flow per hub (QA-02; production/qa/qa-plan-v5.md §5.3 hub-flows).
// In fake Telegram (Back is its header button), with the API down:
//   1. the tab bar, tapped like a finger, reaches every hub; a hub is a root
//      (Telegram shows Close, Back leaves it where it is) and is not left with
//      a stale screen under it;
//   2. every door in scripts/regression/doors.mjs opens its screen and Back
//      lands on the screen-flow §3 target (no dead end, no wrong origin);
//   3. no page or console error on the way.
// Regression classes from this run: Army/Hero Back to the wrong origin (N2/N3),
// a tap swallowed by a hub's entry fade (FIXER-5), the duel hub's Back leaving
// for the menu from a sub-view, a door that left two scenes running.
// Usage: node scripts/regression/hub-flows.mjs [baseUrl]   (needs a running preview server)
import { launch, check, until, baseUrl, openGame, settled, running, pressBack, navState, startScene, tapId, need, flow } from './lib.mjs';
import { finish } from '../lib/harness.mjs';
import { DOORS, TABS } from './doors.mjs';

const base = baseUrl();
const browser = await launch();
const t0 = Date.now();
const { page, errors, api, ok } = await openGame(browser, base);
check('boot: the Campaign hub settles', ok);

// The event deck (EV-03) can raise a card on the map, which is a layer (Back would close it, not leave the
// screen): answer any card with its free choice, as scripts/smoke.mjs does. The card has its own tests.
await api.ev(() =>
  setInterval(() => {
    for (const k of ['World', 'Settlement', 'Camp']) {
      const c = window.__game.scene.isActive(k) && window.__game.scene.getScene(k).eventCard;
      if (c && !c.choose(c.freeKey)) c.close();
    }
  }, 200),
);

/** Ready for Back: settled, and the duel hub past its Back guard (DuelScene BACK_GUARD_MS) with its data in. */
async function ready(key) {
  if (!(await settled(api, key))) return false;
  // (outside Telegram's API the hub settles on its 'outside' state, with no profile)
  if (key === 'Duel') return until(() => api.call('Duel', "return s.st !== 'loading' && (s.st !== 'ready' || !!s.profile) && Date.now() - s.openedAt >= 600;"), 15000, 150);
  if (key === 'World' || key === 'Settlement' || key === 'Camp')
    return until(() => api.ev((k) => !window.__game.scene.getScene(k).eventCard && !window.__state.campaign?.world.s.pendingEvent, key), 15000, 150);
  return true;
}

/** `$startTown` in door data: the campaign's start town. */
async function resolve(data) {
  const town = await api.ev(() => window.__state.campaign?.world.map.start ?? null);
  return JSON.parse(JSON.stringify(data ?? {}).replace(/"\$startTown"/g, String(town)));
}

/** Only `key` runs (a door that leaves the old scene running under the new one is a bug). */
const alone = async (key) => (await running(api)).join('+') === key;

// ---------------------------------------------------------------- 1. the tab bar
await flow('tabs', async () => {
  let at = 'Menu';
  for (const [tab, hub] of [...TABS.slice(1), TABS[0]]) {
    need(`tab ${tab}: tapped on the ${at} tab bar`, await tapId(api, at, `tab.${tab}`));
    need(`tab ${tab}: ${hub} settles`, await ready(hub), JSON.stringify(await running(api)));
    check(`tab ${tab}: ${hub} runs alone`, await alone(hub), JSON.stringify(await running(api)));
    const nav = await navState(api);
    check(`tab ${tab}: a root (Telegram Close, no Back)`, !nav.back && !nav.tgBack && nav.layers === 0, JSON.stringify(nav));
    await pressBack(api);
    check(`tab ${tab}: Back on the root stays on ${hub}`, (await settled(api, hub, 3000)) && (await alone(hub)), JSON.stringify(await running(api)));
    at = hub;
  }
});

// ---------------------------------------------------------------- 2. the doors
for (const d of DOORS) {
  await flow(d.name, async () => {
    await startScene(api, d.from[0], await resolve(d.from[1]));
    need(`${d.name}: ${d.from[0]} settles`, await ready(d.from[0]), JSON.stringify(await running(api)));
    if (d.prep) need(`${d.name}: staged`, await api.call(d.from[0], d.prep));
    if (d.via.tap) need(`${d.name}: tap ${d.via.tap}`, await tapId(api, d.from[0], d.via.tap));
    else if (d.via.start) await startScene(api, d.via.start[0], await resolve(d.via.start[1]));
    else await api.call(d.from[0], `${d.via.call} return 1;`);
    need(`${d.name}: ${d.at} opens`, (await ready(d.at)) && (await alone(d.at)), JSON.stringify(await running(api)));
    if (d.at !== d.back) check(`${d.name}: Telegram shows Back`, (await navState(api)).tgBack);
    else need(`${d.name}: the sub-view shows Back`, await until(async () => (await navState(api)).back, 5000, 150));
    await pressBack(api);
    const landed = (await ready(d.back)) && (await alone(d.back)) && (!d.state || (await until(() => api.call(d.back, d.state), 5000, 150)));
    check(`${d.name}: Back -> ${d.back}`, landed, JSON.stringify({ running: await running(api), nav: await navState(api) }));
  });
}

check('no page or console errors', errors.length === 0, errors.join(' | ').slice(0, 2000));
console.log(`hub-flows: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await finish({ browser });
