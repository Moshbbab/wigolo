import { detect } from 'tinyld';
import { createLogger } from '../logger.js';

const log = createLogger('language-filter');

export interface RawSearchResult {
  url: string;
  title: string;
  snippet: string;
  engine: string;
  [k: string]: unknown;
}

export interface DiscardedResult {
  result: RawSearchResult;
  reason: 'invalid_url' | 'language_mismatch' | 'engine_batch_dropped';
}

export interface FilterOptions {
  target: string;            // ISO-639 code, e.g. 'en'
  dropThreshold: number;     // fraction of batch non-target before drop, e.g. 0.4
}

export interface FilterResult {
  results: RawSearchResult[];
  discarded: DiscardedResult[];
  warnings: string[];
}

function isValidUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function detectLang(text: string): string {
  if (!text || text.trim().length < 4) return 'und';
  try { return detect(text) || 'und'; } catch { return 'und'; }
}

export function filterByLanguage(
  results: RawSearchResult[],
  opts: FilterOptions,
): FilterResult {
  const discarded: DiscardedResult[] = [];
  const warnings: string[] = [];

  // Step 1: drop invalid URLs first
  const urlValid: RawSearchResult[] = [];
  for (const r of results) {
    if (!isValidUrl(r.url)) {
      discarded.push({ result: r, reason: 'invalid_url' });
      continue;
    }
    urlValid.push(r);
  }

  if (urlValid.length === 0) return { results: [], discarded, warnings };

  // Step 2: per-engine batch language check
  const byEngine = new Map<string, RawSearchResult[]>();
  for (const r of urlValid) {
    const arr = byEngine.get(r.engine) ?? [];
    arr.push(r);
    byEngine.set(r.engine, arr);
  }

  const kept: RawSearchResult[] = [];
  for (const [engine, batch] of byEngine) {
    let nonTarget = 0;
    const langs = batch.map(r => detectLang(`${r.title} ${r.snippet}`));
    for (const l of langs) if (l !== opts.target && l !== 'und') nonTarget += 1;
    const ratio = nonTarget / batch.length;

    if (ratio > opts.dropThreshold) {
      warnings.push(
        `engine_language_mismatch: ${engine} returned ${Math.round(ratio * 100)}% non-${opts.target}; batch dropped`,
      );
      for (const r of batch) discarded.push({ result: r, reason: 'engine_batch_dropped' });
      log.warn('dropped engine batch for language mismatch', { engine, ratio });
      continue;
    }

    // Drop individual non-target results inside an otherwise-fine batch
    for (let i = 0; i < batch.length; i += 1) {
      if (langs[i] !== opts.target && langs[i] !== 'und') {
        discarded.push({ result: batch[i], reason: 'language_mismatch' });
      } else {
        kept.push(batch[i]);
      }
    }
  }

  return { results: kept, discarded, warnings };
}
