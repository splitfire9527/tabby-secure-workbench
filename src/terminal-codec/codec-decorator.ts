import { Injectable } from '@angular/core'
import { TerminalDecorator, BaseTerminalTabComponent } from 'tabby-terminal'
import { Subscription } from 'rxjs'
import { StatefulCodec } from './stateful-codec'
import { bindSessionCodec } from './session-codec-binding'
import { WorkbenchEncoding, DEFAULT_WORKBENCH_CONFIG } from '../config/config.model'
import { WorkbenchSessionConfigService } from '../config/workbench-session-config.service'

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
    private sessionConfig: WorkbenchSessionConfigService,
    private codecRegistry: CodecRegistryService
  ) {
    super()
  }

  override attach(tab: BaseTerminalTabComponent): void {
    const subs: Subscription[] = []

    const attachToSession = (session: any) => {
      if (!session) return

      const oldUnbind = (tab as any).__workbenchCodecUnbind
      if (typeof oldUnbind === 'function') oldUnbind()
      const oldCodec = (tab as any).__workbenchCodec
      if (oldCodec) {
        oldCodec.destroy()
        this.codecRegistry.remove(tab)
      }

      const profile = (tab as any).profile || session?.profile
      const resolved = this.sessionConfig.getSessionConfig(profile).encoding
      const defaultEnc: WorkbenchEncoding =
        resolved && resolved !== 'inherit' ? resolved : DEFAULT_WORKBENCH_CONFIG.defaultEncoding

      const codec = new StatefulCodec(defaultEnc)
      const unbind = bindSessionCodec(session, codec)

      this.codecRegistry.register(tab, codec)
      ;(tab as any).__workbenchCodec = codec
      ;(tab as any).__workbenchCodecUnbind = unbind
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

    const unbind = (tab as any).__workbenchCodecUnbind
    if (typeof unbind === 'function') unbind()
    delete (tab as any).__workbenchCodec
    delete (tab as any).__workbenchCodecUnbind
  }
}
