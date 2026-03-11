/**
 * chain/indexer.ts — OpenEscrow API
 *
 * Handles: Polling the EVM chain for OpenEscrow contract events every 12 seconds.
 *          Processing DealFunded and DealCancelled events to update deal status in the DB.
 *          Tracking the last processed block to avoid reprocessing events.
 * Does NOT: send transactions (read-only), issue JWTs, handle HTTP requests,
 *            or call smart contract write functions (approveMilestone etc. are frontend responsibility).
 *
 * Events processed:
 *   - DealFunded     → transitions matching deal AGREED → FUNDED
 *   - DealCancelled  → confirms on-chain cancellation, updates deal metadata
 *
 * Events not processed (handled by API endpoints directly):
 *   - DealCreated, DealAgreed, MilestoneSubmitted, MilestoneApproved, MilestoneRejected
 *
 * Retry policy: Each poll cycle has a 10s timeout. Failures are logged at `warn` level
 * and retried on the next cycle. The indexer never crashes the server on RPC errors.
 */

import { createPublicClient, http, parseAbiItem } from 'viem';
import { sepolia } from 'viem/chains';
import { eq } from 'drizzle-orm';
import { db } from '../database/index.js';
import { deals, dealEvents } from '../database/schema.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'chain.indexer' });

/**
 * Viem public client for reading chain state.
 * Uses HTTP transport with a 10-second timeout per CLAUDE.md rules.
 * Targets Sepolia testnet — mainnet only after audit.
 */
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(env.RPC_URL, {
    timeout: 10_000,
    retryCount: 3,
    retryDelay: 1_000,
  }),
});

const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS as `0x${string}`;

/** Tracks the last block number processed to avoid re-processing the same events. */
let lastProcessedBlock: bigint | null = null;

/** Guards against overlapping poll cycles when an RPC call takes longer than poll interval. */
let isPollingInProgress = false;

// ─── ABI fragments for events we care about ───────────────────────────────────

const DEAL_FUNDED_ABI = parseAbiItem(
  'event DealFunded(uint256 indexed dealId, address indexed client, address token, uint256 amount)'
);

const DEAL_CANCELLED_ABI = parseAbiItem(
  'event DealCancelled(uint256 indexed dealId, address indexed cancelledBy, uint256 refundAmount)'
);

// ─── Event handlers ───────────────────────────────────────────────────────────

/**
 * Handles a DealFunded on-chain event.
 * Finds the matching DB deal by chain_deal_id and transitions it to FUNDED status.
 * Idempotent: skips if the deal is already FUNDED.
 *
 * @param chainDealId - The on-chain deal ID (from event args)
 * @param txHash - Transaction hash for audit trail
 * @param blockNumber - Block number where the event was emitted
 * @returns Promise<void>
 */
