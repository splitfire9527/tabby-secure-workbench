import { Component, Input, Output, EventEmitter } from '@angular/core'

export type ActivityTab = 'sessions' | 'commands' | 'pairs' | 'settings' | 'about'

@Component({
  selector: 'workbench-activity-bar',
  template: `
    <div class="workbench-activity-bar">
      <div
        class="activity-item"
        [class.active]="activeTab === 'sessions'"
        (click)="selectTab('sessions')"
        title="Sessions (Alt+C)"
      >
        <span>&#x1f5a5;</span>
      </div>

      <div
        class="activity-item"
        [class.active]="activeTab === 'commands'"
        (click)="selectTab('commands')"
        title="Command Library"
      >
        <span>&#x1f4dc;</span>
      </div>

      <div
        class="activity-item"
        [class.active]="activeTab === 'pairs'"
        (click)="selectTab('pairs')"
        title="Directory Pairs"
      >
        <span>&#x1f5c4;</span>
      </div>

      <div class="flex-grow-1"></div>

      <div
        class="activity-item"
        [class.active]="activeTab === 'settings'"
        (click)="selectTab('settings')"
        title="Settings"
      >
        <span>&#x2699;</span>
      </div>

      <div
        class="activity-item"
        [class.active]="activeTab === 'about'"
        (click)="selectTab('about')"
        title="About Secure Workbench"
      >
        <span>&#x2139;</span>
      </div>
    </div>
  `,
})
export class WorkbenchActivityBarComponent {
  @Input() activeTab: ActivityTab = 'commands'
  @Output() activeTabChange = new EventEmitter<ActivityTab>()

  selectTab(tab: ActivityTab): void {
    this.activeTab = tab
    this.activeTabChange.emit(tab)
  }
}
