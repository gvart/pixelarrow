// FO-01: in battle, a small drag (move < 2 paces) or a knob turn keeps a group's Advance;
// a big drag still sets Hold (formations-orders.md R1.2). Touch input at 390x844 (en).
// face and focus have no UI yet (CT-01 sends face from the knob, CT-02 adds focus).
// Usage: node docs/v5/stories/FO-01/repro.mjs http://localhost:<port>/
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, phoneContext, captureErrors, makePageApi, check, finish } from '../../../../scripts/lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = dirname(fileURLToPath(import.meta.url));
const browser = await launch();
const ctx = await phoneContext(browser, { viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = captureErrors(page);
const { ev, call, wait, tap, drag, until, untilPage, active, tapBtn } = makePageApi(page, { btnWaitMs: 4000 });
const shot = (name) => page.screenshot({ path: `${out}/390x844-en-${name}.jpg`, type: 'jpeg', quality: 40 });

await page.goto(`${base}?lang=en`);
await untilPage(() => !!window.__game && window.__game.scene.isActive('Menu'), 30000);
await ev(() => {
  window.__state.campaign.data.settings.seenGestureHint = true;
});
await ev(() => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true })));
check('deployment opens', await until(() => active('Battle'), 15000));
await wait(2000);
check('Fight tapped', (await tapBtn('Battle', { id: 'battle.fight' })) || (await tapBtn('Battle', 'Fight')));
check('battle runs', await untilPage(() => window.__game.scene.getScene('Battle').sim.phase === 'battle', 10000));
await wait(1800);

// Page point of a field point, through the battle camera.
const page_ = (x, y) =>
  call('Battle', `const w = s.project(${x}, ${y}); const cam = s.cameras.main; return window.__css((w.x - cam.worldView.x) * cam.zoom, (w.y - cam.worldView.y) * cam.zoom);`);
const main = () =>
  call('Battle', `const g = s.sim.groups.find((x) => x.side === s.me && s.sim.activeMembers(x.id).length > 0); const u = s.sim.activeMembers(g.id)[0];
    return { id: g.id, name: g.name, order: g.order, cx: g.formation.cx, cy: g.formation.cy, fx: g.formation.fx, fy: g.formation.fy, ux: u.x, uy: u.y };`);
const cardPt = (gid) => call('Battle', `const c = s.cards.find((k) => k.gid === ${gid}); const r = c.card.getBounds(); return window.__css(r.centerX, r.centerY);`);

async function advance(g) {
  for (let i = 0; i < 4 && (await call('Battle', 'return s.selGroup;')) !== g.id; i++) {
    const p = await cardPt(g.id);
    await tap(p[0], p[1]);
    await wait(300);
  }
  check(`${g.name} selected by its card`, (await call('Battle', 'return s.selGroup;')) === g.id, `${await cardPt(g.id)}`);
  await tapBtn('Battle', { id: 'battle.cmd.advance' });
  await wait(600);
  return main();
}

/** Drag the group by a soldier, `paces` to its right (field units). */
async function nudge(g, paces) {
  const rx = -g.fy;
  const ry = g.fx;
  const a = await page_(g.ux, g.uy);
  const b = await page_(g.ux + rx * paces, g.uy + ry * paces);
  await drag(a[0], a[1], b[0], b[1], 12);
  await wait(300);
}

let g = await advance(await main());
check(`${g.name} advances`, g.order === 'advance', g.order);
await nudge(g, 1);
let after = await main();
await shot('01-small-move-keeps-advance');
check('a 1-pace drag keeps Advance', after.order === 'advance', `${after.order}; the anchor moved ${Math.hypot(after.cx - g.cx, after.cy - g.cy).toFixed(2)} paces, the advance included`);

// The knob: 3 paces ahead of the front-rank centre; drag it 45 degrees to the right.
g = await main();
const k0 = await page_(g.cx + g.fx * 3, g.cy + g.fy * 3);
const r = { x: -g.fy, y: g.fx };
const k1 = await page_(g.cx + (g.fx + r.x) * 2.2, g.cy + (g.fy + r.y) * 2.2);
await drag(k0[0], k0[1], k1[0], k1[1], 12);
await wait(300);
after = await main();
await shot('02-knob-turn-keeps-advance');
const turned = (Math.acos(Math.max(-1, Math.min(1, g.fx * after.fx + g.fy * after.fy))) * 180) / Math.PI;
check('a knob turn keeps Advance', after.order === 'advance', `${after.order}, turned ${turned.toFixed(0)} deg`);

g = await main();
await nudge(g, 4);
after = await main();
await shot('03-big-move-holds');
check('a 4-pace drag sets Hold', after.order === 'hold', `${after.order}; the anchor moved ${Math.hypot(after.cx - g.cx, after.cy - g.cy).toFixed(2)} paces, the advance included`);

check('no page errors', errors.length === 0, errors.join(' | '));
await ctx.close();
await finish({ browser });
