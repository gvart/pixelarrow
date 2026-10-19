// War sandbox screenshots at real scale (iso, 64 x 32 tiles, 1:1 soldier sprites): soldiers at
// zoom 1 at the ford, a squad on the plateau rim, box selection and a right-click order on a hill
// (checks the picked tile), a 600-unit brawl at mid zoom (sprites), at dot zoom and at the
// overview (squad banners) with fps for each, the height overlay. Spots come from the scene
// (src/war/regions/test-ridge.spots.ts), so this targets test-ridge.
// Then each ?scenario= preset (src/war/scenarios): its opening, the player side playing a simple
// plan at 4x speed, a mid-fight shot and the end-of-fight score from the panel.
// Mode `art` (PixelLab terrain and objects, ART-R): the ford at 1:1 with a fight, the pass with the
// ruins, the plateau with the tower (a squad behind it), units at a forest edge (trees fade over
// them), the overview, and the 600-unit brawl fps at mid zoom.
// Mode `anim`: frame sequences at 1:1 (100 ms apart) of a ford fight (archers and slingers shooting,
// spears and swords striking, deaths) and of a squad idling, then the 600-unit brawl fps at 1/2.
// Mode `biome`, `build`: see below.
// Usage: node scripts/war/sandbox-shots.mjs [baseUrl] [outDir] [sim] [all|scenarios|art|anim|biome|build] [id,id...]
//   (default outDir: shots/war/sandbox, sim: real). Requires a running dev server (npm run dev).
import { launch, captureErrors, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/sandbox', process.argv[3]);
const sim = process.argv[4] ?? 'real';
const mode = process.argv[5] ?? 'all';
const only = process.argv[6]?.split(',');
const url = `${base}sandbox.html?region=test-ridge&sim=${sim}`;

const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = captureErrors(page, { prefix: true });
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', `${out}/${name}.png`);
};
const boot = async (q = '') => {
  await page.goto(url + q);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur && document.getElementById('dev'), null, { timeout: 60000 });
};
/** Average and minimum fps over n half seconds. */
const fps = async (label, n = 12) => {
  const v = [];
  for (let i = 0; i < n; i++) {
    await wait(500);
    v.push(await page.evaluate(() => window.__sandbox.game.loop.actualFps));
  }
  const st = await page.evaluate(() => ({ ...window.__sandbox.sim.stats, zoom: window.__sandbox.cameras.main.zoom }));
  console.log(`${label}: zoom ${st.zoom.toFixed(3)} fps avg ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)} min ${Math.min(...v).toFixed(1)}; sim ${st.stepMs.toFixed(2)} ms/step; units ${st.units}`);
};

