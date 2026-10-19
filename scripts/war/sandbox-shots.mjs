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
// Mode `biome`, `build`, `buildux`, `walls`, `siege`, `interact`: see below.
// Usage: node scripts/war/sandbox-shots.mjs [baseUrl] [outDir] [sim] [all|scenarios|art|anim|biome|build|buildux|walls|siege|interact] [id,id...]
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

// Mode `buildux` (W-26, scenario build-test): footprint grid under the finished camp in build mode, the storehouse
// ghost (its sprite, green / red with the reason) with nothing selected, a click that lays it out as a planned site,
// a palisade ghost of kit pieces, the site panel (a squad selected, Assign 5), a planned fort that squads get by right
// click with workers round it, a storehouse and a barracks laid side by side under construction, then 600-unit fps.
if (mode === 'buildux') {
  await boot('&scenario=build-test');
  await page.waitForFunction(() => window.__sandbox.sim.cur.buildings?.some((b) => b.type === 'camp') && window.__sandbox.build.layer.art, null, { timeout: 60000 });
  const home = await page.evaluate(() => {
    const c = window.__sandbox.sim.cur.buildings.find((b) => b.type === 'camp');
    return { x: c.x, y: c.y };
  });
  const scr = (dx, dy) => page.evaluate(([x, y]) => window.__sandbox.toScreen(x, y), [home.x + dx, home.y + dy]);
  const focus = (dx, dy, z) => page.evaluate(([x, y, z]) => window.__sandbox.focus(x, y, z), [home.x + dx, home.y + dy, z]);
  const site = (pred, arg) => page.waitForFunction(pred, arg, { timeout: 180000, polling: 250 });
  const speed = (v) => page.evaluate((v) => window.__sandbox.sim.speed(v), v);
  /** The nearest spot round home where `type` passes the sim's placement check (centre snapped for its size). */
  const spot = (type, from = [0, 0], skip = []) => page.evaluate(async ([type, hx, hy, skip]) => {
    const s = window.__sandbox;
    for (let r = 0; r < 16; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const [w, h] = { fort: [10, 10], barracks: [4, 3], storehouse: [3, 3] }[type] ?? [3, 3];
      const x = Math.floor(hx) + dx + (w % 2 ? 0.5 : 0), y = Math.floor(hy) + dy + (h % 2 ? 0.5 : 0);
      if (skip.some(([a, b, m]) => Math.abs(a - x) < m && Math.abs(b - y) < m)) continue;
      const res = await s.sim.checkPlacement(0, type, x, y, 0);
      if (res?.ok) return [x, y];
    }
    return null;
  }, [type, home.x + from[0], home.y + from[1], skip]);

  await page.evaluate(() => { const s = window.__sandbox; s.build.addResources(); s.sim.speed(8); });
  await site(() => window.__sandbox.sim.cur.buildings.find((b) => b.type === 'camp')?.state === 'done');
  await speed(1);
  // 1: build mode with nothing selected: grids under the art (the squads stepped aside)
  await page.evaluate(([x, y]) => { const s = window.__sandbox; [0, 1, 2].forEach((q, i) => s.sim.order({ kind: 'move', squad: q, x: x - 10 + i * 7, y: y + 9 })); }, [home.x, home.y]);
  await wait(4000);
  await page.evaluate(() => { const s = window.__sandbox; s.selected.clear(); s.build.toggle(true); });
  await focus(0, 1, 1);
  let p = await scr(-5, 5);
  await page.mouse.move(p.x, p.y);
  await wait(800);
  await shot('bux-01-grid-under-camp');
  await focus(0, 0.5, 2);
  await wait(500);
  await shot('bux-01b-grid-under-camp-2x');
  await focus(0, 1, 1);
  // 2, 3: storehouse ghost, valid (east of the camp) and over the camp (invalid)
  await page.evaluate(() => window.__sandbox.build.setTool({ kind: 'building', type: 'storehouse' }));
  const st = await spot('storehouse', [6, 0]);
  p = await scr(st[0] - home.x, st[1] - home.y);
  await page.mouse.move(p.x, p.y);
  await wait(1000);
  await shot('bux-02-ghost-valid');
  const c = await scr(0.6, 0.6);
  await page.mouse.move(c.x, c.y);
  await wait(1000);
  await shot('bux-03-ghost-invalid');
  // lay the storehouse out with no squad selected: a planned site
  await page.mouse.move(p.x, p.y);
  await wait(1000);
  await page.mouse.click(p.x, p.y);
  await site(() => window.__sandbox.sim.cur.buildings.some((b) => b.type === 'storehouse'));
  // 4: palisade ghost of kit pieces south of the camp
  await page.evaluate(() => window.__sandbox.build.setTool({ kind: 'wall', material: 'wood' }));
  const a = await scr(-6, 6), b = await scr(4, 6);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await wait(1000);
  await shot('bux-04-wall-ghost-kit');
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // 5: site panel: militia squad 0 selected, click the planned storehouse, assign 5
  const sh = await page.evaluate(() => { const b = window.__sandbox.sim.cur.buildings.find((q) => q.type === 'storehouse'); return { id: b.id, x: b.x, y: b.y }; });
  await page.evaluate(() => { const s = window.__sandbox; s.selected.clear(); s.selected.add(0); });
  p = await page.evaluate(([x, y]) => window.__sandbox.toScreen(x, y), [sh.x, sh.y]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await wait(400);
  const sel = await page.evaluate(() => ({ b: window.__sandbox.build.selected, squads: [...window.__sandbox.selected] }));
  console.log('site click: selected building', sel.b, 'squads', sel.squads.join(','));
  if (sel.b !== sh.id || !sel.squads.includes(0)) problems.push('site click did not select the site with the squad kept');
  await page.fill('#sn', '5');
  await page.click('#sassign');
  await site((id) => (window.__sandbox.sim.cur.buildings.find((q) => q.id === id)?.workers ?? 0) > 0, sh.id);
  await wait(1500);
  await shot('bux-05-site-panel');
  const split = await page.evaluate(() => window.__sandbox.sim.cur.squads.map((q) => `${q.id}:${q.units.length}:${q.order}`).join(' '));
  console.log('squads after assign', split);
  // 6: a planned fort, the hoplites and the rest of the militia sent by right click
  const ft = await spot('fort', [0, -12], [[sh.x, sh.y, 8], [home.x, home.y, 8]]);
  console.log('fort at', ft);
  await page.evaluate(([x, y]) => window.__sandbox.sim.order({ kind: 'placeBuilding', team: 0, type: 'fort', x, y }), ft);
  await site(() => window.__sandbox.sim.cur.buildings.some((b) => b.type === 'fort'));
  await page.evaluate(([x, y]) => { const s = window.__sandbox; s.selected.clear(); s.selected.add(0); s.selected.add(1); s.selected.add(2); s.focus(x, y, 1 / 2); }, ft);
  await wait(300);
  p = await page.evaluate(([x, y]) => window.__sandbox.toScreen(x + 1, y + 1), ft);
  await page.mouse.move(p.x, p.y);
  await wait(100);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await speed(4);
  await site(() => { const f = window.__sandbox.sim.cur.buildings.find((b) => b.type === 'fort'); return f && f.workers >= 12 && f.progress > 0.04; });
  await speed(1);
  await page.evaluate(([x, y]) => { const s = window.__sandbox; s.selected.clear(); s.build.toggle(false); s.focus(x, y + 1, 1); }, ft);
  await page.mouse.move(20, 450);
  await wait(1500);
  await shot('bux-06-workers-round-fort');
  console.log('fort', await page.evaluate(() => { const f = window.__sandbox.sim.cur.buildings.find((b) => b.type === 'fort'); return `${f.state} ${f.progress.toFixed(2)} workers ${f.workers}/${f.maxWorkers}`; }));
  // 7: a barracks laid right against the storehouse (footprints touching), both under labour
  const bx = sh.x + 1.5 + 2, by = sh.y;
  const ok = await page.evaluate(([x, y]) => window.__sandbox.sim.checkPlacement(0, 'barracks', x, y, 0), [bx, by]);
  console.log('barracks next to the storehouse', bx, by, JSON.stringify(ok?.ok ?? ok), ok?.reason ?? '');
  await page.evaluate(([x, y]) => { const s = window.__sandbox; s.sim.order({ kind: 'placeBuilding', team: 0, type: 'barracks', x, y }); }, [bx, by]);
  await site(() => window.__sandbox.sim.cur.buildings.some((b) => b.type === 'barracks'));
  await page.evaluate(() => { const s = window.__sandbox; s.build.sendTo(1, s.sim.cur.buildings.find((b) => b.type === 'barracks').id); });
  await speed(8);
  await site(() => { const bs = window.__sandbox.sim.cur.buildings; return bs.some((b) => b.type === 'barracks' && b.progress > 0.3) && bs.some((b) => b.type === 'storehouse' && b.progress > 0.3); });
  await speed(1);
  await page.evaluate(([x, y]) => { const s = window.__sandbox; s.build.toggle(true); s.focus(x, y + 1, 1); }, [sh.x + 2, sh.y]);
  await wait(1200);
  await shot('bux-07-adjacent-sites');
  await page.evaluate(([x, y]) => window.__sandbox.focus(x, y + 1, 2), [bx, by]);
  await wait(800);
  await shot('bux-07b-workers-2x');
  await site(() => { const bs = window.__sandbox.sim.cur.buildings; return ['barracks', 'storehouse'].every((t) => bs.find((b) => b.type === t)?.state === 'done'); }).catch(() => {});
  await page.evaluate(() => { const s = window.__sandbox; s.build.toggle(false); s.build.selected = s.sim.cur.buildings.find((b) => b.type === 'storehouse').id; });
  await wait(800);
  await shot('bux-08-adjacent-done-selected-ring');
  console.log('buildings', JSON.stringify(await page.evaluate(() => window.__sandbox.sim.cur.buildings.map((b) => `${b.type}:${b.state}:${b.progress.toFixed(2)}:${b.w}x${b.h}`))));
  await page.click('#brawl');
  await page.waitForFunction(() => window.__sandbox.sim.stats.units >= 600);
  await page.evaluate(() => {
    const s = window.__sandbox, q = s.sim.cur.squads;
    const mine = q.filter((x) => x.team === 0 && x.units.length), foes = q.filter((x) => x.team === 1);
    mine.forEach((x, i) => s.sim.order({ kind: 'attack', squad: x.id, target: foes[i % foes.length].id }));
    s.focus(s.spots.ford[0], s.spots.ford[1], 1 / 2);
  });
  await wait(6000);
  await fps('buildux brawl 600, zoom 1/2');
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

// Mode `walls` (W-28 wall-walks, scenario wall-defense): a squad climbing the stone stairs, archers on the south walk
// behind the parapet, archers up the wood tower's ladder, the build tools (two pending stone wall lines with the inside
// arrows, flipped; a gate ghost on a line; a stone tower ghost joined to the walk; stairs and ladder snapped to the
// wall; barracks turned with R), an upgrade under way (rampart -> stone wall at its rising and scaffold stages,
// palisade -> rampart), the defense mid-fight, and the 600-unit brawl fps at 1/2.
if (mode === 'walls') {
  const bootWalls = async () => {
    await boot('&scenario=wall-defense');
    await page.waitForFunction(() => window.__sandbox.sim.cur.squads.length >= 10, null, { timeout: 300000 });
  };
  const scr = (x, y) => page.evaluate(([x, y]) => window.__sandbox.toScreen(x, y), [x, y]);
  const move = async (x, y) => { const p = await scr(x, y); await page.mouse.move(p.x, p.y, { steps: 3 }); };
  const drag = async (a, b) => { await move(...a); await page.mouse.down(); await move(...b); await wait(100); await page.mouse.up(); };
  /** Wait for at least n units lifted with px in [lo, hi] (and pred on the unit). */
  const lifted = (n, lo, hi, pred = 'true', ms = 60000) => page.waitForFunction(([n, lo, hi, pred]) => {
    const s = window.__sandbox, f = new Function('d', `return ${pred}`);
    return s.drawn.filter((d) => { const l = s.build.layer.lift(d); return l && !l.hide && l.px >= lo && l.px <= hi && d.u.state !== 'dead' && f(d); }).length >= n;
  }, [n, lo, hi, pred], { timeout: ms, polling: 100 });
  await bootWalls();
  // four archers down from the south walk, then up the stairs to the north walk
  await page.evaluate(() => window.__sandbox.sim.order({ kind: 'move', squad: 4, x: 124.5, y: 434.5 }));
  await page.waitForFunction(() => { const s = window.__sandbox; return s.drawn.filter((d) => d.u.squad === 4 && !s.build.layer.lift(d)).length >= 4; }, null, { timeout: 90000 }).catch(() => console.log('archers not all down'));
  await page.evaluate(() => window.__sandbox.sim.order({ kind: 'move', squad: 4, x: 126.5, y: 426.5 }));
  await lifted(1, 20, 150, 'd.x < 124.5 && d.u.squad === 4', 90000).catch(() => console.log('no stair climber caught'));
  await page.evaluate(() => {
    const s = window.__sandbox, d = s.drawn.find((q) => { const l = s.build.layer.lift(q); return q.u.squad === 4 && l && l.px >= 20 && l.px <= 150; });
    s.focus(d ? d.x + 1 : 123, d ? d.y + 1 : 430, 1);
  });
  await wait(300);
  await shot('walls-01-stairs-climb');
  // the tower's archers down its ladder and up again
  await page.evaluate(() => { const s = window.__sandbox; s.sim.order({ kind: 'move', squad: 5, x: 127.5, y: 431.5 }); s.focus(127, 430, 1); });
  await page.waitForFunction(() => { const s = window.__sandbox; return s.drawn.filter((d) => d.u.squad === 5 && !s.build.layer.lift(d)).length >= 4; }, null, { timeout: 90000 }).catch(() => console.log('tower archers not all down'));
  await page.evaluate(() => window.__sandbox.sim.order({ kind: 'move', squad: 5, x: 127, y: 427.6 }));
  await lifted(1, 15, 90, 'd.u.squad === 5 && d.y > 428.9', 90000).catch(() => console.log('no climber caught'));
  await shot('walls-02-ladder-climb');
  await lifted(3, 99, 99, 'd.u.squad === 5', 90000).catch(() => console.log('tower: fewer than 3 up'));
  await wait(500);
  await shot('walls-03-ladder-tower');
  await page.evaluate(() => window.__sandbox.focus(125, 440, 1));
  await lifted(6, 165, 165, 'd.y > 438.9', 120000).catch(() => console.log('walk: fewer than 6 archers on the south walk'));
  await wait(1500);
  await shot('walls-04-archers-walkway');
  // build tools, the sim paused
  await page.evaluate(() => { const s = window.__sandbox; s.sim.speed(0); s.focus(111, 440, 1); s.build.setTool({ kind: 'wall', material: 'stone' }); });
  await drag([104.5, 426.5], [104.5, 438.5]);
  await drag([108.5, 442.5], [116.5, 442.5]);
  await move(110, 437); await wait(1500);
  await shot('walls-05-wall-tool-two-lines');
  await page.keyboard.press('f'); await wait(1500);
  await shot('walls-06-wall-tool-flipped');
  await page.keyboard.press('g'); await move(112.5, 442.5); await wait(1500);
  await shot('walls-07-gate-ghost');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.evaluate(() => window.__sandbox.build.setTool({ kind: 'building', type: 'stoneTower' }));
  await move(118, 427); await wait(1500);
  await shot('walls-08-tower-ghost');
  await page.evaluate(() => { const s = window.__sandbox; s.focus(127, 434, 1); s.build.setTool({ kind: 'access', type: 'stoneStairs' }); });
  await move(128, 430); await wait(1500);
  await shot('walls-09-stairs-tool');
  await page.evaluate(() => window.__sandbox.build.setTool({ kind: 'access', type: 'ladder' }));
  await move(127, 443); await wait(1500);
  await shot('walls-10-ladder-tool');
  await page.evaluate(() => { const s = window.__sandbox; s.focus(110, 434, 1); s.build.setTool({ kind: 'building', type: 'barracks' }); });
  await move(110, 434); await wait(1200);
  await shot('walls-11-rotate-0');
  await page.keyboard.press('r'); await wait(1200);
  await shot('walls-12-rotate-1');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  // the defense mid-fight
  await page.evaluate(() => window.__sandbox.sim.speed(2));
  await page.waitForFunction(() => window.__sandbox.drawn.filter((d) => d.u.state === 'attack').length >= 12, null, { timeout: 120000 }).catch(() => console.log('few attacking'));
  await wait(4000);
  await page.evaluate(() => window.__sandbox.focus(127.5, 438, 1 / 2));
  await wait(1500);
  await shot('walls-13-defense-mid');
  await page.evaluate(() => window.__sandbox.focus(126, 440, 1));
  await wait(1200);
  await shot('walls-14-defense-mid-1x');
  // an upgrade under way: a timber rampart and a palisade built east of the ring, then upgraded by the spears
  await bootWalls();
  await page.evaluate(() => {
    const s = window.__sandbox;
    s.sim.order({ kind: 'placeWall', team: 0, material: 'timber', points: [139.5, 428.5, 139.5, 436.5], inside: [127, 432] });
    s.sim.order({ kind: 'placeWall', team: 0, material: 'wood', points: [142.5, 428.5, 142.5, 436.5], inside: [127, 432] });
    s.sim.prebuild(0, 20000);
  });
  await page.waitForFunction(() => { const b = window.__sandbox.sim.cur.buildings; return b.filter((q) => q.type === 'rampart' || q.type === 'palisade').length >= 4 && b.every((q) => q.state !== 'foundation' && q.state !== 'scaffold' || q.type === 'ladder'); }, null, { timeout: 120000 });
  await page.evaluate(() => {
    const s = window.__sandbox, b = s.sim.cur.buildings;
    for (const q of b.filter((q) => q.type === 'rampart' || q.type === 'palisade')) s.sim.order({ kind: 'upgrade', building: q.id, squad: q.type === 'rampart' ? 0 : 1 });
    s.sim.speed(4);
    s.focus(140, 433, 1);
  });
  await page.waitForFunction(() => window.__sandbox.sim.cur.buildings.some((q) => q.upgradeFrom === 'rampart' && q.progress >= 0.3), null, { timeout: 240000 });
  await page.evaluate(() => window.__sandbox.sim.speed(0)); await wait(1200);
  await shot('walls-15-upgrade-rising');
  await page.evaluate(() => window.__sandbox.sim.speed(4));
  await page.waitForFunction(() => window.__sandbox.sim.cur.buildings.some((q) => q.upgradeFrom === 'rampart' && q.progress >= 0.65), null, { timeout: 240000 });
  await page.evaluate(() => { const s = window.__sandbox; s.sim.speed(0); s.build.selected = s.sim.cur.buildings.find((q) => q.upgradeFrom === 'rampart').id; }); await wait(1200);
  await shot('walls-16-upgrade-scaffold');
  // 600 units
  await boot('&scenario=brawl-600');
  await page.waitForFunction(() => window.__sandbox.drawn.length >= 600, null, { timeout: 60000 });
  await page.evaluate(() => { const s = window.__sandbox, [x, y] = s.spots.ford; s.sim.speed(1); s.focus(x, y, 1 / 2); });
  await wait(3000);
  await fps('walls 600 brawl 1/2', 16);
}

// Mode `siege` (M2c, scenarios siege and siege-defend): the siege tools in build mode, the ladder rising and raised with
// climbers, the ram at the gate mid-swing, the stone thrower mid-throw with a boulder in the air, the palisade burning
// (fire arrows), a breach (the gate battered down; dev damage once the ram has had its go) with units pouring in, a
// fallen tower, scorch and rubble; siege-defend mid-fight; the 600-unit brawl fps at 1/2.
if (mode === 'siege') {
  const sv = (f, a) => page.evaluate(f, a);
  await boot('&scenario=siege');
  await page.waitForFunction(() => { const s = window.__sandbox; return s.sim.cur.squads.length >= 13 && (s.sim.cur.sieges ?? []).filter((e) => e.crew >= 0).length >= 3; }, null, { timeout: 600000, polling: 500 });
  await wait(1500);
  await shot('siege-01-open');
  // build mode: the siege tools with a squad selected
  await sv(() => { const s = window.__sandbox; s.sim.speed(0); s.selected.clear(); s.selected.add(4); s.focus(124, 462, 1); s.build.setTool({ kind: 'siege', type: 'ram' }); });
  const sp = await sv(() => window.__sandbox.toScreen(121, 470));
  await page.mouse.move(sp.x, sp.y, { steps: 2 });
  await wait(800);
  await shot('siege-02-build-ram-tool');
  await sv(() => { const s = window.__sandbox; s.build.setTool(null); s.build.toggle(false); s.selected.clear(); s.selected.add(7); s.sim.speed(2); });
  // the plan: ram on the gate, ladder on the south wall, thrower on the south-east tower, fire arrows on the palisade
  const plan = await sv(() => {
    const s = window.__sandbox, b = s.sim.cur.buildings.filter((q) => q.team === 1 && q.state !== 'destroyed');
    const gate = b.find((q) => q.type === 'stoneGate'), towers = b.filter((q) => q.type === 'stoneTower' && q.y > 436).sort((p, q) => q.x - p.x);
    const pal = b.filter((q) => q.type === 'palisade').sort((p, q) => p.x - q.x);
    // a south wall line tile west of the gate, off the towers
    const tiles = b.filter((q) => q.type === 'stoneWall').flatMap((q) => { const t = []; for (let i = 0; i < q.tiles.length; i += 2) t.push([q.tiles[i], q.tiles[i + 1]]); return t; });
    const wall = tiles.filter(([x, y]) => y === 440 && x >= 123 && x <= 125)[0] ?? tiles.find(([, y]) => y === 440);
    s.sim.order({ kind: 'attackBuilding', squad: 7, building: gate.id });
    s.sim.order({ kind: 'raiseLadder', squad: 8, wallTile: wall });
    s.sim.order({ kind: 'attackBuilding', squad: 9, building: towers[0].id });
    // the archers first shoot the wall archers off the crews; the spears close up behind the ram
    s.sim.order({ kind: 'attack', squad: 6, target: 10 });
    s.sim.order({ kind: 'move', squad: 4, x: 124, y: 450 });
    return { gate: gate.id, tower: towers[0].id, wall, pal: pal.map((q) => q.id) };
  });
  console.log('siege plan', JSON.stringify(plan));
  // the ladder up: shot rising, then with climbers
  await page.waitForFunction(() => (window.__sandbox.sim.cur.sieges ?? [])[1]?.state === 'raising', null, { timeout: 240000, polling: 100 }).catch(() => console.log('ladder never raising'));
  await sv(() => { const s = window.__sandbox, e = s.sim.cur.sieges[1]; s.focus(e.x, e.y - 2, 1); });
  await wait(1200);
  await shot('siege-03-ladder-raising');
  await page.waitForFunction(() => window.__sandbox.sim.cur.buildings.some((q) => q.siege !== undefined && q.state === 'done'), null, { timeout: 240000, polling: 200 }).catch(() => console.log('ladder never raised'));
  await sv((w) => { const s = window.__sandbox; for (const q of [8, 4]) s.sim.order({ kind: 'move', squad: q, x: w[0] + 0.5, y: w[1] - 0.5 }); }, plan.wall);
  await page.waitForFunction(() => window.__sandbox.build.layer.climbing.size >= 2, null, { timeout: 120000, polling: 100 }).catch(() => console.log('no climbers caught'));
  await sv(() => window.__sandbox.sim.speed(0));
  await wait(600);
  await shot('siege-04-ladder-climbers');
  // the ram mid-swing at the gate (speed 1 so a frame of the swing is caught)
  await sv(() => window.__sandbox.sim.speed(1));
  await page.waitForFunction(() => { const e = window.__sandbox.sim.cur.sieges[0]; return e.state === 'attack' && e.swing !== undefined; }, null, { timeout: 240000, polling: 100 }).catch(() => console.log('ram never swung'));
  await sv(() => { const s = window.__sandbox, e = s.sim.cur.sieges[0]; s.focus(e.x, e.y - 1.5, 1); });
  await page.waitForFunction(() => { const e = window.__sandbox.sim.cur.sieges[0]; return e.state === 'attack' && (e.swing === 0 || e.swing === 1); }, null, { timeout: 60000, polling: 20 }).catch(() => console.log('no swing frame'));
  await wait(60);
  await shot('siege-05-ram-swing');
  // the thrower: deployed, shooting; caught as the boulder leaves
  await sv(() => window.__sandbox.sim.speed(2));
  await page.waitForFunction(() => { const e = window.__sandbox.sim.cur.sieges[2]; return e.state === 'deployed' && e.swing !== undefined; }, null, { timeout: 300000, polling: 100 }).catch(() => console.log('thrower never shot'));
  await sv(() => { const s = window.__sandbox, e = s.sim.cur.sieges[2]; s.focus(e.x - 2, e.y - 5, 1 / 2); s.sim.speed(1); });
  await page.waitForFunction(() => { const e = window.__sandbox.sim.cur.sieges[2]; return e.swing >= 2 && e.swing <= 4; }, null, { timeout: 60000, polling: 20 }).catch(() => console.log('no throw frame'));
  await shot('siege-06-thrower-throw');
  await sv(() => { const s = window.__sandbox, e = s.sim.cur.sieges[2]; s.focus(e.x, e.y - 1, 1); });
  await page.waitForFunction(() => { const e = window.__sandbox.sim.cur.sieges[2]; return e.swing >= 0 && e.swing <= 1; }, null, { timeout: 60000, polling: 20 }).catch(() => console.log('no release frame'));
  await shot('siege-07-thrower-release-1x');
  // the palisade burning (fire arrows)
  await sv((pal) => { const s = window.__sandbox; s.sim.order({ kind: 'fireArrows', squad: 6, on: true }); s.sim.order({ kind: 'attackBuilding', squad: 6, building: pal[pal.length - 1] }); s.sim.speed(2); }, plan.pal);
  await page.waitForFunction(() => window.__sandbox.sim.cur.buildings.some((q) => q.type === 'palisade' && (q.burning ?? 0) >= 0.5), null, { timeout: 300000, polling: 200 }).catch(() => console.log('palisade never burning'));
  await sv(() => { const s = window.__sandbox, p = s.sim.cur.buildings.filter((q) => q.type === 'palisade' && q.burning).sort((a, b) => b.burning - a.burning)[0]; if (p) s.focus(p.x, p.y - 1, 1); });
  await wait(1200);
  await shot('siege-08-palisade-burning');
  await sv(() => window.__sandbox.focus(134, 446, 1 / 2));
  await wait(600);
  await shot('siege-09-fire-half');
  // the breach: the gate battered down, the army pours in
  await sv((g) => { const s = window.__sandbox; s.sim.speed(4); s.sim.damageBuilding(g, 1e5); }, plan.gate);
  await page.waitForFunction((g) => window.__sandbox.sim.cur.buildings.find((q) => q.id === g)?.state === 'destroyed', plan.gate, { timeout: 60000 });
  await sv(() => { const s = window.__sandbox; for (const q of [4, 5, 7, 9, 6]) s.sim.order({ kind: 'move', squad: q, x: 127.5 + (q % 3) - 1, y: 432 }); s.sim.speed(1); s.focus(127.5, 441, 1); });
  await page.waitForFunction(() => window.__sandbox.drawn.filter((d) => d.team === 0 && d.u.state !== 'dead' && d.y > 437.5 && d.y < 443 && Math.abs(d.x - 127.5) < 3).length >= 8, null, { timeout: 120000, polling: 100 }).catch(() => console.log('few in the breach'));
  await wait(300);
  await shot('siege-10-breach-pouring-in');
  await sv(() => window.__sandbox.focus(127.5, 438, 1 / 2));
  await wait(800);
  await shot('siege-11-breach-half');
  // a fallen tower, the scorched outwork
  await sv((t) => window.__sandbox.sim.damageBuilding(t, 1e5), plan.tower);
  await wait(2500);
  await sv(() => { const s = window.__sandbox, t = s.sim.cur.buildings.find((q) => q.type === 'stoneTower' && q.state === 'destroyed'); if (t) s.focus(t.x, t.y, 1); });
  await wait(800);
  await shot('siege-12-tower-rubble');
  await sv(() => window.__sandbox.sim.speed(4));
  await page.waitForFunction(() => !window.__sandbox.sim.cur.buildings.some((q) => q.type === 'palisade' && q.burning), null, { timeout: 120000, polling: 500 }).catch(() => console.log('palisade still burning'));
  await sv(() => window.__sandbox.focus(134, 446, 1));
  await wait(800);
  await shot('siege-13-scorch-rubble');
  // siege-defend: the bots' siege mid-fight
  await boot('&scenario=siege-defend');
  await page.waitForFunction(() => window.__sandbox.sim.cur.squads.length >= 12, null, { timeout: 600000, polling: 500 });
  await sv(() => window.__sandbox.sim.speed(4));
  await page.waitForFunction(() => (window.__sandbox.sim.cur.sieges ?? []).some((e) => e.state === 'raised' || e.state === 'attack'), null, { timeout: 240000, polling: 200 }).catch(() => console.log('defend: no ladder or ram at work'));
  await sv(() => { const s = window.__sandbox; s.sim.speed(1); s.focus(127.5, 443, 1 / 2); });
  await wait(2500);
  await shot('siege-14-defend-mid');
  await sv(() => window.__sandbox.focus(126, 442, 1));
  await wait(1200);
  await shot('siege-15-defend-mid-1x');
  // 600 units
  await boot('&scenario=brawl-600');
  await page.waitForFunction(() => window.__sandbox.drawn.length >= 600, null, { timeout: 60000 });
  await sv(() => { const s = window.__sandbox, [x, y] = s.spots.ford; s.sim.speed(1); s.focus(x, y, 1 / 2); });
  await wait(3000);
  await fps('siege 600 brawl 1/2', 16);
}

// Mode `interact` (W-30 and fire v2): the context action label at the cursor for an own engine (uncrew), a carried
// ladder at an enemy wall (raise), enemy wood (ignite), an enemy stone gate (attack), own fire (extinguish), the ground
// (move); E runs it. The palisade burning low and high and an own wooden tower burning (the sim paused, intensities
// set on the snapshot), the enemy fort with its garrison hidden behind the walls (no outlines), the own walled camp
// with own men outlined; the siege view fps at 1.
if (mode === 'interact') {
  const sv = (f, a) => page.evaluate(f, a);
  const hover = async (name, squad, x, y) => {
    await sv(([q]) => { const s = window.__sandbox; s.selected.clear(); s.selected.add(q); }, [squad]);
    const p = await sv(([px, py]) => window.__sandbox.toScreen(px, py), [x, y]);
    await page.mouse.move(p.x - 3, p.y - 3);
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await wait(300);
    console.log(name, '->', await sv(() => document.getElementById('hoverAct').textContent));
    await shot(name);
  };
  await boot('&scenario=siege');
  await page.waitForFunction(() => { const s = window.__sandbox; return s.sim.cur.squads.length >= 13 && (s.sim.cur.sieges ?? []).filter((e) => e.crew >= 0).length >= 3; }, null, { timeout: 600000, polling: 500 });
  await sv(() => window.__sandbox.sim.speed(0));
  await wait(500);
  const at = await sv(() => {
    const s = window.__sandbox, b = s.sim.cur.buildings.filter((q) => q.team === 1 && q.state !== 'destroyed');
    const gate = b.find((q) => q.type === 'stoneGate'), pal = b.filter((q) => q.type === 'palisade').sort((p, q) => p.x - q.x);
    const ram = s.sim.cur.sieges[0];
    return { gate: [gate.x, gate.y], ram: [ram.x, ram.y], pal: pal.map((q) => [q.id, q.x, q.y]), wall: [121.5, 440.5] };
  });
  await sv(([x, y]) => window.__sandbox.focus(x, y - 3, 1), at.ram);
  await hover('ia-01-uncrew-ram', 7, at.ram[0], at.ram[1]);
  await sv(([x, y]) => window.__sandbox.focus(x, y + 2, 1), at.wall);
  await hover('ia-02-raise-ladder', 8, at.wall[0], at.wall[1]);
  const p0 = at.pal[Math.floor(at.pal.length / 2)];
  await sv(([, x, y]) => window.__sandbox.focus(x, y - 1, 1), p0);
  await hover('ia-03-ignite-palisade', 4, p0[1], p0[2]);
  await sv(([x, y]) => window.__sandbox.focus(x, y + 2, 1), at.gate);
  await hover('ia-04-attack-gate', 4, at.gate[0], at.gate[1]);
  await hover('ia-05-move', 4, at.gate[0] - 3, at.gate[1] + 8);
  // E runs the label's action: ignite the palisade
  await sv(([, x, y]) => window.__sandbox.focus(x, y - 1, 1), p0);
  const pp = await sv(([, x, y]) => window.__sandbox.toScreen(x, y), p0);
  await sv(() => { const s = window.__sandbox; s.selected.clear(); s.selected.add(4); });
  await page.mouse.move(pp.x, pp.y, { steps: 2 });
  await wait(200);
  await page.keyboard.press('e');
  await sv(() => window.__sandbox.sim.speed(1));
  await wait(400);
  console.log('E on the palisade: squad 4 order', await sv(() => window.__sandbox.sim.squads.get(4)?.order));
  await sv(() => window.__sandbox.sim.speed(0));
  await wait(400);
  // the palisade burning: low on its west half, high on its east half (the snapshot held while paused)
  const set = (ids, k) => sv(([ids, k]) => { for (const b of window.__sandbox.sim.cur.buildings) if (ids.includes(b.id)) b.burning = k; }, [ids, k]);
  const ids = at.pal.map((q) => q[0]), half = Math.ceil(ids.length / 2);
  await set(ids.slice(0, half), 0.2);
  await set(ids.slice(half), 0.95);
  await page.mouse.move(700, 880); // off the map's middle, clear of the edge pan
  await sv(() => { const s = window.__sandbox; s.selected.clear(); });
  const lo = at.pal[Math.floor(half / 2)], hi = at.pal[half + Math.floor((ids.length - half) / 2)];
  await sv(([, x, y]) => window.__sandbox.focus(x, y - 1.5, 1), lo);
  await wait(800);
  await shot('ia-06-palisade-low');
  await sv(([, x, y]) => window.__sandbox.focus(x, y - 1.5, 1), hi);
  await wait(800);
  await shot('ia-07-palisade-high');
  await sv(([, x, y]) => window.__sandbox.focus(x, y - 1.5, 2), hi);
  await wait(800);
  await shot('ia-08-palisade-high-2x');
  await sv(([, x, y]) => window.__sandbox.focus(x, y - 1.5, 1), hi);
  await fps('palisade burning 1x', 8);
  // out: smouldering, then charred
  await set(ids, 0);
  await wait(1500);
  await shot('ia-09-palisade-smoulder');
  // the fort: the garrison behind the walls is not outlined
  await sv(([x, y]) => window.__sandbox.focus(x - 4, y - 4, 1), at.gate);
  await sv(() => window.__sandbox.sim.speed(1));
  await wait(1500);
  await shot('ia-10-fort-no-foe-outlines');
  await fps('siege fort 1x', 8);
  // own walled camp: own men behind the walls outlined; the wooden tower burning; extinguish
  await boot('&scenario=wall-defense');
  await page.waitForFunction(() => window.__sandbox.sim.cur.buildings.some((q) => q.type === 'woodTower' && q.state === 'done') && window.__sandbox.sim.cur.squads.length >= 6, null, { timeout: 600000, polling: 500 });
  await wait(3000);
  await sv(() => window.__sandbox.sim.speed(0));
  const tw = await sv(() => { const t = window.__sandbox.sim.cur.buildings.find((q) => q.type === 'woodTower'); t.burning = 0.9; return [t.x, t.y]; });
  await sv(([x, y]) => window.__sandbox.focus(x, y - 2, 1), tw);
  await wait(800);
  await shot('ia-11-tower-burning');
  await hover('ia-12-extinguish-tower', 0, tw[0], tw[1]);
  await sv(() => window.__sandbox.selected.clear());
  await page.mouse.move(700, 880); // off the map's middle, clear of the edge pan
  await sv(() => { const t = window.__sandbox.sim.cur.buildings.find((q) => q.type === 'woodTower'); t.burning = 0.25; });
  await wait(500);
  await shot('ia-13-tower-low');
  await sv(([x, y]) => window.__sandbox.focus(x, y + 3, 1), tw);
  await sv(() => window.__sandbox.sim.speed(1));
  await wait(1500);
  await shot('ia-14-own-camp-outlines');
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
  if (mode === 'art' || mode === 'anim' || mode === 'biome' || mode === 'build' || mode === 'buildux' || mode === 'walls' || mode === 'siege' || mode === 'interact' || (only && !only.includes(id))) continue;
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
