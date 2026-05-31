/**
 * v0.1.29 hotfix: Wizard Enter conflict + Quit affordance tests.
 *
 * Bug 1: In wizard step 3, pressing Enter on a focused field (e.g. API key)
 * was advancing the wizard step instead of starting field-edit, because a
 * global useInput grabbed Enter first. Fix: replace global Enter with a
 * focusable "Continue" row that the user must navigate to explicitly.
 *
 * Bug 2: No visible Quit affordance in wizard. Fix: add a focusable Quit
 * row to every wizard step.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from 'ink-testing-library';
import { WizardSteps } from '../../../../../src/cli/tui/components/WizardSteps.js';
import { CategoryScreen } from '../../../../../src/cli/tui/components/CategoryScreen.js';
import { createSettingsStore } from '../../../../../src/cli/tui/state/settings-store.js';
import { CATALOG } from '../../../../../src/cli/tui/schema/catalog.js';
import { llmCategory } from '../../../../../src/cli/tui/schema/llm.js';

vi.mock('../../../../../src/cli/tui/actions/write-config.js', () => ({
  persistKey: vi.fn().mockResolvedValue(undefined),
  writeMcpConfig: vi.fn().mockResolvedValue({ results: [], anyFailed: false }),
}));

afterEach(() => {
  cleanup();
});

const ENTER = '\r';
const ESC = '\x1b';
const ARROW_DOWN = '\x1b[B';
const ARROW_UP = '\x1b[A';

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function silentSystemCheck() {
  return Promise.resolve({
    node: { ok: true, version: '20.0.0' },
    python: { ok: true, version: '3.11.0', binary: 'python3' as const },
    docker: { ok: false },
    disk: { ok: true, freeMb: 12345 },
    hardFailure: false,
  });
}

function makeStore() {
  return createSettingsStore({});
}

// Helper: advance to step 3 (LLM)
async function advanceToStep3(stdin: { write: (s: string) => void }) {
  // Welcome → System
  stdin.write(ENTER);
  await wait(40);
  // Wait for system check
  await wait(80);
  // System → LLM (step 2's Enter advances when result is ready)
  stdin.write(ENTER);
  await wait(60);
}

// Helper: advance to step 4 (Agents) via Continue row
async function advanceToStep4ViaContine(stdin: { write: (s: string) => void }, fieldCount: number) {
  // Navigate past all fields to Continue row (fieldCount fields + 1 Continue)
  for (let i = 0; i < fieldCount; i++) {
    stdin.write(ARROW_DOWN);
    await wait(25);
  }
  // Now on Continue row — press Enter to advance
  stdin.write(ENTER);
  await wait(60);
}

describe('WizardSteps — Bug 1: Enter on field does NOT advance wizard', () => {
  it('step 3: Enter on the API key field (masked) starts edit mode, not advance', async () => {
    const onDone = vi.fn();
    const { stdin, lastFrame } = render(
      <WizardSteps
        store={makeStore()}
        catalog={CATALOG}
        configPath="/tmp/config.json"
        onDone={onDone}
        onSkip={() => {}}
        runSystemCheckImpl={silentSystemCheck}
      />,
    );
    await wait(30);
    await advanceToStep3(stdin);

    const beforeFrame = lastFrame() ?? '';
    expect(beforeFrame).toContain('Step 3 / 4');

    // LLM has 2 fields: Provider (index 0, select) and API key (index 1, masked).
    // Move focus down to the API key field.
    stdin.write(ARROW_DOWN);
    await wait(40);

    // Press Enter — should start edit mode on masked field, NOT advance to step 4.
    stdin.write(ENTER);
    await wait(60);

    const afterFrame = lastFrame() ?? '';
    // Step must still be 3 — not advanced.
    expect(afterFrame).toContain('Step 3 / 4');
    expect(afterFrame).not.toContain('Step 4 / 4');
    // onDone must not have been called.
    expect(onDone).not.toHaveBeenCalled();
  });

  it('step 3: Continue row is present and labeled "Continue"', async () => {
    const { stdin, lastFrame } = render(
      <WizardSteps
        store={makeStore()}
        catalog={CATALOG}
        configPath="/tmp/config.json"
        onDone={() => {}}
        onSkip={() => {}}
        runSystemCheckImpl={silentSystemCheck}
      />,
    );
    await wait(30);
    await advanceToStep3(stdin);
    await wait(30);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Continue');
  });

  it('step 4: Continue row is labeled "Finish"', async () => {
    const { stdin, lastFrame } = render(
      <WizardSteps
        store={makeStore()}
        catalog={CATALOG}
        configPath="/tmp/config.json"
        onDone={() => {}}
        onSkip={() => {}}
        runSystemCheckImpl={silentSystemCheck}
      />,
    );
    await wait(30);
    await advanceToStep3(stdin);
    await wait(30);

    // LLM category has 2 fields (Provider, API key). Navigate past both + Continue row.
    await advanceToStep4ViaContine(stdin, 2);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Step 4 / 4');
    expect(frame).toContain('Finish');
  });

  it('step 3: arrow-down past last field lands on Continue row', async () => {
    const { stdin, lastFrame } = render(
      <WizardSteps
        store={makeStore()}
        catalog={CATALOG}
        configPath="/tmp/config.json"
        onDone={() => {}}
        onSkip={() => {}}
        runSystemCheckImpl={silentSystemCheck}
      />,
    );
    await wait(30);
    await advanceToStep3(stdin);
    await wait(30);

    // LLM has 2 fields; navigate past them both to reach Continue.
    stdin.write(ARROW_DOWN); // field 0 → field 1
    await wait(25);
    stdin.write(ARROW_DOWN); // field 1 → Continue
    await wait(25);

    // Enter on Continue should advance to step 4.
    stdin.write(ENTER);
    await wait(60);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Step 4 / 4');
  });

  it('step 3: Enter on Continue row advances to step 4', async () => {
    const onDone = vi.fn();
    const { stdin, lastFrame } = render(
      <WizardSteps
        store={makeStore()}
        catalog={CATALOG}
        configPath="/tmp/config.json"
        onDone={onDone}
        onSkip={() => {}}
        runSystemCheckImpl={silentSystemCheck}
      />,
    );
    await wait(30);
    await advanceToStep3(stdin);
    await wait(30);

    // Navigate to Continue (2 fields in LLM).
    await advanceToStep4ViaContine(stdin, 2);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Step 4 / 4');
    expect(onDone).not.toHaveBeenCalled(); // still in wizard
  });
});

describe('WizardSteps — Bug 2: Visible Quit affordance in wizard', () => {
  it('step 1 (Welcome) renders a Quit row', async () => {
    const { lastFrame } = render(
      <WizardSteps
        store={makeStore()}
        catalog={CATALOG}
        configPath="/tmp/config.json"
        onDone={() => {}}
        onSkip={() => {}}
        runSystemCheckImpl={silentSystemCheck}
      />,
    );
    await wait(30);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Step 1 / 4');
    expect(frame).toContain('Quit');
  });

  it('step 2 (System) renders a Quit row', async () => {
    const { stdin, lastFrame } = render(
      <WizardSteps
        store={makeStore()}
        catalog={CATALOG}
        configPath="/tmp/config.json"
        onDone={() => {}}
        onSkip={() => {}}
        runSystemCheckImpl={silentSystemCheck}
      />,
    );
    await wait(30);
    stdin.write(ENTER);
    await wait(60);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Step 2 / 4');
    expect(frame).toContain('Quit');
  });

  it('step 3 (LLM) renders both Continue and Quit rows', async () => {
    const { stdin, lastFrame } = render(
      <WizardSteps
        store={makeStore()}
        catalog={CATALOG}
        configPath="/tmp/config.json"
        onDone={() => {}}
        onSkip={() => {}}
        runSystemCheckImpl={silentSystemCheck}
      />,
    );
    await wait(30);
    await advanceToStep3(stdin);
    await wait(30);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Step 3 / 4');
    expect(frame).toContain('Continue');
    expect(frame).toContain('Quit');
  });

  it('step 4 (Agents) renders both Finish and Quit rows', async () => {
    const { stdin, lastFrame } = render(
      <WizardSteps
        store={makeStore()}
        catalog={CATALOG}
        configPath="/tmp/config.json"
        onDone={() => {}}
        onSkip={() => {}}
        runSystemCheckImpl={silentSystemCheck}
      />,
    );
    await wait(30);
    await advanceToStep3(stdin);
    await wait(30);
    await advanceToStep4ViaContine(stdin, 2);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Step 4 / 4');
    expect(frame).toContain('Finish');
    expect(frame).toContain('Quit');
  });

  it('step 1: navigating to Quit row and pressing Enter calls onSkip', async () => {
    const onSkip = vi.fn();
    const { stdin } = render(
      <WizardSteps
        store={makeStore()}
        catalog={CATALOG}
        configPath="/tmp/config.json"
        onDone={() => {}}
        onSkip={onSkip}
        runSystemCheckImpl={silentSystemCheck}
      />,
    );
    await wait(30);
    // In Welcome step, navigate down to Quit row (1 down from the "content" row)
    stdin.write(ARROW_DOWN);
    await wait(30);
    stdin.write(ENTER);
    await wait(40);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('step 3: navigating to Quit row and pressing Enter calls onSkip', async () => {
    const onSkip = vi.fn();
    const { stdin } = render(
      <WizardSteps
        store={makeStore()}
        catalog={CATALOG}
        configPath="/tmp/config.json"
        onDone={() => {}}
        onSkip={onSkip}
        runSystemCheckImpl={silentSystemCheck}
      />,
    );
    await wait(30);
    await advanceToStep3(stdin);
    await wait(30);

    // LLM: field 0, field 1, Continue, Quit — navigate to Quit (3 downs)
    stdin.write(ARROW_DOWN); // → field 1
    await wait(25);
    stdin.write(ARROW_DOWN); // → Continue
    await wait(25);
    stdin.write(ARROW_DOWN); // → Quit
    await wait(25);
    stdin.write(ENTER);
    await wait(40);

    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('CategoryScreen — outside wizard, no Continue row appears', () => {
  it('CategoryScreen without continueRow prop renders no Continue row', async () => {
    const store = createSettingsStore({});
    const { lastFrame } = render(
      <CategoryScreen
        category={llmCategory}
        store={store}
        onBack={() => {}}
      />,
    );
    await wait(30);
    const frame = lastFrame() ?? '';
    // The word "Continue" should NOT appear in the vanilla CategoryScreen.
    expect(frame).not.toContain('Continue');
  });
});
