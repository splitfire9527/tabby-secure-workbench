# Proposal

## Why

插件已经对外声明了 SFTP 传输、跨连接复制、终端转录和工作台外观，但这些能力停在独立类、设置项或占位界面上，用户走的主路径并没有执行它们。现在需要把这些已声明的行为接到真实会话上，否则设置和测试都会把未发生的行为报成已完成。

## What Changes

- 每个终端 Tab 使用自己的传输队列。关闭 Tab 时取消该 Tab 未完成的任务并清理临时文件。队列不跨 Tab 共享，也不写入磁盘。
- 普通文件上传走原子覆盖：先写同目录临时文件，保留已有普通文件的 POSIX 权限位，再改名替换。符号链接拒绝覆盖。失败时原目标保持不变。
- 文件冲突策略（询问、覆盖、跳过）和路径记忆模式在打开 SFTP 与开始传输时生效。目录传输中任一文件失败时，任务不得记为成功。
- 传输的开始、冲突决策、完成、失败、取消写入结构化审计事件，且不把路径或内容写入终端转录。
- 跨连接粘贴从源会话的 SFTP 读取，经本地临时文件写到目标会话。源或目标断开时任务失败并清理临时文件。目录可以复制，但不做跨连接同步或增量比对。
- 全应用只保留一个 SFTP 界面。删除只显示占位文案、刷新和粘贴为空操作的那一套。成对目录两端不能同时为空，激活时只跳转已填写的一端。提供会话内书签，以及小文本文件的只读预览。
- 编码层挂到 Tabby 会话实际送往终端的字节入口和用户输入出口。日志记录与终端可见文本一致；跨缓冲的控制序列不进入文本转录。
- 原生 SFTP 按钮默认可见，仅在用户打开隐藏开关后隐藏，且不再用全局选择器关掉无关的文件夹、加号或齿轮按钮。工作台外壳不得改写终端背景色。
- `Alt+C` 注册为聚焦会话搜索的默认热键，冲突时沿用 Tabby 热键系统的拒绝结果。端口转发规则写入可持久化的 Profile 并保存。本次改动涉及的界面文案通过现有 i18n 字典显示。
- 本次不把界面替换成上游 Tabby-SFTP-Plus 的整份源码。现有自写面板继续作为 SFTP 界面，缺的是行为而不是另一套皮肤。完整文件编辑器、跨连接目录同步、owner/group/ACL 保留，仍不在范围内。

## Capabilities

### New Capabilities

- `sftp-transfer`: 每个 Tab 的传输队列、原子覆盖上传、冲突策略、目录失败语义和传输审计。
- `cross-connection-transfer`: 从源会话读取、在目标会话写入的跨连接复制，以及断开和临时文件清理。
- `sftp-navigation`: 单一 SFTP 界面、路径记忆、成对目录、书签和只读预览。
- `terminal-transcript`: 会话字节的实际转码，以及与终端可见文本一致的转录。
- `workbench-chrome`: 外壳与终端主题分离、可配置的原生 SFTP 入口、默认热键、端口转发持久化和界面文案语言。

### Modified Capabilities

无。`openspec list --specs` 显示仓库里还没有已归档的 spec。

## Impact

- `src/shell/workbench-sftp-pane.component.ts`、`workbench-terminal-decorator.ts`、`workbench-shell.component.ts`、`workbench-toolbar.component.ts`、`workbench-bottom-dock.component.ts`
- `src/transfer-store/`、`src/sftp-plus/overwrite-uploader.ts`、`src/sftp-plus/sftp-audit-events.ts`
- `src/cross-transfer/`、`src/terminal-codec/`、`src/session-logging/`
- `src/themes/workbench-theme.scss`、`src/index.ts` 中的原生 SFTP 隐藏样式
- `src/config/`、`src/i18n/`、`src/shell/workbench-hotkey.provider.ts`
- 对应的 Jest 测试。不新增运行时依赖。仍只使用 `tabby-core` 与 `tabby-terminal` 的公开 API。
