import {
  Injectable,
  ApplicationRef,
  ComponentFactoryResolver,
  Injector,
  EmbeddedViewRef,
  ComponentRef,
  NgZone,
} from '@angular/core'
import { AppService, ConfigService } from 'tabby-core'
import { WorkbenchSidebarComponent } from './workbench-sidebar.component'

@Injectable({ providedIn: 'root' })
export class WorkbenchHostShellService {
  private sidebarRef: ComponentRef<WorkbenchSidebarComponent> | null = null
  private observer: MutationObserver | null = null

  constructor(
    private appRef: ApplicationRef,
    private resolver: ComponentFactoryResolver,
    private injector: Injector,
    private app: AppService,
    private config: ConfigService,
    private zone: NgZone
  ) {
    this.init()
  }

  private init(): void {
    // Suppress native profile tree so it doesn't duplicate our professional Session Manager
    if (this.config.store?.showProfileTree) {
      this.config.store.showProfileTree = false
      this.config.save()
    }

    const tryMount = () => {
      const windowEl = document.querySelector('app-root .window') as HTMLElement
      if (!windowEl) return false
      if (windowEl.querySelector('workbench-sidebar')) return true

      this.zone.run(() => {
        try {
          const factory = this.resolver.resolveComponentFactory(WorkbenchSidebarComponent)
          this.sidebarRef = factory.create(this.injector)
          this.appRef.attachView(this.sidebarRef.hostView)

          const domElem = (this.sidebarRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
          windowEl.insertBefore(domElem, windowEl.firstChild)
          windowEl.classList.add('workbench-shell-active')
        } catch (err) {
          console.error('[Workbench] Failed to mount WorkbenchSidebarComponent', err)
        }
      })
      return true
    }

    if (tryMount()) return

    // Observe DOM until .window is ready
    if (typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver(() => {
        if (tryMount()) {
          this.observer?.disconnect()
          this.observer = null
        }
      })
      this.observer.observe(document.body, { childList: true, subtree: true })
    }

    // Interval fallback
    let attempts = 0
    const interval = setInterval(() => {
      attempts++
      if (tryMount() || attempts > 30) {
        clearInterval(interval)
        this.observer?.disconnect()
        this.observer = null
      }
    }, 250)
  }

  destroy(): void {
    if (this.sidebarRef) {
      this.appRef.detachView(this.sidebarRef.hostView)
      this.sidebarRef.destroy()
      this.sidebarRef = null
    }
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  }
}
