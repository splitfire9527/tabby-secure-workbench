# Spec Delta

## Purpose

使真实终端会话的屏幕可见文本与文本转录一致，并让用户选择的编码同时作用于远程输出和键盘输入。

## ADDED Requirements

### Requirement: Encoding applies on the live session
在真实的 SSH 或本地终端会话中，远程字节 MUST 按当前会话编码解码后再显示。用户输入 MUST 按同一编码编码后再送入会话。仅在脱离会话的对象上转码 MUST NOT 被视为已满足本要求。

#### Scenario: Remote GBK text is readable
- **WHEN** 会话编码为 GBK，远程分多段发送一个跨缓冲边界的 GBK 汉字
- **THEN** 终端显示该汉字，而不是拆开的字节或替换符

#### Scenario: Typed text is encoded
- **WHEN** 会话编码为 GBK，用户输入一个中文字符
- **THEN** 会话收到的字节是该字符的 GBK 编码

### Requirement: Encoding switch is explicit
切换编码前，系统 MUST 展示旧编码、新编码、切换时刻，以及未完成多字节序列将写成 U+FFFD 的说明，并等待用户确认。确认后，后续字节 MUST 使用新编码。控制序列 MUST 继续按 ASCII 控制语义处理，不得按地区编码改写。

#### Scenario: Confirmed switch changes later bytes
- **WHEN** 用户确认从 UTF-8 切换到 GBK
- **THEN** 界面出现旧编码、新编码、时刻和 U+FFFD 说明，此后到达的 GBK 文本按 GBK 显示

#### Scenario: Cancel keeps the old encoding
- **WHEN** 用户打开切换提示后取消
- **THEN** 会话编码保持不变，后续字节仍按原编码解释

### Requirement: Transcript matches visible text
文本转录 MUST 包含终端已经显示的可见字符，且不得包含未显示的控制序列。被拆到两个缓冲区块中的 ANSI 或 OSC 序列 MUST NOT 把原始转义文本写入转录，也 MUST NOT 使转录与终端可见文本不一致。

#### Scenario: Split control sequence stays out of the transcript
- **WHEN** 一个 CSI 颜色序列被拆成两段到达，中间夹着可见文字，且日志正在录制
- **THEN** 转录包含该可见文字，不包含转义序列的任一片段

### Requirement: Raw bytes are a separate diagnostic
原始字节诊断默认 MUST 关闭。关闭时，未解码字节 MUST NOT 写入文本转录。打开时，未解码字节 MUST 写入单独的诊断文件，而不是混入文本转录。

#### Scenario: Raw mode is off by default
- **WHEN** 用户按默认设置连接并产生终端输出
- **THEN** 文本转录只含可见文本，旁边不生成原始字节诊断文件

### Requirement: Open log mode cannot change
日志文件已经打开后，用户 MUST NOT 把该文件从追加切换为覆盖，或从覆盖切换为追加。新的选择只 MUST 作用于下一次新建的日志文件。

#### Scenario: Running log keeps its mode
- **WHEN** 一次会话日志已以追加方式打开，用户把策略改为覆盖
- **THEN** 当前文件继续追加，覆盖只在下一次新建日志文件时生效
