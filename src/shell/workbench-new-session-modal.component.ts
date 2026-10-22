import { Component, OnInit, OnDestroy, HostListener, Optional, ChangeDetectorRef } from '@angular/core'
import { ConfigService, NotificationsService, ProfilesService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { WorkbenchDialogService } from './workbench-dialog.service'
import { WorkbenchSessionConfigService } from '../config/workbench-session-config.service'

export type SessionTemplateType = 'ssh' | 'telnet' | 'serial' | 'raw'

@Component({
  selector: 'workbench-new-session-modal',
  template: `
    <div
      *ngIf="isOpen"
      class="workbench-modal-backdrop"
      (click)="cancel()"
    >
      <div class="workbench-modal-dialog new-session-dialog shadow-lg" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="modal-header d-flex align-items-center justify-content-between px-3 py-2">
          <div class="d-flex align-items-center gap-2">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="text-primary">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span class="modal-title font-weight-bold text-dark" style="font-size: 13px;">
              {{ isEditing ? '编辑会话配置' : '新建会话配置' }}
            </span>
          </div>
          <button class="btn-close-modal" (click)="cancel()">&times;</button>
        </div>

        <!-- Split Body: Left (Templates + Duplicate) / Right (Common + Dynamic Params) -->
        <div class="modal-body-split">
          <!-- Left: Templates & Duplicate Selection (200px) -->
          <div class="template-sidebar">
            <div class="template-section-header">协议类型模板</div>
            <div class="template-list">
              <div
                class="template-item"
                [class.active]="selectedTemplate === 'ssh'"
                (click)="selectTemplate('ssh')"
              >
                <span class="template-icon">🔒</span>
                <span class="template-name font-weight-bold">SSH 连接</span>
              </div>
              <div
                class="template-item"
                [class.active]="selectedTemplate === 'telnet'"
                (click)="selectTemplate('telnet')"
              >
                <span class="template-icon">🌐</span>
                <span class="template-name font-weight-bold">Telnet 会话</span>
              </div>
              <div
                class="template-item"
                [class.active]="selectedTemplate === 'serial'"
                (click)="selectTemplate('serial')"
              >
                <span class="template-icon">🔌</span>
                <span class="template-name font-weight-bold">串口连接</span>
              </div>
              <div
                class="template-item"
                [class.active]="selectedTemplate === 'raw'"
                (click)="selectTemplate('raw')"
              >
                <span class="template-icon">⚡</span>
                <span class="template-name font-weight-bold">原始套接字</span>
              </div>
            </div>

            <!-- Duplicate an existing profile -->
            <div class="template-section-header mt-3">复制已有会话配置</div>
            <div class="existing-profile-list scrollable">
              <div
                *ngFor="let p of existingProfiles"
                class="existing-profile-item text-truncate"
                (click)="duplicateFromProfile(p)"
                [title]="'基于 ' + p.name + ' 创建副本'"
              >
                <span class="badge-proto-xs mr-1 font-mono">{{ (p.type || 'SSH').toUpperCase() }}</span>
                <span class="text-truncate">{{ p.name || p.options?.host }}</span>
              </div>
              <div *ngIf="existingProfiles.length === 0" class="text-muted small p-2">
                暂无可复制的配置
              </div>
            </div>
          </div>

          <!-- Right: Parameters Form -->
          <div class="parameters-main-panel">
            <div class="parameters-grid">
              <!-- Left Column: Common Profile Properties -->
              <div class="common-properties-col p-3 border-right">
                <div class="panel-section-title mb-2">基础会话属性</div>

                <div class="form-group mb-2">
                  <label class="small font-weight-bold text-dark mb-1">会话名称 *</label>
                  <input
                    type="text"
                    class="form-control form-control-sm"
                    [(ngModel)]="formData.name"
                    placeholder="例如: 生产服务器 01"
                  />
                </div>

                <div class="form-group mb-2">
                  <label class="small font-weight-bold text-dark mb-1">所属分组</label>
                  <input
                    type="text"
                    class="form-control form-control-sm"
                    [(ngModel)]="formData.group"
                    placeholder="例如: 核心网段 / 生产数据库"
                  />
                </div>

                <div class="row mb-2">
                  <div class="col-6">
                    <label class="small font-weight-bold text-dark mb-1">图标</label>
                    <select class="form-control form-control-sm" [(ngModel)]="formData.icon">
                      <option value="terminal">终端</option>
                      <option value="server">服务器</option>
                      <option value="desktop">工作站</option>
                      <option value="database">数据库</option>
                      <option value="globe">网络</option>
                      <option value="cube">容器</option>
                    </select>
                  </div>
                  <div class="col-6">
                    <label class="small font-weight-bold text-dark mb-1">标识颜色</label>
                    <select class="form-control form-control-sm" [(ngModel)]="formData.color">
                      <option value="#333333">默认灰阶</option>
                      <option value="#1e70bf">经典蓝</option>
                      <option value="#27ae60">运行绿</option>
                      <option value="#d6334a">关键红</option>
                      <option value="#d97706">告警橙</option>
                      <option value="#8b5cf6">专用紫</option>
                    </select>
                  </div>
                </div>

                <!-- Checkbox Controls -->
                <div class="form-group mb-2 mt-3">
                  <div class="custom-control custom-checkbox mb-2">
                    <input
                      type="checkbox"
                      class="custom-control-input"
                      id="nsDisableDynamicTitle"
                      [(ngModel)]="formData.disableDynamicTitle"
                    />
                    <label class="custom-control-label small text-dark" for="nsDisableDynamicTitle">
                      禁用动态标签页标题
                    </label>
                  </div>

                  <div class="custom-control custom-checkbox mb-2">
                    <input
                      type="checkbox"
                      class="custom-control-input"
                      id="nsClearOnConnect"
                      [(ngModel)]="formData.clearOnConnect"
                    />
                    <label class="custom-control-label small text-dark" for="nsClearOnConnect">
                      连接后清空终端屏幕
                    </label>
                  </div>
                </div>

                <div class="form-group mb-2">
                  <label class="small font-weight-bold text-dark mb-1">会话断开后</label>
                  <select class="form-control form-control-sm" [(ngModel)]="formData.behaviorOnSessionEnd">
                    <option value="keep">保持标签页打开</option>
                    <option value="close">自动关闭标签页</option>
                    <option value="restart">提示重启会话</option>
                  </select>
                </div>
              </div>

              <!-- Right Column: Dynamic Protocol Parameters & Tabs -->
              <div class="protocol-parameters-col p-3">
                <!-- Comprehensive 5 Tabs -->
                <div class="proto-tabs d-flex align-items-center gap-1 mb-3 border-bottom pb-1">
                  <button
                    class="btn-proto-tab"
                    [class.active]="activeTab === 'general'"
                    (click)="activeTab = 'general'"
                  >
                    协议连接
                  </button>
                  <button
                    class="btn-proto-tab"
                    [class.active]="activeTab === 'input'"
                    (click)="activeTab = 'input'"
                  >
                    终端仿真
                  </button>
                  <button
                    class="btn-proto-tab"
                    [class.active]="activeTab === 'log'"
                    (click)="activeTab = 'log'"
                  >
                    会话日志
                  </button>
                  <button
                    class="btn-proto-tab"
                    [class.active]="activeTab === 'sftp'"
                    (click)="activeTab = 'sftp'"
                  >
                    文件传输 (SFTP)
                  </button>
                  <button
                    class="btn-proto-tab"
                    [class.active]="activeTab === 'scripts'"
                    (click)="activeTab = 'scripts'"
                  >
                    登录脚本
                  </button>
                </div>

                <!-- Tab 1: 协议连接 (General) -->
                <div *ngIf="activeTab === 'general'">
                  <!-- 1. SSH Template Parameters -->
                  <div *ngIf="selectedTemplate === 'ssh'">
                    <div class="row mb-2">
                      <div class="col-8">
                        <label class="small font-weight-bold text-dark mb-1">主机地址 (Host / IP) *</label>
                        <input
                          type="text"
                          class="form-control form-control-sm font-mono"
                          [(ngModel)]="formData.ssh.host"
                          placeholder="192.168.1.100"
                        />
                      </div>
                      <div class="col-4">
                        <label class="small font-weight-bold text-dark mb-1">端口 (Port)</label>
                        <input
                          type="number"
                          class="form-control form-control-sm font-mono"
                          [(ngModel)]="formData.ssh.port"
                          placeholder="22"
                        />
                      </div>
                    </div>

                    <div class="row mb-2">
                      <div class="col-6">
                        <label class="small font-weight-bold text-dark mb-1">用户名</label>
                        <input
                          type="text"
                          class="form-control form-control-sm font-mono"
                          [(ngModel)]="formData.ssh.user"
                          placeholder="root"
                        />
                      </div>
                      <div class="col-6">
                        <label class="small font-weight-bold text-dark mb-1">认证方式</label>
                        <select class="form-control form-control-sm" [(ngModel)]="formData.ssh.authMethod">
                          <option value="password">密码认证</option>
                          <option value="key">私钥认证</option>
                          <option value="agent">SSH Agent</option>
                        </select>
                      </div>
                    </div>

                    <div class="form-group mb-2" *ngIf="formData.ssh.authMethod === 'password'">
                      <label class="small font-weight-bold text-dark mb-1">密码 (留空则在连接时提示)</label>
                      <input
                        type="password"
                        class="form-control form-control-sm font-mono"
                        [(ngModel)]="formData.ssh.password"
                        placeholder="••••••••"
                      />
                    </div>

                    <div class="form-group mb-2" *ngIf="formData.ssh.authMethod === 'key'">
                      <label class="small font-weight-bold text-dark mb-1">私钥文件路径</label>
                      <input
                        type="text"
                        class="form-control form-control-sm font-mono"
                        [(ngModel)]="formData.ssh.privateKey"
                        placeholder="~/.ssh/id_rsa"
                      />
                    </div>

                    <div class="form-group mb-2 mt-3">
                      <div class="custom-control custom-checkbox mb-1">
                        <input
                          type="checkbox"
                          class="custom-control-input"
                          id="nsSshX11"
                          [(ngModel)]="formData.ssh.x11"
                        />
                        <label class="custom-control-label small text-dark" for="nsSshX11">
                          启用 X11 转发
                        </label>
                      </div>
                      <div class="custom-control custom-checkbox">
                        <input
                          type="checkbox"
                          class="custom-control-input"
                          id="nsSshAgent"
                          [(ngModel)]="formData.ssh.agentForward"
                        />
                        <label class="custom-control-label small text-dark" for="nsSshAgent">
                          启用 SSH Agent 转发
                        </label>
                      </div>
                    </div>
                  </div>

                  <!-- 2. Telnet Template Parameters -->
                  <div *ngIf="selectedTemplate === 'telnet'">
                    <div class="row mb-2">
                      <div class="col-8">
                        <label class="small font-weight-bold text-dark mb-1">主机地址 (Host / IP) *</label>
                        <input
                          type="text"
                          class="form-control form-control-sm font-mono"
                          [(ngModel)]="formData.telnet.host"
                          placeholder="192.168.1.1"
                        />
                      </div>
                      <div class="col-4">
                        <label class="small font-weight-bold text-dark mb-1">端口</label>
                        <input
                          type="number"
                          class="form-control form-control-sm font-mono"
                          [(ngModel)]="formData.telnet.port"
                          placeholder="23"
                        />
                      </div>
                    </div>

                    <div class="row mb-2">
                      <div class="col-6">
                        <label class="small font-weight-bold text-dark mb-1">输入模式</label>
                        <select class="form-control form-control-sm" [(ngModel)]="formData.telnet.inputMode">
                          <option value="character">字符模式</option>
                          <option value="line">逐行模式</option>
                        </select>
                      </div>
                      <div class="col-6">
                        <label class="small font-weight-bold text-dark mb-1">输入换行符</label>
                        <select class="form-control form-control-sm" [(ngModel)]="formData.telnet.inputNewlines">
                          <option value="CR">CR</option>
                          <option value="LF">LF</option>
                          <option value="CRLF">CRLF</option>
                        </select>
                      </div>
                    </div>

                    <div class="row mb-2">
                      <div class="col-6">
                        <label class="small font-weight-bold text-dark mb-1">输出模式</label>
                        <select class="form-control form-control-sm" [(ngModel)]="formData.telnet.outputMode">
                          <option value="canonical">规范模式</option>
                          <option value="raw">原始模式</option>
                        </select>
                      </div>
                      <div class="col-6">
                        <label class="small font-weight-bold text-dark mb-1">输出换行符</label>
                        <select class="form-control form-control-sm" [(ngModel)]="formData.telnet.outputNewlines">
                          <option value="CRLF">CRLF</option>
                          <option value="LF">LF</option>
                          <option value="CR">CR</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <!-- 3. Serial Template Parameters -->
                  <div *ngIf="selectedTemplate === 'serial'">
                    <div class="row mb-2">
                      <div class="col-7">
                        <label class="small font-weight-bold text-dark mb-1">设备 / 串口路径 *</label>
                        <input
                          type="text"
                          class="form-control form-control-sm font-mono"
                          [(ngModel)]="formData.serial.port"
                          placeholder="/dev/ttyUSB0 或 COM1"
                        />
                      </div>
                      <div class="col-5">
                        <label class="small font-weight-bold text-dark mb-1">波特率</label>
                        <select class="form-control form-control-sm font-mono" [(ngModel)]="formData.serial.baudRate">
                          <option [value]="115200">115200</option>
                          <option [value]="57600">57600</option>
                          <option [value]="38400">38400</option>
                          <option [value]="19200">19200</option>
                          <option [value]="9600">9600</option>
                        </select>
                      </div>
                    </div>

                    <div class="row mb-2">
                      <div class="col-4">
                        <label class="small font-weight-bold text-dark mb-1">数据位</label>
                        <select class="form-control form-control-sm font-mono" [(ngModel)]="formData.serial.dataBits">
                          <option [value]="8">8</option>
                          <option [value]="7">7</option>
                          <option [value]="6">6</option>
                          <option [value]="5">5</option>
                        </select>
                      </div>
                      <div class="col-4">
                        <label class="small font-weight-bold text-dark mb-1">停止位</label>
                        <select class="form-control form-control-sm font-mono" [(ngModel)]="formData.serial.stopBits">
                          <option [value]="1">1</option>
                          <option [value]="2">2</option>
                        </select>
                      </div>
                      <div class="col-4">
                        <label class="small font-weight-bold text-dark mb-1">校验位</label>
                        <select class="form-control form-control-sm" [(ngModel)]="formData.serial.parity">
                          <option value="none">无校验</option>
                          <option value="even">偶校验</option>
                          <option value="odd">奇校验</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <!-- 4. Raw Socket Template Parameters -->
                  <div *ngIf="selectedTemplate === 'raw'">
                    <div class="row mb-2">
                      <div class="col-8">
                        <label class="small font-weight-bold text-dark mb-1">目标主机 (Host / IP) *</label>
                        <input
                          type="text"
                          class="form-control form-control-sm font-mono"
                          [(ngModel)]="formData.raw.host"
                          placeholder="192.168.1.50"
                        />
                      </div>
                      <div class="col-4">
                        <label class="small font-weight-bold text-dark mb-1">端口 *</label>
                        <input
                          type="number"
                          class="form-control form-control-sm font-mono"
                          [(ngModel)]="formData.raw.port"
                          placeholder="8080"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Tab 2: 终端仿真 (Input / Terminal) -->
                <div *ngIf="activeTab === 'input'">
                  <div class="form-group mb-3">
                    <label class="small font-weight-bold text-dark mb-1">终端字符编码</label>
                    <select class="form-control form-control-sm" [(ngModel)]="formData.encoding">
                      <option value="inherit">继承默认会话编码 ({{ inheritedEncoding }})</option>
                      <option value="UTF-8">UTF-8 (通用国际标准)</option>
                      <option value="GBK">GBK (简体中文老旧主机常用)</option>
                      <option value="GB2312">GB2312</option>
                      <option value="GB18030">GB18030</option>
                      <option value="BIG5">BIG5 (繁体中文)</option>
                    </select>
                  </div>

                  <div class="form-group mb-3">
                    <label class="small font-weight-bold text-dark mb-1">终端仿真类型</label>
                    <select class="form-control form-control-sm font-mono" [(ngModel)]="formData.terminalType">
                      <option value="xterm-256color">xterm-256color (推荐)</option>
                      <option value="xterm">xterm</option>
                      <option value="vt100">vt100</option>
                      <option value="vt102">vt102</option>
                      <option value="vt220">vt220</option>
                      <option value="ansi">ansi</option>
                      <option value="linux">linux</option>
                      <option value="rxvt">rxvt</option>
                    </select>
                  </div>
                </div>

                <!-- Tab 3: 会话日志 (Session Logging - SecureCRT 1:1) -->
                <div *ngIf="activeTab === 'log'">
                  <div class="custom-control custom-checkbox mb-3">
                    <input
                      type="checkbox"
                      class="custom-control-input"
                      id="nsEnableLogging"
                      [(ngModel)]="formData.logging.startLogUponConnect"
                    />
                    <label class="custom-control-label small font-weight-bold text-dark" for="nsEnableLogging">
                      连接成功后自动启动会话日志记录
                    </label>
                  </div>

                  <div class="form-group mb-2">
                    <label class="small font-weight-bold text-dark mb-1">日志文件命名模板</label>
                    <input
                      type="text"
                      class="form-control form-control-sm font-mono"
                      [(ngModel)]="formData.logging.logFileName"
                      placeholder="%H_%S_%Y%M%D_%h%m%s.log"
                    />
                    <small class="text-muted d-block mt-1" style="font-size: 11px;">
                      宏变量: <code>%H</code>(主机), <code>%S</code>(会话名), <code>%Y%M%D</code>(年月日), <code>%h%m%s</code>(时分秒)
                    </small>
                  </div>

                  <div class="form-group mb-2">
                    <label class="small font-weight-bold text-dark mb-1">若日志文件已存在</label>
                    <select class="form-control form-control-sm" [(ngModel)]="formData.logging.appendMode">
                      <option value="append">追加到文件末尾 (Append)</option>
                      <option value="overwrite">覆盖现有文件 (Overwrite)</option>
                    </select>
                  </div>

                  <div class="form-group mb-2">
                    <div class="custom-control custom-checkbox mb-1">
                      <input
                        type="checkbox"
                        class="custom-control-input"
                        id="nsStartMidnight"
                        [(ngModel)]="formData.logging.startNewLogAtMidnight"
                      />
                      <label class="custom-control-label small text-dark" for="nsStartMidnight">
                        在午夜零点自动创建并切换到新日志文件
                      </label>
                    </div>

                    <div class="custom-control custom-checkbox mb-1">
                      <input
                        type="checkbox"
                        class="custom-control-input"
                        id="nsTimestampLine"
                        [(ngModel)]="formData.logging.timestampEachLine"
                      />
                      <label class="custom-control-label small text-dark" for="nsTimestampLine">
                        在记录的每行前追加时间戳 [HH:mm:ss]
                      </label>
                    </div>

                    <div class="custom-control custom-checkbox mb-2">
                      <input
                        type="checkbox"
                        class="custom-control-input"
                        id="nsRawLog"
                        [(ngModel)]="formData.logging.rawLog"
                      />
                      <label class="custom-control-label small text-dark" for="nsRawLog">
                        记录原始终端字节 (包含 ANSI/VT 控制转义字符)
                      </label>
                    </div>
                  </div>

                  <div class="row mb-2">
                    <div class="col-6">
                      <label class="small font-weight-bold text-dark mb-1">连接时写入标记</label>
                      <input
                        type="text"
                        class="form-control form-control-sm"
                        [(ngModel)]="formData.logging.customConnectMsg"
                        placeholder="e.g. === Connected at %Y-%M-%D %h:%m:%s ==="
                      />
                    </div>
                    <div class="col-6">
                      <label class="small font-weight-bold text-dark mb-1">断开时写入标记</label>
                      <input
                        type="text"
                        class="form-control form-control-sm"
                        [(ngModel)]="formData.logging.customDisconnectMsg"
                        placeholder="e.g. === Disconnected ==="
                      />
                    </div>
                  </div>
                </div>

                <!-- Tab 4: 文件传输 (SFTP & Paths) -->
                <div *ngIf="activeTab === 'sftp'">
                  <div class="custom-control custom-checkbox mb-3">
                    <input
                      type="checkbox"
                      class="custom-control-input"
                      id="nsAutoOpenSftp"
                      [(ngModel)]="formData.sftp.autoOpenSFTP"
                    />
                    <label class="custom-control-label small font-weight-bold text-dark" for="nsAutoOpenSftp">
                      会话建立后自动打开文件传输 (SFTP) 页面
                    </label>
                  </div>

                  <div class="form-group mb-2">
                    <label class="small font-weight-bold text-dark mb-1">默认远程初始路径</label>
                    <input
                      type="text"
                      class="form-control form-control-sm font-mono"
                      [(ngModel)]="formData.sftp.initialRemotePath"
                      placeholder="e.g. /data/logs 或 /home/user"
                    />
                  </div>

                  <div class="form-group mb-2">
                    <label class="small font-weight-bold text-dark mb-1">默认本地初始路径</label>
                    <input
                      type="text"
                      class="form-control form-control-sm font-mono"
                      [(ngModel)]="formData.sftp.initialLocalPath"
                      placeholder="e.g. ~/Downloads 或 /workspace"
                    />
                  </div>

                  <div class="custom-control custom-checkbox mt-3">
                    <input
                      type="checkbox"
                      class="custom-control-input"
                      id="nsSyncNav"
                      [(ngModel)]="formData.sftp.syncNavigation"
                    />
                    <label class="custom-control-label small text-dark" for="nsSyncNav">
                      同步目录浏览 (切换同名目录时保持双端同步)
                    </label>
                  </div>
                </div>

                <!-- Tab 5: 登录脚本 (Login Scripts) -->
                <div *ngIf="activeTab === 'scripts'">
                  <div class="form-group mb-3">
                    <label class="small font-weight-bold text-dark mb-1">登录后自动执行命令</label>
                    <textarea
                      class="form-control form-control-sm font-mono"
                      rows="6"
                      [(ngModel)]="formData.loginScripts"
                      placeholder="e.g. uname -a&#10;export LANG=zh_CN.UTF-8"
                    ></textarea>
                    <small class="text-muted d-block mt-1" style="font-size: 11px;">
                      会话建立成功后依次自动发送至终端，每行一条命令。
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer d-flex justify-content-end gap-2 px-3 py-2">
          <button
            class="btn btn-sm btn-secondary-custom"
            (click)="cancel()"
          >
            取消
          </button>
          <button
            class="btn btn-sm btn-outline-primary font-weight-bold"
            (click)="saveAndConnect()"
            [disabled]="!isFormValid()"
          >
            保存并连接
          </button>
          <button
            class="btn btn-sm btn-primary font-weight-bold px-3"
            (click)="save()"
            [disabled]="!isFormValid()"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .workbench-modal-backdrop {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(0, 0, 0, 0.45) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 55000 !important;
        user-select: none !important;
      }
      .workbench-modal-dialog {
        background: #ffffff;
        border: 1px solid #d0d4dc;
        border-radius: 6px;
        color: #222222;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .new-session-dialog {
        width: 860px;
        max-width: 96vw;
        height: 580px;
        max-height: 92vh;
      }
      .modal-header {
        background: #f0f2f5;
        border-bottom: 1px solid #d0d4dc;
        height: 38px;
        flex-shrink: 0;
      }
      .btn-close-modal {
        background: transparent;
        border: none;
        color: #666666;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        padding: 0 4px;
      }
      .btn-close-modal:hover {
        color: #000000;
      }
      .modal-footer {
        background: #f8f9fa;
        border-top: 1px solid #d0d4dc;
        height: 44px;
        flex-shrink: 0;
      }
      .modal-body-split {
        display: flex;
        flex: 1 1 auto;
        height: calc(100% - 82px);
        overflow: hidden;
      }

      /* Left Template Sidebar */
      .template-sidebar {
        width: 210px;
        min-width: 210px;
        max-width: 210px;
        background: #f0f2f5;
        border-right: 1px solid #d0d4dc;
        display: flex;
        flex-direction: column;
        padding: 10px 0;
        overflow-y: auto;
        flex-shrink: 0;
      }
      .template-section-header {
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 700;
        color: #64748b;
        letter-spacing: 0.3px;
        text-transform: uppercase;
      }
      .template-item {
        padding: 8px 14px;
        font-size: 12px;
        color: #334155;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        border-left: 3px solid transparent;
        transition: all 0.12s ease;
      }
      .template-item:hover {
        background: #e4e7eb;
        color: #0f172a;
      }
      .template-item.active {
        background: rgba(30, 112, 191, 0.12);
        color: #1e70bf;
        border-left-color: #1e70bf;
      }
      .existing-profile-list {
        padding: 4px 6px;
        max-height: 180px;
        overflow-y: auto;
      }
      .existing-profile-item {
        padding: 5px 8px;
        font-size: 11px;
        color: #334155;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
      }
      .existing-profile-item:hover {
        background: #e2e8f0;
        color: #0f172a;
      }
      .badge-proto-xs {
        font-size: 9px;
        padding: 1px 4px;
        border-radius: 3px;
        background: #e2e8f0;
        color: #475569;
        font-weight: 700;
      }

      /* Right Parameters Main Panel */
      .parameters-main-panel {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .parameters-grid {
        display: grid;
        grid-template-columns: 280px 1fr;
        height: 100%;
        overflow-y: auto;
      }
      .common-properties-col {
        background: #fafbfc;
        border-color: #e2e8f0 !important;
        overflow-y: auto;
      }
      .protocol-parameters-col {
        background: #ffffff;
        overflow-y: auto;
      }
      .panel-section-title {
        font-size: 12px;
        font-weight: 700;
        color: #334155;
      }

      /* Proto Tabs */
      .btn-proto-tab {
        background: transparent;
        border: none;
        padding: 4px 12px;
        font-size: 12px;
        font-weight: 500;
        color: #64748b;
        border-radius: 4px;
        cursor: pointer;
      }
      .btn-proto-tab:hover {
        color: #0f172a;
        background: #f1f5f9;
      }
      .btn-proto-tab.active {
        color: #1e70bf;
        font-weight: 700;
        background: #eff6ff;
      }

      .btn-secondary-custom {
        background: #ffffff !important;
        border: 1px solid #d0d4dc !important;
        color: #334155 !important;
        font-weight: 500;
      }
      .btn-secondary-custom:hover {
        background: #f1f5f9 !important;
      }

      .form-control,
      input.form-control,
      select.form-control,
      textarea.form-control,
      input[type="text"],
      input[type="password"],
      input[type="number"],
      select {
        background: #ffffff !important;
        color: #1e293b !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 4px;
        font-size: 12px;
        box-shadow: none !important;

        &:focus {
          border-color: #1e70bf !important;
          box-shadow: 0 0 0 2px rgba(30, 112, 191, 0.18) !important;
          background: #ffffff !important;
          color: #0f172a !important;
        }

        &::placeholder {
          color: #94a3b8 !important;
        }

        option {
          background: #ffffff !important;
          color: #1e293b !important;
        }
      }

      .form-label,
      label {
        font-size: 11px;
        font-weight: 600;
        color: #475569 !important;
        margin-bottom: 3px;
      }

      .custom-control-label {
        font-size: 12px;
        color: #334155 !important;
      }
    `,
  ],
})
export class WorkbenchNewSessionModalComponent implements OnInit, OnDestroy {
  isOpen = false
  isEditing = false
  editingProfileId: string | null = null

