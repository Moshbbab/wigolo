import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const embedWarmup = vi.fn().mockResolvedValue(undefined);
const rerankWarmup = vi.fn().mockResolvedValue(undefined);
const getEmbedProvider = vi.fn().mockResolvedValue({
  modelId: 'mock-embed',
  dim: 384,
  embed: vi.fn().mockResolvedValue([]),
  warmup: embedWarmup,
});
const getRerankProvider = vi.fn().mockResolvedValue({
  modelId: 'mock-rerank',
  rerank: vi.fn().mockResolvedValue([]),
  warmup: rerankWarmup,
});

vi.mock('../../../src/providers/embed-provider.js', () => ({
  getEmbedProvider,
}));
vi.mock('../../../src/providers/rerank-provider.js', () => ({
  getRerankProvider,
}));

import {
  maybeEagerWarmup,
  isEagerWarmupEnabled,
  _getWarmupPendingForTest,
} from '../../../src/server/warmup-on-start.js';

describe('maybeEagerWarmup', () => {
  const originalEnv = process.env.WIGOLO_EAGER_WARMUP;

  beforeEach(() => {
    embedWarmup.mockClear().mockResolvedValue(undefined);
    rerankWarmup.mockClear().mockResolvedValue(undefined);
    getEmbedProvider.mockClear();
    getRerankProvider.mockClear();
  });

  afterEach(async () => {
    // Drain any in-flight warmup so it doesn't leak between tests.
    const p = _getWarmupPendingForTest();
    if (p) await p;
    if (originalEnv === undefined) {
      delete process.env.WIGOLO_EAGER_WARMUP;
    } else {
      process.env.WIGOLO_EAGER_WARMUP = originalEnv;
    }
  });

  it('is a no-op when WIGOLO_EAGER_WARMUP is unset', async () => {
    delete process.env.WIGOLO_EAGER_WARMUP;
    expect(isEagerWarmupEnabled()).toBe(false);

    maybeEagerWarmup();
    // Allow a microtask flush — nothing should have been scheduled.
    await Promise.resolve();
    await Promise.resolve();

    expect(getEmbedProvider).not.toHaveBeenCalled();
    expect(getRerankProvider).not.toHaveBeenCalled();
    expect(_getWarmupPendingForTest()).toBeNull();
  });

  it('warms both providers when WIGOLO_EAGER_WARMUP=1', async () => {
    process.env.WIGOLO_EAGER_WARMUP = '1';
    expect(isEagerWarmupEnabled()).toBe(true);

    maybeEagerWarmup();
    const pending = _getWarmupPendingForTest();
    expect(pending).not.toBeNull();
    await pending;

    expect(getEmbedProvider).toHaveBeenCalledTimes(1);
    expect(getRerankProvider).toHaveBeenCalledTimes(1);
    expect(embedWarmup).toHaveBeenCalledTimes(1);
    expect(rerankWarmup).toHaveBeenCalledTimes(1);
  });

  it('returns synchronously before warmup completes', async () => {
    process.env.WIGOLO_EAGER_WARMUP = '1';
    let resolveEmbed: (() => void) | null = null;
    embedWarmup.mockImplementationOnce(
      () => new Promise<void>((res) => { resolveEmbed = res; }),
    );

    const before = Date.now();
    maybeEagerWarmup();
    const elapsed = Date.now() - before;

    expect(elapsed).toBeLessThan(50);
    expect(_getWarmupPendingForTest()).not.toBeNull();

    // Drain microtasks so the warmEmbed body runs and calls embedWarmup.
    while (resolveEmbed === null) {
      await Promise.resolve();
    }
    (resolveEmbed as () => void)();
  });

  it('still attempts rerank when embed warmup throws', async () => {
    process.env.WIGOLO_EAGER_WARMUP = '1';
    embedWarmup.mockRejectedValueOnce(new Error('embed boom'));

    maybeEagerWarmup();
    await _getWarmupPendingForTest();

    expect(embedWarmup).toHaveBeenCalledTimes(1);
    expect(rerankWarmup).toHaveBeenCalledTimes(1);
  });

  it('does not throw when rerank warmup throws', async () => {
    process.env.WIGOLO_EAGER_WARMUP = '1';
    rerankWarmup.mockRejectedValueOnce(new Error('rerank boom'));

    expect(() => maybeEagerWarmup()).not.toThrow();
    await expect(_getWarmupPendingForTest()).resolves.toBeUndefined();
    expect(embedWarmup).toHaveBeenCalledTimes(1);
    expect(rerankWarmup).toHaveBeenCalledTimes(1);
  });

  it('clears the pending promise after warmup settles', async () => {
    process.env.WIGOLO_EAGER_WARMUP = '1';

    maybeEagerWarmup();
    const pending = _getWarmupPendingForTest();
    expect(pending).not.toBeNull();
    await pending;

    expect(_getWarmupPendingForTest()).toBeNull();
  });

  it('skips warmup invocation when provider exposes no warmup method', async () => {
    process.env.WIGOLO_EAGER_WARMUP = '1';
    getEmbedProvider.mockResolvedValueOnce({
      modelId: 'no-warmup',
      dim: 1,
      embed: vi.fn().mockResolvedValue([]),
    });

    maybeEagerWarmup();
    await _getWarmupPendingForTest();

    expect(getEmbedProvider).toHaveBeenCalledTimes(1);
    expect(embedWarmup).not.toHaveBeenCalled();
    expect(rerankWarmup).toHaveBeenCalledTimes(1);
  });
});
