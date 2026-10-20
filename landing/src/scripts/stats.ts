// Live stats and leaderboards (#leaderboards; STRUCTURE.md §5, ADR-0010, V6-LAND-04).
//
// This module and its styles load only when the section comes near (the loader in Stats.astro), so
// nothing here touches the first view: the inline HTML sits just under the mobile LCP cliff (V6-036),
// and the section ships only its title in the markup. Everything else is built here:
// - one GET of /api/public/v1/summary (the landing proxy, ADR-0007), no retries;
// - three counters from `totals` that count up when seen (static under reduced motion);
// - two parchment ledgers, "Top duelists" and "War standings", always ten ruled lines tall, so the
//   slots never change size when the rows arrive;
// - the empty state when the boards are empty, the totals are small, or the request fails (any 503,
//   other status or bad body): counters show "—", the two ledgers stay blank, and a slip laid across
//   them invites the visitor to play (V6-LAND-06; same size as the filled boards). Nothing
//   here ever shows a number that did not come from the server.
// Names come from players, so they are only ever set with textContent.
import css from '../styles/stats.css?inline';
import { PLAY_URL } from '../site';
import { COUNT_MS, valueAt } from './countUp';

type DuelRow = { rank: number; name: string; league: string; rating: number | null; games: number };
type AllianceRow = { rank: number; name: string; score: number; regions: number; members: number };
type Summary = {
  v: 1;
  generatedAt: number;
  totals: { players: number; onlineBattles: number; clans: number };
  duels: { season: { id: number }; live: DuelRow[]; async: DuelRow[] };
  war: { season: { id: number } | null; alliances: AllianceRow[] };
};

/** Below these a counter shows "—" (ADR-0010 §2 leaves the threshold to the landing page). */
const MIN = { players: 10, onlineBattles: 10, clans: 3 } as const;
const ROWS = 10; // ADR-0010: at most 10 rows per board
const URL_ = '/api/public/v1/summary';
const fmt = new Intl.NumberFormat('en-US').format;

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
};

