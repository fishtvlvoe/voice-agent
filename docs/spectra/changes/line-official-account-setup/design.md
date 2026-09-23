## Context

voice-agent 骨架已完成（LINE 身分驗證機制 + xAI Realtime 交握 + function calling），但沒有接任何真實 LINE/xAI/Cloudflare 資源。這次要建立正式的官方帳號進入點，讓語音助理真正能被現場使用者用 LINE 開通。

決策依據見對話對焦紀錄（2026-09-23）：
- 使用者旅程走「常駐 Rich Menu」（非加好友當下彈跳訊息）
- 使用者必須先加官方帳號好友，語音互動全程感覺在 LINE 裡面發生（LIFF 是 LINE 內建瀏覽器，不是外部網頁）
- 既有 Provider「華AI」底下的「AIver」channel（Published，連結「AI 小華」）是另一個舊案子，這次不可重用

## Goals / Non-Goals

**Goals:**

- 新建一組完全獨立的 LINE Login channel + Messaging API channel，名稱「AIVER AI 語音助理」
- 使用者加好友後，點常駐選單即可開始語音對話，全程 LINE 身分自動登入
- 真實部署到 Cloudflare Workers，可用真手機驗證整條路徑

**Non-Goals:**

- Rich Menu 正式視覺設計（先用 SVG 佔位圖）
- 「我的紀錄」「使用說明」的實際功能
- 修改既有「AIver」/「AI 小華」channel

## Decisions

### 常駐 Rich Menu 而非歡迎訊息按鈕

Fish 明確選擇「選項二」：畫面下方常駐選單，優於加好友當下彈跳訊息（選項一），因為這次目標是長期服務型態的「LINE AI 語音助理」，不是一次性活動連結。

### 新建獨立 Channel，不重用既有「AIver」

對話中發現既有 Provider「華AI」底下已有同名巧合的「AIver」LINE Login channel（Published，Channel ID `2011199500`，連結官方帳號「AI 小華」）。Fish 明確裁示：那是另一個舊案子，這次要新建完全獨立的一組，命名「AIVER AI 語音助理」，避免撞名混淆與誤改到舊資源。

### 部署架構：Demo 走模式 A（共用後端多租戶），保留未來切模式 B 的路

Demo 階段不需要客戶自己的 Cloudflare 帳號，只需要客戶提供 LINE 資料 + xAI 資料。全部客戶共用我們自己一份 Cloudflare Workers + D1，每張表用 `tenant_id` 分流（沿用 `docs/voice-agent-cloudflare-saas-design.html` 既有設計）。這次這組 LINE Login channel + Messaging API 官方帳號「AIVER AI 語音助理」就是模式 A 底下的第一個 tenant。

不需要另外買網域，Cloudflare Workers 自帶 `*.workers.dev` 網址即可當 LIFF Endpoint。

未來若要切模式 B（客戶各自獨立部署，資料實體隔離），不需要重寫這次的程式碼邏輯，只是改成用客戶自己的 Cloudflare 帳號重新跑一次本次 tasks.md 的部署流程（另開新 SR 處理）。完整架構圖見 `https://voice-agent-saas-architecture.pages.dev/`（已發布）。

### 瀏覽器自動化一律用 ego-browser

依全域硬規則（`~/.agent-guardrails/deny-list.md` 瀏覽器操作段），任何需要開瀏覽器操作 LINE Developers / xAI Console 的步驟，實作代理（Agy）必須用 `ego-browser` CLI，禁止用其他瀏覽器自動化工具。ego-browser 沿用 Fish 本機已登入的瀏覽器 session，不需要重新輸入帳密。

## Implementation Contract

**Behavior**：
- 使用者掃 QR 或點連結加「AIVER AI 語音助理」官方帳號好友
- 聊天室下方立即出現常駐 Rich Menu，三個區塊：開始語音對話 / 我的紀錄（佔位）/ 使用說明（佔位）
- 點「開始語音對話」→ 開啟 LIFF（LINE 內建瀏覽器）→ 自動用 LINE 身分登入 → 建立語音連線（xAI Agent「Aiver」）

**Interface / 資源清單（實作完成後必須全部有真實值，不可留佔位）**：
- LINE Login channel ID + LIFF ID
- Messaging API channel：Channel Access Token、Channel Secret
- xAI Agent「Aiver」的 API Key
- Cloudflare D1：`database_id`（寫入 `wrangler.toml`）
- Cloudflare Workers secrets：`LIFF_ID`、`XAI_API_KEY`、（視程式碼需要可能還有 LINE Channel Secret/Token）
- Rich Menu：richMenuId（已在 LINE 後台設為預設）

**Failure modes**：
- ego-browser 操作 LINE/xAI 後台卡在需要人工介入的畫面（如二次驗證、條款同意）→ 依 ego-browser SOP `handOffTaskSpace` 交還 Fish 操作，不可自行猜測繞過
- `wrangler d1 create` / `wrangler deploy` 失敗 → 先查 `.env` 的 `CLOUDFLARE_WORKERS_API_TOKEN` 是否正確覆蓋 `CLOUDFLARE_API_TOKEN` 環境變數，不要走 `wrangler login` OAuth

**Acceptance criteria**：
- 用真手機 LINE 加好友 → 看到 Rich Menu → 點「開始語音對話」→ LIFF 開啟並完成一次語音問答，過程截圖存證
- `wrangler tail` 或 D1 查詢確認有真實資料寫入（非測試假資料殘留）
- 所有資源 ID/Token 已實際寫入 `wrangler.toml` / Workers secrets，`grep` 專案不可有任何 placeholder 字樣殘留

**Scope boundaries**：
- 只做本次列出的三個帳號資源建立 + 接線 + 部署，不做 Rich Menu 正式設計、不做既有 SR 之外的新功能

## Risks / Trade-offs

- **風險：Agy 操作 LINE Developers 後台時可能誤入既有「AIver」/「AI 小華」channel**。對策：tasks.md 明確寫死目標 Provider ID（`2004183930`）與「這次要新建，不可點進 AIver（channel id 2011199500）」的警語
- **風險：xAI Agent 新建流程若介面跟兩週前不同，需要重新確認欄位**。對策：Agy 先截圖現況回報，PM 對過再繼續，不用假設欄位位置
- **風險：Rich Menu 三個區塊有兩個是佔位功能，上線後使用者點了沒反應**。對策：佔位按鈕的 action 先設定為簡單文字說明（如「即將推出」），不要設空連結
