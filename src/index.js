// 通用語音助理骨架（Cloudflare Workers）。
// 流程：LIFF 頁面 liff.init 拿身分 → 跟這支 Worker 換 xAI 短效期 client secret →
// 瀏覽器直接開 WebSocket 連 xAI Realtime API → 語音 AI 判斷欄位收集完後呼叫
// /api/voice-intake/submit（帶 LINE idToken 驗證身分）把結構化資料寫進 D1。
//
// 原系統這條線是轉發給另一個 Worker（LINE 對話機器人）處理推播確認，這裡拔掉，
// 直接把資料寫進本專案自己的 voice_intake_records 表。要接別的下游（通知、其他
// 系統），在 handleVoiceIntakeSubmitFromLiff 裡加就好，不影響其他模組。
import { tify } from 'chinese-conv';
import { VOICE_FORMS } from './liff/voice-form-schema.js';
import { verifyLineToken } from './line-auth.js';
import { listContacts, SEED_CONTACTS } from './contacts.js';
import { handleKnowledgeIngest, handleLineWebhook } from './line-webhook.js';
import { queryKnowledgeBase } from './knowledge.js';
import { queryVoiceIntakeHistory } from './line-chat.js';

// 資料清洗範例：語音辨識偶爾會混出簡體字，寫進資料庫前統一轉成繁體。
export function normalizeFieldsToTraditionalChinese(fields) {
  if (!fields || typeof fields !== 'object') return fields;
  try {
    const normalized = Array.isArray(fields) ? [] : {};
    for (const [key, value] of Object.entries(fields)) {
      normalized[key] = typeof value === 'string' ? (() => { try { return tify(value); } catch { return value; } })() : value;
    }
    return normalized;
  } catch (err) {
    console.error('normalizeFieldsToTraditionalChinese failed:', err?.message || err);
    return fields;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readJsonObject(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

async function verifyLineIdentity(idToken, env, claimedLineUserId) {
  if (typeof idToken !== 'string' || idToken.trim() === '' || !env.LIFF_ID) {
    return { ok: false, status: 401, error: 'INVALID_LINE_TOKEN' };
  }
  try {
    const verified = await verifyLineToken(idToken, env.LIFF_ID);
    if (verified.lineUserId !== claimedLineUserId) {
      return { ok: false, status: 403, error: 'LINE identity mismatch' };
    }
    return { ok: true, lineUserId: verified.lineUserId };
  } catch {
    return { ok: false, status: 401, error: 'INVALID_LINE_TOKEN' };
  }
}

const CUSTOMER_PROFILE_LIMITS = Object.freeze({
  display_name: 40,
  member_tier: 20,
  notes: 200,
  last_order_summary: 200,
});

function limitCustomerProfileField(value, maxLength) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  return value.slice(0, maxLength);
}

// 只回傳客戶檔的已定義欄位；line_user_id 留在查詢條件，不進回應物件。
export async function getCustomerProfile(env, lineUserId) {
  if (!env?.DB || typeof lineUserId !== 'string' || !lineUserId.trim()) return null;
  const { results } = await env.DB.prepare(
    `SELECT display_name, member_tier, notes, last_order_summary, extra_json
     FROM customer_profiles WHERE line_user_id = ?`
  ).bind(lineUserId).all();
  const row = results?.[0];
  if (!row) return null;
  return {
    display_name: limitCustomerProfileField(row.display_name, CUSTOMER_PROFILE_LIMITS.display_name),
    member_tier: limitCustomerProfileField(row.member_tier, CUSTOMER_PROFILE_LIMITS.member_tier),
    notes: limitCustomerProfileField(row.notes, CUSTOMER_PROFILE_LIMITS.notes),
    last_order_summary: limitCustomerProfileField(row.last_order_summary, CUSTOMER_PROFILE_LIMITS.last_order_summary),
    // extra_json 仍可供前端保存原始欄位，但 buildCustomerProfileHint 永遠不會把它送進 prompt。
    extra_json: typeof row.extra_json === 'string' ? row.extra_json : null,
  };
}

// ---------- 語音 session：跟 xAI 換一組短效期通行證 ----------
async function handleVoiceSessionToken(request, env) {
  const { lineUserId, idToken } = await readJsonObject(request);
  if (!lineUserId) return json({ error: 'Missing lineUserId' }, 400);
  if (!idToken) return json({ error: 'idToken required' }, 400);

  const identity = await verifyLineIdentity(idToken, env, lineUserId);
  if (!identity.ok) return json({ error: identity.error }, identity.status);

  if (!env.XAI_API_KEY) {
    console.error('handleVoiceSessionToken: XAI_API_KEY not configured');
    return json({ error: 'voice_session_unavailable' }, 502);
  }

  try {
    const res = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expires_after: { seconds: 900 } }),
    });
    if (!res.ok) {
      console.error('handleVoiceSessionToken: xAI client_secrets failed', res.status);
      return json({ error: 'voice_session_unavailable' }, 502);
    }
    const data = await res.json();

    let contacts = [];
    try {
      contacts = await listContacts(env?.DB);
    } catch (err) {
      console.error('handleVoiceSessionToken: listContacts failed', err?.message || err);
      contacts = [];
    }
    if (!contacts || contacts.length === 0) contacts = SEED_CONTACTS;
    const memberNames = Array.from(
      new Set(contacts.map((m) => (typeof m === 'string' ? m : m?.chinese_name)).filter((n) => typeof n === 'string' && n.trim()))
    );

    let savedMemory = {};
    try {
      const memoryRes = await handleGetUserMemory(
        new Request(`https://internal/api/internal/memory?lineUserId=${encodeURIComponent(lineUserId)}`),
        env
      );
      if (memoryRes.ok) {
        const memoryData = await memoryRes.json();
        if (memoryData?.memory && typeof memoryData.memory === 'object') savedMemory = { ...memoryData.memory };
      }
    } catch (memError) {
      console.error('handleVoiceSessionToken: failed to get saved memory', memError?.message || memError);
      savedMemory = {};
    }

    let customerProfile = null;
    try {
      customerProfile = await getCustomerProfile(env, lineUserId);
    } catch (profileError) {
      console.error('handleVoiceSessionToken: failed to get customer profile', profileError?.message || profileError);
    }

    return json({ clientSecret: data.value, expiresAt: data.expires_at, memberNames, savedMemory, customerProfile }, 200);
  } catch (error) {
    console.error('handleVoiceSessionToken: xAI request threw', error?.message || error);
    return json({ error: 'voice_session_unavailable' }, 502);
  }
}

