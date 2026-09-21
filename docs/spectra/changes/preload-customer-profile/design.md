## Context

`voice-agent` 是從既有語音收單系統抽出的通用骨架，現有 `handleVoiceSessionToken` 已經會查 `contacts`（人名同音校正）跟 `user_memory`（電話/信箱/地址記憶），前端 `voice-intake.js` 用 `buildRosterHint`／`buildMemoryHint` 把這兩份資料組進語音 AI 的 session instructions。這次要再加一層「客戶檔」：姓名、會員等級、備註、最近訂單摘要，讓語音助理開場就能用，不用使用者先自報。

現有架構（LINE 身分驗證、xAI Realtime 換票、function calling 機制）不拆，只在既有的查詢＋prompt 組裝這條線上擴充。

## Goals / Non-Goals

**Goals:**

- 開通語音通話時，查出這個 LINE 使用者的客戶檔，跟現有的 `memberNames`／`savedMemory` 一起回傳給前端
- 客戶檔轉成一段 prompt hint，接在既有 hint 之後組進語音 AI 的 instructions
- 查無資料或查詢失敗都不影響通行證正常發放，語音助理照常從頭問，不允許 AI 幻覺出不存在的會員等級或訂單

**Non-Goals:**

- 不做客戶資料上傳頁面（測試資料用 `wrangler d1 execute` 手動 insert）
- 不改成 xAI Voice Agent Builder／MCP 架構
- 不把 `XAI_API_KEY` 送到瀏覽器
- 不拿掉既有 LINE idToken 驗證
- 不在 transcript UI 顯示整份客戶檔內容
- 不重構音訊處理、換票機制、LIFF 登入流程

## Decisions

### 查詢失敗不得阻斷換票

`getCustomerProfile` 查詢失敗時回傳 `null`，`handleVoiceSessionToken` 用 try/catch 包住，失敗只記 log，`clientSecret` 照常回傳。理由：客戶檔是加分資訊，不是通話能不能開始的必要條件；讓查詢失敗連帶擋住通行證發放，會把一個「錦上添花」功能變成單點故障。

### 客戶檔欄位長度先設硬上限

`display_name` ≤ 40、`member_tier` ≤ 20、`notes` ≤ 200、`last_order_summary` ≤ 200，`extra_json` 解析後只挑最多 3 個短欄位塞進 prompt。理由：這些欄位最終會整段塞進語音 AI 的 system instructions，欄位太長會拉長 prompt、增加延遲跟成本；先用硬上限擋住，不做欄位長度的動態裁切邏輯（Non-Goal）。

### Prompt hint 用獨立函式組裝，不寫進 AGENT_INSTRUCTIONS 常數

新增 `buildCustomerProfileHint(profile)`，在組 session instructions 時跟 `buildRosterHint`／`buildMemoryHint`／`buildTodayHint` 同一批 filter(Boolean).join 起來。理由：`AGENT_INSTRUCTIONS` 是固定不變的人設骨架（沿用既有的「設定檔驅動」設計），動態內容一律用 build*Hint 這個既有模式擴充，不寫死進常數，維持跟現有 roster/memory hint 一致的擴充方式。

### 沒有客戶檔時明確告知 AI 不要假裝認識

`buildCustomerProfileHint` 在 `profile` 為 `null`/非物件時回傳一句「目前沒有預載的客戶檔。不要假裝認識對方。先用對方自己說的資訊。」而不是回傳空字串。理由：空字串會讓 AI 完全沒有訊號、可能自行腦補；明確講清楚「沒有」比沉默更能防止幻覺。

## Implementation Contract

**行為**：語音助理開通通話時（呼叫 `POST /api/voice-session/token`），若 D1 的 `customer_profiles` 有對應 `line_user_id` 的資料列，回傳內容多一個 `customerProfile` 欄位（物件或 `null`）；前端收到後組進語音 AI 的 session instructions，該次通話開場即可自然使用姓名、引用最近訂單，且不重複追問已知的欄位。若無對應資料列或查詢失敗，`customerProfile` 為 `null`，語音助理行為與現在完全一致（從頭問，不引用任何客戶資料）。

