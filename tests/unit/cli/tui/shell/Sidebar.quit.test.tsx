/**
 * v0.1.29 hotfix: Sidebar EXIT group + Quit row tests.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from 'ink-testing-library';
import { Sidebar } from '../../../../../src/cli/tui/shell/Sidebar.js';
import { DEFAULT_ROUTES } from '../../../../../src/cli/tui/shell/App.js';

afterEach(() => {
  cleanup();
});

const ARROW_DOWN = '\x1b[B';
const ENTER = '\r';

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('Sidebar EXIT group', () => {
  it('DEFAULT_ROUTES includes a quit entry in the exit group', () => {
    const quitRoute = DEFAULT_ROUTES.find((r) => r.id === 'quit');
    expect(quitRoute).toBeDefined();
    expect(quitRoute?.group).toBe('exit');
    expect(quitRoute?.label).toBe('Quit');
  });

  it('renders EXIT group label and Quit row', () => {
    const { lastFrame } = render(
      <Sidebar
        routes={DEFAULT_ROUTES}
        activeRoute="browser"
        dirtyByCategory={{}}
        onSelect={() => {}}
        focused={false}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('EXIT');
    expect(frame).toContain('Quit');
  });

  it('renders a divider before EXIT group', () => {
    const { lastFrame } = render(
      <Sidebar
        routes={DEFAULT_ROUTES}
        activeRoute="browser"
        dirtyByCategory={{}}
        onSelect={() => {}}
        focused={false}
      />,
    );
    // We have two dividers: SETTINGS→ACTIONS and ACTIONS→EXIT
    const frame = lastFrame() ?? '';
    const dividerCount = (frame.match(/─/g) ?? []).length;
    // At minimum two divider lines (each has multiple ─ chars)
    expect(dividerCount).toBeGreaterThan(20);
  });

  it('navigating down past Uninstall to Quit and pressing Enter calls onSelect with "quit"', async () => {
    const onSelect = vi.fn();
    const { stdin } = render(
      <Sidebar
        routes={DEFAULT_ROUTES}
        activeRoute="browser"
        dirtyByCategory={{}}
        onSelect={onSelect}
        focused={true}
      />,
    );
    await wait(20);
    // DEFAULT_ROUTES: 6 settings + 5 actions + 1 quit = 12 routes
    // Navigate past all 11 rows to reach Quit (index 11)
    for (let i = 0; i < 11; i++) {
      stdin.write(ARROW_DOWN);
      await wait(15);
    }
    stdin.write(ENTER);
    await wait(20);
    expect(onSelect).toHaveBeenCalledWith('quit');
  });

  it('cursor stops at Quit (last row) on further down-arrow', async () => {
    const { stdin, lastFrame } = render(
      <Sidebar
        routes={DEFAULT_ROUTES}
        activeRoute="browser"
        dirtyByCategory={{}}
        onSelect={() => {}}
        focused={true}
      />,
    );
    await wait(20);
    // Navigate to last row (Quit = index 11)
    for (let i = 0; i < 12; i++) {
      stdin.write(ARROW_DOWN);
      await wait(15);
    }
    const frame = lastFrame() ?? '';
    const lines = frame.split('\n');
    const focusedLine = lines.find((l) => l.includes('▸')) ?? '';
    expect(focusedLine).toContain('Quit');
  });
});
