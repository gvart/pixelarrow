/** W-62 E6 alliance chat and the W-69 World channel and links over the world's chat sockets (server/src/war/world/chat.ts, src/war/net/chat.ts). */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { SIM_VERSION } from '../../../src/sim/version';
import { CHAT_KEEP, CHAT_RATE, type ChatServerMsg } from '../../../src/war/net/chat';
import { isBad, maskText } from '../../../src/war/net/chatFilter';
import { itemLink, LINK_CHAR, manLink } from '../../../src/war/net/chatLinks';
import { makePerson } from '../../../src/war/sim/roster';
import { ChatGate } from '../../src/war/world/chat';
import { api, BASE, devLogin } from '../helpers';

interface Sock { ws: WebSocket; msgs: ChatServerMsg[]; next(t: ChatServerMsg['t']): Promise<ChatServerMsg>; send(m: unknown): void }

async function chat(token: string): Promise<Sock> {
  const res = await SELF.fetch(`${BASE}/ws/war/world?sim=${SIM_VERSION}&chat=1`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${token}` } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  const c: Sock = {
    ws, msgs: [],
    send: (m) => ws.send(JSON.stringify(m)),
    next: (t) => new Promise((ok, fail) => {
      const t0 = Date.now();
      const poll = () => {
        const i = c.msgs.findIndex((m) => m.t === t);
        if (i >= 0) return ok(c.msgs.splice(i, 1)[0]);
        if (Date.now() - t0 > 10_000) return fail(new Error(`no ${t}: ${JSON.stringify(c.msgs).slice(0, 400)}`));
        setTimeout(poll, 10);
      };
      poll();
    }),
  };
  ws.addEventListener('message', (e) => { if (typeof e.data === 'string') c.msgs.push(JSON.parse(e.data) as ChatServerMsg); });
  return c;
}

async function member(id: number, alliance: number, name: string) {
  const me = await devLogin(id, name);
  expect((await api('/api/war/world/dev/alliance', { method: 'POST', token: me.token, json: { alliance } })).status).toBe(200);
  return me;
}

const said = (m: ChatServerMsg) => (m as Extract<ChatServerMsg, { t: 'said' }>).msg;

describe('chat filter', () => {
  it('masks bad words through case, leetspeak, separators and stretched letters, and leaves clean words alone', () => {
    for (const w of ['fuck', 'FUCK', 'fuuuuck', 'f.u.c.k', 'sh1t', '$hit', 'a$$', 'ASS!', 'fucking', 'b1tch3s']) expect(isBad(w), w).toBe(true);
    for (const w of ['as', 'class', 'pass', 'assassin', 'Gather', 'shift', 'hello', '42', 'cocktail']) expect(isBad(w), w).toBe(false);
    expect(maskText('hold the line you sh1t   heads, Attack!')).toBe('hold the line you ***   heads, Attack!');
  });
});

describe('chat gate', () => {
  it('lets CHAT_RATE.n through a window, drops the next, then silences the spammer', () => {
    const g = new ChatGate(), t0 = 1_000_000;
    for (let i = 0; i < CHAT_RATE.n; i++) expect(g.check(1, t0 + i)).toEqual({ ok: true });
    expect(g.check(1, t0 + 10)).toEqual({ ok: false, code: 'slow' });
    expect(g.check(2, t0 + 10)).toEqual({ ok: true }); // per player
    expect(g.check(1, t0 + 20)).toEqual({ ok: false, code: 'silenced', until: t0 + 20 + CHAT_RATE.silenceMs });
    expect(g.check(1, t0 + CHAT_RATE.ms + 100)).toMatchObject({ ok: false, code: 'silenced' }); // still silenced past the window
    expect(g.check(1, t0 + 20 + CHAT_RATE.silenceMs + 1)).toEqual({ ok: true });
  });
});

describe('alliance chat over the world socket', () => {
  it('reaches only the sender\'s alliance, masks free text, relays phrases and marks', async () => {
    const a = await member(8601, 0, 'Agis'), b = await member(8602, 0, 'Brasidas'), c = await member(8603, 1, 'Kleon');
    const [sa, sb, sc] = await Promise.all([chat(a.token), chat(b.token), chat(c.token)]);
    for (const s of [sa, sb, sc]) expect(await s.next('chat')).toMatchObject({ t: 'chat', muted: [] });

    sa.send({ t: 'say', text: 'push the  gate, you sh1t heads' });
    const got = said(await sb.next('said'));
    expect(got).toMatchObject({ pid: a.playerId, name: a.name, text: 'push the gate, you *** heads' });
    expect(said(await sa.next('said')).id).toBe(got.id); // the sender sees his own line

    sb.send({ t: 'say', phrase: 7 });
    expect(said(await sa.next('said'))).toMatchObject({ pid: b.playerId, phrase: 7 });
    sb.send({ t: 'mark', kind: 'attack', at: 'kleisoura', x: 40.5, y: 22 });
    expect(((await sa.next('marked')) as Extract<ChatServerMsg, { t: 'marked' }>).mark).toMatchObject({ pid: b.playerId, kind: 'attack', at: 'kleisoura', x: 40.5, y: 22 });
    sb.send({ t: 'say', text: 'x', phrase: 1 }); // both: refused
    expect(await sb.next('error' as ChatServerMsg['t'])).toMatchObject({ code: 'parse' });
    // the other alliance hears nothing of it; its own line reaches it
    sc.send({ t: 'say', text: 'Skythia here' });
    expect(said(await sc.next('said'))).toMatchObject({ pid: c.playerId, text: 'Skythia here' });
    expect(sc.msgs.filter((m) => m.t === 'said' || m.t === 'marked')).toEqual([]);
    expect(sa.msgs.some((m) => m.t === 'said' && m.msg.pid === c.playerId)).toBe(false);
    expect(sb.msgs.some((m) => m.t === 'said' && m.msg.pid === c.playerId)).toBe(false);
    for (const s of [sa, sb, sc]) s.ws.close(1000);
  });

  it('gives a joining player his alliance\'s last messages, never another alliance\'s', async () => {
    const a = await member(8611, 2, 'Lysander'), c = await member(8612, 3, 'Pausanias');
    const sa = await chat(a.token), sc = await chat(c.token);
    await sa.next('chat');
    await sc.next('chat');
    sc.send({ t: 'say', text: 'elaia only' });
    await sc.next('said');
    // older history than CHAT_KEEP is pruned
    const now = Date.now();
    await env.DB!.batch(Array.from({ length: CHAT_KEEP + 5 }, (_, i) => env.DB!.prepare('INSERT INTO war_chat (alliance, player_id, name, text, at) VALUES (2, ?1, ?2, ?3, ?4)').bind(a.playerId, 'Lysander', `old ${i}`, now + i)));
    sa.send({ t: 'say', text: 'latest' });
    await sa.next('said');
    sa.ws.close(1000);
    const b = await member(8613, 2, 'Gylippos');
    const sb = await chat(b.token);
    const h = (await sb.next('chat')) as Extract<ChatServerMsg, { t: 'chat' }>;
    expect(h.you).toBe(b.playerId);
    expect(h.msgs).toHaveLength(CHAT_KEEP);
    expect(h.msgs.at(-1)).toMatchObject({ text: 'latest', name: a.name });
    expect(h.msgs.some((m) => m.text === 'elaia only')).toBe(false);
    expect((await env.DB!.prepare('SELECT COUNT(*) AS n FROM war_chat WHERE alliance = 2').first<{ n: number }>())!.n).toBe(CHAT_KEEP);
    sb.ws.close(1000);
    sc.ws.close(1000);
  });

  it('drops a spammer\'s messages over the rate limit, then silences him', async () => {
    const a = await member(8621, 1, 'Spammer');
    const sa = await chat(a.token);
    await sa.next('chat');
    for (let i = 0; i < CHAT_RATE.n + 3; i++) sa.send({ t: 'say', text: `spam ${i}` });
    for (let i = 0; i < CHAT_RATE.n; i++) expect(said(await sa.next('said')).text).toBe(`spam ${i}`);
    expect(await sa.next('chatError')).toEqual({ t: 'chatError', code: 'slow' });
    expect(await sa.next('chatError')).toMatchObject({ t: 'chatError', code: 'silenced' });
    expect(await sa.next('chatError')).toMatchObject({ t: 'chatError', code: 'silenced' });
    sa.send({ t: 'mark', kind: 'gather', at: 'world', x: 1, y: 1 }); // marks count too
    expect(await sa.next('chatError')).toMatchObject({ code: 'silenced' });
    expect(sa.msgs.filter((m) => m.t === 'said')).toEqual([]);
    sa.ws.close(1000);
  });

  it('stores a report for review and keeps a player\'s mutes', async () => {
    const a = await member(8631, 3, 'Rude'), b = await member(8632, 3, 'Victim');
    const sa = await chat(a.token), sb = await chat(b.token);
    await sa.next('chat');
    await sb.next('chat');
    sa.send({ t: 'say', text: 'you are useless' });
    const m = said(await sb.next('said'));
    sb.send({ t: 'report', id: m.id });
    expect(await sb.next('chatError')).toEqual({ t: 'chatError', code: 'reported' });
    sb.send({ t: 'report', id: m.id }); // once per reporter
    await sb.next('chatError');
    sa.send({ t: 'report', id: m.id }); // not his own
    await sa.next('chatError');
    const rows = (await env.DB!.prepare('SELECT msg_id, reporter_id, author_id, alliance, text, status FROM war_chat_reports WHERE msg_id = ?1').bind(m.id).all()).results;
    expect(rows).toEqual([{ msg_id: m.id, reporter_id: b.playerId, author_id: a.playerId, alliance: 3, text: 'you are useless', status: 'open' }]);

    sb.send({ t: 'mute', pid: a.playerId, on: true });
    sb.send({ t: 'mute', pid: b.playerId, on: true }); // not himself
    sb.send({ t: 'say', phrase: 0 });
    await sb.next('said');
    sb.ws.close(1000);
    const again = await chat(b.token);
    expect(await again.next('chat')).toMatchObject({ muted: [a.playerId] });
    again.send({ t: 'mute', pid: a.playerId, on: false });
    again.send({ t: 'say', phrase: 18 });
    await again.next('said');
    again.ws.close(1000);
    const third = await chat(b.token);
    expect(await third.next('chat')).toMatchObject({ muted: [] });
    third.ws.close(1000);
    sa.ws.close(1000);
  });

  it('keeps chat off the snapshot socket and snapshots off the chat socket', async () => {
    const a = await member(8641, 0, 'Plain');
    const sa = await chat(a.token);
    await sa.next('chat');
    expect(sa.msgs.some((m) => (m as { t: string }).t === 'world')).toBe(false);
    sa.ws.close(1000);
  });
});

describe('world chat and links', () => {
  it('a World line reaches every alliance and the allianceless; an alliance line stays in it', async () => {
    const a = await member(8651, 0, 'Agesilaos'), b = await member(8652, 0, 'Teleutias'), c = await member(8653, 2, 'Konon');
    const d = await devLogin(8654, 'Loner');
    const [sa, sb, sc, sd] = await Promise.all([chat(a.token), chat(b.token), chat(c.token), chat(d.token)]);
    for (const s of [sa, sb, sc, sd]) await s.next('chat');
    sa.send({ t: 'say', text: 'hello world', ch: 'world' });
    for (const s of [sa, sb, sc, sd]) expect(said(await s.next('said'))).toMatchObject({ pid: a.playerId, text: 'hello world', ch: 'world' });
    sa.send({ t: 'say', text: 'allies only' });
    for (const s of [sa, sb]) expect(said(await s.next('said'))).toMatchObject({ text: 'allies only' });
    // one without an alliance may speak to the world, not to an alliance
    sd.send({ t: 'say', phrase: 18, ch: 'world' });
    expect(said(await sc.next('said'))).toMatchObject({ pid: d.playerId, phrase: 18, ch: 'world' });
    sd.send({ t: 'say', text: 'anyone?' });
    expect(await sd.next('chatError')).toEqual({ t: 'chatError', code: 'noAlliance' });
    await sd.next('said');
    expect(sc.msgs.some((m) => m.t === 'said' && m.msg.text === 'allies only')).toBe(false);
    expect(sd.msgs.some((m) => m.t === 'said' && m.msg.text === 'allies only')).toBe(false);
    // the other alliance reports a World line; history carries both channels
    sa.send({ t: 'say', text: 'you are useless', ch: 'world' });
    let w = said(await sc.next('said'));
    while (w.text !== 'you are useless') w = said(await sc.next('said'));
    sc.send({ t: 'report', id: w.id });
    expect(await sc.next('chatError')).toEqual({ t: 'chatError', code: 'reported' });
    expect((await env.DB!.prepare('SELECT alliance, reporter_id FROM war_chat_reports WHERE msg_id = ?1').bind(w.id).first())).toEqual({ alliance: -1, reporter_id: c.playerId });
    const again = await chat(c.token);
    const h = (await again.next('chat')) as Extract<ChatServerMsg, { t: 'chat' }>;
    expect(h.msgs.some((m) => m.text === 'hello world' && m.ch === 'world')).toBe(true);
    expect(h.msgs.some((m) => m.text === 'allies only')).toBe(false);
    for (const s of [sa, sb, sc, sd, again]) s.ws.close(1000);
  });

  it('relays linked items and own men, masked; refuses a man not the sender\'s', async () => {
    const a = await member(8661, 1, 'Iphikrates'), b = await member(8662, 3, 'Chabrias');
    const [sa, sb] = await Promise.all([chat(a.token), chat(b.token)]);
    await sa.next('chat');
    await sb.next('chat');
    const man = makePerson('w69-damon', 'hoplite', { level: 3, tier: 1, name: 'Damon' });
    const sword = itemLink({ uid: 'w69-it', def: 'kopis', rarity: 'rare', cond: 90, mk: 'sh1t smith' });
    const tag = (i: number) => String.fromCharCode(LINK_CHAR + i);
    sa.send({ t: 'say', ch: 'world', text: `look ${tag(0)} and ${tag(1)}`, links: [sword, manLink(man)] });
    expect(await sa.next('chatError')).toEqual({ t: 'chatError', code: 'link' }); // not his man (yet)
    await env.DB!.prepare('INSERT INTO war_persons (id, player_id, cls, name) VALUES (?1, ?2, ?3, ?4)').bind(man.id, a.playerId, 'hoplite', 'Damon').run();
    sa.send({ t: 'say', ch: 'world', text: `look ${tag(0)} and ${tag(1)}${tag(5)}`, links: [sword, manLink(man)] });
    const got = said(await sb.next('said'));
    expect(got.text).toBe(`look ${tag(0)} and ${tag(1)}`); // the stray tag dropped
    expect(got.links).toEqual([{ ...sword, it: { ...(sword as Extract<typeof sword, { k: 'item' }>).it, mk: '*** smith' } }, manLink(man)]);
    sa.send({ t: 'say', text: 'bad', links: [{ k: 'item', it: { uid: 'x', def: 'nope', rarity: 'rare', cond: 1 } }] });
    expect(await sa.next('error' as ChatServerMsg['t'])).toMatchObject({ code: 'parse' });
    const h = (await (await chat(b.token)).next('chat')) as Extract<ChatServerMsg, { t: 'chat' }>;
    expect(h.msgs.find((m) => m.id === got.id)).toEqual(got);
    sa.ws.close(1000);
    sb.ws.close(1000);
  });
});
