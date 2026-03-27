/**
 * settings/telegram/page.tsx — OpenEscrow Web Dashboard
 *
 * Telegram linking settings page.
 * Handles: fetching and displaying the current Telegram link status,
 *          generating a one-time linking code (displayed to the user to send to the bot),
 *          and verifying an OTP received from the bot to link the Telegram account.
 * Does NOT: manage auth state, interact with the Telegram API directly,
 *            or perform any on-chain actions.
 *
 * Linking flow:
 * 1. User generates a code here (or starts the bot and sends /link)
 * 2. User sends /link <code> to the OpenEscrow Telegram bot
 * 3. Bot shows the user their numeric Telegram ID
 * 4. User enters BOTH the code AND Telegram ID here, clicks Verify
 * 5. API links the Telegram user ID to the wallet
 * 6. Bot receives a welcome notification automatically
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { telegramApi } from '@/lib/api-client';
import type { TelegramStatusResponse } from '@/lib/api-client';
import { telegramLinkSchema } from '@/lib/schemas';
import { getErrorMessage } from '@/lib/errors';
import { ErrorAlert } from '@/components/ErrorAlert';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { CopyButton } from '@/components/CopyButton';
import { formatDate } from '@/lib/format';

/**
 * Telegram linking page component.
 * Redirects unauthenticated users to home.
 *
 * @returns Telegram settings page JSX
 */
