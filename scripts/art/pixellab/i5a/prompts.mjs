// I5a: the clip prompts of the shield-bearing foot classes, from the hoplite's (PROMPTS_ART §15) with each class's
// subject, weapon and shield words, so every call of a class says the same thing. Prints the pixminimax fields (or the
// skeleton-v3 description) of one clip and facing as JSON.
// Usage: node scripts/art/pixellab/i5a/prompts.mjs <class> <anim> <dir> [--variant k]
import { fileURLToPath } from 'node:url';

const TOWARD = {
  'south-west': "towards the viewer's lower left",
  'south-east': "towards the viewer's lower right",
  'north-east': 'away from the viewer towards the upper right',
  'north-west': 'away from the viewer towards the upper left',
};
const back = (d) => d.startsWith('north');

// per class: who (front subject), gear (after "in"), shield and weapon words
export const CLASSES = {
  royal_guard: {
    who: 'a tall grim Macedonian royal guardsman',
    look: 'in a gilded bronze Attic helmet with two pale plumes, a dark royal-purple cloak',
    shieldN: 'a large round silver-faced shield with a dark star',
    shieldNb: 'a large round silver-faced shield',
    weaponN: 'a long spear',
    shield: 'the large round shield',
    spear: 'the long spear',
    head: 'single leaf-shaped spearhead',
    backNE: "seen from behind, the shield's dark back and rim face the viewer in every frame, never its silver face",
    skel: 'grim muscular Macedonian royal guardsman in a dark gilded bronze Attic helmet with two pale bone-grey plumes, deep dark royal-purple cloak, dark gilded bronze cuirass and greaves, one very large round aspis faced with dull dark silver and a dark star on his left arm, one long heavy wooden spear held level at the hip in his right hand, always pointing forward the way he faces, single leaf-shaped spearhead at the front end, plain blunt wooden butt end, no butt spike',
  },
  sacred_band: {
    who: 'a tall grim Theban Sacred Band hoplite',
    look: 'in a dark bronze Boeotian helmet with a wide brim, a very dark blue-black cloak',
    shieldN: 'a large round bronze shield with a dark red club emblem',
    shieldNb: 'a large round bronze shield',
    weaponN: 'a long spear',
    shield: 'the large round shield',
    spear: 'the long spear',
    head: 'single leaf-shaped spearhead',
    backNE: "seen from behind, the shield's dark back and rim face the viewer in every frame, never its painted face",
    skel: 'grim muscular Theban Sacred Band hoplite in a dark weathered bronze Boeotian helmet with a wide flaring brim and an open face, very dark blue-black cloak, dark bronze muscle cuirass and greaves, one very large round bronze aspis with a muted dark-red club emblem on his left arm, one long heavy wooden spear held level at the hip in his right hand, always pointing forward the way he faces, single leaf-shaped spearhead at the front end, plain blunt wooden butt end, no butt spike',
  },
  thureophoros: {
    who: 'a grim lean Hellenistic thureophoros',
    look: 'in a tall pointed dark bronze pilos helmet, a dark purple cloak over a pale grey-brown linen corselet',
    shieldN: 'a tall oval dark wooden thureos shield with a central spine and boss',
    shieldNb: 'a tall oval dark wooden thureos shield',
    weaponN: 'a short straight iron sword',
    shield: 'the tall oval shield',
    spear: 'the short straight sword',
    head: 'one straight blade',
    sword: true,
    backNE: "seen from behind, the shield's dark back and rim face the viewer in every frame, never its face",
    skel: 'grim lean Hellenistic thureophoros in a tall pointed dark weathered bronze pilos helmet, dark purple-black cloak, pale grey-brown linen corselet over a dark purple tunic skirt, dark greaves, one tall oval dark wooden thureos shield with a central spine and an iron boss on his left arm, one short straight iron sword in his right hand, one straight blade in one piece',
  },
  militia: {
    who: 'a grim weathered Greek peasant levy spearman',
    look: 'in a low dark brown felt cap, a short faded dark crimson cloak and a plain dark umber tunic, no shield',
    shieldN: 'his left hand empty',
    shieldNb: 'his left hand empty',
    weaponN: 'a wooden spear',
    shield: 'his free left arm',
    spear: 'the wooden spear',
    head: 'single leaf-shaped iron spearhead',
    noShield: true,
    skel: 'grim weathered Greek peasant levy spearman in a low dark brown felt cap, short faded dark crimson cloak, plain dark umber wool tunic with a dark leather belt, bare legs, dark sandals, no shield, no armour, one wooden spear held in both hands, always pointing forward the way he faces, single leaf-shaped iron spearhead at the front end, plain blunt wooden butt end, no butt spike',
  },
  peltast: {
    who: 'a grim lean Greek peltast',
    look: 'in an open-faced dark bronze Thracian helmet with a forward-curving peak, a short dark crimson cloak, a leather jerkin and tall boots',
    shieldN: 'a crescent-shaped pelte shield',
    shieldNb: 'a crescent-shaped pelte shield',
    weaponN: 'a wooden spear',
    shield: 'the crescent pelte shield',
    spear: 'the spear',
    head: 'single leaf-shaped iron spearhead',
    backNE: "seen from behind, the shield's dark back and rim face the viewer in every frame, never its face",
    skel: 'grim lean Greek peltast in an open-faced dark weathered bronze Thracian helmet with a forward-curving peak and cheek guards, short deep dark crimson cloak, dark leather jerkin over a dark oxblood-brown tunic, tall dark leather boots, one crescent-shaped pelte shield of dark hide with a dark bronze rim on his left arm, one wooden spear held level at the hip in his right hand, always pointing forward the way he faces, single leaf-shaped iron spearhead at the front end, plain blunt wooden butt end, no butt spike',
  },
  // a pair of javelins in the right hand (I4a base): the spear words become the pair's ('poseW'); the throw sends one
  // javelin and the spare goes to the shield hand
  javelineer: {
    who: 'a grim lean Carthaginian javelin skirmisher',
    look: 'in a soft dark umber felt Thracian cap with a tall forward-curving top, a short dark purple-black cloak and a plain dark umber tunic',
    shieldN: 'a small crescent-shaped pelte shield',
    shieldNb: 'a small crescent-shaped pelte shield',
    weaponN: 'two javelins',
    weaponLv: 'two levelled javelins',
    shield: 'the small crescent pelte shield',
    spear: 'the two javelins',
    poseW: 'the two javelins',
    head: 'each with one small leaf-shaped iron head',
    backNE: "seen from behind, the shield's dark back and rim face the viewer in every frame, never its face",
    skel: 'grim lean Carthaginian javelin skirmisher in a soft dark umber felt Thracian cap with a tall forward-curving top and ear flaps, short deep dark purple-black cloak, plain dark umber wool tunic with a dark leather belt, bare legs, dark sandals, one small crescent-shaped pelte shield of dark wicker and hide on his left arm, two javelins held level together at the hip in his right hand, always pointing forward the way he faces, each with one small leaf-shaped iron head at the front end, plain blunt wooden butt ends, no butt spike',
    clips: {
      throw: 'a powerful overarm javelin throw, facing {t} the whole time: he passes one javelin to his left hand, where it stays upright behind {S}, raises the other javelin to his right shoulder, level and pointing forward with its small iron head in front of him and the butt behind his shoulder, draws it back along its own line, plants his left foot forward, then whips his hips, shoulders and arm forward and hurls it; the javelin leaves his hand and flies off forward out of the frame, head first; he follows through with his empty right hand forward and down and stays facing the same way, never turning round; the thrown javelin always points forward the way he faces; the spare javelin stays upright in his left hand behind the shield; no motion blur, no trail, no effects',
      block: 'blocks a heavy blow in place: snaps {S} up and forward to cover his head and chest, the impact jolts him back half a step, then he lowers the shield back to his guard; the two javelins stay level in the right hand pointing forward the way he faces in every frame, never raised upright, {H} at the front end, plain blunt butt end; one shield on the left arm in every frame; no sparks, no effects',
      stagger: 'struck hard on the shield and knocked back: he reels backwards with two heavy stumbling steps, the head snapping back and the shield arm jolted, nearly losing his balance, then plants his feet and steps forward back into his guard; he keeps the two javelins level and pointing forward and the shield on the left arm in every frame, only two javelins; no motion blur, no smears, no effects, {H}, plain blunt butt end',
      cheer: 'victory cheer in place: he thrusts the two javelins straight up high over his head in the right hand, the iron heads pointing at the sky, keeps {S} on his left arm in front of his body, tips his head back shouting, then pumps the two javelins up and down twice; {H}, plain blunt butt end; the shield stays on the left arm in every frame',
      // the falls with the strong no-blood wording (the model still paints bursts; redClear cuts the red)
      fallBack: 'killed in battle: he is struck, his knees buckle and he topples over backwards, falling heavily onto his back on the ground behind him and lying still; the shield stays strapped on his left arm and his two javelins fall with him, only two javelins in every frame; no blood at all, no red spray, no splatter, no particles, no effects',
      fallFwd: 'killed in battle: he is struck, doubles over and pitches forward, falling heavily face down onto the ground in front of him and lying still; the shield stays strapped on his left arm and his two javelins fall with him, only two javelins in every frame; no blood at all, no red spray, no splatter, no particles, no effects',
    },
  },
};

