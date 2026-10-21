# Spec Delta

## Purpose

保持工作台外壳的工程灰界面，同时不改写终端配色，并让原生 SFTP 入口、搜索热键、端口转发和界面语言按照用户配置工作。

## ADDED Requirements

### Requirement: Terminal colors stay on the terminal theme
工作台装饰终端标签页时 MUST NOT 改写终端区域的背景色。终端可见颜色 MUST 继续使用当前启用的 Tabby 配色方案，包括用户选用的 SecureCRT Classic。

#### Scenario: Decoration does not paint the terminal black
- **WHEN** 用户使用非黑色的终端配色方案，并打开一个由工作台装饰的终端标签页
- **THEN** 终端背景仍是该配色方案的背景色

### Requirement: Native SFTP button follows its setting
`hideNativeSFTPButton` 为关闭时，Tabby 原生 SFTP 按钮 MUST 保持可用。该开关打开时，系统 MUST 只隐藏这个 SFTP 按钮。新建标签、设置和其他与 SFTP 无关的按钮 MUST 保持可用。默认值 MUST 为不隐藏。

#### Scenario: Default leaves the native button visible
- **WHEN** 用户安装插件且没有打开隐藏原生 SFTP 按钮
- **THEN** 原生 SFTP 按钮仍然可见并可触发

#### Scenario: Hiding does not remove unrelated buttons
- **WHEN** 用户打开隐藏原生 SFTP 按钮
- **THEN** 原生 SFTP 按钮不可见，新建标签和设置按钮仍然可见

### Requirement: Session search has a default hotkey
插件安装后，在用户没有自行改键时，Alt+C MUST 聚焦会话搜索。该键与已有热键冲突时，系统 MUST 沿用 Tabby 热键系统的拒绝结果，不得静默覆盖对方的热键。

#### Scenario: Default key focuses search
- **WHEN** 用户没有改过该热键，在工作台中按下 Alt+C
- **THEN** 会话搜索输入框获得焦点

#### Scenario: Conflict does not steal another command
- **WHEN** Alt+C 已被另一条热键占用
- **THEN** 原热键继续生效，工作台搜索热键处于未绑定或被拒绝的状态，并能为用户所见

### Requirement: Port forwards persist on the profile
用户保存端口转发规则时，系统 MUST 把规则写入当前 SSH Profile 的持久配置。重启应用后规则 MUST 仍在。界面 MUST 说明规则在下次重连后生效。

#### Scenario: Saved forward survives restart
- **WHEN** 用户为当前 SSH Profile 保存一条端口转发并重启应用
- **THEN** 该 Profile 的配置中仍包含这条规则

### Requirement: Changed chrome text follows the UI language
用户把界面语言设为 zh-CN 或 en-US 时，本次行为所涉及的 SFTP 操作、传输状态、成对目录、编码切换和已有字典中的设置标签 MUST 显示对应语言。缺少译文时 MUST 回退到 zh-CN 词典中的同一条目。

#### Scenario: English setting changes covered labels
- **WHEN** 用户把界面语言设为 en-US 并打开 SFTP 与设置中的文件传输部分
- **THEN** 这些已覆盖的标签显示英文，而不是硬编码的中文
