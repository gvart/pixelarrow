/**
 * The Kit layout primitives (V6-RFND-02, design/ux/landscape-v6.md §3): the pure geometry
 * (geometry.ts) and the Phaser parts drawn with it (the side panel and the rotate card).
 */
export * from './geometry';
export { openPanel, type PanelOpts, type PanelHandle } from './SidePanel';
export { RotateCard, mountRotateCard } from './RotateCard';
