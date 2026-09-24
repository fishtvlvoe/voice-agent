# voice-agent 模組目錄

| 模組 | 入口 | 現況 | 邊界 | 下一個驗收重點 |
|---|---|---|---|---|
| LINE LIFF 身分 | `src/line-auth.js`、`src/index.js` | 已有 | 驗證 idToken 與 `lineUserId` 對應 | 模擬錯誤 token 與身分不一致 |
| xAI Realtime 語音 | `src/index.js`、LIFF 前端 | 已有 | 即時語音連線與工具呼叫 | 實際 LIFF 語音對話 |
| 語音表單 | `src/liff/voice-form-schema.js` | 已有 | 定義欄位與結構化送出 | 欄位驗證與 D1 寫入 |
| 聯絡資料 | `src/contacts.js`、`src/index.js` | 已有 | 客戶檔與提示 context | 讀寫權限與欄位限制 |
| 個人記憶 | `src/index.js` | 部分已有 | 目前有電話、信箱、地址等記憶邏輯 | 保存、刪除、同意與搜尋政策 |
| D1 | `schema.sql`、`wrangler.toml` | 已有 | 結構化資料儲存 | migration 與備份策略 |
| LINE 文字 webhook | change `line-chat-memory-knowledge` | 規劃中 | Messaging API 入口與回覆 | 簽章、reply/push、真實 LINE 驗證 |
| 歷史記錄查詢 | 同上 change | 規劃中 | 讓語音與文字共用歷史資料 | 查詢結果與身份隔離 |
| Vectorize 知識庫 | 同上 change、`wrangler.toml` | 規劃中 | 文件知識查詢，不等於個人記憶 | 寫入、RRF 查詢與來源標記 |
| OpenAI Realtime | `docs/openai-realtime-and-ringg-evaluation.md` | 未接入 | 候選 provider adapter | 延遲、工具、成本與回退驗收 |
| Ringg | 評估文件 | 未接入 | 外部比較方案 | 是否保留在架構中的決策 |
| email／記帳／電腦 AI connector | 尚無 runtime 入口 | 未建立 | 把已確認內容送往外部系統 | 先選第一個 connector，再定介面 |
