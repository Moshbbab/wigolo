import { getConfig } from '../config.js';
import { backfillEmbeddings } from '../cache/backfill-embeddings.js';

const HELP = `wigolo backfill — backfill embeddings for cached pages missing them

Usage:
  wigolo backfill [--dry-run] [--limit N] [--batch-size N]

Options:
  --dry-run           Compute embeddings but do not write to the vector store
  --limit N           Process at most N rows
  --batch-size N      Embed N pages per request (default 32)
  -h, --help          Print this help
`;

function parseNumberFlag(args: string[], name: string): number | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  const raw = args[idx + 1];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function runBackfill(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    return 0;
  }

  const dryRun = args.includes('--dry-run');
  const limit = parseNumberFlag(args, '--limit');
  const batchSize = parseNumberFlag(args, '--batch-size');

  process.stderr.write('[wigolo backfill] scanning cache for rows without embeddings…\n');

  const dataDir = getConfig().dataDir;
  const result = await backfillEmbeddings({
    dataDir,
    limit,
    batchSize,
    dryRun,
    onProgress: (done, total) => {
      if (total > 0 && (done === total || done % 100 === 0)) {
        process.stderr.write(`  ${done} / ${total}\n`);
      }
    },
  });

  if (result.reason) {
    process.stderr.write(`[wigolo backfill] ${result.reason}\n`);
    return 1;
  }

  process.stderr.write(
    `[wigolo backfill] done: scanned=${result.scanned} embedded=${result.embedded} skipped=${result.skipped} errors=${result.errors} model=${result.modelId}${dryRun ? ' (dry-run)' : ''}\n`,
  );
  return result.errors > 0 && result.embedded === 0 ? 1 : 0;
}
