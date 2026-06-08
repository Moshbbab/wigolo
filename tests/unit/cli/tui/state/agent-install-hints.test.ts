import { describe, it, expect, vi } from 'vitest';
import {
  makeInstalledHintDecorator,
  detectInstalledAgentIds,
} from '../../../../../src/cli/tui/state/agent-install-hints.js';
import type { FieldDef } from '../../../../../src/cli/tui/schema/types.js';
import type { AgentTarget } from '../../../../../src/cli/tui/state/agent-targets.js';

const agentsField: FieldDef = {
  key: 'WIGOLO_AGENTS',
  settingsPath: 'agents',
  label: 'Installed agents',
  kind: 'multiselect',
  options: [
    { value: 'claude-code', label: 'Claude Code (CLI)' },
    { value: 'vscode', label: 'VS Code' },
    { value: 'zed', label: 'Zed' },
  ],
  default: [],
};

function makeTarget(id: AgentTarget['id'], detected: boolean | (() => Promise<boolean>)): AgentTarget {
  return {
    id,
    label: id,
    configPath: `/tmp/${id}.json`,
    serverPath: ['mcpServers', 'wigolo'],
    envPath: ['mcpServers', 'wigolo', 'env'],
    detect: typeof detected === 'function' ? detected : () => Promise.resolve(detected),
    backupDir: () => '/tmp/backups',
  };
}

describe('makeInstalledHintDecorator', () => {
  it('stamps the installed hint only on detected agent rows', () => {
    const decorate = makeInstalledHintDecorator(new Set(['claude-code', 'zed']));
    const out = decorate(agentsField);
    const byValue = new Map(out.options!.map((o) => [o.value, o.hint]));
    expect(byValue.get('claude-code')).toBe('installed');
    expect(byValue.get('zed')).toBe('installed');
    // Not-installed rows must carry no hint — otherwise the UI would lie.
    expect(byValue.get('vscode')).toBeUndefined();
  });

  it('returns a fresh field/options array (no mutation of the schema field)', () => {
    const decorate = makeInstalledHintDecorator(new Set(['vscode']));
    const out = decorate(agentsField);
    expect(out).not.toBe(agentsField);
    expect(out.options).not.toBe(agentsField.options);
    // The shared schema object must stay hint-free so other renders aren't polluted.
    expect(agentsField.options!.every((o) => o.hint === undefined)).toBe(true);
  });

  it('passes non-agents and non-multiselect fields through untouched', () => {
    const decorate = makeInstalledHintDecorator(new Set(['claude-code']));
    const textField: FieldDef = { key: 'X', settingsPath: 'x', label: 'X', kind: 'text', default: '' };
    expect(decorate(textField)).toBe(textField);
    const otherMulti: FieldDef = { ...agentsField, settingsPath: 'other' };
    expect(decorate(otherMulti)).toBe(otherMulti);
  });
});

describe('detectInstalledAgentIds', () => {
  it('returns ids whose detect() resolves true', async () => {
    const ids = await detectInstalledAgentIds([
      makeTarget('claude-code', true),
      makeTarget('vscode', false),
      makeTarget('zed', true),
    ]);
    expect([...ids].sort()).toEqual(['claude-code', 'zed']);
  });

  it('treats a rejected detect() as not-installed instead of failing the whole probe', async () => {
    const ids = await detectInstalledAgentIds([
      makeTarget('claude-code', () => Promise.reject(new Error('fs error'))),
      makeTarget('vscode', true),
    ]);
    // claude-code's failure must not blank vscode.
    expect([...ids]).toEqual(['vscode']);
  });

  it('re-detection reflects newly-installed agents (the #105 refresh contract)', async () => {
    // Same target whose backing detection flips from false → true after install.
    let installed = false;
    const target = makeTarget('claude-code', () => Promise.resolve(installed));
    expect([...(await detectInstalledAgentIds([target]))]).toEqual([]);
    installed = true;
    expect([...(await detectInstalledAgentIds([target]))]).toEqual(['claude-code']);
  });
});
