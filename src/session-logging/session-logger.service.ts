import { Injectable } from '@angular/core'
import { ConfigService, PlatformService } from 'tabby-core'
import { BaseTerminalTabComponent } from 'tabby-terminal'
import * as os from 'os'
import { Subscription } from 'rxjs'
import { SessionLogger } from './session-logger'
import { LoggingConfig, DEFAULT_WORKBENCH_CONFIG } from '../config/config.model'
import { CodecRegistryService } from '../terminal-codec/codec-decorator'

@Injectable({ providedIn: 'root' })
export class SessionLoggerService {
  private loggers = new WeakMap<BaseTerminalTabComponent, SessionLogger>()
  private subs = new WeakMap<BaseTerminalTabComponent, Subscription[]>()

  constructor(
    private config: ConfigService,
    private codecRegistry: CodecRegistryService,
  ) {}

  isLogging(tab: BaseTerminalTabComponent): boolean {
    return this.loggers.has(tab)
  }

  getLogFilePath(tab: BaseTerminalTabComponent): string | null {
    return this.loggers.get(tab)?.logFilePath || null
  }

  startLogging(tab: BaseTerminalTabComponent): SessionLogger | null {
    if (this.isLogging(tab)) {
      return this.loggers.get(tab) || null
    }

    const loggingConfig: LoggingConfig =
      this.config.store?.secureWorkbench?.logging || DEFAULT_WORKBENCH_CONFIG.logging

    let logDir = loggingConfig.directory
    if (!logDir) {
      logDir = os.homedir() + '/.tabby-logs'
    }

    const effectiveConfig: LoggingConfig = {
      ...loggingConfig,
      directory: logDir,
    }

    const sessionMeta = {
      id: (tab as any).id || (tab as any)._id || 'tab-' + Date.now(),
      name: tab.title || (tab as any).customTitle || 'SSH-Session',
      host: (tab as any).profile?.options?.host || 'localhost',
    }

    const logger = new SessionLogger(effectiveConfig, sessionMeta)
    this.loggers.set(tab, logger)

    const tabSubs: Subscription[] = []

    // Connect to StatefulCodec textDecoded$ stream (single source of truth for display & log)
    const codec = this.codecRegistry.get(tab) || (tab as any).__workbenchCodec
    if (codec && codec.textDecoded$) {
      tabSubs.push(
        codec.textDecoded$.subscribe(evt => {
          logger.writeText(evt.text)
          if (effectiveConfig.mode === 'raw') {
            logger.writeRawBytes(evt.rawBytes)
          }
        })
      )

      tabSubs.push(
        codec.encodingChanged$.subscribe(evt => {
          logger.getAuditWriter()?.writeEvent('encoding-changed', sessionMeta.id, sessionMeta.name, {
            oldEncoding: evt.oldEncoding,
            newEncoding: evt.newEncoding,
            flushedText: evt.flushedText,
          })
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
      tabSubs.forEach(s => s.unsubscribe())
      this.subs.delete(tab)
    }
  }
}
