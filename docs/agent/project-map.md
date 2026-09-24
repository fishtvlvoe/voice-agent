# voice-agent 專案地圖

## 根目錄

| 路徑 | 責任 | 狀態 |
|---|---|---|
| `src/index.js` | Cloudflare Worker 路由、LINE 身分檢查、語音 intake、記憶與 D1 邏輯 | 目前執行來源 |
| `src/liff/` | LIFF 前端與語音表單／欄位定義 | 目前執行來源 |
| `src/line-auth.js` | LINE token 驗證 | 目前執行來源 |
| `schema.sql` | D1 資料表結構 | 目前資料模型來源 |
| `wrangler.toml` | Cloudflare Worker、D1 與環境綁定 | 部署設定 |
| `package.json` | 依賴與命令 | 目前只有 `dev`、`deploy` |
| `docs/agent/` | 跨 Agent 共用的專案脈絡 | SOP 文件 |
| `docs/spectra/changes/` | 專案現有的變更規格與任務 | 變更管理 |
| `docs/*.html` | 架構／UI／Cloudflare 設計參考 | 非 runtime |

## 常用命令

```bash
npm run dev
npm run deploy
```

`npm test`、`npm run build` 目前沒有在 `package.json` 定義。若要加入，必須先在 P3 決定測試範圍與驗收方式。

## 目前外部服務

- LINE LIFF：身分入口。
- xAI Realtime API：目前語音即時對話 provider。
- Cloudflare Workers：後端入口。
- Cloudflare D1：結構化資料與部分記憶儲存。
- Vectorize：在 `line-chat-memory-knowledge` change 中規劃，不能當成目前已啟用功能。
