## 1. 資料庫

- [ ] 1.1 在 `schema.sql` 末尾新增 `customer_profiles` 表的 `CREATE TABLE IF NOT EXISTS` 定義（欄位：line_user_id 主鍵、display_name、member_tier、notes、last_order_summary、extra_json、updated_at），並依設計決策「客戶檔欄位長度先設硬上限」在寫入前（task 2.1）擋住超長值：display_name ≤ 40、member_tier ≤ 20、notes ≤ 200、last_order_summary ≤ 200 字元。驗證：`wrangler d1 execute voice-agent-db --file=schema.sql --local` 執行成功不報錯，且可重複執行不 drop 既有表

## 2. 後端：Voice session token includes customer profile

- [ ] 2.1 在 `src/index.js` 新增 `getCustomerProfile(env, lineUserId)`，查 `customer_profiles` 表，查無資料回傳 `null`，查詢拋出例外時交由呼叫端處理（不在此函式內吞掉例外），並套用 1.1 定義的欄位長度硬上限（超長直接截斷或視為無效資料，不整包塞進回傳值）。驗證：手動對已 insert 資料的 line_user_id 呼叫，回傳物件含 display_name/member_tier/notes/last_order_summary/extra_json；對不存在的 line_user_id 呼叫回傳 `null`
- [ ] 2.2 `handleVoiceSessionToken` 呼叫 `getCustomerProfile` 並用 try/catch 包住，依設計決策「查詢失敗不得阻斷換票」，成功或失敗都不阻斷既有的 clientSecret 換票流程，最終回應加上 `customerProfile` 欄位（物件或 `null`）。驗證：`POST /api/voice-session/token` 在有客戶檔時回應含 `customerProfile` 物件；在無客戶檔或查詢失敗時回應含 `customerProfile: null` 且 HTTP 狀態仍為 200（對應 spec Requirement: Voice session token includes customer profile、Requirement: Customer profile lookup failure does not block token issuance）

## 3. Prompt 組裝：Customer profile hint is appended to voice agent instructions

- [ ] 3.1 依設計決策「prompt hint 用獨立函式組裝，不寫進 AGENT_INSTRUCTIONS 常數」，在 `src/liff/voice-form-schema.js` 新增 `buildCustomerProfileHint(profile)`：`profile` 為物件時回傳含姓名/會員等級/最近訂單/備註的提示文字並附上「以對方這次說的為準」「不要一次念出整份檔案」的提醒；`profile` 為 `null` 或非物件時回傳明確告知「沒有預載客戶檔，不要假裝認識對方」的文字。驗證：分別傳入範例 profile 物件與 `null`，斷言回傳字串內容符合上述兩種情境（對應 spec Requirement: Customer profile hint is appended to voice agent instructions、Requirement: Agent must not fabricate unknown customer details）
- [ ] 3.2 在 `src/liff/voice-intake.js` 新增 `activeCustomerProfile` 狀態，`fetchClientSecret()` 成功後從回應存入 `activeCustomerProfile`，並在組 `session.update` 的 instructions 時，把 `buildCustomerProfileHint(activeCustomerProfile)` 接在既有的 `buildMemoryHint`／`buildRosterHint` 之後一併 join 進去。驗證：以有客戶檔跟無客戶檔兩種假資料手動走一次語音頁，開發者工具檢查送出的 `session.update` payload 的 `instructions` 字串包含對應的客戶檔提示或「沒有預載客戶檔」提示

## 4. 行為規格：資料一致性與隱私

- [ ] 4.1 確認 `buildCustomerProfileHint` 產出的文字要求「若對方說的跟檔案不一致，以對方這次說的為準，並口頭確認」。驗證：檢視 3.1 產出的提示文字內容包含此規則（對應 spec Requirement: Spoken statements take precedence over stale profile data）
- [ ] 4.2 確認 `buildCustomerProfileHint` 產出的文字不包含 `line_user_id`、系統內部欄位名稱、或原始 `extra_json` payload。驗證：對範例 profile（含 extra_json 內容）呼叫該函式，斷言回傳字串不含 line_user_id 字面值與 extra_json 的原始 JSON 字串（對應 spec Requirement: Customer profile content is not exposed outside the agent prompt）

## 5. 既有行為回歸驗證

- [ ] 5.1 確認 `user_memory` 的既有記憶行為未受影響。驗證：對已存有記憶資料的 line_user_id 呼叫 `POST /api/voice-session/token`，回應的 `savedMemory` 內容與本次改動前一致（對應 spec Requirement: Existing voice intake behavior is unaffected）
- [ ] 5.2 確認缺少或無效 idToken 時仍回 401。驗證：對 `POST /api/voice-session/token` 送出缺少 idToken 的請求，斷言回應狀態碼為 401 且未觸發任何 customer_profiles 查詢（對應 spec Scenario: Missing or invalid idToken still rejected）
- [ ] 5.3 確認 `/api/voice-intake/submit`、`/api/voice-intake/remember` 的既有回應格式與行為不變。驗證：對兩支 API 各送出一次符合既有格式的請求，回應欄位與狀態碼與本次改動前一致

## 6. 文件

- [ ] 6.1 在 `README.md` 的開發步驟補一行說明本次新增的 `customer_profiles` 表與其手動測試資料 insert 方式。驗證：檢視 README.md 內容包含 `customer_profiles` 相關的開發步驟說明
