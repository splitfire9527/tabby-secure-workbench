import { Injectable } from '@angular/core'
import { TerminalDecorator, BaseTerminalTabComponent } from 'tabby-terminal'
import { ConfigService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { StatefulCodec } from './stateful-codec'
import { CodecMiddleware } from './codec-middleware'
import { WorkbenchEncoding, DEFAULT_WORKBENCH_CONFIG } from '../config/config.model'

@Injectable({ providedIn: 'root' })
export class CodecRegistryService {
  private codecs = new WeakMap<BaseTerminalTabComponent, StatefulCodec>()

  register(tab: BaseTerminalTabComponent, codec: StatefulCodec): void {
    this.codecs.set(tab, codec)
  }

  get(tab: BaseTerminalTabComponent): StatefulCodec | undefined {
    return this.codecs.get(tab)
  }

  remove(tab: BaseTerminalTabComponent): void {
    this.codecs.delete(tab)
  }
}

/**
 * CodecTerminalDecorator attaches CodecMiddleware to every new or reconnected terminal tab.
 */
@Injectable()
export class CodecTerminalDecorator extends TerminalDecorator {
  private tabSubs = new WeakMap<BaseTerminalTabComponent, Subscription[]>()

  constructor(
    private config: ConfigService,
    private codecRegistry: CodecRegistryService
  ) {
    super()
  }

  override attach(tab: BaseTerminalTabComponent): void {
    const subs: Subscription[] = []

    const attachToSession = (session: any) => {
      if (!session) return

      const defaultEnc: WorkbenchEncoding =
        this.config.store?.secureWorkbench?.defaultEncoding || DEFAULT_WORKBENCH_CONFIG.defaultEncoding

      const codec = new StatefulCodec(defaultEnc)
      const middleware = new CodecMiddleware(codec)

      // Support session.middleware stack if available (modern Tabby)
      if (Array.isArray(session.middleware)) {
        session.middleware.unshift(middleware)
      } else if (session.middleware && typeof session.middleware.push === 'function') {
        session.middleware.push(middleware)
      }

      // Also hook session.emitOutput if present for direct legacy stream handling
      if (typeof session.emitOutput === 'function' && !session.__workbenchOutputHooked) {
        session.__workbenchOutputHooked = true
        const origEmitOutput = session.emitOutput.bind(session)
        session.emitOutput = (data: Buffer) => {
          const { utf8Bytes } = codec.decodeChunk(data)
          if (utf8Bytes && utf8Bytes.length > 0) {
            origEmitOutput(utf8Bytes)
          }
        }
      }

      this.codecRegistry.register(tab, codec)
      ;(tab as any).__workbenchCodec = codec
      ;(tab as any).__workbenchMiddleware = middleware
    }

    if (tab.session) {
      attachToSession(tab.session)
    }

    if (tab.sessionChanged$) {
      subs.push(
        tab.sessionChanged$.subscribe(session => {
          attachToSession(session)
        })
      )
    }

    this.tabSubs.set(tab, subs)
  }

  override detach(tab: BaseTerminalTabComponent): void {
    const subs = this.tabSubs.get(tab)
    if (subs) {
      subs.forEach(s => s.unsubscribe())
      this.tabSubs.delete(tab)
    }

    const codec = this.codecRegistry.get(tab)
    if (codec) {
      codec.destroy()
      this.codecRegistry.remove(tab)
    }

    delete (tab as any).__workbenchCodec
    delete (tab as any).__workbenchMiddleware
  }
}
