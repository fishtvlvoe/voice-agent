## Context

現有系統只有一個入口：LIFF 語音/文字填單頁面。使用者必須先點 Rich Menu 才能互動。Fish 的產品定義：一個真正的「LINE AI 語音助理」，不管走 LIFF 語音、還是直接在 LINE 聊天室打字，都要接同一個大腦——同一個身分（`lineUserId`）、同一份記憶。

現有資源可重用：
- `src/index.js` 的 `AGENT_INSTRUCTIONS`、記憶（`user_memory`）、客戶檔（`customer_profiles`）邏輯已經在語音那條路徑跑，這次文字聊天要接同一套，不要重寫一份
- `line-official-account-setup` SR 已建好 Messaging API 官方帳號（channel id `2011708742`），只是還沒接 webhook
- `docs/voice-agent-vectorize-design.html` 已有 Vectorize 架構設計，這次照著做，不重新設計

## Goals / Non-Goals

**Goals:**
- 使用者在 LINE 聊天室直接打字，官方帳號會回覆，跟 LIFF 語音走同一套身分/記憶/知識來源
- 助理能查詢並講出使用者之前記錄過的內容
- 助理能從已上傳的知識庫文件找答案回覆

**Non-Goals:**
- 知識庫文件管理後台 UI
- 主動推播（push message）
- 對話逐字歷史存進向量庫

## Decisions

### 文字聊天走 Chat Completions，不是 Realtime API

語音那條路徑用的是 xAI Realtime API（WebSocket，為了低延遲語音）。文字聊天不需要低延遲語音串流，改用一般的 Chat Completions（HTTP request/response），架構更簡單、成本更低，且不需要在 Worker 裡維護長連線。

### 身分辨識：webhook 事件的 `source.userId` 直接當 `lineUserId`

LINE Messaging API webhook 的 `message` 事件會帶 `event.source.userId`，這個值等同於 LIFF 那邊 `liff.getProfile().userId`，同一個 LINE 帳號在兩條路徑上是同一個 id，天然對得上，不需要額外綁定機制。

### Vectorize 索引查詢用 RRF 混合排序（沿用既有設計文件）

依 `docs/voice-agent-vectorize-design.html`：Vectorize 向量查詢 + D1 關鍵字查詢兩批候選，用 RRF 公式合併，不單靠向量相似度（純向量在中文口語問法上常常抓不準關鍵字）。

## Implementation Contract

**Behavior**：
- 使用者在 LINE 聊天室輸入文字 → Webhook 驗證後先在 2 秒內回 `200`，AI 生成與 LINE 回覆在背景完成；官方帳號回覆一則文字訊息，內容跟該使用者的身分/記憶/知識庫一致
- 使用者問「我之前記錄過什麼」→ 助理列出最近幾筆 `voice_intake_records`（語音或文字問都要能觸發）
- 使用者問知識庫範圍內的問題 → 助理從已上傳文件找到相關段落，組成回答

**Interface / 資料形狀**：
- 新端點 `POST /webhook/line`：接收 LINE 官方 webhook payload（`events[]` 陣列），驗證 `x-line-signature` header（用 Channel Secret HMAC-SHA256）
- 新 D1 表 `knowledge_chunks`：`id, chunk_text, source_doc, created_at`
- 新 Vectorize binding `KNOWLEDGE_INDEX`（`wrangler vectorize create`，維度依 bge-m3 輸出）
- 新 function-calling 工具（語音/文字共用）：`query_voice_intake_history`（依 `lineUserId` 查最近 N 筆）、`query_knowledge_base`（依問題文字查知識庫）
- 新 secret：`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_CHANNEL_SECRET`（這次真的要用了）

**Failure modes**：
- webhook 簽章驗證失敗 → 回 401，不處理內容，記 log
- AI 或資料查詢耗時超過 LINE Webhook 回應期限 → 先回 200，再用 Cloudflare `waitUntil` 完成背景處理；不得讓 AI 呼叫阻塞 Webhook ACK
- LINE reply token 過期（超過使用時限）→ 改用 push API 而非 reply API（reply token 只能用一次且有時效）
- Vectorize 查無結果 → 明確告知使用者「知識庫目前沒有相關資料」，不可捏造答案

**Acceptance criteria**：
- 真人在 LINE 聊天室打字測試，收到正確回覆（截圖存證）
- 上傳一份測試文件後，問相關問題能查到，問不相關問題會誠實說沒有
- 問「我之前記錄過什麼」，答案跟 D1 實際資料一致（`wrangler d1 execute` 交叉驗證）

**Scope boundaries**：
- 只做被動回覆（使用者先講話助理才回），不做主動推播
- 知識庫上傳先用簡單 API 或 CLI 指令，不做管理介面

## Risks / Trade-offs

- **風險：webhook 沒設好簽章驗證，任何人都能偽造 LINE 訊息打進來**。對策：tasks.md 明確把簽章驗證列為第一項，且要有測試證明「錯誤簽章會被拒絕」
- **風險：Vectorize 查詢延遲影響文字聊天的即時感**。對策：先驗證延遲數字（P95），若超過使用者可接受範圍再考慮快取或非同步通知
- **風險：reply token 用錯（過期或用兩次）導致回覆失敗**。對策：明確區分「幾秒內」用 reply API、超時或需要主動通知才用 push API，寫進 tasks.md 驗收條件
