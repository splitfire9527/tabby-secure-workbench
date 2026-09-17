import { Component, Input, Output, EventEmitter } from '@angular/core'

export type ActivityTab = 'sessions' | 'commands' | 'pairs' | 'settings' | 'about'

@Component({
  selector: 'workbench-activity-bar',
  template: `
    <div
      class="activity-item"
      [class.active]="activeTab === 'sessions'"
      (click)="selectTab('sessions')"
      title="Sessions (Alt+C)"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
        <line x1="8" y1="21" x2="16" y2="21"></line>
        <line x1="12" y1="17" x2="12" y2="21"></line>
      </svg>
    </div>

    <div
      class="activity-item"
      [class.active]="activeTab === 'commands'"
      (click)="selectTab('commands')"
      title="Command Library"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="4 17 10 11 4 5"></polyline>
        <line x1="12" y1="19" x2="20" y2="19"></line>
      </svg>
    </div>

    <div
      class="activity-item"
      [class.active]="activeTab === 'pairs'"
      (click)="selectTab('pairs')"
      title="Directory Pairs"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
    </div>

    <div class="flex-spacer"></div>

    <div
      class="activity-item"
      [class.active]="activeTab === 'settings'"
      (click)="selectTab('settings')"
      title="Settings"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    </div>

    <div
      class="activity-item"
      [class.active]="activeTab === 'about'"
      (click)="selectTab('about')"
      title="About Secure Workbench"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 48px;
        min-width: 48px;
        max-width: 48px;
        height: 100%;
        background: #21252b;
        border-right: 1px solid #3e4451;
        align-items: center;
        padding: 8px 0;
        box-sizing: border-box;
        flex-shrink: 0;
        user-select: none;
      }
      .activity-item {
        width: 36px;
        height: 36px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #7f848e;
        cursor: pointer;
        margin-bottom: 6px;
        transition: all 0.15s ease;
      }
      .activity-item:hover {
        color: #abb2bf;
        background: #2c313a;
      }
      .activity-item.active {
        color: #61afef;
        background: rgba(97, 175, 239, 0.18);
        box-shadow: inset 3px 0 0 #61afef;
      }
      .flex-spacer {
        flex: 1;
      }
    `,
  ],
})
export class WorkbenchActivityBarComponent {
  @Input() activeTab: ActivityTab = 'commands'
  @Output() activeTabChange = new EventEmitter<ActivityTab>()

  selectTab(tab: ActivityTab): void {
    this.activeTab = tab
    this.activeTabChange.emit(tab)
  }
}