if (mode === 'all') {
// 1. soldiers at 1:1 at the ford: own hoplites wading east, enemy swordsmen waiting on the far bank
await boot();
await page.evaluate(() => {
  const s = window.__sandbox, { ford, fordW, fordE } = s.spots;
  s.sim.spawn('you', 0, 'hoplite', 20, fordW[0] - 2, fordW[1]);
  s.sim.spawn('you', 0, 'archer', 16, fordW[0] - 8, fordW[1] + 6);
  s.sim.spawn('bot', 1, 'celt_sword', 20, fordE[0] + 6, fordE[1]);
  s.sim.order({ kind: 'move', squad: 0, x: ford[0], y: ford[1] });
  s.focus((fordW[0] + ford[0]) / 2, (fordW[1] + ford[1]) / 2, 1);
});
await page.waitForFunction(() => {
  const s = window.__sandbox, [fx, fy] = s.spots.ford;
  return s.drawn.some((d) => d.u.squad === 0 && Math.hypot(d.x - fx, d.y - fy) < 6);
}, null, { timeout: 30000 });
await wait(600);
await shot('01-ford-1x');

// 2. a squad on the plateau rim, the cliff below it toward the viewer
await boot();
const rim = await page.evaluate(() => {
  const s = window.__sandbox, r = s.region, [px, py] = s.spots.plateauTop;
  const H = (x, y) => r.height[Math.floor(y) * r.w + Math.floor(x)];
  // walk south-east (screen down) from the plateau top to its edge, then step back inside
  let t = 0;
  while (H(px + t, py + t) === 5 && t < 60) t += 0.5;
  const x = px + t - 4, y = py + t - 4;
  s.sim.spawn('you', 0, 'hoplite', 20, x, y);
  s.focus(x + 2, y + 2, 1);
  return { x, y, t };
});
await page.waitForFunction(() => window.__sandbox.drawn.length >= 20);
await wait(1500);
console.log(`plateau rim squad at (${rim.x.toFixed(1)}, ${rim.y.toFixed(1)}), edge ${rim.t} tiles from plateauTop`);
await shot('02-plateau-edge');

// 3. two own squads on the ridge's gentle side, an enemy below; box-select ours, right-click the crest
await boot();
const pts = await page.evaluate(() => {
  const s = window.__sandbox, { ridgeCrest: c, ridgeFoot: f } = s.spots;
  const at = (k) => [c[0] + (f[0] - c[0]) * k, c[1] + (f[1] - c[1]) * k];
  const a = at(0.3), b = at(0.4), e = at(0.75), t = at(0.08);
  s.sim.spawn('you', 0, 'hoplite', 20, a[0] - 4, a[1]);
  s.sim.spawn('you', 0, 'archer', 16, b[0] + 4, b[1]);
  s.sim.spawn('bot', 1, 'celt_sword', 20, e[0], e[1]);
  s.focus((a[0] + e[0]) / 2, (a[1] + e[1]) / 2, 1 / 2);
  return t;
});
await page.waitForFunction(() => window.__sandbox.drawn.length >= 56);
await page.evaluate(() => window.__sandbox.sim.speed(0));
await wait(300);
const bb = await page.evaluate(() => {
  const s = window.__sandbox, p = s.drawn.filter((d) => d.team === 0).map((d) => s.toScreen(d.x, d.y));
  const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
  return { x0: Math.min(...xs) - 20, y0: Math.min(...ys) - 40, x1: Math.max(...xs) + 20, y1: Math.max(...ys) + 10 };
});
await page.mouse.move(bb.x0, bb.y0);
await page.mouse.down();
await page.mouse.move(bb.x1, bb.y1, { steps: 8 });
await page.mouse.up();
const sel = await page.evaluate(() => window.__sandbox.selected.size);
const tp = await page.evaluate(([x, y]) => window.__sandbox.toScreen(x, y), pts);
await page.mouse.click(tp.x, tp.y, { button: 'right' });
await wait(100);
const cmd = await page.evaluate(() => window.__sandbox.lastCommand);
const ok = sel === 2 && cmd && Math.hypot(cmd.x - pts[0], cmd.y - pts[1]) < 0.5;
console.log(`selection: ${sel} squads; right-click at tile (${pts[0].toFixed(2)}, ${pts[1].toFixed(2)}) -> ordered (${cmd?.x.toFixed(2)}, ${cmd?.y.toFixed(2)}) ${ok ? 'OK' : 'MISS'}`);
if (!ok) problems.push('iso selection / order picking missed');
await page.evaluate(() => window.__sandbox.sim.speed(1));
await wait(1500);
await shot('03-ridge-selection');

// 4. 600 units fighting through the ford: mid zoom (sprites), dot zoom, overview (banners)
await boot();
await page.click('#brawl');
await page.waitForFunction(() => window.__sandbox.sim.stats.units >= 600);
await page.evaluate(() => {
  const s = window.__sandbox, q = s.sim.cur.squads;
  const mine = q.filter((x) => x.team === 0), foes = q.filter((x) => x.team === 1);
  mine.forEach((x, i) => s.sim.order({ kind: 'attack', squad: x.id, target: foes[i % foes.length].id }));
  s.focus(s.spots.ford[0], s.spots.ford[1], 1 / 2);
});
await wait(6000);
await fps('brawl 600, sprites');
await shot('04-brawl-600-mid');
await page.evaluate(() => window.__sandbox.focus(window.__sandbox.spots.ford[0], window.__sandbox.spots.ford[1], 1 / 6));
await fps('brawl 600, dots', 6);
await shot('05-brawl-600-dots');
await page.waitForFunction(() => window.__sandbox.overviewReady, null, { timeout: 60000 });
await page.evaluate(() => {
  const s = window.__sandbox, cam = s.cameras.main;
  cam.setZoom(1 / 24).centerOn(s.iso.W / 2, s.iso.H / 2);
});
await fps('brawl 600, overview');
await shot('06-overview-banners');

// height overlay at the overview
await page.check('[data-ov=height]');
await page.waitForFunction(() => window.__sandbox.overviewReady, null, { timeout: 60000 });
await wait(300);
await shot('07-overlay-height');
}