  selectedTemplate: SessionTemplateType = 'ssh'
  activeTab: 'general' | 'scripts' | 'input' | 'log' | 'sftp' = 'general'
  existingProfiles: any[] = []

  formData: any = {
    name: '',
    group: '',
    icon: 'terminal',
    color: '#333333',
    disableDynamicTitle: false,
    clearOnConnect: false,
    behaviorOnSessionEnd: 'keep',
    loginScripts: '',
    encoding: 'inherit',
    terminalType: 'xterm-256color',
    ssh: {
      host: '',
      port: 22,
      user: 'root',
      authMethod: 'password',
      password: '',
      privateKey: '',
      x11: false,
      agentForward: false,
    },
    telnet: {
      host: '',
      port: 23,
      inputMode: 'character',
      inputNewlines: 'CR',
      outputMode: 'canonical',
      outputNewlines: 'CRLF',
    },
    serial: {
      port: '/dev/ttyUSB0',
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
    },
    raw: {
      host: '',
      port: 8080,
    },
    logging: {
      startLogUponConnect: false,
      logFileName: '%H_%S_%Y%M%D_%h%m%s.log',
      appendMode: 'append',
      startNewLogAtMidnight: false,
      timestampEachLine: false,
      rawLog: false,
      customConnectMsg: '',
      customDisconnectMsg: '',
    },
    sftp: {
      autoOpenSFTP: false,
      initialRemotePath: '',
      initialLocalPath: '',
      syncNavigation: false,
    },
  }

