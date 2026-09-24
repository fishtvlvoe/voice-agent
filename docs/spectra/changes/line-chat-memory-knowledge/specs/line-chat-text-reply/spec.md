## ADDED Requirements

### Requirement: Webhook 簽章驗證

任何進到 `/webhook/line` 的請求，必須先驗證 `x-line-signature` header，驗證失敗一律拒絕，不處理內容。

#### Scenario: 正確簽章的請求被接受

- **WHEN** LINE 官方伺服器送出的合法 webhook 請求（簽章用真實 Channel Secret 計算）
- **THEN** 系統驗證通過，繼續處理內容

#### Scenario: 偽造簽章的請求被拒絕

- **WHEN** 有人送一個 `x-line-signature` 是亂填或用錯 Secret 算出來的請求
- **THEN** 系統回傳 401，不處理內容裡的訊息，不呼叫任何下游 AI/資料庫邏輯

### Requirement: 文字訊息取得回覆

使用者在 LINE 聊天室對「AIVER AI 語音助理」官方帳號打字，必須在合理時間內收到文字回覆，回覆內容跟身分/記憶/知識庫一致。

#### Scenario: 使用者打字問候語

- **WHEN** 使用者傳送「你好」
- **THEN** 官方帳號用 reply API 回覆一則文字訊息，不是靜默無回應

#### Scenario: 同一使用者在語音跟文字兩邊都用過

- **WHEN** 使用者先前用 LIFF 語音助理提過自己的偏好（存進 `user_memory`），之後改用聊天室打字問相關問題
- **THEN** 文字回覆的內容有反映出那筆記憶，不是從零開始的陌生對話

### Requirement: Reply token 時效處理

LINE reply token 有時效限制且只能用一次，系統邏輯必須正確區分「立即回覆」跟「事後補充」。

#### Scenario: 在時效內回覆

- **WHEN** 系統在收到 webhook 事件後幾秒內就準備好回覆內容
- **THEN** 用 reply API 搭配該次事件的 reply token 送出

#### Scenario: 處理超過時效才有結果（例如知識庫查詢耗時）

- **WHEN** 準備回覆內容耗時超過 reply token 的可用時限
- **THEN** 改用 push API 送出，不強行使用已過期的 reply token 導致失敗
