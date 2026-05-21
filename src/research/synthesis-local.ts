import { createLogger } from '../logger.js';
import { isLocalLlmEnabled } from '../extraction/v1/local-llm.js';

const log = createLogger('research');

const DEFAULT_MAX_SOURCES = 8;
const DEFAULT_MAX_CHARS_PER_SOURCE = 4000;
const DEFAULT_TIMEOUT_MS = 60_000;

export interface LocalSynthesisOptions {
  maxSources?: number;
  maxCharsPerSource?: number;
  timeoutMs?: number;
}

export interface LocalSynthesisSource {
  url: string;
  title: string;
  markdown: string;
}

export interface LocalSynthesisResult {
  text: string;
  citations: number[];
}

export async function synthesizeLocal(
  question: string,
  sources: LocalSynthesisSource[],
  opts: LocalSynthesisOptions = {},
): Promise<LocalSynthesisResult> {
  if (!isLocalLlmEnabled()) {
    throw new Error('Local LLM not configured. Set WIGOLO_LLM_PROVIDER.');
  }

  const maxSources = opts.maxSources ?? DEFAULT_MAX_SOURCES;
  const maxCharsPerSource = opts.maxCharsPerSource ?? DEFAULT_MAX_CHARS_PER_SOURCE;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const provider = process.env['WIGOLO_LLM_PROVIDER']!;
  const endpoint = provider.includes('/chat/completions')
    ? provider
    : provider.replace(/\/+$/, '') + '/v1/chat/completions';
  const model = process.env['WIGOLO_LLM_MODEL'] ?? 'local';

  const sliced = sources.slice(0, maxSources);
  const sourceBlocks = sliced.map((s, i) => {
    const body = s.markdown.length > maxCharsPerSource
      ? s.markdown.slice(0, maxCharsPerSource)
      : s.markdown;
    return `[${i + 1}] ${s.title}\n${body}`;
  });

  const prompt =
    'You answer questions using ONLY the provided sources. Cite each fact with [N] where N is the source number.\n\n' +
    `Question: ${question}\n\n` +
    `Sources:\n${sourceBlocks.join('\n\n')}`;

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    log.error('local synthesis request failed', { error: String(err) });
    throw err;
  }

  if (!response.ok) {
    throw new Error(`Local LLM endpoint returned ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Local LLM response missing message content');
  }

  return { text: content, citations: extractCitations(content) };
}

function extractCitations(text: string): number[] {
  const matches = text.match(/\[(\d+)\]/g);
  if (!matches) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const m of matches) {
    const n = Number(m.slice(1, -1));
    if (!Number.isFinite(n) || n < 1) continue;
    const idx = n - 1;
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(idx);
  }
  return out;
}