if (mode === 'art') {
  const obj = (id) => page.evaluate((id) => window.__sandbox.region.objects.find((o) => o.id === id), id);
  // the ford at 1:1, hoplites and swordsmen meeting mid-stream
  await boot();
  await page.evaluate(() => {
    const s = window.__sandbox, { ford, fordW, fordE } = s.spots;
    s.sim.spawn('you', 0, 'hoplite', 20, fordW[0] + 4, fordW[1]);
    s.sim.spawn('bot', 1, 'celt_sword', 20, fordE[0] - 4, fordE[1]);
    s.sim.order({ kind: 'attack', squad: 0, target: 1 });
    s.sim.order({ kind: 'attack', squad: 1, target: 0 });
    s.focus(ford[0], ford[1], 1);
  });
  await page.waitForFunction(() => window.__sandbox.drawn.filter((d) => d.u.state === 'attack').length >= 6, null, { timeout: 60000 });
  await page.evaluate(() => {
    const s = window.__sandbox, f = s.drawn.filter((d) => d.u.state === 'attack');
    s.focus(f.reduce((a, d) => a + d.x, 0) / f.length, f.reduce((a, d) => a + d.y, 0) / f.length, 1);
  });
  await wait(1200);
  await shot('art-1-ford-fight-1x');

  // the pass: a column marching by the ruined wall pieces
  await boot();
  const ruin = await obj('wall-ruin');
  await page.evaluate((r) => {
    const s = window.__sandbox;
    s.sim.spawn('you', 0, 'hoplite', 20, r.x - 6, r.y + 2);
    s.sim.order({ kind: 'move', squad: 0, x: r.x + 10, y: r.y + 2 });
    s.focus(r.x, r.y + 1, 1);
  }, ruin);
  await wait(3000);
  await shot('art-2-pass-ruin-1x');

  // the plateau tower, a squad standing behind it shows through as a silhouette
  await boot();
  const tower = await obj('watchtower');
  await page.evaluate((t) => {
    const s = window.__sandbox;
    s.sim.spawn('you', 0, 'archer', 12, t.x - 3, t.y - 3);
    s.sim.spawn('bot', 1, 'hoplite', 12, t.x + 4, t.y + 3);
    s.focus(t.x + 1, t.y + 1, 1);
  }, tower);
  await wait(2500);
  await shot('art-3-plateau-tower-1x');

  // a forest edge: a squad walking in under the trees, which fade over it
  await boot();
  const edge = await page.evaluate(() => {
    const s = window.__sandbox, r = s.region, [fx, fy] = s.spots.forest;
    const T = (x, y) => r.terrain[Math.floor(y) * r.w + Math.floor(x)];
    let x = fx, y = fy;
    while (T(x, y) === 'forest' && y < r.h - 1) { x -= 0.5; y += 0.5; } // toward the viewer's lower left
    s.sim.spawn('you', 0, 'hoplite', 20, x - 4, y + 4);
    s.sim.spawn('you', 0, 'archer', 16, x - 8, y + 6);
    s.sim.order({ kind: 'move', squad: 0, x: x + 3, y: y - 3 });
    s.sim.order({ kind: 'move', squad: 1, x: x - 1, y: y - 1 });
    s.focus(x, y, 1);
    return { x, y };
  });
  await wait(7000);
  console.log(`forest edge at (${edge.x.toFixed(1)}, ${edge.y.toFixed(1)})`);
  await shot('art-4-forest-edge-1x');

  // 600 units at the ford, mid zoom: fps
  await page.click('#brawl');
  await page.waitForFunction(() => window.__sandbox.sim.stats.units >= 600);
  await page.evaluate(() => {
    const s = window.__sandbox, q = s.sim.cur.squads;
    const mine = q.filter((x) => x.team === 0), foes = q.filter((x) => x.team === 1);
    mine.forEach((x, i) => s.sim.order({ kind: 'attack', squad: x.id, target: foes[i % foes.length].id }));
    s.focus(s.spots.ford[0], s.spots.ford[1], 1 / 2);
  });
  await wait(6000);
  await fps('art brawl 600, mid zoom 1/2');
  await shot('art-5-brawl-600-mid');
  await page.evaluate(() => window.__sandbox.focus(window.__sandbox.spots.ford[0], window.__sandbox.spots.ford[1], 1 / 4));
  await fps('art brawl 600, zoom 1/4', 6);

  // the overview
  await page.waitForFunction(() => window.__sandbox.overviewReady, null, { timeout: 120000 });
  await page.evaluate(() => {
    const s = window.__sandbox, cam = s.cameras.main;
    cam.setZoom(1 / 24).centerOn(s.iso.W / 2, s.iso.H / 2);
  });
  await fps('art overview', 4);
  await shot('art-6-overview');
}

