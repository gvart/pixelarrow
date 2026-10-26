// The landing page's war clips: one shot each, recorded by ./record-war-clips.mjs (see there for the
// fields) and encoded by ./encode-war-clips.sh to landing/public/video/war-<id>.{webm,mp4} (+ posters).
// Scenes are seeded sandbox scenarios (src/war/scenarios, the clip-* ones in clips.ts) or the world map.
// A trailer can keep its own shot list in the same format: --shots <file>.
export const FPS = 30;

/** The loop's cross-fade, s: the clip's end blends into its start. */
const LOOP = 0.6;

export const SHOTS = [
  {
    id: 'caravan',
    query: { scenario: 'clip-caravan' },
    lead: 4,
    seconds: 8,
    loop: LOOP,
    // the camera rides with the wagon (cart 0), drawing ahead down the road toward the trading post
    camera: [
      { t: 0, track: '(s) => s.sim.cur.sieges[0]', dx: 1, dy: 1, zoom: 0.75 },
      { t: 8, track: '(s) => s.sim.cur.sieges[0]', dx: 7, dy: 4, zoom: 0.75, ease: 'linear' },
    ],
    poster: 4,
  },
  {
    id: 'build',
    query: { scenario: 'clip-build' },
    lead: 0,
    seconds: 8,
    timeScale: 6,
    loop: LOOP,
    camera: [
      { t: 0, x: 340, y: 340, zoom: 1 },
      { t: 8, x: 344, y: 336, zoom: 1, ease: 'linear' },
    ],
    poster: 6,
  },
  {
    id: 'battle',
    query: { scenario: 'clip-battle' },
    lead: 9,
    seconds: 9,
    loop: LOOP,
    camera: [
      { t: 0, x: 114, y: 112, zoom: 0.5 },
      { t: 9, x: 126, y: 112, zoom: 0.5, ease: 'linear' },
    ],
    poster: 4,
  },
  {
    // Drakon, the Krios glacier's guardian (src/war/sim/bosses.ts), against a four-squad raid in his citadel's yard
    id: 'boss',
    query: { scenario: 'landmark-citadel' },
    lead: 20,
    seconds: 8,
    loop: LOOP,
    camera: [
      { t: 0, x: 277, y: 353, zoom: 0.75 },
      { t: 8, x: 281, y: 355, zoom: 0.75, ease: 'linear' },
    ],
    poster: 4,
  },
  {
    // the stone fort stormed (siege-defend: the attackers are the bots): the ram at the gate, ladders on the wall
    id: 'siege',
    query: { scenario: 'siege-defend' },
    lead: 76,
    seconds: 8,
    loop: LOOP,
    camera: [
      { t: 0, x: 125, y: 444, zoom: 0.75 },
      { t: 8, x: 130, y: 444, zoom: 0.75, ease: 'linear' },
    ],
    poster: 4,
  },
  {
    // the world map (offline mock world): the alliances' lands, then in onto one region
    id: 'world',
    page: 'world',
    query: { offline: '1' },
    seconds: 8,
    loop: 0,
    camera: [
      { t: 0, x: 1024, y: 768, zoom: 0.45 },
      { t: 1.5, x: 1024, y: 768, zoom: 0.45 },
      { t: 7, x: 1150, y: 580, zoom: 1.5 },
      { t: 8, x: 1150, y: 580, zoom: 1.5 },
    ],
    poster: 1,
  },
];
