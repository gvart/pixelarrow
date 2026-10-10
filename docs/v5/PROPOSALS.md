# v5 Proposals (need the user's decision: real-money pricing and payments)

None of these is in any GDD. Nothing here changes a price or a payment until the user decides.

| # | From | Proposal | Why | Options |
| --- | --- | --- | --- | --- |
| P-1 | S2-VISION (MECH E4) | Decide whether the war-map marketplace may sell **legendary** items for Drachmae. | Stars buy Drachmae, so today's market is an indirect paid-power path. That conflicts with the v5 anti-pillar "NOT pay for power" in spirit, though not by DESIGN_V2's letter. | (a) Keep it as is. (b) Allow Drachmae listings only up to epic, with legendaries priced in gold only. (c) Keep Drachmae listings, but make every legendary bound (not just the named and set pieces). The vision recommends **(b)**. It touches `server/src/online/market.ts` and `src/game/marketRules.ts`. |
| P-2 | S2-VISION | **Standard cosmetics**: banner designs for the v5 standard bearer (abilities.md R5), sold as Drachmae cosmetics alongside shield emblems. | It gives a cosmetic sink tied to a new, visible element, with no power. | Price and pack decisions belong to the user. The art pipeline already supports shield paints, and banners would follow the same layer format. |
| P-3 | S2-VISION (MECH E5) | The premium pass returns less than the 600 Dr decided on 2026-10-07. | It's a known gap against a decision already made. | Re-tune the pass track to match the decision, or revisit the decision. This is pricing, so it's the user's call. |