// Mode `biome` (the biome libraries): the pass at 1:1 with a squad by the watch post and cairns, the mountain range at 1/4
// (massif sprites; again with ?mountains=terrace, the stacked levels, for comparison), the wide mountain interior at 1/4, the Kyrene oasis, the Elaia plateau
// with the tower and the marble, the overview, and the 600-unit brawl fps at 1/2 and at the overview.
// Mode `build` (M2b, scenario build-test): the camp site at foundation, the build ghost valid and invalid, a wall
// drag preview with a gate, sites at scaffold and done, a squad gathering and carrying at 1:1, then 600-unit fps.
if (mode === 'build') {
  await boot('&scenario=build-test');
  await page.waitForFunction(() => window.__sandbox.sim.cur.buildings?.some((b) => b.type === 'camp'), null, { timeout: 60000 });
  const home = await page.evaluate(() => {
    const c = window.__sandbox.sim.cur.buildings.find((b) => b.type === 'camp');
    return { x: c.x, y: c.y };
  });
  const scr = (dx, dy) => page.evaluate(([x, y]) => window.__sandbox.toScreen(x, y), [home.x + dx, home.y + dy]);
  const focus = (dx, dy, z) => page.evaluate(([x, y, z]) => window.__sandbox.focus(x, y, z), [home.x + dx, home.y + dy, z]);
  const site = (pred) => page.waitForFunction(pred, null, { timeout: 120000, polling: 250 });
  await focus(0, 2, 1);
  await wait(800);
  await shot('m2b-01-site-foundation');
  // ghost: a storehouse inside the claim, then out past its edge
  await page.evaluate(() => { const s = window.__sandbox; s.selected.add(1); s.build.setTool({ kind: 'building', type: 'storehouse' }); });
  let p = await scr(5, 5);
  await page.mouse.move(p.x, p.y);
  await wait(900);
  await shot('m2b-02-ghost-valid');
  await focus(22, 22, 1);
  await wait(500);
  p = await scr(26, 26);
  await page.mouse.move(p.x, p.y);
  await wait(900);
  await shot('m2b-03-ghost-invalid');
  // place the storehouse for squad 1
  await focus(0, 2, 1);
  await wait(300);
  p = await scr(5, 5);
  await page.mouse.move(p.x, p.y);
  await wait(900);
  await page.mouse.click(p.x, p.y);
  // wall: one run, a gate on it, then a second run dragged (shot mid drag)
  await focus(-2, 0, 1 / 2);
  await wait(300);
  await page.evaluate(() => window.__sandbox.build.setTool({ kind: 'wall', material: 'wood' }));
  // a corner of wall west and south of the camp that misses the trees (the sim's checkWall picks it)
  const [wx, wy] = await page.evaluate(async ([hx, hy]) => {
    const s = window.__sandbox;
    for (let k = 0; k < 40; k++) {
      const dx = -6 - (k % 5), dy = 6 + Math.floor(k / 5);
      const pts = [hx + dx + 0.5, hy - 8.5, hx + dx + 0.5, hy + dy + 0.5, hx + 6.5, hy + dy + 0.5].map(Math.floor).map((v) => v + 0.5);
      const r = await s.sim.checkWall(0, { material: 'wood', points: pts, gates: [pts[0], (pts[1] + pts[3]) / 2] });
      if (r?.ok) return [dx, dy];
    }
    return [-10, 8];
  }, [Math.floor(home.x), Math.floor(home.y)]);
  console.log('wall corner', wx, wy);
  const a = await scr(wx, -8), b = await scr(wx, wy), c = await scr(6, wy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('g');
  const g = await scr(wx, (wy - 8) / 2);
  await page.mouse.click(g.x, g.y);
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await wait(900);
  await shot('m2b-04-wall-drag-preview');
  await page.mouse.up();
  await page.evaluate(() => { const s = window.__sandbox; s.selected.clear(); s.selected.add(2); });
  await wait(700);
  await page.keyboard.press('Enter');
  await wait(300);
  await page.keyboard.press('b');
  await wait(300);
  await page.evaluate(() => window.__sandbox.sim.speed(4));
  // scaffold: the first site under labour
  await site(() => window.__sandbox.sim.cur.buildings.some((b) => b.state === 'scaffold' && b.progress > 0.3));
  await page.evaluate(() => {
    const s = window.__sandbox, b = s.sim.cur.buildings.find((q) => q.state === 'scaffold');
    s.build.selected = b.id;
    s.focus(b.x, b.y + 2, 1);
  });
  await wait(400);
  await shot('m2b-05-site-scaffold');
  await site(() => window.__sandbox.sim.cur.buildings.find((b) => b.type === 'camp')?.state === 'done');
  await page.evaluate(() => {
    const s = window.__sandbox, b = s.sim.cur.buildings.find((q) => q.type === 'camp');
    s.build.selected = b.id;
  });
  await focus(-2, 2, 1 / 2);
  await wait(600);
  await shot('m2b-06-sites-overview-half');
  // gather: squad 0 (militia) on the nearest tree
  const node = await page.evaluate(([x, y]) => {
    const s = window.__sandbox, n = s.sim.nodes.filter((q) => q.res === 'wood' && q.amount > 5).sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0];
    s.sim.order({ kind: 'gather', squad: 0, node: n.id });
    return n;
  }, [home.x, home.y]);
  console.log('home', home.x, home.y, 'gather node', node.id, node.res, node.x, node.y);
  await site(() => window.__sandbox.drawn.filter((d) => d.u.squad === 0 && d.u.state === 'gather').length >= 2 && window.__sandbox.drawn.some((d) => d.u.squad === 0 && d.u.carry && d.u.state === 'move'));
  await page.evaluate(() => window.__sandbox.sim.speed(1));
  await page.evaluate(([x, y, hx, hy]) => window.__sandbox.focus((x + hx) / 2, (y + hy) / 2, 1), [node.x, node.y, home.x, home.y]);
  p = await page.evaluate(([x, y]) => window.__sandbox.toScreen(x, y - 0.5), [node.x, node.y]);
  await page.mouse.move(p.x, p.y);
  await wait(1200);
  await shot('m2b-07-gather-carry-1x');
  console.log('stock', JSON.stringify(await page.evaluate(() => window.__sandbox.sim.cur.stock)));
  console.log('buildings', JSON.stringify(await page.evaluate(() => window.__sandbox.sim.cur.buildings.map((b) => `${b.type}:${b.state}:${b.progress.toFixed(2)}`))));
  await page.click('#brawl');
  await page.waitForFunction(() => window.__sandbox.sim.stats.units >= 600);
  await page.evaluate(() => {
    const s = window.__sandbox, q = s.sim.cur.squads;
    const mine = q.filter((x) => x.team === 0), foes = q.filter((x) => x.team === 1);
    mine.forEach((x, i) => s.sim.order({ kind: 'attack', squad: x.id, target: foes[i % foes.length].id }));
    s.focus(s.spots.ford[0], s.spots.ford[1], 1 / 2);
  });
  await wait(6000);
  await fps('build mode brawl 600, zoom 1/2');
}

