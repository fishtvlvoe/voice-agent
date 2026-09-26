# Ringg 式多模型路由

日期：2026-09-26  
狀態：設計方向已確認；尚未施工

## 情境

voice-agent 目前使用 xAI Realtime 語音與 OpenAI Chat Completions `gpt-4.1` 文字模型；文字路徑剛完成從 xAI/Grok 的切換。先前把使用者指定的 OpenAI Ringg 案例誤解成單一 OpenAI Realtime 或 GPT-Live 選型，造成語音 API 與模型路由層級混淆。

## 來源

[OpenAI Ringg 官方案例](https://openai.com/zh-Hant/index/ringg/)

Ringg 公開的核心做法是依工作類型選模型：GPT-4.1 處理大部分即時語音與聊天流量，GPT-5.6 Luna 處理適合的即時工作，GPT-5.6 Terra 做通話後分析，GPT-5.6 Sol 做評估與提示詞改善。

## 決定

voice-agent 目標改為 Ringg 式 Provider Router，目標路由不使用 Grok：

- 一般 LINE 文字與即時回應：GPT-4.1 候選。
- 複雜工具、記憶與知識工作：GPT-5.6 Luna 候選。
- 回合後摘要、記憶整理與分類：GPT-5.6 Terra 候選。
- 離線測試、提示詞改善與模型評審：GPT-5.6 Sol 候選。

語音 API、音訊傳輸與 session endpoint 不由 Ringg 案例推定；需在獨立 Provider SR 中查官方 API並做 spike。

## 保留的部分

- LINE 身分驗證與文字 Webhook。
- D1 記憶、歷史資料與 `knowledge_chunks`。
- Vectorize 知識庫。
- 記憶同意政策與共用工具契約。

## 後果

- 不再用單一模型處理所有語音、文字、記憶和評估工作。
- 可以依延遲、品質與成本切換模型，但需要 Router、模型設定與觀測資料。
- 目前的 `line-chat-memory-knowledge` SR 不直接塞入 Provider Router；現有 SR 收尾後再建立新的 Provider SR。
- Ringg 文章沒有公開的部分維持未確認，不在未驗證前改寫產品語音入口。
