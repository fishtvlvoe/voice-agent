const DEFAULT_EMBEDDING_MODEL = '@cf/baai/bge-m3';
const RRF_K = 60;

export function splitDocumentIntoChunks(documentText, maxLength = 1600) {
  if (typeof documentText !== 'string' || !documentText.trim()) return [];
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new Error('maxLength must be a positive integer');
  }

  const paragraphs = documentText
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';
  const flush = () => {
    if (current) chunks.push(current);
    current = '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLength) {
      flush();
      for (let offset = 0; offset < paragraph.length; offset += maxLength) {
        chunks.push(paragraph.slice(offset, offset + maxLength));
      }
      continue;
    }

    if (!current) {
      current = paragraph;
      continue;
    }

    const combined = `${current}\n\n${paragraph}`;
    if (combined.length > maxLength) {
      flush();
      current = paragraph;
    } else {
      current = combined;
    }
  }

  flush();
  return chunks;
}

export function reciprocalRankFusion(resultSets, limit = 5) {
  const merged = new Map();

  for (const results of resultSets || []) {
    for (const [rank, item] of (results || []).entries()) {
      if (!item || item.id === undefined || item.id === null) continue;
      const id = String(item.id);
      const existing = merged.get(id) || { ...item, id, _rrfScore: 0 };
      existing._rrfScore += 1 / (RRF_K + rank + 1);
      if (!existing.text && item.text) existing.text = item.text;
      if (!existing.sourceDoc && item.sourceDoc) existing.sourceDoc = item.sourceDoc;
      if (!existing.metadata && item.metadata) existing.metadata = item.metadata;
      merged.set(id, existing);
    }
  }

  return Array.from(merged.values())
    .sort((left, right) => right._rrfScore - left._rrfScore)
    .slice(0, limit)
    .map(({ _rrfScore, ...item }) => ({ ...item, rrfScore: _rrfScore }));
}

function extractEmbeddingVectors(output) {
  const data = output?.data ?? output;
  if (!Array.isArray(data)) throw new Error('embedding_response_invalid');
  if (data.length === 0) return [];
  if (Array.isArray(data[0])) return data;
  if (typeof data[0] === 'number') return [data];
  throw new Error('embedding_response_invalid');
}

export async function embedTexts(ai, texts, model = DEFAULT_EMBEDDING_MODEL) {
  if (!ai || typeof ai.run !== 'function') throw new Error('workers_ai_unavailable');
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const output = await ai.run(model, { text: texts });
  const vectors = extractEmbeddingVectors(output);
  if (vectors.length !== texts.length) throw new Error('embedding_count_mismatch');
  return vectors;
}

function buildKeywordTerms(query) {
  const normalized = String(query || '').trim();
  if (!normalized) return [];
  const terms = [normalized, ...normalized.split(/[\s，。！？、；：,.!?;:]+/g)];
  return Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean))).slice(0, 6);
}

async function keywordSearch(db, query, limit) {
  if (!db || typeof db.prepare !== 'function') return [];
  const terms = buildKeywordTerms(query);
  if (terms.length === 0) return [];
  const where = terms.map(() => 'chunk_text LIKE ?').join(' OR ');
  const statement = db.prepare(
    `SELECT id, chunk_text, source_doc, created_at
     FROM knowledge_chunks
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT ?`
  );
  const { results } = await statement.bind(...terms.map((term) => `%${term}%`), limit).all();
  return (results || []).map((row) => ({
    id: String(row.id),
    text: row.chunk_text,
    sourceDoc: row.source_doc,
    createdAt: row.created_at,
  }));
}

async function hydrateChunks(db, matches) {
  const missingIds = matches
    .filter((match) => !match.text)
    .map((match) => match.id);
  if (!db || missingIds.length === 0) return matches;

  const placeholders = missingIds.map(() => '?').join(', ');
  const { results } = await db.prepare(
    `SELECT id, chunk_text, source_doc, created_at
     FROM knowledge_chunks WHERE id IN (${placeholders})`
  ).bind(...missingIds).all();
  const byId = new Map((results || []).map((row) => [String(row.id), row]));

  return matches.map((match) => {
    const row = byId.get(match.id);
    if (!row) return match;
    return {
      ...match,
      text: row.chunk_text,
      sourceDoc: row.source_doc,
      createdAt: row.created_at,
    };
  });
}

export async function queryKnowledgeBase(env, query, limit = 5) {
  const keywordResults = await keywordSearch(env?.DB, query, limit * 2);
  let vectorResults = [];

  if (env?.AI && env?.KNOWLEDGE_INDEX) {
    try {
      const [queryVector] = await embedTexts(env.AI, [String(query || '')]);
      const vectorResponse = await env.KNOWLEDGE_INDEX.query(queryVector, {
        topK: Math.max(limit * 2, 8),
        returnMetadata: 'all',
      });
      vectorResults = (vectorResponse?.matches || []).map((match) => ({
        id: String(match.id),
        score: match.score,
        metadata: match.metadata,
        sourceDoc: match.metadata?.source_doc,
        text: match.metadata?.chunk_text,
      }));
    } catch (error) {
      console.error('queryKnowledgeBase: vector search failed', error?.message || error);
    }
  }

  const merged = reciprocalRankFusion([vectorResults, keywordResults], limit);
  return hydrateChunks(env?.DB, merged);
}

export async function indexKnowledgeDocument(env, { sourceDoc, text }) {
  const normalizedSource = String(sourceDoc || '').trim();
  const chunks = splitDocumentIntoChunks(text);
  if (!normalizedSource) throw new Error('source_doc_required');
  if (chunks.length === 0) throw new Error('knowledge_text_required');
  if (!env?.AI || !env?.KNOWLEDGE_INDEX) throw new Error('knowledge_index_unavailable');

  const vectors = await embedTexts(env.AI, chunks);
  const now = Math.floor(Date.now() / 1000);
  const records = chunks.map((chunk, index) => ({
    id: `${crypto.randomUUID()}-${index}`,
    chunk,
    sourceDoc: normalizedSource,
  }));

  await env.KNOWLEDGE_INDEX.insert(records.map((record, index) => ({
    id: record.id,
    values: vectors[index],
    metadata: { source_doc: record.sourceDoc, chunk_index: index },
  })));

  if (env.DB) {
    const statements = records.map((record) => env.DB.prepare(
      `INSERT INTO knowledge_chunks (id, chunk_text, source_doc, created_at)
       VALUES (?, ?, ?, ?)`
    ).bind(record.id, record.chunk, record.sourceDoc, now));
    if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
    else for (const statement of statements) await statement.run();
  }

  return { sourceDoc: normalizedSource, chunkCount: records.length };
}
