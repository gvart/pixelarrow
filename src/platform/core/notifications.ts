/** Where the game can reach the player outside a session. */
export type NotificationChannel = 'telegram_bot';

export interface Notifications {
  channels(): NotificationChannel[];
}
