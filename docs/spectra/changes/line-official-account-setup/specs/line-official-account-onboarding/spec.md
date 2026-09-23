## ADDED Requirements

### Requirement: 常駐 Rich Menu 進入點

已加「AIVER AI 語音助理」官方帳號好友的使用者，在聊天視窗下方必須看到常駐 Rich Menu，點擊主按鈕即可開啟語音助理，不需要任何額外輸入。

#### Scenario: 使用者加好友後看到選單

- **WHEN** 使用者第一次加「AIVER AI 語音助理」為好友
- **THEN** 聊天視窗下方立即顯示常駐 Rich Menu（非一次性彈跳訊息），內容至少包含「開始語音對話」主按鈕

#### Scenario: 點擊主按鈕開啟語音介面

- **WHEN** 使用者點擊 Rich Menu 的「開始語音對話」
- **THEN** 在 LINE 內建瀏覽器（非外部瀏覽器）開啟 LIFF 頁面，且使用者不需要重新輸入 LINE 帳號密碼即完成身分辨識

### Requirement: 官方帳號與 LIFF 正確關聯

新建的 Messaging API 官方帳號必須與新建的 LINE Login channel／LIFF app 正確關聯，且與既有「AIver」／「AI 小華」channel 完全獨立。

#### Scenario: LINE Login channel 綁定正確的官方帳號

- **WHEN** 檢查新建 LINE Login channel 的「Linked LINE Official Account」設定
- **THEN** 顯示的是這次新建的「AIVER AI 語音助理」官方帳號，不是既有的「AI 小華」

#### Scenario: 既有資源未被異動

- **WHEN** 這次變更部署完成後檢查 Provider「華AI」底下所有 channel
- **THEN** 既有的「AIver」（channel id `2011199500`）與「AI 小華」channel 設定與上線狀態維持不變

### Requirement: 語音連線串接真實 xAI Agent

LIFF 頁面建立的語音連線必須使用新建的 xAI Agent「Aiver」，而非既有/測試用的 Agent 或假資料。

#### Scenario: 語音對話使用正確 Agent

- **WHEN** 使用者在 LIFF 頁面開始語音對話
- **THEN** 後端使用寫入 Workers secrets 的新 API Key 呼叫 xAI Agent「Aiver」，且該 Agent 與舊有 Agent 使用不同 API Key
