# voice-agent

從一套語音收單系統抽出的**LINE 個人記憶助理骨架**（Cloudflare Workers）。語音目前走 LIFF + xAI Realtime，文字走 LINE Messaging API + OpenAI Chat Completions（預設 `gpt-4.1`）；兩條路徑共用 D1 記憶、歷史記錄與知識庫查詢。

## 這是什麼

目前包含兩條入口：

1. 使用者打開 LIFF 頁面，用 LINE 身分驗證
2. 前端跟後端換一組短效期通行證，直接連上 xAI Realtime API 開始語音對話
3. 語音 AI 依 `voice-form-schema.js` 定義的欄位追問使用者，欄位齊全後呼叫工具送出
4. 後端驗證身分後，把結構化資料寫進 Cloudflare D1
5. 使用者也能直接在 LINE 聊天室打字，查詢自己的記錄或知識庫內容

## 骨架 vs 要自己接的東西

| 保留（骨架） | 要自己做 |
|---|---|
| LINE 身分驗證 | 換成其他通路的身分驗證（如果要做多通路） |
| 跟 xAI Realtime API 交握、通行證機制 | — |
| function calling 機制（存這筆／送出／記住） | 依你的用途調整 `voice-form-schema.js` 的欄位定義 |
| 記憶功能（記住聯絡方式） | — |
| 簡繁正規化範例 | 更完整的資料清洗（電話/地址格式正規化等） |
| — | 多租戶（SaaS）：每張表加 tenant_id |
| 知識庫查詢工具、文件匯入端點 | 建立正式 Vectorize index 與上傳管理介面 |

`docs/` 資料夾有五份設計文件，記錄了拆分過程的判斷跟後續模組設計，跟接手時的架構決策一併參考：

- `voice-agent-architecture-review.html` — 原系統架構盤點
- `voice-agent-full-architecture.html` — WeKnora 定位＋完整模組設計
- `voice-agent-vectorize-design.html` — 向量知識庫模組設計
- `voice-agent-cloudflare-saas-design.html` — Cloudflare 多租戶 SaaS 架構
- `voice-agent-generic-architecture.html` — 骨架 vs 表單邏輯的取捨

## 開發

```bash
npm install
wrangler d1 execute voice-agent-db --file=schema.sql
# 預載客戶檔測試資料：INSERT INTO customer_profiles (line_user_id, display_name, member_tier, notes, last_order_summary, updated_at) VALUES ('U...', '測試客戶', 'VIP', '偏好電話聯絡', '2026-09-01 已完成訂單', unixepoch());
# 注意：display_name/member_tier/notes/last_order_summary 內容會直接進語音 AI 的 prompt，勿夾帶「忽略先前指示」之類的指令文字。
wrangler secret put LIFF_ID
wrangler secret put XAI_API_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
wrangler secret put LINE_CHANNEL_SECRET
wrangler secret put KNOWLEDGE_INGEST_TOKEN
npm test
npm run dev
```

### 建立知識庫索引

`@cf/baai/bge-m3` 的 dense embedding 是 1024 維。取得 Vectorize 權限後執行：

```bash
npx wrangler vectorize create voice-agent-knowledge-index --dimensions=1024 --metric=cosine
```

建立索引後，使用 `Authorization: Bearer <KNOWLEDGE_INGEST_TOKEN>` 呼叫：

```bash
curl -X POST http://localhost:8787/api/internal/knowledge/ingest \
  -H 'Authorization: Bearer <KNOWLEDGE_INGEST_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"sourceDoc":"example.md","text":"這是一段知識庫測試內容。"}'
```

## 已知限制（設計上刻意留白，等接手時決定）

- 語音收單完成後只落地資料庫，沒有接任何通知（原系統是推播 LINE，這裡拔掉了）
- `contacts` 表只有兩筆假名範例，`voice-form-schema.js` 只有一種示範表單類型
- 沒有多租戶隔離，單一使用者/單一部署用途
- Vectorize index 尚未在目前 Cloudflare token 權限下建立；程式已完成 Vectorize 查詢與知識匯入路徑，未完成雲端向量搜尋驗收
- LINE Channel Access Token、Channel Secret、Knowledge Ingest Token 尚未在本環境確認
