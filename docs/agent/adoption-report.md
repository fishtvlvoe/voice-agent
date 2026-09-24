# voice-agent dev-sop 接管報告

日期：2026-09-24
repo：`/Users/fishtv/Development/voice-agent`
branch：`feature/line-chat-memory-knowledge`
目前階段：P4／D1，第一輪施工與遠端 smoke test 完成，尚未進入正式驗收

## 目前現場

- [FACT] 工作樹有既有未追蹤檔案：`docs/openai-realtime-and-ringg-evaluation.md`、`docs/spectra/changes/line-chat-memory-knowledge/`。本次不覆蓋、不重建。（證據：`git status --short --branch`）
- [FACT] `tasks.md` 目前有 6 個未勾選、10 個已勾選任務；未勾選項目集中在知識查詢行為與真人驗收。（證據：`rg -c "^- \\[ \\]"`、`rg -c "^- \\[x\\]"`）
- [FACT] 最近 commit 是 `87f6506`，內容包含 `line-official-account-setup`、設計規格與 Rich Menu 佔位圖。（證據：`git log -1 --oneline`）
- [FACT] 目前 runtime 基線是 LINE LIFF、Cloudflare Worker、xAI Realtime WebSocket 與 D1。（證據：`README.md`、`src/index.js`）

## 已存在的功能邊界

- [FACT] 語音路徑可取得短效 xAI client secret，瀏覽器再直接連 xAI Realtime。
- [FACT] Worker 有 LINE token 身分驗證、語音表單送出、部分使用者記憶與客戶資料邏輯。
- [FACT] `package.json` 現在已有 `dev`、`deploy`、`test`；`npm test` 本輪 14/14 通過。
- [FACT] OpenAI/Ringg 評估文件是規劃材料，不是已接入的 provider。

## 本輪 P3/P4 進度

- [DECISION] 第一個施工範圍已由 Fish 確認：LINE 文字聊天＋共用記憶／知識查詢；不切換 OpenAI/Ringg，不做外部 connector。
- [IMPLEMENTED] 新增 `/webhook/line`、`/api/internal/knowledge/ingest`、語音查詢端點、xAI Chat Completions 工具回合、LINE reply/push fallback、知識文件切塊與 RRF 查詢。
- [IMPLEMENTED] 語音前端與文字聊天共用 `queryVoiceIntakeHistory`／`queryKnowledgeBase` 後端查詢邏輯。
- [VERIFIED] `npm test` 14/14；`npx wrangler deploy --dry-run` 成功；遠端 D1 已確認 `knowledge_chunks` 存在；`wrangler vectorize list` 已列出 `voice-agent-knowledge-index`。
- [VERIFIED] 已部署 `voice-agent`，最新驗證版本 `722b75a1-a81a-4b02-8ff5-d6efef25789c`；LINE secrets 已寫入，`/v2/bot/info` 回傳 `AIVER AI 語音助理`／`@461fuosv`，有效簽章回 200、無效簽章回 401。
- [VERIFIED] 遠端知識匯入 smoke test 回傳 `ok:true` 與 `chunkCount:1`，等待非同步索引後用 `wrangler vectorize query --vector-id` 查回同一 vector，score `0.9999984`；D1、Vectorize 測試資料與臨時 secret 已清除。
- [VERIFIED] LINE webhook URL 已指向 Worker，LINE API 回讀 `active=true`；LINE webhook test 回傳 `success=true`、`statusCode=200`。
- [UNVERIFIED] 真實 LINE 使用者文字回覆、記憶交叉查詢、知識查詢完整相關性／無資料行為尚未驗證。

## 進行中的 change

- [TASK] `line-chat-memory-knowledge` 規劃 LINE 文字 webhook、歷史記錄查詢與 Vectorize 知識庫。
- [GAP] change 文件已有 proposal、design、spec、tasks；目前 10 個本機／D1／Vectorize／LINE secret 任務已勾選，正式 ingest token、知識查詢工具驗證與真人驗收仍未完成。
- [GAP] 個人記憶助理的完整目標還包含摘要 email、記帳系統、電腦／雲端 AI connector，這些尚未形成可施工的第一個 change。

## 來源關係

- [INHERITED] `voice-agent/src/`：本 repo 的 runtime 來源。
- [REFERENCE_ONLY] `docs/*.html` 與 provider 評估文件：設計與比較材料。
- [REFERENCE_ONLY] `bni-ai-saas`：可參考的另一個專案，不宣稱自動繼承或同步。

## 接續規則

1. 不先改 provider，不先刪除現有 xAI 路徑。
2. 先做真實 LINE 文字回覆與記憶交叉驗收，再配置正式 Knowledge Ingest Token。
3. 不把本機測試或 dry-run 當成真人 LINE 驗收。
4. 每個未完成 task 先補行為證據，再勾選。

## 下一個動作

進入 P5 前置：做 LINE Webhook、記憶與知識查詢的真人驗收；不要把 smoke test 當正式驗收。
