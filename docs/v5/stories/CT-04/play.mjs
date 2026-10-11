// CT-04: order previews, the one-step "Then…" queue and paused staging (controls.md R5, R6).
// Battle: a drag shows ghost boxes, the facing arrow and files x ranks; after the move a Then… chip
// queues Charge, which fires on arrival (logged at that tick); a queued Hold is cancelled from its
// chip. Paused: a move and a Charge are staged (ghost, ✕, charge arrow) and issued on Play at the
// resume tick. Touch play (hasTouch, isMobile) at 390x844 and 360x780, en and ru.
// Usage: node docs/v5/stories/CT-04/play.mjs http://localhost:<port>/
// Writes a few JPEGs next to this file (390-en and 360-ru) and prints PASS/FAIL per check.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, phoneContext, captureErrors, makePageApi, check, finish } from '../../../../scripts/lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = dirname(fileURLToPath(import.meta.url));
const browser = await launch();
const SHOTS = new Set(['390x844-en', '360x780-ru']);

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
  const shot = (name) => (SHOTS.has(tag) ? page.screenshot({ path: `${out}/${tag}-${name}.jpg`, type: 'jpeg', quality: 34 }) : null);

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
  const bodyPt = () => call('Battle', `const b = s.hitState().body; const m = b[Math.floor(b.length / 2)]; return window.__css(m.x, m.y);`);
  // a press inside the knob's grab circle, clear of other groups' men and of the body (as scripts/smoke.mjs does)
  const knobPt = () =>
    call(
      'Battle',
      `const h = s.hitState(); const k = h.knob;
      const reach = (u, p) => (u.big ? Math.hypot(u.x - p.x, (u.y - p.y) * 1.6) * 0.7 : Math.hypot(u.x - p.x, u.y - p.y));
      for (const r of [0, 0.3, 0.6]) for (let a = 0; a < 8; a++) {
        const p = { x: k.x + Math.cos((a * Math.PI) / 4) * r * h.grabR, y: k.y + Math.sin((a * Math.PI) / 4) * r * h.grabR };
        const man = h.units.filter((u) => reach(u, p) < h.unitR).sort((u, v) => reach(u, p) - reach(v, p))[0];
        if (man && man.side === h.me && man.group !== h.sel) continue;
        const dk = Math.hypot(k.x - p.x, k.y - p.y);
        if (h.body.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < dk)) continue;
        return window.__css(p.x, p.y);
      }
      return window.__css(k.x, k.y);`,
    );
  /** Offline battles may auto-pause (contact): put the battle in the wanted state. */
  const setPaused = async (want) => {
    if ((await call('Battle', 'return s.paused;')) !== want) await tapBtn('Battle', { id: want ? 'battle.pause' : 'battle.play' });
    await wait(200);
    return (await call('Battle', 'return s.paused;')) === want;
  };
  /** Drag from `p` by (dx, dy) CSS px; `mid` runs before the finger lifts. */
  const drag = async (p, dx, dy, mid) => {
    await touch('touchStart', [p]);
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', [[p[0] + (dx * i) / 10, p[1] + (dy * i) / 10]]);
      await wait(16);
    }
    if (mid) await mid();
    await touch('touchEnd', []);
    await wait(300);
  };
  const has = (id) => call('Battle', `let f = false; const walk = (l) => l.forEach((o) => { if (o.__uiId === '${id}' && o.active) f = true; if (o.list) walk(o.list); }); walk(s.hud.list); walk(s.tags.list); return f;`);
  const cardWord = (numeral) => call('Battle', `const c = s.cards.find((k) => k.numeral === '${numeral}'); return c.card.info.orderWord + ' / ' + c.card.info.orderShort;`);
  const logLen = () => call('Battle', 'return s.sim.orderLog.length;');

  check(`[${tag}] Fight tapped`, await tapBtn('Battle', { id: 'battle.fight' }));
  check(`[${tag}] battle runs`, await untilPage(() => window.__game.scene.getScene('Battle').sim.phase === 'battle', 10000));
  await wait(800);
  await select('I');
  const I = await gidOf('I');

  // ---- previews (R5): every drag shows ghost boxes, the facing arrow and files x ranks
  let seen = null;
  await drag(await bodyPt(), 0, -110, async () => {
    seen = await call('Battle', 'return s.dragPreview && { label: s.dragLabel?.visible ? s.dragLabel.text : "", n: s.dragPreview.n };');
    await shot('01-drag-preview');
  });
  check(`[${tag}] a move drag shows ghosts and files x ranks`, !!seen && seen.label.length > 0 && seen.n > 0, JSON.stringify(seen));

  // ---- Then… (R6.2): after the move, queue Charge; it fires on arrival as an ordinary order
  check(`[${tag}] the Then… chip shows next to Undo after the move`, (await has('battle.then')) && (await has('battle.undo')));
  check(`[${tag}] Then… tapped`, await tapBtn('Battle', { id: 'battle.then' }));
  await wait(200);
  check(`[${tag}] Charge tapped while armed`, await tapBtn('Battle', { id: 'battle.cmd.charge' }));
  await wait(200);
  check(`[${tag}] Charge is queued, not issued`, (await call('Battle', `return s.thenQ.get(${I});`)) === 'charge' && (await call('Battle', `return s.sim.groups[${I}].order;`)) !== 'charge');
  const word = await cardWord('I');
  check(`[${tag}] the card shows "→ Charge"`, word.includes('→'), word);
  check(`[${tag}] the queued chip shows (a tap cancels)`, await has('battle.then.cancel'));
  await shot('02-then-queued');
  // contact may auto-pause the battle: play on until the step fires
  let fired = false;
  for (let i = 0; i < 40 && !fired; i++) {
    await setPaused(false);
    fired = await untilPage(() => window.__game.scene.getScene('Battle').sim.groups[window.__game.scene.getScene('Battle').cards.find((k) => k.numeral === 'I').gid].order === 'charge', 1000);
  }
  check(`[${tag}] the queued Charge fires on arrival`, fired);
  const last = await call('Battle', `const l = s.sim.orderLog.filter((e) => e.side === s.me && e.order.kind === 'order' && e.order.group === ${I}); const e = l[l.length - 1]; return e && { tick: e.tick, order: e.order.order };`);
  check(`[${tag}] it is in the order log at its tick, as an ordinary order`, last?.order === 'charge' && last.tick > 0, JSON.stringify(last));
  check(`[${tag}] the queue is empty after it fired`, (await call('Battle', `return s.thenQ.get(${I});`)) === null);
  await wait(300);
  await shot('03-then-fired');

  // a turn: the knob (I is now ahead of the others, clear of their men) is pressed on a still field (paused), then the staged turn is cleared and the battle resumes
  seen = null;
  check(`[${tag}] paused for the turn`, await setPaused(true));
  await drag(await knobPt(), 50, 30, async () => {
    seen = await call('Battle', 'return s.dragPreview && { label: s.dragLabel?.visible ? s.dragLabel.text : "", n: s.dragPreview.n };');
  });
  check(`[${tag}] a turn drag shows ghosts and files x ranks`, !!seen && seen.label.length > 0 && seen.n > 0, JSON.stringify(seen));
  check(`[${tag}] a turn offers no Then… (only a move does)`, !(await has('battle.then')));
  if (await has('battle.plan.clear')) await tapBtn('Battle', { id: 'battle.plan.clear' });
  await setPaused(false); // contact may auto-pause it again at once: not a failure

  // ---- cancel: queue Hold after a move, then tap its chip
  await setPaused(false);
  await select('II');
  const II = await gidOf('II');
  await drag(await bodyPt(), 30, -40);
  check(`[${tag}] Then… tapped (II)`, await tapBtn('Battle', { id: 'battle.then' }));
  await wait(150);
  check(`[${tag}] Hold tapped while armed`, await tapBtn('Battle', { id: 'battle.cmd.hold' }));
  await wait(150);
  check(`[${tag}] Hold queued for II`, (await call('Battle', `return s.thenQ.get(${II});`)) === 'hold');
  check(`[${tag}] cancel chip tapped`, await tapBtn('Battle', { id: 'battle.then.cancel' }));
  await wait(200);
  check(`[${tag}] the queued step is cancelled`, (await call('Battle', `return s.thenQ.get(${II});`)) === null && !(await has('battle.then.cancel')));
  await shot('04-then-cancelled');

  // ---- paused staging (R6.1): a move and a Charge planned, issued on Play at the resume tick
  check(`[${tag}] paused`, await setPaused(true));
  // an auto-pause may have staged the II move already: start from an empty plan
  if (await has('battle.plan.clear')) await tapBtn('Battle', { id: 'battle.plan.clear' });
  await wait(150);
  const n0 = await logLen();
  const tick0 = await call('Battle', 'return s.sim.tick;');
  await drag(await bodyPt(), -30, -50);
  check(`[${tag}] Charge tapped while paused`, await tapBtn('Battle', { id: 'battle.cmd.charge' }));
  await wait(250);
  check(`[${tag}] paused orders are staged, not issued`, (await logLen()) === n0 && (await call('Battle', 'return s.plan.size;')) === 2);
  check(`[${tag}] the staged ghost has its ✕, and Clear plan shows`, (await has('battle.plan.ghost.II')) && (await has('battle.plan.clear')));
  await shot('05-staged');
  check(`[${tag}] Undo takes back the newest planned order`, await tapBtn('Battle', { id: 'battle.undo' }));
  await wait(200);
  check(`[${tag}] one order left in the plan`, (await call('Battle', 'return s.plan.size;')) === 1);
  check(`[${tag}] Charge staged again`, await tapBtn('Battle', { id: 'battle.cmd.charge' }));
  await wait(200);
  check(`[${tag}] Play tapped`, await tapBtn('Battle', { id: 'battle.play' }));
  await wait(150);
  const issued = await call('Battle', `return s.sim.orderLog.slice(${n0}).map((e) => e.tick + ':' + e.order.kind);`);
  check(`[${tag}] Play issues the plan in order at the resume tick`, issued.length >= 2 && issued[0] === `${tick0}:form` && issued[1] === `${tick0}:order`, issued.join(' '));
  check(`[${tag}] the plan is empty after Play`, (await call('Battle', 'return s.plan.size;')) === 0 && !(await has('battle.plan.clear')));
  await wait(400);
  await shot('06-plan-given');

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await finish({ browser });
