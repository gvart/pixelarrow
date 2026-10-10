# v5 Asset log and Gemini queue

Owner: the `assets` agent (the only agent that touches Chrome). Other stories add requests to the queue. Every entry records the prompt, the file in `docs/v5/gemini/` and the processed destination.

## Queue

Empty. (The AS-02 remainder, ART-024 to ART-032, was made on 2026-10-10 and moved to Done.)

## Done

### AS-02 Class busts, all 21 (2026-10-10, in two runs)

**Tool.** gemini.google.com, model "Gemini 3.1 Pro", in one chat. Each prompt was typed as "Create an image…" with no tool picker. Every output is a 2048x2048 JPEG.

**Raws.** Per V5-049 the raws are not in this branch. They are in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c/docs/v5/gemini/AS-02/`, which is gitignored and never deleted. They were briefly committed here, then removed with `git rm --cached`. **Processed** (`process.mjs`, kind painted, cover at anchor 0.5/0.25, area downscale to 288x288, opaque): `docs/v5/gemini/AS-02/processed/bust_<class>.png`, 21 files, 3.3 MB (12 from run 1, 9 from run 2 below). These are copies of `docs/v5/art/staging/`, which is ignored. **Contact sheet:** `docs/v5/art/AS-02-contact.jpg` (138 KB, all 21, regenerated in run 2). It shows each bust at 192, 40 and 21 px beside the game's own sprite from `preview.html`.

**Family seed.** Following the ASSET_LOG Templates, `bust_hoplite` was made first from T-STYLE + T-BUST. The prompt added "It shows a CLASS of soldier (a type), not a named hero" (V5-045) and "eyes looking toward the viewer's left". It was approved, and a 1024 px copy was then attached to **every** later prompt as the style reference.

**Family prompt (F + SUBJECT + G).** It is T-STYLE + T-BUST in condensed form, with the reference sentence from Templates added:

```
Create a NEW image, not an edit of the reference. Match the attached reference exactly in style, palette, brushwork, lighting, background and framing; change only the subject. It is one of a matching set of soldier-CLASS portraits for a mobile strategy game (a type of soldier, not a named hero). STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white. Light from the upper left, shadows to the lower right. Hand-painted illustration, not a photo, not a 3D render. EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, borders or frames, modern objects, extra limbs, duplicated figures, cropped heads. SUBJECT: {SUBJECT}. FRAMING (same as the reference): head and shoulders, front three-quarter view, turned slightly to the viewer's left, eyes on the upper third of the image, the top of the headgear or hair 6 to 10 percent below the top edge, shoulders cut by the bottom edge, the whole face and headgear inside the central circle; the headgear silhouette and the one listed prop are the clearest, most contrasting shapes. BACKGROUND: the same plain dark warm umber with a soft lighter glow behind the head, no scenery. EXPRESSION: composed, alert, mouth closed, eyes toward the viewer's left. ASPECT: square 1:1, highest resolution available.
```

**Subjects follow the game kit (`src/data/classes.ts`) where the art bible §5.2 or the manifest disagree** (story AC 1: "matches its class kit in the game sprite"). Each was checked against the class's sprite in `preview.html?s=6`. Deviations from the bible's table:
- **thureophoros:** the kit has pilos/montefortino, not Boeotian. Painted as a conical bronze pilos, which is also distinct from the Celt's Montefortino.
- **sacred_band:** the kit and sprite show a Corinthian helmet with a black crest, a blue cloak and a blue aspis with a gold club, not a Boeotian helmet.
- **royal_guard:** the kit is an Attic helmet and the sprite has a red crest. The bible's white plumes are kept as an extra.
- **thessalian:** the kit is a Boeotian helmet. The bible's petasos is kept: the brim reads the same and it stays distinct from the Companion.

These last three are queued, not made. The bible's "no two classes share a headgear silhouette" rule cannot fully hold for hoplite and sacred_band, which are both Corinthian in the kit. The plan is to tell them apart by crest colour and cloak (red and red, against black and blue). The art-director should decide whether §5.2 follows the kit.

| # | ART | Raw (v5 worktree) | SUBJECT | Verdict | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | 013 | `ART-013_bust_hoplite_1.jpg` | T-STYLE + T-BUST: a Spartan hoplite, bronze Corinthian helmet with a tall red transverse horsehair crest, red cloak, the bronze rim of a round aspis shield at the shoulder | **Accepted (seed)** | The crest is drawn front-to-back rather than transverse, but it reads red at 21 px. Its top is about 5% below the edge, so it is not cropped. No text or extra limbs. |
| 2 | 012 | `ART-012_bust_militia_1.jpg` | a Greek levy militiaman, a farmer-soldier: a brown felt cap (pilos), plain undyed ochre wool tunic, no armour, a short wooden spear with an iron head held upright at his shoulder | **Accepted** | |
| 3 | 014 | `ART-014_bust_thureophoros_1.jpg` | a Hellenistic thureophoros: plain conical bronze pilos helmet with no crest, dark hair, blue-grey linen tunic, the upper edge of a tall OVAL thureos shield, cream with a red pattern and a vertical spine | **Accepted** | Matches the sprite: blue tunic, cream shield with red pattern. |
| 4 | 015 | `ART-015_bust_celt_sword_1.jpg` | a Celtic swordsman: iron Montefortino helmet with a top knob and cheek guards, long drooping moustache, bronze torc, green checked cloak over mail, hilt and upper blade of a long sword | **Accepted** | The helmet has a small nasal, which is not historical. The checked cloak matches the sprite's `checkGreen`. |
| 5 | 016 | `ART-016_bust_rhomphaia_1.jpg` | a Thracian rhomphaia warrior: tall bronze Phrygian-style helmet curving forward, cheek guards, brown fox-fur cloak, ochre tunic, the long curved blade of a two-handed rhomphaia over the shoulder; no shield | **Accepted** | |
| 6 | 017 | `ART-017_bust_archer_1.jpg` | a Cretan archer: bare head, short dark curly hair, cream linen tunic, leather quiver strap, fletchings and the bow tip above the shoulder | **Accepted** | |
| 7 | 018 | `ART-018_bust_slinger_1.jpg` | a Rhodian slinger: bare head, short straight brown hair, short beard, white tunic, pouch of stones on a strap, a braided sling wound round his raised wrist | **Accepted** | One raised hand, anatomically correct. |
| 8 | 019 | `ART-019_bust_javelineer_1.jpg` | a Thracian javelineer: grey wolfskin cap (alopekis) with the animal's ears, light green tunic, exactly two javelins over the shoulder | **Accepted** | The kit's `wolfskin_cap`. The full wolf head is a strong silhouette, and the human face keeps it apart from `bust_wolf`. |
| 9 | 020 | `ART-020_bust_horse_archer_1.jpg` | a Scythian horse archer: tall pointed felt hood with ear flaps tied under the chin, red embroidered kaftan, gorytos bow case with a short recurved bow | **Accepted** | Red matches the sprite tunic. |
| 10 | 021 | `ART-021_bust_peltast_1.jpg` | a Thracian peltast: open-faced bronze Thracian helmet, forward-curving crown, short peak, cheek guards, brown cloak, crescent wicker pelte | **Rejected** | Its helmet silhouette is the same tall forward-curled crown as the rhomphaia (#5), which breaks bible §3 "no two classes share a headgear silhouette". |
| 11 | 021 | `ART-021_bust_peltast_2.jpg` | as #10 but: a LOW, ROUNDED open-faced bronze helmet hugging the skull, short brim-like peak, long cheek guards; NO tall crown, NO curving tip, NO crest; the crescent pelte is the main prop | **Accepted** | Distinct from the rhomphaia. The two horns of the pelte read clearly. |
| 12 | 022 | `ART-022_bust_falx_1.jpg` | a Thracian falx warrior: bare head, long dark hair, full beard, brown wool cloak over a red tunic, the inward-curved blade of a two-handed falx over his shoulder | **Accepted** | |
| 13 | 023 | `ART-023_bust_gallic_1.jpg` | a Gallic warband warrior: limed pale spiky hair, long moustache, bare chest with blue woad swirls, bronze torc, the upper edge of a long oval shield with an iron boss | **Accepted** | |
| 14 | 024 | (not saved) | a cult fanatic: shaved head, grey ash on face and scalp, fierce stare, torn white tunic, black cloak, a short curved bronze knife raised; expression: intense, mouth closed (the bible's one grimace exception); EXCLUDE adds blood | **Looked right, not saved** | Seen in the chat: bald, ash-grey, knife raised, black cloak, no text. Download blocked (below). Remade in run 2 (#15). |

**Totals:** 14 renders, 12 accepted, 1 rejected and regenerated (peltast: a headgear silhouette clash), and 1 not saved (fanatic). No render had text, extra limbs or modern objects. Faces share one "family" look because every render had the seed attached, and that is intended.

**Pipeline.** `process.mjs` and then `check.mjs` gave PASS ×12: 288x288, opaque, name. `preview.mjs ART-013` gave **NOT ASSESSED** (exit 3): manifest `preview` is null, because no game slot loads `bust_*` yet (ASSET_LIST "not wired", OI-6). `promote.mjs ART-013 --looked` was **REFUSED** (no preview record). So **nothing was promoted**, and `public/` is untouched. All 12 are staged in `processed/` with status **NOT ASSESSED** until a UI story (HUB-02, ARM-01, HERO-01, or the recruit/Codex screens) wires `RASTERS` keys and the per-scene lazy load (OI-4). Then `preview.mjs` and `promote.mjs` can be run on these exact files.

**Side-by-side with the sprite.** Sprites roll their gear per hero: the preview militia, for example, has no cap and carries a thureos. Each bust shows the kit's signature item instead (the tier-1 or tier-2 headgear and the class weapon), and none shows gear outside the kit.

**Limit hit.** After the 14th render, Gemini's "Download full size image" fetched the image (network 200) but no file reached `~/Downloads`. It failed three times, by script click and by real click. This looks like Chrome's per-site "automatic multiple downloads" block. Changing it is a browser setting, so it was left alone, and two workarounds were denied by the permission system: a localhost receiver, and a second tab to inspect. Following the brief, Gemini use stopped there. No CAPTCHA or quota message appeared. To resume, the owner allows multiple downloads for gemini.google.com in Chrome, then the 9 in the Queue are run.

**Housekeeping.** An earlier version of the helper script moved an older, unrelated Gemini file (an icon sheet from 2026-10-09) out of `~/Downloads` by mistake. It was put back as `~/Downloads/Gemini_Generated_Image_restored-from-oct09.jpg`.

#### Run 2: the remaining 9 (2026-10-10, after the owner allowed multiple downloads for gemini.google.com)

**Tool.** Same as run 1: gemini.google.com, "Pro" mode, one new chat in a new tab, no tool picker, the same 1024 px `seed_hoplite.jpg` attached to **every** prompt through the page's hidden image input. Every output is a 2048x2048 JPEG. No CAPTCHA, quota message or download block: all 9 downloads arrived. Each new file in `~/Downloads` was moved by a script that takes only a `Gemini_Generated_Image_*` file absent from a listing made at the run's start and newer than the start time, and refuses if more than one matches; `~/Downloads` matched its start listing at the end. The tab was closed.

**Prompts.** Soldiers: the family prompt above, word for word, with {SUBJECT} from the table (fanatic: EXCLUDE adds "blood" and EXPRESSION is "intense, mouth closed"; chariot: EXCLUDE adds "horses, wheels"; sacred_band: EXCLUDE adds "anything red"). Beasts: there is no beast-plate style for busts in the art bible (T-PLATE is for myth plates), so they use T-BUST-BEAST merged into the same family prompt:

```
Create a NEW image, not an edit of the reference. Match the attached reference exactly in style, palette, brushwork, lighting and background; change the subject to an animal. It is one of a matching set of unit portraits for a mobile strategy game; this one shows a wild animal that fights as a unit (a type of animal, no human). STYLE: [as the family prompt]. EXCLUDE: any text, letters, numbers, signatures, watermarks, logos, borders or frames, people, collars, harness, armour, modern objects, extra legs, two heads, duplicated animals, cropped ears{, or tusks}, blood. SUBJECT: {SUBJECT}. FRAMING: head and shoulders, three-quarter view turned toward the viewer's left, the head filling the upper two thirds of the image, the tips of the ears 6 to 10 percent below the top edge and fully inside the frame, shoulders cut by the bottom edge, the head inside the central circle; the head silhouette {and the tusks / the open mouth} are the clearest, most contrasting shapes. BACKGROUND: the same plain dark warm umber as the reference with a soft lighter glow behind the head, no scenery. EXPRESSION: {alert, watchful / alert, stubborn / menacing}, eyes toward the viewer's left. ASPECT: square 1:1, highest resolution available.
```

**Kit decisions (V5-050: the kit wins where the bible's table disagrees).**
- **companion:** the kit's Boeotian helmet, drawn as bronze with a domed crown and wide brim; purple cloak with an ochre border (`cloakPurple`), xyston.
- **thessalian:** the kit also says Boeotian, which would give the companion's silhouette. Following ASSET_LIST ("petasos hat over a bronze helmet") it is a cream **felt** petasos with a very flat, very wide brim and a low crown, so it differs from the companion in material, colour and shape; blue cloak (`cloakBlue`), two javelins.
- **chariot:** the kit's `persian_tiara`, asked for low, soft and cream so it does not repeat the horse archer's tall red pointed hood; scale armour, red tunic, reins.
- **royal_guard:** the kit's Attic helmet, gilded, with the sprite's red crest and the bible's white plumes; the argyraspis is the silver shield; purple cloak.
- **sacred_band:** per V5-050, the kit's Corinthian helmet, told apart from the hoplite by a black crest, a dark blue cloak and a blue shield with a gold Theban club.

| # | ART | Raw (v5 worktree) | SUBJECT | Verdict | Notes |
| --- | --- | --- | --- | --- | --- |
| 15 | 024 | `ART-024_bust_fanatic_1.jpg` | a cult fanatic: shaved head, grey ash on face and scalp, fierce stare, torn white tunic, black cloak, a short curved bronze knife raised | **Accepted** | Bald, ash-grey scalp, knife in a raised fist, torn white tunic, black cloak (kit `tunicWhite` + `cloakBlack`). Hand anatomy correct. A few small brown stains on the tunic read as dirt, not blood. |
| 16 | 025 | `ART-025_bust_companion_1.jpg` | a Macedonian Companion cavalryman: bronze Boeotian helmet (an open face, a wide flaring brim all round like a hat, no crest, no plume), short dark beard, a deep purple cloak with a broad ochre-gold border pinned at the shoulder over a bronze muscled cuirass, the long wooden shaft and iron head of a cavalry lance (xyston) held upright beside his shoulder; no shield | **Accepted** | Brim and lance are the two clearest shapes. No hand on the lance, which is fine at 40 px. |
| 17 | 026 | `ART-026_bust_thessalian_1.jpg` | a Thessalian light horseman: a pale cream FELT petasos sun hat with a very FLAT, very WIDE round brim and a LOW shallow crown, tied with a cord under the chin (cloth, not metal), young clean-shaven face, a short Egyptian-blue chlamys cloak pinned at the shoulder over a white tunic, exactly two light javelins held upright beside his shoulder | **Accepted** | Exactly two javelins. The brim reaches about 13% from each side edge, still inside the frame. Distinct from the companion at 21 px (cream against bronze, blue against purple). |
| 18 | 027 | `ART-027_bust_chariot_1.jpg` | a Persian-style scythed-chariot driver: a soft cream-and-ochre felt Persian tiara cap, LOW and ROUNDED, its top bending forward, with a cloth band round the brow and long side flaps hanging loose at the cheeks (NOT tall, NOT pointed, NOT tied under the chin), black curled beard, red tunic under a shirt of overlapping bronze SCALE armour, one raised fist gripping the leather reins, the reins running out of the frame | **Accepted** | The cap came out taller than asked, but it is cream, soft and folded forward, so it doesn't read as the horse archer's red hood. Top about 4% below the edge, not cropped. Scale armour and reins clear. No horses or wheels. |
| 19 | 028 | `ART-028_bust_royal_guard_1.jpg` | a Macedonian royal guardsman (a silver-shield man): a GILDED Attic helmet with the face open, a short brow peak, hinged cheek pieces, a low red horsehair crest running front to back and two upright white feather plumes, one at each side of the helmet; short grey-flecked beard; bronze muscled cuirass, a purple cloak; the polished SILVER rim and face of a round shield at his shoulder, the brightest cool shape in the image | **Accepted** | The helmet has a small nasal guard, which an Attic helmet shouldn't have, but the face is open and the two white plumes plus the silver shield make it unmistakable. Plume tips about 4% below the top edge. |
| 20 | 029 | `ART-029_bust_sacred_band_1.jpg` | a Theban Sacred Band hoplite: the same kind of bronze Corinthian helmet as the reference but with a tall DARK charcoal-black horsehair crest; a dark Egyptian-blue cloak, white linen corselet; at his shoulder the round bronze-rimmed shield, its face painted dark blue with one large golden Herakles CLUB emblem (a single knobbly wooden club, drawn as a picture, not a letter), the club clearly visible. NO red anywhere | **Accepted** | Meets V5-050: black crest, dark blue cloak, blue shield with a large gold club, no red. Side by side with the hoplite, it reads differently at 21 px. |
| 21 | 030 | `ART-030_bust_wolf_1.jpg` | a grey wolf: grey and tawny fur with a pale muzzle and throat, ears pricked up, amber eyes, mouth closed | **Accepted** | Ears inside the frame. Warmer (more tawny) than the sprite's grey, but within the subject. Easy to tell from the javelineer's wolfskin cap, because that bust has a human face. |
| 22 | 031 | `ART-031_bust_boar_1.jpg` | a wild boar: dark brown-grey coarse coat, a bristling dark mane standing up along the neck and back, small dark eye, long snout, two curved pale ivory tusks curling up from the lower jaw, clearly visible | **Accepted** | Two tusks (the far one at the snout tip). The mane silhouette is strong. |
| 23 | 032 | `ART-032_bust_bear_1.jpg` | a huge brown bear: thick reddish-brown fur, a heavy brow ridge, small round ears, mouth open in a low roar showing teeth and fangs, a massive hump of shoulder | **Accepted** | Open mouth as in ASSET_LIST. Jaw and ears inside the frame. Beasts are exempt from the "mouth closed" rule (§5.4 covers soldiers). |

**Run 2 totals:** 9 renders, 9 accepted on the first try, 0 regenerated. No render had text, extra limbs or modern objects. **All AS-02 busts:** 23 renders, 21 accepted, 1 rejected (peltast #10), 1 not saved (fanatic #14, remade as #15).

**Run 2 pipeline.** `process.mjs ART-024 … ART-032` (kind painted, 288x288, opaque, key residue 0), then `check.mjs` gave 9 PASS. `preview.mjs ART-024` gave **NOT ASSESSED** (exit 3, no game slot loads `bust_*`), and `promote.mjs ART-024 --looked` was **REFUSED** (no preview record). **Nothing promoted**, and `public/` is untouched. The 9 are copied into `processed/` with status NOT ASSESSED, like the first 12.

**Contact sheet.** `docs/v5/art/AS-02-contact.jpg` was regenerated with all 21 (1400x1443, JPEG q30, 138 KB) from the same HTML layout and the same `preview.html` sprite crops. Looking at the whole sheet, the 9 new busts match the first 12 in background, glow, light direction and framing. They are slightly smoother and less craquelured than the seed, which is acceptable at 21 to 46 px.

**For the art-director.** §5.2 of the art bible still lists thessalian as "petasos hat", sacred_band as "Boeotian helm" and royal_guard as "gilded Thracian helm". The busts follow V5-050 and the kit instead (thessalian: petasos over the kit's Boeotian, which keeps it apart from the companion). The table should be updated in the next art story, as V5-050 says.


### AS-01 Hub mockup directions A, B, C (2026-10-10)

Mockups only: they are design references, not game assets, so they have no ART id, no manifest row and nothing goes to `public/`. Raws are kept untouched in `docs/v5/gemini/AS-01/` (in git as provenance, per ASSET_PIPELINE "Where files go"). Previews (420 px wide, JPEG q70, 88–109 KB) are in `docs/v5/ux/hub-mockups/`. The recommendation is in `docs/v5/ux/HUB_PICK.md`.

**Tool and settings.** gemini.google.com, model "Gemini 3.1 Pro", tool *Create image*, aspect **9:16** (the tallest the picker offers; 9:19.5 is not available). Every output is 1536x2752 JPEG. Every Campaign/Codex prompt had `docs/redesign/reference/A1-campaign-hub.jpg` attached as the style reference. No limit, CAPTCHA or consent dialog was hit.

**Shared style block (S), sent at the top of every first prompt in a chat.** HUB_DIRECTIONS' block, re-checked against the art bible (its TODO): parchment hexes changed to `parch` #e7d6ad / `parchHi` #f0e3c2 / `parchLo` #dcc394, page #16120f, teal #1f4f52, tab bar #16333a, terra #a8432c, bronze #7d5b30; Cinzel ALL CAPS only (§7.2); a colour-jobs sentence (§4.2); "illustrations never behind text" (§3); "no screen title heading" (the reference has a "CAMPAIGN HUB" heading that is not in the allowlist).

```
Mobile game screen mockup, tall portrait phone screen 390x844 (9:19.5), in the exact style of the attached reference image: traditional antiquity, mosaic and parchment. Dark warm basalt page (#16120f); a dark carved-stone frame with a gold-ochre Greek-key (meander) border and small round rosettes at the four corners framing the content; warm cream parchment panels (#e7d6ad, selected #f0e3c2, shaded #dcc394) with subtle fibres and a thin dark-brown inked edge; dark ink text (#3a2414). Titles, plaques, buttons and tab labels in Cinzel bold ALL CAPS; body text and every number in Inter medium, sentence case. Top bar: a dark stone strip with a centred glazed teal plaque (#1f4f52) with a gold rim. Bottom tab bar: dark teal-stone (#16333a) with a gold top rim, five slots with an engraved icon and a Cinzel label: CAMPAIGN (banner icon), DUELS (crossed swords), WAR (centre: a big round bronze shield medallion with an engraved crossed-spears glyph, rising above the bar, its WAR label inside the bar), CODEX (closed book), SHOP (market stall). The selected tab is a parchment block. Colour jobs: terracotta (#a8432c) only for the single primary button; aged bronze (#7d5b30) for other live controls; flat grey stone only for the disabled Camp tile; red only for the small count badge (with a cream ring). Painted illustrations sit inside frames, never behind text. Text large and crisp enough to read on a phone; buttons at least 44 px tall. Spell every string exactly as given and show no other text: no screen title heading under the top bar, no watermark.
```

The screen part of each prompt is HUB_DIRECTIONS' prompt for that screen, word for word, with these additions: "nothing on the left" of the top bar; "directly under it, with no heading"; a closing "Nothing else on the screen: no quests, no mail, no energy, no level bar, no gems, no extra buttons"; B1 and C1 add "No fresco of soldiers on this screen (the map / company scroll replaces it)"; B1 adds "no other lettering on the map". The Codex prompts drop the last rows that would not fit (A: 5 of 8 beasts; C: 6 of 8) and add "No fresco, no profile card, no buttons, no search bar, no Units or Lore section". B-Codex and C-Codex were sent in the A-Codex chat as "a NEW, separate image (not an edit): the same Codex hub in exactly the same style…".

**Renders** (every one compared to its allowlist tile by tile: top bar, profile, first steps, slot, CTA, three tiles, caption, tab bar, and nothing extra)

| # | Raw file | Prompt | Verdict | Tile-by-tile notes |
| --- | --- | --- | --- | --- |
| 1 | `docs/v5/gemini/AS-01/hub_A_campaign_1.jpg` | S + A1 | **Accepted** | Every allowlisted element present, nothing extra. Text exact and readable. Deviations (not invented, logged for the build): "First Steps (2 of 4)" in mixed-case Cinzel (bible §7.2 says caps only); Army badge is a red square without the cream ring. |
| 2 | `docs/v5/gemini/AS-01/hub_B_campaign_1.jpg` | S + B1 | **Accepted** | Strip, first steps, map (Rhegion, red banner, dotted route into fog, cartouche with the status line), CTA, tiles, tab bar. Nothing extra. Deviations: strip bust has no red crest; WAR label drawn on the medallion, not in the bar; same caps/badge notes as #1. |
| 3 | `docs/v5/gemini/AS-01/hub_C_campaign_1.jpg` | S + C1 | **Rejected** | No invented feature, but the "+4" was drawn as a badge **on Nikias's portrait**, so it reads as "Nikias +4" (a level or count that does not exist). Strategos bust lost its crest. Regenerated as an edit (#4). |
| 4 | `docs/v5/gemini/AS-01/hub_C_campaign_2.jpg` | edit of #3: "Change only: the "+4" … its own small round bronze disc … after Nikias; portraits slightly smaller; give the strategos bust a red horsehair crest" | **Accepted** | "+4" is now its own disc; crest back; everything else unchanged. Note: the disc touches the scroll's right roller even at 390 (a 320 warning, see HUB_PICK). |
| 5 | `docs/v5/gemini/AS-01/hub_A_codex_1.jpg` | S + A2 (5 beasts) | **Accepted** | Plaque CODEX, gear, Beasts ✓ \| Doctrines, 5 rows with the exact `myth.*.hint1` lines and levels, a 6th row cut by the frame (scrolling), CODEX tab selected. Nothing extra. Note: Harpies drawn as one harpy (the hint says a flock of six). |
| 6 | `docs/v5/gemini/AS-01/hub_B_codex_1.jpg` | B2 in the same chat | **Rejected** | Both doctrine icons reuse the **War medallion's crossed-spears glyph** (bible §7.4: one meaning per icon, the glyph is reserved for War). Locked rows not faded. Regenerated as an edit (#7). |
| 7 | `docs/v5/gemini/AS-01/hub_B_codex_2.jpg` | edit of #6: Steady = shield-wall icon, Rush = spearhead with speed lines; locked rows faded | **Accepted** | Distinct icons, faded "? Unknown doctrine" rows with locks. Note: the faded text is probably below 4.5:1; the build must keep the reason legible (A11Y, see HUB_PICK). The icons are placeholders: AS-03 paints the 5 doctrine icons. |
| 8 | `docs/v5/gemini/AS-01/hub_C_codex_1.jpg` | C2 in the same chat (6 beasts) | **Accepted** | Two-column grid, 6 cards, names and levels exact, 3rd row cut (scrolling), nothing extra. Note: the grid drops the hint line (ELEMENT_MAP E066 "Kept"), see HUB_PICK. |

**Totals:** 8 renders, 6 accepted (A ×2, B ×2, C ×2), 2 rejected and regenerated as edits. **Invented features: none** (no Quests, mail, energy, Play button, XP bar or gems in any render). The two rejections were a misleading badge placement and a reserved-glyph reuse.

**Previews** (`sips`, 420 px wide, q70): `docs/v5/ux/hub-mockups/hub_A_campaign_1.jpg`, `hub_B_campaign_1.jpg`, `hub_C_campaign_2.jpg`, `hub_A_codex_1.jpg`, `hub_B_codex_2.jpg`, `hub_C_codex_1.jpg`.

**Browser note.** In the first chat a click landed on the generated image and opened Gemini's image editor; the B1 prompt typed there went nowhere (the editor was closed without saving, nothing was sent). B1 was then sent in a fresh chat.

## Templates

Owner: art-director (S2-ART-BIBLE). Rules: `design/art/art-bible.md`. Sizes and subjects: `docs/v5/art/ASSET_LIST.md`. Processing: `docs/v5/art/ASSET_PIPELINE.md`.

### How to use them

1. Copy the template named in the asset's row (`T-…`).
2. Replace `{SUBJECT}` with the row's Subject, word for word.
3. Paste **T-STYLE first, then the template**: every painted prompt starts with the same style block, which keeps the families consistent.

**Family seeds**
- Generate one asset of a family first (busts: `bust_hoplite`; plates: `plate_hydra`; frescoes: `fresco_campaign`; icons: `icon_book`).
- Once it is approved, **attach it as the style reference** for the rest of its family. Add: *"Match the attached reference exactly in style, palette, brushwork, lighting and framing; change only the subject."*
- Variants (`portrait_nikias_talk` and `_blink`, `chest_open_empty` and `_full`) are **edits of the approved base**. Attach it and say *"Change only: {what}. Keep everything else identical: pose, framing, colours, lighting, background."*

**Output size.** Ask for the largest size Gemini gives at the aspect named; `process.mjs` refuses sources smaller than the shipped size. File every download as `docs/v5/gemini/<ART-id>_<file stem>_<n>.png`.

**Before saving, reject on sight**
- text, letters, numbers, signatures or watermarks;
- extra or missing limbs or heads;
- modern objects;
- the wrong headgear for the class (art bible §5.2);
- a frame or border painted around the image;
- on #FF00FF assets: a shadow, gradient or ground plane on the magenta, or magenta inside the subject.

### T-STYLE (prefix for every painted template)

```
STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white. Light from the upper left, shadows to the lower right. Clear value contrast on the subject so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render, not glossy digital art, not anime, not comic ink.
EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads.
```

### T-FRESCO (mode banners: `fresco_*`)

```
[T-STYLE]
ROLE: a wide banner illustration for a mobile game menu, shown inside a bronze frame.
SUBJECT: {SUBJECT}.
COMPOSITION: a horizontal frieze in registers like a Greek wall painting: the action runs along one band across the centre of the image; keep heads, weapons and the focal action inside the central horizontal third, so the image survives a crop to a strip 6 times wider than tall; calm background (sky, sea, plaster) at the top and bottom edges; 3 to 7 figures, all fully inside the frame.
ASPECT: very wide landscape, 21:9 or wider, at the highest resolution available.
PALETTE ANCHORS: warm plaster cream #e7d6ad, ochre, terracotta #a8432c, bronze #b08a3a, sea teal-blue; red cloaks and bronze shields on the Greek side.
```

### T-VIGNETTE (settlement vignettes: `vignette_*`)

```
[T-STYLE]
ROLE: a wide establishing view of a settlement, the header of a town screen in a mobile game.
SUBJECT: {SUBJECT}, seen from a low hill at a slight distance, no people in the foreground.
COMPOSITION: horizontal bands: sky in the top quarter, the settlement's wall or roof line across the middle third (the part that must survive a crop to a thin strip), ground and path in the lower quarter; 3 to 5 readable landmarks; nothing important at the left and right edges.
ASPECT: landscape 21:9, highest resolution available.
LIGHT: warm afternoon sun from the upper left.
```

### T-BUST (class busts `bust_*` and Nikias `portrait_nikias*`)

```
[T-STYLE]
ROLE: a character portrait for a small round or square portrait frame in a mobile strategy game; it must be recognisable at 40 pixels.
SUBJECT: {SUBJECT}.
FRAMING: head and shoulders, front three-quarter view, the figure turned slightly to the viewer's left, eyes on the upper third of the image, the top of the head or crest 6 to 10 percent below the top edge, chin at about 60 percent of the height, shoulders cut by the bottom edge; the whole face and headgear inside the central circle of the image. The headgear silhouette and the one listed prop are the clearest, most contrasting shapes.
BACKGROUND: plain dark warm umber (#26211b to #342d25), a soft lighter glow behind the head, no scenery.
EXPRESSION: composed, alert, mouth closed.
ASPECT: square 1:1, highest resolution available.
```

### T-BUST-BEAST (`bust_wolf`, `bust_boar`, `bust_bear`)

```
[T-STYLE]
ROLE: an animal portrait for a small portrait frame in a mobile strategy game; it must be recognisable at 40 pixels.
SUBJECT: {SUBJECT}.
FRAMING: head and shoulders, three-quarter view toward the viewer's left, the head filling the upper two thirds, ears or tusks fully inside the frame.
BACKGROUND: plain dark warm umber (#26211b), a soft glow behind the head.
ASPECT: square 1:1, highest resolution available.
```

### T-PLATE (beast plates: `plate_*`)

```
[T-STYLE]
ROLE: a bestiary plate for a codex in a mobile game, in the manner of a painted tomb fresco or a vase painting: the monster alone, dramatic.
SUBJECT: {SUBJECT}.
COMPOSITION: the whole creature, or its unmistakable upper body for very large beasts, centred and filling about 80 percent of the frame; one simple ground cue (rock, swamp, shore); a strong silhouette against the background.
BACKGROUND: dark warm umber to deep red-brown, a warm key light from the upper left on the creature, chiaroscuro.
ASPECT: square 1:1, highest resolution available.
```

### T-ICON (atlas icons: `icon_*`)

```
ROLE: a game icon for a mobile strategy game menu, one of a set; it must read at 24 pixels.
SUBJECT: {SUBJECT}, a single object.
STYLE: a painted icon with a heavy dark-brown outline (#2a1a12) of even weight around the whole silhouette, three-quarter view, light from the upper left, warm materials (bronze #b08a3a, wood, cloth, stone), soft painted shading, slightly chunky proportions, centred, filling about 85 percent of the square.
BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no gradient, no glow and no ground plane; no magenta anywhere inside the object.
EXCLUDE: text, letters, numbers, a frame, a badge or a circle behind the object, more than one object.
ASPECT: square 1:1, highest resolution available.
```

Attach `public/icons/ui.png` as the style reference for the first icon: it shows the set the new icons must match.

### T-CUTOUT (reward art: `chest_*`, `laurel_branch`)

```
[T-STYLE, without its background]
ROLE: a reward object shown alone in a mobile game modal.
SUBJECT: {SUBJECT}.
FRAMING: the whole object, three-quarter front view, sitting on the bottom of the frame, centred, filling about 85 percent of the frame, nothing cut off.
BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no gradient, no glow and no floor; no magenta anywhere inside the object.
ASPECT: square 1:1 (laurel: portrait 3:4), highest resolution available.
```

### T-SPLASH (`splash_keyart`)

```
[T-STYLE]
ROLE: the full-screen key art behind the title of a portrait mobile game.
SUBJECT: {SUBJECT}.
COMPOSITION: tall portrait; the empty sky in the top third stays calm for a logo laid on in code; the phalanx and the beach in the middle and lower thirds; all key figures inside the central 60 percent of the width, so the image survives a crop to any phone shape.
ASPECT: tall portrait 9:19.5 (or 9:16, the tallest available), highest resolution available.
LIGHT: dawn from the upper left over the sea.
```

### T-PIXEL (world pixel sprites: map props, units, beasts; from later GDDs)

```
ROLE: a pixel-art game sprite for an isometric ancient-Mediterranean tactics game.
SUBJECT: {SUBJECT}, {FACING, e.g. facing down-right in a 2:1 isometric view}.
PIXEL GRID: true pixel art on a {W}x{H} art-pixel canvas (exact sizes in art bible section 8.5: soldier 32x32, mounted 48x48, lair beast 96x96, world boss 160x128), drawn so that every art pixel is a clean square block of 8x8 screen pixels; hard edges; no anti-aliasing, no blur, no gradients, no dithering noise, no sub-pixel detail.
PALETTE: only these colours (PA-WORLD): #2a1a12 #442618 #5e2427 #2e3e56 #7b503d #a87464 #dbac99 #f8d5c2 #9c8b78 #d6c0a8 #e8e2d4 #5a4a44 #836c65 #ac9283 #d2b68e #6a4a1e #b08a3a #e0c070 #7a2a2e #a12735 #cc7677 #3d5a78 #7a7a88 #5b3f2a #765d35 #9a8f3b #bba96a #4a5a2e #a8b46a #5d4070 #ae8a9a #978b81 #fde1c8 #d02030 #7fd0e0.
STYLE: a selective coloured outline (a darker shade of the local colour, never black), 3 to 4 step hue-shifted ramps (shadows toward red-purple, lights toward cream), light from the upper left, chunky-realistic proportions about 6 heads tall, team colour only on shields, crests and standards.
BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no ground and no base plate (the game draws those); feet on one line at the bottom.
EXCLUDE: text, a frame, several sprites, a scene.
```

Processing: `node scripts/art/process.mjs <name> <raw> --kind pixel --size {W}x{H}`. It detects the 8 px blocks, snaps to PA-WORLD and pads the sprite into the canvas. It never scales.

### T-FRAME (raster 9-slice chrome, only if a later story replaces procedural chrome)

```
ROLE: a 9-slice UI frame for a mobile game, carved from {MATERIAL: dark stone with a gold-ochre Greek-key meander / aged bronze with rivets}.
LAYOUT: a rectangular frame {B} pixels thick on every side around an empty centre; ALL ornaments (rosettes, rivets, corner bosses) only in the four corners; the four edges carry a pattern that repeats seamlessly and is uniform along its length, with no stains or ornaments in the middle of an edge.
BACKGROUND: the centre and the outside are a perfectly flat solid #FF00FF magenta.
LIGHT: from the upper left: lit top-left bevels, shaded bottom-right bevels.
ASPECT: square 1:1, highest resolution available.
EXCLUDE: text, a picture in the centre, perspective.
```

Processing: `process.mjs` (kind `frame`), then `nineslice.mjs` with the manifest's `slice` insets.