  private subs: Subscription[] = []

  constructor(
    public dialogService: WorkbenchDialogService,
    private config: ConfigService,
    private cdr: ChangeDetectorRef,
    @Optional() private profilesService?: ProfilesService,
    @Optional() private sessionConfigService?: WorkbenchSessionConfigService,
    @Optional() private notifications?: NotificationsService
  ) {}

  ngOnInit(): void {
    this.loadExistingProfiles()

    this.subs.push(
      this.dialogService.newSessionProfile$.subscribe((p) => {
        if (p !== null) {
          this.openWithProfile(p)
        } else {
          this.isOpen = false
        }
      })
    )
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe())
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) {
      this.cancel()
    }
  }

  loadExistingProfiles(): void {
    if (this.profilesService) {
      this.profilesService.getProfiles().then((p) => {
        this.existingProfiles = (p || []).filter((item: any) => item.type !== 'workbench' && !item.isBuiltin)
      })
    } else {
      this.existingProfiles = ((this.config.store?.profiles || []) as any[]).filter(
        (item: any) => item.type !== 'workbench' && !item.isBuiltin
      )
    }
  }

  selectTemplate(type: SessionTemplateType): void {
    this.selectedTemplate = type
    if (!this.formData.name || this.formData.name.startsWith('新建')) {
      switch (type) {
        case 'ssh':
          this.formData.name = '新建 SSH 会话'
          break
        case 'telnet':
          this.formData.name = '新建 Telnet 会话'
          break
        case 'serial':
          this.formData.name = '新建串口会话'
          break
        case 'raw':
          this.formData.name = '新建原始套接字'
          break
      }
    }
  }

  duplicateFromProfile(p: any): void {
    if (!p) return
    const type = (p.type || 'ssh').toLowerCase()
    if (type.includes('serial')) this.selectedTemplate = 'serial'
    else if (type.includes('telnet')) this.selectedTemplate = 'telnet'
    else if (type.includes('raw')) this.selectedTemplate = 'raw'
    else this.selectedTemplate = 'ssh'

    this.formData.name = `${p.name || '会话'} (副本)`
    this.formData.group = p.group || ''
    this.formData.icon = p.icon || 'terminal'
    this.formData.color = p.color || '#333333'

    if (p.options) {
      if (this.selectedTemplate === 'ssh') {
        this.formData.ssh.host = p.options.host || ''
        this.formData.ssh.port = p.options.port || 22
        this.formData.ssh.user = p.options.user || 'root'
      } else if (this.selectedTemplate === 'telnet') {
        this.formData.telnet.host = p.options.host || ''
        this.formData.telnet.port = p.options.port || 23
      } else if (this.selectedTemplate === 'serial') {
        this.formData.serial.port = p.options.port || p.options.device || '/dev/ttyUSB0'
        this.formData.serial.baudRate = p.options.baudRate || 115200
      }
    }

    this.notifications?.info(`已从「${p.name}」载入参数模板。`)
  }

  openWithProfile(p: any): void {
    this.loadExistingProfiles()
    this.isOpen = true
    this.activeTab = 'general'

    if (p && p.id) {
      this.isEditing = true
      this.editingProfileId = p.id
      this.formData.name = p.name || ''
      this.formData.group = p.group || ''
      this.formData.icon = p.icon || 'terminal'
      this.formData.color = p.color || '#333333'
      this.formData.disableDynamicTitle = p.disableDynamicTitle ?? false
      this.formData.clearOnConnect = p.clearOnConnect ?? false

      const wbConfig = this.sessionConfigService ? this.sessionConfigService.getSessionConfig(p) : (p.options?.secureWorkbench || {})
      this.formData.encoding = p.options?.secureWorkbench?.encoding || wbConfig.encoding || 'inherit'
      this.formData.terminalType = p.options?.secureWorkbench?.terminalType || wbConfig.terminalType || 'xterm-256color'
      this.formData.logging = {
        startLogUponConnect: !!(wbConfig.logging?.startLogUponConnect),
        logFileName: wbConfig.logging?.logFileName || '%H_%S_%Y%M%D_%h%m%s.log',
        appendMode: wbConfig.logging?.appendMode || 'append',
        startNewLogAtMidnight: !!(wbConfig.logging?.startNewLogAtMidnight),
        timestampEachLine: !!(wbConfig.logging?.timestampEachLine),
        rawLog: wbConfig.logging?.mode === 'raw' || !!(wbConfig.logging?.rawLog),
        customConnectMsg: wbConfig.logging?.customConnectMsg || '',
        customDisconnectMsg: wbConfig.logging?.customDisconnectMsg || '',
      }
      this.formData.sftp = {
        autoOpenSFTP: !!(wbConfig.sftp?.autoOpenSFTP),
        initialRemotePath: wbConfig.sftp?.initialRemotePath || '',
        initialLocalPath: wbConfig.sftp?.initialLocalPath || '',
        syncNavigation: !!(wbConfig.sftp?.syncNavigation),
      }

      const type = (p.type || 'ssh').toLowerCase()
      if (type.includes('serial')) {
        this.selectedTemplate = 'serial'
        this.formData.serial.port = p.options?.port || p.options?.device || '/dev/ttyUSB0'
        this.formData.serial.baudRate = p.options?.baudRate || 115200
      } else if (type.includes('telnet')) {
        this.selectedTemplate = 'telnet'
        this.formData.telnet.host = p.options?.host || ''
        this.formData.telnet.port = p.options?.port || 23
      } else if (type.includes('raw')) {
        this.selectedTemplate = 'raw'
        this.formData.raw.host = p.options?.host || ''
        this.formData.raw.port = p.options?.port || 8080
      } else {
        this.selectedTemplate = 'ssh'
        this.formData.ssh.host = p.options?.host || ''
        this.formData.ssh.port = p.options?.port || 22
        this.formData.ssh.user = p.options?.user || 'root'
      }
    } else {
      this.isEditing = false
      this.editingProfileId = null
      this.selectTemplate('ssh')
      this.formData.name = '新建 SSH 会话'
      this.formData.group = (p && p.group) ? p.group : ''
      this.formData.ssh.host = ''
      this.formData.ssh.port = 22
      this.formData.ssh.user = 'root'
      this.formData.encoding = 'inherit'
      this.formData.terminalType = 'xterm-256color'
      this.formData.logging = {
        startLogUponConnect: false,
        logFileName: '%H_%S_%Y%M%D_%h%m%s.log',
        appendMode: 'append',
        startNewLogAtMidnight: false,
        timestampEachLine: false,
        rawLog: false,
        customConnectMsg: '',
        customDisconnectMsg: '',
      }
      this.formData.sftp = {
        autoOpenSFTP: false,
        initialRemotePath: '',
        initialLocalPath: '',
        syncNavigation: false,
      }
    }

    this.cdr.detectChanges()
  }

  get inheritedEncoding(): string {
    if (this.sessionConfigService) {
      return this.sessionConfigService.getSessionConfig(null).encoding || 'UTF-8'
    }
    return this.config.store?.secureWorkbench?.defaultSession?.encoding
      || this.config.store?.secureWorkbench?.defaultEncoding
      || 'UTF-8'
  }

  isFormValid(): boolean {
    if (!this.formData.name?.trim()) return false
    if (this.selectedTemplate === 'ssh' && !this.formData.ssh.host?.trim()) return false
    if (this.selectedTemplate === 'telnet' && !this.formData.telnet.host?.trim()) return false
    if (this.selectedTemplate === 'serial' && !this.formData.serial.port?.trim()) return false
    if (this.selectedTemplate === 'raw' && !this.formData.raw.host?.trim()) return false
    return true
  }

  buildProfileObject(): any {
    const id = this.isEditing && this.editingProfileId ? this.editingProfileId : `workbench:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const base: any = {
      id,
      name: this.formData.name.trim(),
      group: this.formData.group.trim() || undefined,
      icon: this.formData.icon,
      color: this.formData.color,
      disableDynamicTitle: this.formData.disableDynamicTitle,
      clearOnConnect: this.formData.clearOnConnect,
      options: {},
    }

    if (this.selectedTemplate === 'ssh') {
      base.type = 'ssh'
      base.options = {
        host: this.formData.ssh.host.trim(),
        port: this.formData.ssh.port || 22,
        user: this.formData.ssh.user.trim() || 'root',
        auth: this.formData.ssh.authMethod,
        x11: this.formData.ssh.x11,
        agentForward: this.formData.ssh.agentForward,
      }
      if (this.formData.ssh.password) base.options.password = this.formData.ssh.password
      if (this.formData.ssh.privateKey) base.options.privateKey = this.formData.ssh.privateKey
    } else if (this.selectedTemplate === 'telnet') {
      base.type = 'telnet'
      base.options = {
        host: this.formData.telnet.host.trim(),
        port: this.formData.telnet.port || 23,
        inputMode: this.formData.telnet.inputMode,
        inputNewlines: this.formData.telnet.inputNewlines,
        outputMode: this.formData.telnet.outputMode,
        outputNewlines: this.formData.telnet.outputNewlines,
      }
    } else if (this.selectedTemplate === 'serial') {
      base.type = 'serial'
      base.options = {
        port: this.formData.serial.port.trim(),
        baudRate: this.formData.serial.baudRate,
        dataBits: this.formData.serial.dataBits,
        stopBits: this.formData.serial.stopBits,
        parity: this.formData.serial.parity,
      }
    } else if (this.selectedTemplate === 'raw') {
      base.type = 'rawSocket'
      base.options = {
        host: this.formData.raw.host.trim(),
        port: this.formData.raw.port,
      }
    }

    base.options.secureWorkbench = {
      encoding: this.formData.encoding,
      terminalType: this.formData.terminalType,
      logging: {
        startLogUponConnect: this.formData.logging.startLogUponConnect,
        promptForFilename: false,
        logFileName: this.formData.logging.logFileName,
        mode: this.formData.logging.rawLog ? 'raw' : 'transcript',
        appendMode: this.formData.logging.appendMode,
        startNewLogAtMidnight: this.formData.logging.startNewLogAtMidnight,
        timestampEachLine: this.formData.logging.timestampEachLine,
        rawLog: this.formData.logging.rawLog,
        customConnectMsg: this.formData.logging.customConnectMsg,
        customDisconnectMsg: this.formData.logging.customDisconnectMsg,
      },
      sftp: {
        autoOpenSFTP: this.formData.sftp.autoOpenSFTP,
        initialLocalPath: this.formData.sftp.initialLocalPath,
        initialRemotePath: this.formData.sftp.initialRemotePath,
        syncNavigation: this.formData.sftp.syncNavigation,
      },
    }

    if (this.sessionConfigService) {
      this.sessionConfigService.saveSessionConfig(base, base.options.secureWorkbench)
    }

    return base
  }

  save(): any {
    if (!this.isFormValid()) return null
    const profile = this.buildProfileObject()

    if (!this.config.store.profiles) {
      this.config.store.profiles = []
    }

    const profiles: any[] = this.config.store.profiles
    const idx = profiles.findIndex((p: any) => p.id === profile.id)
    if (idx >= 0) {
      profiles[idx] = profile
    } else {
      profiles.push(profile)
    }

    this.config.save()
    this.notifications?.info(`已保存会话配置: ${profile.name}`)
    this.dialogService.closeNewSession()
    return profile
  }

  async saveAndConnect(): Promise<void> {
    const profile = this.save()
    if (profile && this.profilesService) {
      try {
        await this.profilesService.openNewTabForProfile(profile)
      } catch (err) {
        console.error('[Workbench] Failed to connect newly saved profile', err)
      }
    }
  }

  cancel(): void {
    this.dialogService.closeNewSession()
  }
}
