import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core'
import { ConfigService, NotificationsService } from 'tabby-core'
import { SecureCrtLogOptions, DEFAULT_SECURECRT_LOG_OPTIONS } from './session-log-options.model'

@Component({
  selector: 'session-log-dialog',
  template: `
    <div class="securecrt-modal-backdrop" (click)="onBackdropClick($event)">
      <div class="securecrt-dialog shadow-lg" (click)="$event.stopPropagation()">
        <!-- Title Bar -->
        <div class="dialog-titlebar">
          <div class="d-flex align-items-center gap-2">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="color: #61afef;">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <span class="title-text">Session Options - {{ sessionDisplayName }}</span>
          </div>
          <button class="dialog-close-btn" (click)="cancel()">&times;</button>
        </div>

        <!-- Main Body: Category Tree + Options Content -->
        <div class="dialog-body">
          <!-- Left: Category Tree -->
          <div class="category-tree-col">
            <div class="category-tree-header">Category:</div>
            <div class="category-tree-box">
              <div class="tree-item-group">
                <div class="tree-item tree-category">
                  <span class="tree-expander">-</span>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" class="mr-1">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                    <line x1="6" y1="6" x2="6.01" y2="6"></line>
                    <line x1="6" y1="18" x2="6.01" y2="18"></line>
                  </svg>
                  <span>Connection</span>
                </div>
                <div class="tree-item-children">
                  <div class="tree-item tree-leaf selected">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" class="mr-1">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    <span>Log File</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Log File Options Panel -->
          <div class="options-content-col">
            <div class="options-panel-header">Log File</div>

            <!-- Log file name -->
            <div class="form-group mb-2">
              <label class="control-label mb-1">Log file name</label>
              <div class="d-flex gap-1">
                <input
                  type="text"
                  class="form-control form-control-sm log-input font-mono"
                  [(ngModel)]="options.logFileName"
                  placeholder="%H_%S_%Y%M%D_%h%m%s.log"
                />
                <button class="btn btn-sm btn-browse" (click)="browse()" title="Browse...">
                  ...
                </button>
              </div>
              <div class="template-help-text">
                Substitutions: <code>%H</code>(host), <code>%S</code>(session), <code>%Y</code>(year), <code>%M</code>(month), <code>%D</code>(day), <code>%h</code>(hour), <code>%m</code>(min), <code>%s</code>(sec)
              </div>
            </div>

            <!-- Checkboxes group 1 -->
            <div class="options-checkbox-group mb-2">
              <div class="custom-control custom-checkbox mb-1">
                <input
                  type="checkbox"
                  class="custom-control-input"
                  id="promptForFilename"
                  [(ngModel)]="options.promptForFilename"
                />
                <label class="custom-control-label" for="promptForFilename">Prompt for filename</label>
              </div>
              <div class="custom-control custom-checkbox mb-1">
                <input
                  type="checkbox"
                  class="custom-control-input"
                  id="startLogUponConnect"
                  [(ngModel)]="options.startLogUponConnect"
                />
                <label class="custom-control-label" for="startLogUponConnect">Start log upon connect</label>
              </div>
              <div class="custom-control custom-checkbox mb-1">
                <input
                  type="checkbox"
                  class="custom-control-input"
                  id="rawLog"
                  [(ngModel)]="options.rawLog"
                />
                <label class="custom-control-label" for="rawLog">Raw log</label>
              </div>
              <div class="custom-control custom-checkbox mb-1">
                <input
                  type="checkbox"
                  class="custom-control-input"
                  id="startNewLogAtMidnight"
                  [(ngModel)]="options.startNewLogAtMidnight"
                />
                <label class="custom-control-label" for="startNewLogAtMidnight">Start new log at midnight</label>
              </div>
            </div>

            <!-- Fieldset: If log file already exists -->
            <fieldset class="group-fieldset mb-2">
              <legend class="group-legend">If log file already exists</legend>
              <div class="radio-row d-flex gap-4">
                <div class="custom-control custom-radio">
                  <input
                    type="radio"
                    id="overwriteRadio"
                    name="existMode"
                    class="custom-control-input"
                    [checked]="options.mode === 'overwrite'"
                    (change)="options.mode = 'overwrite'"
                  />
                  <label class="custom-control-label" for="overwriteRadio">Overwrite file</label>
                </div>
                <div class="custom-control custom-radio ml-3">
                  <input
                    type="radio"
                    id="appendRadio"
                    name="existMode"
                    class="custom-control-input"
                    [checked]="options.mode === 'append'"
                    (change)="options.mode = 'append'"
                  />
                  <label class="custom-control-label" for="appendRadio">Append to file</label>
                </div>
              </div>
            </fieldset>

            <!-- Checkbox: Timestamp each line -->
            <div class="custom-control custom-checkbox mb-2">
              <input
                type="checkbox"
                class="custom-control-input"
                id="timestampEachLine"
                [(ngModel)]="options.timestampEachLine"
              />
              <label class="custom-control-label" for="timestampEachLine">Timestamp each line</label>
            </div>

            <!-- Trace level -->
            <div class="form-group row-trace d-flex align-items-center gap-2 mb-2">
              <label class="control-label mb-0 mr-2">Trace level:</label>
              <input
                type="number"
                min="0"
                max="3"
                class="form-control form-control-sm trace-input"
                [(ngModel)]="options.traceLevel"
              />
            </div>

            <!-- Fieldset: Custom log data -->
            <fieldset class="group-fieldset mb-2">
              <legend class="group-legend">Custom log data</legend>
              <div class="custom-data-grid">
                <div class="form-row-custom mb-1">
                  <label class="custom-label">Upon connect:</label>
                  <input
                    type="text"
                    class="form-control form-control-sm custom-input"
                    [(ngModel)]="options.customLogData!.uponConnect"
                  />
                </div>
                <div class="form-row-custom mb-1">
                  <label class="custom-label">Upon disconnect:</label>
                  <input
                    type="text"
                    class="form-control form-control-sm custom-input"
                    [(ngModel)]="options.customLogData!.uponDisconnect"
                  />
                </div>
                <div class="form-row-custom mb-2">
                  <label class="custom-label">On each line:</label>
                  <input
                    type="text"
                    class="form-control form-control-sm custom-input"
                    [(ngModel)]="options.customLogData!.onEachLine"
                  />
                </div>
              </div>
              <div class="custom-control custom-checkbox">
                <input
                  type="checkbox"
                  class="custom-control-input"
                  id="logOnlyCustomData"
                  [(ngModel)]="options.customLogData!.logOnlyCustomData"
                />
                <label class="custom-control-label" for="logOnlyCustomData">Log only custom data</label>
              </div>
            </fieldset>
          </div>
        </div>

        <!-- Footer Buttons: OK / Cancel -->
        <div class="dialog-footer">
          <button class="btn btn-sm btn-dialog-ok mr-2" (click)="save()">OK</button>
          <button class="btn btn-sm btn-dialog-cancel" (click)="cancel()">Cancel</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .securecrt-modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100000;
        user-select: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      }
      .securecrt-dialog {
        width: 620px;
        background: #f0f2f5;
        border: 1px solid #a0a6b2;
        border-radius: 6px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
        color: #222222;
        overflow: hidden;
      }
      .dialog-titlebar {
        height: 32px;
        background: #e4e7eb;
        border-bottom: 1px solid #c8ccd4;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 10px 0 12px;
        font-size: 12px;
        font-weight: 600;
        color: #222222;
      }
      .dialog-close-btn {
        background: transparent;
        border: none;
        font-size: 18px;
        line-height: 1;
        color: #666;
        cursor: pointer;
        padding: 0 4px;
      }
      .dialog-close-btn:hover {
        color: #e81123;
      }
      .dialog-body {
        display: flex;
        flex-direction: row;
        padding: 12px;
        gap: 12px;
        font-size: 11px;
        color: #222222;
      }
      .category-tree-col {
        width: 170px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
      }
      .category-tree-header {
        font-weight: 600;
        margin-bottom: 4px;
        font-size: 11px;
        color: #333333;
      }
      .category-tree-box {
        flex: 1;
        min-height: 340px;
        background: #ffffff;
        border: 1px solid #7f9db9;
        border-radius: 2px;
        padding: 4px;
        overflow-y: auto;
      }
      .tree-item {
        display: flex;
        align-items: center;
        padding: 2px 4px;
        cursor: pointer;
        border-radius: 2px;
        font-size: 11px;
        line-height: 18px;
      }
      .tree-expander {
        display: inline-block;
        width: 12px;
        text-align: center;
        margin-right: 2px;
        font-weight: bold;
        color: #555;
      }
      .tree-item-children {
        padding-left: 18px;
      }
      .tree-leaf.selected {
        background: #0078d7;
        color: #ffffff;
      }
      .options-content-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .options-panel-header {
        font-size: 13px;
        font-weight: 700;
        color: #111111;
        margin-bottom: 8px;
        border-bottom: 1px solid #d0d4dc;
        padding-bottom: 3px;
      }
      .control-label {
        font-size: 11px;
        font-weight: 500;
        color: #222222;
      }
      .log-input {
        flex: 1;
        background: #ffffff !important;
        border: 1px solid #7f9db9 !important;
        color: #222222 !important;
        height: 24px;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 2px;
      }
      .btn-browse {
        height: 24px;
        padding: 0 10px;
        font-size: 11px;
        background: #e1e4e8;
        border: 1px solid #abadb3;
        color: #222222;
        border-radius: 2px;
      }
      .btn-browse:hover {
        background: #d0d4dc;
      }
      .template-help-text {
        font-size: 10px;
        color: #666666;
        margin-top: 3px;
      }
      .template-help-text code {
        color: #005fb8;
        background: rgba(0, 95, 184, 0.08);
        padding: 0 2px;
      }
      .group-fieldset {
        border: 1px solid #c8ccd4;
        border-radius: 3px;
        padding: 6px 10px 8px 10px;
        margin-top: 4px;
      }
      .group-legend {
        width: auto;
        font-size: 11px;
        font-weight: 600;
        color: #333333;
        margin-bottom: 0;
        padding: 0 4px;
        border: none;
      }
      .custom-control-label {
        font-size: 11px;
        color: #222222;
        user-select: none;
        padding-top: 1px;
      }
      .custom-control-input:checked ~ .custom-control-label::before {
        border-color: #0078d7;
        background-color: #0078d7;
      }
      .trace-input {
        width: 60px;
        height: 24px;
        background: #ffffff !important;
        border: 1px solid #7f9db9 !important;
        color: #222222 !important;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 2px;
      }
      .custom-data-grid {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .form-row-custom {
        display: flex;
        align-items: center;
      }
      .custom-label {
        width: 105px;
        font-size: 11px;
        color: #222222;
        margin-bottom: 0;
        flex-shrink: 0;
      }
      .custom-input {
        flex: 1;
        height: 24px;
        background: #ffffff !important;
        border: 1px solid #7f9db9 !important;
        color: #222222 !important;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 2px;
      }
      .dialog-footer {
        height: 42px;
        background: #e4e7eb;
        border-top: 1px solid #c8ccd4;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 0 14px;
      }
      .btn-dialog-ok,
      .btn-dialog-cancel {
        min-width: 75px;
        height: 24px;
        font-size: 11px;
        padding: 0 12px;
        border-radius: 2px;
      }
      .btn-dialog-ok {
        background: #0078d7;
        border: 1px solid #005fb8;
        color: #ffffff;
      }
      .btn-dialog-ok:hover {
        background: #0063b1;
        color: #ffffff;
      }
      .btn-dialog-cancel {
        background: #ffffff;
        border: 1px solid #abadb3;
        color: #222222;
      }
      .btn-dialog-cancel:hover {
        background: #e1e4e8;
      }
    `,
  ],
})
export class SessionLogDialogComponent implements OnInit {
  @Input() profile: any
  @Input() activeTerminalTab: any
  @Output() close = new EventEmitter<void>()
  @Output() saved = new EventEmitter<SecureCrtLogOptions>()