export default function TelegramSettingsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  // Current link status fetched on mount
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Generate code state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Link with code state
  const [linkCode, setLinkCode] = useState('');
  const [linkTelegramUserId, setLinkTelegramUserId] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);

  // Unlink state
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  // Fetch current link status on mount
  useEffect(() => {
    if (!isAuthenticated) return;

    async function fetchStatus() {
      setStatusLoading(true);
      try {
        const s = await telegramApi.getStatus();
        setStatus(s);
      } catch (err) {
        console.error('[TelegramSettingsPage] getStatus failed:', getErrorMessage(err));
        // Non-fatal — page still works without status
        setStatus({ linked: false, telegramUserId: null, linkedAt: null });
      } finally {
        setStatusLoading(false);
      }
    }

    void fetchStatus();
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  /**
   * Generates a new one-time code for Telegram linking from the web side.
   * The user must send this code to the bot via /link <code>.
   */
  async function handleGenerateCode() {
    setIsGenerating(true);
    setGenerateError(null);
    setGeneratedCode(null);
    setCodeExpiresAt(null);

    try {
      const { oneTimeCode, expiresAt } = await telegramApi.generateCode();
      setGeneratedCode(oneTimeCode);
      setCodeExpiresAt(expiresAt);
    } catch (err) {
      const message = getErrorMessage(err);
      console.error('[TelegramSettingsPage] generateCode failed:', { error: message });
      setGenerateError(message);
    } finally {
      setIsGenerating(false);
    }
  }

  /**
   * Verifies a code received from the Telegram bot and links the account.
   */
  async function handleLinkCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldError(null);
    setLinkError(null);
    setLinkSuccess(null);

    const result = telegramLinkSchema.safeParse({
      code: linkCode,
      telegramUserId: linkTelegramUserId,
    });
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    setIsLinking(true);
    try {
      await telegramApi.link(result.data.code, result.data.telegramUserId);
      const successMsg = `Telegram account linked! ID ${result.data.telegramUserId} is now connected. The bot will send you a confirmation.`;
      setLinkSuccess(successMsg);
      setLinkCode('');
      setLinkTelegramUserId('');
      // Refresh status to show the connected banner
      const newStatus = await telegramApi.getStatus();
      setStatus(newStatus);
    } catch (err) {
      const message = getErrorMessage(err);
      console.error('[TelegramSettingsPage] link failed:', { error: message });
      setLinkError(message);
    } finally {
      setIsLinking(false);
    }
  }

  /**
   * Removes the Telegram link for this wallet.
   */
  async function handleUnlink() {
    if (
      !window.confirm(
        "Are you sure? This will immediately revoke the bot's access to your account."
      )
    ) {
      return;
    }
    setIsUnlinking(true);
    setUnlinkError(null);

    try {
      await telegramApi.unlink();
      setLinkSuccess(null);
      setGeneratedCode(null);
      setCodeExpiresAt(null);
      setStatus({ linked: false, telegramUserId: null, linkedAt: null });
    } catch (err) {
      const message = getErrorMessage(err);
      console.error('[TelegramSettingsPage] unlink failed:', { error: message });
      setUnlinkError(message);
    } finally {
      setIsUnlinking(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Telegram Notifications</h1>
        <p className="mt-1 text-sm text-gray-500">
          Link your Telegram account to receive deal notifications and use the bot.
        </p>
      </div>

      {/* Link status banner */}
      {statusLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          <LoadingSpinner size="sm" />
          Checking connection status…
        </div>
      ) : status?.linked ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-emerald-500 text-xl">✅</span>
            <h2 className="font-semibold text-emerald-900">Telegram Connected</h2>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <dt className="text-emerald-700 font-medium w-28 shrink-0">Telegram ID:</dt>
              <dd className="flex items-center gap-1 font-mono text-emerald-900">
                {status.telegramUserId}
                {status.telegramUserId && (
                  <CopyButton
                    text={status.telegramUserId}
                    variant="icon"
                    className="text-emerald-400 hover:text-emerald-600 hover:bg-emerald-100"
                  />
                )}
              </dd>
            </div>
            {status.linkedAt && (
              <div className="flex gap-2">
                <dt className="text-emerald-700 font-medium w-28 shrink-0">Linked on:</dt>
                <dd className="text-emerald-900">{formatDate(status.linkedAt)}</dd>
              </div>
            )}
          </dl>
          <p className="text-xs text-emerald-600">
            The bot is active and will send you deal notifications.
          </p>
          <ErrorAlert message={unlinkError} onDismiss={() => setUnlinkError(null)} />
          <button
            type="button"
            onClick={() => {
              void handleUnlink();
            }}
            disabled={isUnlinking}
            className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {isUnlinking && <LoadingSpinner size="sm" />}
            Unlink Telegram Account
          </button>
        </div>
      ) : (
        <>
          {/* Success banner after linking */}
          {linkSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {linkSuccess}
            </div>
          )}

          {/* Section 1: Verify code from bot */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">Link via Bot Code</h2>
              <p className="mt-1 text-sm text-gray-500">
                Start the OpenEscrow bot on Telegram, send{' '}
                <code className="bg-gray-100 px-1 rounded">/link</code>, and paste the code you
                receive below along with your Telegram ID.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                void handleLinkCode(e);
              }}
              className="space-y-3"
            >
              <div>
                <label htmlFor="linkCode" className="block text-sm font-medium text-gray-700">
                  Code from Bot
                </label>
                <input
                  id="linkCode"
                  type="text"
                  value={linkCode}
                  onChange={(e) => setLinkCode(e.target.value)}
                  placeholder="Paste your linking code here"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  disabled={isLinking}
                />
              </div>

              <div>
                <label
                  htmlFor="linkTelegramUserId"
                  className="block text-sm font-medium text-gray-700"
                >
                  Your Telegram ID
                </label>
                <input
                  id="linkTelegramUserId"
                  type="text"
                  inputMode="numeric"
                  value={linkTelegramUserId}
                  onChange={(e) => setLinkTelegramUserId(e.target.value)}
                  placeholder="Numeric ID shown by the bot after /link"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  disabled={isLinking}
                />
                {fieldError && <p className="mt-1 text-xs text-red-600">{fieldError}</p>}
              </div>

              <ErrorAlert message={linkError} onDismiss={() => setLinkError(null)} />

              <button
                type="submit"
                disabled={isLinking || !linkCode.trim() || !linkTelegramUserId.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {isLinking && <LoadingSpinner size="sm" />}
                Verify &amp; Link
              </button>
            </form>
          </section>

          {/* Section 2: Generate code from web */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">Generate Code for Bot</h2>
              <p className="mt-1 text-sm text-gray-500">
                Generate a code here and send it to the bot using{' '}
                <code className="bg-gray-100 px-1 rounded">/link &lt;code&gt;</code>. Codes expire
                after 15 minutes.
              </p>
            </div>

            <ErrorAlert message={generateError} onDismiss={() => setGenerateError(null)} />

            {generatedCode && codeExpiresAt && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-indigo-400">
                  Your Linking Code
                </p>

                {/* Code — click to copy */}
                <CopyButton
                  text={generatedCode}
                  className="px-2 py-1"
                >
                  <span className="font-mono text-xl font-bold tracking-widest text-indigo-700">
                    {generatedCode}
                  </span>
                </CopyButton>

                <p className="text-xs text-indigo-500">Expires at: {formatDate(codeExpiresAt)}</p>

                {/* /link command — click to copy */}
                <div className="space-y-1">
                  <p className="text-xs text-indigo-600">Send this command to the bot:</p>
                  <CopyButton
                    text={`/link ${generatedCode}`}
                    className="px-2 py-1"
                  >
                    <code className="text-sm font-mono text-indigo-700">
                      /link {generatedCode}
                    </code>
                  </CopyButton>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                void handleGenerateCode();
              }}
              disabled={isGenerating}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-60"
            >
              {isGenerating && <LoadingSpinner size="sm" />}
              {generatedCode ? 'Regenerate Code' : 'Generate Code'}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
