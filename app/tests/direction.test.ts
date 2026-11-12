import assert from 'node:assert/strict';
import { test } from 'node:test';

import { detectDirection, groupByDirection } from '../src/lib/direction.ts';

test('detectDirection: plain scripts', () => {
  assert.equal(detectDirection('مرحبا كيف حالك'), 'rtl');
  assert.equal(detectDirection('Hello, how are you?'), 'ltr');
  assert.equal(detectDirection('12345 🎉'), null);
  assert.equal(detectDirection(''), null);
});

test('detectDirection: mixed text', () => {
  // Arabic sentence that starts with an English word
  assert.equal(detectDirection('Python هي لغة برمجة سهلة وممتعة'), 'rtl');
  // Arabic sentence full of tech terms but starting in Arabic
  assert.equal(detectDirection('شغّل Expo Go على iPhone'), 'rtl');
  // English sentence with one Arabic word
  assert.equal(detectDirection('Use the فلتر option in the settings menu'), 'ltr');
});

test('detectDirection: ignores code, links and URLs', () => {
  assert.equal(detectDirection('شغّل `npm install --save react-native-marked` الحين'), 'rtl');
  assert.equal(detectDirection('افتح [الرابط](https://example.com/some/long/english/path)'), 'rtl');
  assert.equal(detectDirection('```bash\nnpm install\n```'), null);
});

test('groupByDirection: splits English inside Arabic and keeps code with its block', () => {
  const tokens = [
    { type: 'paragraph', raw: 'هذا الحل:\n\n' },
    { type: 'code', raw: '```js\nconsole.log(1)\n```\n' },
    { type: 'paragraph', raw: 'The error says the module was not found.\n\n' },
    { type: 'list', raw: '- أول خطوة\n- ثاني خطوة\n' },
  ];
  const blocks = groupByDirection(tokens, 'rtl');
  assert.deepEqual(blocks.map((b) => b.dir), ['rtl', 'ltr', 'rtl']);
  assert.ok(blocks[0].raw.includes('console.log'));
});

test('groupByDirection: neutral-only content uses the fallback', () => {
  assert.deepEqual(groupByDirection([{ type: 'code', raw: '```\nx\n```' }], 'ltr'), [{ dir: 'ltr', raw: '```\nx\n```' }]);
  assert.deepEqual(groupByDirection([], 'rtl'), []);
});
