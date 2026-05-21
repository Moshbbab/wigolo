import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function packageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/cli/help.js OR src/cli/help.ts → ../.. = package root
  return join(here, '..', '..');
}

export function getVersion(): string {
  try {
    const raw = readFileSync(join(packageRoot(), 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const HELP_TEXT = `wigolo — local-first web intelligence MCP server

Usage:
  wigolo                  Start MCP server on stdio (default)
  wigolo <command>        Run a subcommand

Subcommands:
  warmup                  Pre-fetch models + run setup checks
  serve                   Start HTTP daemon
  health                  Health check (exit code = status)
  doctor                  Diagnose installation
  auth                    Manage site auth
  plugin                  Manage plugins
  shell                   Interactive REPL
  init                    Initialize project config
  uninstall               Remove wigolo install
  setup mcp               Wire wigolo into MCP clients
  status                  Show running daemon status
  backfill                Backfill embeddings for cached pages without them

Options:
  -h, --help              Print this help
  -V, --version           Print version

Docs: https://github.com/KnockOutEZ/wigolo
`;

export function printHelp(stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(HELP_TEXT);
}

export function printVersion(stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(`wigolo ${getVersion()}\n`);
}

export function printUnknownCommand(
  name: string,
  stream: NodeJS.WriteStream = process.stderr,
): void {
  stream.write(`wigolo: unknown command '${name}'\n\n`);
  stream.write(HELP_TEXT);
}
