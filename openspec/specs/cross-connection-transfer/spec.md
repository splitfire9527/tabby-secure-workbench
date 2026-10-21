# cross-connection-transfer Specification

## Purpose

允许用户把一个 SSH 会话中的远程文件或目录复制到另一个 SSH 会话的远程目录，并在任一端断开时停止传输、删除本地临时文件。

## Requirements

### Requirement: Copy remembers the source session
用户在源会话的 SFTP 界面复制远程文件或目录时，系统 MUST 记录源会话身份，并在粘贴时从该源会话读取。系统 MUST NOT 把目标会话当作读取来源。

#### Scenario: Paste reads from the session that was copied
- **WHEN** 用户在会话 A 复制远程文件，再在会话 B 的另一个目录粘贴
- **THEN** 文件内容来自会话 A 上的源路径，并写入会话 B 的目标目录

#### Scenario: Target session is not used as the source
- **WHEN** 会话 B 上不存在与源路径相同的文件，用户仍执行跨连接粘贴
- **THEN** 传输不会因为会话 B 读不到该路径而从 B 读取，而是使用会话 A 的内容或明确失败

### Requirement: Paste belongs to the destination tab
跨连接粘贴产生的任务 MUST 归入执行粘贴的标签页队列。数据 MUST 先落到本地临时文件或临时目录，再写入目标。传输结束、失败或取消后，临时文件 MUST 被删除。

#### Scenario: Temporary file is removed after success
- **WHEN** 跨连接粘贴成功完成
- **THEN** 目标路径存在所复制的内容，本地临时文件已被删除，任务出现在目标标签页的队列中

### Requirement: Disconnect fails the paste
源会话或目标会话在粘贴过程中断开时，任务 MUST 记为失败。系统 MUST NOT 自动重连任一端。已经创建的临时文件 MUST 被删除。

#### Scenario: Source disconnect fails the task
- **WHEN** 粘贴已经开始，源会话随后断开
- **THEN** 任务状态为失败，临时文件被删除，系统不自动重新连接源会话

### Requirement: Directories can be copied without sync
用户 MUST 能够跨连接复制目录树。系统 MUST NOT 提供或执行跨连接目录同步、增量比对。

#### Scenario: Directory tree is pasted
- **WHEN** 用户复制源会话中的一个目录，并在目标会话粘贴
- **THEN** 目标目录下出现对应的目录树和文件

#### Scenario: No sync command is offered
- **WHEN** 用户打开任一 SFTP 界面的操作菜单
- **THEN** 不存在跨连接同步或增量比对操作

### Requirement: Missing source is an error
剪贴板为空，或源会话已经无法读取时，粘贴 MUST 失败并告知用户。系统 MUST NOT 在目标侧创建空的结果文件来表示成功。

#### Scenario: Empty clipboard refuses paste
- **WHEN** 剪贴板没有远程复制项，用户触发跨连接粘贴
- **THEN** 用户看到失败说明，目标目录不新增文件
