import type { WatchJobInput, WatchJobOutput, WatchAction } from '../../types.js';
import type { ParsedArgs } from '../parser.js';
import type { ReplDeps } from './types.js';
import { handleWatch } from '../../tools/watch.js';
import { createLogger } from '../../logger.js';

const log = createLogger('repl');

export type WatchExecOutput = WatchJobOutput & { error?: string };

/**
 * A one-shot CLI process has no resident scheduler, so a created/paused/resumed
 * job never fires on its own — checks only run inside a long-lived `wigolo
 * serve` daemon or an active MCP session. Surface that on every mutation so the
 * write is not mistaken for a silent no-op.
 */
export const WATCH_SCHEDULER_CAVEAT =
  'jobs run while `wigolo serve` (or an MCP session) is active';

const USAGE =
  'Usage: watch add <url> [--interval=SECONDS] [--selector=CSS] [--notify=URL]' +
  ' | watch list | watch rm <job_id> | watch run <job_id>' +
  ' | watch pause <job_id> | watch resume <job_id>';

// CLI verb → tool action. `add`/`rm`/`run` are the friendlier one-shot verbs;
// the tool's own action names pass through unchanged.
const VERB_TO_ACTION: Record<string, WatchAction> = {
  add: 'create',
  create: 'create',
  list: 'list',
  rm: 'delete',
  delete: 'delete',
  run: 'check',
  check: 'check',
  pause: 'pause',
  resume: 'resume',
};

// Actions that mutate persistent job state — the scheduler caveat rides these.
const MUTATION_ACTIONS = new Set<WatchAction>(['create', 'delete', 'pause', 'resume']);

function errEnvelope(reason: string): WatchExecOutput {
  return { jobs: [], error: reason };
}

export async function executeWatch(args: ParsedArgs, deps: ReplDeps): Promise<WatchExecOutput> {
  try {
    const verb = args.positional[0];
    if (!verb) {
      return errEnvelope(USAGE);
    }

    const action = VERB_TO_ACTION[verb];
    if (!action) {
      return errEnvelope(`Unknown watch subcommand '${verb}'. ${USAGE}`);
    }

    const input: WatchJobInput = { action };

    if (action === 'create') {
      const url = args.positional[1];
      if (url) input.url = url;
      const interval = args.flags.interval ?? args.flags['interval-seconds'];
      if (interval) input.interval_seconds = parseInt(interval, 10);
      if (args.flags.selector) input.selector = args.flags.selector;
      if (args.flags.notify) input.notification = args.flags.notify;
    } else if (action === 'delete' || action === 'check' || action === 'pause' || action === 'resume') {
      const jobId = args.positional[1] ?? args.flags['job-id'] ?? args.flags.id;
      if (jobId) input.job_id = jobId;
    }

    log.debug('executing watch command', { verb, action, flags: args.flags });
    const r = await handleWatch(input, deps.router);
    if (!r.ok) {
      return errEnvelope(r.error_reason);
    }

    const data: WatchExecOutput = { ...r.data };
    if (MUTATION_ACTIONS.has(action)) {
      data.notice = WATCH_SCHEDULER_CAVEAT;
    }
    return data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('watch command failed', { error: msg });
    return errEnvelope(msg);
  }
}
