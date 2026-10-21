# Design

## Context

见 `proposal.md` 的 Why。当前主路径是 `WorkbenchTerminalDecorator` 把 `WorkbenchSftpPaneComponent` 注入每个终端标签页。`TransferStore` 用 `providedIn: 'root'` 做成全局单例，装饰器的 `detach()` 不调用 `destroy()`。普通上传用 `sftp.open(dst, 2 | 8 | 16)` 直接截断目标。`OverwriteUploader` 只被跨连接中继调用，而粘贴又把目标 SFTP 同时当作源和目标。`WorkbenchShellComponent` 里还有一套刷新和粘贴为空的占位双栏。

`tabby-terminal` 1.0.163 的公开类型里，会话入口是 `BaseSession.emitOutput` / `write`，输出是 `output$` 与 `binaryOutput$`。没有 `session.middleware`，也没有 `RenderTextEvent`。现有 `CodecMiddleware` 被放进一个宿主不会调用的数组；只有数组不存在时才挂钩 `emitOutput`。日志订阅 `textDecoded$` 后再做一次性 ANSI 正则。

`ProfilesService` 没有单独的保存方法。可持久化的 Profile 编辑入口是 `getConfigProxyForProfile()`，再调用 `ConfigService.save()`。热键默认值要由 `ConfigProvider.defaults.hotkeys` 提供，而不是只在 `HotkeyProvider` 里写名称。

## Goals / Non-Goals

**Goals:**

- 让提案中的五条行为在装饰器注入的那条主路径上发生。
- 测试直接覆盖这些行为，而不是只覆盖未被调用的类。
- 外壳样式不再改写终端背景，也不再全局隐藏无关按钮。

**Non-Goals:**

- 不把 `src/sftp-plus/` 替换成上游 Tabby-SFTP-Plus 的整份源码。
- 不实现完整文件编辑器、跨连接目录同步或 owner/group/ACL 保留。
- 不重写 SSH 传输层、vault 或 Tabby 内置 SFTP 面板。

## Decisions

1. **每个标签页一个队列实例。** 去掉 `TransferStore` 的 `providedIn: 'root'`。`WorkbenchTerminalDecorator.attach` 为该标签页 `new TransferStore()`，交给 SFTP 面板和底栏。`detach` 调用 `destroy()`，从而取消排队和进行中的任务并执行 `cleanupHandler`。全局底栏在活动标签页变化时改绑该实例，不再订阅一个应用级单例。`WorkbenchShellComponent` 里的占位双栏和它自己的 `new TransferStore()` 删除。

2. **普通上传走已有的原子覆盖器。** 面板把当前 SFTP 会话适配成 `RemoteSftpClient`，文件上传调用 `uploadWithAtomicOverwrite`。写入前读取 `secureWorkbench.fileTransfer.conflictAction`：`skip` 直接把任务标为跳过且不调用覆盖器；`prompt` 用现有对话框等待选择；`overwrite` 才进入覆盖器。目录递归里任一文件抛错即把目录任务标为失败并带上路径，禁止在 `catch` 后仍标成功。

3. **审计与转录分开。** 传输生命周期调用 `createSftpAuditEvent`，追加到该标签页的审计 JSONL（沿用 `AuditWriter` 的目录和 `0o600` 权限）。文本转录的写入路径不接收这些事件。日志未开启时仍写审计文件，因为它不是终端转录。

4. **跨连接保存源客户端。** `copy()` 写入 `sourceClientRef` 和 `sourceSessionId`。粘贴只从该项读取；源客户端缺失、已关闭，或与目标是同一读取端时失败。临时文件仍放在系统临时目录，权限 `0o600`，在成功、失败、取消和 `cleanupHandler` 中删除。目录按树下载到临时目录再上传，任务归目标标签页。源会话 `closed$` 时清空剪贴板里的客户端引用。

