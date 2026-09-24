import test from 'node:test';
import assert from 'node:assert/strict';

import { reciprocalRankFusion, splitDocumentIntoChunks } from '../src/knowledge.js';

test('splitDocumentIntoChunks keeps paragraphs together and respects the limit', () => {
  const chunks = splitDocumentIntoChunks('第一段內容。\n\n第二段內容。\n\n第三段內容。', 8);

  assert.deepEqual(chunks, ['第一段內容。', '第二段內容。', '第三段內容。']);
});

test('splitDocumentIntoChunks breaks an oversized paragraph without dropping text', () => {
  const chunks = splitDocumentIntoChunks('abcdefghij', 4);

  assert.deepEqual(chunks, ['abcd', 'efgh', 'ij']);
});

test('reciprocalRankFusion merges vector and keyword matches by chunk id', () => {
  const result = reciprocalRankFusion([
    [
      { id: 'a', text: 'A', score: 0.9 },
      { id: 'b', text: 'B', score: 0.8 },
    ],
    [
      { id: 'b', text: 'B', score: 1 },
      { id: 'c', text: 'C', score: 0.7 },
    ],
  ]);

  assert.equal(result[0].id, 'b');
  assert.deepEqual(result.map((item) => item.id), ['b', 'a', 'c']);
});
