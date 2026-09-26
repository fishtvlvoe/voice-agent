---
updated: 2026-09-26
sop: dev-sop
lifecycle_stage: D1
current_stage: P5
active_change: docs/spectra/changes/line-chat-memory-knowledge
status: P5 驗收中；合成 Webhook RED 已定位到 LINE 回覆邊界；Ringg Provider Router 進入 P3 對焦
---

## 這個專案在幹嘛

一個以 LINE LIFF 為入口、使用 xAI Realtime 做語音對話、使用 OpenAI Chat Completions 做 LINE 文字回應，並把結構化資料寫進 Cloudflare D1 的語音助理骨架。

## 已確認

- [FACT] 目前語音資料流是 LIFF → Worker 短效憑證 → 瀏覽器直接連 xAI Realtime WebSocket → function calling → Worker 驗證 LINE 身分 → D1。（證據：`src/index.js`、`README.md`）
- [FACT] 目前已有聯絡資料與使用者記憶的部分邏輯，記憶欄位包含電話、信箱、地址。（證據：`src/index.js`）
- [FACT] 原始 repo 的 npm scripts 只有 `dev` 與 `deploy`；本輪已新增 `test`。（證據：`package.json`）
- [FACT] `docs/openai-realtime-and-ringg-evaluation.md` 是 provider 評估文件，不是已接入的程式碼。（證據：文件位置與 `src/` 現況）
- [FACT] `line-chat-memory-knowledge` change 規劃 LINE 文字 webhook、歷史查詢與 Vectorize 知識庫，但 tasks 仍有未完成項目。（證據：`docs/spectra/changes/line-chat-memory-knowledge/tasks.md`）
- [FACT] 遠端 `voice-agent-db` 已新增 `knowledge_chunks` 表；資料庫 ID 是 `4f90a993-2db2-41d2-97b2-a7db6acac4ca`。（證據：`wrangler d1 execute voice-agent-db --remote`）
- [FACT] 本機測試 14/14 通過，Wrangler dry-run 可辨識 `DB`、`KNOWLEDGE_INDEX`、`AI` 綁定。（證據：`npm test`、`npx wrangler deploy --dry-run`）
- [FACT] `voice-agent-knowledge-index` 已建立為 1024 維 cosine index；既有 Workers token 已補上 `Vectorize: 編輯`。（證據：`npx wrangler vectorize list`）
- [FACT] Worker 已部署到 `https://voice-agent.fishandy1213.workers.dev`，目前 100% live version 是 `df102832-80de-4e19-94a5-06cd34fe3a64`；此版本先 ACK Webhook，再用 `ctx.waitUntil` 背景處理 AI 與 LINE 回覆。（證據：`npx wrangler deploy`、`npx wrangler tail`）
- [FACT] 遠端知識匯入 smoke test 成功：回傳 `ok:true`、1 個 chunk，D1 查到 1 筆；等待 Vectorize 非同步索引完成後查回同一 vector，score `0.9999984`；測試資料與臨時 secret 已清除。（日期：2026-09-24）
- [FACT] 已從完成的 `line-official-account-setup` worktree 取回 confidential `resource-ids.md`；LINE Channel Access Token／Secret 已寫入 Worker，`/v2/bot/info` 確認官方帳號為 `AIVER AI 語音助理`／`@461fuosv`。（日期：2026-09-24）
- [FACT] 資源登錄已集中到本機 `voice-agent/.env`（權限 600、已加入 `.gitignore`）；Cloudflare Workers 部署 token 仍只存於 `/Users/fishtv/Development/.env`。
- [FACT] LINE webhook URL 已設定為 `https://voice-agent.fishandy1213.workers.dev/webhook/line`，LINE API 回讀 `active=true`；LINE webhook test 回傳 `success=true`、`statusCode=200`。（日期：2026-09-24）
- [FACT] 歷史基線曾直接呼叫 xAI Chat Completions（`grok-4.7`）回傳 200；目前文字路徑已不再使用 Grok。（日期：2026-09-25）
- [FACT] `voice-agent` 文字聊天已改用 OpenAI Chat Completions；程式以 `env.OPENAI_TEXT_MODEL || 'gpt-4.1'` 選模型。語音路徑目前仍是既有 xAI Realtime，尚未替換。（證據：`src/line-chat.js`、`wrangler.toml`；日期：2026-09-26）
- [FACT] Worker 已配置 `OPENAI_API_KEY` 與既有 `XAI_API_KEY`；新版文字程式已部署，版本為 `6d1b3efd-0626-4232-bf3f-085a278f1ca5`。本機測試 18/18 通過；OpenAI `gpt-4.1` API smoke test 回傳 HTTP 200。（日期：2026-09-26；證據：`wrangler secret list --name voice-agent`、`npm test`、部署輸出）
- [FACT] 使用者指定的 OpenAI Ringg 官方案例描述的是多模型路由：GPT-4.1 處理大部分即時語音與聊天流量，GPT-5.6 Luna 處理適合的即時工作，GPT-5.6 Terra 做通話後分析，GPT-5.6 Sol 做評估與提示詞改善。（來源：https://openai.com/zh-Hant/index/ringg/；日期：2026-09-26）
- [FACT] BNI 另一個專案的產業語意分類使用 Gemini `gemini-3.5-flash-lite`；這不是 `voice-agent` 目前的文字模型。（證據：`/Users/fishtv/Development/C-客戶專案/bni/code/workers/bni-connector/src/gemini-category-matcher.js`）
- [GAP] `spectra list --changes --json` 目前列出 3 份 `in-progress` change；本次仍以 `line-chat-memory-knowledge` 作為工作脈絡，但在建立下一份 SR 前必須逐一查明並處理其餘 change 的狀態。（日期：2026-09-25；證據：`spectra list --changes --json`、`spectra status --change <change> --json`）
- [FACT] 合成 RED 使用合法 LINE 簽章與假 reply token 呼叫正式 Worker，回傳 `500 internal_error`；Worker 日誌顯示 xAI 路徑完成後 `sendLineReply failed 400`，證明合成事件已走到 LINE 回覆邊界。（日期：2026-09-25）
- [FACT] LINE 官方 Webhook Test 實際從 LINE Corporation 送達新版 Worker，API 回傳 `statusCode=200`；Worker 日誌確認簽章通過、`eventCount=0`、`handled=0`。（日期：2026-09-25）
- [FACT] 原因已確認：舊版同步等待 xAI 約 5～15 秒才回 Webhook；新版合成文字事件回 `200 {"ok":true,"queued":1}`，耗時約 0.26 秒，背景處理再因假 reply token 收到 LINE `400`。（日期：2026-09-25）
- [DECISION] 產品方向是：LINE 文字與語音共用同一個個人記憶大腦，並能把整理結果送到 email、記帳系統或電腦／雲端 AI。（日期：2026-09-24；來源：使用者需求）
- [DECISION] 第一個施工範圍仍是：LINE 文字聊天＋共用記憶／知識查詢；目前已先把文字回應從 Grok 切到 OpenAI `gpt-4.1`。完整 Ringg 式 Provider Router、語音替換與 email／記帳／電腦／雲端 AI connector 另立施工範圍。（日期：2026-09-26；來源：使用者指定 Ringg 方向與本輪實作）
- [DECISION] 個人記憶採「AI 先偵測候選內容 → 先詢問使用者 → 使用者明確同意後才儲存」；禁止 AI 靜默保存姓名、偏好、記事或提醒。（日期：2026-09-25；來源：使用者確認；尚未施工）
- [DECISION] LINE Push API 只是傳送管道；產生文字與記憶候選判斷才會產生模型費用，D1 寫入本身不另收語言模型費用。（日期：2026-09-25；來源：使用者確認方向）
- [DECISION] 工作順序是：先補強 `dev-sop` 的 SR 開／接續／封存閘門與派工判斷回報格式，再回到 voice-agent 的多模型 Provider Router；多模型工作暫停到前一項完成。（日期：2026-09-25；來源：使用者確認）
- [DECISION] `dev-sop` 閘門完成後，voice-agent 的 Provider 方向改採 Ringg 式多模型路由；目標路由不再使用 Grok。這是對先前把指定 Ringg 來源誤判成單一 Realtime／GPT-Live 方案的修正。（日期：2026-09-26；來源：使用者指定 Ringg 文章與修正指示）

