// CT-03: undo. Deployment: three mis-drags undone step by step; Reset all confirms.
// Battle: an order, then Undo within 3 s; the chip expires after 3 s.
// Touch play (hasTouch, isMobile) at 390x844 and 360x780, en and ru.
// Usage: node docs/v5/stories/CT-03/play.mjs http://localhost:<port>/
// Writes JPEGs next to this file and prints PASS/FAIL per check.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, phoneContext, captureErrors, makePageApi, check, finish } from '../../../../scripts/lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = dirname(fileURLToPath(import.meta.url));
const browser = await launch();

for (const [w, h, lang] of [
  [390, 844, 'en'],
  [390, 844, 'ru'],
  [360, 780, 'en'],
  [360, 780, 'ru'],
]) {
  const tag = `${w}x${h}-${lang}`;
  const ctx = await phoneContext(browser, { viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = captureErrors(page);
  const { ev, call, wait, tap, touch, until, untilPage, active, tapBtn } = makePageApi(page, { btnWaitMs: 4000 });
  const shot = (name) => page.screenshot({ path: `${out}/${tag}-${name}.jpg`, type: 'jpeg', quality: 34 });

  await page.goto(`${base}?lang=${lang}`);
  await untilPage(() => !!window.__game && window.__game.scene.isActive('Menu'), 30000);
  await ev(() => (window.__state.campaign.data.settings.seenGestureHint = true));
  await ev(() => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true })));
  check(`[${tag}] deployment opens`, await until(() => active('Battle'), 15000));
  await wait(2500);

  const gidOf = (numeral) => call('Battle', `return s.cards.find((k) => k.numeral === '${numeral}').gid;`);
  const cardPt = (numeral) => call('Battle', `const c = s.cards.find((k) => k.numeral === '${numeral}'); const r = c.card.getBounds(); return window.__css(r.centerX, r.centerY);`);
  const select = async (numeral) => {
    if ((await call('Battle', 'return s.selGroup;')) === (await gidOf(numeral))) return;
    const q = await cardPt(numeral);
    await tap(q[0], q[1]);
  };
  const form = (gid) => call('Battle', `const f = s.sim.groups[${gid}].formation; return [f.type, +f.cx.toFixed(3), +f.cy.toFixed(3), +f.fx.toFixed(3), +f.fy.toFixed(3), f.frontage].join(' ');`);
  /** The selected group's middle man, on screen (CSS px). */
  const bodyPt = () => call('Battle', `const b = s.hitState().body; const m = b[Math.floor(b.length / 2)]; return window.__css(m.x, m.y);`);
  const mis = async (dx, dy) => {
    const p = await bodyPt();
    await touch('touchStart', [p]);
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', [[p[0] + (dx * i) / 10, p[1] + (dy * i) / 10]]);
      await wait(16);
    }
    await touch('touchEnd', []);
    await wait(350);
  };
  const undoOff = () => call('Battle', `let off = null; const walk = (l) => l.forEach((o) => { if (o.__uiId === 'battle.undo') off = !o.enabled; if (o.list) walk(o.list); }); walk(s.hud.list); return off;`);

  // ---- deployment: three mis-drags, then undo them one by one (controls.md R4.2)
  await select('I');
  const I = await gidOf('I');
  const f0 = await form(I);
  check(`[${tag}] deployment Undo shows, disabled, before any change`, (await undoOff()) === true);
  const states = [f0];
  for (const [dx, dy] of [[70, -20], [-110, 10], [40, 30]]) {
    await mis(dx, dy);
    states.push(await form(I));
  }
  check(`[${tag}] three mis-drags moved group I`, new Set(states).size === 4, states.join(' | '));
  check(`[${tag}] deployment Undo enabled after a change`, (await undoOff()) === false);
  await shot('01-deploy-after-misdrags');
  for (let k = 3; k >= 1; k--) {
    check(`[${tag}] Undo tapped (step ${4 - k})`, await tapBtn('Battle', { id: 'battle.undo' }));
    await wait(350);
    const now = await form(I);
    check(`[${tag}] undo step ${4 - k} restores the formation before drag ${k}`, now === states[k - 1], `${now} vs ${states[k - 1]}`);
    if (k === 3) await shot('02-deploy-undo-one-step');
  }
  check(`[${tag}] back to the opening formation, Undo disabled again`, (await form(I)) === f0 && (await undoOff()) === true);
  await shot('03-deploy-all-undone');

  // ---- Reset all asks first (R4.3)
  await mis(60, 0);
  check(`[${tag}] Reset tapped`, await tapBtn('Battle', { id: 'battle.reset' }));
  await wait(400);
  check(`[${tag}] Reset all opens a confirm`, await call('Battle', 'return !!s.overlay;'));
  await shot('04-reset-confirm');
  const moved = await form(I);
  check(`[${tag}] confirm: Stay`, await tapBtn('Battle', lang === 'ru' ? 'Остаться' : 'Stay'));
  await wait(400);
  check(`[${tag}] Stay keeps the field as it was`, (await form(I)) === moved && !(await call('Battle', 'return !!s.overlay;')));

  // ---- battle: an order, then Undo within 3 s (R4.1)
  check(`[${tag}] Fight tapped`, await tapBtn('Battle', { id: 'battle.fight' }));
  check(`[${tag}] battle runs`, await untilPage(() => window.__game.scene.getScene('Battle').sim.phase === 'battle', 10000));
  await wait(1200);
  await select('I');
  const ord0 = await call('Battle', `return s.sim.groups[${I}].order;`);
  check(`[${tag}] Advance tapped`, await tapBtn('Battle', { id: 'battle.cmd.advance' }));
  await wait(300);
  check(`[${tag}] I advances`, (await call('Battle', `return s.sim.groups[${I}].order;`)) === 'advance');
  check(`[${tag}] the Undo chip shows after the order`, await call('Battle', 'return !!s.undoChip;'));
  await shot('05-battle-undo-chip');
  check(`[${tag}] Undo tapped within 3 s`, await tapBtn('Battle', { id: 'battle.undo' }));
  await wait(250);
  const ord1 = await call('Battle', `return s.sim.groups[${I}].order;`);
  check(`[${tag}] undo restores the previous order`, ord1 === ord0, `${ord0} -> advance -> ${ord1}`);
  check(`[${tag}] the chip goes after an undo`, !(await call('Battle', 'return !!s.undoChip;')));
  await shot('06-battle-undone');

  // ---- the chip lasts 3 s only; the order can always be given again (A11Y-19)
  check(`[${tag}] Advance tapped again`, await tapBtn('Battle', { id: 'battle.cmd.advance' }));
  await wait(3400);
  check(`[${tag}] the chip is gone after 3 s`, !(await call('Battle', 'return !!s.undoChip;')));
  check(`[${tag}] Hold re-issued by hand`, await tapBtn('Battle', { id: 'battle.cmd.hold' }));
  await wait(250);
  check(`[${tag}] I holds again without the chip`, (await call('Battle', `return s.sim.groups[${I}].order;`)) === 'hold');
  await shot('07-battle-chip-expired-reissued');

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await finish({ browser });
