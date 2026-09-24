-- 通用語音助理骨架的最小資料庫結構。
-- voice_intake_records：語音收單完成後的結構化資料，原系統是轉發給另一個
--   服務處理，這裡直接落地，方便接手時決定要不要接下游通知或其他系統。
-- user_memory：記住使用者常用聯絡資料（電話／信箱／地址），下次開口代入。
-- user_profiles：使用者基本資料快取。
-- contacts：語音辨識同音校正用的聯絡人別名清單，範例資料為假名。

CREATE TABLE IF NOT EXISTS voice_intake_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  form_type TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_memory (
  line_user_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (line_user_id, field_key)
);

CREATE TABLE IF NOT EXISTS user_profiles (
  line_user_id TEXT PRIMARY KEY,
  last_known_display_name TEXT,
  last_seen_at INTEGER
);

CREATE TABLE IF NOT EXISTS contacts (
  chinese_name TEXT PRIMARY KEY,
  english_name TEXT,
  aliases TEXT,
  updated_at INTEGER
);

-- customer_profiles：開通語音 session 時預載的客戶檔；不直接把內部識別欄位放進 prompt。
CREATE TABLE IF NOT EXISTS customer_profiles (
  line_user_id TEXT PRIMARY KEY,
  display_name TEXT CHECK (display_name IS NULL OR length(display_name) <= 40),
  member_tier TEXT CHECK (member_tier IS NULL OR length(member_tier) <= 20),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 200),
  last_order_summary TEXT CHECK (last_order_summary IS NULL OR length(last_order_summary) <= 200),
  extra_json TEXT CHECK (extra_json IS NULL OR length(extra_json) <= 2000),
  updated_at INTEGER NOT NULL
);

-- knowledge_chunks：知識庫原文；向量索引只存向量與 chunk id，回答時回 D1 取原文。
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  chunk_text TEXT NOT NULL,
  source_doc TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source_doc
  ON knowledge_chunks (source_doc);
