'use client';

/**
 * help/page.tsx — OpenEscrow Web Dashboard
 *
 * Static help and documentation page for the OpenEscrow product.
 * Handles: displaying role-specific guides (Client and Freelancer flows),
 *          explaining the deal lifecycle, milestone lifecycle, FAQ, and Telegram bot usage.
 * Does NOT: fetch any data, manage auth state, or perform any API calls.
 */

import Link from 'next/link';
import { config } from '@/lib/config';

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'What tokens are supported?',
    answer: `OpenEscrow supports USDC and USDT on ${config.chainMeta.name}. These are the only accepted stablecoins. No native tokens or other ERC-20s are accepted.`,
  },
  {
    question: 'What happens if there is a dispute?',
    answer:
      'OpenEscrow uses a structured approve/reject + revision loop. The client can reject a milestone with specific reasons, and the freelancer revises and resubmits. There is no third-party arbitration.',
  },
  {
    question: 'Can I cancel a deal after funding?',
    answer:
      'Yes. Either party can cancel. If cancelled before funding (DRAFT or AGREED status), there is nothing to refund. If cancelled after funding, all unreleased milestone amounts are returned to the client. Released milestones are irreversible.',
  },
  {
    question: 'What network is this on?',
    answer: config.chainMeta.isTestnet
      ? `This deployment runs on ${config.chainMeta.name} (testnet). Do not use real funds. Mainnet deployment requires a professional security audit.`
      : `This deployment runs on ${config.chainMeta.name}. All transactions use real funds — verify deal terms carefully before funding.`,
  },
  {
    question: 'How does the Telegram bot work?',
    answer:
      'The bot sends you real-time deal notifications (new milestones, approvals, rejections). Connect it via Settings → Telegram. Generate a code there and send it to the bot with /link <code>.',
  },
  {
    question: 'What does it cost?',
    answer: `The smart contract charges no platform fee. You only pay ${config.chainMeta.name} gas fees for on-chain transactions (deposit, milestone approval, cancel).`,
  },
];

interface StepProps {
  n: number;
  text: string;
}

/**
 * Renders a single numbered step in a workflow list.
 *
 * @param props - Step number and description text
 * @returns A styled step row
 */
function Step(props: StepProps) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
        {props.n}
      </div>
      <p className="pt-0.5 text-sm text-gray-700">{props.text}</p>
    </div>
  );
}

/**
 * Help page component.
 * Static content — no data fetching or auth dependency.
 *
 * @returns Help page JSX
 */
