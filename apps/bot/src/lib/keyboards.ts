/**
 * lib/keyboards.ts — OpenEscrow Telegram Bot
 *
 * Handles: Shared persistent reply keyboard definitions.
 *          Centralises keyboard markup so all handlers use the same layout.
 * Does NOT: send messages, manage state, or depend on any external module.
 *
 * The main menu keyboard is shown at the bottom of the chat UI after any
 * command reply (/start, /help) and when exiting a chat room. It is replaced
 * by the "🚪 Exit Chat Room" keyboard when the user enters a chat room.
 */

/**
 * Persistent reply keyboard for the main bot menu.
 * Shown after /start and /help, and restored when a user exits a chat room.
 * Only parameter-free commands are included — /link and /status require arguments.
 *
 * Layout:
 *   [ /deals ]  [ /help ]
 *   [       /start       ]
 */
export const MAIN_MENU_KEYBOARD: {
  keyboard: { text: string }[][];
  resize_keyboard: true;
  one_time_keyboard: false;
} = {
  keyboard: [[{ text: '/deals' }, { text: '/help' }], [{ text: '/start' }]],
  resize_keyboard: true,
  one_time_keyboard: false,
};