  options: SecureCrtLogOptions = { ...DEFAULT_SECURECRT_LOG_OPTIONS }

  constructor(
    private config: ConfigService,
    private notifications: NotificationsService
  ) {}

  ngOnInit(): void {
    const existing =
      this.profile?.options?.loggingConfig ||
      this.activeTerminalTab?.profile?.options?.loggingConfig
    if (existing) {
      this.options = {
        ...DEFAULT_SECURECRT_LOG_OPTIONS,
        ...existing,
        customLogData: {
          ...DEFAULT_SECURECRT_LOG_OPTIONS.customLogData,
          ...(existing.customLogData || {}),
        },
      }
    }
  }

  get sessionDisplayName(): string {
    return (
      this.profile?.name ||
      this.activeTerminalTab?.title ||
      this.activeTerminalTab?.profile?.name ||
      this.profile?.options?.host ||
      'Session'
    )
  }

  onBackdropClick(event: MouseEvent): void {
    this.cancel()
  }

  browse(): void {
    // Allows user to pick or specify a log directory/file
    const current = this.options.logFileName || '%H_%S_%Y%M%D_%h%m%s.log'
    const chosen = prompt('Enter log file name or template:', current)
    if (chosen !== null && chosen.trim()) {
      this.options.logFileName = chosen.trim()
    }
  }

  save(): void {
    const targetProfile = this.profile || this.activeTerminalTab?.profile
    if (targetProfile) {
      if (!targetProfile.options) {
        targetProfile.options = {}
      }
      targetProfile.options.loggingConfig = {
        ...this.options,
        customLogData: { ...(this.options.customLogData || {}) },
      }
    }

    if (this.activeTerminalTab?.profile?.options) {
      this.activeTerminalTab.profile.options.loggingConfig = {
        ...this.options,
        customLogData: { ...(this.options.customLogData || {}) },
      }
    }

    this.config.save()
    this.notifications.info(`Session logging options saved for ${this.sessionDisplayName}`)
    this.saved.emit(this.options)
    this.close.emit()
  }

  cancel(): void {
    this.close.emit()
  }
}
