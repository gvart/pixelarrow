// Guardians (ART-L): every pixminimax prompt of the man-sized guardians word for word (bandit host, Bandit King,
// maenads). South-west and north-west are generated on the 96 x 96 canvas at (14, 24); the east rows are mirrors.
// Usage: node scripts/art/pixellab/guard/prompts.mjs <class> <anim> <dir>   -> JSON for animate_image_pixminimax
const C = {
  bandit_king: {
    who: 'the grim Bandit King, an outlaw warlord in a dark gilded bronze Phrygian helmet with a dark crimson crest, a linothorax with a gorgon face and a purple-black cloak, holding a curved iron kopis sword',
    he: 'he', his: 'his', hold: 'the kopis sword stays in his right hand', pose: 'standing upright at rest, the kopis sword low in his right hand',
    attack: ['slash', 'he attacks in place {t}: he raises the curved kopis high over his right shoulder, steps in with the left foot and brings it down in a heavy diagonal cleaving slash across his body at the empty air ahead of him, his whole body weight behind the blow, the cloak swinging, then recovers into his stance; one sword only, he alone'],
    idle: 'standing at rest in place, proud and menacing: he takes a slow deep breath, the chest swelling under the cuirass, rolls his shoulders, the cloak stirring behind him, and lifts his chin, the sword hanging low at his side',
    walk: 'walking in place {t} with a slow heavy proud stride, shoulders back, the cloak swaying behind him',
  },
  bandit_captain: {
    who: 'a grim ancient Greek bandit captain in a dented bronze helmet with a short crest, a studded leather cuirass and a ragged mud-brown cloak, with a curved falcata sword and a small round shield',
    he: 'he', his: 'his', hold: 'the falcata stays in his right hand and the small shield on his left arm', pose: 'standing upright at rest, the falcata low in his right hand, the small shield on his left arm',
    attack: ['slash', 'he attacks in place {t}: behind the small shield raised on his left arm he swings the heavy falcata up over his right shoulder and hacks it down hard at the empty air ahead of him, stepping into the blow, then recovers behind the shield; one sword and one shield only, he alone'],
    idle: 'standing at rest in place, wary: he takes a slow breath, the shoulders rising and falling, glances to the side and shifts his weight from one foot to the other',
    walk: 'walking in place {t} with a sly prowling gait, slightly hunched, natural strides, the ragged cloak swaying',
  },
  bandit_guard: {
    who: 'a grim ancient Greek bandit guard in a hooded mud-brown cloak over a dark bronze scale shirt, with a battered round bronze shield and a short spear',
    he: 'he', his: 'his', hold: 'the spear stays in his right hand and the round shield on his left arm', pose: 'standing upright at rest, the spear upright in his right hand, the round shield on his left arm',
    attack: ['thrust', 'he attacks in place {t}: he levels the short spear at shoulder height over the rim of the round shield, draws it back, then lunges forward and drives it hard straight ahead at the empty air, the shield pushing forward too, then pulls back into his stance; one spear and one shield only, he alone'],
    idle: 'standing guard at rest in place: he takes a slow breath, the shoulders rising and falling, shifts his weight and resettles the heavy shield on his arm',
    walk: 'walking in place {t} with a heavy steady guard\'s march, natural strides, the shield on his arm',
  },
  bandit_archer: {
    who: 'a grim ancient Greek bandit archer in a ragged hooded mud-brown cloak and a face wrap, a quiver on his back, holding a short dark recurve bow',
    he: 'he', his: 'his', hold: 'the bow stays in his left hand', pose: 'standing upright at rest, the bow low in his left hand',
    attack: ['shoot', 'he shoots in place {t}: he reaches over his shoulder, draws one arrow from the quiver on his back, nocks it, raises the bow in his left hand and draws the string back to his cheek, aims, looses the arrow ahead and the string snaps forward, then he lowers the bow; one bow only, he alone'],
    idle: 'standing at rest in place, wary: he takes a slow breath, the shoulders rising and falling under the cloak, turns the hooded head to peer to the side, the bow low at his side',
    walk: 'walking in place {t} with a sly prowling gait, slightly hunched, natural strides, the ragged cloak swaying',
  },
  maenad: {
    who: 'a grim wild ancient Greek maenad, a frenzied woman with long tangled black hair and an ivy wreath, a dark wine-red chiton and a fawn skin, holding a tall ivy-wound thyrsus staff',
    he: 'she', his: 'her', hold: 'the thyrsus stays in her right hand', pose: 'standing upright at rest, the thyrsus upright in her right hand',
    attack: ['slash', 'she attacks in place {t} in a wild frenzy: she whirls the tall thyrsus round over her head with both hands, her long hair flying, and smashes it down hard at the empty air ahead of her, then sways back into her stance; one staff only, she alone'],
    idle: 'standing in place in an ecstatic trance: she sways slowly from side to side, rolls her head back so her long wild hair swings, then lowers it again, the thyrsus upright in her hand',
    walk: 'walking in place {t} with a swaying barefoot dancing step, the long wild hair and the fawn skin swinging',
  },
  maenad_queen: {
    who: 'the grim Maenad Queen, a tall fierce woman priestess with long black hair under a bronze vine crown, a long purple-black robe and a leopard skin, holding a tall spear-pointed thyrsus',
    he: 'she', his: 'her', hold: 'the thyrsus stays in her right hand', pose: 'standing upright at rest, the thyrsus upright in her right hand',
    attack: ['thrust', 'she attacks in place {t}: she levels the tall spear-pointed thyrsus in both hands, draws it back, then lunges forward and drives the bronze point hard straight ahead at the empty air, her robe and hair swinging, then sweeps it back upright; one staff only, she alone'],
    idle: 'standing in place, regal and fierce: she takes a slow deep breath, lifts her crowned head, sways a little in a trance and raises her free hand towards the sky, then lowers it, the thyrsus upright in her hand',
    walk: 'walking in place {t} with a slow regal swaying step, the long robe and the leopard skin swinging',
  },
};
const TOWARD = { 'south-west': "towards the viewer's lower left", 'north-west': 'away from the viewer towards the upper left' };

