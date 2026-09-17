import { Injectable } from '@angular/core'
import {
  ProfileProvider,
  Profile,
  PartialProfile,
  BaseTabComponent,
  NewTabParameters,
} from 'tabby-core'
import { WorkbenchShellComponent } from './workbench-shell.component'

export interface WorkbenchProfile extends Profile {
  options: {
    sessionId?: string
    defaultEncoding?: string
  }
}

@Injectable()
export class WorkbenchProfileProvider extends ProfileProvider<WorkbenchProfile> {
  id = 'workbench'
  name = 'Secure Workbench'

  async getBuiltinProfiles(): Promise<PartialProfile<WorkbenchProfile>[]> {
    return [
      {
        type: 'workbench',
        name: 'Secure Workbench',
        options: {
          defaultEncoding: 'UTF-8',
        },
      },
    ]
  }

  async getNewTabParameters(
    profile: PartialProfile<WorkbenchProfile>
  ): Promise<NewTabParameters<BaseTabComponent>> {
    return {
      type: WorkbenchShellComponent,
      inputs: { profile },
    }
  }

  getDescription(profile: PartialProfile<WorkbenchProfile>): string {
    return 'Tabby Secure Workbench with SFTP+, Codec, and Logging'
  }
}
