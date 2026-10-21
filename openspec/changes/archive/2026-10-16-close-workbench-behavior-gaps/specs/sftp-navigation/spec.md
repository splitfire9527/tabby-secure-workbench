# Spec Delta

## Purpose

为当前 SSH 会话提供唯一的双栏 SFTP 浏览界面，并按照用户配置恢复路径、应用成对目录、使用书签和只读预览。

## ADDED Requirements

### Requirement: One SFTP browser
从终端标签页打开文件传输时，系统 MUST 只呈现一个包含本地列表和远程列表的 SFTP 界面。系统 MUST NOT 再呈现仅含占位说明、且刷新或粘贴没有效果的第二套界面。

#### Scenario: Opening SFTP shows real listings
- **WHEN** 用户在已连接的 SSH 标签页打开 SFTP
- **THEN** 界面同时列出本地目录和远程目录的条目，而不是只显示准备就绪之类的占位文字

### Requirement: Path memory follows the selected mode
路径模式为记忆时，同一 Profile 下次打开 SFTP MUST 从该 Profile 上次浏览的本地路径和远程路径开始。模式为关闭时 MUST 从配置的默认路径开始。模式为与终端工作目录同步且会话能提供工作目录时，起始路径 MUST 使用该目录；否则 MUST 回退到上次记忆的路径。

#### Scenario: Remembered paths reopen
- **WHEN** 路径模式为记忆，用户把该 Profile 的远程目录浏览到某个路径后关闭 SFTP，再次打开
- **THEN** 远程列表从该路径开始

#### Scenario: Off mode uses defaults
- **WHEN** 路径模式为关闭，用户再次打开同一 Profile 的 SFTP
- **THEN** 本地和远程列表从配置的默认路径开始，而不是上次浏览路径

### Requirement: Directory pairs reject an empty pair
保存成对目录时，本地路径和远程路径 MUST NOT 同时为空。激活成对目录时，系统 MUST 只跳转已填写的一端，未填写的一端保持不动。

#### Scenario: Both paths empty cannot be saved
- **WHEN** 用户保存一个标题非空、但本地路径和远程路径都为空的成对目录
- **THEN** 保存被拒绝，已有成对目录列表不变

#### Scenario: Partial pair moves one side
- **WHEN** 用户激活一个只填写了远程路径的成对目录
- **THEN** 远程列表跳到该路径，本地列表仍停在激活前的路径

### Requirement: Bookmarks navigate one side
用户 MUST 能把当前本地路径或当前远程路径保存为该书签所属 Profile 的书签。选择书签时 MUST 只跳转该书签记录的那一端。

#### Scenario: Remote bookmark reopens
- **WHEN** 用户把当前远程路径存为书签，离开该目录后再选择该书签
- **THEN** 远程列表回到该书签路径，本地列表不变

### Requirement: Double-click follows the configured action
双击动作为查看时，系统 MUST 对大小上限以内的文本文件显示只读预览，且 MUST NOT 同时开始传输。双击动作为传输时，系统 MUST 开始传输，且 MUST NOT 打开预览。超过上限或非文本文件在查看动作下 MUST 告知用户不能预览。

#### Scenario: View action previews text
- **WHEN** 双击动作为查看，用户双击一个上限以内的远程文本文件
- **THEN** 界面显示该文件的只读内容，传输队列不新增任务

#### Scenario: Transfer action does not preview
- **WHEN** 双击动作为传输，用户双击一个远程普通文件
- **THEN** 下载任务开始，界面不打开只读预览
