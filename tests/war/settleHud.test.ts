import { describe, expect, it } from 'vitest';
// W-63 the settlement HUD's views (src/war/view/hud/settleCards.ts) and the client's plot rules (src/war/net/settlements.ts).
import { attackToast, holdingsHtml, offerText, settlementCard, settleWarning, viewerOf, type SettleCtx } from '../../src/war/view/hud/settleCards';
import { left, levelKind, levelName, plotRefusal, spanOf, type OfferRow, type WorldSettlement } from '../../src/war/net/settlements';
import type { SettlementNet } from '../../src/war/net/protocol';

const thermi: SettlementNet = { id: 7, centre: 70, x: 100, y: 100, r: 24, name: 'Thermi', lord: 2, lordName: 'Kallias', team: 1, level: 3, overlord: null, tribute: 0, plots: [{ pid: 3, x0: 92, y0: 92, x1: 99, y1: 97 }], role: null };
const larissa: WorldSettlement = { id: 9, region: 'achelous', x: 200, y: 200, r: 24, name: 'Larissa', lord_pid: 1, lord: 'You', level: 4, overlord_id: null, tribute_pct: 0, people: 3 };
const ctx = (over: Partial<SettleCtx> = {}): SettleCtx => ({
  s: thermi, viewer: 'visitor', detail: null, world: [larissa], realm: [larissa], men: 2, town: null, inbox: null,
  form: { open: null, kind: 'vassal', tribute: 12, from: null, bond: 500 }, msg: '', bad: false, online: true, now: 0, ...over,
});
const offer = (o: Partial<OfferRow>): OfferRow => ({ id: 1, kind: 'settle', from_pid: 3, from_name: 'Myrto', from_settlement: null, to_settlement: 7, to_name: 'Thermi', tribute_pct: 0, bond: 0, state: 'open', expires_at: 3_600_000 * 47, ends_at: null, ...o });

describe('W-63 settlement HUD', () => {
  it('a plot must lie inside the ring and clear of other plots, whole tiles', () => {
    const c = { x: 100, y: 100, r: 10 };
    expect(plotRefusal(c, { x0: 98, y0: 98, x1: 102, y1: 102 }, [])).toBeNull();
    expect(plotRefusal(c, { x0: 95, y0: 95, x1: 110, y1: 110 }, [])).toMatch(/inside the ring/);
    expect(plotRefusal(c, { x0: 98, y0: 98, x1: 102, y1: 102 }, [{ x0: 102, y0: 102, x1: 104, y1: 104, name: 'Myrto' }])).toBe("Overlaps Myrto's plot");
    expect(plotRefusal(c, { x0: 98.5, y0: 98, x1: 102, y1: 102 }, [])).toMatch(/whole tiles/);
    expect(spanOf({ x: 5.7, y: 9.2 }, { x: 2.1, y: 3.9 })).toEqual({ x0: 2, y0: 3, x1: 5, y1: 9 });
  });

  it('levels name camp to city and map to four marker kinds', () => {
    expect([0, 1, 2, 3, 4, 5].map(levelName)).toEqual(['Camp', 'Camp', 'Hamlet', 'Village', 'Town', 'City']);
    expect([1, 2, 3, 4, 5].map(levelKind)).toEqual(['camp', 'village', 'village', 'town', 'city']);
    expect([0, 90_000, 3 * 3_600_000 + 60_000 * 12, 50 * 3_600_000].map(left)).toEqual(['now', '1m', '3h 12m', '2d 2h']);
  });

  it('the viewer: the room role, or overlord when he rules its overlord', () => {
    expect(viewerOf(thermi, [])).toBe('visitor');
    expect(viewerOf({ ...thermi, role: 'lord' }, [])).toBe('lord');
    expect(viewerOf({ ...thermi, overlord: 9 }, [9])).toBe('overlord');
    expect(viewerOf({ ...thermi, overlord: 9, role: 'garrison' }, [9])).toBe('overlord');
    expect(viewerOf({ ...thermi, role: 'garrison' }, [])).toBe('garrison');
  });

  it('a visitor is warned whose banner he fights under; terms wait for six men', () => {
    expect(settleWarning(thermi)).toBe("Your men fight under Skythia's banner in this region");
    expect(settleWarning({ team: null, lordName: 'Kallias' })).toBe("Your men fight under Kallias's own banner in this region");
    const html = settlementCard(ctx());
    expect(html).toContain('data-sa="settle"');
    expect(html).toContain("Skythia's banner in this region");
    expect(html).toMatch(/data-sa="terms" disabled data-tip="[^"]*6 of your men must stand on its ground \(you have 2\)/);
    expect(settlementCard(ctx({ men: 6 }))).not.toMatch(/data-sa="terms" disabled/);
  });

  it('the terms form: vassal with the tribute slider at most 30 %, or join', () => {
    const v = settlementCard(ctx({ men: 8, form: { open: 'terms', kind: 'vassal', tribute: 12, from: 9, bond: 500 } }));
    expect(v).toContain('type="range" min="0" max="30"');
    expect(v).toContain('Thermi pays 12% of the goods');
    const j = settlementCard(ctx({ men: 8, form: { open: 'terms', kind: 'join', tribute: 12, from: 9, bond: 500 } }));
    expect(j).toContain('Kallias becomes a citizen and you its lord');
  });

  it('a vassal lord may rebel; an overlord may garrison; a pending ask can be withdrawn', () => {
    const vas = settlementCard(ctx({ s: { ...thermi, role: 'lord', overlord: 9, tribute: 15 }, viewer: 'lord' }));
    expect(vas).toContain('data-sa="rebel"');
    expect(vas).toContain('Larissa');
    expect(vas).toContain('15%');
    const over = settlementCard(ctx({ s: { ...thermi, overlord: 9 }, viewer: 'overlord' }));
    expect(over).toContain('data-sa="garrison"');
    const pend = settlementCard(ctx({ inbox: { incoming: [], outgoing: [offer({ id: 4, from_pid: 1 })], truces: [] } }));
    expect(pend).toContain('data-sa="withdraw:4"');
    expect(pend).not.toContain('Your men fight under');
  });

  it('the Holdings panel words each offer and its accept, with a clock', () => {
    expect(offerText(offer({ kind: 'vassal', from_settlement: 9, tribute_pct: 12, from_name: 'Kallias' }), [larissa], true)).toContain('becomes a vassal of <b>Larissa</b>');
    const html = holdingsHtml({ inbox: { incoming: [offer({})], outgoing: [], truces: [] }, realm: [larissa], world: [larissa], now: 0, online: true, msg: '', bad: false });
    expect(html).toContain('Give a plot…');
    expect(html).toContain('data-sa="refuse:1"');
    expect(html).toContain('1d 23h');
    expect(attackToast({ name: 'Thermi', region: 'achelous', mine: false, broken: 1, here: false })).toContain('Your vassal <b>Thermi</b> is under attack');
  });
});
