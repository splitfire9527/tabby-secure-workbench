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
    // Tabby's ConfigProxy exposes nested objects as getter-only. Replacing
    // defaultSession drops the write, so each leaf has to be assigned.
    const target = this.config.store.secureWorkbench.defaultSession
    this.assignConfigLeaves(target, updated)
    if (updated.encoding) {
      this.config.store.secureWorkbench.defaultEncoding = updated.encoding
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
    const source = this.rawProfile(profile)
    const custom = source?.options?.secureWorkbench || {}

    // Backwards compatibility with legacy profile.options.loggingConfig
    const legacyLogging = profile?.options?.loggingConfig

    return {
      encoding: this.resolveEncoding(custom.encoding, defaultCfg.encoding),
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
        preferredDockMode: this.resolveDockMode(custom.sftp, defaultCfg.sftp?.preferredDockMode),
        autoOpenSFTP: custom.sftp?.autoOpenSFTP ?? defaultCfg.sftp.autoOpenSFTP,
        initialLocalPath: custom.sftp?.initialLocalPath || defaultCfg.sftp?.initialLocalPath || '',
        initialRemotePath: custom.sftp?.initialRemotePath || defaultCfg.sftp?.initialRemotePath || '',
      },
      directoryPairs: custom.directoryPairs || defaultCfg.directoryPairs || [],
    }
  }

  /**
   * Save extended workbench configuration for a specific profile.
   */
  saveSessionConfig(profile: any, updated: Partial<SessionWorkbenchConfig>): void {
    const target = this.rawProfile(profile)
    if (!target) return
    if (!target.options) {
      target.options = {}
    }
    if (!target.options.secureWorkbench) {
      target.options.secureWorkbench = {}
    }

    target.options.secureWorkbench = {
      ...target.options.secureWorkbench,
      ...updated,
      logging: {
        ...(target.options.secureWorkbench.logging || {}),
        ...(updated.logging || {}),
      },
      sftp: {
        ...(target.options.secureWorkbench.sftp || {}),
        ...(updated.sftp || {}),
      },
    }

    // Keep legacy profile.options.loggingConfig in sync for backward compatibility
    if (updated.logging) {
      target.options.loggingConfig = {
        ...(target.options.loggingConfig || {}),
        ...updated.logging,
      }
    }

    if (updated.colorScheme) {
      target.options.secureWorkbench.colorScheme = updated.colorScheme
      target.colorScheme = updated.colorScheme
    }
    if (updated.closeTabOnExit !== undefined) {
      target.options.secureWorkbench.closeTabOnExit = updated.closeTabOnExit
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

  /**
   * Saved workbench fields on the profile, without default-session fallback.
   * Reads the raw profile because Tabby's ConfigProxy hides secureWorkbench.
   */
  getStoredWorkbench(profile: any): any {
    return this.rawProfile(profile)?.options?.secureWorkbench || {}
  }

  /**
   * Tabby wraps an open profile in ConfigProxy. options only exposes SSH fields,
   * so options.secureWorkbench on the live tab is invisible. The saved profile
   * in config.store.profiles still has it.
   */
  private rawProfile(profile: any): any {
    if (!profile) return profile
    const profiles: any[] = this.config.store?.profiles || []
    const id = profile.id
    if (id && Array.isArray(profiles)) {
      const found = profiles.find((item: any) => item && item.id === id)
      if (found) return found
    }
    return profile
  }

  /**
   * An explicit session-options choice wins. The new-session form used to stamp
   * every profile with 'full', which blocked the default dock position.
   */
  private resolveDockMode(
    customSftp: SessionWorkbenchConfig['sftp'],
    defaultMode: DefaultSessionConfig['sftp']['preferredDockMode'] | undefined
  ): 'bottom' | 'right' | 'full' | 'undock' {
    const fallback = defaultMode || 'bottom'
    const mode = customSftp?.preferredDockMode
    if (!mode) return fallback
    if (customSftp?.dockModeExplicit) return mode
    if (mode === 'full') return fallback
    return mode
  }

  /**
   * Profile encoding wins. Otherwise a customized default-session encoding wins.
   * A still-default UTF-8 session template falls through to the global default,
   * so an older global setting keeps working until the two fields are saved together.
   */
  private resolveEncoding(
    profileEncoding: WorkbenchEncoding | 'inherit' | undefined,
    sessionEncoding: WorkbenchEncoding | undefined
  ): WorkbenchEncoding {
    if (profileEncoding && profileEncoding !== 'inherit') {
      return profileEncoding
    }
    const globalEncoding = this.config.store?.secureWorkbench?.defaultEncoding as WorkbenchEncoding | undefined
    if (sessionEncoding && sessionEncoding !== 'UTF-8') {
      return sessionEncoding
    }
    return globalEncoding || sessionEncoding || 'UTF-8'
  }

  private assignConfigLeaves(target: any, updated: any): void {
    if (!target || !updated || typeof updated !== 'object') return
    for (const key of Object.keys(updated)) {
      const value = updated[key]
      if (value === undefined) continue
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.assignConfigLeaves(target[key], value)
      } else {
        target[key] = value
      }
    }
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
