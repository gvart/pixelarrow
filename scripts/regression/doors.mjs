// The doors hub-flows.mjs walks (docs/SCREEN_FLOW.md §3): each opens a
// screen from a hub flow and presses Telegram's Back, which must land on the
// screen-flow target. Pure data, so tests/regression/doors.test.ts can hold the
// table to src/platform/nav.ts BACK_RULES (every parent/origin screen has a
// door, and each door's `back` is what resolveBack says).
//
//   hub     the mode tab the flow belongs to
//   from    [scene, data] the door is opened from (started fresh)
//   prep    optional page function body (`s` = the `from` scene) run before the door; must return true
//   via     { tap: layout id } a real tap on that kit button (the player's path)
//           { start: [scene, data] } a door the script cannot reach by a tap
//                                    (a deep link, a map hex, a list row)
//           { call: body } a scene method on `from` (a hub's sub-view)
//   at      the screen the door opens
//   origin  the origin the door passes (multi-door screens), else null
//   back    the screen Back lands on
//   state   optional page function body (`s` = the `back` scene) that must hold
//           after Back (a hub's sub-view: which view is shown)

/** Screens with a Back rule that the door walk leaves to another script, with the reason. */
export const ELSEWHERE = {
  FirstRun: 'scripts/tutorial-smoke.mjs walks offer, resume, reward and modes',
  Results: 'scripts/regression/battle-kinds.mjs: Results back to the origin, per battle kind',
  BeastTrial: 'retired by CDX-01: it redirects to the Codex at once (no screen of its own)',
};

const DUEL = ['Duel', { preview: true }];
/** World: the party stands on campable ground (as scripts/smoke.mjs stages it), no band hunts it, and a camp is pitched. */
const PITCH_CAMP = `const w = s.w; w.stop(); w.s.safeUntil = 1e9; for (const q of w.s.parties) q.idle = 1e9;
  const x0 = Math.floor(w.s.x), y0 = Math.floor(w.s.y);
  search: for (let r = 0; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    w.s.x = x0 + dx + 0.5; w.s.y = y0 + dy + 0.5;
    if (!w.campBlocker()) break search;
  }
  s.makeCamp(); return !!w.camp;`;

export const DOORS = [
  // ---- Campaign (from a fresh game: Begin the march makes the save the other doors need)
  { name: 'Campaign hub -> Begin the march -> World', hub: 'campaign', from: ['Menu', {}], via: { tap: 'menu.new' }, at: 'World', origin: null, back: 'Menu' },
  { name: 'Campaign hub -> Army tile -> Army', hub: 'campaign', from: ['Menu', {}], via: { tap: 'menu.army' }, at: 'Army', origin: 'Menu', back: 'Menu' },
  { name: 'Campaign hub -> Stash tile -> Army stash', hub: 'campaign', from: ['Menu', {}], via: { tap: 'menu.stash' }, at: 'Army', origin: 'Menu', back: 'Menu' },
  { name: 'Campaign hub -> Continue -> World', hub: 'campaign', from: ['Menu', {}], via: { tap: 'menu.continue' }, at: 'World', origin: null, back: 'Menu' },
  { name: 'World -> Party -> Army', hub: 'campaign', from: ['World', {}], via: { tap: 'world.party' }, at: 'Army', origin: 'World', back: 'World' },
  // the field camp opens once a camp is pitched (World makeCamp; the Campaign hub's Camp tile is disabled until then)
  { name: 'World -> Camp -> Field camp', hub: 'campaign', from: ['World', {}], prep: PITCH_CAMP, via: { tap: 'world.camp' }, at: 'Camp', origin: null, back: 'World' },
  { name: 'Campaign hub -> Camp tile -> Field camp', hub: 'campaign', from: ['Menu', {}], via: { tap: 'menu.camp' }, at: 'Camp', origin: null, back: 'World' },
  { name: 'World -> the start town -> Settlement', hub: 'campaign', from: ['World', {}], via: { start: ['Settlement', { id: '$startTown' }] }, at: 'Settlement', origin: null, back: 'World' },
  { name: 'Settlement -> Party -> Army', hub: 'campaign', from: ['Settlement', { id: '$startTown' }], via: { tap: 'town.party' }, at: 'Army', origin: 'Settlement', back: 'Settlement' },
  { name: 'Army -> Sheet -> Hero', hub: 'campaign', from: ['Army', { from: 'World' }], via: { tap: 'army.sheet' }, at: 'Hero', origin: 'Army', back: 'Army' },
  { name: 'Kit (debug) -> Campaign hub', hub: 'campaign', from: ['Menu', {}], via: { start: ['Kit', {}] }, at: 'Kit', origin: null, back: 'Menu' },
  // ---- Duels (the in-memory demo army): sub-views go back to the hub view they came from
  { name: 'Duels Ladder -> Team', hub: 'duels', from: DUEL, via: { call: "s.openMode('ladder'); s.openView('team');" }, at: 'Duel', origin: null, back: 'Duel', state: "return s.tab === 'ladder';" },
  { name: 'Duels Arena -> Armoury', hub: 'duels', from: DUEL, via: { call: "s.openMode('ranked'); s.openView('shop');" }, at: 'Duel', origin: null, back: 'Duel', state: "return s.tab === 'ranked' && s.arenaTab === 'home';" },
  { name: 'Duels Arena -> Leaderboard', hub: 'duels', from: DUEL, via: { call: "s.openMode('ranked'); s.openBoard('live');" }, at: 'Duel', origin: null, back: 'Duel', state: "return s.tab === 'ranked' && s.arenaTab === 'home';" },
  { name: 'Duels Arena -> Raid picks', hub: 'duels', from: DUEL, via: { call: "s.openMode('ranked'); s.openArena('raid');" }, at: 'Duel', origin: null, back: 'Duel', state: "return s.tab === 'ranked' && s.arenaTab === 'home';" },
  { name: 'Duels Team -> Hero', hub: 'duels', from: DUEL, via: { call: "s.openView('team'); s.openHero(s.profile.heroes[0].id);" }, at: 'Hero', origin: 'Duel', back: 'Duel', state: "return s.tab === 'team';" },
];

/** The mode tabs that open a hub scene, in bar order (src/platform/nav.ts TAB_ROOTS); War leaves the game for world.html. */
export const TABS = [
  ['campaign', 'Menu'],
  ['duels', 'Duel'],
  ['codex', 'Codex'],
  ['shop', 'Shop'],
];
