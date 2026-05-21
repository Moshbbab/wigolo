import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exploreInParallel } from '../../../src/research/branch-exploration.js';

describe('exploreInParallel', () => {
  it('returns empty array for empty queries', async () => {
    const exec = vi.fn();
    const results = await exploreInParallel([], exec);
    expect(results).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });

  it('runs a single query successfully', async () => {
    const exec = vi.fn().mockResolvedValue('out');
    const results = await exploreInParallel(['q1'], exec);
    expect(results).toEqual([{ query: 'q1', ok: true, result: 'out' }]);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('runs all queries and returns results in input order', async () => {
    const exec = vi.fn(async (q: string) => `r:${q}`);
    const results = await exploreInParallel(['a', 'b', 'c'], exec);
    expect(results.map((r) => r.query)).toEqual(['a', 'b', 'c']);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results[0].result).toBe('r:a');
    expect(results[1].result).toBe('r:b');
    expect(results[2].result).toBe('r:c');
  });

  it('records thrown error for one query without failing siblings', async () => {
    const exec = vi.fn(async (q: string) => {
      if (q === 'b') throw new Error('boom');
      return `r:${q}`;
    });
    const results = await exploreInParallel(['a', 'b', 'c'], exec);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
    expect(results[1].error).toContain('boom');
    expect(results[2].ok).toBe(true);
  });

  describe('with fake timers', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('marks query as timedOut when per-query budget exceeded', async () => {
      const exec = vi.fn((_q: string, signal: AbortSignal) =>
        new Promise<string>((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      );
      const promise = exploreInParallel(['slow'], exec, { perQueryBudgetMs: 100 });
      await vi.advanceTimersByTimeAsync(150);
      const results = await promise;
      expect(results[0].ok).toBe(false);
      expect(results[0].timedOut).toBe(true);
    });

    it('propagates the abort signal to the executor on per-query timeout', async () => {
      const aborts: boolean[] = [];
      const exec = vi.fn((_q: string, signal: AbortSignal) =>
        new Promise<string>((_, reject) => {
          signal.addEventListener('abort', () => {
            aborts.push(true);
            reject(new Error('aborted'));
          });
        }),
      );
      const promise = exploreInParallel(['x'], exec, { perQueryBudgetMs: 50 });
      await vi.advanceTimersByTimeAsync(100);
      await promise;
      expect(aborts).toEqual([true]);
    });

    it('aborts remaining queries when total budget exceeded', async () => {
      // First chunk runs slowly; total budget cuts the second chunk before exec invoked
      let chunkOneStarted = 0;
      let chunkTwoCalled = 0;
      const exec = vi.fn((q: string, signal: AbortSignal) => {
        if (q === 'a' || q === 'b') {
          chunkOneStarted++;
          return new Promise<string>((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          });
        }
        chunkTwoCalled++;
        return Promise.resolve('done');
      });

      const promise = exploreInParallel(
        ['a', 'b', 'c', 'd'],
        exec,
        { maxConcurrent: 2, totalBudgetMs: 80, perQueryBudgetMs: 1000 },
      );
      await vi.advanceTimersByTimeAsync(200);
      const results = await promise;

      expect(chunkOneStarted).toBe(2);
      expect(chunkTwoCalled).toBe(0);
      expect(results[2].ok).toBe(false);
      expect(results[2].timedOut).toBe(true);
      expect(results[2].error).toMatch(/total budget/);
      expect(results[3].ok).toBe(false);
      expect(results[3].timedOut).toBe(true);
    });

    it('runs queries chunked by maxConcurrent', async () => {
      let concurrent = 0;
      let maxObserved = 0;
      const exec = vi.fn(async () => {
        concurrent++;
        maxObserved = Math.max(maxObserved, concurrent);
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        concurrent--;
        return 'ok';
      });

      const promise = exploreInParallel(['a', 'b', 'c', 'd', 'e'], exec, {
        maxConcurrent: 2,
        perQueryBudgetMs: 5000,
        totalBudgetMs: 60_000,
      });
      // Advance enough time for all 3 chunks (2+2+1) at 50ms each => 150ms.
      await vi.advanceTimersByTimeAsync(500);
      const results = await promise;

      expect(maxObserved).toBeLessThanOrEqual(2);
      expect(results.length).toBe(5);
      expect(results.every((r) => r.ok)).toBe(true);
    });
  });

  it('uses default options when none provided', async () => {
    const exec = vi.fn(async (q: string) => `r:${q}`);
    const results = await exploreInParallel(['x', 'y'], exec);
    expect(results.length).toBe(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});
