import { describe, it, expect, vi } from 'vitest';
import {
  solverFetch,
  hostedReaderFetch,
  type EscapeHatchConfig,
} from '../../../src/fetch/escape-hatch.js';

const baseCfg: EscapeHatchConfig = {
  solverUrl: null,
  hostedReaderUrl: null,
  fetchAllowPrivate: false,
  maxRedirects: 5,
  fetchTimeoutMs: 10_000,
};

/** Build a minimal Response-like object for the injected fetch. */
function res(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: init.headers ?? { 'content-type': 'application/json' },
  });
}

describe('solverFetch — off by default', () => {
  it('returns null when solverUrl is unset (never calls fetch)', async () => {
    const spy = vi.fn();
    const out = await solverFetch('https://target.example.com', baseCfg, { fetchImpl: spy });
    expect(out).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('hostedReaderFetch — off by default', () => {
  it('returns null when hostedReaderUrl is unset (never calls fetch)', async () => {
    const spy = vi.fn();
    const out = await hostedReaderFetch('https://target.example.com', baseCfg, { fetchImpl: spy });
    expect(out).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('solverFetch — happy path', () => {
  it('POSTs the target to a loopback solver and returns its cleared HTML', async () => {
    const cfg = { ...baseCfg, solverUrl: 'http://127.0.0.1:8191/v1' };
    const fetchImpl = vi.fn(async () =>
      res(JSON.stringify({ solution: { response: '<html>cleared</html>', status: 200 } })),
    );
    const out = await solverFetch('https://target.example.com/page', cfg, { fetchImpl });
    expect(out).not.toBeNull();
    expect(out!.html).toContain('cleared');
    expect(out!.method).toBe('http');
    // The solver endpoint was called (loopback allowed).
    expect(fetchImpl).toHaveBeenCalledOnce();
    const calledUrl = (fetchImpl.mock.calls[0] as unknown[])[0];
    expect(String(calledUrl)).toContain('127.0.0.1:8191');
  });

  it('allows a localhost solver URL', async () => {
    const cfg = { ...baseCfg, solverUrl: 'http://localhost:8191' };
    const fetchImpl = vi.fn(async () =>
      res(JSON.stringify({ solution: { response: '<html>ok</html>', status: 200 } })),
    );
    const out = await solverFetch('https://target.example.com', cfg, { fetchImpl });
    expect(out).not.toBeNull();
  });
});

describe('solverFetch — SSRF guards', () => {
  it('refuses a target URL that is a metadata IP (169.254.169.254)', async () => {
    const cfg = { ...baseCfg, solverUrl: 'http://127.0.0.1:8191' };
    const fetchImpl = vi.fn();
    const out = await solverFetch('http://169.254.169.254/latest/meta-data', cfg, { fetchImpl });
    expect(out).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a solver URL that is a metadata IP', async () => {
    const cfg = { ...baseCfg, solverUrl: 'http://169.254.169.254' };
    const fetchImpl = vi.fn();
    const out = await solverFetch('https://target.example.com', cfg, { fetchImpl });
    expect(out).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a target on a private 10.x when allowPrivate is false', async () => {
    const cfg = { ...baseCfg, solverUrl: 'http://127.0.0.1:8191' };
    const fetchImpl = vi.fn();
    const out = await solverFetch('http://10.1.2.3/internal', cfg, { fetchImpl });
    expect(out).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('hostedReaderFetch — SSRF guards + redirects', () => {
  it('refuses a target metadata IP', async () => {
    const cfg = { ...baseCfg, hostedReaderUrl: 'https://reader.example.com' };
    const fetchImpl = vi.fn();
    const out = await hostedReaderFetch('http://169.254.169.254/', cfg, { fetchImpl });
    expect(out).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses when the reader 302-redirects to a metadata IP', async () => {
    const cfg = { ...baseCfg, hostedReaderUrl: 'https://reader.example.com' };
    const fetchImpl = vi.fn(async () =>
      res('', { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    );
    const out = await hostedReaderFetch('https://target.example.com', cfg, { fetchImpl });
    expect(out).toBeNull();
  });

  it('refuses when the reader 302-redirects to a 10.x and allowPrivate is false', async () => {
    const cfg = { ...baseCfg, hostedReaderUrl: 'https://reader.example.com' };
    const fetchImpl = vi.fn(async () =>
      res('', { status: 302, headers: { location: 'http://10.0.0.5/' } }),
    );
    const out = await hostedReaderFetch('https://target.example.com', cfg, { fetchImpl });
    expect(out).toBeNull();
  });

  it('FOLLOWS a 302 to a 10.x when allowPrivate is true', async () => {
    const cfg = {
      ...baseCfg,
      hostedReaderUrl: 'https://reader.example.com',
      fetchAllowPrivate: true,
    };
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return res('', { status: 302, headers: { location: 'http://10.0.0.5/rendered' } });
      return res('<html>private-rendered</html>', { headers: { 'content-type': 'text/html' } });
    });
    const out = await hostedReaderFetch('https://target.example.com', cfg, { fetchImpl });
    expect(out).not.toBeNull();
    expect(out!.html).toContain('private-rendered');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('stops after the hop cap (redirect loop) and returns null', async () => {
    const cfg = { ...baseCfg, hostedReaderUrl: 'https://reader.example.com', maxRedirects: 2 };
    const fetchImpl = vi.fn(async () =>
      res('', { status: 302, headers: { location: 'https://reader.example.com/again' } }),
    );
    const out = await hostedReaderFetch('https://target.example.com', cfg, { fetchImpl });
    expect(out).toBeNull();
  });
});

describe('solverFetch — cookie scoping', () => {
  it('never surfaces a solver-returned cookie scoped to a different domain', async () => {
    // A solver returns a cookie for domain A; solverFetch is invoked for a
    // target on domain B. The returned result must not carry A's cookie for B.
    const cfg = { ...baseCfg, solverUrl: 'http://127.0.0.1:8191' };
    const fetchImpl = vi.fn(async () =>
      res(
        JSON.stringify({
          solution: {
            response: '<html>ok</html>',
            status: 200,
            cookies: [{ name: 'cf_clearance', value: 'x', domain: 'attacker.example' }],
          },
        }),
      ),
    );
    const out = await solverFetch('https://victim.example.com/page', cfg, { fetchImpl });
    expect(out).not.toBeNull();
    // The result must not inject a cross-domain cookie into headers.
    const cookieHeader = out!.headers['set-cookie'] ?? out!.headers['cookie'] ?? '';
    expect(cookieHeader).not.toContain('attacker.example');
  });
});
