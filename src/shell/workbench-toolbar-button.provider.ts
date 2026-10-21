import { Injectable, Optional } from '@angular/core'
import { ToolbarButtonProvider, ToolbarButton, AppService } from 'tabby-core'
import { WorkbenchHostShellService } from './workbench-host-shell.service'

@Injectable()
export class WorkbenchToolbarButtonProvider extends ToolbarButtonProvider {
  constructor(
    private app: AppService,
    @Optional() private hostShell?: WorkbenchHostShellService
  ) {
    super()
  }

  provide(): ToolbarButton[] {
    return []
  }
}
