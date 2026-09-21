# voice-agent

從一套語音收單系統抽出的**通用語音助理骨架**（Cloudflare Workers）。原系統把「要收集什麼欄位」跟「人設指令」寫死在程式碼裡，這裡改成設定檔驅動，換用途只需要改 `src/liff/voice-form-schema.js`，不用動程式邏輯。

## 這是什麼

一個透過 LINE LIFF 頁面進行語音對話、收集結構化資訊的助理：

1. 使用者打開 LIFF 頁面，用 LINE 身分驗證
2. 前端跟後端換一組短效期通行證，直接連上 xAI Realtime API 開始語音對話
3. 語音 AI 依 `voice-form-schema.js` 定義的欄位追問使用者，欄位齊全後呼叫工具送出
4. 後端驗證身分後，把結構化資料寫進 Cloudflare D1

## 骨架 vs 要自己接的東西

| 保留（骨架） | 要自己做 |
|---|---|
| LINE 身分驗證 | 換成其他通路的身分驗證（如果要做多通路） |
| 跟 xAI Realtime API 交握、通行證機制 | — |
| function calling 機制（存這筆／送出／記住） | 依你的用途調整 `voice-form-schema.js` 的欄位定義 |
| 記憶功能（記住聯絡方式） | — |
| 簡繁正規化範例 | 更完整的資料清洗（電話/地址格式正規化等） |
| — | 多租戶（SaaS）：每張表加 tenant_id |
| — | 向量知識庫（Vectorize）：回答開放式問題用 |

`docs/` 資料夾有五份設計文件，記錄了拆分過程的判斷跟後續模組設計，跟接手時的架構決策一併參考：

- `voice-agent-architecture-review.html` — 原系統架構盤點
- `voice-agent-full-architecture.html` — WeKnora 定位＋完整模組設計
- `voice-agent-vectorize-design.html` — 向量知識庫模組設計
- `voice-agent-cloudflare-saas-design.html` — Cloudflare 多租戶 SaaS 架構
- `voice-agent-generic-architecture.html` — 骨架 vs 表單邏輯的取捨

## 開發

```bash
npm install
wrangler d1 create voice-agent-db   # 建好後把 database_id 貼進 wrangler.toml
wrangler d1 execute voice-agent-db --file=schema.sql
# 預載客戶檔測試資料：INSERT INTO customer_profiles (line_user_id, display_name, member_tier, notes, last_order_summary, updated_at) VALUES ('U...', '測試客戶', 'VIP', '偏好電話聯絡', '2026-09-01 已完成訂單', unixepoch());
wrangler secret put LIFF_ID
wrangler secret put XAI_API_KEY
npm run dev
```

## 已知限制（設計上刻意留白，等接手時決定）

- 語音收單完成後只落地資料庫，沒有接任何通知（原系統是推播 LINE，這裡拔掉了）
- `contacts` 表只有兩筆假名範例，`voice-form-schema.js` 只有一種示範表單類型
- 沒有多租戶隔離，單一使用者/單一部署用途
- 沒有向量知識庫，`docs/voice-agent-vectorize-design.html` 是設計文件，還沒實作
