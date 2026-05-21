import { describe, it, expect } from 'vitest';
import { BingNewsEngine } from '../../../../src/search/engines/bing-news.js';

describe('BingNewsEngine.parseResults', () => {
  const engine = new BingNewsEngine();

  it('parses a legacy .news-card layout with .news_dt date', () => {
    const html = `
      <html><body>
      <li class="news-card">
        <h3><a href="https://news.example/story-1">First story</a></h3>
        <div class="snippet">Quarterly results beat expectations.</div>
        <div class="source">
          <time class="news_dt">Jan 15, 2025</time>
        </div>
      </li>
      </body></html>
    `;

    const results = engine.parseResults(html, 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('First story');
    expect(results[0].url).toBe('https://news.example/story-1');
    expect(results[0].snippet).toContain('Quarterly results');
    expect(results[0].engine).toBe('bing_news');
    expect(results[0].published_date).toMatch(/^2025-01-15/);
  });

  it('parses modern .news-card-body cards with a relative time', () => {
    const html = `
      <html><body>
      <div class="news-card-body">
        <a class="news-card-title" href="https://news.example/story-2">Second story</a>
        <div class="news-card-body-text">Major announcement today.</div>
        <span aria-label="3 hours ago">3 hours ago</span>
      </div>
      </body></html>
    `;

    const results = engine.parseResults(html, 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Second story');
    expect(results[0].published_date).toBeDefined();
  });

  it('decodes /ck/a tracker URLs in the link href', () => {
    const target = 'https://news.example/wrapped';
    const encoded = Buffer.from(target).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const trackerUrl = `https://www.bing.com/ck/a?u=a1${encoded}`;

    const html = `
      <html><body>
      <li class="news-card">
        <h3><a href="${trackerUrl}">Wrapped story</a></h3>
        <div class="snippet">Body text.</div>
      </li>
      </body></html>
    `;

    const results = engine.parseResults(html, 5);
    expect(results[0].url).toBe(target);
  });

  it('respects the maxResults cap', () => {
    const cards = Array.from({ length: 6 }, (_, i) => `
      <li class="news-card">
        <h3><a href="https://news.example/s/${i}">Story ${i}</a></h3>
        <div class="snippet">Snippet ${i}</div>
      </li>
    `).join('');
    const html = `<html><body>${cards}</body></html>`;

    const results = engine.parseResults(html, 3);
    expect(results).toHaveLength(3);
  });

  it('drops items missing either title or URL', () => {
    const html = `
      <html><body>
      <li class="news-card"><h3><a href="">No href</a></h3></li>
      <li class="news-card"><h3><a href="https://news.example/ok">OK</a></h3><div class="snippet">x</div></li>
      </body></html>
    `;

    const results = engine.parseResults(html, 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('OK');
  });

  it('falls back to b_algo when the news rail renders inline', () => {
    const html = `
      <html><body>
      <li class="b_algo">
        <h2><a href="https://news.example/inline">Inline story</a></h2>
        <p class="b_caption"><span aria-label="2 days ago">2 days ago</span> Some context.</p>
      </li>
      </body></html>
    `;

    const results = engine.parseResults(html, 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Inline story');
  });
});
