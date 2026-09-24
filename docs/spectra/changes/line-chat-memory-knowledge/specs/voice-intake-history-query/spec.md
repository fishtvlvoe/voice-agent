## ADDED Requirements

### Requirement: 查詢自己的歷史記錄

使用者不管透過語音或文字，問「我之前記錄過什麼」時，助理必須能查出並講出/打出真實資料，不能捏造。

#### Scenario: 有歷史記錄可查

- **WHEN** 使用者的 `lineUserId` 在 `voice_intake_records` 有過去的記錄
- **THEN** 助理列出最近幾筆的主題跟內容摘要，內容跟 D1 實際資料一致

#### Scenario: 沒有任何歷史記錄

- **WHEN** 使用者的 `lineUserId` 在 `voice_intake_records` 沒有任何記錄
- **THEN** 助理誠實告知「目前沒有記錄」，不可捏造內容

#### Scenario: 只能查自己的記錄

- **WHEN** 使用者 A 問「我之前記錄什麼」
- **THEN** 只回傳 `lineUserId` 等於使用者 A 的記錄，不會混進其他使用者的資料

### Requirement: 語音跟文字共用同一個查詢工具

`query_voice_intake_history` 這個 function-calling 工具必須是語音路徑（xAI Realtime）跟文字路徑（Chat Completions）共用同一份定義跟同一份後端查詢邏輯。

#### Scenario: 兩條路徑呼叫同一支查詢邏輯

- **WHEN** 語音助理跟文字助理都需要查歷史記錄
- **THEN** 兩者呼叫的是同一支後端函式（不是各自重複寫一份查詢邏輯）
