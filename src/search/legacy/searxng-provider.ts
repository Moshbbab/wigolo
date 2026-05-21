import type { SearchProvider, SearchContext } from '../../providers/search-provider.js';
import type { SearchInput, SearchOutput, StageResult } from '../../types.js';
import { runSearxngSearch } from './searxng-orchestrator.js';

export class LegacySearxngProvider implements SearchProvider {
  readonly name = 'searxng' as const;

  async search(input: SearchInput, ctx: SearchContext): Promise<StageResult<SearchOutput>> {
    return runSearxngSearch(input, ctx);
  }
}
