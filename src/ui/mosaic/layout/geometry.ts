/**
 * The Kit layout primitives (V6-RFND-02, design/ux/landscape-v6.md §3). The geometry is pure (no
 * Phaser) and unit-tested in tests/layoutPrimitives.test.ts; screens read it with their UIMetrics.
 */
export { layoutVariant, PANE_GUTTER, EDGE_PAD, type LayoutVariant, type ClassOf, type Box } from './variant';
export { columns, paneCount, TWO_PANES_W, THREE_PANES_W, type PaneSpec, type ColumnsLayout } from './columns';
export { grid, gridColumns, type GridOpts, type GridLayout } from './grid';
export { belowFloor, rotateCardText, FLOOR_MIN_H } from './floor';
export { edgeClusters, type ClusterId, type ClusterSizes, type EdgeLayout } from './edgeClusters';
export { panelLayout, type PanelKind, type PanelPresentation, type PanelLayout } from './panels';
export { masterDetail, MASTER_MIN, MASTER_MAX, DETAIL_MIN, type MasterDetailLayout } from './masterDetail';
