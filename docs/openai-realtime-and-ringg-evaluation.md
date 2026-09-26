# 語音助理架構評估：Ringg 式多模型路由（含語音 API 實作候選）

> **來源修正（2026-09-26）**：本文件早期把 Ringg 的案例架構簡化成「OpenAI Realtime + 多模型路由」。目前以使用者指定的 [OpenAI Ringg 官方案例](https://openai.com/zh-Hant/index/ringg/) 為架構來源。Ringg 的重點是依工作分派模型，不是指定單一語音 API。
>
> 文章明確提到：GPT-4.1 處理大部分即時語音與聊天流量，GPT-5.6 Luna 處理適合的即時工作，GPT-5.6 Terra 處理通話後分析，GPT-5.6 Sol 處理評估與提示詞改善。文章沒有公開完整的 LIFF 語音傳輸與 session 實作，因此本文件中的 Realtime／WebRTC 只屬 API 候選，不能當成已確認決策。

## 0. 目前要採用的目標分工

```text
LINE 文字／LIFF 語音
          ↓
    Provider Router
          ├─ 一般即時回應：GPT-4.1
          ├─ 複雜工具與記憶工作：GPT-5.6 Luna
          ├─ 回合後摘要與記憶整理：GPT-5.6 Terra
          └─ 離線評估與提示詞改善：GPT-5.6 Sol
          ↓
    D1 / Vectorize / LINE
```

這是本產品對 Ringg 案例的設計映射，不代表完整 Router 已經接入；目前程式是「語音仍用 xAI Realtime、LINE 文字已用 OpenAI `gpt-4.1`」。目標架構不再使用 Grok。實作前必須另立 Provider SR，先驗證 OpenAI 語音 API、工具呼叫、延遲、成本與繁體中文品質。

> **專案**：`voice-agent` (aiver 語音助理)  
> **評估日期**：2026-09-24  
> **目的**：評估核心語音引擎切換候選與 Ringg 式多模型路由架構可行性，供後續 Provider SR 做規格拆解與實作計畫。本文不把 OpenAI Realtime／WebRTC 視為已確認選擇。

---

## 1. 換與不換的核心差異分析

目前系統架構為：**LINE LIFF 前端透過 WebSocket 直連 xAI Realtime API (`grok-voice-latest`)，後端 Cloudflare Worker 僅負責簽發短效 Token 與 D1 落庫**。

| 評估維度 | 不換（維持現狀 xAI Realtime） | 換（OpenAI Realtime + 多模型路由） |
|---|---|---|
| **底層協定** | 僅支援 WebSocket，音訊串流與重連需前端自行切片與補幀。 | 支援 **WebRTC** 與 WebSocket。在 LINE In-App Browser 內，WebRTC 提供硬體級回音消除、自適應抖動緩衝與更低延遲。 |
| **繁中自然度** | 偶爾出現英文開場或簡體語句倒灌；音色選擇極少；需在 Prompt 強制防護。 | 繁中語音（台灣腔/標準國語）自然度極高，支援多種原生音色；語調起伏與打斷（Barge-in）更細膩。 |
| **運算架構** | **單一模型一票到底**：同一個即時語音模型既要管發音、聽力，又要管對話邏輯與 JSON 結構化提取。 | **階層分工（Ringg 模式）**：<br>1. 即時層：OpenAI Realtime 專注自然語音互動與意圖抓取。<br>2. 處理層：後端非同步呼叫輕量文字模型（GPT-4.1 / Gemini Flash）做地址正規化、資料清洗與 D1 寫入。 |
| **工具穩定度** | 即時語音模型推理有限，遇到多層巢狀或多表單時，Function Calling 容易出現參數漏填或格式錯誤。 | 語音模型只回傳口語確認；後端 Worker 用強推理文字模型做二次 Schema 驗證，資料準確率接近 100%。 |
| **成本結構** | Realtime 語音費率看似單純，但所有 Token（包含填表與結構化整理）均以高價語音 Token 計費。 | 即時通話時間縮短（只確認意圖），長文本整理與結構化轉移至低成本文字模型，整體 Token 成本可降低 60~85%。 |
| **改動範圍** | **零改動**。專注於目前正在規劃的 `line-chat-memory-knowledge` (SR 2)。 | 需修改 `src/index.js`（Token 簽發換成 OpenAI Realtime Session API）與 `src/liff/voice-intake.js`（支援 WebRTC/OpenAI 事件協定）。 |

---

## 2. Ringg 模式 SWOT 分析

針對 OpenAI 案例中 Ringg 的「三階模型路由（Luna 即時 + Terra 摘要分析 + Sol 質檢）與全通路統一架構」進行分析：

```
                    【S】優勢 (Strengths)               【W】劣勢 (Weaknesses)
            ┌───────────────────────────────────┬───────────────────────────────────┐
            │ 1. 成本砍 90%：高低階模型分流      │ 1. 架構複雜度倍增，不再是純直連   │
            │ 2. 延遲極低 (<400ms)：即時只講話  │ 2. 狀態同步與失敗補償機制變多     │
            │ 3. 全通路一致：語音與文字共用大腦 │ 3. 自研 STT 偏向南亞口音，缺繁中  │
            │ 4. Action Agent：直接辦理業務     │    在地化模型優勢                 │
            └───────────────────────────────────┴───────────────────────────────────┘
            ┌───────────────────────────────────┬───────────────────────────────────┐
            │ 1. 台灣 LINE 生態系企業自動化剛需 │ 1. 語音大模型端到端迅速降價       │
            │ 2. 整合 Vectorize 打造智慧客服   │ 2. 手機 WebView 麥克風相容性限制  │
            │ 3. 邊緣無伺服器 (Cloudflare) 極輕 │ 3. 企業對通話錄音個資法規敏感     │
            └───────────────────────────────────┴───────────────────────────────────┘
                    【O】機會 (Opportunities)           【T】威脅 (Threats)
```

### Strengths（優勢）
1. **極致成本效益**：即時只跑輕量/低延遲語音，通話後重度推理交給批次文字模型，規避昂貴語音推理費。
2. **對話流暢無卡頓**：即時層不做複雜運算，反應延遲可控制在 400ms 內，體驗逼近真人。
3. **全通路記憶貫通**：客戶不論在語音還是文字聊天室，狀態與記憶完全無縫切換。
4. **業務辦理導向**：不僅僅是聊天或收單，能直接操作 API 跑完自動化流程。

### Weaknesses（劣勢）
1. **架構複雜度上升**：從原本單純的「前端連 WebSocket 直通」變成需要後端協調路由。
2. **狀態回滾成本**：一旦非同步處理層寫庫失敗，需要額外的錯誤通知與狀態補償機制。
3. **缺乏現成繁中自研語音庫**：Ringg 的自研 STT (Parrot) 專為南亞混語優化，在台灣繁體中文情境下無法直接套用，仍需依賴頂級商用 STT/Realtime API。

### Opportunities（機會）
1. **LINE 生態自動化藍海**：台灣中小企業高度依賴 LINE，整合 LIFF 語音 + LINE 聊天室文字是天然落地場景。
2. **Cloudflare 原生高併發**：搭配 Workers + D1 + Vectorize，架構維持 Serverless，營運成本極低。
3. **從「收單」升級為「全功能秘書」**：具備知識庫檢索與歷史回溯能力後，能切入高單價企業客服代管。

### Threats（威脅）
1. **模型端到端降價壓縮優勢**：若 OpenAI / xAI 的 Realtime 端到端模型大幅降價，自建多模型路由的維護代價相對變高。
2. **行動端硬體相容性**：不同手機品牌在 LINE 內開麥克風的權限與 WebRTC 行為偶有差異。
3. **法規與隱私門檻**：企業客戶對個資處理、通話內容留存有法規合規（如 GDPR / 台灣個資法）疑慮。

---

## 3. Ringg 模式 BWPA 決策維度分析

運用 **BWPA（Best / Worst / Possible / Actual）** 思考法，錨定決策底線與執行路線：

### B - Best cases（最佳情況）
* **情境**：全面導入 OpenAI Realtime (WebRTC) + 後端多模型非同步路由。
* **成果**：
  * LINE 語音接通率高、繁中咬字與語調自然逼真，毫無機械感。
  * 對話時延 < 400ms；通話結束瞬間，後端 Worker 自動完成訂單審查、繁簡標準化與知識庫關聯。
  * 每通電話 Token 成本壓低 80% 以上，全通路（LINE 文字 + LIFF 語音）共用同一份記憶與知識庫。

### W - Worst cases（最差情況 / 地板設定）
* **情境**：過度工程化（Over-engineering），在 Cloudflare Workers 試圖硬塞過於複雜的狀態機與中繼代理。
* **風險**：
  * 通話延遲因多次 API 轉發不降反升；
  * WebRTC 信令在部分 Android 手機的 LINE 內交握失敗；
  * 現有穩定運作的「快速語音收單」核心功能被改壞。
* **止損底線（Guardrail）**：保持前端直連 Realtime 核心架構不變，後端僅做「通話後非同步增強」，絕不自建中繼伺服器（保持 Serverless 極簡）。

### P - Possible cases（最有可能的情況 / 務實落地）
* **情境**：**漸進式演進（分兩階段）**。
  * **第一階段**：維持現有架構，優先完成正在進行的 `line-chat-memory-knowledge`（打通 LINE 文字 + 向量知識庫）。
  * **第二階段**：在現有收單骨架下，將即時語音連線抽象化為 Provider 介面（可切換 `xai` 或 `openai`）。前端換用 OpenAI Realtime WebRTC 提升語音品質，後端在 `submit_voice_intake` 觸發後加入輕量級背景模型做深入資料清洗。

### A - Actual cases（目前實際狀況）
* **程式碼現況**：
  * 語音仍是單一 xAI Realtime API (`wss://api.x.ai/v1/realtime?model=grok-voice-latest`)；LINE 文字已改用 OpenAI Chat Completions，預設 `gpt-4.1`。
  * 核心收單功能剛剛真人測試通過（SR 1 已完成）。
  * 全通路文字聊天與知識庫檢索（SR 2：`docs/spectra/changes/line-chat-memory-knowledge/`）已有部分代碼與 16/16 測試；該 SR 仍有 6 個未完成 task。

---

## 4. 給 Claude Code (CC) 的架構實作建議

若決定引入 OpenAI Realtime 與多模型路由，建議拆分為以下 Tasks：

1. **Task 1: Provider 抽象化**
   * 在 `src/index.js` 新增 `/api/voice-session/token` 的 provider 參數，支援簽發 OpenAI Ephemeral Session Token。
2. **Task 2: LIFF WebRTC 介面支援**
   * 在 `src/liff/voice-intake.js` 增加 WebRTC PeerConnection 邏輯，保留現有 WebSocket 做 Fallback。
3. **Task 3: 背景資料增強管線 (Terra 模式)**
   * 在 `handleVoiceIntakeSubmitFromLiff` 收到收單請求後，使用 Workers AI (如 `@cf/meta/llama-3.1-8b-instruct`) 或 OpenAI Chat Completions 進行非同步資料清洗與摘要，再寫入 D1。
4. **Task 4: 品質評估監控 (Sol 模式)**
   * 將通話秒數、中斷次數、欄位完整率記錄於 D1 `voice_session_metrics` 表，作為模型品質評估數據。
