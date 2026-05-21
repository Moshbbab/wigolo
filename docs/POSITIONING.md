# Wigolo v1 Positioning Statement

Wigolo is the **SQLite of agent search** — a local runtime, not a remote API. We are not building open-source Tavily or local Exa. Different deployment model, different game. Build what they structurally cannot.

## What This Means

Wigolo runs on your machine. Zero API keys. Zero cloud. You control your data, your cache grows with your usage, and your privacy is a property of the runtime, not a promise from a vendor. Every query, every crawl, every extracted fact stays local — optionally encrypted on disk. If your network is down, your cache is still there. If you want to run on an intranet, air-gapped network, or private cloud, you can.

This is not a limitation dressed up as a feature. It is a different game, with different tradeoffs.

## What We Cede Honestly

We cannot and will not compete on the following axes. These are genuine structural limits.

| Limitation | Reason | Mitigation |
|---|---|---|
| Global neural index for `find_similar` on cold open web | No years-of-crawl corpus | `find_similar` operates on local cache + live web expansion only |
| Anti-bot on hostile sites | No proxy farm or fingerprint rotation at scale | Good default fingerprinting + optional user-supplied proxy; fail honestly otherwise |
| Cold-start on niche topics | No pre-crawl | Cache warms as user works; surface this in onboarding |
| Sub-minute breaking news | Engine latency floor | Close to single-digit minutes via verticalized routing + opt-in RSS |
| Massive parallel crawls on huge sites | Bounded by local CPU/network | Document concurrency knobs; recommend chunked crawls |

## Where We Win Structurally

These are not marketing claims. These are properties of the local-first model that competitors cannot replicate without fundamental redesign.

- **Cold-install time**: `npx` → working in <60 seconds. No account, no auth, no warmup.
- **Cost-per-1000 queries**: Zero. No API call ever leaves your machine.
- **Privacy**: Zero data exfiltration. You see what your cache sees; your cache is yours.
- **Intranet and private-network support**: Run inside your network, behind your firewall, fully air-gapped.
- **Customization surface**: Adjust via 50+ environment variables, install plugins, use the REPL to debug queries interactively.
- **Cache that compounds**: Repeat queries get faster, not constant-cost. The more you use it, the better it gets.

## How We Evaluate

Positioning is not a promise. It is a framework for choices: what we build, what we don't, how we measure success.

See `wigolo-bench/` for blind benchmarks against competitors on standardized rubrics. That is where claims meet reality.

This document guides strategy. The benchmark judges the outcome.