async function handleDealFunded(
  chainDealId: string,
  txHash: string,
  blockNumber: bigint
): Promise<void> {
  log.info(
    {
      module: 'chain.indexer',
      operation: 'handleDealFunded',
      chainDealId,
      txHash,
      blockNumber: blockNumber.toString(),
    },
    'Processing DealFunded event'
  );

  try {
    const [deal] = await db.select().from(deals).where(eq(deals.chainDealId, chainDealId)).limit(1);

    if (!deal) {
      log.warn(
        {
          module: 'chain.indexer',
          operation: 'handleDealFunded',
          chainDealId,
          txHash,
        },
        'No DB deal found for chain deal ID — may have been funded via API endpoint already'
      );
      return;
    }

    // Idempotent: skip if already funded.
    if (deal.status === 'FUNDED') {
      log.info(
        {
          module: 'chain.indexer',
          operation: 'handleDealFunded',
          dealId: deal.id,
          chainDealId,
        },
        'Deal already in FUNDED state — skipping indexer update'
      );
      return;
    }

    if (deal.status !== 'AGREED') {
      log.warn(
        {
          module: 'chain.indexer',
          operation: 'handleDealFunded',
          dealId: deal.id,
          chainDealId,
          currentStatus: deal.status,
        },
        'DealFunded event received but deal is not in AGREED state'
      );
      return;
    }

    await db.transaction(async (tx) => {
      await tx.update(deals).set({ status: 'FUNDED', chainDealId }).where(eq(deals.id, deal.id));

      await tx.insert(dealEvents).values({
        dealId: deal.id,
        actorId: deal.clientId,
        eventType: 'DEAL_FUNDED',
        metadata: {
          source: 'chain_indexer',
          transactionHash: txHash,
          chainDealId,
          blockNumber: blockNumber.toString(),
        },
      });
    });

    log.info(
      {
        module: 'chain.indexer',
        operation: 'handleDealFunded',
        dealId: deal.id,
        chainDealId,
      },
      'Deal status updated to FUNDED from chain event'
    );
  } catch (err) {
    log.error(
      {
        module: 'chain.indexer',
        operation: 'handleDealFunded',
        chainDealId,
        txHash,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to process DealFunded event'
    );
    // Do not rethrow — indexer must continue running.
  }
}

/**
 * Handles a DealCancelled on-chain event.
 * Appends a metadata update to deal_events noting on-chain confirmation.
 * The DB deal status should already be CANCELLED (set by API /cancel endpoint).
 * Idempotent: safe to call multiple times.
 *
 * @param chainDealId - The on-chain deal ID (from event args)
 * @param txHash - Transaction hash for audit trail
 * @param refundAmount - Amount refunded on-chain (BigInt string)
 * @param blockNumber - Block number where the event was emitted
 * @returns Promise<void>
 */
async function handleDealCancelled(
  chainDealId: string,
  txHash: string,
  refundAmount: string,
  blockNumber: bigint
): Promise<void> {
  log.info(
    {
      module: 'chain.indexer',
      operation: 'handleDealCancelled',
      chainDealId,
      txHash,
      refundAmount,
      blockNumber: blockNumber.toString(),
    },
    'Processing DealCancelled event'
  );

  try {
    const [deal] = await db
      .select({ id: deals.id, clientId: deals.clientId })
      .from(deals)
      .where(eq(deals.chainDealId, chainDealId))
      .limit(1);

    if (!deal) {
      log.warn(
        {
          module: 'chain.indexer',
          operation: 'handleDealCancelled',
          chainDealId,
          txHash,
        },
        'No DB deal found for cancelled chain deal ID'
      );
      return;
    }

    // Append an on-chain confirmation event to the audit trail.
    await db.insert(dealEvents).values({
      dealId: deal.id,
      actorId: deal.clientId,
      eventType: 'DEAL_CANCELLED',
      metadata: {
        source: 'chain_indexer',
        transactionHash: txHash,
        chainDealId,
        refundAmount,
        blockNumber: blockNumber.toString(),
        note: 'On-chain DealCancelled event confirmed',
      },
    });

    log.info(
      {
        module: 'chain.indexer',
        operation: 'handleDealCancelled',
        dealId: deal.id,
        chainDealId,
        refundAmount,
      },
      'DealCancelled on-chain event recorded in audit trail'
    );
  } catch (err) {
    log.error(
      {
        module: 'chain.indexer',
        operation: 'handleDealCancelled',
        chainDealId,
        txHash,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to process DealCancelled event'
    );
    // Do not rethrow — indexer must continue running.
  }
}

// ─── Polling loop ─────────────────────────────────────────────────────────────

/**
 * Runs a single poll cycle: fetches events from the last processed block to current,
 * dispatches each event to the appropriate handler.
 *
 * @returns Promise<void> — resolves after all events in this cycle are processed
 */
async function pollOnce(): Promise<void> {
  if (isPollingInProgress) {
    log.warn(
      {
        module: 'chain.indexer',
        operation: 'pollOnce',
      },
      'Previous poll cycle still running — skipping this tick to avoid overlapping RPC calls'
    );
    return;
  }

  isPollingInProgress = true;

  try {
    let currentBlock: bigint;

    try {
      currentBlock = await publicClient.getBlockNumber();
    } catch (err) {
      log.warn(
        {
          module: 'chain.indexer',
          operation: 'pollOnce',
          error: err instanceof Error ? err.message : String(err),
        },
        'Failed to fetch current block number — will retry next cycle'
      );
      return;
    }

    // On first run, start from the current block to avoid replaying old history.
    if (lastProcessedBlock === null) {
      lastProcessedBlock = currentBlock;
      log.info(
        {
          module: 'chain.indexer',
          operation: 'pollOnce',
          startBlock: currentBlock.toString(),
        },
        'Indexer starting from current block'
      );
      return;
    }

    const fromBlock = lastProcessedBlock + 1n;
    const toBlock = currentBlock;

    if (fromBlock > toBlock) {
      // No new blocks since last poll.
      return;
    }

    log.info(
      {
        module: 'chain.indexer',
        operation: 'pollOnce',
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
      },
      'Polling chain events'
    );

    try {
      // Fetch DealFunded events.
      const fundedLogs = await publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: DEAL_FUNDED_ABI,
        fromBlock,
        toBlock,
      });

      for (const log_entry of fundedLogs) {
        if (log_entry.args.dealId !== undefined) {
          await handleDealFunded(
            log_entry.args.dealId.toString(),
            log_entry.transactionHash ?? '',
            log_entry.blockNumber ?? 0n
          );
        }
      }

      // Fetch DealCancelled events.
      const cancelledLogs = await publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: DEAL_CANCELLED_ABI,
        fromBlock,
        toBlock,
      });

      for (const log_entry of cancelledLogs) {
        if (log_entry.args.dealId !== undefined) {
          await handleDealCancelled(
            log_entry.args.dealId.toString(),
            log_entry.transactionHash ?? '',
            (log_entry.args.refundAmount ?? 0n).toString(),
            log_entry.blockNumber ?? 0n
          );
        }
      }

      // Advance the last processed block only after successful processing.
      lastProcessedBlock = toBlock;
    } catch (err) {
      log.warn(
        {
          module: 'chain.indexer',
          operation: 'pollOnce',
          fromBlock: fromBlock.toString(),
          toBlock: toBlock.toString(),
          error: err instanceof Error ? err.message : String(err),
        },
        'Event log fetch failed — will retry from same block next cycle'
      );
      // Do not advance lastProcessedBlock so we retry this range.
    }
  } finally {
    isPollingInProgress = false;
  }
}

