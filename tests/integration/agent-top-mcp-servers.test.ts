import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAgent } from '../../src/tools/agent.js';
import type { SearchEngine, RawSearchResult, AgentInput } from '../../src/types.js';
import type { SmartRouter } from '../../src/fetch/router.js';

const brandCollisionResults: RawSearchResult[] = [
  {
    title: 'Microsoft Lists app — track work, organize lists',
    url: 'https://www.microsoft.com/en-us/microsoft-365/microsoft-lists',
    snippet: 'Create lists, share, and track tasks across your team.',
    relevance_score: 0.97,
    engine: 'integration-stub',
  },
  {
    title: 'Stars - NASA Science',
    url: 'https://science.nasa.gov/universe/stars/',
    snippet: 'Learn about stars across the universe and stellar evolution.',
    relevance_score: 0.95,
    engine: 'integration-stub',
  },
  {
    title: 'modelcontextprotocol/servers — official MCP server implementations',
    url: 'https://github.com/modelcontextprotocol/servers',
    snippet:
      'Open-source Model Context Protocol servers with language adapters and commit history.',
    relevance_score: 0.7,
    engine: 'integration-stub',
  },
  {
    title: 'punkpeye/awesome-mcp-servers — curated MCP server list',
    url: 'https://github.com/punkpeye/awesome-mcp-servers',
    snippet: 'A curated open-source list of Model Context Protocol servers.',
    relevance_score: 0.65,
    engine: 'integration-stub',
  },
];

const stubEngine: SearchEngine = {
  name: 'integration-stub',
  search: vi.fn().mockResolvedValue(brandCollisionResults),
};

function htmlFor(title: string, body: string): string {
  return `<html><head><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p></body></html>`;
}

const htmlPages: Record<string, string> = {
  'https://www.microsoft.com/en-us/microsoft-365/microsoft-lists': htmlFor(
    'Microsoft Lists',
    'Create lists, share, track tasks across your team.',
  ),
  'https://science.nasa.gov/universe/stars/': htmlFor(
    'Stars - NASA Science',
    'Learn about stars across the universe and stellar evolution.',
  ),
  'https://github.com/modelcontextprotocol/servers': htmlFor(
    'modelcontextprotocol/servers',
    'Open-source Model Context Protocol servers with language adapters and commit history.',
  ),
  'https://github.com/punkpeye/awesome-mcp-servers': htmlFor(
    'punkpeye/awesome-mcp-servers',
    'A curated open-source list of Model Context Protocol servers.',
  ),
};

const stubRouter = {
  fetch: vi.fn().mockImplementation((url: string) => {
    const html = htmlPages[url] ?? htmlFor('Unknown', 'Default content.');
    return Promise.resolve({
      url,
      finalUrl: url,
      html,
      contentType: 'text/html',
      statusCode: 200,
      method: 'http' as const,
      headers: {},
    });
  }),
} as unknown as SmartRouter;

describe('agent — MCP servers brand-collision rank', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps brand-collision domains out of the top-3 fetched sources', async () => {
    const input: AgentInput = {
      prompt: 'list top 5 open-source MCP servers with stars, language, last commit',
      max_pages: 3,
    };

    const __r = await handleAgent(input, [stubEngine], stubRouter);
    const result = __r.ok ? __r.data : ({ ...__r } as any);

    const top3 = result.sources.slice(0, 3).map((s: { url: string }) => s.url);
    expect(top3).not.toContain(
      'https://www.microsoft.com/en-us/microsoft-365/microsoft-lists',
    );
    expect(top3).not.toContain('https://science.nasa.gov/universe/stars/');
    expect(top3).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/modelcontextprotocol|awesome-mcp-servers/),
      ]),
    );
  });
});
