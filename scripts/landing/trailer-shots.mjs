// The war trailer's shots (docs/playbook/trailer.md), in the shot-list format of ./record-war-clips.mjs:
//   node scripts/landing/record-war-clips.mjs --shots scripts/landing/trailer-shots.mjs --sizes 1920x1080 --out shots/trailer/raw
// (npm run trailer:war records them and cuts the trailer, ./trailer.mjs). Ids are the script's shot numbers; each take
// runs a little past its slot so the edit has a handle. Zoom is for a 720 px frame (the recorder scales it), so 1/2 is
// the widest the game's own camera goes. Every shot keeps its sound (the game's effects and ambience, music muted:
// the trailer's music is rendered apart, ./trailer-music.mjs).
export const FPS = 30;

/** Page-side: the centre of squad `q`'s living men (a camera `track`); the last centre once they are all down. */
const centre = (q) => `((s) => { const c = s.sim.cur, us = c.squads[${q}].units.map((i) => c.units[i]).filter((u) => u && u.state !== 'dead'); window.__recLast ??= {}; if (us.length) window.__recLast[${q}] = { x: us.reduce((a, u) => a + u.x, 0) / us.length, y: us.reduce((a, u) => a + u.y, 0) / us.length }; return window.__recLast[${q}] ?? { x: 0, y: 0 }; })`;
const squad = (q) => `(s) => ${centre(q)}(s)`;
/** Page-side: the midpoint of squads `a` and `b` (the hunters and the herd). */
const mid = (a, b) => `(s) => { const p = ${centre(a)}(s), q = ${centre(b)}(s); return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; }`;
/** ford-crossing leaves the crossing to the player: here his six squads attack-move over the ford onto the far bank. */
const FORD = '(s) => { for (let i = 0; i < 6; i++) s.sim.order({ kind: "attackMove", squad: i, x: 299 + (i % 2) * 2, y: 116 + i }); }';
/** Page-side: the music off (the trailer lays its own), effects and ambience as the player hears them. */
const MUTE_MUSIC = '(s) => { const a = window.__warAudio; if (a) a.apply({ ...a.settings, sound: true, musicVol: 0, sfxVol: 7, ambVol: 6 }); }';
const still = (x, y, zoom, t) => [{ t: 0, x, y, zoom }, { t, x, y, zoom }];
const pan = (x0, y0, x1, y1, zoom, t) => [{ t: 0, x: x0, y: y0, zoom }, { t, x: x1, y: y1, zoom, ease: 'linear' }];
const follow = (track, zoom, t, dx = 0, dy = 0) => [{ t: 0, track, dx, dy, zoom }, { t, track, dx, dy, zoom }];

