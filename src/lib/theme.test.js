import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHex, readableAccent, textOnAccent, DEFAULT_ACCENT } from './theme.js';

test('hex input is cleaned up or rejected', () => {
  assert.equal(normalizeHex('3B82F6'), '#3b82f6');
  assert.equal(normalizeHex(' #FF7854 '), '#ff7854');
  assert.equal(normalizeHex('#fff'), null);
  assert.equal(normalizeHex('blue'), null);
  assert.equal(normalizeHex(undefined), null);
});

test('readable colours are kept as picked', () => {
  assert.equal(readableAccent('#ff7854'), '#ff7854');
  assert.equal(readableAccent('#facc15'), '#facc15');
});

test('colours too dark for black are lightened, never darkened', () => {
  const navy = readableAccent('#1e3a8a');
  assert.notEqual(navy, '#1e3a8a');
  const [r, g, b] = [1, 3, 5].map(i => parseInt(navy.slice(i, i + 2), 16));
  assert.ok(b > 0x8a && r > 0x1e && g > 0x3a, `expected lighter than #1e3a8a, got ${navy}`);
  assert.notEqual(readableAccent('#000000'), '#000000');
});

test('invalid input falls back to the default accent', () => {
  assert.equal(readableAccent('not a colour'), DEFAULT_ACCENT);
});

test('button text picks the higher-contrast colour', () => {
  assert.equal(textOnAccent('#facc15'), '#000000');
  assert.equal(textOnAccent('#ff7854'), '#000000');
  assert.equal(textOnAccent('#7c3aed'), '#ffffff');
});
