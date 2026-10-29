/**
 * W-69 chat links in the panel (./chat.ts): a link's gold tag in a line, its hover card (the item's codex card,
 * ./roster/ui.ts itemTip, or the soldier card, ./roster/card.ts cardHtml, from the snapshot sent with the message), and
 * the link a Shift+click picks (any element with `data-chat-link`, the snapshot as JSON: ./chest.ts, ./holder.ts,
 * ./roster/card.ts; men through the view's own lookup).
 */
import { itemLink, linkItem, linkLabel, linkPerson, LINK, type ChatLinkData } from '../../net/chatLinks';
import type { Item } from '../../../data/items';
import type { cardHtml as CardHtml } from './roster/card';
import type { SandboxRoster } from './roster/state';
import { esc, itemTip, loadItemAtlas, rarityHex, ROSTER_CSS } from './roster/ui';
import { TIP_CSS } from './tooltip';
import { placeTip } from './kit';

/** The attribute that makes an element a Shift+click item link (./chest.ts and the other item lists). */
export const itemLinkAttr = (it: Item) => `data-chat-link="${esc(JSON.stringify(itemLink(it)))}"`;

/** The link on an element marked with `data-chat-link` (or inside one), null when none or not a valid one. */
export function markedLink(t: Element): ChatLinkData | null {
  const raw = t.closest<HTMLElement>('[data-chat-link]')?.dataset.chatLink;
  if (!raw) return null;
  try {
    const r = LINK.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** A tag in a line: gold brackets, an item's name in its rarity colour, a man's in gold. */
export const tagHtml = (l: ChatLinkData, i: number) =>
  `<span class="ch-tag" data-li="${i}">[<span${l.k === 'item' ? ` style="color:${rarityHex(l.it.rarity)}"` : ''}>${esc(linkLabel(l))}</span>]</span>`;

/** The bare roster the soldier card asks (a linked man has no offers and no captor). */
const NO_ROSTER = { offers: () => [], captorOf: () => undefined } as unknown as SandboxRoster;

let styled = false;
/** The hover card's element: the item card in the tooltip frame, the soldier card as it is. */
export function mountTagTip(): { show(l: ChatLinkData, owner: string, at: HTMLElement, portrait?: (c: HTMLCanvasElement, cls: string, scars: number) => void): void; hide(): void } {
  if (!styled) {
    styled = true;
    const st = document.createElement('style');
    st.textContent = TIP_CSS + ROSTER_CSS + '#rfChatTip{position:fixed;z-index:9;pointer-events:none}#rfChatTip.man{white-space:normal}#rfChatTip .rr-card{margin:0}';
    document.head.appendChild(st);
    void loadItemAtlas();
  }
  // the soldier card's module draws on Phaser (its rank marks): loaded with the page's chat, not at import
  let cardHtml: typeof CardHtml | null = null;
  void import('./roster/card').then((m) => (cardHtml = m.cardHtml));
  const tip = document.createElement('div');
  tip.id = 'rfChatTip';
  tip.style.display = 'none';
  document.body.append(tip);
  return {
    show(l, owner, at, portrait) {
      try {
        if (l.k === 'item') {
          tip.className = 'rf rf-tip';
          tip.innerHTML = itemTip(linkItem(l.it));
        } else {
          if (!cardHtml) throw new Error('card not loaded');
          tip.className = 'rf man';
          const p = linkPerson(l);
          tip.innerHTML = cardHtml(NO_ROSTER, { p, where: 'away', region: `${owner} army` });
          const c = tip.querySelector<HTMLCanvasElement>('#rrPort');
          if (c) portrait?.(c, l.cls, l.scars);
        }
      } catch {
        tip.className = 'rf rf-tip';
        tip.innerHTML = `<b>${esc(linkLabel(l))}</b>`;
      }
      tip.style.display = '';
      placeTip(tip, at);
    },
    hide() { tip.style.display = 'none'; },
  };
}