if (mode === 'biome') {
  const obj = (id) => page.evaluate((id) => window.__sandbox.region.objects.find((o) => o.id === id), id);
  await boot();
  const post = await obj('mountains/watch-post');
  await page.evaluate((p) => {
    const s = window.__sandbox, [sx, sy] = s.spots.passN;
    s.sim.spawn('you', 0, 'hoplite', 20, sx, sy - 3);
    s.sim.spawn('you', 0, 'archer', 12, sx - 3, sy - 6);
    s.sim.order({ kind: 'move', squad: 0, x: sx + 4, y: sy + 8 });
    s.focus((sx + p.x) / 2 + 2, (sy + p.y) / 2 + 4, 1);
  }, post);
  await wait(5000);
  await shot('b1b-pass-watch-post-1x');
  await boot();
  await page.evaluate(() => {
    const s = window.__sandbox, [x, y] = s.spots.passSaddle;
    // a column marching along the switchback past the ruined walls
    s.sim.spawn('you', 0, 'hoplite', 20, x - 8, y);
    s.sim.order({ kind: 'move', squad: 0, x: x + 8, y });
    s.focus(x, y + 1, 1);
  });
  await wait(6000);
  await shot('b1-pass-saddle-squad-1x');
  for (const [name, q] of [['b2-mountains-quarter', ''], ['b2t-mountains-quarter-terrace', '&mountains=terrace']]) {
    await boot(q);
    await page.evaluate(() => { const s = window.__sandbox, [x, y] = s.spots.passSaddle; s.focus(x - 10, y + 10, 1 / 4); });
    await wait(4000);
    await shot(name);
  }
  await boot();
  console.log('massifs', await page.evaluate(() => window.__sandbox.massifs?.list.length));
  // the wide interior west of the pass at 1/4: the crest's cores over the shaded flanks
  await page.evaluate(() => window.__sandbox.focus(60, 300, 1 / 4));
  await wait(3000);
  await shot('b2w-mountains-interior-quarter');
  const spring = await obj('kyrene/oasis-spring');
  await page.evaluate((o) => window.__sandbox.focus(o.x, o.y + 2, 1 / 2), spring);
  await wait(3000);
  await shot('b3-desert-oasis-half');
  await page.evaluate((o) => window.__sandbox.focus(o.x, o.y + 1, 1), spring);
  await wait(2000);
  await shot('b3b-oasis-1x');
  const tower = await obj('watchtower');
  await page.evaluate((t) => window.__sandbox.focus(t.x - 4, t.y + 2, 1 / 2), tower);
  await wait(3000);
  await shot('b4-elaia-plateau-half');
  const vines = await obj('elaia/vines');
  await page.evaluate((t) => window.__sandbox.focus(t.x + 4, t.y + 2, 1), vines);
  await wait(2000);
  await shot('b4b-elaia-vineyard-1x');
  await page.click('#brawl');
  await page.waitForFunction(() => window.__sandbox.sim.stats.units >= 600);
  await page.evaluate(() => {
    const s = window.__sandbox, q = s.sim.cur.squads;
    const mine = q.filter((x) => x.team === 0), foes = q.filter((x) => x.team === 1);
    mine.forEach((x, i) => s.sim.order({ kind: 'attack', squad: x.id, target: foes[i % foes.length].id }));
    s.focus(s.spots.ford[0], s.spots.ford[1], 1 / 2);
  });
  await wait(6000);
  await fps('biome brawl 600, zoom 1/2');
  await page.evaluate(() => { const s = window.__sandbox, [x, y] = s.spots.passSaddle; s.focus(x, y, 1 / 2); });
  await wait(3000);
  await fps('biome brawl 600 running, mountains at 1/2', 6);
  await page.waitForFunction(() => window.__sandbox.overviewReady, null, { timeout: 180000 });
  await page.evaluate(() => {
    const s = window.__sandbox, cam = s.cameras.main;
    cam.setZoom(1 / 24).centerOn(s.iso.W / 2, s.iso.H / 2);
  });
  await fps('biome overview, 600 units', 6);
  await shot('b5-overview');
}