5. **路径、成对目录、书签和预览放在现有面板。** 按 Profile id 把上次路径和书签存在 `secureWorkbench` 配置中，不存秘密。`pathMode: sync` 时优先调用会话已有的 `getWorkingDirectory()`，没有则用记忆路径。保存成对目录时拒绝两端皆空；`navigateTo` 只修改传入的一端。双击动作读取已有的 `doubleClickAction`。查看动作对 256KB 以内、且内容可按 UTF-8 解码的文件打开只读层；超出或不像文本时只提示，不传输。

6. **编码挂钩公开的会话入口。** 每个会话只包装一次 `emitOutput`：先解码，再把 UTF-8 字节交给原始方法。输入包装 `session.write`。不再把自造的 `SessionMiddleware` `unshift` 到宿主不读取的数组，避免“数组存在但无人调用，于是跳过挂钩”。重连时先卸下旧包装再装新的。控制字节不按地区编码改写：解码器只处理文本字节，已有的控制序列解析留在终端。

7. **转录使用同一解码流上的有状态过滤器。** 公开 API 没有 `RenderTextEvent`。日志不再对每个片段做一次性正则。解码后的块同时送给终端和一只有状态的 CSI/OSC 过滤器；过滤器保留未完成的转义序列，只把已完成的可见文本交给 `SessionLogger`。跨块半行仍由现有行缓冲处理。已打开日志文件的追加/覆盖标志在打开时固定。

8. **外壳样式退回配置。** 删除 `workbench-theme.scss` 里无条件隐藏 SFTP、文件夹图标、加号和齿轮的规则，以及装饰器里对终端宿主的 `#000000` 背景赋值。`hideNativeSFTPButton` 默认为 false。仅当它为 true 时，由 `NativeSftpHideService` 在运行时给确认过的原生 SFTP 按钮加上插件自己的 data 属性，再用这一条属性隐藏。不使用 `title` 或 `.fa-folder-open` 作为永久全局规则。每个被装饰标签页内部的重复 `terminal-toolbar` 仍可在该宿主内隐藏，因为它被工作台标题栏替代；这不扩大到整个窗口的标签栏按钮。

9. **热键和端口转发走 Tabby 的配置入口。** `WorkbenchConfigProvider.defaults.hotkeys['workbench-focus-search']` 设为 `['Alt-C']`。监听 `HotkeysService.hotkey$` 的代码放在始终构造的 `WorkbenchHostShellService`，而不是只放在占位 Shell 里。启动时若解析后的配置里已有别的热键占用 `Alt-C`，本热键默认保持空数组，并给出一次可见说明，不另写全局 `keydown` 监听去抢键。端口转发通过 `getConfigProxyForProfile()` 修改后 `config.save()`。界面继续说明下次重连生效。

10. **文案走现有词典。** 本次改动的 SFTP、传输、成对目录、编码切换和设置标签调用 `I18nService.t()`。语言流变化时刷新这些组件。词典缺条目时回退 zh-CN。不为历史界面做一次无关的全文替换。

## Risks / Trade-offs

- [包装 `emitOutput` 与会话自身的缓冲重复解码] → 每个会话只包装一次，包装函数带标记；单测用假会话断言只解码一轮。
- [SFTP 客户端引用被关闭的标签页持有] → 源会话关闭时清除引用；粘贴时再检查客户端是否仍可读写。
- [目录失败后已写入的部分文件留在目标] → 任务标失败并指出路径。本次不承诺目录级回滚。
- [原生 SFTP 按钮在不同 Tabby 版本上的 DOM 不同] → 找不到可确认的按钮时不隐藏任何东西，并在设置旁说明当前宿主未识别到该按钮。
- [热键冲突检测只能看到已合并的配置] → 检测到占用就留空，不覆盖别人的绑定。

## Migration Plan

已有配置继续读取。两端都空的成对目录保留在配置里，但不能再被保存；用户下次编辑时会被拒绝。不迁移传输队列，重启后队列为空是规格要求。回滚时恢复全局队列和旧上传路径会重新引入数据损坏，因此回滚应以版本回退整个插件为准，而不是只关掉其中一个开关。

## Open Questions

无。预览上限 256KB、审计在日志关闭时仍然落盘，都已在上面定下，不改变规格的可观察结果。
