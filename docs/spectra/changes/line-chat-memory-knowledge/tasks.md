## 0. 前置說明（cross-impact 已查）

- `AGENT_INSTRUCTIONS`/`SUBMIT_TOOL`/`VOICE_FORMS` 等目前定義在 `src/liff/voice-form-schema.js`，只有前端 `voice-intake.js`（瀏覽器端）在用，`src/index.js`（Worker 後端）目前完全沒 import 它。語音那條路徑的 AI 呼叫是瀏覽器直接開 WebSocket 連 xAI，不經過 Worker。這次文字聊天必須從 Worker 後端呼叫 xAI（因為 LINE webhook 是 server-to-server），所以要把這份共用邏輯改成 `index.js` 也能 import——已確認 `voice-form-schema.js` 沒有用到任何瀏覽器專屬 API（`window`/`document`/`navigator`），可以安全被 Worker 端 import，不用重寫一份。
- 現有路由都在 `src/index.js` 314-319 行那段 `if (url.pathname === ...)` 判斷式，新路由照同樣模式加。
- `schema.sql` 現有表：`voice_intake_records`、`user_memory`、`user_profiles`、`contacts`、`customer_profiles`。這次要新增 `knowledge_chunks`。

## 1. Messaging API 憑證補齊

- [ ] 1.1 從 `docs/spectra/changes/line-official-account-setup/resource-ids.md` 找到已建立的 Channel Access Token / Channel Secret（`line-official-account-setup` SR 已建立官方帳號但沒把這兩個寫進 secrets），`wrangler secret put LINE_CHANNEL_ACCESS_TOKEN`、`wrangler secret put LINE_CHANNEL_SECRET`。驗證：`wrangler secret list` 列出這兩把新 key

## 2. Webhook 簽章驗證 + 路由骨架

- [x] 2.1 `src/index.js` 新增 `POST /webhook/line` 路由，讀取 raw body + `x-line-signature` header，用 `env.LINE_CHANNEL_SECRET` 算 HMAC-SHA256 驗證簽章。驗證失敗回 401，不解析 body 內容。驗證：`test/line-webhook.test.js` 已驗證假簽章回 401 且 downstream 呼叫次數為 0。
- [x] 2.2 簽章正確時解析 `events[]`，先只處理 `type === 'message'` 且 `message.type === 'text'` 的事件，其他事件類型先忽略。驗證：`test/line-webhook.test.js` 已送合法簽章 + 文字 payload，確認進入 reply 流程。

## 3. 文字聊天回覆邏輯

- [x] 3.1 把 `AGENT_INSTRUCTIONS`、`REMEMBER_TOOL`、`query_voice_intake_history`、`query_knowledge_base` 組成工具清單，用 `event.source.userId` 當 `lineUserId`，查 `user_memory`/`customer_profiles` 組 context，呼叫 xAI Chat Completions API（非 Realtime）取得回覆文字。驗證：`test/line-chat.test.js` 已確認已知使用者記憶進入 prompt，且工具回合可完成。
- [x] 3.2 在 reply token 時效內用 Messaging API `reply` 端點回覆；reply token 失效時改用 `push` 端點。驗證：`test/line-webhook.test.js` 已驗證 reply 與 400 → push fallback。

## 4. Vectorize 知識庫：寫入路徑

- [x] 4.1 已建立 `voice-agent-knowledge-index`（1024 維、cosine），並把 `KNOWLEDGE_INDEX` binding 加進 `wrangler.toml`。驗證：補上既有 Workers token 的 `Vectorize: 編輯` 權限後，`wrangler vectorize list` 已列出 `voice-agent-knowledge-index`。
- [x] 4.2 `schema.sql` 新增 `knowledge_chunks` 表（`id, chunk_text, source_doc, created_at`），套用到 D1。驗證：已對遠端 `voice-agent-db` 執行 schema，查詢確認 `knowledge_chunks` 存在。
- [x] 4.3 新增文件寫入端點/CLI 腳本：純文字輸入 → 依段落切塊 → 呼叫 bge-m3 embedding → 寫入 Vectorize，同批 chunk 原文寫入 `knowledge_chunks`。驗證：遠端 smoke test 回傳 `ok:true`、`chunkCount:1`；D1 查到對應 chunk；等待 Vectorize 非同步索引完成後，用 `wrangler vectorize query --vector-id` 查回同一 vector，score `0.9999984`；測試資料已清除。

## 5. 歷史記錄查詢工具

- [x] 5.1 新增 `query_voice_intake_history` function-calling 工具定義（放進 `voice-form-schema.js`，語音/文字共用）+ 對應後端查詢函式：依 `lineUserId` 查 `voice_intake_records` 最近 N 筆，只回傳該使用者自己的資料。驗證：`test/line-chat.test.js` 已驗證兩個不同 `lineUserId` 的查詢隔離。
- [x] 5.2 語音路徑（`voice-intake.js`）跟文字路徑（Worker 端 3.1）都掛上這個工具，確認呼叫的是同一支後端邏輯，不是各自重複實作。驗證：`rg` 已確認兩邊都走 `queryVoiceIntakeHistory`，實際查詢邏輯只有一份。

## 6. 知識庫查詢工具

- [ ] 6.1 新增 `query_knowledge_base` function-calling 工具定義（語音/文字共用）+ 對應後端查詢函式：問題轉向量 → Vectorize 查詢一批候選 + D1 關鍵字查詢一批候選 → RRF 公式合併排序 → 回傳前幾筆原文。驗證：問一個知識庫裡有的內容，回傳的候選包含正確原文；問一個完全不相關的問題，回傳空結果或低分結果（不可硬湊答案）
- [ ] 6.2 語音跟文字兩條路徑都掛上這個工具，AI 被明確指示「查無資料要誠實說沒有，不可捏造」。驗證：實際問一個知識庫沒有的問題，確認助理回答「沒有相關資料」而不是亂編

## 7. 真人驗證

- [ ] 7.1 在 LINE 聊天室直接打字問候，確認幾秒內收到回覆（非靜默）。驗證：截圖存證
- [ ] 7.2 先用語音助理講過一次偏好（例如電話號碼），之後改用文字聊天問相關問題，確認文字回覆有反映出那筆記憶。驗證：截圖 + D1 查詢對照
- [ ] 7.3 上傳一份測試知識庫文件，在 LINE 聊天室問相關問題，確認答對；問不相關問題，確認誠實說沒有。驗證：截圖存證
- [ ] 7.4 問「我之前記錄過什麼」，確認答案跟 D1 `voice_intake_records` 實際資料一致。驗證：`wrangler d1 execute` 交叉核對
