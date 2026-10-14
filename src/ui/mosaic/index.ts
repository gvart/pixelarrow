/**
 * The v4 "Mosaic & Parchment" component library (docs/redesign/V4_SPEC.md;
 * gallery: /?scene=Kit, "Mosaic" tab). Screens of the redesign are built from
 * these and the tokens (MOSAIC in tokens.ts) only.
 */
export { ScreenFrame, TOPBAR_H, type Box, type ScreenFrameOpts } from './ScreenFrame';
export { TopBar, type TopAction, type TopBarOpts } from './TopBar';
export { NavRail, TabBar, type ModeNav, type TabBarOpts } from './TabBar';
export { MODE_TABS, TAB_H, MEDALLION_RISE, tabLayout, tabSlotWidths, fitTabLabels, TAB_LABEL_STYLES, type TabId, type TabLayout, type TabLabelStyle, type TabLabelFit } from './tabLayout';
export { badgeText, wrapWords, chipText, buttonLabelSizes, switchLabelStyle, scrollCue } from './policy';
export { addRowFace, addPortraitWell, ParchmentCard, SectionTitle, SECTION_TITLE_H, ProfileCard, QuestCard, FrescoBanner, ParchmentRow, ROW_H, type ParchmentCardOpts, type ProfileCardOpts, type StatLine, type QuestCardOpts, type FrescoBannerOpts, type ParchmentRowOpts } from './cards';
export { addSwitchBadge, MButton, oneFace, StoneTile, MChip, SegmentedSwitch, SWITCH_H, type MButtonOpts, type MButtonVariant, type StoneTileOpts, type StoneTileVariant, type MChipOpts, type SegmentedSwitchOpts, type SwitchOption } from './controls';
export { KeyButton, caps, type KeyButtonOpts, type KeyVariant } from './KeyButton';
export { BottomPanel, type BottomPanelOpts } from './BottomPanel';
export { MBadge, mosaicImage, mosaicTexture, mtext, mw, fit, TAP, GAP } from './base';
export { addCover, preloadRasters, hasRaster, RASTERS } from './raster';
export { addHubShell, goTab, type HubShell } from './hub';
export { StatTile, type StatTileOpts, type StatTone } from './StatTile';
export { OfferCard, type OfferCardOpts, type OfferState } from './OfferCard';
export { rarityInk, rarityInkKey, ensureRarityInk } from './rarityInk';
export { MBar, type MBarOpts } from './meters';
export { addSubShell, gearAction, type SubShell, type FramedSubShell, type SubShellOpts } from './subShell';
export { addTipLine, type TipLineOpts } from './tips';
export { openParchmentSheet, sheetBox, sheetActionsH, SHEET_TITLE_H, SHEET_ACTION_H, type ParchmentSheetOpts, type ParchmentSheetHandle } from './ParchmentSheet';
export { MIconButton, type MIconButtonOpts, type MIconButtonVariant } from './iconButton';
export { MActionBar, actionBarH, type BarSlot, type MActionBarOpts } from './ActionBar';
export { SituationLine, ChipRow, CHIP_ROW_H, type SituationChip } from './SituationLine';
export { RoundButton, type RoundButtonOpts } from './RoundButton';
export { addPill, pillWidth, addRarityPill } from './pill';
export { addNiche } from './Niche';
export { GearSlot, mountSlot, slotGrid, type GearSlotOpts, type SlotGrid } from './GearSlot';
export { MPager, PAGER_W, addSwipe, type PagerOpts } from './Pager';
export { Toggle, Stepper, type ToggleOpts, type StepperOpts } from './toggles';
export { purchaseButton, confirmPurchase } from './purchase';
export { flyReward, addClaimGlow, type FlyTarget } from './rewardFx';
export { addMedallion } from './medallion';
export { MStashGrid, type MStashGridOpts } from './StashGrid';
export { addParchmentEmpty, type ParchmentEmptyOpts } from './EmptyState';
