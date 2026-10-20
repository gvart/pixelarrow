// Civilians (ART-S, PROMPTS_ART "Civilians"): every pixminimax prompt word for word.
// Generated facings: south-west and north-west; south-east and north-east are their mirrors (build spec "mirror:").
// Usage: node scripts/art/pixellab/civ/prompts.mjs <class> <anim> <dir>   -> JSON { subject_description, initial_pose,
//        description, view, direction, frame_count }
const TOWARD = { 'south-west': "towards the viewer's lower left", 'north-west': 'away from the viewer towards the upper left' };
const back = (d) => d.startsWith('north');
const BACK = 'seen from behind, his back to the viewer in every frame, he never turns round: ';
// back-view work clips turn to the camera without this (PROMPTS_ART §27b lesson 4)
const AWAY = '; he keeps facing away from the viewer towards the upper left in every frame, only his back and the back of his head are seen; what he works on lies beyond him, on the far side of his body';
const STILL ='the feet stay on the same spot, he does not walk away';

export const CLASSES = {
  cook: {
    who: 'a grim ancient Greek army cook in a dull rust-orange tunic and a long greyed-linen apron, holding a dark bronze cooking pot and a long wooden ladle',
    hands: 'the bronze pot stays in his left hand and the wooden ladle in his right hand',
    drops: 'the pot and the ladle fall beside him',
    work: {
      cook: `he alone, at work in place: he sets the bronze pot down on the ground in front of his feet, bends over it and stirs it slowly round and round with the long wooden ladle, lifts the ladle to his mouth to taste, then bends and stirs again; ${STILL}; one pot, one ladle; no fire, no steam, no effects`,
    },
  },
  smith: {
    who: 'a grim muscular ancient Greek blacksmith with bare soot-dark arms, a dark charcoal tunic and a heavy dark leather apron, holding a heavy iron hammer and long iron tongs',
    hands: 'the heavy hammer stays in his right hand and the tongs in his left hand',
    drops: 'the hammer and the tongs fall beside him',
    work: {
      forge: `he alone, at work in place: a small dark iron anvil stands on the ground in front of his feet; he holds a bar of iron on it with the tongs in his left hand, swings the heavy hammer up over his right shoulder and brings it down hard onto the bar on the anvil, bending forward from the hips with each blow, two heavy blows, his whole body behind each one; ${STILL}; one hammer, one anvil; no sparks, no fire, no glow, no effects`,
    },
  },
  merchant: {
    who: 'a grim ancient Greek travelling merchant in a wide-brimmed brown petasos hat, a long dark teal-blue robe and a dark ochre mantle, a leather satchel at his hip, holding a small bronze balance scale',
    hands: 'the small bronze balance scale stays in his left hand and the satchel at his hip',
    drops: 'the scale falls beside him',
    work: {
      trade: `he alone, at work in place: he holds the small bronze balance scale up before his chest in his left hand, reaches into the satchel at his hip with his right hand, takes out a coin and drops it into one pan, the pans swing and settle, he leans in and studies them, nods, then tips the coin back into his satchel; ${STILL}; one scale only; no effects`,
    },
  },
  engineer: {
    who: 'a grim ancient Greek siege engineer in a low grey-green felt cap and a dull moss-green tunic with a leather tool belt and a coil of rope over his shoulder, holding a wooden mallet and a long measuring rod',
    hands: 'the wooden mallet stays in his right hand and the long measuring rod in his left hand',
    drops: 'the mallet and the rod fall beside him',
    work: {
      build: `he alone, at work in place: he plants the long measuring rod upright beside him in his left hand, then with his right hand swings the wooden mallet up over his right shoulder and brings it down hard onto the top of one wooden stake standing in the ground in front of his feet, bending forward from the hips with the blow, two heavy blows, his whole body behind each one; ${STILL}; one mallet, one stake, one rod; no sparks, no dust, no effects`,
    },
  },
  physician: {
    who: 'a grim old ancient Greek physician, bald with a long grey beard, in a long oatmeal linen chiton and a dark slate-blue himation, a leather bag at his hip, holding a tall wooden staff',
    hands: 'the tall wooden staff stays upright in his right hand',
    drops: 'the staff falls beside him',
    work: {
      heal: `he alone, at work in place: he leans the tall staff into the crook of his right arm, takes a small clay bowl out of the bag at his hip and holds it before his chest in his left hand, grinds herbs in it with a small pestle in his right hand, round and round, looks into the bowl and grinds again; ${STILL}; one staff, one bowl; no effects`,
    },
  },
  forager: {
    who: 'a grim lean ancient Greek peasant forager in a wide conical straw hat and a rough brown-grey sleeveless tunic, a wicker basket on his back, holding a woodcutter\'s axe',
    hands: 'the axe stays in his right hand and the wicker basket on his back',
    drops: 'the axe falls beside him',
    work: {
      chop: `he alone, at work in place: he takes the axe in both hands, swings it high up over his right shoulder and brings it down hard onto one short rough log lying on the ground in front of his feet, splitting it, bending deep from the hips with each blow, two heavy chopping blows, pulling the axe free between them; ${STILL}; one axe only; one short log only, no tree, no wood chips, no effects`,
      mine: `he alone, at work in place: first he lays the axe down on the ground behind him, then he takes up a heavy iron pickaxe in both hands, raises it high over his head and swings it down hard onto a rock on the ground in front of his feet, bending deep from the hips and knees with the blow, then wrenches it free and raises it again, two heavy blows; ${STILL}; one pickaxe only; no stones, no sparks, no dust, no effects`,
      harvest: `he alone, at work in place: first he lays the axe down on the ground behind him, then he bends down low from the hips and knees, reaches with both hands to a low bush on the ground in front of his feet, plucks a handful of olives, straightens up and drops them over his shoulder into the wicker basket on his back, then bends down again for more; a slow steady working rhythm; ${STILL}; no tree, no effects`,
    },
  },
};

