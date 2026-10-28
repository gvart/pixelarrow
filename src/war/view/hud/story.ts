/**
 * W-65 the region's story chain on the page (the runner: ../../sim/stories.ts; the stories: src/data/warStories.ts).
 *
 *  - the giver stands by the village well, a townsman of the civilian sheets (../units.ts paint), a gold "!" over him
 *    while his story waits (his name and hook under it), "?" when a step sends you back to him;
 *  - once his men reach him the chain begins: a start banner with the backstory, and the story becomes the tracked
 *    quest (./quest.ts: the card top right with the giver, the step's story, goal, where and pay, its marker and edge
 *    arrow); a clue or mark glows as a gold ring on the ground; a choice is a pair of buttons on the card;
 *  - each step done, each choice and the end are banners with their rewards.
 *
 * Offline (a world entry, or ?story) the page runs the chain (its spawns and rewards into the local sim) and keeps the
 * save in localStorage (wrapped: a blocked store just forgets). Online the region server runs it
 * (server/src/war/stories.ts); the page shows its `story` messages and sends a choice up.
 */
import { itemDef } from '../../../data/items';
import { storyOf } from '../../../data/warStories';
import { NEUTRAL_TEAM } from '../../sim/economy';
import { storyPath, StoryRun, storySpots, saveOk, stepOf, type Story, type StoryNote, type StoryReward, type StorySave, type StoryStep } from '../../sim/stories';
import type { ServerMsg } from '../../net/protocol';
import type { WarEvent } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { SPRITE_ZOOM } from '../units';
import { myTeam } from '../side';
import { leftPanelOpen } from './kit';
import { esc } from './roster/ui';
import { questBanner, restoreTrack, track, trackedKey, type Tracked, type TrackView } from './quest';

type P = { x: number; y: number };

const CSS = `
.st-giver{position:fixed;z-index:2;pointer-events:none;transform:translate(-50%,-100%);display:none;flex-direction:column;align-items:center;white-space:nowrap;text-shadow:0 1px 0 #050506,0 0 3px #050506}
.st-giver .bang{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#ffe48a,#e0a325 60%,#8a5a12);box-shadow:0 0 0 2px #2a1a08,0 0 10px rgba(255,210,87,.75);font:900 19px/1 Inter,sans-serif;color:#2a1a08;text-shadow:none;animation:gdBob 1.1s ease-in-out infinite}
.st-giver .nm{margin-top:2px;padding:2px 6px;background:rgba(10,11,13,.82);box-shadow:inset 0 0 0 1px #6a5326;font:700 11px/1.2 Inter,sans-serif;color:#f3e2b8}
.st-giver .hk{margin-top:2px;max-width:220px;white-space:normal;text-align:center;font:italic 11px/1.3 Inter,sans-serif;color:var(--rf-muted)}
`;

/** A named foe's tag: the claim-point label style (../neutral.ts), a touch smaller, a red-gold tone. */
const NAME_TAG = { fontFamily: 'Inter, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#ffb27a', stroke: '#140c08', strokeThickness: 4, align: 'center' } as const;

const KEY = (region: string) => `pa.war.story.${region}`;
function load(key: string, story: Story): StorySave | null {
  try {
    const o = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
    return saveOk(story, o) ? o : null;
  } catch { return null; }
}
const keep = (key: string, s: StorySave) => { try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* storage blocked: progress is forgotten */ } };

/** The reward's goods as chips' record, and the rest (an item, a soul) in words. */
function rewardParts(r: StoryReward | undefined): { goods: Record<string, number>; more: string } {
  const more = [r?.item ? `${itemDef(r.item.def).name} (${r.item.rarity})` : '', r?.soul ? `${r.soul.name} joins: claim his soul` : ''].filter(Boolean).join(' · ');
  return { goods: { ...(r?.goods as Record<string, number> | undefined) }, more };
}

