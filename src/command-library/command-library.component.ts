import { Component, Input } from '@angular/core'
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
          placeholder="Filter commands..."
          [(ngModel)]="searchQuery"
        />
      </div>

      <div class="actions-bar mb-2 d-flex justify-content-between align-items-center">
        <span class="small text-muted">{{ filteredCommands.length }} command(s)</span>
        <button class="btn btn-sm btn-outline-primary" (click)="showNewModal = true">
          + Add Command
        </button>
      </div>

      <div class="command-list">
        <div *ngFor="let cat of activeCategories" class="category-group mb-2">
          <div class="category-header text-uppercase font-weight-bold small text-secondary py-1">
            {{ cat }}
          </div>
          <div
            *ngFor="let cmd of getCommandsForCategory(cat)"
            class="command-item p-2 mb-1 rounded d-flex justify-content-between align-items-center border"
          >
            <div class="command-info flex-grow-1 mr-2" style="min-width: 0;">
              <div class="command-name font-weight-bold text-truncate" [title]="cmd.name">
                {{ cmd.name }}
              </div>
              <div class="command-snippet text-muted small text-truncate" [title]="cmd.snippet">
                <code>{{ cmd.snippet }}</code>
              </div>
            </div>

            <div class="command-actions d-flex align-items-center">
              <span
                class="badge mr-2"
                [class.badge-success]="cmd.autoExecute"
                [class.badge-secondary]="!cmd.autoExecute"
                [title]="cmd.autoExecute ? 'Executes immediately with Enter' : 'Inserts into input buffer'"
              >
                {{ cmd.autoExecute ? 'Auto' : 'Paste' }}
              </span>
              <button
                class="btn btn-sm btn-primary mr-1"
                (click)="runCommand(cmd)"
                title="Execute on active terminal"
              >
                Run
              </button>
              <button
                class="btn btn-sm btn-outline-danger"
                (click)="deleteCommand(cmd.id)"
                title="Delete command"
              >
                &times;
              </button>
            </div>
          </div>
        </div>

        <div *ngIf="filteredCommands.length === 0" class="text-center text-muted p-4 small">
          No commands found.
        </div>
      </div>

      <!-- Add Command Modal dialog -->
      <div *ngIf="showNewModal" class="modal-backdrop-custom p-3">
        <div class="card p-3 shadow">
          <h6 class="font-weight-bold mb-3">Add Saved Command</h6>
          <div class="form-group mb-2">
            <label class="small">Category</label>
            <input type="text" class="form-control form-control-sm" [(ngModel)]="newCmd.category" />
          </div>
          <div class="form-group mb-2">
            <label class="small">Name</label>
            <input type="text" class="form-control form-control-sm" [(ngModel)]="newCmd.name" />
          </div>
          <div class="form-group mb-2">
            <label class="small">Snippet</label>
            <textarea
              class="form-control form-control-sm"
              rows="3"
              [(ngModel)]="newCmd.snippet"
            ></textarea>
          </div>
          <div class="form-check mb-3">
            <input
              type="checkbox"
              class="form-check-input"
              id="autoExecCheck"
              [(ngModel)]="newCmd.autoExecute"
            />
            <label class="form-check-label small" for="autoExecCheck">
              Auto-execute (Append Enter)
            </label>
          </div>
          <div class="d-flex justify-content-end">
            <button class="btn btn-sm btn-secondary mr-2" (click)="showNewModal = false">
              Cancel
            </button>
            <button class="btn btn-sm btn-success" (click)="saveNewCommand()">
              Save
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
      .actions-bar {
        flex-shrink: 0;
      }
      .command-list {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
        padding-right: 2px;
      }
      .category-header {
        color: #61afef !important;
        font-size: 11px;
        letter-spacing: 0.5px;
      }
      .command-item {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 4px;
        transition: background 0.15s ease;
      }
      .command-item:hover {
        background: rgba(255, 255, 255, 0.08);
      }
      .command-name {
        color: #e5c07b;
        font-size: 12px;
      }
      .command-snippet code {
        color: #98c379;
        font-size: 11px;
        background: transparent;
      }
      .modal-backdrop-custom {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
      }
      .modal-backdrop-custom .card {
        background: #282c34;
        color: #abb2bf;
        border: 1px solid #3e4451;
      }
    `,
  ],
})
export class CommandLibraryComponent {
  @Input() activeTerminalTab: any

  searchQuery = ''
  showNewModal = false

  newCmd: Omit<SavedCommand, 'id'> = {
    category: 'General',
    name: '',
    snippet: '',
    autoExecute: false,
  }

  constructor(private commandService: CommandService) {}

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
      set.add(c.category || 'General')
    }
    return Array.from(set).sort()
  }

  getCommandsForCategory(cat: string): SavedCommand[] {
    return this.filteredCommands.filter(c => (c.category || 'General') === cat)
  }

  runCommand(cmd: SavedCommand): void {
    this.commandService.executeCommand(cmd, this.activeTerminalTab)
  }

  deleteCommand(id: string): void {
    this.commandService.deleteCommand(id)
  }

  saveNewCommand(): void {
    if (!this.newCmd.name || !this.newCmd.snippet) return
    this.commandService.addCommand({ ...this.newCmd })
    this.showNewModal = false
    this.newCmd = {
      category: 'General',
      name: '',
      snippet: '',
      autoExecute: false,
    }
  }
}
