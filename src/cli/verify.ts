/**
 * SP6 — standalone `wigolo verify` command.
 *
 * Runs the end-to-end capability smoke check and prints a machine-readable
 * result. Exit code 0 when all capabilities pass (skipped counts as pass);
 * exit code 1 on any hard failure.
 *
 * Flags:
 *   --plain / -y / --non-interactive   force non-interactive plain output
 *   --help / -h                        print usage
 */
import { getConfig } from '../config.js';

const VERIFY_USAGE = [
  'Usage: wigolo verify [options]',
  '',
  'Options:',
  '  --plain, --non-interactive, -y   Force plain text output (no TUI)',
  '  --help, -h                       Show this message',
  '',
  'Exit code 0 when all capabilities pass or skip.',
  'Exit code 1 when any capability fails.',
  '',
].join('\n');

interface VerifyFlags {
  plain: boolean;
  help: boolean;
}

function parseVerifyFlags(args: string[]): VerifyFlags {
  const flags: VerifyFlags = { plain: false, help: false };
  for (const arg of args) {
    if (arg === '--plain' || arg === '-y' || arg === '--non-interactive') {
      flags.plain = true;
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    }
  }
  return flags;
}

export async function runVerifyE2E(args: string[]): Promise<number> {
  const flags = parseVerifyFlags(args);

  if (flags.help) {
    process.stderr.write(VERIFY_USAGE);
    return 0;
  }

  const isTTY = Boolean(process.stdout.isTTY);
  const isCI =
    process.env.CI === 'true' ||
    process.env.CI === '1' ||
    process.env.GITHUB_ACTIONS === 'true';
  const usePlain = flags.plain || !isTTY || isCI;

  const { buildDefaultDeps, verifyEndToEnd, formatVerifyResultPlain } = await import('./tui/actions/verify-e2e.js');

  const deps = await buildDefaultDeps();

  if (usePlain) {
    const result = await verifyEndToEnd(deps);
    for (const line of formatVerifyResultPlain(result)) {
      process.stderr.write(`${line}\n`);
    }
    return result.allPassed ? 0 : 1;
  }

  // Interactive Ink path — render the e2e result in the Verification component
  const { getConfig: getConf } = await import('../config.js');
  const config = getConf();

  // Run both legacy verify and e2e in parallel, then render
  const [e2eResult] = await Promise.allSettled([verifyEndToEnd(deps)]);
  const e2eResolved = e2eResult.status === 'fulfilled' ? e2eResult.value : null;

  if (!e2eResolved) {
    process.stderr.write('[wigolo verify] End-to-end check failed to run.\n');
    return 1;
  }

  for (const line of formatVerifyResultPlain(e2eResolved)) {
    process.stderr.write(`${line}\n`);
  }
  return e2eResolved.allPassed ? 0 : 1;
}
