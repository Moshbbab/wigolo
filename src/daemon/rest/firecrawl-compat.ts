import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Subsystems } from '../../server.js';

/**
 * Firecrawl-compatibility shim. STUB — S-P2-SHIM (T4) fills the route mappings
 * and in-memory job store. The signature is pinned here so the router's literal
 * `await import('./firecrawl-compat.js')` typechecks after T1. The shim is
 * flag-gated (`WIGOLO_FIRECRAWL_COMPAT=1`); when off the router never routes
 * here, and this stub returns a 404 as a defensive default.
 */

export interface CompatContext {
  subsystems: Subsystems;
  bindIsLoopback: boolean;
  /** Path after the `/compat/firecrawl` prefix, e.g. `/v1/scrape`. */
  subPath: string;
  respond: (status: number, body: unknown, headers?: Record<string, string>) => void;
}

/**
 * Handle a `/compat/firecrawl/*` request. Returns true when the request was
 * handled (response written), false when the shim does not own this route.
 * Stub: always 404s (flag-off default), returns true.
 */
export async function handleCompatRequest(
  _req: IncomingMessage,
  _res: ServerResponse,
  ctx: CompatContext,
): Promise<boolean> {
  ctx.respond(404, {
    ok: false,
    error: 'The Firecrawl-compat shim is not implemented',
    error_reason: 'not_implemented',
  });
  return true;
}
