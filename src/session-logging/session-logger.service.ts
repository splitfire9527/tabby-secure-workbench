import { Injectable } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { BaseTerminalTabComponent } from 'tabby-terminal'
import * as os from 'os'
import { Subscription } from 'rxjs'
import { SessionLogger, LoggerConfigInput } from './session-logger'
import { LoggingConfig, DEFAULT_WORKBENCH_CONFIG } from '../config/config.model'
import { SecureCrtLogOptions } from './session-log-options.model'
import { CodecRegistryService } from '../terminal-codec/codec-decorator'

@Injectable({ providedIn: 'root' })
export class SessionLoggerService {
  private loggers = new WeakMap<BaseTerminalTabComponent, SessionLogger>()
  private subs = new WeakMap<BaseTerminalTabComponent, Subscription[]>()

  constructor(
    private config: ConfigService,
    private codecRegistry: CodecRegistryService
  ) {}

  isLogging(tab: BaseTerminalTabComponent): boolean {
    return this.loggers.has(tab)
  }

  getLogFilePath(tab: BaseTerminalTabComponent): string | null {
    return this.loggers.get(tab)?.logFilePath || null
  }

  getEffectiveLogOptions(tab: BaseTerminalTabComponent): any {
    const sessionProfile = (tab as any).profile
    const sessionLogConfig: SecureCrtLogOptions | undefined = sessionProfile?.options?.loggingConfig
    if (sessionLogConfig) {
      return {
        ...sessionLogConfig,
        directory: os.homedir() + '/.tabby-logs',
      }
    }
    return (
      this.config.store?.secureWorkbench?.logging || {
        ...DEFAULT_WORKBENCH_CONFIG.logging,
        directory: os.homedir() + '/.tabby-logs',
      }
    )
  }

  startLogging(tab: BaseTerminalTabComponent): SessionLogger | null {
    if (this.isLogging(tab)) {
      return this.loggers.get(tab) || null
    }

    const effectiveConfig = this.getEffectiveLogOptions(tab)

    const sessionMeta = {
      id: (tab as any).id || (tab as any)._id || 'tab-' + Date.now(),
      name: tab.title || (tab as any).customTitle || (tab as any).profile?.name || 'SSH-Session',
      host: (tab as any).profile?.options?.host || 'localhost',
    }

    const logger = new SessionLogger(effectiveConfig, sessionMeta)
    this.loggers.set(tab, logger)

    const tabSubs: Subscription[] = []

    // Connect to StatefulCodec textDecoded$ stream (single source of truth for display & log)
    const codec = this.codecRegistry.get(tab) || (tab as any).__workbenchCodec
    if (codec && codec.textDecoded$) {
      tabSubs.push(
        codec.textDecoded$.subscribe((evt) => {
          logger.writeText(evt.text)
          const isRaw =
            !!(effectiveConfig as SecureCrtLogOptions).rawLog ||
            (effectiveConfig as LoggingConfig).mode === 'raw'
          if (isRaw && evt.rawBytes) {
            logger.writeRawBytes(evt.rawBytes)
          }
        })
      )

      tabSubs.push(
        codec.encodingChanged$.subscribe((evt) => {
          logger.getAuditWriter()?.writeEvent('encoding-changed', sessionMeta.id, sessionMeta.name, {
            oldEncoding: evt.oldEncoding,
            newEncoding: evt.newEncoding,
            flushedText: evt.flushedText,
          })
        })
      )
    }

    if ((tab as any).destroyed$) {
      tabSubs.push(
        (tab as any).destroyed$.subscribe(() => {
          this.stopLogging(tab)
        })
      )
    }

    this.subs.set(tab, tabSubs)
    return logger
  }

  stopLogging(tab: BaseTerminalTabComponent): void {
    const logger = this.loggers.get(tab)
    if (logger) {
      logger.close()
      this.loggers.delete(tab)
    }

    const tabSubs = this.subs.get(tab)
    if (tabSubs) {
      tabSubs.forEach((s) => s.unsubscribe())
      this.subs.delete(tab)
    }
  }
}