**資料形狀**：

- D1 新表 `customer_profiles(line_user_id TEXT PRIMARY KEY, display_name TEXT, member_tier TEXT, notes TEXT, last_order_summary TEXT, extra_json TEXT, updated_at INTEGER NOT NULL)`
- `POST /api/voice-session/token` 回應 JSON 新增欄位：`customerProfile: { display_name, member_tier, notes, last_order_summary, extra_json } | null`
- `buildCustomerProfileHint(profile: object | null): string`：輸入客戶檔物件或 `null`，回傳一段純文字 prompt hint

**失敗模式**：`getCustomerProfile` 查詢拋出例外時，在 `handleVoiceSessionToken` 內被捕捉、記錄 `console.error`，`customerProfile` 視為 `null` 繼續往下走，不得讓整個換票請求回傳非 200。

**驗收標準**：

1. D1 沒有該 LINE 使用者的 `customer_profiles` 列：換票成功（HTTP 200 且 `clientSecret` 有值），語音助理不引用任何不存在的會員等級或訂單
2. D1 有該列：`POST /api/voice-session/token` 回應的 `customerProfile` 帶出對應欄位值
3. 現有 `savedMemory`（`user_memory` 表）行為不變：先前記住的電話/信箱/地址下次通話仍會代入
4. `POST /api/voice-session/token` 沒帶有效 `idToken` 時仍回 401，不受本次改動影響
5. 模擬 D1 查詢拋出例外：換票請求仍回 200 並拿到 `clientSecret`，`customerProfile` 為 `null`
6. `/api/voice-intake/submit`、`/api/voice-intake/remember` 既有行為與回應格式不變

**範圍邊界**：

- 範圍內：`schema.sql` 新增表定義、`src/index.js` 新增查詢函式與回應欄位擴充、`src/liff/voice-form-schema.js` 新增 `buildCustomerProfileHint`、`src/liff/voice-intake.js` 接住並組進 instructions、`README.md` 補開發步驟說明
- 範圍外：客戶資料上傳介面、`customer_profiles` 的新增/修改/刪除 API、音訊處理與換票機制重構、LIFF 登入流程異動

## Risks / Trade-offs

- **[風險] 客戶檔內容外洩到 transcript UI 或工具輸出** → 緩解：`buildCustomerProfileHint` 只組進語音 AI 的 system instructions，不寫進任何會顯示在畫面上的 `transcript` bubble；prompt 明確要求「不要一次把整份檔案念出來，只在相關時引用」「不要洩漏 line_user_id、系統內部欄位名稱」
- **[風險] 客戶檔資料過期或跟使用者這次講的不一致，AI 卻優先採信舊資料** → 緩解：prompt 明確要求「若對方說的跟檔案不一致，以對方這次說的為準，並口頭確認」
- **[風險] `extra_json` 內容不受控（外部寫入的自由格式 JSON）被整包塞進 prompt，拉長長度或夾帶不當內容** → 緩解：Implementation Contract 要求只挑最多 3 個短欄位，不整包塞入；本次交付先只處理已定義欄位（display_name/member_tier/notes/last_order_summary），`extra_json` 的挑欄位邏輯留待後續 tasks 明確定義

## Migration Plan

1. 在 `schema.sql` 末尾新增 `customer_profiles` 表的 `CREATE TABLE IF NOT EXISTS`，不 drop 既有表
2. 既有部署對已存在的 D1 執行 `wrangler d1 execute voice-agent-db --file=schema.sql` 即可套用新表，`IF NOT EXISTS` 保證可重複執行
3. 沒有資料回填需求，`customer_profiles` 一開始就是空表，查無資料時行為等同本功能上線前

## Open Questions

- `extra_json` 裡「挑 3 個以內短欄位」的具體挑選規則（哪 3 個、怎麼判斷優先序）留待 tasks 階段定義，目前先以 `display_name`／`member_tier`／`notes`／`last_order_summary` 四個已定義欄位為主，`extra_json` 的動態挑選視實作階段時間決定是否本次一併做
