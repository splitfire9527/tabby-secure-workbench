import {
  Injectable,
  ApplicationRef,
  ComponentFactoryResolver,
  Injector,
  EmbeddedViewRef,
  ComponentRef,
  NgZone,
  Optional,
} from '@angular/core'
import { AppService, ConfigService, HotkeysService, NotificationsService, TabsService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { WorkbenchSidebarComponent } from './workbench-sidebar.component'
import { WorkbenchGlobalTitleBarComponent } from './workbench-global-title-bar.component'
import { WorkbenchTabBarToolsComponent } from './workbench-tab-bar-tools.component'
import { WorkbenchModalsComponent } from './workbench-modals.component'
import { WorkbenchWelcomeComponent } from './workbench-welcome.component'
import { WorkbenchHomeTabComponent } from './workbench-home-tab.component'
import { WorkbenchSessionOptionsModalComponent } from './workbench-session-options-modal.component'
import { WorkbenchNewSessionModalComponent } from './workbench-new-session-modal.component'
import { WorkbenchQuickSearchModalComponent } from './workbench-quick-search-modal.component'
import { WorkbenchBottomDockComponent } from './workbench-bottom-dock.component'
import { TransferStore } from '../transfer-store/transfer-store'
import { resolveSearchHotkeyDefault, SESSION_SEARCH_HOTKEY_ID } from './hotkey-defaults'

@Injectable({ providedIn: 'root' })
export class WorkbenchHostShellService {
  isWorkbenchMode = true

  dockRef: ComponentRef<WorkbenchBottomDockComponent> | null = null
  private sidebarRef: ComponentRef<WorkbenchSidebarComponent> | null = null
  private titleBarRef: ComponentRef<WorkbenchGlobalTitleBarComponent> | null = null
  private tabBarToolsRef: ComponentRef<WorkbenchTabBarToolsComponent> | null = null
  private modalsRef: ComponentRef<WorkbenchModalsComponent> | null = null
  private sessionOptionsModalRef: ComponentRef<WorkbenchSessionOptionsModalComponent> | null = null
  private newSessionModalRef: ComponentRef<WorkbenchNewSessionModalComponent> | null = null
  private quickSearchModalRef: ComponentRef<WorkbenchQuickSearchModalComponent> | null = null
  private welcomeRef: ComponentRef<WorkbenchWelcomeComponent> | null = null
  private observer: MutationObserver | null = null
  private subs: Subscription[] = []
  private activeTransferStore: TransferStore | null = null
  searchHotkeyNotice = ''

  constructor(
    private appRef: ApplicationRef,
    private resolver: ComponentFactoryResolver,
    private injector: Injector,
    private app: AppService,
    private config: ConfigService,
    private zone: NgZone,
    @Optional() private tabsService?: TabsService,
    @Optional() private transferStore?: TransferStore,
    @Optional() private hotkeys?: HotkeysService,
    @Optional() private notifications?: NotificationsService
  ) {
    if (this.hotkeys?.hotkey$) {
      this.subs.push(
        this.hotkeys.hotkey$.subscribe(id => {
          if (id === SESSION_SEARCH_HOTKEY_ID) this.focusSessionSearch()
        })
      )
    }
    if (this.app.ready$) {
      this.subs.push(
        this.app.ready$.subscribe(() => {
          this.init()
        })
      )
    }
  }

  get isHomeActive(): boolean {
    return (
      this.app?.activeTab instanceof WorkbenchHomeTabComponent ||
      (this.app?.activeTab as any)?.constructor?.name === 'WorkbenchHomeTabComponent'
    )
  }

  ensureHomeTab(): WorkbenchHomeTabComponent | null {
    if (!this.app) return null
    const existing = this.app.tabs?.find(
      (t) =>
        t instanceof WorkbenchHomeTabComponent ||
        (t as any)?.constructor?.name === 'WorkbenchHomeTabComponent'
    ) as WorkbenchHomeTabComponent
    if (existing) {
      return existing
    }

    try {
      let homeTab: WorkbenchHomeTabComponent | null = null
      if (this.tabsService) {
        homeTab = this.tabsService.create({ type: WorkbenchHomeTabComponent }) as WorkbenchHomeTabComponent
      } else if (typeof (this.app as any).openNewTabRaw === 'function') {
        homeTab = (this.app as any).openNewTabRaw({ type: WorkbenchHomeTabComponent })
      }
      if (homeTab) {
        if (!this.app.tabs.includes(homeTab)) {
          this.app.addTabRaw(homeTab, 0)
        }
        return homeTab
      }
    } catch (err) {
      console.warn('[Workbench] Failed to instantiate WorkbenchHomeTabComponent', err)
    }
    return null
  }

  toggleHome(active?: boolean): void {
    const homeTab = this.ensureHomeTab()
    if (active === false) {
      if (this.isHomeActive && this.app.tabs.length > 1) {
        const next = this.app.tabs.find((t) => t !== homeTab)
        if (next) this.app.selectTab(next)
      }
      return
    }
    if (homeTab) {
      this.app.selectTab(homeTab)
    }
    this.updateWelcomeScreen()
  }

  openQuickSearch(): void {
    if (this.quickSearchModalRef) {
      this.quickSearchModalRef.instance.open()
    }
  }

  ensureWorkbenchShellActive(): void {
    if (typeof document === 'undefined') return
    const windowEl = (document.querySelector('app-root .window') ||
      document.querySelector('.window')) as HTMLElement
    if (windowEl && !windowEl.classList.contains('workbench-shell-active')) {
      windowEl.classList.add('workbench-shell-active')
    }
    if (!document.body.classList.contains('workbench-shell-active')) {
      document.body.classList.add('workbench-shell-active')
    }
    const theme = this.config?.store?.secureWorkbench?.frameworkTheme || 'securecrt'
    document.body.setAttribute('data-framework-theme', theme)
    const hideClose = !(this.config?.store?.secureWorkbench?.showTabCloseButton ?? true)
    document.body.setAttribute('data-hide-tab-close', hideClose.toString())
    const hideIndices = !(this.config?.store?.secureWorkbench?.showTabIndices ?? true)
    document.body.setAttribute('data-hide-tab-indices', hideIndices.toString())
  }

  private init(): void {
    this.ensureWorkbenchShellActive()
    if (this.config?.changed$) {
      this.config.changed$.subscribe(() => {
        this.ensureWorkbenchShellActive()
      })
    }
    // Suppress native profile tree so it doesn't duplicate our Session Manager
    if (this.config.store?.showProfileTree) {
      this.config.store.showProfileTree = false
      this.config.save()
    }

    // Initialize tab options attributes on body
    if (typeof document !== 'undefined') {
      const hideClose = !(this.config.store?.secureWorkbench?.showTabCloseButton ?? true)
      document.body.setAttribute('data-hide-tab-close', hideClose.toString())

      const hideIndices = !(this.config.store?.secureWorkbench?.showTabIndices ?? true)
      document.body.setAttribute('data-hide-tab-indices', hideIndices.toString())
    }

    const tryMount = () => {
      const windowEl = (document.querySelector('app-root .window') ||
        document.querySelector('.window')) as HTMLElement
      if (!windowEl) return false

      if (
        document.querySelector('workbench-global-title-bar') &&
        document.querySelector('workbench-sidebar') &&
        document.querySelector('workbench-tab-bar-tools') &&
        document.querySelector('workbench-modals') &&
        document.querySelector('workbench-session-options-modal') &&
        document.querySelector('workbench-new-session-modal') &&
        document.querySelector('workbench-quick-search-modal')
      ) {
        return true
      }

      this.zone.run(() => {
        try {
          // 1. Global Title Bar (clean, centered, no mode toggle)
          if (!document.querySelector('workbench-global-title-bar')) {
            const titleFactory = this.resolver.resolveComponentFactory(WorkbenchGlobalTitleBarComponent)
            this.titleBarRef = titleFactory.create(this.injector)
            this.appRef.attachView(this.titleBarRef.hostView)
            const titleDomElem = (this.titleBarRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
            windowEl.insertBefore(titleDomElem, windowEl.firstChild)
          }

          // 2. Activity Bar + Drawer Sidebar
          if (!document.querySelector('workbench-sidebar')) {
            const sidebarFactory = this.resolver.resolveComponentFactory(WorkbenchSidebarComponent)
            this.sidebarRef = sidebarFactory.create(this.injector)
            this.sidebarRef.instance.cdr = this.sidebarRef.changeDetectorRef
            this.appRef.attachView(this.sidebarRef.hostView)
            const sidebarDomElem = (this.sidebarRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
            windowEl.appendChild(sidebarDomElem)
          }

          // 3. Tab Bar Tools (Home 🏠 and Local Terminal 💻 icons)
          if (!this.tabBarToolsRef) {
            const toolsFactory = this.resolver.resolveComponentFactory(WorkbenchTabBarToolsComponent)
            this.tabBarToolsRef = toolsFactory.create(this.injector)
            this.appRef.attachView(this.tabBarToolsRef.hostView)
          }
          const tabBar = document.querySelector('.tab-bar')
          if (tabBar && !tabBar.querySelector('workbench-tab-bar-tools')) {
            const toolsDom = (this.tabBarToolsRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
            tabBar.insertBefore(toolsDom, tabBar.firstChild)
          }

          // 4. Modals (Settings & About)
          if (!document.querySelector('workbench-modals')) {
            const modalsFactory = this.resolver.resolveComponentFactory(WorkbenchModalsComponent)
            this.modalsRef = modalsFactory.create(this.injector)
            this.appRef.attachView(this.modalsRef.hostView)
            const modalsDomElem = (this.modalsRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
            windowEl.appendChild(modalsDomElem)
          }

          // 5. Session Options Modal
          if (!document.querySelector('workbench-session-options-modal')) {
            const soFactory = this.resolver.resolveComponentFactory(WorkbenchSessionOptionsModalComponent)
            this.sessionOptionsModalRef = soFactory.create(this.injector)
            this.appRef.attachView(this.sessionOptionsModalRef.hostView)
            const soDomElem = (this.sessionOptionsModalRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
            windowEl.appendChild(soDomElem)
          }

          // 6. Unified New/Edit Session Modal (Templates + Dynamic Parameters)
          if (!document.querySelector('workbench-new-session-modal')) {
            const nsFactory = this.resolver.resolveComponentFactory(WorkbenchNewSessionModalComponent)
            this.newSessionModalRef = nsFactory.create(this.injector)
            this.appRef.attachView(this.newSessionModalRef.hostView)
            const nsDomElem = (this.newSessionModalRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
            windowEl.appendChild(nsDomElem)
          }

          // 7. Global Quick Connect Search Modal (Double Shift / Ctrl+Shift+P)
          if (!document.querySelector('workbench-quick-search-modal')) {
            const qsFactory = this.resolver.resolveComponentFactory(WorkbenchQuickSearchModalComponent)
            this.quickSearchModalRef = qsFactory.create(this.injector)
            this.appRef.attachView(this.quickSearchModalRef.hostView)
            const qsDomElem = (this.quickSearchModalRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
            windowEl.appendChild(qsDomElem)
          }

          // 8. Global Bottom Dock (Transfer Queue spanning 100% full width of workspace)
          const mainContent = (document.querySelector('app-root .content.main') ||
            document.querySelector('.content.main')) as HTMLElement
          if (mainContent && !document.querySelector('.content.main > workbench-bottom-dock')) {
            const dockFactory = this.resolver.resolveComponentFactory(WorkbenchBottomDockComponent)
            this.dockRef = dockFactory.create(this.injector)
            this.dockRef.instance.store = (this.activeTransferStore || this.transferStore) as TransferStore
            this.dockRef.instance.height = this.config?.store?.secureWorkbench?.transferQueueHeight || 140
            this.dockRef.instance.isExpanded = false
            this.appRef.attachView(this.dockRef.hostView)
            const dockDom = (this.dockRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
            mainContent.appendChild(dockDom)
          }

          windowEl.classList.add('workbench-shell-active')
          document.body.classList.add('workbench-shell-active')
        } catch (err) {
          console.error('[Workbench] Failed to mount Workbench components', err)
        }
      })
      return true
    }

    if (tryMount()) {
      setTimeout(() => this.updateWelcomeScreen(), 100)
    } else {
      // Observe DOM until .window is ready
      if (typeof MutationObserver !== 'undefined') {
        this.observer = new MutationObserver(() => {
          if (tryMount()) {
            setTimeout(() => this.updateWelcomeScreen(), 100)
            this.observer?.disconnect()
            this.observer = null
          }
        })
        this.observer.observe(document.body, { childList: true, subtree: true })
      }
    }

    // Subscribe to tab events
    if (this.app.activeTabChange$) {
      this.subs.push(
        this.app.activeTabChange$.subscribe(() => {
          this.syncActiveTabStore()
          this.ensureWorkbenchShellActive()
          setTimeout(() => this.updateWelcomeScreen(), 80)
        })
      )
    }
    if (this.app.tabsChanged$) {
      this.subs.push(
        this.app.tabsChanged$.subscribe(() => {
          this.ensureWorkbenchShellActive()
          setTimeout(() => this.updateWelcomeScreen(), 80)
        })
      )
    }
    if (this.app.tabClosed$) {
      this.subs.push(
        this.app.tabClosed$.subscribe(() => {
          this.ensureWorkbenchShellActive()
          setTimeout(() => this.updateWelcomeScreen(), 80)
        })
      )
    }
    if (this.app.tabOpened$) {
      this.subs.push(
        this.app.tabOpened$.subscribe(() => {
          this.ensureWorkbenchShellActive()
          setTimeout(() => this.updateWelcomeScreen(), 80)
        })
      )
    }
    this.reconcileSearchHotkey()
  }

  bindActiveTransferStore(store: TransferStore | null): void {
    this.activeTransferStore = store
    if (this.dockRef) this.dockRef.instance.bindStore(store)
  }

  syncActiveTabStore(): void {
    const active = this.app?.activeTab as any
    const focused = typeof active?.getFocusedTab === 'function' ? active.getFocusedTab() : active
    const store: TransferStore | null =
      focused?.__workbenchTransferStore || active?.__workbenchTransferStore || null
    if (store !== this.activeTransferStore) this.bindActiveTransferStore(store)
  }

  releaseTransferStore(store: TransferStore): void {
    if (this.activeTransferStore === store) this.bindActiveTransferStore(null)
  }

  reconcileSearchHotkey(): string[] {
    const store = this.config?.store
    if (!store) return []
    if (!store.hotkeys) store.hotkeys = {}
    const resolved = resolveSearchHotkeyDefault(store.hotkeys)
    if (resolved.length === 0) {
      store.hotkeys[SESSION_SEARCH_HOTKEY_ID] = []
      this.searchHotkeyNotice = 'Alt+C 已被其他热键占用，会话搜索未绑定。'
      this.notifications?.notice?.(this.searchHotkeyNotice)
    }
    return resolved
  }

  focusSessionSearch(): boolean {
    const input = document.querySelector('.search-input') as HTMLElement | null
    if (input && typeof input.focus === 'function') {
      input.focus()
      return true
    }
    return false
  }

  updateWelcomeScreen(): void {
    const homeTab = this.ensureHomeTab()
    const hasTabs = this.app.tabs && this.app.tabs.length > 0
    const activeTabIsStart = !this.app.activeTab || (this.app.activeTab as any).constructor?.name === 'StartPageTabComponent'

    if (activeTabIsStart && homeTab) {
      this.app.selectTab(homeTab)
    }

    const mainContent = (document.querySelector('app-root .content.main') ||
      document.querySelector('.content.main')) as HTMLElement
    const startPage = document.querySelector('start-page') as HTMLElement
    if (startPage) {
      startPage.style.display = 'none'
    }

    // Ensure tab-bar tools are attached
    const tabBar = document.querySelector('.tab-bar')
    if (tabBar && !tabBar.querySelector('workbench-tab-bar-tools')) {
      if (!this.tabBarToolsRef) {
        const toolsFactory = this.resolver.resolveComponentFactory(WorkbenchTabBarToolsComponent)
        this.tabBarToolsRef = toolsFactory.create(this.injector)
        this.appRef.attachView(this.tabBarToolsRef.hostView)
      }
      const toolsDom = (this.tabBarToolsRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
      tabBar.insertBefore(toolsDom, tabBar.firstChild)
    }

    // Ensure bottom dock is attached to mainContent
    if (mainContent) {
      if (!this.dockRef) {
        try {
          const dockFactory = this.resolver.resolveComponentFactory(WorkbenchBottomDockComponent)
          this.dockRef = dockFactory.create(this.injector)
          this.dockRef.instance.store = (this.activeTransferStore || this.transferStore) as TransferStore
          this.dockRef.instance.height = this.config?.store?.secureWorkbench?.transferQueueHeight || 140
          this.dockRef.instance.isExpanded = false
          this.appRef.attachView(this.dockRef.hostView)
          const dockDom = (this.dockRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
          mainContent.appendChild(dockDom)
        } catch (err) {
          console.warn('[Workbench] Failed to mount global bottom dock', err)
        }
      } else {
        const dockDom = (this.dockRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
        if (dockDom && !mainContent.contains(dockDom)) {
          mainContent.appendChild(dockDom)
        }
      }
    }
  }

  toggleTransferQueue(): void {
    if (this.dockRef) {
      this.dockRef.instance.isExpanded = !this.dockRef.instance.isExpanded
      try {
        this.dockRef.changeDetectorRef.detectChanges()
      } catch {}
    }
  }

  setTransferQueueExpanded(expanded: boolean): void {
    if (this.dockRef) {
      this.dockRef.instance.isExpanded = expanded
      try {
        this.dockRef.changeDetectorRef.detectChanges()
      } catch {}
    }
  }

  destroy(): void {
    this.subs.forEach((s) => s.unsubscribe())
    this.subs = []

    if (this.dockRef) {
      this.appRef.detachView(this.dockRef.hostView)
      this.dockRef.destroy()
      this.dockRef = null
    }
    if (this.titleBarRef) {
      this.appRef.detachView(this.titleBarRef.hostView)
      this.titleBarRef.destroy()
      this.titleBarRef = null
    }
    if (this.sidebarRef) {
      this.appRef.detachView(this.sidebarRef.hostView)
      this.sidebarRef.destroy()
      this.sidebarRef = null
    }
    if (this.tabBarToolsRef) {
      this.appRef.detachView(this.tabBarToolsRef.hostView)
      this.tabBarToolsRef.destroy()
      this.tabBarToolsRef = null
    }
    if (this.modalsRef) {
      this.appRef.detachView(this.modalsRef.hostView)
      this.modalsRef.destroy()
      this.modalsRef = null
    }
    if (this.sessionOptionsModalRef) {
      this.appRef.detachView(this.sessionOptionsModalRef.hostView)
      this.sessionOptionsModalRef.destroy()
      this.sessionOptionsModalRef = null
    }
    if (this.newSessionModalRef) {
      this.appRef.detachView(this.newSessionModalRef.hostView)
      this.newSessionModalRef.destroy()
      this.newSessionModalRef = null
    }
    if (this.quickSearchModalRef) {
      this.appRef.detachView(this.quickSearchModalRef.hostView)
      this.quickSearchModalRef.destroy()
      this.quickSearchModalRef = null
    }
    if (this.welcomeRef) {
      this.appRef.detachView(this.welcomeRef.hostView)
      this.welcomeRef.destroy()
      this.welcomeRef = null
    }
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  }
}