/** The clips: [first-frame pose kind, description template]. {t} the direction, {S} the shield, {W} the weapon, {H} the head. */
const UP = 'standing upright, the spear held upright in the right hand, the shield on the left arm';
const LV = 'standing with the spear levelled at the hip pointing forward, the shield on the left arm';
const CLIPS = {
  idle: [UP, 'standing at rest in place, slow calm breathing: the chest and shoulders rise and fall gently and the cloak stirs a little; the feet stay planted, no stepping; {W} stays upright in the right hand, {H} at the top, plain blunt butt end; {S} stays on the left arm across the body in every frame'],
  look: [UP, 'standing still in place, he slowly turns his head to look to his right, holds, then turns it to look to his left, holds, then back to the front; only the head and shoulders turn, never further than over his shoulder; {W} stays upright in the right hand, {H} at the top; {S} stays on the left arm in every frame'],
  adjust: [UP, 'standing still in place, he hitches {S} up on his left arm with a shrug of the left shoulder, shifts its weight and settles it back down in front of his body; the shield never leaves his arm; {W} stays upright in the right hand, {H} at the top, plain blunt butt end'],
  walk: [UP, 'steady disciplined marching walk in place {t}, long natural strides, {W} held upright in the right hand and swaying a little with each step, {H} at the top, plain blunt butt end, no butt spike; {S} stays on the left arm across the body in every frame; the cloak sways'],
  run: [UP, 'running in place at a steady heavy jog {t}, knees lifting, leaning a little forward, {W} held upright in the right hand and tilted slightly forward, {H} at the top, plain blunt butt end; {S} stays clearly visible on the left arm in every frame; the cloak streams back'],
  rout: [UP, 'fleeing in panic, running in place fast {t}, hunched forward with the head low between the shoulders, {W} carried loosely upright in the right hand, {H} at the top, plain blunt butt end; {S} still on the left arm in every frame; the cloak flapping'],
  kneel: [UP, 'badly wounded, he sinks slowly down onto his right knee and stays kneeling, leaning his weight on the shield planted in front of him, head bowed, shoulders heaving with laboured breath; {W} stays in the right hand, upright, {H} at the top, plain blunt butt end; {S} stays on the left arm and clearly visible in every frame'],
  ready: [LV, 'standing in place in a tense fighting stance, knees a little bent, the weight shifting slowly from foot to foot, breathing; {W} held level at the hip in the right hand and pointing forward the way he faces in every frame, {H} at the front end, plain blunt butt end; {S} held up across the body on the left arm in every frame'],
  charge: [LV, 'charging forward at a heavy run in place, leaning into it, {W} levelled at the hip in the right hand and pointed straight ahead the way he faces in every frame, {H} at the front end, plain blunt butt end; {S} held up in front on the left arm in every frame; the cloak streams back'],
  brace: [LV, 'braces for a shield wall in place: drops into a low crouch with the left foot forward and the right foot braced back, sets {S} forward in front of his body and leans into it, {W} kept level low at his right side pointing forward the way he faces; then holds the braced crouch, breathing; {H} at the front end, plain blunt butt end; one shield on the left arm in every frame'],
  block: [LV, 'blocks a heavy blow in place: snaps {S} up and forward to cover his head and chest, the impact jolts him back half a step, then he lowers the shield back to his guard; {W} stays level in the right hand pointing forward the way he faces in every frame, {H} at the front end, plain blunt butt end; one shield on the left arm in every frame; no sparks, no effects'],
  stagger: [LV, 'struck hard on the shield and knocked back: he reels backwards with two heavy stumbling steps, the head snapping back and the shield arm jolted, nearly losing his balance, then plants his feet and steps forward back into his guard; he keeps the spear level and pointing forward and the shield on the left arm in every frame; no motion blur, no effects, {H}, plain blunt butt end'],
  fallBack: [UP, 'killed in battle: he is struck, his knees buckle and he topples over backwards, falling heavily onto his back on the ground behind him and lying still; the shield stays strapped on his left arm and the spear falls with him; no blood spray, no effects'],
  fallFwd: [UP, 'killed in battle: he is struck, doubles over and pitches forward, falling heavily face down onto the ground in front of him and lying still; the shield stays strapped on his left arm and the spear falls with him; no blood, no effects'],
  // the missile throw (peltast, javelineer): from the upright rotation on the guard canvas; the spear leaves the hand
  // a2 wording (SW a1 aimed the spearhead backwards while drawing back, then turned round)
  throw: [UP, 'a powerful overarm javelin throw, facing {t} the whole time: he raises {W} to his right shoulder, level and pointing forward with {H} in front of him and the butt behind his shoulder, draws it back along its own line, plants his left foot forward with {S} held out in front, then whips his hips, shoulders and arm forward and hurls it; the spear leaves his hand and flies off forward out of the frame, spearhead first; he follows through with his empty right hand forward and down and stays facing the same way, never turning round; the spearhead always points forward the way he faces; one spear only; no motion blur, no trail, no effects'],
  cheer: [UP, 'victory cheer in place: he thrusts {W} straight up high over his head in the right hand, spearhead pointing at the sky, keeps {S} on his left arm in front of his body, tips his head back shouting, then pumps the spear up and down twice; {H}, plain blunt butt end; the shield stays on the left arm in every frame'],
};

