# memory-lancedb-pro（管理工具）使用筆記

此工作區已安裝並啟用 `memory-lancedb-pro`，並且已開啟管理工具：

- Plugin id：`memory-lancedb-pro`
- OpenClaw memory slot：`plugins.slots.memory = "memory-lancedb-pro"`
- 管理工具：`plugins.entries.memory-lancedb-pro.config.enableManagementTools = true`

## 你能用的能力

### A) Agent tools（在對話/工作流中）
- `memory_store`
- `memory_recall`
- `memory_list`
- `memory_stats`
- `memory_update`
- `memory_forget`

### B) CLI（在 Gateway 主機 shell 上）
插件註冊的 CLI command：`memory-pro`

> 具體子命令以 `memory-pro --help` 為準（不同版本可能略有差異）。

常見用途（概念）：
- list：列出記憶條目
- stats：統計
- export/import：匯出/匯入
- reembed：重算 embeddings
- migrate：從內建 memory-lancedb 遷移

## 常用檢查

- 確認 plugin 載入：
  - `openclaw plugins list`
  - `openclaw plugins info memory-lancedb-pro`

- 確認 memory slot：
  - `openclaw config get plugins.slots.memory`

## 注意事項

- 資料庫（LanceDB）通常不建議直接進 Git；建議用 export/import 管理。
- 如果你用 HTTP + 區網開 Control UI（非 HTTPS），屬於安全性降級，token 請妥善保管。
