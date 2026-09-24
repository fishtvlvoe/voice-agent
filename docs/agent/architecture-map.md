# voice-agent 架構地圖

## A. `FACT`：目前真的在跑的語音路徑

```text
使用者
  ↓
LINE LIFF 頁面
  ↓ liff.init / LINE 身分
Cloudflare Worker
  ↓ 換短效 xAI client secret
瀏覽器 WebSocket 直連 xAI Realtime
  ↓ function calling / voice form
Cloudflare Worker
  ↓ 驗證 LINE idToken 與 lineUserId
Cloudflare D1
  ↓
voice_intake_records、user_memory、customer_profiles 等資料
```

這條路徑的核心是「語音收集結構化資料」，不是完整的個人記憶搜尋中樞。

## B. `FACT` + `TASK`：現有 change 規劃中的文字與知識路徑

```text
LINE 聊天室文字
  ↓ Messaging API webhook + 簽章驗證
同一個 lineUserId
  ↓ 讀 user_memory / customer_profiles
xAI Chat Completions
  ↓ 工具：歷史記錄查詢、知識庫查詢、記憶更新
LINE reply / push
```

Vectorize 知識庫與 webhook 是 change 的規劃內容；要以 tasks、程式碼與行為驗證判斷完成度，不能把設計稿當成已上線功能。

## C. `DECISION`：產品目標方向

```text
LINE 文字、LINE 語音訊息、LIFF 即時語音
  ↓
統一入口層：身分、轉文字、來源、時間
  ↓
統一記憶大腦：原文、摘要、分類、可搜尋記憶、權限
  ↓
回答與動作層
  ├─ LINE 回覆
  ├─ 摘要 email
  ├─ 記帳系統
  └─ 電腦／雲端 AI 任務
```

這是產品目標，不代表 C 圖的每個模組現在都存在。下一個 P3 要先決定資料保存政策與第一個 connector。

## Provider 的位置

- xAI Realtime：目前語音 provider。
- OpenAI Realtime：評估中的另一個即時語音 provider，是否導入要走 adapter 與驗收，不是直接換 import。
- Ringg：外部方案／比較對象；目前文件評估不等於 runtime 整合。
- Chat Completions：文字回覆可用的非串流語音模型路徑；它和 Realtime 的延遲、連線與工具執行方式不同。