export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 py-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Help &amp; Documentation</h1>
        <p className="mt-2 text-gray-500">
          Everything you need to know about using OpenEscrow for milestone-based freelance work.
        </p>
      </div>

      {/* What is OpenEscrow */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">What is OpenEscrow?</h2>
        <p className="mt-3 text-sm text-gray-600 leading-relaxed">
          OpenEscrow is an open-source, milestone-based escrow platform for freelancers and Web3
          projects. Clients lock USDC or USDT in a smart contract and release funds as the
          freelancer completes each milestone. No trust required — the smart contract enforces the
          rules.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-gray-600">
          <li className="flex gap-2">
            <span className="font-bold text-indigo-500">→</span>
            Funds are locked on-chain before work begins.
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-indigo-500">→</span>
            Each milestone has clear acceptance criteria agreed upfront.
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-indigo-500">→</span>
            The client approves or rejects each deliverable with structured feedback.
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-indigo-500">→</span>
            Funds release automatically on approval — no manual transfers.
          </li>
        </ul>
      </section>

      {/* Client Guide */}
      <section className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            🧑‍💼
          </span>
          <h2 className="text-xl font-semibold text-gray-900">Client Guide</h2>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          You are the <strong>client</strong> if you are hiring a freelancer and paying for work.
        </p>
        <div className="mt-5 space-y-3">
          <Step
            n={1}
            text="Connect your wallet (MetaMask or any EVM wallet) and sign in with Ethereum."
          />
          <Step
            n={2}
            text={`Click New Deal and fill in the freelancer's wallet address, the payment token (USDC or USDT on ${config.chainMeta.name}), and define milestones — each with a title, description, acceptance criteria, and amount.`}
          />
          <Step
            n={3}
            text="The freelancer receives a notification and reviews the deal. They must click Agree before work can start."
          />
          <Step
            n={4}
            text="Once the freelancer agrees, go to the deal page and click Fund Deal. Approve the token transfer in your wallet. Funds are now locked in the smart contract."
          />
          <Step
            n={5}
            text="The freelancer works and submits each milestone with a summary and delivery links."
          />
          <Step
            n={6}
            text="Review the submission. If it meets the acceptance criteria, click Approve — funds release automatically to the freelancer. If not, click Reject and choose structured reasons plus optional feedback."
          />
          <Step
            n={7}
            text="After all milestones are approved, the deal is automatically marked Complete."
          />
        </div>
        {config.chainMeta.isTestnet && (
          <div className="mt-5 rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            <strong>Testnet note:</strong> This deployment uses {config.chainMeta.name}. All tokens
            are test tokens with no real value.
          </div>
        )}
        <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
          <strong>Tip:</strong> Define acceptance criteria clearly before funding. Vague criteria
          lead to revision loops. The criteria you set are binding — the freelancer can rely on
          them.
        </div>
      </section>

      {/* Freelancer Guide */}
      <section className="rounded-xl border border-emerald-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            👩‍💻
          </span>
          <h2 className="text-xl font-semibold text-gray-900">Freelancer Guide</h2>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          You are the <strong>freelancer</strong> if a client created a deal with your wallet
          address.
        </p>
        <div className="mt-5 space-y-3">
          <Step
            n={1}
            text="Connect the wallet address that the client used when creating the deal. Sign in with Ethereum."
          />
          <Step
            n={2}
            text="Go to My Deals. You will see the deal in DRAFT status. Review the milestones and acceptance criteria carefully."
          />
          <Step
            n={3}
            text="If you agree to the terms, click Agree to Deal. This confirms the scope and allows the client to fund."
          />
          <Step
            n={4}
            text="Wait for the client to fund the deal. You will see the status change to FUNDED. This means the money is locked and will be released when you complete milestones."
          />
          <Step
            n={5}
            text="For each milestone, complete the work then click Submit Milestone. Add a summary of what you delivered and relevant links (GitHub, Figma, etc.)."
          />
          <Step
            n={6}
            text="The client reviews your submission. If approved, the funds for that milestone are released to your wallet. If rejected, you receive structured feedback and the milestone moves to REVISION status."
          />
          <Step
            n={7}
            text="After revision, resubmit the milestone. There is no limit on revision rounds — but the client must have legitimate grounds for rejection per the agreed criteria."
          />
        </div>
        <div className="mt-5 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          <strong>Tip:</strong> Connect the Telegram bot (Settings → Telegram) to get instant
          notifications when the client approves, rejects, or funds the deal.
        </div>
      </section>

      {/* Deal Lifecycle */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Deal Lifecycle</h2>
        <p className="mt-2 text-sm text-gray-500">
          Every deal moves through these stages from creation to completion.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Meaning</th>
                <th className="pb-2">Who acts next</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium text-gray-700">
                    DRAFT
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-600">
                  Client created the deal with milestones. Awaiting freelancer agreement.
                </td>
                <td className="py-2 text-gray-500">Freelancer</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-mono text-xs font-medium text-indigo-700">
                    AGREED
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-600">
                  Freelancer confirmed milestones and acceptance criteria. Client may now fund.
                </td>
                <td className="py-2 text-gray-500">Client</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-xs font-medium text-blue-700">
                    FUNDED
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-600">
                  Client deposited funds into the smart contract. Work can now begin.
                </td>
                <td className="py-2 text-gray-500">Freelancer</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-xs font-medium text-amber-700">
                    (milestone cycle)
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-600">
                  Each milestone moves through its own lifecycle: PENDING → SUBMITTED → APPROVED /
                  REJECTED → REVISION. See Milestone Lifecycle below.
                </td>
                <td className="py-2 text-gray-500">Both parties</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-xs font-medium text-emerald-700">
                    COMPLETED
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-600">
                  All milestones approved. Set automatically by the system. Deal is finished.
                </td>
                <td className="py-2 text-gray-500">—</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-red-100 px-2 py-0.5 font-mono text-xs font-medium text-red-700">
                    CANCELLED
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-600">
                  Deal cancelled by either party. Refund rules: DRAFT/AGREED cancel = no refund
                  (funds not yet deposited). FUNDED cancel = all unreleased amounts returned to
                  client. Released milestones are irreversible.
                </td>
                <td className="py-2 text-gray-500">Either party</td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* State flow diagram */}
        <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-4 text-xs font-mono text-gray-500 overflow-x-auto whitespace-nowrap">
          DRAFT → AGREED → FUNDED → [milestone cycle] → COMPLETED
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↓
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;CANCELLED
          (from any stage before COMPLETED)
        </div>
      </section>

      {/* Milestone Lifecycle */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Milestone Lifecycle</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Meaning</th>
                <th className="pb-2">Who acts next</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium text-gray-700">
                    PENDING
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-600">
                  Waiting for freelancer to submit deliverables
                </td>
                <td className="py-2 text-gray-500">Freelancer</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium text-gray-700">
                    SUBMITTED
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-600">
                  Freelancer submitted — awaiting client review
                </td>
                <td className="py-2 text-gray-500">Client</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium text-gray-700">
                    APPROVED
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-600">
                  Client approved — funds released on-chain
                </td>
                <td className="py-2 text-gray-500">—</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium text-gray-700">
                    REJECTED
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-600">Client rejected with reasons</td>
                <td className="py-2 text-gray-500">System (auto → REVISION)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium text-gray-700">
                    REVISION
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-600">Freelancer revising after rejection</td>
                <td className="py-2 text-gray-500">Freelancer</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Telegram Bot */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            📱
          </span>
          <h2 className="text-xl font-semibold text-gray-900">Telegram Bot</h2>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          The OpenEscrow Telegram bot sends you real-time notifications for deal activity and lets
          you take quick actions without opening the web dashboard.
        </p>
        <div className="mt-4 text-sm text-gray-600">
          <p className="font-medium text-gray-800">Linking your account:</p>
          <ol className="mt-2 list-decimal list-inside space-y-1.5">
            <li>
              Go to{' '}
              <Link
                href="/settings/telegram"
                className="text-indigo-600 underline hover:text-indigo-700"
              >
                Settings → Telegram
              </Link>{' '}
              and click <strong>Generate Code</strong>.
            </li>
            <li>
              Start the OpenEscrow bot on Telegram and send{' '}
              <code className="rounded bg-gray-100 px-1">/link &lt;your-code&gt;</code>.
            </li>
            <li>
              The bot shows your numeric Telegram ID. Enter both the code and your Telegram ID back
              in the settings page and click <strong>Verify &amp; Link</strong>.
            </li>
          </ol>
        </div>
        <div className="mt-4 space-y-1.5 text-sm">
          <p className="font-medium text-gray-800">Bot commands:</p>
          <div className="mt-2 space-y-1.5 font-mono text-xs">
            <div className="flex gap-3">
              <span className="w-36 shrink-0 rounded bg-gray-100 px-2 py-0.5 text-indigo-700">
                /start
              </span>
              <span className="font-sans text-gray-600">Introduction and link instructions</span>
            </div>
            <div className="flex gap-3">
              <span className="w-36 shrink-0 rounded bg-gray-100 px-2 py-0.5 text-indigo-700">
                /link &lt;code&gt;
              </span>
              <span className="font-sans text-gray-600">Begin account linking flow</span>
            </div>
            <div className="flex gap-3">
              <span className="w-36 shrink-0 rounded bg-gray-100 px-2 py-0.5 text-indigo-700">
                /deals
              </span>
              <span className="font-sans text-gray-600">List your active deals</span>
            </div>
            <div className="flex gap-3">
              <span className="w-36 shrink-0 rounded bg-gray-100 px-2 py-0.5 text-indigo-700">
                /status &lt;dealId&gt;
              </span>
              <span className="font-sans text-gray-600">Check deal details and milestones</span>
            </div>
          </div>
        </div>
      </section>

      {/* Chat Room */}
      <section className="rounded-xl border border-purple-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            💬
          </span>
          <h2 className="text-xl font-semibold text-gray-900">Deal Chat Room</h2>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          Every deal has a private, persistent chat room for the client and freelancer to
          communicate. Messages are routed through the Telegram bot as a privacy relay — neither
          party&apos;s Telegram ID is ever revealed to the other.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="font-medium text-sm text-gray-800">On the web dashboard</p>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
              <li className="flex gap-2">
                <span className="text-purple-500 font-bold">→</span>
                Open any deal and scroll to the <strong>Chat</strong> panel at the bottom.
              </li>
              <li className="flex gap-2">
                <span className="text-purple-500 font-bold">→</span>
                The panel is read-only — use the Telegram bot to send messages.
              </li>
              <li className="flex gap-2">
                <span className="text-purple-500 font-bold">→</span>
                Click <strong>Load older messages</strong> to see the full history.
              </li>
              <li className="flex gap-2">
                <span className="text-purple-500 font-bold">→</span>
                Messages show role icons: 🧑‍💼 Client / 🛠️ Freelancer.
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="font-medium text-sm text-gray-800">Via Telegram bot</p>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
              <li className="flex gap-2">
                <span className="text-purple-500 font-bold">→</span>
                Tap the <strong>💬 Chat</strong> button on any deal status or notification.
              </li>
              <li className="flex gap-2">
                <span className="text-purple-500 font-bold">→</span>
                Type a message to send it to your counterparty via the relay.
              </li>
              <li className="flex gap-2">
                <span className="text-purple-500 font-bold">→</span>
                Press <strong>🚪 Exit Chat Room</strong> (keyboard button) to leave.
              </li>
              <li className="flex gap-2">
                <span className="text-purple-500 font-bold">→</span>
                You must have the Telegram bot linked to use this feature.
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-purple-50 border border-purple-200 p-4 text-sm text-purple-800">
          <strong>Privacy note:</strong> Your counterparty never sees your wallet address or
          Telegram user ID. The platform uses display usernames to identify participants. All
          messages are stored on the server for the deal record.
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-gray-900">Frequently Asked Questions</h2>
        {FAQ_ITEMS.map(function (item) {
          return (
            <details
              key={item.question}
              className="group rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-medium text-gray-900 marker:content-none hover:bg-gray-50">
                {item.question}
                <span className="ml-3 shrink-0 text-gray-400 transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <p className="border-t border-gray-100 px-5 py-4 text-sm leading-relaxed text-gray-600">
                {item.answer}
              </p>
            </details>
          );
        })}
      </section>

      {/* Footer CTA */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-6 text-center">
        <p className="text-sm text-indigo-700">
          Ready to get started?{' '}
          <Link href="/" className="font-semibold underline hover:text-indigo-900">
            Connect your wallet
          </Link>{' '}
          or{' '}
          <Link href="/deals/new" className="font-semibold underline hover:text-indigo-900">
            create your first deal
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
