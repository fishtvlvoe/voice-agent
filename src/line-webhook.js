import { indexKnowledgeDocument } from './knowledge.js';
import { generateLineChatReply } from './line-chat.js';

const LINE_TEXT_LIMIT = 5000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function verifyLineSignature(body, signature, channelSecret) {
  if (!body || !signature || !channelSecret) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return toBase64(digest) === signature;
}

export function parseLineWebhookPayload(body) {
  try {
    const payload = JSON.parse(body);
    return { events: Array.isArray(payload?.events) ? payload.events : [] };
  } catch {
    return { events: [] };
  }
}

export function truncateLineMessage(message, maxLength = LINE_TEXT_LIMIT) {
  const text = String(message || '');
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 1)}…`;
}

async function sendLineRequest({ endpoint, body, env, fetchImpl }) {
  if (!env?.LINE_CHANNEL_ACCESS_TOKEN) throw new Error('line_channel_access_token_missing');
  const response = await fetchImpl(`https://api.line.me/v2/bot/message/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return response;
}

export async function sendLineReply({ replyToken, userId, text, env, fetchImpl = globalThis.fetch }) {
  const message = { type: 'text', text: truncateLineMessage(text) };
  const replyResponse = await sendLineRequest({
    endpoint: 'reply',
    body: { replyToken, messages: [message] },
    env,
    fetchImpl,
  });
  if (replyResponse.ok) return { mode: 'reply' };

  // LINE reply token 失效時，只有在知道使用者 ID 的情況才改走 push。
  if ((replyResponse.status === 400 || replyResponse.status === 410) && userId) {
    const pushResponse = await sendLineRequest({
      endpoint: 'push',
      body: { to: userId, messages: [message] },
      env,
      fetchImpl,
    });
    if (pushResponse.ok) return { mode: 'push' };
  }

  console.error('sendLineReply failed', replyResponse.status);
  throw new Error('line_message_send_failed');
}

export async function handleLineWebhook(request, env, { fetchImpl = globalThis.fetch } = {}) {
  const body = await request.text();
  const signature = request.headers.get('x-line-signature');
  const valid = await verifyLineSignature(body, signature, env?.LINE_CHANNEL_SECRET);
  if (!valid) return json({ error: 'invalid_line_signature' }, 401);

  const { events } = parseLineWebhookPayload(body);
  let handled = 0;
  for (const event of events) {
    if (event?.type !== 'message' || event.message?.type !== 'text') continue;
    const lineUserId = event.source?.userId;
    const text = event.message?.text;
    if (!lineUserId || !text || !event.replyToken) continue;

    let replyText;
    try {
      replyText = await generateLineChatReply({ env, lineUserId, text, fetchImpl });
    } catch (error) {
      console.error('handleLineWebhook: chat failed', error?.message || error);
      replyText = '我目前暫時無法處理這則訊息，請稍後再試。';
    }

    await sendLineReply({
      replyToken: event.replyToken,
      userId: lineUserId,
      text: replyText,
      env,
      fetchImpl,
    });
    handled += 1;
  }

  return json({ ok: true, handled }, 200);
}

function hasIngestPermission(request, env) {
  const expected = env?.KNOWLEDGE_INGEST_TOKEN;
  const actual = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  return Boolean(expected && actual && actual === expected);
}

export async function handleKnowledgeIngest(request, env) {
  if (!env?.KNOWLEDGE_INGEST_TOKEN) return json({ error: 'knowledge_ingest_unavailable' }, 503);
  if (!hasIngestPermission(request, env)) return json({ error: 'unauthorized' }, 401);

  const rawBody = await request.text();
  let sourceDoc = request.headers.get('x-source-doc') || 'manual-upload';
  let text = rawBody;
  try {
    const body = JSON.parse(rawBody);
    if (body && typeof body === 'object') {
      sourceDoc = body.sourceDoc || sourceDoc;
      text = body.text;
    }
  } catch {
    // 純文字 body 是刻意支援的簡易上傳格式。
  }

  try {
    const result = await indexKnowledgeDocument(env, { sourceDoc, text });
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    console.error('handleKnowledgeIngest failed', error?.message || error);
    const status = /required|unavailable/.test(error?.message || '') ? 400 : 500;
    return json({ error: error?.message || 'knowledge_ingest_failed' }, status);
  }
}
