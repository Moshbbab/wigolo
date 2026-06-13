import { parseHTML } from 'linkedom';
import { createLogger } from '../../logger.js';

const log = createLogger('extract');

const MIN_ROOT_TEXT = 200;
const MIN_ROOT_RATIO = 0.4;

function textLen(el: Element | null): number {
  if (!el) return 0;
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().length;
}

function densest<T extends Element>(els: T[]): T | null {
  let best: T | null = null;
  let bestLen = -1;
  for (const el of els) {
    const len = textLen(el);
    if (len > bestLen) {
      bestLen = len;
      best = el;
    }
  }
  return best;
}

function selectRoot(document: Document): Element | null {
  const mains = Array.from(document.querySelectorAll('main'));
  if (mains.length === 1) return mains[0];
  if (mains.length > 1) return densest(mains);

  const roleMain = document.querySelector('[role="main"]');
  if (roleMain) return roleMain;

  const articles = Array.from(document.querySelectorAll('article'));
  if (articles.length === 1) return articles[0];
  if (articles.length > 1) return densest(articles);

  return null;
}

// body text with nav/header/footer subtrees removed — the ratio denominator.
function chromeExcludedBodyText(body: Element): number {
  const clone = body.cloneNode(true) as Element;
  for (const el of Array.from(clone.querySelectorAll('nav, header, footer'))) {
    el.parentNode?.removeChild(el);
  }
  return textLen(clone);
}

// keep only the root's ancestor chain inside <body>; <head> untouched.
function pruneToRoot(body: Element, root: Element): void {
  let node: Node = root;
  while (node.parentNode && node !== body) {
    const parent = node.parentNode;
    for (const sib of Array.from(parent.childNodes)) {
      if (sib !== node) parent.removeChild(sib);
    }
    node = parent;
  }
}

// Cheap reject for the common no-semantic-root page (article/blog/news with a
// plain <body>): skip the full parse entirely when no content-root tag exists.
// Tolerates attributes (`<main id=...`) via the `[\s>]` / `role` forms.
const HAS_CONTENT_ROOT = /<main[\s>]|role=["']?main|<article[\s>]/i;

export function isolateContentRoot(html: string): string {
  if (!HAS_CONTENT_ROOT.test(html)) return html;
  try {
    const { document } = parseHTML(html);
    const body = document.querySelector('body');
    if (!body) return html;

    const root = selectRoot(document);
    if (!root) return html;

    const rootText = textLen(root);
    if (rootText < MIN_ROOT_TEXT) return html;

    const contentBody = chromeExcludedBodyText(body);
    if (contentBody <= 0 || rootText / contentBody < MIN_ROOT_RATIO) return html;

    pruneToRoot(body, root);
    return document.toString();
  } catch (err) {
    log.warn('content-root isolation failed', { error: String(err) });
    return html;
  }
}