## 尚未確認

- [QUESTION] 個人記憶的保存期限、刪除方式與哪些內容必須先取得使用者同意。
- [QUESTION] email、記帳系統、電腦／雲端 AI 的第一個實際連接器是哪一個。
- [QUESTION] Knowledge Ingest Token 只為 smoke test 臨時建立，測試後已刪除；正式匯入流程尚未配置長期 token。（驗證方式：`wrangler secret list`）
- [ASSUMPTION] 初始路由候選為：一般 LINE 文字與即時工作使用 GPT-4.1；複雜工具／記憶工作使用 GPT-5.6 Luna；回合後記憶整理與摘要使用 GPT-5.6 Terra；評估使用 GPT-5.6 Sol。這是依 Ringg 案例映射到本產品的設計候選，不等於已接入。（驗證方式：另立 provider change 並做品質、延遲、成本測試）
- [GAP] Ringg 公開案例沒有交代完整的 LIFF 語音 API、音訊傳輸協定與實際 session endpoint；不能從案例自行推斷為 OpenAI Realtime 或 GPT-Live。必須在 provider change 中另查官方 API 並做小型 spike。（日期：2026-09-26）

## 目前進度

- P1：已確認 repo、文件位置與現有未提交檔案範圍。
- P2：已建立專案地圖、架構地圖、來源血緣、模組目錄與詞彙表。
- P3：第一個施工範圍已確認，保存政策與第一個外部 connector 延後。
- P4：已新增 LINE Webhook、OpenAI Chat Completions、reply/push fallback、共用歷史／知識工具、文件切塊與知識匯入端點；語音與文字共用後端查詢函式。
- P4 驗證：18/18 tests 通過；D1 `knowledge_chunks` 已遠端套用；Vectorize 建立完成；Worker 已部署；OpenAI API smoke test 通過。
- P5：LINE 平台傳輸邊界、非同步 ACK 與真人文字回覆已完成驗收；個人記憶的「先詢問、確認後儲存」仍待另立施工規格。
- P3（新方向）：已根據 Ringg 官方案例建立多模型路由候選；文字基線已切到 OpenAI `gpt-4.1`，語音仍為 xAI Realtime；尚未建立 provider SR，也尚未完成多模型 Router。

## 下一步

下一步先完成目前 `line-chat-memory-knowledge` 的 6 個未完成 task，再處理其他 in-progress change 的真實狀態；之後建立 Ringg Provider Router 的新規格，先驗證 LIFF 語音 API，再把目前固定的 OpenAI `gpt-4.1` 擴成可觀測的模型路由。目前不擴大到自動提醒排程或外部 connector。
