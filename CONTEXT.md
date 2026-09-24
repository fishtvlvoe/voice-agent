---
updated: 2026-09-24
sop: dev-sop
lifecycle_stage: D1
current_stage: P5
active_change: docs/spectra/changes/line-chat-memory-knowledge
status: P5 驗收中；合成 Webhook RED 已定位到 LINE 回覆邊界；待真人訊息驗收
---

## 這個專案在幹嘛

一個以 LINE LIFF 為入口、使用 xAI Realtime 做語音對話、把結構化資料寫進 Cloudflare D1 的語音助理骨架。

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
- [FACT] 直接呼叫 xAI Chat Completions（`grok-4.7`）回傳 200；本機 14/14 測試通過。（日期：2026-09-25）
- [FACT] 合成 RED 使用合法 LINE 簽章與假 reply token 呼叫正式 Worker，回傳 `500 internal_error`；Worker 日誌顯示 xAI 路徑完成後 `sendLineReply failed 400`，證明合成事件已走到 LINE 回覆邊界。（日期：2026-09-25）
- [FACT] LINE 官方 Webhook Test 實際從 LINE Corporation 送達新版 Worker，API 回傳 `statusCode=200`；Worker 日誌確認簽章通過、`eventCount=0`、`handled=0`。（日期：2026-09-25）
- [FACT] 原因已確認：舊版同步等待 xAI 約 5～15 秒才回 Webhook；新版合成文字事件回 `200 {"ok":true,"queued":1}`，耗時約 0.26 秒，背景處理再因假 reply token 收到 LINE `400`。（日期：2026-09-25）
- [DECISION] 產品方向是：LINE 文字與語音共用同一個個人記憶大腦，並能把整理結果送到 email、記帳系統或電腦／雲端 AI。（日期：2026-09-24；來源：使用者需求）
- [DECISION] 第一個施工範圍是：LINE 文字聊天＋共用記憶／知識查詢；暫不切換 OpenAI/Ringg，也暫不做 email、記帳、電腦／雲端 AI connector。（日期：2026-09-24；來源：使用者確認）

## 尚未確認

- [QUESTION] 個人記憶的保存期限、刪除方式與哪些內容必須先取得使用者同意。
- [QUESTION] email、記帳系統、電腦／雲端 AI 的第一個實際連接器是哪一個。
- [QUESTION] Knowledge Ingest Token 只為 smoke test 臨時建立，測試後已刪除；正式匯入流程尚未配置長期 token。（驗證方式：`wrangler secret list`）
- [ASSUMPTION] OpenAI Realtime 會先作為 provider adapter 的候選，不直接取代現有 xAI 路徑。（驗證方式：另立 provider change）

## 目前進度

- P1：已確認 repo、文件位置與現有未提交檔案範圍。
- P2：已建立專案地圖、架構地圖、來源血緣、模組目錄與詞彙表。
- P3：第一個施工範圍已確認，保存政策與第一個外部 connector 延後。
- P4：已新增 LINE Webhook、xAI Chat Completions、reply/push fallback、共用歷史／知識工具、文件切塊與知識匯入端點；語音與文字共用後端查詢函式。
- P4 驗證：14/14 focused tests 通過；D1 `knowledge_chunks` 已遠端套用；Vectorize 建立完成；Worker 已部署；遠端匯入 smoke test 通過。
- P5：正式環境驗收中；LINE 平台傳輸邊界與非同步 ACK 已完成，真人 LINE 訊息事件與回覆畫面仍未取得證據。

## 下一步

下一步在即時 `wrangler tail` 監看時用測試帳號傳一則文字；若沒有 `text event` 日誌，改查使用者是否在正確官方帳號的一對一聊天室送出訊息；若有事件，再依 reply API 狀態修正。
