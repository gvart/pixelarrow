// M7g living regions (offline): building cards of pre-built pieces in a frontier town (a damaged house with its repair
// bill, ruined agora houses with their rebuild bill), the landmark panel after Drakon is slain, and the world map's
// landmark markers and hover card (world.html?offline=1, the mock's landmarks).
// Usage: node scripts/war/living-shots.mjs [baseUrl] [outDir]. Requires a running dev server.
import { launch, captureErrors, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/living', process.argv[3]);
const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = captureErrors(page, { prefix: true });
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', `${out}/${name}.png`);
};
const ready = async () => { await page.waitForFunction(() => window.__sandbox?.sim?.cur?.buildings?.length > 0, null, { timeout: 180000 }); await page.evaluate(() => window.__sandbox.setFog(false)); };

/** Select building `id` and centre the camera on it. */
const focus = (id) => page.evaluate((id) => {
  const s = window.__sandbox, b = s.sim.cur.buildings.find((x) => x.id === id);
  s.build.selected = id;
  s.focus(b.x, b.y, 1);
  return b.type;
}, id);

// (a) a damaged house (and temple) in a frontier town, (b) ruined houses with the rebuild bill
await page.goto(`${base}sandbox.html?region=${process.env.TOWN ?? 'stymphalia'}&sim=real&offline=1`);
await ready();
await wait(2500);
const pick = await page.evaluate(() => {
  const bs = window.__sandbox.sim.cur.buildings.filter((b) => b.pre && !b.landmark && !b.ruin);
  const houses = bs.filter((b) => b.type === 'house'), temple = bs.find((b) => b.type === 'temple');
  return { hurt: houses[0]?.id, ruins: houses.slice(1, 4).map((b) => b.id), temple: temple?.id, hp: houses[0]?.maxHp, thp: temple?.maxHp };
});
console.log('picked', pick);
if (pick.hurt !== undefined) await page.evaluate(({ id, hp }) => window.__sandbox.sim.damageBuilding(id, hp * 0.4), { id: pick.hurt, hp: pick.hp });
if (pick.temple !== undefined) await page.evaluate(({ id, hp }) => window.__sandbox.sim.damageBuilding(id, hp * 0.22), { id: pick.temple, hp: pick.thp });
for (const id of pick.ruins) await page.evaluate((id) => window.__sandbox.sim.damageBuilding(id, 1e6), id);
await wait(1500);
await focus(pick.hurt);
await wait(1200);
await shot('living_1_house_damaged_card');
if (pick.temple !== undefined) { await focus(pick.temple); await wait(1200); await shot('living_2_temple_damaged_card'); }
if (pick.ruins.length) { await focus(pick.ruins[0]); await wait(1200); await shot('living_3_ruined_houses_card'); }

// (d) the landmark panel: Drakon slain at his citadel
await page.goto(`${base}sandbox.html?region=krios&sim=real&offline=1`);
await ready();
await wait(2500);
await page.evaluate(() => window.__sandbox.sim.hurtBossTo('drakon', 0));
await wait(2500);
await page.evaluate(() => {
  const s = window.__sandbox, k = s.sim.cur.buildings.filter((b) => b.landmark).sort((a, b) => b.maxHp - a.maxHp)[0];
  if (k) s.build.selected = k.id;
});
await wait(1200);
await shot('living_4_citadel_guardian_slain');
// ... and taken: every claim point ours, the pieces take the capture damage (≤ 40%, gates open), function dormant
await page.evaluate(() => window.__sandbox.sim.takeRegion(0));
await wait(1500);
await page.evaluate(() => window.__sandbox.sim.hurtBossTo('drakon', 0)); // recall brings its guardian back: slay it again
await wait(2500);
await page.evaluate(() => {
  const s = window.__sandbox, k = s.sim.cur.buildings.filter((b) => b.landmark && !b.ruin).sort((a, b) => b.maxHp - a.maxHp)[0];
  if (k) { s.build.selected = k.id; s.focus(k.x, k.y, 0.8); }
});
await wait(1500);
await shot('living_4b_citadel_taken_damaged');

// (c) the world map: landmark markers and the hover card
await page.goto(`${base}world.html?offline=1`);
await page.waitForFunction(() => window.__world?.st?.regions?.size > 0, null, { timeout: 60000 });
await wait(1500);
await shot('living_5_world_landmarks');
for (const [id, name] of [['krios', 'krios_taken'], ['canyons', 'canyons_slain'], ['siren', 'siren_restored'], ['ammon', 'ammon_guarded']]) {
  await page.evaluate(([id]) => window.__world.hover(id, 520, 200, true), [id]);
  await wait(400);
  await shot(`living_6_card_${name}`);
}
await page.evaluate(() => window.__world.hover('erymanthos', 520, 200, false));
await wait(400);
await shot('living_7_region_card_depth_lore');
console.log(problems.length ? problems.join('\n') : 'no page errors');
await browser.close();
