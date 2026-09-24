# voice-agent 來源血緣

## 判定規則

來源分成 `INHERITED`、`ADAPTED`、`EXTRACTED`、`REFERENCE_ONLY`、`UNKNOWN`。沒有 import、diff、commit 或文件證據時，不宣稱「繼承」。

## 目前判定

| 來源 | 標籤 | 目前能確認的關係 |
|---|---|---|
| `voice-agent/src/` | `INHERITED`（本 repo 內） | 目前 runtime 的直接來源。語音 token、xAI WebSocket、表單工具、D1 寫入都在這裡。 |
| `voice-agent/docs/*.html` | `REFERENCE_ONLY` | 架構拆解、Vectorize、SaaS 與 UI 設計參考，不會被 Worker 執行。 |
| `docs/openai-realtime-and-ringg-evaluation.md` | `REFERENCE_ONLY` | provider 比較與遷移判斷文件，不代表 OpenAI 或 Ringg 已接入。 |
| `docs/spectra/changes/line-chat-memory-knowledge/` | `TASK` / `REFERENCE_ONLY` | 變更規格與任務來源；checkbox 不能證明程式碼完成。 |
| `bni-ai-saas` | `REFERENCE_ONLY` | 有可重用的 LINE、xAI、記憶與 MCP 概念，但目前不能宣稱 `voice-agent` 自動繼承或同步它。要抽取時另做 P3 決策與證據。 |
| OpenAI Realtime、Ringg | `REFERENCE_ONLY` | 外部比較對象；目前 repo 沒有因本文件而自動切換 provider。 |

## 重要防錯

- 「同樣功能」不等於「同一份程式碼」。
- 「設計文件已寫」不等於「程式已接好」。
- 「從別的專案參考」不等於「會跟著上游同步」。
- 要把任何來源改成 `ADAPTED` 或 `EXTRACTED`，先留下檔案、commit 或抽取範圍證據。
