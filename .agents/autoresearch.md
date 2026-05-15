# Wigolo Autoresearch Constraints

## Goal

Maximize Wigolo's `wins_by_tool["wigolo-dev"]` count and `overall_mean_by_tool["wigolo-dev"]`
in `../wigolo-bench/results/latest/aggregate.json`, while preserving local-only architecture
and meeting the latency budget.

The primary signal is **wins_by_tool** (how many queries did Wigolo win against Tavily / Exa /
Firecrawl). Mean score is secondary. We are competing, not optimizing in a vacuum.

## Hard constraints (verifier rejects iterations that violate any of these)

1. **No cloud-LLM SDKs in the core path.** Any import of `openai`, `anthropic`,
   `google.generativeai`, `cohere`, `mistralai`, `together` in modules under the core
   path (engine, ranker, retriever, extractor) causes immediate iteration rejection.
   Cloud LLMs are permitted only in modules under an opt-in path like `src/integrations/cloud/`
   that is disabled by default.

2. **No new always-on network dependencies** beyond user-requested URLs.
   Calls to third-party APIs at startup or on every query are not permitted.
   Pre-built indexes, local model weights, and cached resources are fine.

3. **Latency budget per query: 15 seconds hard cap, 8 seconds target.**
   Verifier records p50 and p95 latency. Iterations that push p95 above 15s are rejected
   regardless of quality gain.

4. **Default mode must work with zero API keys configured.** A fresh install with no
   env vars must produce a working tool. Optional integrations may require keys when
   explicitly enabled.

## Permitted directions (loop should explore these aggressively)

- Local LLM inference via Ollama / llama.cpp / candle / etc.
- Shipping fine-tuned small models (under ~500MB) with the package.
- Multi-pass retrieval: agentic query decomposition, two-stage retrieve-then-rerank,
  iterative refinement.
- Learned reranking trained on benchmark feedback.
- Per-category specialization (different retrieval strategy for "crawl" vs "factual" vs
  "long_tail" queries — Wigolo's MCP tool can expose the category as an optional param).
- Improved tool descriptions and skill prompts (the description Claude Code sees when
  deciding whether to call Wigolo's tool — this is part of the product, iterate on it).

## Strategic priorities (in order)

1. **Win categories where competitors are weak.** Look at `by_category` in `aggregate.json`.
   If wigolo-dev is already winning a category by a wide margin, don't optimize there —
   the marginal return is low. Look for categories where wigolo-dev is losing by a small
   amount; those are the next-iteration wins.
2. **Don't regress on held-out queries.** If `aggregate.json` shows a gain but the
   held-out periodic check (run separately, not in this loop) shows regression, that's
   overfitting — revert.
3. **Latency improvements count.** If wigolo-dev quality is tied with the leader but
   latency is 3× higher, that's a loss. Closing the latency gap is a valid iteration goal.

## What this loop is NOT for

- Editing the benchmark harness itself. The harness lives in `../wigolo-bench/` and
  is out of scope for this loop. Changing the rubric, queries, or scoring is bench-side work.
- Editing the Wigolo MCP tool schema in ways that break existing users. Tool name and
  arg shape changes require a major version bump and are out of scope for autonomous iteration.
- Changes that require manual environment setup (new database, new daemon, new auth).
  All changes must be testable by `./scripts/verify.sh` with no human in the loop.

## Verify commands

- `./scripts/verify_inner.sh` — fast inner loop, wigolo HTTP only, ~30s per run
- `./scripts/verify.sh` — full outer loop, MCP + all four tools, ~5–10 min per run
