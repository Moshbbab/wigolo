// Reranker tokenizer equivalence golden test.
//
// STATUS: deferred / known-failing.
//
// This test landed alongside the Python reranker infrastructure (PythonWorker,
// RerankSubprocess, reranker_server.py, corpus) but the production hot-path is
// NOT wired to the new subprocess — onnxRerank() still uses @xenova/transformers
// + onnxruntime-node. The reason: an investigation found that xenova-JS and the
// canonical SentencePiece Unigram tokenizer diverge systematically on the same
// tokenizer.json for the bge-reranker-v2-m3 model. xenova has at least three
// known bugs relative to the canonical spec:
//   1. Missing add_prefix_space → no leading metaspace ▁ on first segment.
//   2. MetaspacePreTokenizer ignores split=true → whole text treated as one piece.
//   3. UTF-16 surrogate-pair splitting → emoji become <unk>.
// Python tokenizers (Rust) is correct per the tokenizer.json spec. Shipping the
// Python path as-is would produce different scores than the current Node path.
//
// This test is gated by WIGOLO_RERANKER_TEST=1 and skips by default. When the
// gate is enabled, it currently FAILS — that is intentional and is the merge
// signal that wire-up cannot proceed without one of:
//   (a) "xenova-compat" patching of tokenizer.json (matches 4/6 buckets; emoji
//       and long-doc-truncation still diverge — see scratch investigation
//       notes referenced in the original spec).
//   (b) Acceptance of canonical Python output as the new baseline, with an
//       end-to-end rerank-ordering measurement on a real corpus and a retune
//       of WIGOLO_RELEVANCE_THRESHOLD as needed.
// Track follow-up in the project issue tracker.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

const corpus = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'reranker-tokenizer-corpus.json'), 'utf-8'),
) as { buckets: Record<string, { query: string; doc: string }[]> };

const DATA_DIR = process.env.WIGOLO_DATA_DIR ?? join(homedir(), '.wigolo');
const DUMP_SCRIPT = join(__dirname, '..', 'fixtures', 'dump_tokens.py');
const VENV_PYTHON = join(DATA_DIR, 'searxng', 'venv', 'bin', 'python');
const PYTHON = existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';

const MODELS = ['bge-reranker-v2-m3', 'ms-marco-MiniLM-L-12-v2'] as const;
const MAX_LENGTH = 512;

interface TokenDump {
  input_ids: number[];
  attention_mask: number[];
  token_type_ids: number[];
  error?: string;
}

async function dumpPython(modelId: string, query: string, doc: string): Promise<TokenDump> {
  return new Promise((resolve, reject) => {
    const modelDir = join(DATA_DIR, 'models', modelId);
    const proc = spawn(PYTHON, [DUMP_SCRIPT, modelDir, String(MAX_LENGTH)], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`dump_tokens exit ${code}: ${stderr}`));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`dump_tokens output not JSON: ${stdout}`));
      }
    });
    proc.stdin.write(JSON.stringify({ query, doc }));
    proc.stdin.end();
  });
}

async function dumpXenova(modelId: string, query: string, doc: string): Promise<TokenDump> {
  const { AutoTokenizer, env } = await import('@xenova/transformers');
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = join(DATA_DIR, 'models');
  const tok = await AutoTokenizer.from_pretrained(modelId, { local_files_only: true });
  const enc = (tok as unknown as (q: string, opts: Record<string, unknown>) => {
    input_ids: { data: BigInt64Array; dims: number[] };
    attention_mask: { data: BigInt64Array; dims: number[] };
    token_type_ids?: { data: BigInt64Array; dims: number[] };
  })(query, {
    text_pair: doc,
    max_length: MAX_LENGTH,
    truncation: true,
    padding: 'max_length',
    return_tensor: true,
  });
  const length = enc.input_ids.dims[1];
  const toArray = (a: BigInt64Array) => Array.from(a, (v) => Number(v));
  const ids = toArray(enc.input_ids.data);
  const mask = toArray(enc.attention_mask.data);
  const types = enc.token_type_ids
    ? toArray(enc.token_type_ids.data)
    : new Array(length).fill(0);
  return { input_ids: ids, attention_mask: mask, token_type_ids: types };
}

const skip = !process.env.WIGOLO_RERANKER_TEST;

describe.skipIf(skip)('reranker tokenizer equivalence (xenova-JS vs tokenizers-Rust)', () => {
  for (const modelId of MODELS) {
    for (const [bucket, pairs] of Object.entries(corpus.buckets)) {
      describe(`${modelId} :: ${bucket}`, () => {
        for (let i = 0; i < pairs.length; i++) {
          const { query, doc } = pairs[i];
          it(`pair ${i + 1}: q="${query.slice(0, 30)}" d="${doc.slice(0, 30)}"`, async () => {
            const [xen, py] = await Promise.all([
              dumpXenova(modelId, query, doc),
              dumpPython(modelId, query, doc),
            ]);
            expect(py.error).toBeUndefined();
            expect(py.input_ids).toEqual(xen.input_ids);
            expect(py.attention_mask).toEqual(xen.attention_mask);
            expect(py.token_type_ids).toEqual(xen.token_type_ids);
          });
        }
      });
    }
  }
});
