import {
  Injectable,
  NgZone,
  ComponentFactoryResolver,
  ApplicationRef,
  Injector,
  EmbeddedViewRef,
  ComponentRef,
} from '@angular/core'
import { TerminalDecorator, BaseTerminalTabComponent } from 'tabby-terminal'
import { AppService, ConfigService, ProfilesService, NotificationsService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { TransferStore } from '../transfer-store/transfer-store'
import { WorkbenchShellComponent } from './workbench-shell.component'
import { WorkbenchHeaderComponent } from './workbench-header.component'
import { WorkbenchSftpPaneComponent } from './workbench-sftp-pane.component'
import { WorkbenchBottomDockComponent } from './workbench-bottom-dock.component'

const WORKBENCH_SESSION_BAR_CLASS = 'workbench-decorated-session-bar'
const WORKBENCH_STATUS_BAR_CLASS = 'workbench-decorated-status-bar'

interface TabMountedComponents {
  headerRef: ComponentRef<WorkbenchHeaderComponent>
  sftpRef: ComponentRef<WorkbenchSftpPaneComponent>
  dockRef: ComponentRef<WorkbenchBottomDockComponent>
  statusEl: HTMLElement
}

@Injectable()
export class WorkbenchTerminalDecorator extends TerminalDecorator {
  private tabSubs = new WeakMap<BaseTerminalTabComponent, Subscription[]>()
  private tabStores = new WeakMap<BaseTerminalTabComponent, TransferStore>()
  private tabMounted = new WeakMap<BaseTerminalTabComponent, TabMountedComponents>()

  constructor(
    private app: AppService,
    private zone: NgZone,
    private config: ConfigService,
    private injector: Injector,
    private resolver: ComponentFactoryResolver,
    private appRef: ApplicationRef,
    private profilesService: ProfilesService,
    private notifications: NotificationsService
  ) {
    super()
  }

  override attach(tab: BaseTerminalTabComponent): void {
    if ((tab as any) instanceof WorkbenchShellComponent) {
      return
    }

    const store = new TransferStore()
    this.tabStores.set(tab, store)
    ;(tab as any).__workbenchTransferStore = store
    ;(tab as any).__workbenchStore = store

    const subs: Subscription[] = []

    const tryDecorateTab = () => {
      try {
        const host = tab.element?.nativeElement as HTMLElement
        if (!host) return false
        if (host.querySelector(`.${WORKBENCH_SESSION_BAR_CLASS}`)) return true

        const container =
          host.querySelector('.terminal-container') ||
          host.querySelector('terminal-container') ||
          host
        if (!container) return false

        // Ensure host is flex column
        host.style.display = 'flex'
        host.style.flexDirection = 'column'
        host.style.height = '100%'
        host.style.overflow = 'hidden'

        // Hide native Tabby floating/pinned toolbar so our header toolbar is the single unified bar
        const nativeToolbar = host.querySelector('terminal-toolbar') as HTMLElement
        if (nativeToolbar) nativeToolbar.style.display = 'none'
        const nativeToolbarSpacer = host.querySelector('.terminal-toolbar-spacer') as HTMLElement
        if (nativeToolbarSpacer) nativeToolbarSpacer.style.display = 'none'

        const termContent = (host.querySelector('.content') ||
          host.querySelector('.terminal-container') ||
          host.querySelector('terminal-container') ||
          container) as HTMLElement
        if (termContent) {
          termContent.style.flex = '1 1 0'
          termContent.style.minHeight = '0'
        }

        // 1. Mount WorkbenchHeaderComponent at the top
        const headerFactory = this.resolver.resolveComponentFactory(WorkbenchHeaderComponent)
        const headerRef = headerFactory.create(this.injector)
        headerRef.instance.activeTerminalTab = tab
        headerRef.instance.activeProfile = (tab as any).profile || null
        headerRef.instance.viewMode = 'pty'
        this.appRef.attachView(headerRef.hostView)

        const headerDom = (headerRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
        headerDom.classList.add(WORKBENCH_SESSION_BAR_CLASS)
        host.insertBefore(headerDom, host.firstChild)

        // 2. Mount WorkbenchBottomDockComponent (Transfer Queue Dock)
        const dockFactory = this.resolver.resolveComponentFactory(WorkbenchBottomDockComponent)
        const dockRef = dockFactory.create(this.injector)
        dockRef.instance.store = store
        dockRef.instance.height = 140
        dockRef.instance.isExpanded = false // Initially hidden as per DESIGN.md §4.3
        this.appRef.attachView(dockRef.hostView)

        const dockDom = (dockRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
        ;(dockDom as any).__workbenchStore = store
        ;(host as any).__workbenchStore = store
        host.appendChild(dockDom)

        // 3. Mount WorkbenchSftpPaneComponent (inserted BEFORE dockDom)
        const sftpFactory = this.resolver.resolveComponentFactory(WorkbenchSftpPaneComponent)
        const sftpRef = sftpFactory.create(this.injector)
        sftpRef.instance.store = store
        sftpRef.instance.activeTab = tab
        this.appRef.attachView(sftpRef.hostView)

        const sftpDom = (sftpRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
        sftpDom.style.display = 'none' // Initially hidden, toggled via viewMode
        sftpDom.style.flex = '1 1 0'
        sftpDom.style.minHeight = '0'
        host.insertBefore(sftpDom, dockDom)

        // 4. Create Bottom Status Bar
        const statusEl = document.createElement('div')
        statusEl.className = `${WORKBENCH_STATUS_BAR_CLASS} workbench-status-bar d-flex align-items-center justify-content-between px-3`
        statusEl.style.height = '24px'
        statusEl.style.minHeight = '24px'
        statusEl.style.background = '#181a1f'
        statusEl.style.borderTop = '1px solid #282c34'
        statusEl.style.fontSize = '11px'
        statusEl.style.color = '#abb2bf'
        statusEl.style.userSelect = 'none'
        statusEl.style.flexShrink = '0'

        let rows = tab.size?.rows || 36
        let cols = tab.size?.columns || 118
        const cipher = (tab as any).session?.sshSession?.cipher || 'ssh2: aes256-gcm'

        const renderStatusContent = (running: number, succeeded: number, failed: number) => {
          statusEl.innerHTML = `
            <div class="d-flex align-items-center gap-2">
              <span class="status-ready-dot" style="width: 6px; height: 6px; border-radius: 50%; background: #98c379; display: inline-block;"></span>
              <span class="status-ready-text" style="color: #98c379; font-weight: 500;">Ready</span>
            </div>
            <div class="d-flex align-items-center gap-3">
              <span class="status-item text-muted" style="border-left: 1px solid rgba(62,68,81,0.6); padding-left: 8px;">${cipher}</span>
              <span class="status-item text-muted" style="border-left: 1px solid rgba(62,68,81,0.6); padding-left: 8px;">${rows} Rows, ${cols} Cols</span>
              <span class="status-item text-muted" style="border-left: 1px solid rgba(62,68,81,0.6); padding-left: 8px;">Xterm</span>
              <span class="status-item transfer-pill font-weight-bold" data-action="toggle-dock" style="border-left: 1px solid rgba(62,68,81,0.6); padding-left: 8px; color: #e5c07b; cursor: pointer;" title="点击展开/收起传输队列抽屉">
                ⚡ 传输中: <strong>${running}</strong> | 完成: <strong style="color: #98c379;">${succeeded}</strong> | 失败: <strong style="color: #e06c75;">${failed}</strong>
              </span>
            </div>
          `
        }

        renderStatusContent(0, 0, 0)
        host.appendChild(statusEl)

        // Transfer pill click directly toggles the Bottom Dock expansion!
        statusEl.addEventListener('click', (ev) => {
          const target = (ev.target as HTMLElement)?.closest?.('[data-action="toggle-dock"]')
          if (target) {
            ev.preventDefault()
            ev.stopPropagation()
            this.zone.run(() => {
              dockRef.instance.isExpanded = !dockRef.instance.isExpanded
              try {
                dockRef.changeDetectorRef.detectChanges()
              } catch {}
            })
          }
        })

        // View Mode Switch Handler
        const switchViewMode = (mode: 'pty' | 'sftp') => {
          this.zone.run(() => {
            headerRef.instance.viewMode = mode
            try {
              headerRef.changeDetectorRef.detectChanges()
            } catch {}

            if (mode === 'sftp') {
              if (termContent) termContent.style.display = 'none'
              if (nativeToolbar) nativeToolbar.style.display = 'none'
              if (nativeToolbarSpacer) nativeToolbarSpacer.style.display = 'none'
              sftpDom.style.display = 'flex'
              sftpRef.instance.loadLocalFiles()
              sftpRef.instance.loadRemoteFiles()
            } else {
              sftpDom.style.display = 'none'
              if (termContent) termContent.style.display = ''
              if (typeof (tab as any).frontend?.focus === 'function') {
                ;(tab as any).frontend.focus()
              }
            }
          })
        }

        subs.push(headerRef.instance.viewModeChange.subscribe((mode) => switchViewMode(mode)))
        subs.push(sftpRef.instance.backToTerminal.subscribe(() => switchViewMode('pty')))

        // Quick Connect
        subs.push(
          headerRef.instance.quickConnect.subscribe(async (ev) => {
            try {
              const q = `${ev.user}@${ev.host}:${ev.port}`
              const p = await this.profilesService.quickConnect(q)
              if (p) {
                await this.profilesService.openNewTabForProfile(p)
              }
            } catch (err) {
              console.warn('[Workbench] Quick connect failed', err)
            }
          })
        )

        // Bottom Dock expansion events
        subs.push(
          dockRef.instance.isExpandedChange.subscribe((isExp) => {
            this.zone.run(() => {
              dockRef.instance.isExpanded = isExp
              try {
                dockRef.changeDetectorRef.detectChanges()
              } catch {}
            })
          })
        )

        // TransferStore summary updates & autoExpand on running transfer
        subs.push(
          store.summary$.subscribe((summary) => {
            this.zone.run(() => {
              renderStatusContent(summary.running, summary.succeeded, summary.failed)
              if (summary.running > 0 && !dockRef.instance.isExpanded) {
                dockRef.instance.isExpanded = true
                try {
                  dockRef.changeDetectorRef.detectChanges()
                } catch {}
              }
            })
          })
        )

        // Tab Resizing
        if (tab.frontend?.resize$) {
          subs.push(
            tab.frontend.resize$.subscribe((sz: any) => {
              if (sz?.rows) rows = sz.rows
              if (sz?.columns) cols = sz.columns
              const cur = store.getSummary()
              renderStatusContent(cur.running, cur.succeeded, cur.failed)
            })
          )
        }

        // Tab Title Change
        if (tab.titleChange$) {
          subs.push(
            tab.titleChange$.subscribe(() => {
              try {
                headerRef.changeDetectorRef.detectChanges()
              } catch {}
            })
          )
        }

        this.tabMounted.set(tab, { headerRef, sftpRef, dockRef, statusEl })
        return true
      } catch (err) {
        console.warn('[Workbench] Error decorating terminal tab', err)
        return false
      }
    }

    let attempts = 0
    const timer = setInterval(() => {
      attempts++
      if (tryDecorateTab() || attempts > 20) {
        clearInterval(timer)
      }
    }, 200)

    this.tabSubs.set(tab, subs)
  }

  override detach(tab: BaseTerminalTabComponent): void {
    const subs = this.tabSubs.get(tab)
    if (subs) {
      subs.forEach((s) => s.unsubscribe())
      this.tabSubs.delete(tab)
    }

    const store = this.tabStores.get(tab)
    if (store) {
      store.destroy()
      this.tabStores.delete(tab)
    }

    const mounted = this.tabMounted.get(tab)
    if (mounted) {
      try {
        this.appRef.detachView(mounted.headerRef.hostView)
        mounted.headerRef.destroy()
      } catch {}

      try {
        this.appRef.detachView(mounted.sftpRef.hostView)
        mounted.sftpRef.destroy()
      } catch {}

      try {
        this.appRef.detachView(mounted.dockRef.hostView)
        mounted.dockRef.destroy()
      } catch {}

      try {
        mounted.statusEl.remove()
      } catch {}

      this.tabMounted.delete(tab)
    }

    try {
      const host = tab.element?.nativeElement as HTMLElement
      if (host) {
        host.querySelector(`.${WORKBENCH_SESSION_BAR_CLASS}`)?.remove()
        host.querySelector(`.${WORKBENCH_STATUS_BAR_CLASS}`)?.remove()
      }
    } catch {}
  }
}
