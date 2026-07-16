import type { Subsystems } from '../../server.js';
import type { SamplingCapableServer } from '../../search/sampling.js';
import type { FetchInput, SearchInput } from '../../types.js';
import { handleFetch } from '../../tools/fetch.js';
import { handleSearch } from '../../tools/search.js';
import { scheduleOverdueCheck } from '../../watch/scheduler.js';
import { guardServeTarget } from './target-guard.js';
import {
  errorEnvelope,
  notImplemented,
  statusForStageResult,
  statusForSearchData,
  invalidInput,
} from './errors.js';

export interface DispatchContext {
  subsystems: Subsystems;
  bindIsLoopback: boolean;
}

export interface DispatchResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/** Envelope a StageResult failure. */
function stageFailure(f: { error: string; error_reason: string; stage: string; hint?: string }): DispatchResult {
  return {
    status: statusForStageResult(f),
    body: errorEnvelope(f.error_reason, f.error, { stage: f.stage, hint: f.hint }),
  };
}

async function dispatchFetch(input: FetchInput, ctx: DispatchContext): Promise<DispatchResult> {
  const guard = guardServeTarget(String((input as { url?: unknown }).url ?? ''), {
    bindIsLoopback: ctx.bindIsLoopback,
  });
  if (!guard.ok) {
    return { status: 400, body: errorEnvelope(guard.code, guard.reason, { stage: 'validate', hint: guard.hint }) };
  }
  const r = await handleFetch(input, ctx.subsystems.router);
  if (!r.ok) return stageFailure(r);
  return { status: 200, body: r.data };
}

async function dispatchSearch(input: SearchInput, ctx: DispatchContext): Promise<DispatchResult> {
  const { searchEngines, router, backendStatus } = ctx.subsystems;
  // Serve mode carries no LLM sampling client; format:'answer' degrades to the
  // keyless ladder inside the handler.
  const r = await handleSearch(input, searchEngines, router, backendStatus, undefined as unknown as SamplingCapableServer);
  if (!r.ok) return stageFailure(r);
  const remap = statusForSearchData(r.data as { error?: unknown; warning?: unknown });
  if (remap !== null) {
    const data = r.data as { error?: string };
    return {
      status: remap,
      body: errorEnvelope('search_failed', typeof data.error === 'string' ? data.error : 'search failed', {
        stage: 'search',
      }),
    };
  }
  return { status: 200, body: r.data };
}

const IMPLEMENTED = new Set(['fetch', 'search']);

/**
 * Per-tool dispatch behind the full router check pipeline. T1 implements fetch
 * and search fully; the other 8 return a 501 from the dispatch stage (only
 * reachable after auth/limits/validate). T2 fills them.
 */
export async function dispatchTool(tool: string, input: unknown, ctx: DispatchContext): Promise<DispatchResult> {
  // Lazy watch-scheduler hook — same semantics as the MCP dispatch. Fires for
  // every non-watch call.
  if (tool !== 'watch') {
    scheduleOverdueCheck(ctx.subsystems.router);
  }

  const body = (input ?? {}) as Record<string, unknown>;

  switch (tool) {
    case 'fetch':
      return dispatchFetch(body as unknown as FetchInput, ctx);
    case 'search':
      return dispatchSearch(body as unknown as SearchInput, ctx);
    default:
      if (IMPLEMENTED.has(tool)) {
        return { status: 500, body: invalidInput(`dispatch not wired for ${tool}`).body };
      }
      return { status: 501, body: notImplemented(tool).body };
  }
}