async function load(): Promise<Summary | null> {
  if (import.meta.env.DEV) {
    // Dev only (never in the build): ?stats=fixture | empty | 503 renders the fixture or a failure
    // without the Worker (astro dev has no /api route).
    const mode = new URLSearchParams(location.search).get('stats');
    if (mode === '503') return null;
    if (mode === 'fixture' || mode === 'empty') {
      const f = structuredClone((await import('../fixtures/summary.v1.json')).default) as Summary;
      if (mode === 'empty') Object.assign(f, { duels: { ...f.duels, live: [], async: [] }, war: { ...f.war, alliances: [] } });
      return f;
    }
  }
  try {
    const res = await fetch(URL_, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const s = (await res.json()) as Summary;
    return s?.v === 1 && Array.isArray(s.duels?.live) && Array.isArray(s.war?.alliances) && typeof s.totals === 'object' ? s : null;
  } catch {
    return null;
  }
}

const asOf = (ms: number) => {
  const d = new Date(ms);
  const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
  const day = new Date().toISOString().slice(0, 10) === d.toISOString().slice(0, 10)
    ? '' : `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}, `;
  return `As of ${day}${time}.`;
};

const league = (r: DuelRow) => {
  const name = r.league.charAt(0).toUpperCase() + r.league.slice(1);
  return r.rating === null ? name : `${name} ${fmt(r.rating)}`; // the game shows a rating for Legend only
};

/** A ledger: a title, a caption, and a table with exactly ROWS ruled lines. */
function ledger(id: string, title: string, sub: string, cols: string[], rows: string[][], none: string) {
  const box = h('div', 'ledger');
  const t = h('h3', 'ledger__title', title);
  t.id = id;
  box.append(t, h('p', 'ledger__sub', sub));
  const table = h('table', 'ledger__table');
  table.setAttribute('aria-labelledby', id);
  const head = h('tr');
  cols.forEach((c, i) => {
    const th = h('th', i === 1 ? 'ledger__name' : undefined, c);
    th.scope = 'col';
    head.append(th);
  });
  const thead = h('thead');
  thead.append(head);
  table.append(thead);
  const body = h('tbody');
  for (let i = 0; i < ROWS; i++) {
    const tr = h('tr');
    const row = rows[i];
    if (row) {
      if (Number(row[0]) <= 3) tr.className = 'is-top';
      row.forEach((v, j) => {
        const td = h('td', j === 1 ? 'ledger__name' : undefined, v);
        if (j === 1) td.title = v; // a long name is cut with an ellipsis; the full one is a hover away
        tr.append(td);
      });
    } else {
      tr.setAttribute('aria-hidden', 'true');
      cols.forEach(() => tr.append(h('td')));
    }
    body.append(tr);
  }
  table.append(body);
  box.append(table);
  if (!rows.length) box.append(h('p', 'ledger__none', none));
  return box;
}

function emptyPanel() {
  const box = h('div', 'stats__empty');
  const a = h('a', 'btn stats__play', 'Play in browser');
  a.href = PLAY_URL;
  box.append(
    h('h3', 'stats__empty-title', 'The war is just beginning…'),
    h('p', undefined, 'The first season is just starting. Your name could be the first one here.'),
    a,
  );
  return box;
}

function render(section: HTMLElement, s: Summary | null): void {
  const wrap = section.querySelector('.container')!;
  wrap.querySelectorAll(':scope > :not(.section__head)').forEach((e) => e.remove());
  section.classList.remove('is-loading');
  section.removeAttribute('aria-busy');

  if (s) section.querySelector('.stats__lead span')!.textContent = asOf(s.generatedAt);

  wrap.append(tally(s));

  // Boards
  const duels = s ? (s.duels.live.length ? s.duels.live : s.duels.async) : [];
  // the four alliances are always listed; a season nobody has scored or taken land in yet counts as empty
  const alliances = s && s.war.alliances.some((r) => r.score > 0 || r.regions > 0) ? s.war.alliances : [];
  const boards = h('div', 'stats__boards');
  if (!s || (!duels.length && !alliances.length)) {
    // The two pages stay on the table, blank and ruled, with the invitation laid across them: the
    // section keeps the exact size of its loading slots and of the filled boards at every width.
    // No season numbers here: the empty state shows no digit at all.
    boards.classList.add('is-empty');
    for (const [title, sub, cols] of [['Top duelists', 'Live ladder', 3], ['War standings', 'Alliances', 4]] as const) {
      const l = ledger('', title, sub, Array<string>(cols).fill(''), [], '');
      l.querySelector('.ledger__none')!.remove();
      l.querySelector('h3')!.removeAttribute('id');
      l.querySelector('table')!.removeAttribute('aria-labelledby');
      l.setAttribute('aria-hidden', 'true');
      boards.append(l);
    }
    boards.append(emptyPanel());
  } else {
    const ladder = s.duels.live.length ? 'Live ladder' : 'Async ladder';
    boards.append(
      ledger('stats-duels', 'Top duelists', `${ladder}, season ${s.duels.season.id}`, ['Rank', 'Player', 'League'],
        duels.map((r) => [String(r.rank), r.name, league(r)]), 'No ranked duelists yet this season.'),
      ledger('stats-war', 'War standings', s.war.season ? `Alliances, season ${s.war.season.id}` : 'Alliances', ['Rank', 'Alliance', 'Score', 'Regions'],
        alliances.map((r) => [String(r.rank), r.name, fmt(r.score), fmt(r.regions)]), 'No alliance holds land yet this season.'),
    );
  }
  wrap.append(boards);
}

/** The three counters; "—" for a missing or small total. */
function tally(s: Summary | null) {
  const dl = h('dl', 'stats__tally');
  const counts: [HTMLElement, number][] = [];
  for (const [key, label] of [['players', 'Players'], ['onlineBattles', 'Online battles'], ['clans', 'Clans']] as const) {
    const n = s?.totals[key];
    const item = h('div', 'tally');
    const dd = h('dd', 'tally__n', '—');
    if (typeof n === 'number' && n >= MIN[key]) {
      dd.dataset.value = String(n);
      counts.push([dd, n]);
    }
    item.append(h('dt', 'tally__label', label), dd);
    dl.append(item);
  }
  if (s) showCounts(dl, counts);
  return dl;
}

/** Counts el's text from 0 up to `to` on animation frames. */
function countUp(el: HTMLElement, to: number) {
  const start = performance.now();
  const step = (now: number) => {
    const t = (now - start) / COUNT_MS;
    el.textContent = fmt(valueAt(to, t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Counters count up the first time they are half in view; under reduced motion they just show. */
function showCounts(tally: HTMLElement, counts: [HTMLElement, number][]) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window);
  if (still) {
    for (const [el, n] of counts) el.textContent = fmt(n);
    return;
  }
  for (const [el] of counts) el.textContent = fmt(0);
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      for (const [el, n] of counts) countUp(el, n);
    },
    { threshold: 0.5 },
  );
  io.observe(tally);
}

/** Loading: the section's own skeleton (fixed slots, empty lines), then one request. */
function skeleton(section: HTMLElement) {
  section.classList.add('is-loading');
  section.setAttribute('aria-busy', 'true');
  const wrap = section.querySelector('.container')!;
  // The lead keeps a line for the "as of" time in every state, so it never grows when data lands.
  const lead = h('p', 'section__lead stats__lead', 'From the game server, updated every few minutes.');
  lead.append(h('span', undefined, '\u00a0'));
  section.querySelector('.section__head')!.append(lead);
  const boards = h('div', 'stats__boards');
  for (const cols of [3, 4]) {
    const l = ledger('', '\u00a0', '\u00a0', Array<string>(cols).fill(''), [], '');
    l.querySelector('table')!.removeAttribute('aria-labelledby');
    l.querySelector('.ledger__none')!.remove();
    l.querySelector('h3')!.removeAttribute('id');
    boards.append(l);
  }
  wrap.append(tally(null), boards);
}

const section = document.getElementById('leaderboards');
if (section && !section.dataset.stats) {
  section.dataset.stats = 'on';
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  skeleton(section);
  load().then((s) => render(section, s));
}
