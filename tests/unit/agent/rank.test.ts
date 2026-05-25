import { describe, it, expect } from 'vitest';
import { rankAgentSearchResults } from '../../../src/agent/rank.js';
import type { MergedSearchResult } from '../../../src/search/dedup.js';

function makeResult(overrides: Partial<MergedSearchResult> & { url: string; title: string }): MergedSearchResult {
  return {
    title: overrides.title,
    url: overrides.url,
    snippet: overrides.snippet ?? '',
    relevance_score: overrides.relevance_score ?? 0.5,
    engines: overrides.engines ?? ['agent'],
  };
}

describe('rankAgentSearchResults', () => {
  it('pushes real MCP-server result above off-topic brand-style hits for an MCP-server query', () => {
    const prompt = 'list top 5 open-source MCP servers with stars, language, last commit';
    const results = [
      makeResult({
        url: 'https://www.microsoft.com/en-us/microsoft-365/microsoft-lists',
        title: 'Microsoft Lists app — track work, organize lists',
        snippet: 'Create lists, share, and track tasks across your team.',
        relevance_score: 0.95,
      }),
      makeResult({
        url: 'https://science.nasa.gov/universe/stars/',
        title: 'Stars - NASA Science',
        snippet: 'Learn about stars across the universe and stellar evolution.',
        relevance_score: 0.93,
      }),
      makeResult({
        url: 'https://github.com/modelcontextprotocol/servers',
        title: 'modelcontextprotocol/servers — official MCP server implementations',
        snippet: 'Open-source Model Context Protocol servers with language adapters and commit history.',
        relevance_score: 0.7,
      }),
    ];

    const ranked = rankAgentSearchResults(prompt, results);
    expect(ranked[0].url).toBe('https://github.com/modelcontextprotocol/servers');
    expect(ranked.slice(0, 3).map((r) => r.url)).not.toContain(
      'https://www.microsoft.com/en-us/microsoft-365/microsoft-lists',
    );
  });

  it('applies brand-domain penalty: stars.com cannot beat a real-aligned result', () => {
    const prompt = 'compare pgvector hnsw ef_search tuning for postgres';
    const results = [
      makeResult({
        url: 'https://stars.com/pgvector-hosting',
        title: 'Stars Hosting — pgvector plans',
        snippet: 'Plans starting at $9/mo with pgvector enabled.',
        relevance_score: 0.99,
      }),
      makeResult({
        url: 'https://jkatz05.com/post/postgres/pgvector-hnsw-tuning/',
        title: 'pgvector HNSW ef_search tuning guide',
        snippet: 'How to tune hnsw ef_search for postgres pgvector workloads.',
        relevance_score: 0.6,
      }),
    ];

    const ranked = rankAgentSearchResults(prompt, results);
    expect(ranked[0].url).toBe('https://jkatz05.com/post/postgres/pgvector-hnsw-tuning/');
  });

  it('returns input unchanged when prompt is empty', () => {
    const results = [
      makeResult({ url: 'https://a.example', title: 'A', relevance_score: 0.8 }),
      makeResult({ url: 'https://b.example', title: 'B', relevance_score: 0.3 }),
    ];
    const ranked = rankAgentSearchResults('', results);
    expect(ranked.map((r) => r.url)).toEqual(['https://a.example', 'https://b.example']);
  });
});