/** A one-handed sword class (thureophoros): the same clips, the sword held low or raised to cut instead of the spear. */
const UPS = 'standing, the short sword held low in the right hand, the shield on the left arm';
const GDS = 'standing in a fighting stance, the short sword held forward at the waist in the right hand, the shield on the left arm';
const SWORD = {
  idle: [UPS, 'standing at rest in place, slow calm breathing: the chest and shoulders rise and fall gently and the cloak stirs a little; the feet stay planted, no stepping; {W} hangs low in the right hand, point down, {H}; {S} stays on the left arm in every frame'],
  look: [UPS, 'standing still in place, he slowly turns his head to look to his right, holds, then turns it to look to his left, holds, then back to the front; only the head and shoulders turn, never further than over his shoulder; {W} stays low in the right hand, {H}; {S} stays on the left arm in every frame'],
  adjust: [UPS, 'standing still in place, he hitches {S} up on his left arm with a shrug of the left shoulder, shifts its weight and settles it back down in front of his body; the shield never leaves his arm; {W} stays low in the right hand, {H}'],
  walk: [UPS, 'steady disciplined marching walk in place {t}, long natural strides, {W} held low in the right hand and swinging a little with each step, {H}; {S} stays on the left arm in every frame; the cloak sways'],
  run: [UPS, 'running in place at a steady heavy jog {t}, knees lifting, leaning a little forward, {W} held low in the right hand, {H}; {S} stays clearly visible on the left arm in every frame; the cloak streams back'],
  rout: [UPS, 'fleeing in panic, running in place fast {t}, hunched forward with the head low between the shoulders, {W} carried loosely in the right hand, {H}; {S} still on the left arm in every frame; the cloak flapping'],
  kneel: [UPS, 'badly wounded, he sinks slowly down onto his right knee and stays kneeling, leaning his weight on the shield planted in front of him, head bowed, shoulders heaving with laboured breath; {W} stays in the right hand, point resting on the ground, {H}; {S} stays on the left arm and clearly visible in every frame'],
  // ready starts from the rotation (sword low): it raises the sword to the guard; a ready frame is then the other guard clips' first frame
  ready: [UPS, 'he raises {W} to a fighting guard and stands in place in a tense fighting stance, knees a little bent, the weight shifting slowly from foot to foot, breathing; {W} held forward at waist height in the right hand, the point toward the enemy the way he faces in every frame, {H}; {S} held up across the body on the left arm in every frame'],
  charge: [GDS, 'charging forward at a heavy run in place, leaning into it, {S} held up in front on the left arm in every frame, {W} held ready at his right side, point forward, {H}; the cloak streams back'],
  brace: [GDS, 'braces in place: drops into a low crouch with the left foot forward and the right foot braced back, sets {S} forward in front of his body and leans into it, {W} kept ready low at his right side, point forward; then holds the braced crouch, breathing; {H}; one shield on the left arm in every frame'],
  block: [GDS, 'blocks a heavy blow in place: snaps {S} up and forward to cover his head and chest, the impact jolts him back half a step, then he lowers the shield back to his guard; {W} stays in the right hand at his side, point forward, {H}; one shield on the left arm in every frame; no sparks, no effects'],
  stagger: [GDS, 'struck hard on the shield and knocked back: he reels backwards with two heavy stumbling steps, the head snapping back and the shield arm jolted, nearly losing his balance, then plants his feet and steps forward back into his guard; one sword in the right hand and the shield on the left arm in every frame; no motion blur, no smears, no effects, {H}'],
  // a2 wording (SW a1 bent the blade and drew a swoosh; the cut frames are still replaced, see ASSET_LOG)
  slash: [GDS, 'a heavy one-handed sword cut: he draws {W} back and up behind his right shoulder, steps in on the left foot pushing {S} forward with the body, then swings the blade down and across in front of him in one diagonal cut, the hips and shoulders turning into the blow, follows through low to his left and recovers to his guard; he keeps facing {t} the whole time; one short straight blade, perfectly straight and rigid in every frame, never bending or curving; one shield on the left arm in every frame; no swoosh arc, no motion trail, no smear, no blur, no effects'],
  fallBack: [UPS, 'killed in battle: he is struck, his knees buckle and he topples over backwards, falling heavily onto his back on the ground behind him and lying still; the shield stays strapped on his left arm and his one sword falls with him; no blood, no effects'],
  fallFwd: [UPS, 'killed in battle: he is struck, doubles over and pitches forward, falling heavily face down onto the ground in front of him and lying still; the shield stays strapped on his left arm and his one sword falls with him; no blood, no effects'],
  cheer: [UPS, 'victory cheer in place: he thrusts {W} straight up high over his head in the right hand, the point at the sky, keeps {S} on his left arm in front of his body, tips his head back shouting, then pumps the sword up and down twice; {H}; the shield stays on the left arm in every frame'],
};

