// LF-01: replays PLAY.md B3, B5 and B6 with touch input at 390x844 and 360x780 (en), and 360x780 (ru).
// Usage: node docs/v5/stories/LF-01/repro.mjs http://localhost:<port>/
// Writes JPEGs next to this file and prints PASS/FAIL per check.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, phoneContext, captureErrors, makePageApi, check, finish } from '../../../../scripts/lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = dirname(fileURLToPath(import.meta.url));
const browser = await launch();
const TEXT = {
  en: { soon: /Contact soon/, oor: 'Out of range' },
  ru: { soon: /Скоро столкновение/, oor: 'Вне досягаемости' },
};

for (const [w, h, lang] of [
  [390, 844, 'en'],
  [360, 780, 'en'],
  [360, 780, 'ru'],
]) {
  const tag = `${w}x${h}-${lang}`;
  const T = TEXT[lang];
  const ctx = await phoneContext(browser, { viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = captureErrors(page);
  const { ev, call, wait, tap, until, untilPage, active, tapBtn } = makePageApi(page, { btnWaitMs: 4000 });
  const shot = (name) => page.screenshot({ path: `${out}/${tag}-${name}.jpg`, type: 'jpeg', quality: 40 });

  await page.goto(`${base}?lang=${lang}`);
  await untilPage(() => !!window.__game && window.__game.scene.isActive('Menu'), 30000);
  // B3's precondition (PLAY: "any army with an empty Reserve"): nobody in III, someone in IV.
  await ev(() => {
    const hs = window.__state.campaign.data.heroes;
    // starterParty: two hoplites and a peltast. The peltast goes to II, one hoplite to I, the other to IV.
    // (the peltast starts in IV; his weapon is javelins or a short spear at random: give him the javelins)
    const pel = hs.find((x) => x.group === 3) ?? hs[hs.length - 1];
    if (pel.equip.weapon) pel.equip.weapon.def = 'javelins';
    const rest = hs.filter((x) => x !== pel);
    pel.group = 1;
    rest.forEach((x, i) => (x.group = i === rest.length - 1 ? 3 : 0));
    window.__state.campaign.data.settings.seenGestureHint = true;
  });
  await ev(() => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true })));
  check(`[${tag}] deployment opens`, await until(() => active('Battle'), 15000));
  await wait(2500);
  const numerals = () =>
    call('Battle', 'return { cards: s.cards.map((c) => [s.sim.groups[c.gid].name, c.numeral]), tags: [...s.tagMap].map(([g, t]) => [s.sim.groups[g].name, t.getData("label")]) };');
  const dep = await numerals();
  await shot('01-b3-deploy');
  check(`[${tag}] B3 deployment: Flank is IV on the card and the badge`, JSON.stringify(dep.cards).includes('["Flank","IV"]') && JSON.stringify(dep.tags).includes('["Flank","IV"]'), JSON.stringify(dep));

  // Fight, by touch
  check(`[${tag}] Fight tapped`, await tapBtn('Battle', { id: 'battle.fight' }) || (await tapBtn('Battle', 'Fight')));
  check(`[${tag}] battle runs`, await untilPage(() => window.__game.scene.getScene('Battle').sim.phase === 'battle', 10000));
  await wait(800);
  const bat = await numerals();
  check(`[${tag}] B3 battle: Flank is still IV on the card and the badge`, JSON.stringify(bat.cards).includes('["Flank","IV"]') && !JSON.stringify(bat.cards).includes('["Flank","III"]'), JSON.stringify(bat));

  // B5: select Flank (tap its card), order Advance; far from the enemy the hint must not say "Contact soon".
  const cardPt = (name) =>
    call('Battle', `const c = s.cards.find((k) => s.sim.groups[k.gid].name === '${name}'); const r = c.card.getBounds(); return window.__css(r.centerX, r.centerY);`);
  let p = await cardPt('Flank');
  await tap(p[0], p[1]);
  await tapBtn('Battle', { id: 'battle.cmd.advance' });
  await wait(1800); // past the "Battle begins!" banner, which hides the hint
  const hint = () => call('Battle', 'return s.sitKey;');
  const far = await hint();
  await shot('02-b3-b5-battle-far');
  check(`[${tag}] B3 screenshot: Flank card IV in battle`, true);
  check(`[${tag}] B5 far: no "Contact soon"`, !T.soon.test(far), far);

  // B6: select the missile group; Shoot is on and nobody is in range: after 3 s of battle time the card says so.
  // PLAY C4: Shoot lit, slingers at 15 paces, nothing thrown and nothing said. Here the peltast in II, Shoot tapped on.
  const missile = await call('Battle', 'const g = s.sim.groups.find((x) => x.side === s.me && s.sim.activeMembers(x.id).some((u) => u.stats.range > 0 && u.ammo > 0)); return g ? g.name : JSON.stringify(s.sim.units.filter((u) => u.side === s.me).map((u) => [u.group, u.stats.range, u.ammo, u.state]));');
  if (missile === 'Skirmish') {
    p = await cardPt(missile);
    await tap(p[0], p[1]);
    // fall back out of reach (the small field starts the peltast near the foe), with Shoot on
    await tapBtn('Battle', { id: 'battle.cmd.fallback' });
    if (!(await call('Battle', `return s.sim.groups[s.selGroup].fireAtWill;`))) await tapBtn('Battle', { id: 'battle.cmd.loose' });
    check(`[${tag}] B6: Shoot is on`, await call('Battle', `return s.sim.groups[s.selGroup].name === '${missile}' && s.sim.groups[s.selGroup].fireAtWill;`));
    const t0 = await call('Battle', 'return s.sim.tick;');
    const said = await until(() => call('Battle', `const c = s.cards.find((k) => s.sim.groups[k.gid].name === '${missile}'); return c.card.info.orderWord === '${T.oor}';`), 60000, 300);
    const t1 = await call('Battle', 'return s.sim.tick;');
    await shot('03-b6-out-of-range');
    check(`[${tag}] B6: ${missile} card says Out of range with Shoot on`, said, `after ${((t1 - t0) / 20).toFixed(1)} s battle time`);
  } else check(`[${tag}] B6: the peltast's group II has missiles`, false, missile);

  // B5 near: Flank holds, and (scripted) one foe stands 5 paces in front of it while the bot still idles.
  // "Contact soon" shows, then clears after 6 s of battle time (or on contact).
  p = await cardPt('Flank');
  await tap(p[0], p[1]);
  await tapBtn('Battle', { id: 'battle.cmd.hold' });
  await call('Battle', `const fl = s.sim.groups.find((g) => g.side === s.me && g.name === 'Flank'); const u = s.sim.activeMembers(fl.id)[0];
    const e = s.sim.units.filter((x) => x.side !== s.me && x.state === 'ready').sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
    e.x = u.x + 5 * fl.formation.fx; e.y = u.y + 5 * fl.formation.fy; return 1;`);
  const soonSeen = await until(async () => T.soon.test(await hint()), 20000, 200);
  const s0 = await call('Battle', 'return s.sim.tick;');
  if (soonSeen) await shot('04-b5-contact-soon');
  check(`[${tag}] B5 near: "Contact soon" shows when the enemy is close`, soonSeen, await hint());
  const cleared = await until(async () => !T.soon.test(await hint()), 60000, 200);
  const s1 = await call('Battle', 'return s.sim.tick;');
  await shot('05-b5-cleared');
  check(`[${tag}] B5: it clears (contact or 6 s)`, cleared, `${await hint()} after ${((s1 - s0) / 20).toFixed(1)} s battle time`);

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await finish({ browser });