const CLIPS = {
  idle: (c) => `standing at rest in place: he takes a deep slow breath, the chest swelling and the shoulders lifting, then lets it out with a sigh, the shoulders dropping and the head dipping, shifts his weight from one foot to the other and glances to the side; ${STILL}; ${c.hands}; no effects`,
  walk: (c) => `walking in place {t} with an easy unhurried civilian gait, natural strides, his free arm swinging a little; ${c.hands}; ${STILL}; no effects`,
  run: (c) => `fleeing in fear: running hard in place {t}, hunched forward, long fast strides, his free arm pumping, he throws one frightened glance back over his shoulder; ${c.hands}; on the same spot, he does not move away; no dust, no effects`,
  die: (c) => `dying: his strength suddenly gives out, he clutches his chest, his knees buckle and he topples over backwards and lies still on his back on the ground; ${c.drops}; his body and clothes stay clean, no wounds, no red, no blood at all, no effects`,
};

export function prompt(cls, anim, dir) {
  const c = CLASSES[cls];
  const body = CLIPS[anim] ? CLIPS[anim](c) : c.work[anim];
  if (!body) throw new Error(`${cls}: no clip ${anim}`);
  const b = back(dir);
  // from behind he falls forwards, away from the viewer (a backwards fall would turn him round)
  if (b && anim === 'die') {
    return {
      subject_description: `${c.who}, seen from behind`,
      initial_pose: 'standing upright at rest, his arms down at his sides',
      description: `seen from behind, dying: his strength suddenly gives out, his knees buckle and he pitches forward away from the viewer towards the upper left, falls onto his front and lies still face down on the ground, his back towards us; ${c.drops}; his body and clothes stay clean, no wounds, no red, no blood at all, no effects`,
      view: 'high top-down',
      direction: dir,
      frame_count: 12,
    };
  }
  // from behind the plain flee wording turns him to a left profile (a1 of cook, smith, merchant, engineer)
  if (b && anim === 'run') {
    return {
      subject_description: `${c.who}, seen from behind`,
      initial_pose: 'standing upright at rest seen from behind, his back to the viewer, his arms down at his sides',
      description: `we see him from behind the whole time: he flees in fear, running hard in place straight away from us into the picture towards the upper left; his back, the back of his head and the soles of his feet face the viewer in every frame, never sideways, never in profile, he never turns round; hunched forward, fast strides, arms pumping; ${c.hands}; on the same spot, he does not move away; no dust, no effects`,
      view: 'high top-down',
      direction: dir,
      frame_count: 12,
    };
  }
  return {
    subject_description: b ? `${c.who}, seen from behind` : c.who,
    initial_pose: 'standing upright at rest, his arms down at his sides',
    description: (b ? BACK : '') + body.replaceAll('{t}', TOWARD[dir]) + (b && !CLIPS[anim] ? AWAY : ''),
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
