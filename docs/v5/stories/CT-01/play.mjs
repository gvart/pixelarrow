// CT-01: selection priority, the knob sends face, the order bar's colour and numeral, no empty cards.
// Touch play (hasTouch, isMobile) at 390x844 and 360x780 (en), and 360x780 (ru).
// Usage: node docs/v5/stories/CT-01/play.mjs http://localhost:<port>/
// Writes JPEGs next to this file and prints PASS/FAIL per check.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, phoneContext, captureErrors, makePageApi, check, finish } from '../../../../scripts/lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = dirname(fileURLToPath(import.meta.url));
const browser = await launch();

for (const [w, h, lang] of [
  [390, 844, 'en'],
  [360, 780, 'en'],
  [360, 780, 'ru'],
]) {
  const tag = `${w}x${h}-${lang}`;
  const ctx = await phoneContext(browser, { viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = captureErrors(page);
  const { ev, call, wait, tap, touch, until, untilPage, active, tapBtn } = makePageApi(page, { btnWaitMs: 4000 });
  const shot = (name) => page.screenshot({ path: `${out}/${tag}-${name}.jpg`, type: 'jpeg', quality: 38 });

  await page.goto(`${base}?lang=${lang}`);
  await untilPage(() => !!window.__game && window.__game.scene.isActive('Menu'), 30000);
  // two hoplites in I and II, the peltast in IV: III (Reserve) is empty
  await ev(() => {
    const hs = window.__state.campaign.data.heroes;
    const pel = hs.find((x) => x.group === 3) ?? hs[hs.length - 1];
    const rest = hs.filter((x) => x !== pel);
    rest.forEach((x, i) => (x.group = i === 0 ? 0 : 1));
    pel.group = 3;
    window.__state.campaign.data.settings.seenGestureHint = true;
  });
  await ev(() => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true })));
  check(`[${tag}] deployment opens`, await until(() => active('Battle'), 15000));
  await wait(2500);

  // ---- no empty cards (R1.4)
  const cards = await call('Battle', 'return s.cards.map((c) => c.numeral);');
  check(`[${tag}] deployment: no card for the empty group III`, !cards.includes('III') && cards.length === 3, JSON.stringify(cards));

  const cardPt = (numeral) => call('Battle', `const c = s.cards.find((k) => k.numeral === '${numeral}'); const r = c.card.getBounds(); return window.__css(r.centerX, r.centerY);`);
  const gidOf = (numeral) => call('Battle', `return s.cards.find((k) => k.numeral === '${numeral}').gid;`);
  // a card tap toggles: tap only when the group is not selected already
  const select = async (numeral) => {
    const gid = await gidOf(numeral);
    if ((await call('Battle', 'return s.selGroup;')) === gid) return;
    const q = await cardPt(numeral);
    await tap(q[0], q[1]);
  };
  const I = await gidOf('I');
  const II = await gidOf('II');
  let p;
  await select('I');
  check(`[${tag}] group I selected by its card`, (await call('Battle', 'return s.selGroup;')) === I);

  // ---- C1: group II's man stands right under group I's knob
  await call('Battle', `const k = s.knobOf(); const f = s.sim.groups[${I}].formation;
    s.sim.issue(s.me, { kind: 'form', group: ${II}, cx: k.x, cy: k.y, fx: f.fx, fy: f.fy, frontage: 1 }); return 1;`);
  await wait(600);
  // the screen points (CSS px) of the knob and of II's man nearest it
  const geo = () =>
    call('Battle', `const hs = s.hitState(); const k = hs.knob; const ii = hs.units.filter((u) => u.group === ${II});
      const m = ii.sort((a, b) => Math.hypot(a.x - k.x, a.y - k.y) - Math.hypot(b.x - k.x, b.y - k.y))[0];
      return { knob: window.__css(k.x, k.y), man: window.__css(m.x, m.y), d: Math.hypot(m.x - k.x, m.y - k.y) / window.__game.scale.width * ${w}, rs: window.__rs() };`);
  let g = await geo();
  const facing = (gid) => call('Battle', `const f = s.sim.groups[${gid}].formation; return [+f.fx.toFixed(3), +f.fy.toFixed(3)];`);
  const f0 = await facing(I);
  await shot('01-deploy-knob-over-II');
  check(`[${tag}] II's man stands under I's knob (within his 22 pt reach)`, g.d < 22, `${g.d.toFixed(1)} CSS px apart`);
  // a drag from the man (over the knob) never turns group I
  await touch('touchStart', [g.man]);
  for (let i = 1; i <= 8; i++) {
    await touch('touchMove', [[g.man[0] + i * 8, g.man[1] + i * 3]]);
    await wait(16);
  }
  await touch('touchEnd', []);
  await wait(300);
  check(`[${tag}] C1: a drag over II's man under the knob does not turn I`, JSON.stringify(await facing(I)) === JSON.stringify(f0), JSON.stringify([f0, await facing(I)]));
  g = await geo();
  await tap(g.man[0], g.man[1]);
  check(`[${tag}] C1: a tap on II's man under I's knob selects II`, (await call('Battle', 'return s.selGroup;')) === II);
  await shot('02-deploy-II-selected');

  // ---- the knob still turns from its outer edge (deployment: a form)
  await select('I');
  g = await geo();
  const away = [g.knob[0] - g.man[0], g.knob[1] - g.man[1]];
  const al = Math.hypot(away[0], away[1]) || 1;
  // 26 CSS px from the knob's centre on the side away from the man: past his 22 pt reach, inside the 30 pt grab
  const edge = al > 1 ? [g.knob[0] + (away[0] / al) * 26, g.knob[1] + (away[1] / al) * 26] : [g.knob[0], g.knob[1] - 26];
  const log0 = await call('Battle', 'return s.sim.orderLog.length;');
  await touch('touchStart', [edge]);
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', [[edge[0] + i * 9, edge[1] + i * 7]]);
    await wait(16);
  }
  await shot('03-deploy-knob-edge-turn');
  await touch('touchEnd', []);
  await wait(300);
  const dep = await call('Battle', `return { kinds: s.sim.orderLog.slice(${log0}).map((o) => o.order.kind), f: s.sim.groups[${I}].formation };`);
  check(`[${tag}] the knob turns from its outer edge (deployment sends form)`, dep.kinds.includes('form') && !dep.kinds.includes('face') && JSON.stringify(await facing(I)) !== JSON.stringify(f0), JSON.stringify(dep.kinds));

  // ---- overlapping groups: II beside I's front rank; the man nearest the finger decides
  await call('Battle', `const f = s.sim.groups[${I}].formation; const r = { x: -f.fy, y: f.fx };
    s.sim.issue(s.me, { kind: 'form', group: ${II}, cx: f.cx + r.x * 1.2, cy: f.cy + r.y * 1.2, fx: f.fx, fy: f.fy, frontage: 1 }); return 1;`);
  await wait(600);
  const pair = await call('Battle', `const hs = s.hitState(); const a = hs.units.find((u) => u.group === ${I}); const b = hs.units.filter((u) => u.group === ${II}).sort((x, y) => Math.hypot(x.x - a.x, x.y - a.y) - Math.hypot(y.x - a.x, y.y - a.y))[0];
    return { a: window.__css(a.x, a.y), b: window.__css(b.x, b.y), cx: s.sim.groups[${I}].formation.cx };`);
  await shot('04-deploy-overlap');
  check(`[${tag}] overlap: the two men stand close`, Math.hypot(pair.a[0] - pair.b[0], pair.a[1] - pair.b[1]) < 30, JSON.stringify(pair));
  await tap(pair.b[0], pair.b[1]);
  check(`[${tag}] overlap: a tap on II's man selects II`, (await call('Battle', 'return s.selGroup;')) === II);
  await select('I');
  const cx0 = pair.cx;
  await touch('touchStart', [pair.a]);
  for (let i = 1; i <= 8; i++) {
    await touch('touchMove', [[pair.a[0] + i * 5, pair.a[1] + i * 6]]);
    await wait(16);
  }
  await touch('touchEnd', []);
  await wait(300);
  check(`[${tag}] overlap: a drag on I's own man moves I`, (await call('Battle', `return s.sim.groups[${I}].formation.cx;`)) !== cx0);

  // ---- order bar colour + numeral (fight)
  check(`[${tag}] Fight tapped`, (await tapBtn('Battle', { id: 'battle.fight' })) || (await tapBtn('Battle', 'Fight')));
  check(`[${tag}] battle runs`, await untilPage(() => window.__game.scene.getScene('Battle').sim.phase === 'battle', 10000));
  await wait(1500);
  const bar = () =>
    call('Battle', `const out = []; const walk = (l) => l.forEach((o) => { if (o.__uiId === 'battle.orders.group') out.push(o.list.find((x) => x.text !== undefined).text); if (o.list) walk(o.list); }); walk(s.hud.list); return out;`);
  await select('II');
  const barII = await bar();
  await shot('05-battle-bar-II');
  check(`[${tag}] order bar shows II's numeral when II is selected`, JSON.stringify(barII) === '["II"]', JSON.stringify(barII));

  // ---- the knob in battle sends face; the charge goes on
  await select('I');
  check(`[${tag}] Charge tapped`, await tapBtn('Battle', { id: 'battle.cmd.charge' }));
  await call('Battle', 's.setPaused(true); return 1;');
  await wait(400);
  const barI = await bar();
  check(`[${tag}] order bar shows I's numeral when I is selected`, JSON.stringify(barI) === '["I"]', JSON.stringify(barI));
  // where a player grabs the knob: its centre, or its outer edge when another group's man stands within reach of the centre
  const kb = await call('Battle', `const hs = s.hitState(); const k = hs.knob; const others = hs.units.filter((u) => u.side === hs.me && u.group !== hs.sel);
    const free = (q) => others.every((u) => Math.hypot(u.x - q.x, u.y - q.y) >= hs.unitR);
    let best = k;
    if (!free(k)) for (const r of [0.5, 0.75, 0.9]) for (let a = 0; a < 16; a++) { const q = { x: k.x + Math.cos(a * Math.PI / 8) * hs.grabR * r, y: k.y + Math.sin(a * Math.PI / 8) * hs.grabR * r }; if (best === k && free(q)) best = q; }
    const a = hs.body.at(-1); const turn = { x: a.x - (k.y - a.y), y: a.y + (k.x - a.x) };
    return { k: window.__css(best.x, best.y), to: window.__css(turn.x, turn.y), edge: best !== k };`);
  const log1 = await call('Battle', 'return s.sim.orderLog.length;');
  const order0 = await call('Battle', `return s.sim.groups[${I}].order;`);
  // drag the knob a quarter turn round (to the side of the group, on screen)
  await touch('touchStart', [kb.k]);
  const grabbed = await call('Battle', 'return s.gestures.press ? s.gestures.press.grab : "no press";');
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', [[kb.k[0] + ((kb.to[0] - kb.k[0]) * i) / 10, kb.k[1] + ((kb.to[1] - kb.k[1]) * i) / 10]]);
    await wait(16);
  }
  await shot('06-battle-knob-preview');
  await touch('touchEnd', []);
  await wait(300);
  const bat = await call('Battle', `return { kinds: s.sim.orderLog.slice(${log1}).map((o) => o.order.kind), order: s.sim.groups[${I}].order };`);
  check(`[${tag}] battle: the knob sends face`, bat.kinds.includes('face') && !bat.kinds.includes('form'), `${JSON.stringify(bat.kinds)} grab=${grabbed}${kb.edge ? ' (by its outer edge)' : ''}`);
  check(`[${tag}] battle: the charge goes on after the turn`, order0 === 'charge' && bat.order === 'charge', `${order0} -> ${bat.order}`);
  await call('Battle', 's.setPaused(false); return 1;');
  await wait(1500);
  check(`[${tag}] battle: still charging after it wheeled`, (await call('Battle', `return s.sim.groups[${I}].order;`)) === 'charge');
  await shot('07-battle-after-face');

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await finish({ browser });
