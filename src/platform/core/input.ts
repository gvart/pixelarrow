/** What the device offers for input (ADR-0004 amendment, ADR-0012 Decision 6). */
export interface InputHints {
  /** A physical keyboard is likely, or one has been used (a keydown outside a text field). */
  keyboard(): boolean;
  /** matchMedia('(any-pointer: fine)'). */
  finePointer(): boolean;
  /** Called when keyboard() or finePointer() may have changed; returns an unsubscribe. */
  onChange(cb: () => void): () => void;
  /** KeyboardEvent.code to the label on the player's layout; null where no layout map exists. */
  keyLabels(): Promise<ReadonlyMap<string, string> | null>;
}
