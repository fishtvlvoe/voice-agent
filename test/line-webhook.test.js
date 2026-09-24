import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  handleLineWebhook,
  parseLineWebhookPayload,
  sendLineReply,
  truncateLineMessage,
  verifyLineSignature,
} from '../src/line-webhook.js';

test('verifyLineSignature accepts a valid LINE HMAC signature', async () => {
  const body = JSON.stringify({ events: [] });
  const secret = 'channel-secret';
  const signature = createHmac('sha256', secret).update(body).digest('base64');

  assert.equal(await verifyLineSignature(body, signature, secret), true);
  assert.equal(await verifyLineSignature(body, 'invalid', secret), false);
});

test('parseLineWebhookPayload only returns a valid events array', () => {
  assert.deepEqual(parseLineWebhookPayload('{"events":[{"type":"message"}]}'), {
    events: [{ type: 'message' }],
  });
  assert.deepEqual(parseLineWebhookPayload('{"events":"invalid"}'), { events: [] });
  assert.deepEqual(parseLineWebhookPayload('not-json'), { events: [] });
});

test('truncateLineMessage keeps LINE messages within the platform limit', () => {
  assert.equal(truncateLineMessage('abcdef', 4), 'abc…');
  assert.equal(truncateLineMessage('abc', 4), 'abc');
});

test('handleLineWebhook verifies the signature and replies through LINE', async () => {
  const secret = 'channel-secret';
  const body = JSON.stringify({ events: [{
    type: 'message',
    replyToken: 'reply-token',
    source: { userId: 'U-test' },
    message: { type: 'text', text: '你好' },
  }] });
  const signature = createHmac('sha256', secret).update(body).digest('base64');
  const requests = [];
  const db = {
    prepare(sql) {
      return { bind() {
        return { async all() {
          if (sql.includes('user_memory') || sql.includes('customer_profiles')) return { results: [] };
          throw new Error(`unexpected query: ${sql}`);
        } };
      } };
    },
  };
  const fetchImpl = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (url.includes('x.ai')) {
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '你好，我在。' } }] }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
  const response = await handleLineWebhook(
    new Request('https://voice-agent.test/webhook/line', {
      method: 'POST',
      headers: { 'x-line-signature': signature },
      body,
    }),
    { DB: db, XAI_API_KEY: 'test-key', LINE_CHANNEL_SECRET: secret, LINE_CHANNEL_ACCESS_TOKEN: 'line-token' },
    { fetchImpl },
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).handled, 1);
  assert.equal(requests.at(-1).url, 'https://api.line.me/v2/bot/message/reply');
  assert.equal(requests.at(-1).body.messages[0].text, '你好，我在。');
});

test('handleLineWebhook acknowledges before slow background processing finishes', async () => {
  const secret = 'channel-secret';
  const body = JSON.stringify({ events: [{
    type: 'message',
    replyToken: 'reply-token',
    source: { userId: 'U-test' },
    message: { type: 'text', text: '慢速測試' },
  }] });
  const signature = createHmac('sha256', secret).update(body).digest('base64');
  const requests = [];
  let resolveXai;
  const xaiResponse = new Promise((resolve) => { resolveXai = resolve; });
  let backgroundWork;
  const fetchImpl = async (url, options) => {
    requests.push({ url, body: options?.body ? JSON.parse(options.body) : null });
    if (url.includes('x.ai')) return xaiResponse;
    return new Response('{}', { status: 200 });
  };

  const responsePromise = handleLineWebhook(
    new Request('https://voice-agent.test/webhook/line', {
      method: 'POST',
      headers: { 'x-line-signature': signature },
      body,
    }),
    { XAI_API_KEY: 'test-key', LINE_CHANNEL_SECRET: secret, LINE_CHANNEL_ACCESS_TOKEN: 'line-token' },
    {
      fetchImpl,
      waitUntil(promise) { backgroundWork = promise; },
    },
  );
  const response = await Promise.race([
    responsePromise,
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 100)),
  ]);

  assert.notEqual(response, 'timeout', 'Webhook must acknowledge before xAI finishes');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).queued, 1);
  assert.ok(backgroundWork instanceof Promise);

  resolveXai(new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '背景回覆' } }] }), { status: 200 }));
  await backgroundWork;
  assert.equal(requests.at(-1).url, 'https://api.line.me/v2/bot/message/reply');
});

test('handleLineWebhook rejects an invalid signature before calling downstream services', async () => {
  let downstreamCalls = 0;
  const response = await handleLineWebhook(
    new Request('https://voice-agent.test/webhook/line', {
      method: 'POST',
      headers: { 'x-line-signature': 'invalid' },
      body: JSON.stringify({ events: [{ type: 'message' }] }),
    }),
    { LINE_CHANNEL_SECRET: 'channel-secret', LINE_CHANNEL_ACCESS_TOKEN: 'line-token' },
    { fetchImpl: async () => { downstreamCalls += 1; return new Response('{}'); } },
  );

  assert.equal(response.status, 401);
  assert.equal(downstreamCalls, 0);
});

test('sendLineReply falls back to push when the reply token has expired', async () => {
  const endpoints = [];
  const fetchImpl = async (url) => {
    endpoints.push(url);
    return new Response('{}', { status: url.endsWith('/reply') ? 400 : 200 });
  };

  const result = await sendLineReply({
    replyToken: 'expired-token',
    userId: 'U-test',
    text: '補送內容',
    env: { LINE_CHANNEL_ACCESS_TOKEN: 'line-token' },
    fetchImpl,
  });

  assert.equal(result.mode, 'push');
  assert.deepEqual(endpoints, [
    'https://api.line.me/v2/bot/message/reply',
    'https://api.line.me/v2/bot/message/push',
  ]);
});
