import { describe, expect, it } from 'vitest';
import { applyAuthorityBoost } from '../../../../src/search/reranker/authority-boost.js';
import type { MergedSearchResult } from '../../../../src/search/dedup.js';

function mk(url: string, score = 0.5): MergedSearchResult {
  return { title: url, url, snippet: '', relevance_score: score, engines: ['test'] };
}

describe('applyAuthorityBoost', () => {
  it('boosts subject-domain match (redis.io for redis query)', () => {
    const out = applyAuthorityBoost('what is the default redis port', [
      mk('https://example.blog/post/redis'),
      mk('https://redis.io/docs/latest/'),
    ]);
    expect(out[1].relevance_score).toBeGreaterThan(0.5);
    expect(out[0].relevance_score).toBe(0.5);
  });

  it('does not boost ranking authority hosts on non-rank queries', () => {
    const out = applyAuthorityBoost('redis configuration tutorial', [
      mk('https://www.tiobe.com/tiobe-index/'),
    ]);
    expect(out[0].relevance_score).toBeCloseTo(0.5);
  });

  it('boosts ranking authority hosts on rank-intent queries', () => {
    const out = applyAuthorityBoost('best programming language for systems work', [
      mk('https://random.blog/best-langs'),
      mk('https://www.tiobe.com/tiobe-index/'),
      mk('https://octoverse.github.com/'),
      mk('https://insights.stackoverflow.com/survey/2024'),
    ]);
    expect(out[1].relevance_score).toBeGreaterThan(0.5);
    expect(out[2].relevance_score).toBeGreaterThan(0.5);
    expect(out[3].relevance_score).toBeGreaterThan(0.5);
    expect(out[0].relevance_score).toBeCloseTo(0.5);
  });

  it('detects rank-intent across synonyms', () => {
    for (const q of [
      'most popular programming language 2026',
      'top JavaScript framework',
      'language ranking by adoption',
      'widely-used database',
    ]) {
      const out = applyAuthorityBoost(q, [mk('https://redmonk.com/rankings/')]);
      expect(out[0].relevance_score).toBeGreaterThan(0.5);
    }
  });

  it('stacks rank-authority + subject boost when both fire', () => {
    const subjectOnly = applyAuthorityBoost('python tutorial', [mk('https://www.python.org/')]);
    const rankOnly = applyAuthorityBoost('best programming language', [mk('https://www.tiobe.com/tiobe-index/')]);
    const both = applyAuthorityBoost('most popular python frameworks', [mk('https://www.python.org/')]);
    expect(both[0].relevance_score).toBeGreaterThanOrEqual(subjectOnly[0].relevance_score);
    expect(rankOnly[0].relevance_score).toBeGreaterThan(0.5);
  });

  it('caps relevance_score at 1.0', () => {
    const out = applyAuthorityBoost('best python frameworks', [mk('https://docs.python.org/3/', 0.95)]);
    expect(out[0].relevance_score).toBeLessThanOrEqual(1);
  });
});