const SHOT_LIST = [
  // Act I: peace (Elaia)
  { id: '01-bay', query: { scenario: 'trailer-elaia' }, lead: 2, seconds: 4.4, camera: pan(222, 314, 242, 326, 0.5, 4.4) },
  { id: '02-agora', query: { scenario: 'trailer-elaia' }, lead: 0.5, seconds: 3.4, camera: still(254.5, 314, 2, 3.4) },
  { id: '03-chop', query: { scenario: 'trailer-elaia' }, lead: 12, seconds: 2.4, camera: follow(squad(3), 3, 2.4, 0, -1) },
  { id: '04-marble', query: { scenario: 'trailer-elaia' }, lead: 12, seconds: 2.4, camera: pan(419.5, 109, 420.5, 108.5, 3, 2.4) },
  { id: '05-hunt', query: { scenario: 'trailer-hunt' }, lead: 0.5, seconds: 3.4, camera: follow(mid(3, 6), 1.5, 3.4) },
  { id: '06-wagon', query: { scenario: 'clip-caravan' }, lead: 4, seconds: 2.4, camera: [{ t: 0, track: '(s) => s.sim.cur.sieges[0]', dx: 1, dy: 1, zoom: 1 }, { t: 2.4, track: '(s) => s.sim.cur.sieges[0]', dx: 3, dy: 2, zoom: 1, ease: 'linear' }] },
  { id: '07-build', query: { scenario: 'clip-build' }, lead: 0, seconds: 3.4, timeScale: 8, camera: still(342, 338, 1, 3.4) },
  { id: '08-ridge', query: { scenario: 'trailer-elaia' }, lead: 3, seconds: 1.4, camera: still(318, 178, 1, 1.4) },
  // Act II: the raid on Elaia, then the stone fort stormed
  { id: '09-column', query: { scenario: 'trailer-elaia-raid' }, lead: 4, seconds: 3.4, camera: follow(squad(7), 1, 3.4, 0, 3) },
  { id: '10-flee', query: { scenario: 'trailer-elaia-raid' }, lead: 15, seconds: 2.4, camera: follow(squad(5), 1.5, 2.4, 2, 0) },
  { id: '11-fire', query: { scenario: 'trailer-elaia-raid' }, lead: 0.3, seconds: 2.6, camera: still(260, 341, 1, 2.6) },
  { id: '12-ram', query: { scenario: 'siege-defend' }, lead: 76, seconds: 3.4, camera: [...still(127.5, 442, 1, 2), { t: 2, x: 127.5, y: 441, zoom: 2 }, { t: 3.4, x: 127.5, y: 441, zoom: 2 }] },
  { id: '13-ladders', query: { scenario: 'siege-defend' }, lead: 84, seconds: 2.4, camera: still(123, 440, 2, 2.4) },
  // 60 fps played at 30: a true half-speed slow-mo
  { id: '14-gate', query: { scenario: 'siege-defend' }, lead: 100, seconds: 1.7, fps: 60, camera: still(127.5, 441, 2, 1.7) },
  // Act III: escalation
  { id: '15-pass', query: { scenario: 'pass-ambush' }, lead: 72, seconds: 2.4, camera: still(138, 268, 1, 2.4) },
  { id: '16-ford', query: { scenario: 'ford-crossing' }, setup: FORD, lead: 52, seconds: 2.4, camera: pan(283, 119, 287, 118, 1, 2.4) },
  { id: '17-drakon', query: { scenario: 'landmark-citadel' }, lead: 20, seconds: 2.6, camera: still(280, 355, 1, 2.6) },
  { id: '18-gyges', query: { scenario: 'landmark-forge' }, lead: 17, seconds: 2.6, camera: still(260, 156, 1, 2.6) },
  { id: '19-chimera', query: { scenario: 'landmark-hold' }, lead: 19, seconds: 2.6, camera: still(161, 156, 1, 2.6) },
  { id: '20-scylla', query: { scenario: 'landmark-watchtower' }, lead: 8, seconds: 2.6, camera: still(52, 292, 1, 2.6) },
  { id: '21a-deadcity', query: { scenario: 'landmark-deadcity' }, lead: 0, seconds: 2.1, camera: pan(345, 300, 351, 285, 0.5, 2.1) },
  { id: '21b-deadcity', query: { scenario: 'landmark-deadcity' }, lead: 30, seconds: 2.3, camera: follow(squad(8), 1, 2.3, -2, -6) },
  { id: '22a-temple', query: { scenario: 'landmark-temple' }, lead: 0, seconds: 1.8, camera: pan(330, 270, 345, 268, 0.5, 1.8) },
  { id: '22b-temple', query: { scenario: 'landmark-temple' }, lead: 8, seconds: 2.0, camera: still(380, 272, 1, 2.0) },
  // the end card's frame: the Temple City held wide
  { id: 'ec-temple', query: { scenario: 'landmark-temple' }, lead: 0, seconds: 0.4, camera: still(340, 268, 0.5, 0.4) },
];

export const SHOTS = SHOT_LIST.map((s) => ({
  audio: s.id !== 'ec-temple', poster: s.seconds / 2, seed: 20261101, ...s,
  setup: `(s) => { (${MUTE_MUSIC})(s); ${s.setup ? `(${s.setup})(s);` : ''} }`,
}));
