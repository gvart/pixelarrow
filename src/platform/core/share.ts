/** Invites and outside links. */
export type ShareResult = 'shared' | 'copied' | 'failed';

export interface Share {
  /** A link that opens the game with launchParam() === param. */
  inviteUrl(param: string): string;
  /** Opens the platform's share sheet, else copies url. The copy shown follows the result. */
  invite(url: string, text: string): Promise<ShareResult>;
  /** Opens a web page outside the game; false when nothing opened. */
  openExternal(url: string): boolean;
}
