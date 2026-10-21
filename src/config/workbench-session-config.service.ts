import { Injectable } from '@angular/core'
import { ConfigService, NotificationsService } from 'tabby-core'
import {
  DefaultSessionConfig,
  SessionWorkbenchConfig,
  DEFAULT_WORKBENCH_CONFIG,
  WorkbenchEncoding,
} from './config.model'

@Injectable({ providedIn: 'root' })
export class WorkbenchSessionConfigService {
  constructor(
    private config: ConfigService,
    private notifications: NotificationsService
  ) {}

  /**
   * Get the global Default Session configuration template (SecureCRT-style).
   */
  getDefaultSessionConfig(): DefaultSessionConfig {
    this.ensureWorkbenchConfig()
    return this.config.store.secureWorkbench.defaultSession
  }

  /**
   * Save changes to the global Default Session configuration template.
   */
  saveDefaultSessionConfig(updated: Partial<DefaultSessionConfig>): void {
    this.ensureWorkbenchConfig()
    this.config.store.secureWorkbench.defaultSession = {
      ...this.config.store.secureWorkbench.defaultSession,
      ...updated,
      logging: {
        ...this.config.store.secureWorkbench.defaultSession.logging,
        ...(updated.logging || {}),
      },
      sftp: {
        ...this.config.store.secureWorkbench.defaultSession.sftp,
        ...(updated.sftp || {}),
      },
    }
    if (updated.closeTabOnExit !== undefined) {
      this.config.store.secureWorkbench.closeTabOnExit = updated.closeTabOnExit
    }
    if (updated.colorScheme !== undefined) {
      this.config.store.secureWorkbench.colorScheme = updated.colorScheme
    }
    this.config.save()
  }

  /**
   * Get the effective configuration for a given session profile.
   * Cascading: Default Session -> Profile secureWorkbench overrides.
   */
  getSessionConfig(profile: any): SessionWorkbenchConfig {
    const defaultCfg = this.getDefaultSessionConfig()
    const custom = profile?.options?.secureWorkbench || {}

    // Backwards compatibility with legacy profile.options.loggingConfig
    const legacyLogging = profile?.options?.loggingConfig

    return {
      encoding: custom.encoding && custom.encoding !== 'inherit' ? custom.encoding : defaultCfg.encoding,
      terminalType: custom.terminalType || defaultCfg.terminalType,
      colorScheme: custom.colorScheme || defaultCfg.colorScheme || 'SecureCRT System Color Scheme',
      closeTabOnExit: custom.closeTabOnExit ?? defaultCfg.closeTabOnExit ?? false,
      logging: {
        startLogUponConnect:
          custom.logging?.startLogUponConnect ??
          legacyLogging?.startLogUponConnect ??
          defaultCfg.logging.startLogUponConnect,
        promptForFilename:
          custom.logging?.promptForFilename ??
          legacyLogging?.promptForFilename ??
          defaultCfg.logging.promptForFilename,
        logFileName:
          custom.logging?.logFileName ||
          legacyLogging?.logFileName ||
          defaultCfg.logging.logFileName,
        mode:
          custom.logging?.mode ||
          (legacyLogging?.rawLog ? 'raw' : 'transcript') ||
          defaultCfg.logging.mode,
        appendMode:
          custom.logging?.appendMode ||
          (legacyLogging?.appendMode ? 'append' : 'append') ||
          defaultCfg.logging.appendMode,
        directory:
          custom.logging?.directory ||
          legacyLogging?.directory ||
          defaultCfg.logging.directory,
      },
      sftp: {
        preferredDockMode: custom.sftp?.preferredDockMode || defaultCfg.sftp.preferredDockMode,
        autoOpenSFTP: custom.sftp?.autoOpenSFTP ?? defaultCfg.sftp.autoOpenSFTP,
        initialLocalPath: custom.sftp?.initialLocalPath || '',
        initialRemotePath: custom.sftp?.initialRemotePath || '',
      },
      directoryPairs: custom.directoryPairs || defaultCfg.directoryPairs || [],
    }
  }

  /**
   * Save extended workbench configuration for a specific profile.
   */
  saveSessionConfig(profile: any, updated: Partial<SessionWorkbenchConfig>): void {
    if (!profile) return
    if (!profile.options) {
      profile.options = {}
    }
    if (!profile.options.secureWorkbench) {
      profile.options.secureWorkbench = {}
    }

    profile.options.secureWorkbench = {
      ...profile.options.secureWorkbench,
      ...updated,
      logging: {
        ...(profile.options.secureWorkbench.logging || {}),
        ...(updated.logging || {}),
      },
      sftp: {
        ...(profile.options.secureWorkbench.sftp || {}),
        ...(updated.sftp || {}),
      },
    }

    // Keep legacy profile.options.loggingConfig in sync for backward compatibility
    if (updated.logging) {
      profile.options.loggingConfig = {
        ...(profile.options.loggingConfig || {}),
        ...updated.logging,
      }
    }

    if (updated.colorScheme) {
      profile.options.secureWorkbench.colorScheme = updated.colorScheme
      profile.colorScheme = updated.colorScheme
    }
    if (updated.closeTabOnExit !== undefined) {
      profile.options.secureWorkbench.closeTabOnExit = updated.closeTabOnExit
    }

    this.config.save()
  }

  /**
   * Apply default session configuration to all existing saved profiles.
   * SecureCRT feature: "Apply default session settings to all sessions".
   *
   * @param overwriteAll If true, overwrites custom settings; if false, only fills in missing settings.
   * @returns Number of profiles updated.
   */
  applyDefaultSessionToAllProfiles(overwriteAll: boolean = true): number {
    const defaultCfg = this.getDefaultSessionConfig()
    const profiles: any[] = this.config.store?.profiles || []
    let count = 0

    for (const p of profiles) {
      if (!p.options) p.options = {}
      if (!p.options.secureWorkbench) p.options.secureWorkbench = {}

      if (overwriteAll) {
        p.options.secureWorkbench = {
          encoding: defaultCfg.encoding,
          terminalType: defaultCfg.terminalType,
          logging: { ...defaultCfg.logging },
          sftp: { ...defaultCfg.sftp },
          directoryPairs: [...defaultCfg.directoryPairs],
        }
        p.options.loggingConfig = { ...defaultCfg.logging }
        count++
      } else {
        // Only fill missing fields
        let modified = false
        if (!p.options.secureWorkbench.encoding) {
          p.options.secureWorkbench.encoding = defaultCfg.encoding
          modified = true
        }
        if (!p.options.secureWorkbench.logging) {
          p.options.secureWorkbench.logging = { ...defaultCfg.logging }
          p.options.loggingConfig = { ...defaultCfg.logging }
          modified = true
        }
        if (!p.options.secureWorkbench.sftp) {
          p.options.secureWorkbench.sftp = { ...defaultCfg.sftp }
          modified = true
        }
        if (modified) count++
      }
    }

    if (count > 0) {
      this.config.save()
    }
    return count
  }

  private ensureWorkbenchConfig(): void {
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    if (!this.config.store.secureWorkbench.defaultSession) {
      this.config.store.secureWorkbench.defaultSession = { ...DEFAULT_WORKBENCH_CONFIG.defaultSession }
    }
  }
}
