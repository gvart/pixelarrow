// Bandit (polish, PROMPTS_ART "Mobs" bandit): every pixminimax prompt word for word. South-west and north-west are
// generated, south-east and north-east are their mirrors; clips a mob never plays are made from these (bandit.sheet.json).
// Usage: node scripts/art/pixellab/bandit/prompts.mjs <anim> <dir>   -> JSON { subject_description, initial_pose,
//        description, view, direction, frame_count }
const WHO = 'a grim ancient Greek hill bandit in a ragged hooded mud-brown cloak, a cloth face wrap and mismatched scraps of leather armour, holding a short iron sword';
const TOWARD = { 'south-west': "towards the viewer's lower left", 'north-west': 'away from the viewer towards the upper left' };
const BACK = 'seen from behind, his back to the viewer in every frame, he never turns round: ';
const STILL = 'the feet stay on the same spot, he does not walk away';
const SWORD = 'the short sword stays in his right hand';
const CLEAN = 'no blood, no effects, no motion trails';

const CLIPS = {
  idle: `standing at rest in place, wary: he takes a slow breath, the shoulders rising and falling under the cloak, shifts his weight from one foot to the other, the sword hanging low at his side; ${STILL}; ${SWORD}; no effects`,
  look: `standing in place, he looks round warily: he turns his hooded head slowly to one side, peers, then to the other side, then back ahead, the sword low at his side; ${STILL}; ${SWORD}; no effects`,
  walk: `walking in place {t} with a sly prowling gait, slightly hunched, natural strides, the ragged cloak swaying; ${SWORD}; ${STILL}; no effects`,
  run: `running hard in place {t}, hunched forward, long fast strides, the free arm pumping, the ragged cloak flapping behind him; ${SWORD}; on the same spot, he does not move away; no dust, no effects`,
  ready: `in a low fighting crouch in place {t}: knees bent, the short sword held forward at waist height pointing ahead, the free arm out for balance, he sways a little and shifts his feet, ready to strike; ${STILL}; ${SWORD}; no effects`,
  charge: `charging in place {t}: he runs hard hunched low with the short sword thrust out ahead of him, yelling, the ragged cloak flying; ${SWORD}; on the same spot, he does not move away; no dust, no effects`,
  thrust: `he attacks in place {t}: from his fighting crouch he draws the short sword back to his hip, then lunges forward and stabs it hard straight ahead at chest height, his whole body weight behind the thrust, the front knee bending, then pulls back into his crouch; one sword only, he alone; ${STILL}; ${CLEAN}`,
  block: `he defends in place {t}: he jerks the short sword up across his body to parry a blow from ahead, flinches back with the shoulders hunched, then recovers into his crouch; ${STILL}; ${SWORD}; ${CLEAN}`,
  fallBack: `struck from the front, dying: he flinches with his head thrown back, staggers backwards, his knees buckle and he topples over backwards and lies still on his back on the ground; the sword falls beside him; his body and clothes stay clean, no wounds, no red, no blood at all, no effects`,
  fallFwd: `struck from behind, dying: he arches with the blow, stumbles forward, his knees buckle and he pitches forward onto his front and lies still face down on the ground; the sword falls beside him; his body and clothes stay clean, no wounds, no red, no blood at all, no effects`,
  cheer: `he gloats in place after a won fight: he raises the short sword high over his head in his right hand, shakes it and jeers, the free fist raised too, then lowers it; ${STILL}; ${SWORD}; no effects`,
};

export const GENERATED = Object.keys(CLIPS);

export function prompt(anim, dir) {
  const body = CLIPS[anim];
  if (!body) throw new Error(`bandit: no clip ${anim}`);
  const b = dir.startsWith('north');
  // from behind a backwards fall turns him round (PROMPTS_ART "Civilians" lesson 3): both falls go away from the viewer
  const d = b && (anim === 'fallBack' || anim === 'fallFwd')
    ? `seen from behind, dying: he is struck and staggers, his knees buckle and he pitches forward away from the viewer towards the upper left, falls onto his front and lies still face down on the ground, his back towards us; the sword falls beside him; his body and clothes stay clean, no wounds, no red, no blood at all, no effects`
    : (b ? BACK : '') + body.replaceAll('{t}', TOWARD[dir]) + (b ? '; he keeps facing away from the viewer towards the upper left in every frame, only his back and hood are seen' : '');
  return {
    subject_description: b ? `${WHO}, seen from behind` : WHO,
    initial_pose: b ? 'standing upright at rest seen from behind, his back to the viewer, the sword low in his right hand' : 'standing upright at rest, the sword low in his right hand',
    description: d,
    view: 'high top-down',
    direction: dir,
    frame_count: 12,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [anim, dir] = process.argv.slice(2);
  const all = anim ? [[anim, dir]] : GENERATED.flatMap((a) => ['south-west', 'north-west'].map((d) => [a, d]));
  const out = all.map(([a, d]) => ({ anim: a, ...prompt(a, d) }));
  for (const p of out) if (p.description.length > 1000) throw new Error(`${p.anim} ${p.direction}: description ${p.description.length} > 1000`);
  console.log(JSON.stringify(anim ? out[0] : out, null, 1));
}
