import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import {
  getVersion,
  printHelp,
  printVersion,
  printUnknownCommand,
} from '../../../src/cli/help.js';

function captureStream(): { stream: NodeJS.WriteStream; output: () => string } {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  }) as unknown as NodeJS.WriteStream;
  return { stream, output: () => Buffer.concat(chunks).toString('utf-8') };
}

describe('getVersion', () => {
  it('returns semver from package.json', () => {
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('printHelp', () => {
  it('lists usage + all known subcommands + options', () => {
    const { stream, output } = captureStream();
    printHelp(stream);
    const text = output();
    expect(text).toContain('Usage:');
    expect(text).toContain('warmup');
    expect(text).toContain('serve');
    expect(text).toContain('health');
    expect(text).toContain('doctor');
    expect(text).toContain('auth');
    expect(text).toContain('plugin');
    expect(text).toContain('shell');
    expect(text).toContain('init');
    expect(text).toContain('uninstall');
    expect(text).toContain('setup');
    expect(text).toContain('status');
    expect(text).toContain('--help');
    expect(text).toContain('--version');
  });
});

describe('printVersion', () => {
  it('writes "wigolo <semver>\\n"', () => {
    const { stream, output } = captureStream();
    printVersion(stream);
    expect(output()).toMatch(/^wigolo \d+\.\d+\.\d+(.*)?\n$/);
  });
});

describe('printUnknownCommand', () => {
  it('prefixes unknown command name then prints help', () => {
    const { stream, output } = captureStream();
    printUnknownCommand('foobar', stream);
    const text = output();
    expect(text).toContain("unknown command 'foobar'");
    expect(text).toContain('Usage:');
  });
});
