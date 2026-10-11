/**
 * The one Army template (screens-campaign.md C-7, NAV D6): the hero card, the
 * roster rows, the footer and the option sheet, fed by an ArmySource. The
 * campaign Army (ArmyScene) uses it; the duel Team (DUE-01) and the war army
 * (WAR-01) adopt it with their own sources.
 */
export { campaignArmy, pendingPoints, type ArmySource, type HeroStatus } from './source';
export { SLOT_ORDER, FOOT_GAP, armyBack, footerLayout, collapsed, groupNameBeside, type ArmyOrigin } from './layout';
export { SHIPPED_BUSTS, bustKey, bustUrl } from './layout';
export { ensureBusts, addClassBust } from './busts';
export { ARMY_LH, ARMY_ROW_H, ArmyFooter, addArmyHead, addGroupDisc, addMiniHead, addRosterRow, armyPill, armyPillW, openOptionSheet, tappableRow, type HeadOpts, type HeadResult, type OptionSheetOpts } from './parts';
