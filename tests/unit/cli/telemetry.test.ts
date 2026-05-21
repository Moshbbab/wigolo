import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as nodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetConfig } from '../../../src/config.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, appendFileSync: vi.fn(actual.appendFileSync) };
});

const { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } = nodeFs;

const { emit, isTelemetryEnabled, configureRemote, _resetTelemetryForTest } = await import(
  '../../../src/cli/telemetry.js'
);

const ORIGINAL_ENV = process.env;

function withTmpDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wigolo-telemetry-'));
  process.env.WIGOLO_DATA_DIR = dir;
  resetConfig();
  return dir;
}

function todayFile(dir: string): string {
  const d = new Date();
  const stamp =
    `${d.getUTCFullYear().toString().padStart(4, '0')}` +
    `${(d.getUTCMonth() + 1).toString().padStart(2, '0')}` +
    `${d.getUTCDate().toString().padStart(2, '0')}`;
  return join(dir, 'telemetry', `events-${stamp}.ndjson`);
}

describe('telemetry', () => {
  let dataDir: string;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.WIGOLO_TELEMETRY;
    delete process.env.WIGOLO_TELEMETRY_ENDPOINT;
    dataDir = withTmpDataDir();
    _resetTelemetryForTest();
  });

  afterEach(() => {
    _resetTelemetryForTest();
    process.env = ORIGINAL_ENV;
    resetConfig();
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    vi.restoreAllMocks();
  });

  it('isTelemetryEnabled reflects WIGOLO_TELEMETRY env', () => {
    expect(isTelemetryEnabled()).toBe(false);
    process.env.WIGOLO_TELEMETRY = '1';
    expect(isTelemetryEnabled()).toBe(true);
    process.env.WIGOLO_TELEMETRY = '0';
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('emit is a no-op when telemetry is disabled — no file write, no fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    emit('search', { q: 'hello' });
    expect(existsSync(join(dataDir, 'telemetry'))).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('emit writes a single NDJSON line when enabled', () => {
    process.env.WIGOLO_TELEMETRY = '1';
    emit('search', { q: 'hello' });
    const path = todayFile(dataDir);
    expect(existsSync(path)).toBe(true);
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as { event: string; props?: { q: string } };
    expect(parsed.event).toBe('search');
    expect(parsed.props?.q).toBe('hello');
  });

  it('appends multiple events to the same daily file', () => {
    process.env.WIGOLO_TELEMETRY = '1';
    emit('a');
    emit('b', { x: 1 });
    emit('c');
    const lines = readFileSync(todayFile(dataDir), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    const events = lines.map(l => (JSON.parse(l) as { event: string }).event);
    expect(events).toEqual(['a', 'b', 'c']);
  });

  it('rotates filenames by UTC date', () => {
    process.env.WIGOLO_TELEMETRY = '1';
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
      emit('first');
      vi.setSystemTime(new Date('2026-04-02T01:00:00.000Z'));
      emit('second');
    } finally {
      vi.useRealTimers();
    }

    const files = readdirSync(join(dataDir, 'telemetry')).sort();
    expect(files).toEqual(['events-20260401.ndjson', 'events-20260402.ndjson']);
  });

  it('serializes complex props correctly', () => {
    process.env.WIGOLO_TELEMETRY = '1';
    emit('extract', { url: 'https://x.test', tags: ['a', 'b'], meta: { ok: true, n: 3 } });
    const line = readFileSync(todayFile(dataDir), 'utf8').trim();
    const parsed = JSON.parse(line) as {
      event: string;
      props: { url: string; tags: string[]; meta: { ok: boolean; n: number } };
    };
    expect(parsed.event).toBe('extract');
    expect(parsed.props.tags).toEqual(['a', 'b']);
    expect(parsed.props.meta).toEqual({ ok: true, n: 3 });
    expect(parsed.props.url).toBe('https://x.test');
  });

  it('configureRemote sets the endpoint and POSTs are issued', async () => {
    process.env.WIGOLO_TELEMETRY = '1';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    configureRemote('https://collect.test/events');
    emit('ping', { v: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://collect.test/events');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string) as { event: string; props: { v: number } };
    expect(body.event).toBe('ping');
    expect(body.props.v).toBe(1);
  });

  it('configureRemote(undefined) clears the endpoint — no POST after', () => {
    process.env.WIGOLO_TELEMETRY = '1';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    configureRemote('https://collect.test/events');
    configureRemote(undefined);
    emit('ping');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses WIGOLO_TELEMETRY_ENDPOINT env when configureRemote was not called', () => {
    process.env.WIGOLO_TELEMETRY = '1';
    process.env.WIGOLO_TELEMETRY_ENDPOINT = 'https://env.test/events';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    emit('env-ping');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://env.test/events');
  });

  it('POST failure does not throw', () => {
    process.env.WIGOLO_TELEMETRY = '1';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    configureRemote('https://collect.test/events');
    expect(() => emit('ping')).not.toThrow();
  });

  it('file write failure does not throw', () => {
    process.env.WIGOLO_TELEMETRY = '1';
    const mocked = vi.mocked(nodeFs.appendFileSync);
    mocked.mockImplementationOnce(() => { throw new Error('disk full'); });
    expect(() => emit('ping')).not.toThrow();
  });

  it('_resetTelemetryForTest clears the in-memory endpoint', () => {
    process.env.WIGOLO_TELEMETRY = '1';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    configureRemote('https://collect.test/events');
    _resetTelemetryForTest();
    emit('ping');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
