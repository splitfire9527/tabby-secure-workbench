# Spec Delta

## Purpose

管理单个终端标签页内的文件传输：队列随标签页结束，覆盖上传在完成前保留原文件，冲突策略和失败结果对用户可见并可审计。

## ADDED Requirements

### Requirement: Per-tab transfer queue
每个终端标签页 MUST 拥有独立的传输队列。一个标签页中的任务 MUST NOT 出现在另一个标签页的队列中。队列 MUST NOT 在应用重启后恢复。

#### Scenario: Tasks stay on the tab that started them
- **WHEN** 用户在标签页 A 开始一次传输，并在标签页 B 开始另一次传输
- **THEN** A 的队列只包含 A 的任务，B 的队列只包含 B 的任务

#### Scenario: Restart does not restore tasks
- **WHEN** 应用在存在未完成或已完成任务时退出并再次启动
- **THEN** 这些任务不再出现在任何队列中

### Requirement: Closing a tab cancels its active transfers
关闭标签页时，该标签页中状态为排队或进行中的任务 MUST 变为已取消，其临时文件 MUST 被删除。其他标签页的任务 MUST 保持不变。

#### Scenario: Active tasks are cancelled on close
- **WHEN** 标签页 A 有排队或进行中的任务，用户关闭 A
- **THEN** 这些任务变为已取消，对应临时文件被删除，标签页 B 的任务继续按其原状态存在

### Requirement: Atomic overwrite preserves the original file
覆盖已存在的普通远程文件时，系统 MUST 先把内容写入同目录临时文件，成功后再替换目标。替换完成前，原文件的内容和 POSIX 权限位 MUST 保持不变。目标是符号链接或目录时，系统 MUST 拒绝覆盖且不得改变该目标。

#### Scenario: Failure leaves the original file intact
- **WHEN** 用户覆盖一个已存在的普通远程文件，且在替换完成前传输失败
- **THEN** 原文件的内容和权限位与传输开始前一致，临时文件被删除

#### Scenario: Successful overwrite keeps permission bits
- **WHEN** 用户成功覆盖一个已存在的普通远程文件
- **THEN** 目标内容等于上传内容，其 POSIX 权限位与覆盖前一致

#### Scenario: Symlink target is refused
- **WHEN** 用户上传的目标路径是符号链接
- **THEN** 传输失败，该符号链接及其指向的内容不变

### Requirement: Conflict policy controls existing targets
开始写入已存在的目标前，系统 MUST 执行当前冲突策略。跳过时不得改写目标。覆盖时 MUST 使用原子覆盖。询问时 MUST 在用户明确选择前不得写入。

#### Scenario: Skip leaves the target unchanged
- **WHEN** 冲突策略为跳过，且远程目标已存在
- **THEN** 目标内容不变，该任务不记为覆盖成功

#### Scenario: Prompt waits for a choice
- **WHEN** 冲突策略为询问，且远程目标已存在
- **THEN** 传输暂停并请求用户选择，在选择之前目标内容不变

### Requirement: Directory transfer failure is visible
目录传输中任一文件失败时，整个目录任务 MUST 记为失败，并指出失败路径。系统 MUST NOT 在仍有文件失败时把该任务记为成功。

#### Scenario: One failed file fails the directory task
- **WHEN** 用户上传或下载一个目录，其中某个文件写入失败
- **THEN** 目录任务状态为失败，错误信息包含该文件路径，任务状态不是成功

### Requirement: Transfer actions emit audit events
传输开始、冲突决策、完成、失败和取消 MUST 各产生一条结构化审计事件。这些事件 MUST NOT 把文件路径或文件内容写入终端文本转录。

#### Scenario: Failure is audited outside the transcript
- **WHEN** 一次传输失败
- **THEN** 审计记录包含该失败事件，正在录制的终端文本转录不新增该文件的路径或内容
