import { NgModule, Injectable, Optional } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import TabbyCoreModule, {
  ConfigProvider,
  ToolbarButtonProvider,
  ProfileProvider,
  TabRecoveryProvider,
  HotkeyProvider,
  ConfigService,
} from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'
import { TerminalDecorator, TerminalColorSchemeProvider } from 'tabby-terminal'

// Config
import { WorkbenchConfigProvider } from './config/workbench-config.provider'

// Themes
import { SecureCrtColorSchemeProvider } from './themes/securecrt-classic'
import './themes/workbench-theme.scss'

// Codec
import { CodecTerminalDecorator, CodecRegistryService } from './terminal-codec/codec-decorator'

// Logging
import { SessionLoggerService } from './session-logging/session-logger.service'

// Cross-Transfer
import { CrossTransferClipboard } from './cross-transfer/cross-transfer-clipboard'
import { CrossTransferRelayService } from './cross-transfer/cross-transfer-relay.service'

// Commands
import { CommandService } from './command-library/command.service'
import { CommandLibraryComponent } from './command-library/command-library.component'

// Shell
import { WorkbenchShellComponent } from './shell/workbench-shell.component'
import { WorkbenchHeaderComponent } from './shell/workbench-header.component'
import { WorkbenchToolbarComponent } from './shell/workbench-toolbar.component'
import { WorkbenchActivityBarComponent } from './shell/workbench-activity-bar.component'
import { WorkbenchDrawerComponent } from './shell/workbench-drawer.component'
import { WorkbenchBottomDockComponent } from './shell/workbench-bottom-dock.component'
import { WorkbenchSidebarComponent } from './shell/workbench-sidebar.component'
import { WorkbenchHostShellService } from './shell/workbench-host-shell.service'
import { WorkbenchProfileProvider } from './shell/workbench-profile.provider'
import { WorkbenchTabRecoveryProvider } from './shell/workbench-tab-recovery.provider'
import { WorkbenchToolbarButtonProvider } from './shell/workbench-toolbar-button.provider'
import { WorkbenchHotkeyProvider } from './shell/workbench-hotkey.provider'
import {
  WorkbenchSettingsTabComponent,
  WorkbenchSettingsTabProvider,
  WorkbenchTerminalDecorator,
} from './shell'

/**
 * Service to manage optional CSS injection for hiding Tabby's native SFTP button
 * without using brittle DOM manipulation.
 */
@Injectable({ providedIn: 'root' })
export class NativeSftpHideService {
  private styleEl: HTMLStyleElement | null = null

  constructor(@Optional() private config?: ConfigService) {
    this.applyRule()
    if (this.config?.changed$) {
      this.config.changed$.subscribe(() => {
        this.applyRule()
      })
    }
  }

  applyRule(): void {
    const shouldHide = !!this.config?.store?.secureWorkbench?.hideNativeSFTPButton
    if (shouldHide) {
      if (!this.styleEl) {
        this.styleEl = document.createElement('style')
        this.styleEl.setAttribute('data-workbench-hide-native-sftp', '1')
        this.styleEl.textContent = `
          button[data-tabby-sftp-ui-button],
          button[title="SFTP" i] {
            display: none !important;
          }
        `
        document.head.appendChild(this.styleEl)
      }
    } else {
      if (this.styleEl) {
        this.styleEl.remove()
        this.styleEl = null
      }
    }
  }
}

@NgModule({
  imports: [CommonModule, FormsModule, TabbyCoreModule],
  declarations: [
    WorkbenchShellComponent,
    WorkbenchSidebarComponent,
    WorkbenchHeaderComponent,
    WorkbenchToolbarComponent,
    WorkbenchActivityBarComponent,
    WorkbenchDrawerComponent,
    WorkbenchBottomDockComponent,
    CommandLibraryComponent,
    WorkbenchSettingsTabComponent,
  ],
  entryComponents: [
    WorkbenchShellComponent,
    WorkbenchSidebarComponent,
    WorkbenchSettingsTabComponent,
  ],
  providers: [
    { provide: ConfigProvider, useClass: WorkbenchConfigProvider, multi: true },
    { provide: ToolbarButtonProvider, useClass: WorkbenchToolbarButtonProvider, multi: true },
    { provide: ProfileProvider, useClass: WorkbenchProfileProvider, multi: true },
    { provide: TabRecoveryProvider, useClass: WorkbenchTabRecoveryProvider as any, multi: true },
    { provide: TerminalDecorator, useClass: CodecTerminalDecorator, multi: true },
    { provide: TerminalDecorator, useClass: WorkbenchTerminalDecorator, multi: true },
    { provide: HotkeyProvider, useClass: WorkbenchHotkeyProvider, multi: true },
    { provide: SettingsTabProvider, useClass: WorkbenchSettingsTabProvider, multi: true },
    { provide: TerminalColorSchemeProvider, useClass: SecureCrtColorSchemeProvider, multi: true },

    CodecRegistryService,
    SessionLoggerService,
    CrossTransferClipboard,
    CrossTransferRelayService,
    CommandService,
    NativeSftpHideService,
    WorkbenchHostShellService,
  ],
})
export default class TabbySecureWorkbenchModule {
  constructor(hideService: NativeSftpHideService, hostShell: WorkbenchHostShellService) {
    // Initialized on module startup
  }
}

export * from './config'
export * from './terminal-codec'
export * from './session-logging'
export * from './transfer-store'
export * from './cross-transfer'
export {
  OverwriteUploader,
  RemoteSftpClient,
  RemoteFileStats,
  OverwriteUploadResult,
  SftpAuditEvent,
  createSftpAuditEvent,
} from './sftp-plus'
export { CommandService, CommandLibraryComponent } from './command-library'
export * from './themes'
export * from './shell'