if (mode === 'anim') {
  const seq = async (name, n) => {
    for (let i = 0; i < n; i++) {
      await page.screenshot({ path: `${out}/${name}-${String(i).padStart(3, '0')}.png`, clip: { x: 270, y: 200, width: 900, height: 500 } });
      await wait(100);
    }
    console.log('saved', `${out}/${name}-*.png`);
  };
  const frameFight = () => page.evaluate(() => {
    const s = window.__sandbox, f = s.drawn.filter((d) => d.u.state === 'attack' && (d.u.cls === 'hoplite' || d.u.cls === 'celt_sword'));
    const c = f.length ? f : s.drawn.filter((d) => d.u.state === 'attack');
    s.focus(c.reduce((a, d) => a + d.x, 0) / c.length, c.reduce((a, d) => a + d.y, 0) / c.length, 1);
  });
  await boot();
  await page.evaluate(() => {
    const s = window.__sandbox, { ford, fordW, fordE } = s.spots;
    s.sim.spawn('you', 0, 'hoplite', 16, fordW[0] + 4, fordW[1]);
    s.sim.spawn('you', 0, 'archer', 12, fordW[0] - 1, fordW[1] + 2);
    s.sim.spawn('bot', 1, 'celt_sword', 16, fordE[0] - 4, fordE[1]);
    s.sim.spawn('bot', 1, 'slinger', 12, fordE[0] + 1, fordE[1] - 2);
    s.sim.order({ kind: 'attack', squad: 0, target: 2 });
    s.sim.order({ kind: 'attack', squad: 1, target: 2 });
    s.sim.order({ kind: 'attack', squad: 2, target: 0 });
    s.sim.order({ kind: 'attack', squad: 3, target: 1 });
    s.focus(ford[0], ford[1], 1);
  });
  await page.waitForFunction(() => window.__sandbox.sim.cur.shots?.length > 0, null, { timeout: 60000 });
  await seq('anim-volley', 20);
  await page.waitForFunction(() => window.__sandbox.drawn.filter((d) => d.u.state === 'attack' && d.u.cls === 'hoplite').length >= 4, null, { timeout: 60000 });
  await frameFight();
  await seq('anim-ford', 40);
  await page.waitForFunction(() => window.__sandbox.drawn.filter((d) => d.u.state === 'dead').length >= 6, null, { timeout: 60000 });
  await frameFight();
  await seq('anim-deaths', 30);

  await boot();
  await page.evaluate(() => {
    const s = window.__sandbox, [x, y] = s.spots.fordW;
    s.sim.spawn('you', 0, 'militia', 20, x - 6, y + 6);
    s.focus(x - 6, y + 6, 1);
  });
  await wait(2500);
  await seq('anim-idle', 40);

  await page.click('#brawl');
  await page.waitForFunction(() => window.__sandbox.sim.stats.units >= 600);
  await page.evaluate(() => {
    const s = window.__sandbox, q = s.sim.cur.squads;
    const mine = q.filter((x) => x.team === 0), foes = q.filter((x) => x.team === 1);
    mine.forEach((x, i) => s.sim.order({ kind: 'attack', squad: x.id, target: foes[i % foes.length].id }));
    s.focus(s.spots.ford[0], s.spots.ford[1], 1 / 2);
  });
  await page.waitForFunction(() => window.__sandbox.drawn.filter((d) => d.u.state === 'attack').length >= 150, null, { timeout: 120000, polling: 500 });
  await page.evaluate(() => {
    const s = window.__sandbox, f = s.drawn.filter((d) => d.u.state === 'attack');
    s.focus(f.reduce((a, d) => a + d.x, 0) / f.length, f.reduce((a, d) => a + d.y, 0) / f.length, 1 / 2);
  });
  await fps('anim brawl 600 in melee, zoom 1/2');
  await shot('anim-brawl-600-half');
}

