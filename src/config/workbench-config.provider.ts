import { Injectable } from '@angular/core'
import { ConfigProvider } from 'tabby-core'
import { DEFAULT_WORKBENCH_CONFIG } from './config.model'
import { WorkbenchHostShellService } from '../shell/workbench-host-shell.service'

/**
 * ConfigProvider for Tabby Secure Workbench.
 * Integrates default configuration settings into Tabby's global config store.
 */
@Injectable()
export class WorkbenchConfigProvider extends ConfigProvider {
  defaults = {
    secureWorkbench: DEFAULT_WORKBENCH_CONFIG,
  }

  platformDefaults = {}

  constructor(private hostShell: WorkbenchHostShellService) {
    super()
  }
}
