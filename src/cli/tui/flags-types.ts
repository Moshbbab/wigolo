export const KNOWN_AGENT_IDS: readonly string[] = [
  'claude-code',
  'cursor',
  'vscode',
  'zed',
  'gemini-cli',
  'windsurf',
  'codex',
  'opencode',
  'antigravity',
];

export interface InitFlags {
  nonInteractive: boolean;
  agents: readonly string[];
  skipVerify: boolean;
  plain: boolean;
  help: boolean;
  /** Opt into the Ink wizard. Default init is the plain path on TTY and non-TTY alike. */
  wizard: boolean;
  /** Opt back into pre-caching components (`runWarmup(['--all'])`). No warmup runs by default. */
  warmup: boolean;
  /** Emit a machine-readable JSON summary on stdout instead of the human report. */
  json: boolean;
  provider?: string;
  search?: string;
}

export interface SetupMcpFlags {
  nonInteractive: boolean;
  agents: readonly string[];
  plain: boolean;
  help: boolean;
  /** Emit a machine-readable JSON summary on stdout instead of the human report. */
  json: boolean;
}

export class FlagParseError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FlagParseError';
    this.code = code;
  }
}
