import { createLogger } from '../logger.js';

const log = createLogger('research');

export interface BranchOptions {
  maxConcurrent?: number;
  totalBudgetMs?: number;
  perQueryBudgetMs?: number;
}

export interface BranchResult<T> {
  query: string;
  ok: boolean;
  result?: T;
  error?: string;
  timedOut?: boolean;
}

const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_TOTAL_BUDGET_MS = 30_000;
const DEFAULT_PER_QUERY_BUDGET_MS = 10_000;

export async function exploreInParallel<T>(
  queries: string[],
  executor: (q: string, signal: AbortSignal) => Promise<T>,
  options: BranchOptions = {},
): Promise<BranchResult<T>[]> {
  if (queries.length === 0) return [];

  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const totalBudgetMs = options.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS;
  const perQueryBudgetMs = options.perQueryBudgetMs ?? DEFAULT_PER_QUERY_BUDGET_MS;

  const results: BranchResult<T>[] = new Array(queries.length);
  let totalExceeded = false;
  const inFlightControllers = new Set<AbortController>();

  const totalTimer = setTimeout(() => {
    totalExceeded = true;
    for (const c of inFlightControllers) c.abort();
  }, totalBudgetMs);

  try {
    for (let chunkStart = 0; chunkStart < queries.length; chunkStart += maxConcurrent) {
      const chunk: number[] = [];
      for (let j = chunkStart; j < Math.min(chunkStart + maxConcurrent, queries.length); j++) {
        chunk.push(j);
      }

      if (totalExceeded) {
        for (const idx of chunk) {
          results[idx] = {
            query: queries[idx],
            ok: false,
            error: 'total budget exceeded',
            timedOut: true,
          };
        }
        continue;
      }

      const settled = await Promise.allSettled(
        chunk.map((idx) =>
          runOne(queries[idx], executor, perQueryBudgetMs, inFlightControllers, () => totalExceeded),
        ),
      );
      for (let k = 0; k < chunk.length; k++) {
        const idx = chunk[k];
        const s = settled[k];
        if (s.status === 'fulfilled') {
          results[idx] = s.value;
        } else {
          results[idx] = {
            query: queries[idx],
            ok: false,
            error: errorMessage(s.reason),
          };
        }
      }
    }
  } finally {
    clearTimeout(totalTimer);
  }

  return results;
}

async function runOne<T>(
  query: string,
  executor: (q: string, signal: AbortSignal) => Promise<T>,
  perQueryBudgetMs: number,
  inFlight: Set<AbortController>,
  isTotalExceeded: () => boolean,
): Promise<BranchResult<T>> {
  const controller = new AbortController();
  inFlight.add(controller);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, perQueryBudgetMs);

  try {
    const result = await executor(query, controller.signal);
    return { query, ok: true, result };
  } catch (err) {
    if (isTotalExceeded()) {
      return {
        query,
        ok: false,
        error: 'total budget exceeded',
        timedOut: true,
      };
    }
    if (timedOut) {
      return {
        query,
        ok: false,
        error: `per-query budget ${perQueryBudgetMs}ms exceeded`,
        timedOut: true,
      };
    }
    log.debug('branch executor failed', { query, error: errorMessage(err) });
    return { query, ok: false, error: errorMessage(err) };
  } finally {
    clearTimeout(timer);
    inFlight.delete(controller);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
