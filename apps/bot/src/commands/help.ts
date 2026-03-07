/**
 * commands/help.ts — OpenEscrow Telegram Bot
 *
 * Handles: /help command handler.
 *          Sends a concise reference guide covering commands, the escrow flow,
 *          and how to link the Telegram account to the web dashboard.
 * Does NOT: fetch data, modify state, or require the user to be linked.
 *           Help is available to all users regardless of link status.
 */

import type { Context } from 'telegraf';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'commands.help' });

/**
 * Handles the /help command.
 * Sends a static Markdown reference guide to the user.
 * No auth check required — help is always accessible.
 *
 * @param ctx - Telegraf context for the /help message
 * @returns Promise<void>
 */
export async function helpCommandHandler(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const telegramUserId = ctx.from?.id;

  log.info(
    { module: 'commands.help', operation: 'helpCommandHandler', telegramUserId, chatId },
    'Handling /help command',
  );

  const helpText =
    `*OpenEscrow Bot — Help*\n\n` +
    `OpenEscrow is a milestone-based escrow platform for freelancers and Web3 projects.\n` +
    `Funds (USDC/USDT) are locked in a smart contract and released as milestones are approved.\n\n` +
    `*Commands*\n\n` +
    `/start - Introduction and link instructions\n` +
    `/link <code> - Link your Telegram to the web dashboard\n` +
    `/deals - List your active deals with action buttons\n` +
    `/status <dealId> - Full deal details (use /deals buttons instead)\n` +
    `/help - Show this message\n\n` +
    `*How it works*\n\n` +
    `1. *Client* creates a deal with milestones on the web dashboard\n` +
    `2. *Freelancer* agrees to the deal terms, status becomes AGREED\n` +
    `3. *Client* funds the deal on-chain, status becomes FUNDED\n` +
    `4. *Freelancer* submits each milestone for review\n` +
    `5. *Client* approves (funds released) or rejects (freelancer revises)\n` +
    `6. After all milestones approved, deal is COMPLETED\n\n` +
    `*Linking your account*\n\n` +
    `1. Go to web dashboard, Settings, Telegram\n` +
    `2. Click *Generate Code*\n` +
    `3. Send the code here: /link <code>\n` +
    `4. Copy your Telegram ID from the bot reply\n` +
    `5. Enter both the code and your Telegram ID on the web dashboard\n` +
    `6. Click *Verify & Link* and you will receive a confirmation here\n\n` +
    `*Supported tokens*: USDC and USDT on Sepolia testnet only.\n` +
    `*Network*: Sepolia testnet, do not use real funds.\n\n` +
    `_Full documentation: visit the web dashboard, Help menu_`;

  try {
    await ctx.replyWithMarkdown(helpText);

    log.info(
      { module: 'commands.help', operation: 'helpCommandHandler', telegramUserId, chatId },
      'Help message sent',
    );
  } catch (err) {
    log.error(
      {
        module: 'bot',
        operation: 'helpCommandHandler',
        chatId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to send /help message',
    );
    try {
      await ctx.reply('Sorry, failed to send help message. Please try again.');
    } catch {
      log.error(
        { module: 'bot', operation: 'helpCommandHandler', chatId },
        'Failed to send error reply for /help',
      );
    }
  }
}
