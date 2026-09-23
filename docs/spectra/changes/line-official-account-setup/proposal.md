## Why

voice-agent 骨架程式碼已完成，但完全沒有接上真實 LINE 環境。要讓現場所有人「加 LINE 官方帳號好友 → 點常駐選單 → 開始語音對話」，需要先在 LINE Developers 建立官方帳號與登入管道，並串上 xAI 語音服務。這是產品要能被真人使用的最後一哩，不做就沒有能操作的成果。

現有 Provider「華AI」底下已有一個名為「AIver」的 LINE Login channel（Published，連結官方帳號「AI 小華」），但那是另一個舊案子，跟這次要做的「AIVER AI 語音助理」無關，不可重用或改動。這次要從零新建一組。

## What Changes

1. 在 LINE Developers Provider「華AI」（provider id `2004183930`）底下，新建一個 **LINE Login channel**，channel 名稱「AIVER AI 語音助理」，並在裡面建立 **LIFF app**（app type: web app，size: full，endpoint 指向部署後的 `src/liff/voice-intake.html`），拿到 LIFF ID。
2. 同一個 Provider 底下新建一個 **Messaging API channel**（官方帳號本體），channel 名稱同樣「AIVER AI 語音助理」，取得 Channel Access Token + Channel Secret。
3. 把上述 LINE Login channel 的「Linked LINE Official Account」設定指向這個新建的 Messaging API 官方帳號，讓兩者關聯。
4. 設定 **Rich Menu**（常駐選單，非加好友當下彈跳訊息）：
   - 上傳 `assets/rich-menu/richmenu-placeholder.png`（2500×1686，已用 SVG line-icon 繪製）
   - 三個可點區塊：上半「開始語音對話」（連到 LIFF URL）、左下「我的紀錄」、右下「使用說明」（後兩者先設定為佔位連結或關閉，待需求明確再接）
   - 設為預設選單，所有加好友的使用者都看得到
5. 在 xAI Voice Agents 後台（`https://console.x.ai/team/9147f831-4b43-482d-ae89-2a28f3980c45/voice/agents`）新建一個獨立 Agent，名稱「Aiver」，不與舊有 Agent 共用，取得新 API Key。
6. 建立真的 Cloudflare D1 資料庫（`wrangler d1 create voice-agent-db`），把 `database_id` 貼進 `wrangler.toml`，並套用 `schema.sql`。
7. 用 `wrangler secret put` 把 `LIFF_ID`、`XAI_API_KEY`、Messaging API 的 Channel Access Token/Secret 全部寫進 Workers 環境變數（Cloudflare Workers 部署 Token 先查 `/Users/fishtv/Development/.env` 的 `CLOUDFLARE_WORKERS_API_TOKEN`）。
8. `wrangler deploy` 正式部署，部署後用真手機 LINE 加好友 → 點 Rich Menu → 走一輪語音對話，驗證整條路真的通。

## Non-Goals

- 不做 Rich Menu 的正式視覺設計（目前用 SVG 佔位圖，之後 Fish 提供正式設計稿再換，是另一個決策）
- 不做「我的紀錄」「使用說明」的實際功能內容，這次只保留按鈕位置
- 不動、不改既有的「AIver」LINE Login channel 與「AI 小華」官方帳號（另一個案子）
- 不做 `customer_profiles` 的上傳介面（設計上刻意留白，維持 preload-customer-profile SR 的既有決策）

## Capabilities

### New Capabilities

- `line-official-account-onboarding`: 使用者加 LINE 官方帳號好友後，透過常駐 Rich Menu 點擊進入語音助理 LIFF 介面，全程身分自動用 LINE 登入辨識，不需另外輸入帳密

## Impact

- 外部資源：LINE Developers（新 LINE Login channel、新 Messaging API channel、LIFF app、Rich Menu）、xAI Voice Agents（新 Agent）、Cloudflare（D1 資料庫、Workers secrets、正式部署）
- 程式碼：`wrangler.toml`（database_id）、部署腳本/README 補上這次建立的資源 ID 對照
- 不涉及既有 `preload-customer-profile` 的程式邏輯，純接線+新建外部資源
