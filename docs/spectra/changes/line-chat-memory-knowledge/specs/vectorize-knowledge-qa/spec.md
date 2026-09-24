## ADDED Requirements

### Requirement: 知識庫文件寫入

系統必須能把一份純文字/Markdown 文件依段落切塊、轉成向量存進 Vectorize，同時把原文存進 D1，供之後查詢時組出回答依據。

#### Scenario: 上傳一份文件

- **WHEN** 呼叫文件寫入端點/指令，帶一份純文字或 Markdown 內容
- **THEN** 文件依段落切塊後，每個 chunk 都轉成向量寫進 `KNOWLEDGE_INDEX`，同一批 chunk 的原文也寫進 D1 `knowledge_chunks` 表

#### Scenario: 向量維度要跟 embedding 模型一致

- **WHEN** 建立 `KNOWLEDGE_INDEX` 這個 Vectorize index
- **THEN** 指定的向量維度要跟 bge-m3 模型實際輸出的維度一致，寫入時不可因維度不符被拒絕

### Requirement: 知識庫問答查詢

使用者問問題時，系統必須用向量查詢 + D1 關鍵字查詢兩批候選，合併排序後組成回答依據，不可只靠單一比對方式、也不可在查無資料時捏造答案。

#### Scenario: 問題在知識庫範圍內

- **WHEN** 使用者的問題跟已上傳文件的某段內容語意相近
- **THEN** 助理從 Vectorize 查詢跟 D1 關鍵字查詢各取一批候選，用 RRF 公式合併排序，取前幾筆組成回答依據回覆使用者

#### Scenario: 問題不在知識庫範圍內

- **WHEN** 使用者的問題跟已上傳文件內容都不相關（向量查詢與關鍵字查詢都沒有夠相關的候選）
- **THEN** 助理明確告知「知識庫目前沒有相關資料」，不可捏造或用通用知識假裝是知識庫內容回答

### Requirement: 語音跟文字共用同一個知識庫查詢工具

`query_knowledge_base` 這個 function-calling 工具必須是語音路徑跟文字路徑共用同一份定義跟同一份後端查詢邏輯。

#### Scenario: 兩條路徑呼叫同一支查詢邏輯

- **WHEN** 語音助理跟文字助理都需要查知識庫
- **THEN** 兩者呼叫的是同一支後端函式，回答依據一致，不會語音回答一套、文字回答另一套
