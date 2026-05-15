#!/usr/bin/env bash
# scripts/verify_inner.sh
# Inner loop verifier — fast. ~30 seconds per iteration.
#
# Flow:
#   1. Rebuild wigolo (incremental)
#   2. Bounce daemon
#   3. Run benchmark in --direct mode (only wigolo, via HTTP, no MCP, no Claude subprocess)
#   4. Print the score for the autoresearch loop to consume
#
# Exits non-zero on hard failures (build break, daemon won't start, etc).
# autoresearch interprets non-zero exit as "iteration broke, revert."

set -euo pipefail
cd "$(dirname "$0")/.."

BENCH_DIR="${WIGOLO_BENCH_DIR:-../wigolo-bench}"

# 1. Quick lint check: reject if cloud-LLM SDK leaked into core path.
#    Adjust paths to match your project layout (replace src/core with whatever your
#    "no cloud" path is — perhaps src/engine, src/server, etc.)
CORE_PATHS=("src/")
EXCLUDE_PATHS=("src/integrations/cloud/")
LINT_PATTERN='from\s+["\047](openai|@anthropic-ai/sdk|@google/generative-ai|cohere-ai|@mistralai/mistralai|together-ai)["\047]|require\(["\047](openai|@anthropic-ai/sdk|@google/generative-ai|cohere-ai|@mistralai/mistralai|together-ai)["\047]\)'

if command -v rg >/dev/null 2>&1; then
  EXCLUDE_ARGS=""
  for p in "${EXCLUDE_PATHS[@]}"; do EXCLUDE_ARGS="$EXCLUDE_ARGS -g !${p}"; done
  if rg -l $EXCLUDE_ARGS "$LINT_PATTERN" "${CORE_PATHS[@]}" 2>/dev/null; then
    echo "[verify_inner] REJECTED: cloud-LLM SDK in core path" >&2
    exit 2
  fi
fi

# 2. Build
echo "[verify_inner] build"
./scripts/build_and_install_dev.sh > /tmp/wigolo-build.log 2>&1 || {
  echo "[verify_inner] BUILD FAILED — see /tmp/wigolo-build.log" >&2
  tail -30 /tmp/wigolo-build.log >&2
  exit 3
}

# 3. Daemon
echo "[verify_inner] daemon"
./scripts/start_daemon.sh > /tmp/wigolo-start.log 2>&1 || {
  echo "[verify_inner] DAEMON FAILED" >&2
  tail -20 /tmp/wigolo-start.log >&2
  exit 4
}

# 4. Bench in direct mode
SUBSET="${WIGOLO_VERIFY_INNER_SUBSET:-3}"
INNER_TIMEOUT="${WIGOLO_VERIFY_INNER_TIMEOUT:-25}"
echo "[verify_inner] bench (--direct, subset $SUBSET)"
cd "$BENCH_DIR"
./harness/run_bench.sh --direct --subset "$SUBSET" --timeout "$INNER_TIMEOUT" > /tmp/wigolo-bench.log 2>&1 || {
  echo "[verify_inner] BENCH FAILED" >&2
  tail -30 /tmp/wigolo-bench.log >&2
  exit 5
}

# 5. Print the score (the only thing autoresearch reads)
SCORE=$(jq -r '.score' results/latest/aggregate.json)
echo "[verify_inner] score=$SCORE"
echo "$SCORE"
