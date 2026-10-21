import { Component } from '@angular/core'
import { BaseTabComponent } from 'tabby-core'

/**
 * Dedicated, fixed Home Tab for Tabby Secure Workbench.
 * Renders the welcome dashboard as an independent tab rather than an overlay.
 * Cannot be closed (canClose() returns false).
 */
@Component({
  selector: 'workbench-home-tab',
  template: `
    <div class="workbench-home-tab-container w-100 h-100">
      <workbench-welcome></workbench-welcome>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #ffffff;
      }
      .workbench-home-tab-container {
        position: relative;
        flex: 1 1 auto;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
    `,
  ],
})
export class WorkbenchHomeTabComponent extends BaseTabComponent {
  constructor() {
    super()
    this.setTitle('主页')
  }

  override async canClose(): Promise<boolean> {
    return false
  }

  override async getRecoveryToken(): Promise<any> {
    return { type: 'workbench-home-tab' }
  }
}