// ---------- 表單驗證 ----------
function validateVoiceIntakeFields(body) {
  const formType = body.formType === undefined ? Object.keys(VOICE_FORMS)[0] : body.formType;
  if (!Object.hasOwn(VOICE_FORMS, formType)) return { valid: false, missing: ['formType'] };
  const required = VOICE_FORMS[formType];
  const missing = required.filter((f) => !['string', 'number'].includes(typeof body[f]) || !String(body[f]).trim());
  if (missing.length > 0) return { valid: false, missing };
  return { valid: true, formType, fields: Object.fromEntries(required.map((f) => [f, body[f]])) };
}

// ---------- 送出：寫進本專案自己的資料庫 ----------
async function storeVoiceIntakeRecord(env, lineUserId, formType, fields) {
  if (!env.DB) return { stored: false };
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO voice_intake_records (line_user_id, form_type, fields_json, created_at)
     VALUES (?, ?, ?, ?)`
  ).bind(lineUserId, formType, JSON.stringify(fields), now).run();
  return { stored: true };
}

async function handleVoiceIntakeSubmitFromLiff(request, env) {
  const body = await readJsonObject(request);
  const { lineUserId, idToken } = body;
  if (!lineUserId) return json({ error: 'Missing lineUserId' }, 400);
  if (!idToken) return json({ error: 'idToken required' }, 400);

  const identity = await verifyLineIdentity(idToken, env, lineUserId);
  if (!identity.ok) return json({ error: identity.error }, identity.status);

  const submissions = [];
  if (Array.isArray(body.entries) && body.entries.length > 0) {
    for (const entry of body.entries) {
      const v = validateVoiceIntakeFields(entry);
      if (!v.valid) return json({ error: 'Missing required fields in entry', missing: v.missing, entry }, 400);
      submissions.push(v);
    }
  } else {
    const v = validateVoiceIntakeFields(body);
    if (!v.valid) return json({ error: 'Missing required fields', missing: v.missing }, 400);
    submissions.push(v);
  }

  for (const s of submissions) {
    await storeVoiceIntakeRecord(env, lineUserId, s.formType, normalizeFieldsToTraditionalChinese(s.fields));
  }

  return json({ entryCount: submissions.length, delivered: true }, 200);
}

// ---------- 記憶（記住電話／信箱／地址） ----------
const ALLOWED_MEMORY_FIELDS = new Set(['phone', 'email', 'address']);
const MEMORY_FIELD_ALIAS_MAP = {
  phone: 'phone', '電話': 'phone', '手機': 'phone',
  email: 'email', '信箱': 'email', '電子郵件': 'email',
  address: 'address', '地址': 'address', '通訊地址': 'address',
};
const MAX_MEMORY_VALUE_LENGTH = 500;

async function handleVoiceIntakeRemember(request, env) {
  const body = await readJsonObject(request);
  const { lineUserId, idToken, field, value, entries } = body;
  if (!lineUserId) return json({ error: 'Missing lineUserId' }, 400);
  if (!idToken) return json({ error: 'idToken required' }, 400);

  const identity = await verifyLineIdentity(idToken, env, lineUserId);
  if (!identity.ok) return json({ error: identity.error }, identity.status);

  const memoryPayload = { lineUserId, entries: {} };
  if (entries && typeof entries === 'object' && !Array.isArray(entries)) {
    for (const [k, v] of Object.entries(entries)) {
      const normalizedKey = MEMORY_FIELD_ALIAS_MAP[String(k).trim()] || MEMORY_FIELD_ALIAS_MAP[String(k).trim().toLowerCase()];
      if (!normalizedKey || !ALLOWED_MEMORY_FIELDS.has(normalizedKey)) {
        return json({ error: 'unsupported_memory_field', field: k }, 400);
      }
      const strValue = String(v ?? '').trim();
      if (!strValue || strValue.length > MAX_MEMORY_VALUE_LENGTH) {
        return json({ error: 'invalid_memory_value', field: k }, 400);
      }
      memoryPayload.entries[normalizedKey] = strValue;
    }
  } else if (field !== undefined) {
    const normalizedKey = MEMORY_FIELD_ALIAS_MAP[String(field).trim()] || MEMORY_FIELD_ALIAS_MAP[String(field).trim().toLowerCase()];
    if (!normalizedKey || !ALLOWED_MEMORY_FIELDS.has(normalizedKey)) {
      return json({ error: 'unsupported_memory_field', field }, 400);
    }
    const strValue = String(value ?? '').trim();
    if (!strValue || strValue.length > MAX_MEMORY_VALUE_LENGTH) {
      return json({ error: 'invalid_memory_value', field }, 400);
    }
    memoryPayload.entries[normalizedKey] = strValue;
  } else {
    return json({ error: 'missing_memory_data' }, 400);
  }

  await handleUpsertUserMemory(new Request('https://internal/api/internal/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memoryPayload),
  }), env);

  return json({ success: true }, 200);
}

async function handleGetUserMemory(request, env) {
  const url = new URL(request.url);
  const lineUserId = url.searchParams.get('lineUserId');
  if (!lineUserId) return json({ error: 'missing_line_user_id' }, 400);

  const memory = {};
  if (env.DB) {
    const { results } = await env.DB.prepare(
      `SELECT field_key, field_value FROM user_memory WHERE line_user_id = ?`
    ).bind(lineUserId).all();
    for (const row of results || []) memory[row.field_key] = row.field_value;
  }
  return json({ success: true, memory }, 200);
}

async function handleUpsertUserMemory(request, env) {
  const body = await readJsonObject(request);
  const { lineUserId, entries } = body;
  if (!lineUserId || !entries) return json({ error: 'missing_memory_data' }, 400);

  const now = new Date().toISOString();
  if (env.DB) {
    for (const [key, value] of Object.entries(entries)) {
      await env.DB.prepare(
        `INSERT INTO user_memory (line_user_id, field_key, field_value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(line_user_id, field_key) DO UPDATE SET
           field_value = excluded.field_value, updated_at = excluded.updated_at`
      ).bind(lineUserId, key, value, now).run();
    }
  }
  return json({ success: true }, 200);
}

async function handleVoiceIntakeHistoryQuery(request, env) {
  const body = await readJsonObject(request);
  const { lineUserId, idToken, limit } = body;
  if (!lineUserId) return json({ error: 'Missing lineUserId' }, 400);
  if (!idToken) return json({ error: 'idToken required' }, 400);
  const identity = await verifyLineIdentity(idToken, env, lineUserId);
  if (!identity.ok) return json({ error: identity.error }, identity.status);
  const records = await queryVoiceIntakeHistory(env?.DB, lineUserId, limit);
  return json({ success: true, records }, 200);
}

async function handleVoiceIntakeKnowledgeQuery(request, env) {
  const body = await readJsonObject(request);
  const { lineUserId, idToken, query } = body;
  if (!lineUserId) return json({ error: 'Missing lineUserId' }, 400);
  if (!idToken) return json({ error: 'idToken required' }, 400);
  if (!query || typeof query !== 'string') return json({ error: 'query required' }, 400);
  const identity = await verifyLineIdentity(idToken, env, lineUserId);
  if (!identity.ok) return json({ error: identity.error }, identity.status);
  const results = await queryKnowledgeBase(env, query, 5);
  return json({ success: true, results }, 200);
}

async function handleVerify(request, env) {
  const { idToken } = await readJsonObject(request);
  if (!idToken) return json({ error: 'idToken required' }, 400);
  try {
    const verified = await verifyLineToken(idToken, env.LIFF_ID);
    return json({ success: true, lineUserId: verified.lineUserId }, 200);
  } catch (err) {
    return json({ error: err?.code || 'INVALID_LINE_TOKEN', detail: err?.detail }, err?.status || 401);
  }
}

// ---------- 路由 ----------
async function dispatch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/auth/verify' && request.method === 'POST') return handleVerify(request, env);
  if (url.pathname === '/api/voice-session/token' && request.method === 'POST') return handleVoiceSessionToken(request, env);
  if (url.pathname === '/api/voice-intake/submit' && request.method === 'POST') return handleVoiceIntakeSubmitFromLiff(request, env);
  if (url.pathname === '/api/voice-intake/remember' && request.method === 'POST') return handleVoiceIntakeRemember(request, env);
  if (url.pathname === '/api/internal/memory' && request.method === 'GET') return handleGetUserMemory(request, env);
  if (url.pathname === '/api/internal/memory' && request.method === 'POST') return handleUpsertUserMemory(request, env);
  if (url.pathname === '/api/voice-intake/query-history' && request.method === 'POST') return handleVoiceIntakeHistoryQuery(request, env);
  if (url.pathname === '/api/voice-intake/query-knowledge' && request.method === 'POST') return handleVoiceIntakeKnowledgeQuery(request, env);
  if (url.pathname === '/webhook/line' && request.method === 'POST') return handleLineWebhook(request, env);
  if (url.pathname === '/api/internal/knowledge/ingest' && request.method === 'POST') return handleKnowledgeIngest(request, env);
  if (env.ASSETS) return env.ASSETS.fetch(request);
  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await dispatch(request, env);
    } catch (err) {
      console.error('unhandled error', err?.message || err);
      return json({ error: 'internal_error' }, 500);
    }
  },
};
