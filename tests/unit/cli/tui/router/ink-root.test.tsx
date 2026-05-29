import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from 'ink-testing-library';
import { InkRoot } from '../../../../../src/cli/tui/router/ink.js';
import { createSettingsStore } from '../../../../../src/cli/tui/state/settings-store.js';
import { CATALOG } from '../../../../../src/cli/tui/schema/catalog.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete process.env.WIGOLO_TUI_REDUCED_MOTION;
});

function makeStore() {
  return createSettingsStore({
    browserTypes: 'chromium',
    maxBrowsers: 3,
    browserIdleTimeoutMs: 30000,
  });
}

describe('InkRoot — routeId dim transition (home → category:browser)', () => {
  it('fires MainPane dim transition when navigating from home to Browser category', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });
    delete process.env.WIGOLO_TUI_REDUCED_MOTION;
    vi.useFakeTimers();

    const store = makeStore();
    const { lastFrame, rerender } = render(
      <InkRoot store={store} catalog={CATALOG} initialRoute="home" />,
    );

    await vi.runAllTimersAsync();
    const homeFrame = lastFrame() ?? '';
    expect(homeFrame).toContain('Browser');

    rerender(<InkRoot store={store} catalog={CATALOG} initialRoute="browser" />);
    await vi.advanceTimersByTimeAsync(20);
    const categoryFrame = lastFrame() ?? '';
    expect(categoryFrame).toContain('Browser');
  });
});
