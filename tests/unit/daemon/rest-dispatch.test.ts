import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchTool, type DispatchContext } from '../../../src/daemon/rest/dispatch.js';
import type { Subsystems } from '../../../src/server.js';

vi.mock('../../../src/tools/fetch.js', () => ({
  handleFetch: vi.fn(),
}));
vi.mock('../../../src/tools/search.js', () => ({
  handleSearch: vi.fn(),
}));
vi.mock('../../../src/watch/scheduler.js', () => ({
  scheduleOverdueCheck: vi.fn(),
}));

import { handleFetch } from '../../../src/tools/fetch.js';
import { handleSearch } from '../../../src/tools/search.js';
import { scheduleOverdueCheck } from '../../../src/watch/scheduler.js';

beforeEach(() => {
  vi.clearAllMocks();
});

function fakeCtx(): DispatchContext {
  return {
    subsystems: {
      searchEngines: [],
      router: {} as unknown,
      backendStatus: {} as unknown,
    } as unknown as Subsystems,
    bindIsLoopback: true,
  };
}

describe('dispatchTool — fetch', () => {
  it('success returns r.data as plain JSON (200)', async () => {
    vi.mocked(handleFetch).mockResolvedValue({ ok: true, data: { url: 'https://x.com', markdown: 'hi' } } as never);
    const r = await dispatchTool('fetch', { url: 'https://x.com' }, fakeCtx());
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ url: 'https://x.com', markdown: 'hi' });
  });

  it('failure maps via errors.ts status table (fetch upstream → 502)', async () => {
    vi.mocked(handleFetch).mockResolvedValue({
      ok: false, error: 'blocked', error_reason: 'blocked_by_challenge', stage: 'fetch',
    } as never);
    const r = await dispatchTool('fetch', { url: 'https://x.com' }, fakeCtx());
    expect(r.status).toBe(502);
    expect((r.body as { ok: boolean }).ok).toBe(false);
  });

  it('applies the serve-mode target guard before dispatch (non-loopback bind, loopback target → 400)', async () => {
    const ctx = fakeCtx();
    ctx.bindIsLoopback = false;
    const r = await dispatchTool('fetch', { url: 'http://127.0.0.1/' }, ctx);
    expect(r.status).toBe(400);
    expect(handleFetch).not.toHaveBeenCalled();
  });

  it('schedules the overdue watch check on a non-watch call', async () => {
    vi.mocked(handleFetch).mockResolvedValue({ ok: true, data: {} } as never);
    await dispatchTool('fetch', { url: 'https://x.com' }, fakeCtx());
    expect(scheduleOverdueCheck).toHaveBeenCalled();
  });
});

describe('dispatchTool — search', () => {
  it('success returns r.data as plain JSON (200)', async () => {
    vi.mocked(handleSearch).mockResolvedValue({ ok: true, data: { results: [], evidence_score: 1 } } as never);
    const r = await dispatchTool('search', { query: 'x' }, fakeCtx());
    expect(r.status).toBe(200);
    expect((r.body as { evidence_score: number }).evidence_score).toBe(1);
  });

  it('ok:true with data.error → mapped as failure (500)', async () => {
    vi.mocked(handleSearch).mockResolvedValue({ ok: true, data: { error: 'all engines failed' } } as never);
    const r = await dispatchTool('search', { query: 'x' }, fakeCtx());
    expect(r.status).toBe(500);
  });

  it('warning-only search result stays 200', async () => {
    vi.mocked(handleSearch).mockResolvedValue({ ok: true, data: { results: [], warning: 'degraded' } } as never);
    const r = await dispatchTool('search', { query: 'x' }, fakeCtx());
    expect(r.status).toBe(200);
  });
});

describe('dispatchTool — the 8 unimplemented tools', () => {
  for (const tool of ['crawl', 'cache', 'extract', 'find_similar', 'research', 'agent', 'diff', 'watch']) {
    it(`${tool} → 501 from the dispatch stage`, async () => {
      const r = await dispatchTool(tool, {}, fakeCtx());
      expect(r.status).toBe(501);
      expect((r.body as { error_reason: string }).error_reason).toBe('not_implemented');
    });
  }
});