/** The shieldless spearman (militia): the hoplite clips without the shield; the spear levelled in both hands; adjust is a
 *  grip shift, kneel leans on the spear, block parries with the shaft, brace grounds the butt. */
const UPM = 'standing upright, the spear held upright in the right hand, the left hand empty at his side, no shield';
const LVM = 'standing with the spear levelled at the hip pointing forward, no shield';
const MILITIA = {
  idle: [UPM, 'standing at rest in place, slow calm breathing: the chest and shoulders rise and fall gently and the cloak stirs a little; the feet stay planted, no stepping; {W} stays upright in the right hand, {H} at the top, plain blunt butt end; the left hand hangs empty at his side; no shield'],
  look: [UPM, 'standing still in place, he slowly turns his head to look to his right, holds, then turns it to look to his left, holds, then back to the front; only the head and shoulders turn, never further than over his shoulder; {W} stays upright in the right hand, {H} at the top; the left hand empty; no shield'],
  adjust: [UPM, 'standing still in place, he shifts his grip on the spear: lifts it a little with both hands, slides his right hand to a new hold on the shaft, sets the butt end back down by his right foot and rolls his shoulders; {W} stays upright, {H} at the top, plain blunt butt end; no shield'],
  walk: [UPM, 'steady marching walk in place {t}, long natural strides, {W} held upright in the right hand and swaying a little with each step, {H} at the top, plain blunt butt end, no butt spike; the left arm swings free; no shield; the cloak sways'],
  run: [UPM, 'running in place at a steady heavy jog {t}, knees lifting, leaning a little forward, {W} held upright in the right hand and tilted slightly forward, {H} at the top, plain blunt butt end; the left arm pumping; no shield; the cloak streams back'],
  rout: [UPM, 'fleeing in panic, running in place fast {t}, hunched forward with the head low between the shoulders, {W} carried loosely upright in the right hand, {H} at the top, plain blunt butt end; the left arm flailing; no shield; the cloak flapping'],
  kneel: [UPM, 'badly wounded, he sinks slowly down onto his right knee and stays kneeling, leaning his weight on {W} planted upright beside him in both hands, head bowed, shoulders heaving with laboured breath; {H} at the top, plain blunt butt end on the ground; no shield'],
  ready: [LVM, 'standing in place in a tense fighting stance, knees a little bent, the weight shifting slowly from foot to foot, breathing; {W} held level at the hip in both hands, the left hand forward on the shaft, pointing forward the way he faces in every frame, {H} at the front end, plain blunt butt end; no shield'],
  charge: [LVM, 'charging forward at a heavy run in place, leaning into it, {W} levelled at the hip in both hands and pointed straight ahead the way he faces in every frame, {H} at the front end, plain blunt butt end; no shield; the cloak streams back'],
  brace: [LVM, 'braces against a charge in place: drops into a low crouch with the left foot forward, grounds the plain blunt butt end of {W} against the ground beside his right foot behind him and angles the spear up and forward the way he faces, gripping it in both hands; then holds the braced crouch, breathing; {H} at the front end; no shield'],
  // a2 wording (SW a1 swung the spearhead round behind him; SW a2 said 'up and to the viewer\'s left')
  block: [LVM, 'parries a heavy blow in place: raises {W} diagonally across his chest in both hands, the spearhead still towards his front the way he faces, the shaft catching the blow in front of him, the impact jolts him back half a step, then he brings the spear back down level to his guard pointing forward; the spearhead never swings behind him; {H} at the front end, plain blunt butt end; no shield; no sparks, no effects'],
  stagger: [LVM, 'struck hard and knocked back: he reels backwards with two heavy stumbling steps, the head snapping back and the arms jolted, nearly losing his balance, then plants his feet and steps forward back into his guard; he keeps his one spear level and pointing forward in every frame, only one spear; no shield; no motion blur, no smears, no effects, {H}, plain blunt butt end'],
  fallBack: [UPM, 'killed in battle: he is struck, his knees buckle and he topples over backwards, falling heavily onto his back on the ground behind him and lying still; his one spear falls with him, only one spear in every frame; no shield; no blood at all, no red spray, no splatter, no particles, no effects'],
  fallFwd: [UPM, 'killed in battle: he is struck, doubles over and pitches forward, falling heavily face down onto the ground in front of him and lying still; his one spear falls with him, only one spear in every frame; no shield; no blood at all, no red spray, no splatter, no particles, no effects'],
  cheer: [UPM, 'victory cheer in place: he thrusts {W} straight up high over his head in the right hand, spearhead pointing at the sky, raises his left fist, tips his head back shouting, then pumps the spear up and down twice; {H}, plain blunt butt end; no shield'],
};

