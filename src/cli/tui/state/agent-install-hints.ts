/**
 * Live install-state hints for the agents multiselect.
 *
 * The agents category schema (`schema/agents.ts`) declares static options with
 * no per-agent install state. Detection lives at runtime in each
 * `AgentTarget.detect()`. This module bridges the two: given the set of agent
 * ids currently detected as installed, it decorates a multiselect field's
 * options with an `installed` hint so the row reflects reality.
 *
 * The decorator is pure and synchronous so it slots straight into
 * `CategoryScreen`'s `decorateField` seam; callers own the async detection and
 * feed the resulting id-set in, re-running detection (and bumping the screen's
 * `refreshSignal`) whenever install state may have changed — e.g. right after
 * an install completes (#105).
 */
import type { FieldDef } from '../schema/types.js';
import type { AgentTarget } from './agent-targets.js';

const INSTALLED_HINT = 'installed';

/** settingsPath of the agents multiselect — the only field we decorate. */
const AGENTS_FIELD_PATH = 'agents';

/**
 * Returns a `decorateField` callback that stamps an `installed` hint onto every
 * agents-multiselect option whose value is in `installedIds`. Non-agents fields
 * and non-multiselect fields pass through untouched.
 */
export function makeInstalledHintDecorator(
  installedIds: ReadonlySet<string>,
): (field: FieldDef) => FieldDef {
  return (field) => {
    if (field.settingsPath !== AGENTS_FIELD_PATH) return field;
    if (field.kind !== 'multiselect' || !field.options) return field;
    return {
      ...field,
      options: field.options.map((o) =>
        installedIds.has(o.value) ? { ...o, hint: INSTALLED_HINT } : o,
      ),
    };
  };
}

/**
 * Runs `detect()` across every agent target in parallel and returns the set of
 * ids currently reporting wigolo as installed. Detection failures are treated
 * as "not installed" so a single flaky probe never blanks the whole list.
 */
export async function detectInstalledAgentIds(
  agents: ReadonlyArray<AgentTarget>,
): Promise<Set<string>> {
  const results = await Promise.all(
    agents.map(async (a) => {
      try {
        return (await a.detect()) ? a.id : null;
      } catch {
        return null;
      }
    }),
  );
  return new Set(results.filter((id): id is AgentTarget['id'] => id !== null));
}
