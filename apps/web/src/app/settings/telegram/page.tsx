/**
 * settings/telegram/page.tsx — OpenEscrow Web Dashboard
 *
 * Telegram linking settings page.
 * Handles: generating a one-time linking code (displayed to the user to send to the bot),
 *          and verifying an OTP received from the bot to link the Telegram account.
 * Does NOT: manage auth state, interact with the Telegram API directly,
 *            or perform any on-chain actions.
 *
 * Linking flow:
 * 1. User starts the OpenEscrow Telegram bot and sends /link
 * 2. Bot generates a code and tells the user to paste it here
 * 3. User pastes the code on this page, clicks Verify
 * 4. API links the Telegram user ID to the wallet
 *
 * Alternatively, user can generate a code here and send it to the bot.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { telegramApi } from '@/lib/api-client';
import { telegramLinkSchema } from '@/lib/schemas';
import { getErrorMessage } from '@/lib/errors';
import { ErrorAlert } from '@/components/ErrorAlert';
import { LoadingSpinner } from '@/components/LoadingSpinner';
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

  // Generate code state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Link with code state
  const [linkCode, setLinkCode] = useState('');
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
      const { code, expiresAt } = await telegramApi.generateCode();
      setGeneratedCode(code);
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

    const result = telegramLinkSchema.safeParse({ code: linkCode });
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? 'Invalid code format');
      return;
    }

    setIsLinking(true);
    try {
      const { telegramUserId } = await telegramApi.link(result.data.code);
      setLinkSuccess(
        `Telegram account linked! Your Telegram ID: ${telegramUserId}. The bot is now active for your wallet.`
      );
      setLinkCode('');
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
        'Are you sure? This will immediately revoke the bot\'s access to your account.'
      )
    ) {
      return;
    }
    setIsUnlinking(true);
    setUnlinkError(null);

    try {
      await telegramApi.unlink();
      setLinkSuccess(null);
      // Reset form state
      setGeneratedCode(null);
      setCodeExpiresAt(null);
      window.location.reload(); // Simplest way to reset page state
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

      {/* Success banner */}
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
            Start the OpenEscrow bot on Telegram, send <code className="bg-gray-100 px-1 rounded">/link</code>,
            and paste the code you receive below.
          </p>
        </div>

        <form onSubmit={(e) => { void handleLinkCode(e); }} className="space-y-3">
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
            {fieldError && <p className="mt-1 text-xs text-red-600">{fieldError}</p>}
          </div>

          <ErrorAlert message={linkError} onDismiss={() => setLinkError(null)} />

          <button
            type="submit"
            disabled={isLinking || !linkCode.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {isLinking && <LoadingSpinner size="sm" />}
            Verify & Link
          </button>
        </form>
      </section>

      {/* Section 2: Generate code from web */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Generate Code for Bot</h2>
          <p className="mt-1 text-sm text-gray-500">
            Generate a code here and send it to the bot using{' '}
            <code className="bg-gray-100 px-1 rounded">/link &lt;code&gt;</code>.
            Codes expire after 15 minutes.
          </p>
        </div>

        <ErrorAlert message={generateError} onDismiss={() => setGenerateError(null)} />

        {generatedCode && codeExpiresAt && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-400">
              Your Linking Code
            </p>
            <p className="font-mono text-xl font-bold tracking-widest text-indigo-700">
              {generatedCode}
            </p>
            <p className="text-xs text-indigo-500">
              Expires at: {formatDate(codeExpiresAt)}
            </p>
            <p className="text-xs text-indigo-600">
              Send this to the bot:{' '}
              <code className="bg-indigo-100 px-1 rounded">/link {generatedCode}</code>
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => { void handleGenerateCode(); }}
          disabled={isGenerating}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-60"
        >
          {isGenerating && <LoadingSpinner size="sm" />}
          {generatedCode ? 'Regenerate Code' : 'Generate Code'}
        </button>
      </section>

      {/* Section 3: Unlink */}
      <section className="rounded-xl border border-red-100 bg-white p-5 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-900">Remove Telegram Link</h2>
        <p className="text-sm text-gray-500">
          This will immediately revoke the bot&apos;s ability to send you notifications
          or take actions on your behalf.
        </p>

        <ErrorAlert message={unlinkError} onDismiss={() => setUnlinkError(null)} />

        <button
          type="button"
          onClick={() => { void handleUnlink(); }}
          disabled={isUnlinking}
          className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          {isUnlinking && <LoadingSpinner size="sm" />}
          Unlink Telegram Account
        </button>
      </section>
    </div>
  );
}
