/**
 * Wall drawing as in Age of Empires and Stronghold (W-57): press on the start tile and drag to the end, or click the
 * start and click the end. Shift keeps drawing from the end just laid (chained segments). Points are tile centres.
 */
export type Pt = [number, number];

export class WallDraw {
  /** The line's start once placed (a press, or a first click), null before. */
  start: Pt | null = null;
  private down: Pt | null = null;

  /** The pointer went down on p. */
  press(p: Pt): void {
    this.down = p;
    if (!this.start) this.start = p;
  }

  /**
   * The pointer came up on p: the finished line [x0, y0, x1, y1], or null when that was the first click (the start stays,
   * waiting for the end click). With shift the end becomes the next line's start.
   */
  release(p: Pt, shift: boolean): number[] | null {
    const d = this.down;
    this.down = null;
    if (!d || !this.start) return null;
    const moved = p[0] !== d[0] || p[1] !== d[1];
    if (!moved && p[0] === this.start[0] && p[1] === this.start[1]) return null;
    const line = [...this.start, ...p];
    this.start = shift ? p : null;
    return line;
  }

  /** Esc / right click: drop the start; false when there was none. */
  cancel(): boolean {
    const had = !!this.start;
    this.start = this.down = null;
    return had;
  }
}
