import { Component, Input, HostListener, Optional } from '@angular/core'
import { NotificationsService } from 'tabby-core'
import { CommandService } from './command.service'
import { SavedCommand } from './command.model'

@Component({
  selector: 'workbench-command-library',
  template: `
    <div class="command-library-container">
      <div class="search-bar mb-2">
        <input
          type="text"
          class="form-control form-control-sm"
          placeholder="搜索命令名称或内容..."
          [(ngModel)]="searchQuery"
        />
      </div>

      <div class="actions-bar mb-2 d-flex justify-content-between align-items-center">
        <span class="small text-muted" style="font-size: 11px;">共 {{ filteredCommands.length }} 条命令</span>
        <button
          class="btn btn-sm btn-new-cmd"
          (click)="openCreateModal()"
        >
          + 新增命令
        </button>
      </div>

      <div class="command-list">
        <div *ngFor="let cat of activeCategories" class="category-group mb-2">
          <div class="category-header font-weight-bold py-1">
            {{ cat }}
          </div>
          <div
            *ngFor="let cmd of getCommandsForCategory(cat)"
            class="command-item p-2 mb-1 rounded d-flex justify-content-between align-items-center border"
            (contextmenu)="onContextMenu(cmd, $event)"
          >
            <div class="command-info flex-grow-1 mr-2" style="min-width: 0;">
              <div class="d-flex align-items-center mb-1">
                <span
                  class="badge-mode-pill mr-2 font-mono"
                  [class.badge-auto]="cmd.autoExecute"
                  [class.badge-paste]="!cmd.autoExecute"
                  [title]="cmd.autoExecute ? '回车执行：追加回车换行并立即运行' : '仅粘贴：仅写入终端输入缓冲区，不回车'"
                >
                  {{ cmd.autoExecute ? '回车执行' : '仅粘贴' }}
                </span>
                <span class="command-name font-weight-bold text-truncate" [title]="cmd.name">
                  {{ cmd.name }}
                </span>
              </div>
              <div class="command-snippet text-muted small text-truncate" [title]="cmd.snippet">
                <code>{{ cmd.snippet }}</code>
              </div>
            </div>

            <div class="command-actions d-flex align-items-center">
              <button
                class="btn btn-sm btn-outline-primary px-2"
                style="font-size: 11px; height: 24px; line-height: 1;"
                (click)="runCommand(cmd)"
                title="发送到当前活动终端"
              >
                执行
              </button>
            </div>
          </div>
        </div>

        <div *ngIf="filteredCommands.length === 0" class="text-center text-muted p-4 small">
          未检索到匹配的命令
        </div>
      </div>

      <!-- Command Right-Click Context Menu -->
      <div
        *ngIf="showContextMenu"
        class="command-context-menu shadow-lg"
        [style.left.px]="contextMenuPos.x"
        [style.top.px]="contextMenuPos.y"
        (click)="$event.stopPropagation()"
      >
        <div class="menu-item font-weight-bold" (click)="onMenuRun()">
          <span class="menu-icon">▶</span>
          <span>执行命令</span>
        </div>
        <div class="menu-item" (click)="onMenuCopy()">
          <span class="menu-icon">📋</span>
          <span>复制文本</span>
        </div>
        <div class="menu-separator"></div>
        <div class="menu-item" (click)="onMenuEdit()">
          <span class="menu-icon">✏️</span>
          <span>编辑</span>
        </div>
        <div class="menu-separator"></div>
        <div class="menu-item text-danger" (click)="onMenuDelete()">
          <span class="menu-icon">🗑️</span>
          <span>删除</span>
        </div>
      </div>

      <!-- Add/Edit Command Modal dialog -->
      <div *ngIf="showModal" class="modal-backdrop-custom p-3" (click)="showModal = false">
        <div class="card p-3 shadow-lg custom-cmd-modal" (click)="$event.stopPropagation()">
          <h6 class="font-weight-bold mb-3 text-dark">{{ isEditing ? '编辑常用命令' : '新增常用命令' }}</h6>
          <div class="form-group mb-2">
            <label class="small font-weight-bold text-dark mb-1">所属分组</label>
            <input type="text" class="form-control form-control-sm" [(ngModel)]="activeCmd.category" placeholder="e.g. 运维排错 / 系统监控" />
          </div>
          <div class="form-group mb-2">
            <label class="small font-weight-bold text-dark mb-1">命令名称</label>
            <input type="text" class="form-control form-control-sm" [(ngModel)]="activeCmd.name" placeholder="e.g. 检查端口监听" />
          </div>
          <div class="form-group mb-2">
            <label class="small font-weight-bold text-dark mb-1">命令文本 (Snippet)</label>
            <textarea
              class="form-control form-control-sm font-mono"
              rows="3"
              [(ngModel)]="activeCmd.snippet"
              placeholder="e.g. ss -tulpn | grep :80"
            ></textarea>
          </div>
          <div class="custom-control custom-checkbox mb-3">
            <input
              type="checkbox"
              class="custom-control-input"
              id="cmdAutoExecCheck"
              [(ngModel)]="activeCmd.autoExecute"
            />
            <label class="custom-control-label small text-dark" for="cmdAutoExecCheck">
              回车执行 (自动在末尾追加回车键直接运行)
            </label>
          </div>
          <div class="d-flex justify-content-end gap-2">
            <button class="btn btn-sm btn-secondary mr-2" (click)="showModal = false">
              取消
            </button>
            <button class="btn btn-sm btn-primary px-3" (click)="saveCommand()">
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: hidden;
      }
      .command-library-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: hidden;
      }
      .search-bar {
        flex-shrink: 0;
      }
      .form-control,
      input.form-control,
      textarea.form-control {
        background: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
        color: #1e293b !important;
        border-radius: 4px;
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
      }
      .actions-bar {
        flex-shrink: 0;
      }
      .btn-new-cmd {
        color: #1e40af;
        border: 1px solid #93c5fd;
        background: #eff6ff;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.12s ease;

        &:hover {
          background: #dbeafe;
          border-color: #3b82f6;
        }
      }
      .command-list {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
        padding-right: 2px;
      }
      .category-header {
        color: #1e40af !important;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.5px;
      }
      .command-item {
        background: #ffffff;
        border: 1px solid #d0d4dc !important;
        border-radius: 4px;
        transition: background 0.15s ease;
        cursor: default;
      }
      .command-item:hover {
        background: #f8fafc;
        border-color: #94a3b8 !important;
      }
      .badge-mode-pill {
        font-size: 10px;
        font-weight: 600;
        padding: 1px 5px;
        border-radius: 3px;
        line-height: 14px;
        display: inline-block;

        &.badge-auto {
          background: #ecfdf5;
          color: #047857;
          border: 1px solid #a7f3d0;
        }

        &.badge-paste {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
        }
      }
      .command-name {
        color: #0f172a;
        font-size: 12px;
        font-weight: 600;
      }
      .command-snippet code {
        color: #166534;
        font-size: 11px;
        background: #f1f5f9;
        padding: 2px 5px;
        border-radius: 3px;
      }
      .modal-backdrop-custom {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 60000;
      }
      .custom-cmd-modal {
        background: #ffffff !important;
        border: 1px solid #94a3b8 !important;
        border-radius: 6px;
        width: 380px;
        max-width: 90vw;
      }
      .command-context-menu {
        position: fixed;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
        padding: 4px 0;
        min-width: 140px;
        z-index: 70000;
        font-size: 12px;
      }
      .menu-item {
        padding: 6px 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #334155;
        cursor: pointer;
        transition: background 0.1s ease;
      }
      .menu-item:hover {
        background: #eff6ff;
        color: #1e40af;
      }
      .menu-item.text-danger {
        color: #dc2626;
      }
      .menu-item.text-danger:hover {
        background: #fef2f2;
        color: #dc2626;
      }
      .menu-icon {
        font-size: 12px;
        width: 14px;
      }
      .menu-separator {
        height: 1px;
        background: #e2e8f0;
        margin: 3px 0;
      }
    `,
  ],
})
export class CommandLibraryComponent {
  @Input() activeTerminalTab: any

