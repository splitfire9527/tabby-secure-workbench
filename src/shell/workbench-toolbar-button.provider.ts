import { Injectable } from '@angular/core'
import { ToolbarButtonProvider, ToolbarButton, AppService } from 'tabby-core'
import { WorkbenchShellComponent } from './workbench-shell.component'

import { WorkbenchHostShellService } from './workbench-host-shell.service'

@Injectable()
export class WorkbenchToolbarButtonProvider extends ToolbarButtonProvider {
  constructor(private app: AppService, private hostShell: WorkbenchHostShellService) {
    super()
  }

  provide(): ToolbarButton[] {
    return [
      {
        icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>',
        title: 'Secure Workbench',
        weight: 10,
        click: () => {
          this.app.openNewTab({ type: WorkbenchShellComponent })
        },
      },
    ]
  }
}
