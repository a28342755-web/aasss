// Model answers go into innerHTML, on a page that can call the native bridge: renderMarkdown must keep every tag as text.
// Run: node --test app/src/test/js/markdown.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../main/assets/app.js', import.meta.url), 'utf8');
const pure = src.slice(src.indexOf('function escapeHtml'), src.indexOf('function messageElement'));   // the pure helpers, no DOM
const { renderMarkdown } = new Function(`${pure}; return { renderMarkdown };`)();

test('HTML in an answer stays text', () => {
  const { html } = renderMarkdown('<img src=x onerror=alert(1)>\n**<b>x</b>**\n```js\n</code><script>alert(1)</script>\n```');
  assert.doesNotMatch(html, /<img|<script|<b>/i);
});

test('a stray code placeholder is shown as text, not a crash', () => {
  assert.match(renderMarkdown('@@CODE_3@@').html, /<p>@@CODE_3@@<\/p>/);
});
