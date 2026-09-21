## Why

現在語音助理每次通話都從零開始問，使用者要重講一次姓名、等級、最近訂單這些已經存在的資料。開通時把這個 LINE 使用者的客戶檔預載進語音 AI 的對話指令，通話一開場就能認得對方、引用最近訂單，不用重問已知欄位。

## What Changes

- 新增 D1 資料表 `customer_profiles`，存 display_name／member_tier／notes／last_order_summary／extra_json
- `handleVoiceSessionToken` 查詢客戶檔，跟現有的 `memberNames`／`savedMemory` 一起回傳給前端
- 新增 `buildCustomerProfileHint`，把客戶檔轉成一段 prompt hint，接在既有的 memory hint 後面組進語音 AI 的 session instructions
- 查詢失敗或查無此人時，通行證照常發放，不阻斷換票；語音助理正常從頭問，不假裝認識對方
- 這次只做後端查詢＋prompt 組裝，不做客戶資料上傳頁，寫入客戶檔用 `wrangler d1 execute` 手動插資料

## Non-Goals

- 不做客戶資料上傳 UI（本次用手動 D1 insert 測試資料）
- 不改用 xAI Voice Agent Builder／MCP，維持現有 Realtime API 直連架構
- 不把 `XAI_API_KEY` 送到瀏覽器
- 不拿掉既有的 LINE idToken 驗證
- 不在 transcript UI 印出整份客戶檔

## Capabilities

### New Capabilities

- `voice-preload-customer-profile`：語音助理開通時查詢並預載客戶檔，組進語音 AI 對話指令，讓助理認得使用者、能引用其歷史資料

### Modified Capabilities

無。客戶檔預載是全新能力，不更動既有語音換票、語音收單送出、語音記憶功能的需求層行為。

## Impact

- `schema.sql`：新增 `customer_profiles` 表定義
- `src/index.js`：新增 `getCustomerProfile`，`handleVoiceSessionToken` 回傳內容擴充
- `src/liff/voice-form-schema.js`：新增 `buildCustomerProfileHint`
- `src/liff/voice-intake.js`：接住 `customerProfile`，組進 `session.update` 的 instructions
- `README.md`：補一行開發步驟說明
