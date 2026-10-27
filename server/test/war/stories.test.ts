/**
 * W-65 the region story online (server/src/war/stories.ts): a player's men reach the giver and the chain begins, told
 * and stored; a save at the camp step wakes the camp again in a fresh room (a region asleep and woken); a choice from
 * the client (parsed as the socket gets it) pays its branch and the chain's end, goods owed to his strongroom; a done
 * chain is told, never run; a region without a story has none.
 */
import { describe, expect, it } from 'vitest';
import { NET_VERSION, parseClientMsg, type JoinMsg, type ServerMsg } from '../../../src/war/net/protocol';
import { STORIES } from '../../../src/data/warStories';
import { storySpots, type StorySave } from '../../../src/war/sim/stories';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { storyStorageKey } from '../../src/war/stories';

const region = warRegion('dodona-e')!, story = STORIES['dodona-e'], spots = storySpots(region, story);
const join = (pid: number, team: number, count: number): JoinMsg => ({ t: 'join', v: NET_VERSION, region: 'dodona-e', playerId: pid, team, army: [{ cls: 'hoplite', count }] });
const room = () => new WarRoom({ region, seed: 4, cap: 600 });
const storyMsgs = (r: ReturnType<WarRoom['tick']>, pid: number) => (r.msgs.get(pid) ?? []).filter((m): m is Extract<ServerMsg, { t: 'story' }> => m.t === 'story');

describe('W-65 story in the region room', () => {
  it('his men reach the giver: the chain begins, told and stored', () => {
    const w = room();
    w.join(1, join(1, 0, 6));
    w.tick();
    expect(w.startStory(1, null)).toEqual({ t: 'story', save: { v: 1, story: story.id, at: null, n: 0, picks: {} } });
    w.order(1, { kind: 'move', squad: w.squadsOf(1)[0], x: spots.giver.x, y: spots.giver.y });
    let told: Extract<ServerMsg, { t: 'story' }> | undefined, done: ReturnType<WarRoom['tick']>['storied'] = [];
    for (let t = 0; t < 4000 && !told; t++) {
      const r = w.tick();
      done = [...done, ...r.storied];
      told = storyMsgs(r, 1)[0];
    }
    expect(told).toMatchObject({ save: { at: story.steps[0].id }, notes: [{ kind: 'start' }] });
    expect(done).toEqual([{ pid: 1, save: told!.save, goods: {} }]);
    expect(storyStorageKey(3, 1)).toBe('story:3:1');
  }, 60_000);

  it('a save at the camp step: a fresh room wakes the camp again for him', () => {
    const w = room(), camp = spots.steps.camp[0];
    w.join(1, join(1, 0, 6));
    w.tick();
    w.startStory(1, { v: 1, story: story.id, at: 'camp', n: 0, picks: {} });
    w.tick();
    w.tick();
    expect((w.snapshot().lairs ?? []).filter((l) => Math.hypot(l.x - camp.x, l.y - camp.y) < 0.5)).toEqual([expect.objectContaining({ kind: 'bandit', count: 6, state: 'home' })]);
    expect(w.stories.open).toEqual([1]);
  });

  it('a choice from the client pays its branch and the end; a done chain is told, not run', () => {
    const w = room();
    w.join(1, join(1, 0, 4));
    w.tick();
    w.startStory(1, { v: 1, story: story.id, at: 'judge', n: 0, picks: {} });
    const m = parseClientMsg(JSON.stringify({ t: 'story', op: 'choose', option: 'slay' }));
    expect(m).toEqual({ t: 'story', op: 'choose', option: 'slay' });
    w.storyChoose(1, 'slay');
    const r = w.tick();
    expect(r.storied).toEqual([{ pid: 1, save: { v: 1, story: story.id, at: null, n: 0, picks: { judge: 'slay' }, done: true }, goods: { coin: 100 } }]);
    expect(storyMsgs(r, 1)[0].notes?.map((n) => n.kind)).toEqual(['step', 'end']);
    expect((w.snapshot().piles ?? []).some((p) => p.items === 1)).toBe(true); // Lykon's kopis at his men's feet
    expect(w.stories.open).toEqual([]);
    const saved: StorySave = r.storied[0].save;
    expect(w.startStory(1, saved)).toEqual({ t: 'story', save: saved });
    expect(w.stories.open).toEqual([]);
    // an unknown option or a step that is no choice: nothing
    w.startStory(2, null);
    w.storyChoose(1, 'spare');
    expect(w.tick().storied).toEqual([]);
  });

  it('a region without a story has none', () => {
    const w = new WarRoom({ region: warRegion('dodona')!, seed: 1, cap: 600, home: 0 });
    w.join(1, { ...join(1, 0, 4), region: 'dodona' });
    w.tick();
    expect(w.startStory(1, null)).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'story', op: 'choose', option: 'Bad Option!' }))).toBeNull();
  });
});
