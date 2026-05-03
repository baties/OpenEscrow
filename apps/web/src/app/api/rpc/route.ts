/**
 * api/rpc/route.ts — OpenEscrow Web Dashboard
 *
 * Handles: Server-side proxy for Ethereum JSON-RPC requests.
 *          Forwards browser RPC calls to the configured RPC_URL env var, eliminating
 *          browser CORS restrictions on public RPC endpoints (e.g. rpc.sepolia.org).
 * Does NOT: validate or transform the JSON-RPC payload, authenticate callers,
 *            cache responses, or handle WebSocket connections.
 *
 * Why a proxy: public Ethereum RPC endpoints do not set Access-Control-Allow-Origin,
 * so browsers block direct fetch() calls from frontend origins (including localhost).
 * This route receives the request on the same origin and forwards it server-side,
 * where CORS does not apply.
 *
 * Usage: set NEXT_PUBLIC_RPC_URL=<this-server-url>/api/rpc at build time so wagmi
 * routes its HTTP transport through here instead of calling the RPC endpoint directly.
 * Set RPC_URL=<actual-rpc-endpoint> as a server-side environment variable.
 */

import { type NextRequest, NextResponse } from 'next/server';

/** Actual RPC endpoint — server-side only, never exposed to the browser. */
const RPC_URL = process.env.RPC_URL;

/**
 * Proxies a JSON-RPC POST request to the configured upstream RPC endpoint.
 * Called by wagmi/viem via the NEXT_PUBLIC_RPC_URL=.../api/rpc configuration.
 *
 * @param request - Incoming Next.js request containing the JSON-RPC payload
 * @returns JSON-RPC response from the upstream endpoint, or a 502 on failure
 * @throws Never — all errors are returned as 502 JSON responses
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!RPC_URL) {
    return NextResponse.json({ error: 'RPC_URL not configured on server' }, { status: 502 });
  }

  try {
    const body = await request.text();
    const upstream = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000), // 10 s — matches CLAUDE.md external call rule
    });

    const data = await upstream.text();
    return new NextResponse(data, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `RPC proxy error: ${message}` }, { status: 502 });
  }
}
