# voice-agent Skill 使用紀錄

| 日期 | 任務／階段 | 實際使用 | 沒有使用但被考慮 | 證據 |
|---|---|---|---|---|
| 2026-09-24 | P1/P2 接管與 dev-sop 導入 | `dev-sop`、`duijiao`、`skill-creator`、`context-mode` | `graphify-navigation`（本 repo 沒有 CodeGraph 索引）、`ego-browser`（本輪沒有 UI 行為驗證） | `CONTEXT.md`、`adoption-report.md`、Skill validator、inventory/status smoke test |
| 2026-09-24 | P3/P4 LINE 文字聊天＋共用記憶／知識查詢 | `dev-sop`、`context-mode`、`ego-browser`、`wrangler` | `graphify-navigation`（仍無 CodeGraph 索引）、`openai-docs`（本輪不改 OpenAI） | `npm test` 14/14、Wrangler dry-run、D1 remote schema、Vectorize 權限修復、Worker deploy、LINE secrets 接入、遠端 ingest smoke test、`tasks.md` |
| 2026-09-25 | P5 LINE 無回覆 Debug 與 dev-sop 完整化 | `dev-sop`、`skill-creator`、`wrangler`、`ego-browser` | `graphify-navigation`（本 repo 沒有 CodeGraph 索引） | `status.py`、LINE endpoint readback、管理端三個回應開關、xAI 200 smoke test、合成合法簽章 RED、LINE 官方 Webhook Test 200、Worker tail 顯示 `eventCount=0`、非同步 ACK `200/0.26s`、`npm test` 15/15、Skill validator、skill drift check |
| 2026-09-25 | dev-sop SR／派工閘門補強 | `dev-sop`、`skill-creator`、`spectra` | `dev-agent-orchestrator`、`worktree-agent`（本輪只修改流程文件，未派 worker） | `spectra --help`、`spectra list --changes --json`、3 份 in-progress change 證據、Skill validator、skill drift check |
| 2026-09-26 | 來源誤判修正與 Ringg 多模型路由對焦 | `dev-sop`、`skill-creator`、`context-mode`、`openai-docs` | `dev-agent-orchestrator`、`worktree-agent`（SR 尚未可開，且本輪未派 worker）、`ego-browser`（未做 UI 驗收） | 使用者指定 Ringg 官方文章、Skill validator、skill drift check、`CONTEXT.md`、`.adr/001-ringg-model-routing.md`、評估文件來源修正；未改產品程式 |
| 2026-09-26 | OpenAI 文字基線切換與部署驗證 | `dev-sop`、`openai-docs`、`wrangler`、`context-mode` | `dev-agent-orchestrator`、`worktree-agent`（既有 in-progress SR 尚未清理，未派 worker）、`ego-browser`（本輪沒有 UI 驗收） | `src/line-chat.js`、測試與 Wrangler 設定；`npm test` 18/18；OpenAI `gpt-4.1` API HTTP 200；Worker secret 名稱含 `OPENAI_API_KEY`；部署版本 `6d1b3efd-0626-4232-bf3f-085a278f1ca5`；合成合法簽章 webhook `200 {"ok":true,"queued":1}`；假 reply token 的 LINE 回覆 400 已明確標記為測試邊界 |

## 規則

沒有出現在這份紀錄，不代表 Skill 從未使用；只代表目前沒有證據。清理前要先累積跨任務紀錄，再決定 archive 或停用。
