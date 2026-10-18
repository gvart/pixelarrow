/** Insets in CSS pixels. */
export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface SafeArea {
  /** device: notch, status bar, home indicator; content: the platform's own floating controls. */
  current(): { device: Insets; content: Insets };
  /** Called on every reported change; returns an unsubscribe. */
  onChange(cb: (device: Insets, content: Insets) => void): () => void;
}
