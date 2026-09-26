import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChatTools,
  buildLineChatSystemPrompt,
  generateLineChatReply,
  normalizeMemoryField,
  queryVoiceIntakeHistory,
} from '../src/line-chat.js';
import { queryKnowledgeBase } from '../src/knowledge.js';

test('buildChatTools uses OpenAI-compatible function tool shape', () => {
  const names = buildChatTools().map((tool) => tool.function.name);

  assert.deepEqual(names, [
    'remember_info',
    'query_voice_intake_history',
    'query_knowledge_base',
  ]);
  assert.equal(buildChatTools()[0].type, 'function');
});

test('buildLineChatSystemPrompt includes memory context but never exposes the LINE user id', () => {
  const prompt = buildLineChatSystemPrompt({
    lineUserId: 'U-secret-id',
    memory: { phone: '0912345678' },
    customerProfile: { display_name: '小明', member_tier: 'VIP' },
    now: new Date('2026-09-24T04:00:00.000Z'),
  });

  assert.match(prompt, /0912345678/);
  assert.match(prompt, /小明/);
  assert.doesNotMatch(prompt, /U-secret-id/);
});

test('normalizeMemoryField accepts supported aliases and rejects unsupported fields', () => {
  assert.equal(normalizeMemoryField('手機'), 'phone');
  assert.equal(normalizeMemoryField('Email'), 'email');
  assert.equal(normalizeMemoryField('生日'), null);
});

test('generateLineChatReply executes a history tool call before returning the answer', async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() {
              if (sql.includes('user_memory')) return { results: [{ field_key: 'phone', field_value: '0912345678' }] };
              if (sql.includes('customer_profiles')) return { results: [] };
              if (sql.includes('voice_intake_records')) return {
                results: [{ id: 1, form_type: 'generic_intake', fields_json: '{"topic":"測試"}', created_at: 1 }],
              };
              throw new Error(`unexpected query: ${sql} ${params.join(',')}`);
            },
          };
        },
      };
    },
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        choices: [{ message: {
          role: 'assistant',
          tool_calls: [{ id: 'call-history', type: 'function', function: {
            name: 'query_voice_intake_history', arguments: '{"limit":1}',
          } }],
        } }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '你最近記錄了測試。' } }] }), { status: 200 });
  };

  const reply = await generateLineChatReply({
    env: { DB: db, OPENAI_API_KEY: 'test-key', OPENAI_TEXT_MODEL: 'gpt-4.1' },
    lineUserId: 'U-test',
    text: '我之前記錄過什麼？',
    fetchImpl,
  });

  assert.equal(reply, '你最近記錄了測試。');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0].body.model, 'gpt-4.1');
  assert.match(calls[0].body.messages[0].content, /0912345678/);
  assert.equal(calls[1].body.messages.at(-1).role, 'tool');
  assert.match(calls[1].body.messages.at(-1).content, /測試/);
});

test('queryKnowledgeBase merges vector and keyword matches and hydrates source text', async () => {
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() {
              if (sql.includes('chunk_text LIKE')) {
                assert.equal(params.at(-1), 4);
                return {
                  results: [{
                    id: 'chunk-shared',
                    chunk_text: 'LINE 助理可以記錄文字與語音內容。',
                    source_doc: 'guide.md',
                    created_at: 10,
                  }],
                };
              }
              throw new Error(`unexpected query: ${sql}`);
            },
          };
        },
      };
    },
  };
  const env = {
    DB: db,
    AI: {
      async run(model, input) {
        assert.equal(model, '@cf/baai/bge-m3');
        assert.deepEqual(input.text, ['LINE 語音記錄']);
        return { data: [[0.1, 0.2, 0.3]] };
      },
    },
    KNOWLEDGE_INDEX: {
      async query(vector, options) {
        assert.deepEqual(vector, [0.1, 0.2, 0.3]);
        assert.equal(options.returnMetadata, 'all');
        return {
          matches: [
            { id: 'chunk-shared', score: 0.98, metadata: { source_doc: 'guide.md' } },
            { id: 'chunk-vector-only', score: 0.9, metadata: { source_doc: 'faq.md', chunk_text: '語音內容會進入共同記憶流程。' } },
          ],
        };
      },
    },
  };

  const results = await queryKnowledgeBase(env, 'LINE 語音記錄', 2);

  assert.equal(results.length, 2);
  assert.equal(results[0].id, 'chunk-shared');
  assert.match(results[0].text, /記錄文字與語音/);
  assert.equal(results[0].sourceDoc, 'guide.md');
  assert.equal(results[1].id, 'chunk-vector-only');
});

test('generateLineChatReply executes the knowledge-base tool before answering', async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() {
              if (sql.includes('user_memory')) return { results: [] };
              if (sql.includes('customer_profiles')) return { results: [] };
              if (sql.includes('chunk_text LIKE')) return {
                results: [{ id: 'chunk-1', chunk_text: '測試知識內容。', source_doc: 'test.md', created_at: 1 }],
              };
              throw new Error(`unexpected query: ${sql} ${params.join(',')}`);
            },
          };
        },
      };
    },
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ choices: [{ message: {
        role: 'assistant',
        tool_calls: [{ id: 'call-knowledge', type: 'function', function: {
          name: 'query_knowledge_base', arguments: '{"query":"測試知識"}',
        } }],
      } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '根據測試知識內容回答。' } }] }), { status: 200 });
  };

  const reply = await generateLineChatReply({
    env: {
      DB: db,
      OPENAI_API_KEY: 'test-key',
      OPENAI_TEXT_MODEL: 'gpt-4.1',
      AI: { run: async () => ({ data: [[0.1, 0.2, 0.3]] }) },
      KNOWLEDGE_INDEX: { query: async () => ({ matches: [] }) },
    },
    lineUserId: 'U-test',
    text: '測試知識',
    fetchImpl,
  });

  assert.equal(reply, '根據測試知識內容回答。');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.messages.at(-1).role, 'tool');
  assert.match(calls[1].body.messages.at(-1).content, /測試知識內容/);
});

test('generateLineChatReply rejects a missing OpenAI API key', async () => {
  await assert.rejects(
    generateLineChatReply({
      env: {},
      lineUserId: 'U-test',
      text: '你好',
      fetchImpl: async () => new Response('{}'),
    }),
    /openai_api_key_missing/
  );
});

test('queryVoiceIntakeHistory isolates records by line user id', async () => {
  const db = {
    prepare(sql) {
      return {
        bind(lineUserId) {
          return {
            async all() {
              assert.match(sql, /WHERE line_user_id = \?/);
              return { results: [{ id: lineUserId, form_type: 'generic_intake', fields_json: '{}', created_at: 1 }] };
            },
          };
        },
      };
    },
  };

  const userA = await queryVoiceIntakeHistory(db, 'U-a', 5);
  const userB = await queryVoiceIntakeHistory(db, 'U-b', 5);

  assert.equal(userA[0].id, 'U-a');
  assert.equal(userB[0].id, 'U-b');
});
