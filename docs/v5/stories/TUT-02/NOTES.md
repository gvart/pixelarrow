# TUT-02: the tutorial teaches the v5 battle controls

Presentation and scripting only. No sim rule, event or hash change (replay-hash 13/13).

## What shipped

- **The army is a new campaign's** (campaign-arc.md R1): four hoplites in I (one a veteran), two slingers in II and two peltasts in IV, the reserve. III stays empty, so it has no card.
- **The lesson, 17 steps** (`TUT_STEPS` in `src/game/tutorial.ts`):
  - deployment: intro, select I, pan, zoom (pinch, or the zoom key), drag to the flag, **Undo** (it takes the drag back), Fight;
  - battle, paused, **a plan**: pick II and tap Shoot, tap the javelin-men (**focus fire**), then **Play** gives the plan at once (controls.md R6.1);
  - tap to move, then **Then… → Charge**: the charge fires on arrival, and that is what brings the raider band on;
  - Shield Bash (its medallion, or the More key on a short field);
  - **the morale glyph**: the first enemy badge that wavers or runs is lit, with "cracked shield: they waver; flag: they run";
  - **the knob on an unengaged line** (O3): the wave gathers on the reserve's flank while the hoplites fight, its dashed **flank arc** shows on IV's badge, and the player picks IV and swings its knob toward it;
  - "Hold firm", then victory.

  Feint, Orb and Works stay gated (controls.md R10b). The lines use the scene's own BTL-01 words: Undo, Fight!, Play, Shoot, Then…, Charge, and the ability's name.
- **The narrator** (`src/ui/tutorial/narrator.ts`):
  - It docks over the group cards, with its foot just above the Shape row, so it never covers Shape, Groups or FIGHT (TUT-1, O2).
  - When that would cover what it points at (a card, the More key, a chip), it docks over the top bar instead (`dock`). The Play step's key is in the top bar, so there it stays down.
  - It moves when the lit control changes, for example from IV's card to the ground (`redock`).
  - The lit hole is never under the narrator, and nothing else catches taps inside the hole, so a tap there always reaches the control.
  - Its keys (TUT-2): a **Skip** link that asks first, and **✕**, which only hides the bubble. On an action step, ✕ folds the bubble into a small "Nikias" key that brings the line back. On an info line, ✕ goes on.
  - Below 170 UI px wide (Telegram full screen at 320 is about 137) the portrait is left out, so the words get the width. The name shows whole or not at all: "Nikias, strategos", else "Nikias".
- **The scene while a step waits** (`BattleScene.tutorialHost`, `tutAllow`):
  - The generic hint pill is hidden: Nikias says what to do (hud.md).
  - The chips row (Undo, Then…, Clear plan) and the edge pointers are hidden unless the step is about a chip, so the ground stays tappable on a short field.
  - The 3 s Undo and Then… windows stand still while Nikias waits (`chipNow`, tutorial only).
  - Planning while paused (staging) is on only in the planning steps. In every other step an order given while paused goes out at once, as before, so the step can read the sim.
  - The camera brings each step's subject into the field the narrator leaves free: the javelin-men, the flag, the wavering badge, the reserve and the wave (`look`).
  - `showRing` is gone (V5-034), and so are the tutorial-only `tabBtns`.
- **The finale never stalls.** A charge runs along its facing, so a group aimed elsewhere walked to the edge and stood there. `enemyCue('win')` now turns each enemy group out of contact toward our nearest men before it charges, and repeats every `WIN_REAIM_S` (5 s).
- **Small fixes on the way:**
  - Paused, the Shoot key stages an explicit on/off, so it lights in the plan. A bare toggle left it dark until Play.
  - The "Pick a group to give orders" line is at 6.5 and wraps. In RU at 320 TG it no longer runs off the canvas.
- **i18n:** the stale `firstrun.modesTitle`, `firstrun.campaign`, `firstrun.campaignBody`, `firstrun.online`, `firstrun.onlineBody`, `tut.tapOn`, `tut.step.wall` and `tut.step.charge` keys are gone. New keys cover the steps and the narrator's keys, in en and ru.

## Decisions

1. **"Tier IV" means group IV.** The plan follow-up (PROGRESS #22) and campaign-arc.md R1 both put the two peltasts in group IV. Hero tier was not changed.
2. **Undo is taught in deployment, on the drag just made.** It is the same chip and the same idea. There is no 3 s pressure on a first try, and the battle's Then… charge can then really fire rather than being taken back. The line says "Undo takes back your last order".
3. **The Shield Wall step and the separate Charge step are cut.** Their place goes to the new lessons, within the length budget (A-42's attention list). The charge now comes from the Then… queue. The Shape chip is still in reach with its tip. Shoot moved into the planning step.
4. **The enemy is trimmed from 5+2+4 to 4+2+3 raiders.** With 4/2/2 the old band won about half the scripted runs. Over 12 timing variants (`tests/tutorial.test.ts` plays the scripted one), the player now wins every one.
5. **The flank lesson is on the reserve.** IV is placed at (13.5, 22.5) in deployment to leave room on its right. When the hoplites charge, the wave walks down the right edge to a post level with IV. It strikes only when the flank step starts, so IV is unengaged when the player turns it, and the arc is a real threat (O3).
6. **The morale step waits up to 45 s of battle** for an enemy group to waver or run, then goes on without it.
7. **Long lines on small screens.** The narrator may cover the top bar while it talks (Pause, the clock and the strength row), never the sheet's Shape row or FIGHT. On the 137 px canvas its lines are kept to 3 or 4.
8. **V5-067 (entry fade).** This story does not change screen fades. The tutorial adds no catcher over the lit control and no fade on it, so a tap there counts from the first frame of the step.
9. **Screenshots are contact sheets**: one JPEG per language and size, with the eight new moments side by side, to stay within the 4–8 file budget.

## Not done / follow-ups

- **Medallion text under the floor** (battleHud.ts `Medallion`: the name at 6, the effect line at 5). Only the tutorial's battle screens show a medallion in the layout fixtures, so `tutorial-move|text-size|*` stays allowlisted for the owner of battleHud.ts. Every other tutorial text-size entry is cleared.
- **Telegram full screen at 320x568 has a 45 UI px field** with three card rows. The tutorial is completable there (the smoke plays it through), but a real fight is cramped. The compact group cards under 360 are BTL-01's open follow-up.
- In a tutorial, the More sheet opens over the dimmed screen; the lit More key is the way in.

## Gates

- `npx tsc --noEmit`: clean. `npx vitest run`: 113 files, 1397 tests pass. `npx vite build`: ok.
- `node scripts/replay-hash.mjs`: 13/13 match (chromium; webkit is not installed locally). `npm run balance`: matched 53%.
- `node scripts/tutorial-smoke.mjs`: passed. The whole lesson was played twice, at 390x844 and in Telegram full screen at 320x568. `node scripts/smoke.mjs`: 46 pass, 0 fail.
- `node scripts/layout-check.mjs <url> --screens <10 tutorial-* + 21 battle-*> --no-shots`: 24 configs x 31 screens, 0 new violations. The 3 that remain are the allowlisted medallion text in `tutorial-move`.

**Length.** About 1,060 characters of narration (roughly 70 s to read), 13 actions (about 40 s) and about 60–100 s of battle at 1× add up to about 3–3.5 min, as before.

## Screenshots

`390-en.jpg`, `390-ru.jpg`, `320tg-en.jpg` and `320tg-ru.jpg` show undo, loose (the plan), focus, play, then, morale, flank and flank-knob, made with `node scripts/dev/tut02-shots.mjs <url> docs/v5/stories/TUT-02`.
