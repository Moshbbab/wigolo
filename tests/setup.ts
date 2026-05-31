import { beforeEach, afterEach } from 'vitest';

// Default reranker to 'none' in tests so the cross-encoder model isn't lazily
// downloaded. Tests that exercise the reranker explicitly set
// WIGOLO_RERANKER='onnx' and mock the rerank provider in their own scope.
if (!process.env.WIGOLO_RERANKER) {
  process.env.WIGOLO_RERANKER = 'none';
}

// Phase 0: production default flipped from `searxng` to `core`. Most existing
// tests were authored against the legacy SearXNG path (they pass a mock engines
// array to handleSearch). Pin the test-suite default back to `searxng` so
// pre-Phase-0 tests keep their semantics. Tests that exercise the new default
// or any other backend override this per-test with process.env.WIGOLO_SEARCH.
if (!process.env.WIGOLO_SEARCH) {
  process.env.WIGOLO_SEARCH = 'searxng';
}

// Isolate CI-detection env vars from the host. Production code in
// `src/cli/config.ts` and `src/cli/tui/theme/motion-guard.ts` (correctly)
// disables Ink mount and TUI motion when CI/GITHUB_ACTIONS are set. Under
// GitHub Actions runners those vars are always present, which would otherwise
// silently flip TUI tests into reduced-motion mode and skip Ink-mount paths.
// Per-test cases that need to assert CI-on behavior set the var inside their
// own `it(...)` block; this save/restore guarantees each test starts with a
// clean slate and the host's CI vars never leak into assertions.
const CI_ENV_KEYS = [
  'CI',
  'GITHUB_ACTIONS',
  'GITHUB_RUN_ID',
  'CONTINUOUS_INTEGRATION',
] as const;

const savedCIEnv: Partial<Record<(typeof CI_ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of CI_ENV_KEYS) {
    savedCIEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of CI_ENV_KEYS) {
    const orig = savedCIEnv[key];
    if (orig === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = orig;
    }
  }
});
