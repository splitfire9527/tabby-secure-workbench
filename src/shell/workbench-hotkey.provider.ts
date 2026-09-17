import { Injectable } from '@angular/core'
import { HotkeyProvider, HotkeyDescription } from 'tabby-core'

@Injectable()
export class WorkbenchHotkeyProvider extends HotkeyProvider {
  async provide(): Promise<HotkeyDescription[]> {
    return [
      {
        id: 'workbench-focus-search',
        name: 'Workbench: Focus Session Search',
      },
    ]
  }
}
