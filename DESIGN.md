# Tabby Secure Workbench 最终设计

## 1. 定位与交付边界

`tabby-secure-workbench` 是一个 **纯 Tabby 插件** 的专业 SSH 工作台：为
运维、嵌入式和后端开发人员提供统一工作台外壳、会话与命令管理、基于
SFTP+ 的双栏传输（含跨连接文件复制），以及与终端显示一致的会话记录。

用户只安装插件即可使用全部能力。插件仅依赖 `tabby-core` 和 `tabby-terminal`
的公开 API，不需要宿主补丁、fork 或任何对 Tabby 核心代码的修改。

## 2. 技术基线

### 2.1 Tabby-SFTP-Plus

SFTP 功能以 [10D24D/Tabby-SFTP-Plus](https://github.com/10D24D/Tabby-SFTP-Plus)
为实现基线，而非新建平行 SFTP 引擎。该项目采用 MIT 许可，提供双栏本地/远程
文件管理、拖拽、书签、路径记忆、传输记录、冲突处理与权限编辑，并复用 Tabby
活动 SSH Session。

本项目将其源码作为受版本控制的派生模块纳入，保留其版权、LICENSE 与 NOTICE；
不以运行时依赖方式叠装两个会竞争 UI/快捷键的插件。派生模块名称固定为
`sftp-plus`，对用户仍显示为 “SFTP+”。

### 2.2 Tabby 扩展策略

插件仅使用 Tabby 的公开导出 API，不依赖内部实现：

| 能力 | Tabby API |
| --- | --- |
| Workbench Tab（自定义全屏工作台） | `BaseTabComponent` + `ProfileProvider` + `TabRecoveryProvider` |
| 终端生命周期钩子 | `TerminalDecorator.attach() / detach()` |
| 字节流拦截（编码层） | `SessionMiddleware` + `SessionMiddlewareStack`（通过 `BaseSession.middleware` 注入） |
| 工具栏按钮 | `ToolbarButtonProvider`（全局）+ `TerminalDecorator` DOM 注入（per-tab） |
| 配置持久化 | `ConfigProvider` |
| 快捷键注册 | `HotkeyProvider` |
| 设置页 | `SettingsTabProvider` |

Tabby-SFTP-Plus 已充分验证此扩展模式：通过 `TerminalDecorator` 注入工具栏按钮、
创建浮动面板、订阅 SSH 会话事件。本项目沿用同一模式并扩展。

## 3. 外壳与交互

### 3.1 Workbench Shell

Workbench 以自定义 Tab（`BaseTabComponent` 子类）实现，Tab 内部采用以下布局，
外壳和终端主题严格分离：

```text
Session Header / Unified Toolbar
├─ Activity Bar: 会话、命令、设置、关于
├─ Drawer: 搜索与对应树/命令库
└─ Workspace
   ├─ 活动 PTY 终端 或 SFTP+ 覆盖视图
   ├─ 可升起的 Transfer Bottom Dock
   └─ Status: Ready | 传输中/完成计数
```

外壳使用中性工程灰与 1px 边框；终端始终使用 Tabby 配色方案。插件注册
`SecureCRT Classic` 终端色板，但不强制用户选用它。

Header 标题为：

```text
{Session Name} - {user}@{host}:{port} ({Connected|Disconnected|Connecting})
```

Activity Bar 仅切换 Workbench 自身的 Drawer 内容，不改写 Tabby 的 Profile 数据。
全局搜索聚焦快捷键默认为 `Alt+C`，与用户自定义快捷键冲突时由 Tabby 热键系统
提示并拒绝注册。

### 3.2 统一 Toolbar

| 操作 | 行为 |
| --- | --- |
| 重新连接 | 仅在活动页是可重连 SSH Tab 时显示；调用其公开重连能力。 |
| 端口转发 | 打开当前 SSH Profile 的端口转发编辑入口；保存后明确提示"下次重连生效"，除非宿主接口确认支持热更新。 |
| 快速连接 | 创建内存临时 Profile；认证秘密只交给 Tabby vault/agent，不写入 Workbench 配置。 |
| SFTP+ / PTY | 在活动终端与派生 SFTP+ 覆盖视图间切换；不调用或改写内置 SFTP 面板。 |
| 终端编码 | 修改当前会话的字节编解码器，显示生效状态和切换时间。 |
| 日志录制 | 开始/停止终端转录，显示红点与当前文件位置。 |

Tabby 原生 SFTP 入口是否隐藏由用户配置项控制（默认不隐藏）；隐藏方式参照
Tabby-SFTP-Plus 的 `hideNativeSFTPButton` CSS 注入模式，不使用脆弱的 DOM 选择器。

## 4. SFTP+ 派生模块

### 4.1 保留与新增能力

保留 SFTP+ 的双栏、拖拽、书签、路径记忆、文件冲突处理、权限编辑、预览/编辑、
多语言和传输历史。新增下列能力：

1. **成对目录**：`DirectoryPair { id, title, localPath?, remotePath? }`；两端不能
   同时为空。激活时仅跳转已配置的一端。
2. **Tab 内传输队列**：每个 SFTP+ 视图拥有独立的 `TransferStore` 实例，跟随 Tab
   生命周期。关闭 Tab 时自动取消所有 `running | queued` 任务并清理。任务状态为
   `queued | running | succeeded | failed | cancelled`。不跨 Tab 共享，不持久化到磁盘。
3. **覆盖保留权限**：仅针对已存在的普通远程文件，保留 POSIX permission bits。
4. **传输审计事件**：开始、冲突决策、完成、失败、取消均生成结构化事件；不把路径或
   内容自动写入终端转录。
5. **跨连接文件复制**：支持在连接 A 的 SFTP 视图中复制文件，在连接 B 的 SFTP 视图
   中粘贴，实现跨主机文件传输。

   交互方式采用剪贴板语义：

   - 在源连接的 SFTP 面板中选中文件/目录，右键菜单选择 **"远程复制"**
   - 切换到目标连接的 SFTP 面板，导航到目标目录，右键菜单选择 **"远程粘贴"**
   - **"远程粘贴"** 与已有的本地粘贴是不同的菜单项，不会混淆

   实现约束：

   - 数据流向：`SFTP read(源) → 本地临时文件 → SFTP write(目标)`，允许临时落盘
     以支持大文件和传输中断恢复
   - 临时文件存放于平台临时目录，传输完成或取消后清理
   - 传输任务归属于**执行粘贴操作的 Tab** 的 TransferStore
   - 源连接或目标连接断开时任务标记 `failed`，不自动重连对端
   - 不支持跨连接的目录同步或增量比对（非目标）

### 4.2 覆盖上传算法

```text
1. lstat(target)，拒绝覆盖符号链接；目标不存在则不保存 mode。
2. 在 target 同目录创建随机临时文件（0600）。
3. 上传至临时文件，校验完成状态与可选大小校验。
4. 若目标原本存在，chmod(temporary, savedMode)。
5. 原子 rename(temporary, target)。
6. 任一步失败：保留原 target，尝试删除临时文件，任务标记 failed。
```

该规则不承诺保留 owner、group、ACL、xattr 或 SELinux context；这些属性不属于
标准 SFTP 权限恢复范围。目录传输使用临时目录，完整成功后再发布。远端不支持原子
rename 时，界面必须在执行前提示风险并要求确认。

### 4.3 Bottom Dock

初始隐藏；当前 Tab 的任一任务进入 `running` 时自动展开为 140px。任务结束后保持
展开，直到用户主动收起。切回 PTY 时，状态栏显示当前 Tab 关联的传输摘要：

```text
⚡ 传输中: {running} | 完成: {succeeded} | 失败: {failed}
```

点击该组件恢复 Dock；不会抢走终端焦点。各 Tab 的 Dock 状态互相独立。

## 5. 编码层：终端与日志的单一事实源

### 5.1 管线

`StatefulCodec` 实现为 `SessionMiddleware` 子类，在 `TerminalDecorator.attach()` 时
通过 `session.middleware.push()` 注入到字节流管线中：

```text
remote bytes ──→ SessionMiddlewareStack ──→ xterm.js Terminal.write()
                 └─ StatefulCodec                └──→ Session Logger
                    (feedFromSession: decode)
                    (feedFromTerminal: encode)
```

默认 `UTF-8`，可选 `GBK`、`GB2312`、`GB18030`、`BIG5`。每个 SSH/Serial 会话拥有独立
`StatefulCodec`，其职责是处理跨 Buffer 的多字节残留、输入编码与切换边界。

### 5.2 动态切换规范

切换必须由用户显式确认，并显示：旧编码、新编码、切换时刻和“未完成的多字节序列
将以 U+FFFD 写入”的提示。切换流程：

```text
暂停接受新 chunk → flush 当前 decoder → 记录 EncodingChanged 事件
→ 创建新 decoder/encoder → 恢复数据流
```

控制序列永远按 ASCII 解析，不经地区编码转码。编码切换只影响文本字节解释，不改变
SSH transport、端口转发或 SFTP 文件字节内容。

## 6. 会话日志与终端打印一致性

日志记录订阅 `RenderTextEvent`，不是原始 `session.output$`，也不是一次性 ANSI 正则
清洗的结果。因此相同的已解码文本、行分割和控制序列语义会同时交给 xterm 与 logger。

日志模式：

| 模式 | 内容 |
| --- | --- |
| 文本转录（默认） | 与终端打印一致的可见文本；可选逐行时间戳。 |
| 原始字节诊断（默认关闭） | 未解码 bytes；仅用于故障定位，需单独启用。 |
| 活动审计 | 连接、断连、编码变更、日志开关、命令库注入、SFTP+ 操作等 JSONL 事件。 |

日志文件名模板支持 `%H`、`%S`、`%Y`、`%M`、`%D`、`%h`、`%m`、`%s`。变量值经文件名
净化，禁止目录穿越；日志根目录由平台路径服务解析，不能直接依赖 `~`。Append/Overwrite
只能在新建会话记录时选择，运行中的文件不可切换。

逐行时间戳由 renderer/logger 共用的行缓冲器产生：跨 chunk 的半行不提前写出，关闭
日志或会话结束时 flush。日志目录权限默认仅限当前用户，并支持大小/日期轮转与保留期。

## 7. 数据、秘密与安全

Workbench 配置只保存命令、目录对、面板状态、非敏感偏好和日志策略。密码、私钥、
agent 句柄、vault 解锁状态不得复制到插件配置、传输日志或审计事件。

`SavedCommand` 保持以下语义：

```ts
interface SavedCommand {
  id: string
  category: string
  name: string
  snippet: string
  autoExecute: boolean
}
```

`autoExecute: false` 只填入编辑行，`true` 才追加终端 Enter。对粘贴含换行、控制字符或
危险命令不做“安全判断”替代用户决策，但始终显示可见预览和目标会话名称。

## 8. 工程结构

```text
tabby-secure-workbench/
├── package.json
├── webpack.config.js
├── LICENSES/Tabby-SFTP-Plus-MIT.txt
├── NOTICE
├── src/
│   ├── index.ts
│   ├── shell/                     # Header, Activity Bar, Drawer, Dock
│   ├── command-library/
│   ├── terminal-codec/            # StatefulCodec (SessionMiddleware subclass)
│   ├── session-logging/           # Terminal write interceptor and audit writer
│   ├── transfer-store/            # Per-tab TransferStore
│   ├── cross-transfer/            # Cross-connection clipboard and relay
│   ├── sftp-plus/                 # MIT-derived Tabby-SFTP-Plus module
│   ├── config/                    # schema, migration, persistence
│   └── themes/
└── tests/
```

所有模块仅依赖 `tabby-core` 和 `tabby-terminal` 的公开导出 API。

## 9. 验收标准

1. 安装插件后，SSH PTY、SFTP+、命令库、编码、日志和传输队列均可工作；原生 Tabby
   UI 不被破坏。
2. UTF-8、GBK、GB18030、BIG5 的分块输入测试中，终端可见文本与文本转录逐字符一致。
3. ANSI/OSC 控制序列跨 Buffer 时，不出现在文本转录中，也不导致 xterm 与日志分歧。
4. 对已有可执行文件的覆盖上传，成功后 permission bits 保持不变；中途失败时原目标
   内容和权限不变。
5. 关闭含进行中传输任务的 Tab 时，所有任务被取消，临时文件被清理。
6. 在连接 A 的 SFTP 面板中"远程复制"文件后，在连接 B 的 SFTP 面板中"远程粘贴"
   能成功传输文件；源或目标断开时任务标记 failed 且临时文件被清理。
7. Windows、macOS、Linux 的路径、日志权限、快捷键冲突、浅色/深色主题和无 SFTP 服务端
   场景均有自动化或人工验收记录。

## 10. 非目标

- 不重写 SSH transport、认证 vault、Tabby Profile 存储或 Tabby 内置 SFTP 面板。
- 不承诺保留远端 owner/group/ACL/xattr/安全上下文。
- 不将终端转录宣称为不可抵赖审计；需要该等级时应接入集中式堡垒机/审计系统。
- 不实现跨连接的目录同步或增量比对。
- 不需要宿主补丁、fork 或对 Tabby 核心代码的任何修改。
