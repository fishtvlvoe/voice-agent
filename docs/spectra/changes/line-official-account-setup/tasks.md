## 0. 前置警語（實作前必看）

- **禁止**進入或修改 channel id `2011199500`（既有「AIver」LINE Login channel）或官方帳號「AI 小華」。這次一律新建。
- 所有瀏覽器操作（LINE Developers、xAI Console）一律用 `ego-browser` CLI（`references/install.md` 有安裝說明），禁止用其他瀏覽器自動化工具。ego-browser 會沿用 Fish 本機已登入的 session，不需要重新登入。
- 卡在需要 Fish 本人操作的畫面（條款同意、簡訊驗證等）→ 用 `handOffTaskSpace` 交還，說明卡在哪一步，不可自行猜測繞過。

## 1. LINE Login channel + LIFF app

- [ ] 1.1 在 Provider「華AI」（`https://developers.line.biz/console/provider/2004183930`）底下新建一個 LINE Login channel，名稱「AIVER AI 語音助理」。驗證：`ego-browser` 截圖顯示 channel 建立成功，channel id 為新產生的號碼（不等於 `2011199500`）
- [ ] 1.2 在該 channel 內建立 LIFF app（app type: web app，size: full），Endpoint URL 先填暫定值（部署完成後於 1.4 回頭更新為真實 Workers URL）。驗證：LIFF 列表出現一筆，拿到 LIFF ID
- [ ] 1.3 把拿到的 LIFF ID 記錄到 `docs/spectra/changes/line-official-account-setup/resource-ids.md`（新檔案，記錄這次所有真實 ID/Token，不可留在對話裡）
- [ ] 1.4 Cloudflare 部署完成（見第 6 節）後，回頭把 LIFF Endpoint URL 更新為真實 Workers URL。驗證：LIFF 設定頁面顯示的 Endpoint 是正式網址，非佔位值

## 2. Messaging API 官方帳號

- [ ] 2.1 同一個 Provider 底下新建 Messaging API channel，名稱「AIVER AI 語音助理」。驗證：channel 建立成功且狀態非 Published 前的草稿也算，截圖存證
- [ ] 2.2 取得 Channel Access Token（Issue 長期 token）與 Channel Secret。驗證：兩個值都記錄進 `resource-ids.md`，且不是空值
- [ ] 2.3 把 1.1 建立的 LINE Login channel「Linked LINE Official Account」指向這個新官方帳號。驗證：LINE Login channel 的 Basic settings 頁面「Add friend option」顯示的是「AIVER AI 語音助理」，不是「AI 小華」

## 3. Rich Menu

- [ ] 3.1 上傳 `assets/rich-menu/richmenu-placeholder.png` 作為 Rich Menu 圖片，設定三個可點區域：上半連到 LIFF URL（`https://liff.line.me/<LIFF_ID>`）、左下暫時設「即將推出」提示訊息、右下暫時設「即將推出」提示訊息。驗證：Rich Menu 預覽圖與實際上傳圖一致，三個區塊都可點擊有反應
- [ ] 3.2 把這個 Rich Menu 設為預設選單（所有好友都看得到）。驗證：用測試帳號加好友後，聊天室下方立即出現此選單，不需額外操作

## 4. xAI Agent

- [ ] 4.1 在 `https://console.x.ai/team/9147f831-4b43-482d-ae89-2a28f3980c45/voice/agents` 新建一個 Agent，名稱「Aiver」，不與既有 Agent 共用設定。驗證：Agent 列表出現獨立一筆「Aiver」
- [ ] 4.2 取得該 Agent 的 API Key。驗證：Key 記錄進 `resource-ids.md`，且跟舊 Key 不同值

## 5. Cloudflare D1 資料庫

- [ ] 5.1 `wrangler d1 create voice-agent-db`（部署 Token 先 `export CLOUDFLARE_API_TOKEN=$(grep "^CLOUDFLARE_WORKERS_API_TOKEN=" /Users/fishtv/Development/.env | cut -d= -f2-)`）。驗證：指令回傳的 `database_id` 貼進 `wrangler.toml`
- [ ] 5.2 `wrangler d1 execute voice-agent-db --file=schema.sql` 套用 schema。驗證：`wrangler d1 execute voice-agent-db --command "SELECT name FROM sqlite_master WHERE type='table'"` 列出預期資料表

## 6. Secrets + 部署

- [ ] 6.1 `wrangler secret put LIFF_ID`、`wrangler secret put XAI_API_KEY`。**已 cross-impact 確認**：`src/index.js` 只讀取 `env.LIFF_ID`、`env.XAI_API_KEY`、`env.DB`、`env.ASSETS`，目前程式碼沒有呼叫 Messaging API 推播/回覆（`grep -rn "CHANNEL\|channelSecret" src/*.js` 無結果），所以第 2 節拿到的 Channel Access Token/Secret **這次不用寫進 Workers secrets**，只需記錄在 `resource-ids.md` 留存。驗證：`wrangler secret list` 只列出 `LIFF_ID`、`XAI_API_KEY` 兩把
- [ ] 6.2 `wrangler deploy` 正式部署。驗證：部署指令回傳成功網址，`curl` 打健康檢查端點（若有）回傳 200
- [ ] 6.3 回頭完成 1.4（更新 LIFF Endpoint 為真實網址）

## 7. 真人驗證

- [ ] 7.1 用真手機 LINE 掃 QR 加「AIVER AI 語音助理」好友，確認常駐 Rich Menu 出現。驗證：截圖存證
- [ ] 7.2 點「開始語音對話」，完成一次完整語音問答（開口說話 → 助理回應）。驗證：截圖 + 若有後端 log/D1 寫入紀錄一併附上
- [ ] 7.3 確認全程沒有要求使用者手動輸入 LINE 帳密（自動用 LINE 身分辨識）。驗證：口述或截圖記錄整個流程沒有出現登入表單