export const CLASSES = Object.keys(C);
export const attackAnim = (cls) => C[cls].attack[0];

export function prompt(cls, anim, dir) {
  const c = C[cls];
  const b = dir.startsWith('north');
  const still = `the feet stay on the same spot, ${c.he} does not walk away`;
  const back = `seen from behind, ${c.his} back to the viewer in every frame, ${c.he} never turns round: `;
  const away = `; ${c.he} keeps facing away from the viewer towards the upper left in every frame, only ${c.his} back is seen`;
  let d;
  if (anim === 'idle') d = `${c.idle}; ${still}; ${c.hold}; no effects`;
  else if (anim === 'walk') d = `${c.walk.replace('{t}', TOWARD[dir])}; ${c.hold}; ${still}; no effects`;
  else if (anim === 'attack') d = `${c.attack[1].replace('{t}', TOWARD[dir])}; ${still}; no blood, no effects, no motion trails`;
  else if (anim === 'die') d = b
    ? `struck and dying: ${c.he} staggers, ${c.his} knees buckle and ${c.he} pitches forward away from the viewer towards the upper left, falls onto ${c.his} front and lies still face down on the ground, ${c.his} back towards us; the weapon falls beside ${c.he === 'she' ? 'her' : 'him'}; body and clothes stay clean, no wounds, no red, no blood at all, no effects`
    : `struck from the front, dying: ${c.he} flinches with ${c.his} head thrown back, staggers backwards, ${c.his} knees buckle and ${c.he} topples over backwards and lies still on ${c.his} back on the ground; the weapon falls beside ${c.he === 'she' ? 'her' : 'him'}; body and clothes stay clean, no wounds, no red, no blood at all, no effects`;
  else throw new Error(`${cls}: no clip ${anim}`);
  if (b && anim !== 'die') d = back + d + away;
  return {
    subject_description: b ? `${c.who}, seen from behind` : c.who,
    initial_pose: b ? `${c.pose}, seen from behind, ${c.his} back to the viewer` : c.pose,
    description: d,
    view: 'high top-down',
    direction: dir,
    frame_count: 12,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cls, anim, dir] = process.argv.slice(2);
  const p = prompt(cls, anim, dir);
  if (p.description.length > 1000) throw new Error(`description ${p.description.length} > 1000`);
  console.log(JSON.stringify(p, null, 1));
}