// scenarios: opening, the player's plan, mid fight, end score
const PLANS = {
  'pass-ambush': 'stand', // hold the pass where placed
  'ford-crossing': 'attack',
  'hill-assault': 'attack',
  'bridge-vs-ford': 'ford', // block the ford, then hunt the rest
  'brawl-600': 'attack',
  free: null,
};
const attackAll = () => page.evaluate(() => {
  const s = window.__sandbox, q = [...s.sim.squads.values()], alive = new Set(s.drawn.filter((d) => d.u.state !== 'dead').map((d) => d.u.squad));
  const foes = q.filter((x) => x.team !== 0 && alive.has(x.id));
  q.filter((x) => x.team === 0).forEach((x, i) => foes.length && s.sim.order({ kind: 'attack', squad: x.id, target: foes[i % foes.length].id }));
});
const score = () => page.evaluate(() => document.getElementById('score').textContent);
for (const [id, plan] of Object.entries(PLANS)) {
  if (mode === 'art' || mode === 'anim' || mode === 'biome' || mode === 'build' || (only && !only.includes(id))) continue;
  await boot(`&scenario=${id}`);
  if (plan) await page.waitForFunction(() => window.__sandbox.sim.squads.size > 0);
  await wait(2500);
  await shot(`s-${id}-1-open`);
  if (!plan) continue;
  await page.evaluate(() => window.__sandbox.sim.speed(4));
  if (plan === 'attack') await attackAll();
  if (plan === 'ford') {
    await page.evaluate(() => {
      const s = window.__sandbox, [x, y] = s.spots.fordW;
      [...s.sim.squads.values()].filter((q) => q.team === 0).forEach((q, i) => s.sim.order({ kind: 'move', squad: q.id, x: x - 4 - Math.floor(i / 3) * 6, y: y + ((i % 3) - 1) * 6 }));
    });
  }
  // mid fight: the first moment a tenth of the units are down, framed on the melee
  await page.waitForFunction(() => {
    const d = window.__sandbox.drawn;
    return d.length && d.filter((x) => x.u.state === 'dead').length >= d.length / 10;
  }, null, { timeout: 240000, polling: 500 }).catch(() => console.log(id, 'no casualties yet'));
  await page.evaluate(() => {
    const s = window.__sandbox, f = s.drawn.filter((x) => x.u.state === 'attack');
    const c = f.length ? f : s.drawn;
    s.focus(c.reduce((a, x) => a + x.x, 0) / c.length, c.reduce((a, x) => a + x.y, 0) / c.length, 1 / 2);
  });
  await wait(1500);
  await shot(`s-${id}-2-mid`);
  // play on to the end (bots that won their fight stand; then the player hunts the rest)
  for (let i = 0; i < 60 && !/won|all down/.test(await score()); i++) {
    await wait(4000);
    if (plan !== 'stand' && i % 3 === 2) await attackAll();
  }
  console.log(`${id}:\n${await score()}`);
  await shot(`s-${id}-3-end`);
}

await browser.close();
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