/** Reference to the polling interval timer, used for cleanup. */
let pollingInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the chain event indexer polling loop.
 * Polls every INDEXER_POLL_INTERVAL_MS milliseconds (default: 12000ms per MVP spec).
 * Safe to call only once — calling again while already running logs a warning and returns.
 *
 * @returns void
 */
export function startIndexer(): void {
  if (pollingInterval !== null) {
    log.warn(
      {
        module: 'chain.indexer',
        operation: 'startIndexer',
      },
      'Indexer is already running — ignoring duplicate start call'
    );
    return;
  }

  log.info(
    {
      module: 'chain.indexer',
      operation: 'startIndexer',
      pollIntervalMs: env.INDEXER_POLL_INTERVAL_MS,
      contractAddress: env.CONTRACT_ADDRESS,
    },
    'Chain indexer started'
  );

  // Run the first poll immediately, then schedule recurring polls.
  void pollOnce();
  pollingInterval = setInterval(() => {
    void pollOnce();
  }, env.INDEXER_POLL_INTERVAL_MS);
}

/**
 * Stops the chain event indexer and clears the polling interval.
 * Should be called on graceful server shutdown.
 *
 * @returns void
 */
export function stopIndexer(): void {
  if (pollingInterval !== null) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    log.info(
      {
        module: 'chain.indexer',
        operation: 'stopIndexer',
      },
      'Chain indexer stopped'
    );
  }
}
