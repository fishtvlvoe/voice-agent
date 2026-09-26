## Why

目前 aiver AI智慧助理只有一個入口：LIFF 語音/文字填單頁面，必須從 Rich Menu 點進去才能用。Fish 的產品定義很明確：**一個真正的「LINE AI 語音助理」，不管使用者是開 LIFF 講話、還是直接在 LINE 聊天室打字，接的都是同一個大腦——同一個身分（`lineUserId`）、同一份記憶，問到的東西答案要一致**。

現在缺三塊，都是這個定義底下必要、但目前完全沒做的：

1. **LINE 聊天室直接文字問答**：官方帳號目前只負責顯示 Rich Menu，聊天室本身收不到訊息、不會回覆（沒有接 Messaging API webhook）。使用者只能透過 LIFF 頁面互動，不符合「在 LINE 裡面就能處理」的定義。
2. **查詢歷史記錄**：`voice_intake_records` 表只有寫入路徑，沒有查詢路徑，助理答不出「我之前記錄過什麼」。
3. **Vectorize 知識庫問答**：`docs/voice-agent-vectorize-design.html` 已經有設計，但從未寫成 SR、從未實作，助理無法從文件/FAQ 找答案回覆。

## What Changes

1. **Messaging API webhook**：新增 `/webhook/line` 端點（POST），驗證 LINE 簽章，處理 `message` 事件（文字訊息）。收到文字訊息後：
   - 用 `event.source.userId` 當身分（跟 LIFF 那邊的 `lineUserId` 是同一個 LINE user id，天然對得上）
   - 組出跟語音助理一致的 system context（沿用 `AGENT_INSTRUCTIONS` + 記憶 + 客戶檔）
   - 呼叫 OpenAI Chat Completions（文字對話不用 Realtime 語音那條；目前預設 `gpt-4.1`）
   - 用 Messaging API `reply` 端點把答案回覆回聊天室
2. **查詢歷史記錄工具**：新增一個 function-calling 工具（語音跟文字兩邊共用），依 `lineUserId` 查 `voice_intake_records`，取最近 N 筆組成摘要念/講給使用者聽。
3. **Vectorize 知識庫**：
   - 建立 `KNOWLEDGE_INDEX`（獨立於未來可能的 `CATEGORY_INDEX`）
   - 文件寫入路徑：純文字/Markdown → 依段落切塊 → bge-m3 轉向量 → 寫入 Vectorize，原文同時存一份到 D1（`knowledge_chunks` 表）
   - 查詢路徑：使用者問題 → 轉向量 → Vectorize 查詢 + D1 關鍵字查詢 → RRF 合併排序 → 前幾筆組成回答依據，餵進 AI 的 context
   - 這次先做「查詢」端跟「一支簡單的文件上傳 API」，不做正式的知識庫管理後台 UI（那是另一個決策）

## Non-Goals

- 不做知識庫文件管理後台 UI（先用簡單 API/手動 `wrangler d1`/`vectorize` 指令上傳測試文件）
- 不做群發推播（push message 主動發訊息給使用者），這次只做「使用者主動打字 → 助理回覆」的被動回覆流程
- 不改 LIFF 語音頁面本身的既有流程，這次是新增一條平行管道（文字聊天），語音管道維持現狀
- 不做多輪對話的長期歷史保存到向量庫（那是另一個更大的決策，這次只做「知識庫文件」跟「使用者提交記錄」兩種資料的查詢）

## Capabilities

### New Capabilities

- `line-chat-text-reply`: 使用者在 LINE 聊天室直接打字，官方帳號用文字回覆，跟 LIFF 語音助理共用同一套身分辨識、記憶、知識來源
- `voice-intake-history-query`: 語音/文字助理都能查詢並口述/文字念出使用者之前記錄過的內容
- `vectorize-knowledge-qa`: 助理能從已上傳的知識庫文件中找答案回覆使用者問題

## Impact

- 新增 Cloudflare 資源：Vectorize Index（`KNOWLEDGE_INDEX`）、D1 新表（`knowledge_chunks`）
- 新增 LINE 端資源設定：Messaging API webhook URL 要在 LINE Developers 後台設定並啟用（Basic settings → Messaging API → Webhook URL / Use webhook: On）
- 程式碼：`src/index.js` 新增 webhook handler + 知識庫查詢/寫入 handler；`src/liff/voice-form-schema.js` 新增歷史查詢工具定義（語音跟文字共用）
- 需要 Channel Access Token（第一次真的要用到了——之前 `line-official-account-setup` SR 判斷不需要寫進 secrets，這次要補上）
