import { describe, expect, it } from 'vitest';
import { squadName } from '../../src/war/view/hud/kit';
import { metres } from '../../src/war/view/hud/explain';
import { OfflineChat } from '../../src/war/net/chatLink';
import type { ChatServerMsg } from '../../src/war/net/chat';
import type { SquadSnap } from '../../src/war/types';

const sq = (id: number, owner: string, team: number, men = 3) => ({ id, owner, team, units: Array.from({ length: men }, (_, i) => id * 100 + i) }) as unknown as SquadSnap;

describe('HUD words: plain names and units', () => {
  it('a squad reads as its place among its owner\'s squads, never the sim id', () => {
    const squads = [sq(0, 'bot', 1), sq(3, 'you', 0), sq(4, 'you', 0, 0), sq(7, 'you', 0), sq(9, 'ally', 0)];
    expect(squadName(squads, 3)).toBe('Squad 1');
    expect(squadName(squads, 7)).toBe('Squad 2'); // the empty (merged) squad 4 does not count
    expect(squadName(squads, 9)).toBe('Squad 1');
    expect(squadName(squads, 42)).toBe('Squad');
  });

  it('distances read in metres (1 tile = 2 m)', () => {
    expect(metres(14.6)).toBe('29 m');
  });

  it('offline the chat has no one in it and says it needs the server', () => {
    const c = new OfflineChat(), got: ChatServerMsg[] = [];
    c.start((m) => got.push(m));
    expect(c.offline).toBe(true);
    expect(c.live).toBe(false);
    expect(got).toEqual([{ t: 'chat', you: 1, msgs: [], muted: [] }]);
  });
});