export function promptOf(cls, anim, dir) {
  const c = CLASSES[cls];
  if (!c) throw new Error(`no class ${cls}`);
  const [pose0, tpl0] = (c.sword ? SWORD : c.noShield ? MILITIA : CLIPS)[anim] ?? [];
  const pose = pose0, tpl = c.clips?.[anim] ?? tpl0;
  if (!tpl) throw new Error(`no clip ${anim}`);
  const lv = pose === LV || pose === LVM; // (a sword is never 'levelled')
  const subject = back(dir)
    ? `${c.who} seen from behind ${c.look}, ${c.shieldNb} and ${lv ? c.weaponLv ?? c.weaponN.replace(/^a /, 'a levelled ') : c.weaponN}`
    : `${c.who} ${c.look}, ${c.shieldN} and ${lv ? c.weaponLv ?? c.weaponN.replace(/^a /, 'a levelled ') : c.weaponN}`;
  let description = (c.poseW ? tpl.replaceAll('the spear', c.poseW) : tpl).replaceAll('{t}', TOWARD[dir]).replaceAll('{S}', c.shield).replaceAll('{W}', c.spear).replaceAll('{H}', c.head);
  // NE (the shield on the far side of a back view): the model swings a bright shield face round to the viewer
  if (dir === 'north-east' && c.backNE) description += `; ${c.backNE}`;
  return { subject_description: subject, initial_pose: c.poseW ? pose.replace('the spear', c.poseW) : pose, description, view: 'high top-down', direction: dir };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cls, anim, dir] = process.argv.slice(2);
  if (anim === 'skel') console.log(JSON.stringify({ description: CLASSES[cls].skel.replace('his right hand,', back(dir) ? 'his right hand, seen from behind, away from the viewer,' : 'his right hand,') }, null, 1));
  else console.log(JSON.stringify(promptOf(cls, anim, dir), null, 1));
}
