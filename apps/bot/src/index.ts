/**
 * index.ts — OpenEscrow Telegram Bot
 *
 * Handles: Bot entry point. Wires together Telegraf, command handlers,
 *          callback handlers, and the notification polling loop.
 *          Starts the bot in long-polling mode.
 * Does NOT: contain business logic, API calls, or session management.
 *           All functionality is delegated to commands/, callbacks/, polling/.
 *
 * Graceful shutdown: Registers SIGTERM and SIGINT handlers to stop the bot
 * cleanly and clear the polling interval before process exits.
 *
 * Retry policy for Telegraf updates: Telegraf's built-in retry handles
 * temporary Telegram API errors. Our API calls have their own retry in api-client/.
 */

import { Telegraf } from 'telegraf';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { startCommandHandler } from './commands/start.js';
import { linkCommandHandler } from './commands/link.js';
import { dealsCommandHandler } from './commands/deals.js';
import { statusCommandHandler } from './commands/status.js';
import { milestoneCallbackHandler } from './callbacks/milestone.js';
import { startNotificationPolling } from './polling/notifier.js';

const log = logger.child({ module: 'index' });

// ─── Bot instance ─────────────────────────────────────────────────────────────

/**
 * Telegraf bot instance.
 * The TELEGRAM_BOT_TOKEN is validated by Zod at startup — never hardcoded.
 *
 * Dependency justification:
 *   telegraf — Default Telegram bot library per CLAUDE.md engineering rules.
 *             Alternatives (node-telegram-bot-api, grammy) considered but Telegraf
 *             is the mandated default. TypeScript-first, well-maintained, supports
 *             inline keyboards natively.
 */
const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

// ─── Command handlers ─────────────────────────────────────────────────────────

bot.command('start', startCommandHandler);
bot.command('link', linkCommandHandler);
bot.command('deals', dealsCommandHandler);
bot.command('status', statusCommandHandler);

// ─── Callback query handler ───────────────────────────────────────────────────

// Handles all inline keyboard callbacks (approve, reject, submit, deal_status, etc.)
bot.on('callback_query', milestoneCallbackHandler);

// ─── Error handler ────────────────────────────────────────────────────────────

/**
 * Global Telegraf error handler.
 * Logs any uncaught errors from update processing without crashing the bot.
 * Per engineering rules: no silent failures — every error is logged with full context.
 */
bot.catch((err, ctx) => {
  log.error(
    {
      module: 'bot',
      operation: 'global_error_handler',
      updateType: ctx.updateType,
      chatId: ctx.chat?.id,
      telegramUserId: ctx.from?.id,
      error: err instanceof Error ? err.message : String(err),
    },
    'Uncaught error in Telegraf update handler',
  );
});

// ─── Startup ──────────────────────────────────────────────────────────────────

/**
 * Starts the bot and the notification polling loop.
 * Launches Telegraf in long-polling mode (no webhook — MVP only).
 * Starts the notification polling loop after the bot is connected.
 *
 * @returns Promise<void>
 * @throws Exits process on fatal startup error
 */
async function main(): Promise<void> {
  log.info(
    {
      module: 'index',
      operation: 'main',
      nodeEnv: env.NODE_ENV,
      apiBaseUrl: env.API_BASE_URL,
      pollIntervalMs: env.POLL_INTERVAL_MS,
    },
    'Starting OpenEscrow Telegram Bot',
  );

  // Start notification polling loop
  const pollingInterval = startNotificationPolling(bot);

  // Graceful shutdown handlers
  const shutdown = async (signal: string): Promise<void> => {
    log.info(
      { module: 'index', operation: 'shutdown', signal },
      'Shutting down bot gracefully',
    );
    clearInterval(pollingInterval);
    bot.stop(signal);
    process.exit(0);
  };

  process.once('SIGTERM', () => {
    shutdown('SIGTERM').catch((err) => {
      log.error(
        {
          module: 'bot',
          operation: 'shutdown',
          error: err instanceof Error ? err.message : String(err),
        },
        'Error during graceful shutdown',
      );
      process.exit(1);
    });
  });

  process.once('SIGINT', () => {
    shutdown('SIGINT').catch((err) => {
      log.error(
        {
          module: 'bot',
          operation: 'shutdown',
          error: err instanceof Error ? err.message : String(err),
        },
        'Error during graceful shutdown',
      );
      process.exit(1);
    });
  });

  // Launch bot (long-polling)
  try {
    await bot.launch();
    log.info(
      { module: 'index', operation: 'main' },
      'Bot launched and listening for updates',
    );
  } catch (err) {
    log.error(
      {
        module: 'bot',
        operation: 'main',
        error: err instanceof Error ? err.message : String(err),
      },
      'Fatal error starting bot — exiting',
    );
    clearInterval(pollingInterval);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[bot/index] FATAL: Unhandled error in main():', err);
  process.exit(1);
});