export function mountStory(s: SandboxScene): void {
  const story = storyOf(s.sim.region.id);
  const q = new URLSearchParams(location.search), online = s.sim.net;
  if (!story || (!online && !q.has('world') && !q.has('story'))) return;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  const region = s.sim.region, team = myTeam(), spots = storySpots(region, story), key = KEY(region.id);
  const giverLine = `${story.giver.name}, ${story.giver.title}`, trackKey = `story:${story.id}`;
  const payTo = online ? 'your home strongroom' : 'your stores';
  let save: StorySave | null = null, run: StoryRun | null = null;
  const evs: WarEvent[] = [];

  // ---------------------------------------------------------------- banners
  const tell = (notes: readonly StoryNote[], sv: StorySave) => {
    for (const n of notes) {
      if (n.kind === 'start') {
        questBanner({ kind: 'start', head: 'New story', title: story.title, giver: giverLine, text: story.backstory });
        track(tracker);
      } else if (n.kind === 'step') {
        if (n.step.includes('#')) continue; // a mark on the way: the card counts it
        const done = story.steps.find((x) => x.id === n.step)!, r = rewardParts(n.reward), next = stepOf(story, sv);
        if (n.option && done.trigger.kind === 'choice') {
          const o = done.trigger.options.find((x) => x.id === n.option)!;
          questBanner({ kind: 'done', head: 'Your choice', title: o.label, giver: giverLine, text: o.text, reward: r.goods, ...(r.more || Object.keys(r.goods).length ? { pay: [r.more, Object.keys(r.goods).length ? `Paid into ${payTo}` : ''].filter(Boolean).join(' · ') } : {}) });
        } else questBanner({ kind: 'done', head: 'Story step done', title: done.goal, giver: giverLine, ...(next ? { text: `Next: ${next.goal}.` } : {}), reward: r.goods, ...(r.more || Object.keys(r.goods).length ? { pay: [r.more, Object.keys(r.goods).length ? `Paid into ${payTo}` : ''].filter(Boolean).join(' · ') } : {}) });
      } else {
        const r = rewardParts(n.reward);
        questBanner({ kind: 'done', head: 'Story complete', title: story.title, giver: giverLine, text: story.end, reward: r.goods, pay: [r.more, `Paid into ${payTo}`].filter(Boolean).join(' · ') });
      }
    }
  };

  if (online) {
    s.sim.serverTaps.add((m: ServerMsg) => {
      if (m.t !== 'story' || !saveOk(story, m.save)) return;
      save = m.save;
      if (m.notes) tell(m.notes, m.save);
    });
  } else {
    run = new StoryRun(region, story, load(key, story), { team }, {
      addLair: (d) => s.sim.addLair(d.kind, d.x, d.y, d.count, d.lead),
      spawnSoul: (x, y, cls, level) => s.sim.spawnSoul(x, y, cls, level, 'lair'),
      give: (r, at, item) => {
        for (const [k, n] of Object.entries(r.goods ?? {})) s.sim.addStock(team, k as never, n!);
        if (item) s.sim.dropPile(at.x, at.y, [item]);
        if (r.soul) s.sim.spawnSoul(at.x + 1, at.y, r.soul.cls, r.soul.level, 'lair');
      },
    });
    save = run.save;
    const prev = s.sim.onEvents;
    s.sim.onEvents = (ev: WarEvent[]) => { prev?.(ev); evs.push(...ev); };
  }

  // ---------------------------------------------------------------- the tracked card
  /** Where the open step points now. */
  const target = (step: StoryStep, sv: StorySave): P | null => {
    const t = step.trigger, ps = spots.steps[step.id] ?? [], cur = s.sim.cur;
    if (t.kind === 'talk') return spots.giver;
    if (t.kind === 'track') return ps[Math.min(sv.n, ps.length - 1)] ?? null;
    if (t.kind === 'choice') return null;
    const p = ps[0];
    if (t.kind === 'clear') {
      // the camp's men while they live (they wander), else its spot
      const l = (cur?.lairs ?? []).find((x) => Math.hypot(x.x - p.x, x.y - p.y) < 0.5 && x.state !== 'cleared'), sq = l && cur?.squads.find((x) => x.id === l.squad);
      const u = sq && cur?.units.find((x) => x.squad === sq.id && x.state !== 'dead');
      return u ? { x: u.x, y: u.y } : p;
    }
    return p;
  };
  const tracker: Tracked = {
    key: trackKey,
    view: (): TrackView | null => {
      const sv = save, step = stepOf(story, sv);
      if (!sv || !step) return null;
      const path = storyPath(story, sv), i = Math.max(0, path.indexOf(step)), t = step.trigger, r = rewardParts(step.reward);
      const marks = t.kind === 'track' ? ` (${sv.n}/${t.marks.length})` : '';
      return {
        kind: `Story · ${region.name}`, title: story.title, giver: `Given by ${giverLine}`,
        goal: `${step.goal}${marks}`, progress: `${i + 1}/${path.length}`, frac: i / path.length,
        where: step.where, reward: r.goods,
        pay: t.kind === 'choice' ? 'Each choice pays its own way' : [r.more, Object.keys(r.goods).length ? `Paid when done, into ${payTo}` : r.more ? '' : 'The story goes on'].filter(Boolean).join(' · '),
        at: target(step, sv), label: step.label,
        story: i === 0 && t.kind !== 'choice' ? [story.backstory, step.story] : [step.story],
        ...(t.kind === 'choice' ? { choices: t.options.map((o) => { const rp = rewardParts(o.reward); return { id: o.id, label: o.label, text: [o.text, rp.more, Object.entries(rp.goods).map(([k, n]) => `+${n} ${k}`).join(', ')].filter(Boolean).join(' · ') }; }) } : {}),
      };
    },
    act: (id) => {
      if (online) return s.sim.storyChoose(id);
      const cur = s.sim.cur, notes = cur && run?.choose(cur, id);
      if (!notes) return;
      save = run!.save;
      keep(key, save);
      tell(notes, save);
    },
  };

  // ---------------------------------------------------------------- the giver and the ground rings
  const img = s.add.image(0, 0, '__WHITE').setVisible(false);
  const ring = s.add.graphics().setDepth(9.5);
  const tag = s.add.text(0, 0, '', NAME_TAG).setOrigin(0.5, 1).setResolution(2).setDepth(11.4).setVisible(false);
  /** The open step's named foe: his name over him while he lives (the first man of the lair at the step's spot). */
  const nameTag = (step: StoryStep | null) => {
    const t = step?.trigger, cur = s.sim.cur;
    if (!step || t?.kind !== 'clear' || !t.name || !cur) return void tag.setVisible(false);
    const p = spots.steps[step.id][0], l = (cur.lairs ?? []).find((x) => Math.hypot(x.x - p.x, x.y - p.y) < 0.5 && x.state !== 'cleared');
    const lead = l && cur.squads.find((q) => q.id === l.squad)?.units[0], d = lead !== undefined ? s.drawn.find((x) => x.u.id === lead && x.u.state !== 'dead') : undefined;
    if (!d) return void tag.setVisible(false);
    if (tag.text !== t.name) tag.setText(t.name);
    tag.setPosition(s.iso.sx(d.x, d.y), s.iso.sy(d.x, d.y, s.iso.zDraw(d.x, d.y)) - 64).setScale(1 / s.cameras.main.zoom).setVisible(true);
  };
  const draw = () => {
    const cam = s.cameras.main, g = spots.giver, sv = save;
    const fx = s.iso.sx(g.x, g.y), fy = s.iso.sy(g.x, g.y, s.iso.zDraw(g.x, g.y));
    if (cam.zoom < SPRITE_ZOOM || !s.paintMan(img, story.giver.cls, 'idle', s.time.now, 1, 1, fx, fy, 10 + s.depthAt(g.x, g.y) / 4096 + 0.25, NEUTRAL_TEAM)) img.setVisible(false);
    // the open clue or mark: a slow gold ring on the ground
    ring.clear();
    const step = stepOf(story, sv), t = step?.trigger;
    nameTag(step);
    if (!step || !t || (t.kind !== 'reach' && t.kind !== 'track')) return;
    const p = spots.steps[step.id][t.kind === 'track' ? Math.min(sv!.n, t.marks.length - 1) : 0], r = t.kind === 'track' ? 6 : 5;
    const k = 0.55 + 0.35 * Math.sin(s.time.now / 380), cx = s.iso.sx(p.x, p.y), cy = s.iso.sy(p.x, p.y, s.iso.zDraw(p.x, p.y));
    ring.lineStyle(3, 0xffd257, k).strokeEllipse(cx, cy, r * 2 * 32 * 1.41, r * 2 * 16 * 1.41);
    ring.lineStyle(1, 0xfff1c2, k * 0.8).strokeEllipse(cx, cy, r * 1.2 * 32 * 1.41, r * 1.2 * 16 * 1.41);
  };
  s.events.on('update', draw);

  const bang = document.createElement('div');
  bang.className = 'st-giver';
  document.body.appendChild(bang);
  let bangHtml = '';

  // ---------------------------------------------------------------- each frame
  let lastTick = -1, restored = false;
  const frame = () => {
    requestAnimationFrame(frame);
    const cur = s.sim.cur;
    if (!cur) return;
    if (run && cur.tick !== lastTick) {
      lastTick = cur.tick;
      const notes = run.tick(cur, evs.splice(0));
      save = run.save;
      if (notes.length) {
        keep(key, save);
        tell(notes, save);
      }
    }
    const sv = save, step = stepOf(story, sv);
    // a story under way, tracked on an earlier visit or with nothing else tracked: on the card again
    if (step && !restored) {
      restored = true;
      if (trackedKey() === null || trackedKey() === trackKey) track(tracker);
      else restoreTrack(tracker);
    }
    // the giver's mark: "!" while his story waits, "?" when a step sends you back to him
    const waiting = !!sv && !sv.done && sv.at === null, back = step?.trigger.kind === 'talk';
    const p = s.toScreen(spots.giver.x, spots.giver.y), cam = s.cameras.main;
    const on = (waiting || back) && !leftPanelOpen() && cam.zoom >= SPRITE_ZOOM && p.x > 0 && p.y > 40 && p.x < cam.width && p.y < cam.height;
    bang.style.display = on ? 'flex' : 'none';
    if (!on) return;
    bang.style.left = `${p.x}px`;
    bang.style.top = `${p.y - 66 * cam.zoom}px`;
    const html = `<div class="bang">${back ? '?' : '!'}</div><div class="nm">${esc(story.giver.name)}</div>${waiting ? `<div class="hk">“${esc(story.hook)}”</div>` : ''}`;
    if (html !== bangHtml) bang.innerHTML = bangHtml = html;
  };
  requestAnimationFrame(frame);
}