  searchQuery = ''
  showModal = false
  isEditing = false
  editingCommandId: string | null = null

  activeCmd: Omit<SavedCommand, 'id'> = {
    category: '通用命令',
    name: '',
    snippet: '',
    autoExecute: false,
  }

  showContextMenu = false
  contextMenuPos = { x: 0, y: 0 }
  contextMenuCommand: SavedCommand | null = null

  constructor(
    private commandService: CommandService,
    @Optional() private notifications?: NotificationsService
  ) {}

  @HostListener('document:click')
  onDocumentClick(): void {
    this.showContextMenu = false
  }

  get allCommands(): SavedCommand[] {
    return this.commandService.getCommands()
  }

  get filteredCommands(): SavedCommand[] {
    const q = this.searchQuery.toLowerCase().trim()
    if (!q) return this.allCommands

    return this.allCommands.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.snippet.toLowerCase().includes(q)
    )
  }

  get activeCategories(): string[] {
    const set = new Set<string>()
    for (const c of this.filteredCommands) {
      set.add(c.category || '通用命令')
    }
    return Array.from(set).sort()
  }

  getCommandsForCategory(cat: string): SavedCommand[] {
    return this.filteredCommands.filter(c => (c.category || '通用命令') === cat)
  }

  runCommand(cmd: SavedCommand): void {
    this.commandService.executeCommand(cmd, this.activeTerminalTab)
  }

  openCreateModal(): void {
    this.isEditing = false
    this.editingCommandId = null
    this.activeCmd = {
      category: '通用命令',
      name: '',
      snippet: '',
      autoExecute: false,
    }
    this.showModal = true
  }

  onContextMenu(cmd: SavedCommand, event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    this.contextMenuCommand = cmd
    this.contextMenuPos = { x: event.clientX, y: event.clientY }
    this.showContextMenu = true
  }

  onMenuRun(): void {
    this.showContextMenu = false
    if (this.contextMenuCommand) {
      this.runCommand(this.contextMenuCommand)
    }
  }

  onMenuCopy(): void {
    this.showContextMenu = false
    if (this.contextMenuCommand?.snippet) {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(this.contextMenuCommand.snippet).catch(() => {})
      }
      this.notifications?.info(`已复制到剪贴板: ${this.contextMenuCommand.snippet}`)
    }
  }

  onMenuEdit(): void {
    this.showContextMenu = false
    if (!this.contextMenuCommand) return
    this.isEditing = true
    this.editingCommandId = this.contextMenuCommand.id
    this.activeCmd = {
      category: this.contextMenuCommand.category || '通用命令',
      name: this.contextMenuCommand.name,
      snippet: this.contextMenuCommand.snippet,
      autoExecute: !!this.contextMenuCommand.autoExecute,
    }
    this.showModal = true
  }

  onMenuDelete(): void {
    this.showContextMenu = false
    if (!this.contextMenuCommand) return
    const id = this.contextMenuCommand.id
    this.commandService.deleteCommand(id)
    this.notifications?.info(`已删除命令: ${this.contextMenuCommand.name}`)
  }

  saveCommand(): void {
    if (!this.activeCmd.name || !this.activeCmd.snippet) return
    if (this.isEditing && this.editingCommandId) {
      this.commandService.updateCommand({
        ...this.activeCmd,
        id: this.editingCommandId,
      })
      this.notifications?.info(`已更新命令: ${this.activeCmd.name}`)
    } else {
      this.commandService.addCommand({ ...this.activeCmd })
      this.notifications?.info(`已新增命令: ${this.activeCmd.name}`)
    }
    this.showModal = false
  }
}
