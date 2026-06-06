import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};

describe('package.json: forbidden deps after Python-rerank migration', () => {
  // onnxruntime-node is intentionally allowed: fastembed (still the local
  // embedding backend) pulls it transitively and the v0.1.11 bench surfaced
  // npx consumers missing it when not hoisted to wigolo's own dependencies.
  // The other ONNX deps were banned because the rerank stack moved to Python.
  const FORBIDDEN = ['@xenova/transformers', 'onnx-proto', 'onnxruntime-web'];

  for (const name of FORBIDDEN) {
    it(`dependencies does not include ${name}`, () => {
      expect(pkg.dependencies?.[name]).toBeUndefined();
    });
    it(`devDependencies does not include ${name}`, () => {
      expect(pkg.devDependencies?.[name]).toBeUndefined();
    });
  }

  it('overrides.protobufjs is absent', () => {
    expect(pkg.overrides?.protobufjs).toBeUndefined();
  });

  it('engines.node is still >=20', () => {
    const node = (pkg as { engines?: { node?: string } }).engines?.node;
    expect(node).toBeDefined();
    expect(node).toMatch(/>=20/);
  });
});

// Regression guard for GitHub issue #101 — Linux warmup --all crash.
//
// Two mandatory production deps pin INCOMPATIBLE EXACT native ONNX runtimes:
//   - fastembed@2.1.0 (sole embedding backend) hard-pins onnxruntime-node@1.21.0
//     (built against napi-v3).
//   - @huggingface/transformers@4.2.0 (hard-wired reranker, no Python fallback)
//     requires onnxruntime-node@1.24.3 (built against napi-v6).
// On Linux x64 both .so files install, but the dynamic linker reuses the cached
// 1.21.0 library, so transformers' VERS_1.24.3 symbol-version lookup fails and
// `warmup --all` crashes. Because both deps pin EXACT versions, npm can't dedupe
// them on its own — bumping the direct dep alone does nothing.
//
// The fix: an npm `overrides` block forcing a SINGLE version (1.24.3) across the
// whole tree, so only one onnxruntime-node .so ever installs. If a future dev
// removes the override or lets the versions split again, this test must fail so
// the Linux symbol clash can't silently return.
describe('package.json: onnxruntime-node unified to one version (issue #101)', () => {
  it('overrides forces onnxruntime-node to 1.24.3', () => {
    expect(pkg.overrides?.['onnxruntime-node']).toBe('1.24.3');
  });

  it('direct onnxruntime-node dependency matches the override (1.24.3)', () => {
    expect(pkg.dependencies?.['onnxruntime-node']).toBe('1.24.3');
  });

  it('exactly one onnxruntime-node version resolves in package-lock.json', () => {
    const lock = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'package-lock.json'), 'utf-8'),
    ) as { packages?: Record<string, { version?: string }> };

    const versions = new Set<string>();
    for (const [path, meta] of Object.entries(lock.packages ?? {})) {
      if (path.endsWith('node_modules/onnxruntime-node') && meta.version) {
        versions.add(meta.version);
      }
    }

    expect([...versions]).toEqual(['1.24.3']);
  });
});
