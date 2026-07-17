import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { BrowserPool } from '../../../src/fetch/browser-pool.js';
import { resetConfig } from '../../../src/config.js';
import { startCorpusServer, type CorpusServer } from './spa-settle-corpus/server.js';
import { ARTICLE_MARKER, NAV_MARKER } from './spa-settle-corpus/fixtures.js';

// Wall-clock bounds: tight locally, generous on CI (loaded runners).
const SLACK_MS = process.env.CI ? 6000 : 1500;

let srv: CorpusServer;
let pool: BrowserPool;

beforeAll(async () => {
  srv = await startCorpusServer();
});
afterAll(async () => {
  await srv.close();
});
beforeEach(() => {
  process.env.PLAYWRIGHT_NAV_TIMEOUT_MS = '10000';
  process.env.PLAYWRIGHT_LOAD_TIMEOUT_MS = '5000';
  resetConfig();
  pool = new BrowserPool();
});
afterEach(async () => {
  await pool.shutdown();
});

describe('SPA settle corpus (real browser)', () => {
  it('captures article on fast delayed-mount SPA (300ms)', async () => {
    const r = await pool.fetchWithBrowser(`${srv.baseUrl}/delayed?ms=300`);
    expect(r.html).toContain(ARTICLE_MARKER);
  }, 30000);

  it('captures article on medium delayed-mount SPA (1500ms)', async () => {
    const r = await pool.fetchWithBrowser(`${srv.baseUrl}/delayed?ms=1500`);
    expect(r.html).toContain(ARTICLE_MARKER);
  }, 30000);

  // CURRENT BUG: with PLAYWRIGHT_NAV_TIMEOUT_MS=10000 the current hydration
  // budget is min(8000, max(1500, 10000/4)) = 2500ms — probe gives up at ~3s
  // while the article mounts at 5s. After settle.ts the 6s shared cap covers it.
  it.fails('captures article on slow delayed-mount SPA (5000ms) within budget', async () => {
    const r = await pool.fetchWithBrowser(`${srv.baseUrl}/delayed?ms=5000`);
    expect(r.html).toContain(ARTICLE_MARKER);
  }, 30000);

  it('returns bounded on nav-shell-forever (no hang)', async () => {
    const t0 = Date.now();
    const r = await pool.fetchWithBrowser(`${srv.baseUrl}/nav-shell`);
    const elapsed = Date.now() - t0;
    expect(r.html).toContain(NAV_MARKER); // best-available capture is fine…
    // …but the wait must be bounded: nav(≈0 local) + settle cap + slack.
    expect(elapsed).toBeLessThan(10000 + SLACK_MS);
  }, 30000);

  // CURRENT BUG (mode B): networkidle never fires → burns the full load timeout.
  // Current behavior is *bounded* by loadTimeoutMs but wastes it entirely; after
  // settle.ts, stability exits in ~1s. Tight bound expected to FAIL today.
  it.fails('never-networkidle page with instant article settles fast', async () => {
    const t0 = Date.now();
    const r = await pool.fetchWithBrowser(`${srv.baseUrl}/never-idle`);
    const elapsed = Date.now() - t0;
    expect(r.html).toContain(ARTICLE_MARKER);
    expect(elapsed).toBeLessThan(3500 + SLACK_MS);
  }, 30000);

  it('instant static page settles fast (latency regression guard)', async () => {
    const t0 = Date.now();
    const r = await pool.fetchWithBrowser(`${srv.baseUrl}/instant`);
    const elapsed = Date.now() - t0;
    expect(r.html).toContain(ARTICLE_MARKER);
    expect(elapsed).toBeLessThan(3500 + SLACK_MS);
  }, 30000);

  it('ticker page settles despite perpetual small mutations', async () => {
    const t0 = Date.now();
    const r = await pool.fetchWithBrowser(`${srv.baseUrl}/ticker`);
    expect(r.html).toContain(ARTICLE_MARKER);
    expect(Date.now() - t0).toBeLessThan(10000 + SLACK_MS);
  }, 30000);

  it('code-heavy docs page captures pre/code content', async () => {
    const r = await pool.fetchWithBrowser(`${srv.baseUrl}/code-docs`);
    expect(r.html).toContain(ARTICLE_MARKER);
  }, 30000);
});
