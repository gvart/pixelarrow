// ANIM-1: the extra clips of the war-sandbox classes (PROMPTS_ART §25): two livelier idles (breathe, shift) per class,
// and build / carry for the militia (construction, W-22). Prints the pixminimax fields of one clip and facing as JSON.
// Usage: node scripts/art/pixellab/anim1/prompts.mjs <class> <anim> <dir>
import { fileURLToPath } from 'node:url';

const TOWARD = {
  'south-west': "towards the viewer's lower left",
  'south-east': "towards the viewer's lower right",
  'north-east': 'away from the viewer towards the upper right',
  'north-west': 'away from the viewer towards the upper left',
};
const back = (d) => d.startsWith('north');

// per class: subject (front / back), rest pose, and what the hands hold in every frame
export const CLASSES = {
  militia: {
    who: 'a grim weathered Greek peasant levy spearman in a low dark brown felt cap, a short faded dark crimson cloak and a plain dark umber tunic, no shield, his left hand empty and a wooden spear',
    pose: 'standing upright, the spear held upright in the right hand, the left hand empty at his side, no shield',
    keep: 'the one wooden spear stays upright in his right hand, single leaf-shaped spearhead at the top, plain blunt butt end; no shield',
  },
  hoplite: {
    who: 'a tall grim Spartan hoplite in a dark bronze Corinthian helmet with a deep dark crimson crest, a deep dark crimson cloak, a dark bronze cuirass and greaves, a very large round bronze shield and a very long spear',
    pose: 'standing upright, the spear held upright in the right hand, the shield on the left arm',
    keep: 'the one very long spear stays upright in his right hand, single leaf-shaped spearhead at the top, plain blunt butt end; the one large round shield stays on his left arm in front of his body in every frame',
    backNE: "seen from behind, the shield's dark back and rim face the viewer in every frame, never its painted face",
  },
  archer: {
    who: 'a lean grim Cretan archer with a bare head, short curly hair and beard, in a short crimson cloak and a leather jerkin over an oxblood tunic, one quiver of arrows on his back and one plain wooden bow',
    pose: 'standing upright at rest, the bow held vertically in the left hand out at his left side, the right hand empty',
    keep: 'only one bow, a single thin curved limb and one straight string, stays held vertically in his left hand out at his left side, never in both hands, no second bow; his right hand stays empty; the quiver stays on his back',
  },
  slinger: {
    who: 'a lean grim Rhodian slinger with a bare head, short hair and beard, in a crimson chlamys knotted at the right shoulder over an oxblood tunic, a leather belt with a pouch of lead bullets and one sling of dark leather cord',
    pose: 'standing upright at rest, the sling hanging from the right hand out at his right side',
    keep: 'one sling only, hanging from his right fist out at his right side, its loaded pouch swinging near his knee, clear of the cloak',
  },
};

const STILL = 'the feet stay on the same spot, he does not walk away';
const CLIPS = {
  // idle variant 1: big enough to read at half zoom (the stock idle is a near-still breath)
  breathe: (c) => `standing at rest in place, tired after a long march: he takes a deep slow breath, the chest swelling and the shoulders lifting high, then lets it out with a heavy sigh, the shoulders dropping and the head dipping forward, then rolls his head and neck once and straightens up again; the cloak stirs with the movement; ${STILL}; ${c.keep}; no effects`,
  // idle variant 2: a weight shift with a glance, the hips sway
  shift: (c) => `standing at rest in place, restless: he shifts his weight onto his left leg, the hips swaying over and the right knee bending loose, glances down and to the side, then shifts his weight back across onto his right leg, the left knee relaxing, and looks up ahead again; a slow easy sway of the whole body from foot to foot; ${STILL}; ${c.keep}; no effects`,
  // construction: from the tall canvas (room overhead for the mallet)
  build: () => `he alone, at work in place: he passes his one spear across into his left hand and holds it upright against his left shoulder, then with his right hand swings a short wooden mallet up over his right shoulder and brings it down hard onto the top of one wooden stake standing in the ground in front of his feet, bending forward from the hips with the blow, two heavy blows, his whole body behind each one; ${STILL}; one spear only, single leaf-shaped spearhead at the top, plain blunt butt end; one mallet, one stake; no shield; no sparks, no dust, no effects`,
  carry: () => `walking in place {t} with steady heavy steps, carrying one long rough wooden log on his left shoulder, steadied by his left hand, the log lying along his shoulder and bobbing with each step, his back a little bent under the weight; the one wooden spear held upright in his right hand, single leaf-shaped spearhead at the top, plain blunt butt end; one log only; no shield; no effects`,
};

export function promptOf(cls, anim, dir) {
  const c = CLASSES[cls];
  if (!c) throw new Error(`no class ${cls}`);
  if (!CLIPS[anim]) throw new Error(`no clip ${anim}`);
  let description = CLIPS[anim](c, dir).replaceAll('{t}', TOWARD[dir]);
  if (back(dir)) description = `seen from behind, his back to the viewer in every frame, he never turns round: ${description}`;
  if (dir === 'north-east' && c.backNE) description += `; ${c.backNE}`;
  const subject = back(dir) ? `${c.who}, seen from behind` : c.who;
  return { subject_description: subject, initial_pose: c.pose, description, view: 'high top-down', direction: dir };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cls, anim, dir] = process.argv.slice(2);
  console.log(JSON.stringify(promptOf(cls, anim, dir), null, 1));
}
