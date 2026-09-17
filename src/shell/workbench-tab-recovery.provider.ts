import { Injectable } from '@angular/core'
import { TabRecoveryProvider, NewTabParameters, BaseTabComponent, RecoveryToken } from 'tabby-core'
import { WorkbenchShellComponent } from './workbench-shell.component'

@Injectable()
export class WorkbenchTabRecoveryProvider extends TabRecoveryProvider<WorkbenchShellComponent> {
  async applicableTo(recoveryToken: RecoveryToken): Promise<boolean> {
    return recoveryToken?.type === 'workbench'
  }

  async recover(recoveryToken: RecoveryToken): Promise<NewTabParameters<WorkbenchShellComponent>> {
    return {
      type: WorkbenchShellComponent,
      inputs: {
        savedState: recoveryToken.savedState,
      },
    }
  }
}
