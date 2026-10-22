import {
  Injectable,
  NgZone,
  ComponentFactoryResolver,
  ApplicationRef,
  Injector,
  EmbeddedViewRef,
  ComponentRef,
  Optional,
  Inject,
  forwardRef,
} from '@angular/core'
import { TerminalDecorator, BaseTerminalTabComponent } from 'tabby-terminal'
import { AppService, ConfigService, ProfilesService, NotificationsService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { throttleTime } from 'rxjs/operators'
import { TransferStore } from '../transfer-store/transfer-store'
import { DirectoryPair } from '../sftp-plus/directory-pair.model'
import { WorkbenchShellComponent } from './workbench-shell.component'
import { WorkbenchHeaderComponent } from './workbench-header.component'
import { WorkbenchSftpPaneComponent } from './workbench-sftp-pane.component'
import { WorkbenchBottomDockComponent } from './workbench-bottom-dock.component'
import { SessionLoggerService } from '../session-logging/session-logger.service'
import { WorkbenchHostShellService } from './workbench-host-shell.service'
import { WorkbenchSessionConfigService } from '../config/workbench-session-config.service'
import {
  devicePixelDelta,
  parseDesktopMonospace,
  replacementFontFamily,
  snapFontSize,
  solidifyLightTheme,
} from './terminal-sharpness'

const WORKBENCH_SESSION_BAR_CLASS = 'workbench-decorated-session-bar'
const WORKBENCH_STATUS_BAR_CLASS = 'workbench-decorated-status-bar'

interface TabMountedComponents {
  headerRef: ComponentRef<WorkbenchHeaderComponent>
  sftpRef: ComponentRef<WorkbenchSftpPaneComponent>
  dockRef?: ComponentRef<WorkbenchBottomDockComponent>
  statusEl: HTMLElement
  cleanup?: () => void
}

@Injectable()
export class WorkbenchTerminalDecorator extends TerminalDecorator {
  private tabSubs = new WeakMap<BaseTerminalTabComponent, Subscription[]>()
  private tabStores = new WeakMap<BaseTerminalTabComponent, TransferStore>()
  private tabMounted = new WeakMap<BaseTerminalTabComponent, TabMountedComponents>()
  private tabTimers = new WeakMap<BaseTerminalTabComponent, any>()
  private tabAligners = new WeakMap<BaseTerminalTabComponent, () => void>()
  private sharpening = new WeakSet<BaseTerminalTabComponent>()
  private desktopFont: string | null = null
  private desktopFontResolved = false

  constructor(
    private app: AppService,
    private zone: NgZone,
    private config: ConfigService,
    private injector: Injector,
    private resolver: ComponentFactoryResolver,
    private appRef: ApplicationRef,
    private profilesService: ProfilesService,
    private notifications: NotificationsService,
    private loggerService: SessionLoggerService,
    @Optional() @Inject(forwardRef(() => WorkbenchHostShellService)) private hostShell?: WorkbenchHostShellService,
    @Optional() private sessionConfig?: WorkbenchSessionConfigService
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
    const active = this.app?.activeTab as any
    const focused = typeof active?.getFocusedTab === 'function' ? active.getFocusedTab() : active
    if (!active || active === tab || focused === tab) {
      this.hostShell?.bindActiveTransferStore(store)
    }

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
          termContent.style.minWidth = '0'
          termContent.style.position = 'relative'
          termContent.style.overflow = 'hidden'
          this.installTerminalSharpness(tab, termContent)
        }

        // Focus guard to prevent terminal from stealing focus when user types in inputs
        const guardFrontendFocus = () => {
          if (tab.frontend && !(tab.frontend as any).__workbenchFocusGuarded) {
            ;(tab.frontend as any).__workbenchFocusGuarded = true
            const origFocus = tab.frontend.focus.bind(tab.frontend)
            tab.frontend.focus = () => {
              const active = typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null
              if (
                active &&
                (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) ||
                  active.isContentEditable ||
                  !!active.closest?.('.workbench-sftp-container'))
              ) {
                return
              }
              origFocus()
            }
          }
        }
        guardFrontendFocus()
        if (tab.frontendReady$) {
          subs.push(tab.frontendReady$.subscribe(() => {
            guardFrontendFocus()
            if (termContent) this.installTerminalSharpness(tab, termContent)
          }))
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

        // 2. Global Bottom Dock reference
        const dockRef = this.hostShell?.dockRef || null

        // 3. Mount WorkbenchSftpPaneComponent
        const sftpFactory = this.resolver.resolveComponentFactory(WorkbenchSftpPaneComponent)
        const sftpRef = sftpFactory.create(this.injector)
        sftpRef.instance.store = store
        sftpRef.instance.activeTab = tab
        this.appRef.attachView(sftpRef.hostView)

        const sftpDom = (sftpRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
        sftpDom.style.display = 'none' // Initially hidden
        sftpDom.style.flex = '1 1 0'
        sftpDom.style.minHeight = '0'

        // Wrap termContent and sftpDom in a flex split wrapper to support bottom, right, full, undock
        const splitWrapper = document.createElement('div')
        splitWrapper.className = 'workbench-tab-split-wrapper'
        splitWrapper.style.display = 'flex'
        splitWrapper.style.flexDirection = 'column'
        splitWrapper.style.flex = '1 1 0'
        splitWrapper.style.minHeight = '0'
        splitWrapper.style.minWidth = '0'
        splitWrapper.style.position = 'relative'
        splitWrapper.style.overflow = 'hidden'

        host.appendChild(splitWrapper)
        splitWrapper.appendChild(termContent)
        splitWrapper.appendChild(sftpDom)

        // 4. Create Bottom Status Bar (28px height, prominent pill styling)
        const statusEl = document.createElement('div')
        statusEl.className = `${WORKBENCH_STATUS_BAR_CLASS} workbench-status-bar d-flex align-items-center justify-content-between px-3`
        statusEl.style.height = '28px'
        statusEl.style.minHeight = '28px'
        statusEl.style.maxHeight = '28px'
        statusEl.style.background = '#f0f2f5'
        statusEl.style.borderTop = '1px solid #d0d4dc'
        statusEl.style.fontSize = '12px'
        statusEl.style.color = '#333333'
        statusEl.style.userSelect = 'none'
        statusEl.style.flexShrink = '0'

        let rows = tab.size?.rows || 36
        let cols = tab.size?.columns || 118
        const cipher = (tab as any).session?.sshSession?.cipher || 'ssh2: aes256-gcm'

        const renderStatusContent = (running: number, succeeded: number, failed: number) => {
          const isOpen = (tab as any).session ? (tab as any).session.open === true : false
          const isConnecting = (tab as any).session && !isOpen && !(tab as any).session.closed && !(tab as any).session.destroyed
          const statusText = isOpen ? '就绪' : (isConnecting ? '连接中' : '已断开')
          const statusBg = isOpen ? 'rgba(22, 101, 52, 0.12)' : (isConnecting ? 'rgba(30, 64, 175, 0.12)' : 'rgba(185, 28, 28, 0.12)')
          const statusColor = isOpen ? '#166534' : (isConnecting ? '#1e40af' : '#b91c1c')
          const statusBorder = isOpen ? '1px solid rgba(22, 101, 52, 0.35)' : (isConnecting ? '1px solid rgba(30, 64, 175, 0.35)' : '1px solid rgba(185, 28, 28, 0.35)')
          const dotBg = isOpen ? '#166534' : (isConnecting ? '#1e40af' : '#b91c1c')
          const dotShadow = isOpen ? '0 0 4px rgba(22, 101, 52, 0.5)' : (isConnecting ? '0 0 4px rgba(30, 64, 175, 0.5)' : '0 0 4px rgba(185, 28, 28, 0.5)')

          try {
            if (typeof document !== 'undefined') {
              const activeHeader = document.querySelector('tab-header.active') as HTMLElement
              if (activeHeader && (this.app.activeTab === tab || (this.app.activeTab as any)?.getFocusedTab?.() === tab)) {
                activeHeader.setAttribute('data-connection-state', isOpen ? 'connected' : (isConnecting ? 'connecting' : 'disconnected'))
              }
            }
          } catch {}

          statusEl.innerHTML = `
            <div class="d-flex align-items-center gap-2">
              <span class="status-pill ${isOpen ? 'status-ready' : (isConnecting ? 'status-connecting' : 'status-disconnected')}" style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; background: ${statusBg}; color: ${statusColor}; border: ${statusBorder};">
                <span class="status-ready-dot" style="width: 6px; height: 6px; border-radius: 50%; background: ${dotBg}; display: inline-block; margin-right: 5px; box-shadow: ${dotShadow};"></span>
                <span class="status-ready-text">${statusText}</span>
              </span>
            </div>
            <div class="d-flex align-items-center gap-3">
              <span class="status-item" style="border-left: 1px solid #d0d4dc; padding-left: 8px; color: #333333; font-size: 12px;">${cipher}</span>
              <span class="status-item" style="border-left: 1px solid #d0d4dc; padding-left: 8px; color: #333333; font-size: 12px;">${rows} 行, ${cols} 列</span>
              <span class="status-item" style="border-left: 1px solid #d0d4dc; padding-left: 8px; color: #333333; font-size: 12px;">Xterm</span>
              <span class="status-pill transfer-pill" data-action="toggle-dock" style="display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; background: rgba(30, 64, 175, 0.08); border: 1px solid rgba(30, 64, 175, 0.25); color: #1e40af; cursor: pointer;" title="点击展开/收起传输队列抽屉">
                ⚡ 传输: <strong>${running}</strong> | 完成: <strong style="color: #166534;">${succeeded}</strong> | 失败: <strong style="color: #b91c1c;">${failed}</strong>
              </span>
            </div>
          `
        }

        renderStatusContent(0, 0, 0)
        host.appendChild(statusEl)

        // Transfer pill click directly toggles the Bottom Dock expansion!
        const onStatusClick = (ev: MouseEvent) => {
          const target = (ev.target as HTMLElement)?.closest?.('[data-action="toggle-dock"]')
          if (target) {
            ev.preventDefault()
            ev.stopPropagation()
            this.zone.run(() => {
              if (this.hostShell) {
                this.hostShell.toggleTransferQueue()
              } else if (dockRef) {
                dockRef.instance.isExpanded = !dockRef.instance.isExpanded
                try {
                  dockRef.changeDetectorRef.detectChanges()
                } catch {}
              }
            })
          }
        }
        statusEl.addEventListener('click', onStatusClick)

        // Dock Mode and Visibility Layout Manager
        const shouldAutoOpenSftpFull = !!(
          (tab as any).__autoOpenSftpFull ||
          (tab as any).profile?.__autoOpenSftpFull ||
          (tab as any).profile?.options?.__autoOpenSftpFull
        )
        const shouldAutoOpenSftpRight = !!(
          (tab as any).__autoOpenSftpRight ||
          (tab as any).profile?.__autoOpenSftpRight ||
          (tab as any).profile?.options?.__autoOpenSftpRight
        )
        const preferredDockMode = this.sessionConfig?.getSessionConfig((tab as any).profile)?.sftp?.preferredDockMode || 'bottom'
        const autoOpenSftp = !!this.sessionConfig?.getSessionConfig((tab as any).profile)?.sftp?.autoOpenSFTP
        let currentDockMode: 'bottom' | 'right' | 'full' | 'undock' = shouldAutoOpenSftpFull
          ? 'full'
          : (shouldAutoOpenSftpRight ? 'right' : preferredDockMode)
        let sftpVisible = shouldAutoOpenSftpFull || shouldAutoOpenSftpRight || autoOpenSftp

        const openPreferredSftp = () => {
          currentDockMode = this.sessionConfig?.getSessionConfig((tab as any).profile)?.sftp?.preferredDockMode || preferredDockMode
          sftpVisible = true
          applyDockLayout()
        }

        ;(tab as any).__openSftpPreferred = () => {
          this.zone.run(() => openPreferredSftp())
        }

        ;(tab as any).__openSftpFull = () => {
          this.zone.run(() => {
            currentDockMode = 'full'
            sftpVisible = true
            applyDockLayout()
          })
        }

        ;(tab as any).__openSftpRight = () => {
          this.zone.run(() => {
            currentDockMode = 'right'
            sftpVisible = true
            applyDockLayout()
          })
        }

        ;(tab as any).__openSftpBottom = () => {
          this.zone.run(() => {
            currentDockMode = 'bottom'
            sftpVisible = true
            applyDockLayout()
          })
        }

        // Draggable Undock State
        let undockLeft = -1
        let undockTop = -1
        let isDraggingUndock = false
        let dragStartX = 0
        let dragStartY = 0
        let dragStartLeft = 0
        let dragStartTop = 0

        const onDocMouseMove = (e: MouseEvent) => {
          if (!isDraggingUndock) return
          const dx = e.clientX - dragStartX
          const dy = e.clientY - dragStartY
          const parentRect = splitWrapper.getBoundingClientRect()
          const maxLeft = Math.max(0, parentRect.width - sftpDom.offsetWidth)
          const maxTop = Math.max(0, parentRect.height - sftpDom.offsetHeight)
          undockLeft = Math.min(Math.max(0, dragStartLeft + dx), maxLeft)
          undockTop = Math.min(Math.max(0, dragStartTop + dy), maxTop)
          sftpDom.style.left = `${undockLeft}px`
          sftpDom.style.top = `${undockTop}px`
          sftpDom.style.right = 'auto'
        }

        const onDocMouseUp = () => {
          isDraggingUndock = false
          document.removeEventListener('mousemove', onDocMouseMove)
          document.removeEventListener('mouseup', onDocMouseUp)
        }

        const onToolbarMouseDown = (e: MouseEvent) => {
          if (currentDockMode !== 'undock') return
          const target = e.target as HTMLElement
          if (target && target.closest('button, input, select, textarea, .dock-btn, a')) {
            return
          }
          isDraggingUndock = true
          dragStartX = e.clientX
          dragStartY = e.clientY
          const rect = sftpDom.getBoundingClientRect()
          const parentRect = splitWrapper.getBoundingClientRect()
          dragStartLeft = rect.left - parentRect.left
          dragStartTop = rect.top - parentRect.top

          e.preventDefault()
          document.addEventListener('mousemove', onDocMouseMove)
          document.addEventListener('mouseup', onDocMouseUp)
        }

        const attachUndockDragHandler = () => {
          const toolbarEl = sftpDom.querySelector('.sftp-sub-toolbar') as HTMLElement
          if (toolbarEl && !(toolbarEl as any).__dragAttached) {
            ;(toolbarEl as any).__dragAttached = true
            toolbarEl.addEventListener('mousedown', onToolbarMouseDown)
          }
        }

        const applyDockLayout = () => {
          if (!sftpVisible) {
            sftpDom.style.display = 'none'
            termContent.style.display = ''
            termContent.style.flex = '1 1 0'
            headerRef.instance.viewMode = 'pty'
            try {
              headerRef.changeDetectorRef.detectChanges()
            } catch {}
            if (typeof (tab as any).frontend?.focus === 'function') {
              const active = typeof document !== 'undefined' ? document.activeElement : null
              if (!active || !['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
                ;(tab as any).frontend.focus()
              }
            }
            requestAnimationFrame(() => {
              if (typeof (tab as any).frontend?.resize === 'function') {
                (tab as any).frontend.resize()
              }
            })
            return
          }

          headerRef.instance.viewMode = 'sftp'
          try {
            headerRef.changeDetectorRef.detectChanges()
          } catch {}

          sftpRef.instance.dockMode = currentDockMode
          try {
            sftpRef.changeDetectorRef.detectChanges()
          } catch {}

          // Reset positioning styles
          sftpDom.style.position = ''
          sftpDom.style.top = ''
          sftpDom.style.right = ''
          sftpDom.style.left = ''
          sftpDom.style.width = ''
          sftpDom.style.height = ''
          sftpDom.style.zIndex = ''
          sftpDom.style.boxShadow = ''
          sftpDom.style.borderRadius = ''
          sftpDom.style.border = ''
          sftpDom.style.minWidth = '0'
          sftpDom.style.minHeight = '0'
          termContent.style.minWidth = '0'
          termContent.style.minHeight = '0'

          if (currentDockMode === 'bottom') {
            splitWrapper.style.flexDirection = 'column'
            termContent.style.display = ''
            termContent.style.flex = '1 1 50%'
            sftpDom.style.display = 'flex'
            sftpDom.style.flex = '1 1 50%'
          } else if (currentDockMode === 'right') {
            splitWrapper.style.flexDirection = 'row'
            termContent.style.display = ''
            termContent.style.flex = '1 1 50%'
            sftpDom.style.display = 'flex'
            sftpDom.style.flex = '1 1 50%'
          } else if (currentDockMode === 'full') {
            termContent.style.display = 'none'
            sftpDom.style.display = 'flex'
            sftpDom.style.flex = '1 1 100%'
          } else if (currentDockMode === 'undock') {
            termContent.style.display = ''
            termContent.style.flex = '1 1 0'
            sftpDom.style.display = 'flex'
            sftpDom.style.position = 'absolute'
            if (undockLeft >= 0 && undockTop >= 0) {
              sftpDom.style.left = `${undockLeft}px`
              sftpDom.style.top = `${undockTop}px`
              sftpDom.style.right = 'auto'
            } else {
              sftpDom.style.top = '10px'
              sftpDom.style.right = '10px'
              sftpDom.style.left = 'auto'
            }
            sftpDom.style.width = '680px'
            sftpDom.style.height = '460px'
            sftpDom.style.zIndex = '50'
            sftpDom.style.boxShadow = '0 8px 30px rgba(0,0,0,0.3)'
            sftpDom.style.borderRadius = '6px'
            sftpDom.style.border = '1px solid #b0b4bc'
            attachUndockDragHandler()
          }

          // Avoid heavy disk re-scanning if already loaded
          if (!sftpRef.instance.views || sftpRef.instance.views.length === 0 || !sftpRef.instance.views[0]?.remoteFiles?.length) {
            sftpRef.instance.loadLocalFiles()
            sftpRef.instance.loadRemoteFiles()
          }

          requestAnimationFrame(() => {
            if (typeof (tab as any).frontend?.resize === 'function') {
              (tab as any).frontend.resize()
            }
          })
        }

        if (sftpVisible) {
          setTimeout(() => applyDockLayout(), 100)
        }

        // View Mode Switch Handler from Toolbar
        subs.push(
          headerRef.instance.viewModeChange.subscribe((mode) => {
            this.zone.run(() => {
              sftpVisible = mode === 'sftp'
              if (sftpVisible && currentDockMode !== 'full' && currentDockMode !== 'right' && currentDockMode !== 'bottom' && currentDockMode !== 'undock') {
                currentDockMode = 'full'
              }
              applyDockLayout()
            })
          })
        )

        // Dock Mode changes from SFTP Pane
        subs.push(
          sftpRef.instance.dockModeChange.subscribe((mode: 'bottom' | 'right' | 'full' | 'undock' | 'close') => {
            this.zone.run(() => {
              if (mode === 'close') {
                sftpVisible = false
              } else {
                currentDockMode = mode
                sftpVisible = true
              }
              applyDockLayout()
            })
          })
        )

        subs.push(
          sftpRef.instance.backToTerminal.subscribe(() => {
            this.zone.run(() => {
              sftpVisible = false
              applyDockLayout()
            })
          })
        )

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

        // Apply Directory Pair (PTY: cd local, SFTP: navigate local & remote)
        subs.push(
          headerRef.instance.applyDirectoryPair.subscribe((pair: DirectoryPair) => {
            this.zone.run(() => {
              if (headerRef.instance.viewMode === 'pty') {
                if (pair.localPath) {
                  const cmd = `cd "${pair.localPath}"\r`
                  if (typeof (tab as any).session?.write === 'function') {
                    (tab as any).session.write(cmd)
                  } else if (typeof (tab as any).sendInput === 'function') {
                    (tab as any).sendInput(cmd)
                  }
                  this.notifications.info(`PTY 切换本地目录: ${pair.localPath}`)
                }
              } else {
                sftpRef.instance.applyDirectoryPair(pair)
                this.notifications.info(`SFTP 切换成对目录: ${pair.localPath} <-> ${pair.remotePath}`)
              }
            })
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

        // Session lifecycle listeners to update status bar dynamically
        const updateSessionStatus = () => {
          const cur = store.getSummary()
          renderStatusContent(cur.running, cur.succeeded, cur.failed)
        }

        const attachSessionEvents = (sess: any) => {
          if (!sess) return
          if (sess.output$) {
            subs.push(
              sess.output$.pipe(throttleTime(1000)).subscribe(() => {
                updateSessionStatus()
              })
            )
          }
          if (sess.binaryOutput$) {
            subs.push(
              sess.binaryOutput$.pipe(throttleTime(1000)).subscribe(() => {
                updateSessionStatus()
              })
            )
          }
          if (sess.closed$) {
            subs.push(sess.closed$.subscribe(() => updateSessionStatus()))
          }
          if (sess.destroyed$) {
            subs.push(sess.destroyed$.subscribe(() => updateSessionStatus()))
          }
        }

        if ((tab as any).sessionChanged$) {
          subs.push(
            (tab as any).sessionChanged$.subscribe((s: any) => {
              attachSessionEvents(s)
              updateSessionStatus()
            })
          )
        }
        attachSessionEvents((tab as any).session)

        // Check per-session startLogUponConnect
        const logConfig = (tab as any).profile?.options?.loggingConfig
        if (logConfig?.startLogUponConnect) {
          this.loggerService.startLogging(tab)
        }

        this.tabMounted.set(tab, {
          headerRef,
          sftpRef,
          dockRef,
          statusEl,
          cleanup: () => {
            statusEl.removeEventListener('click', onStatusClick)
            document.removeEventListener('mousemove', onDocMouseMove)
            document.removeEventListener('mouseup', onDocMouseUp)
          },
        })
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
        this.tabTimers.delete(tab)
      }
    }, 200)
    this.tabTimers.set(tab, timer)

    this.tabSubs.set(tab, subs)
  }

  /**
   * Reparenting .content drops Tabby's host color rule, and the default light
   * scheme then draws #4d4d4c through a WebGL atlas. That atlas is resampled,
   * so the same soft glyphs show up windowed and maximized.
   */
  private installTerminalSharpness(tab: BaseTerminalTabComponent, termContent: HTMLElement): void {
    const anyTab = tab as any
    if (!anyTab.__workbenchSharpenHook && typeof anyTab.configure === 'function') {
      anyTab.__workbenchSharpenHook = true
      const orig = anyTab.configure.bind(tab)
      anyTab.configure = () => {
        this.pinDesktopFont()
        orig()
        this.sharpenTerminal(tab, termContent)
      }
    }
    if (!this.tabAligners.has(tab) && typeof ResizeObserver !== 'undefined') {
      let frame = 0
      const observer = new ResizeObserver(() => {
        if (frame) cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
          frame = 0
          this.alignTerminal(termContent)
        })
      })
      observer.observe(termContent)
      this.tabAligners.set(tab, () => {
        if (frame) cancelAnimationFrame(frame)
        observer.disconnect()
      })
    }
    this.sharpenTerminal(tab, termContent)
  }

  private sharpenTerminal(tab: BaseTerminalTabComponent, termContent: HTMLElement): void {
    if (this.sharpening.has(tab)) return
    this.sharpening.add(tab)
    try {
      termContent.style.removeProperty('opacity')
      const frontend = (tab as any).frontend
      this.useTextRenderer(frontend)
      const options = frontend?.xterm?.options
      if (options) {
        const face = this.pinDesktopFont()
        if (face && typeof options.fontFamily === 'string' && !options.fontFamily.includes(face)) {
          options.fontFamily = `"${face}", ${options.fontFamily}`
        }
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
        const snapped = snapFontSize(Number(options.fontSize) || 0, dpr)
        if (snapped && Math.abs(snapped - Number(options.fontSize)) > 0.01) {
          options.fontSize = snapped
        }
        const solid = solidifyLightTheme(options.theme)
        if (solid) options.theme = solid
        const theme = options.theme
        if (theme?.background) termContent.style.backgroundColor = theme.background
        if (theme?.foreground) termContent.style.color = theme.foreground
      }
      this.alignTerminal(termContent)
    } catch (err) {
      console.warn('[Workbench] Could not sharpen terminal text', err)
    } finally {
      this.sharpening.delete(tab)
    }
  }

  /** WebGL samples a grayscale atlas. The DOM renderer uses the browser's hinted text. */
  private useTextRenderer(frontend: any): void {
    if (!frontend?.xterm || frontend.__workbenchTextRenderer) return
    frontend.enableWebGL = false
    frontend.pendingRendererRecovery = false
    // Replace recovery before dispose. Context loss during dispose would
    // otherwise load the WebGL atlas again.
    frontend.recoverRenderer = () => {
      frontend.pendingRendererRecovery = false
    }
    const webgl = frontend.webGLAddon
    const canvas = frontend.canvasAddon
    frontend.webGLAddon = undefined
    frontend.canvasAddon = undefined
    try {
      webgl?.dispose?.()
    } catch {
      /* already released */
    }
    try {
      canvas?.dispose?.()
    } catch {
      /* already released */
    }
    frontend.pendingRendererRecovery = false
    frontend.__workbenchTextRenderer = true
    try {
      const rows = frontend.xterm.rows || 1
      frontend.xterm.refresh?.(0, rows - 1)
    } catch {
      /* refresh is optional */
    }
  }

  /** Only the untouched Linux default follows the desktop monospace face. */
  private pinDesktopFont(): string | null {
    const face = this.resolveDesktopFont()
    const terminal = this.config?.store?.terminal
    if (terminal && typeof terminal.font === 'string') {
      const next = replacementFontFamily(terminal.font, face)
      if (next) terminal.font = next
    }
    return face
  }

  private resolveDesktopFont(): string | null {
    if (this.desktopFontResolved) return this.desktopFont
    this.desktopFontResolved = true
    this.desktopFont = null
    try {
      // Webpack target is node; child_process stays a runtime require.
      const { execFileSync } = require('child_process') as typeof import('child_process')
      const raw = execFileSync('gsettings', ['get', 'org.gnome.desktop.interface', 'monospace-font-name'], {
        encoding: 'utf8',
        timeout: 800,
        windowsHide: true,
      })
      this.desktopFont = parseDesktopMonospace(String(raw))
    } catch {
      this.desktopFont = null
    }
    return this.desktopFont
  }

  private alignTerminal(termContent: HTMLElement): void {
    if (typeof window === 'undefined' || !termContent?.querySelector) return
    const target = (termContent.querySelector('.xterm') as HTMLElement) || termContent
    const dpr = window.devicePixelRatio || 1
    target.style.left = '0px'
    target.style.top = '0px'
    const rect = target.getBoundingClientRect()
    const dx = devicePixelDelta(rect.left, dpr)
    const dy = devicePixelDelta(rect.top, dpr)
    if (!target.style.position) target.style.position = 'relative'
    target.style.left = dx ? `${dx}px` : ''
    target.style.top = dy ? `${dy}px` : ''
  }

  override detach(tab: BaseTerminalTabComponent): void {
    const aligner = this.tabAligners.get(tab)
    if (aligner) {
      aligner()
      this.tabAligners.delete(tab)
    }
    const timer = this.tabTimers.get(tab)
    if (timer) {
      clearInterval(timer)
      this.tabTimers.delete(tab)
    }

    this.loggerService.stopLogging(tab)

    const subs = this.tabSubs.get(tab)
    if (subs) {
      subs.forEach((s) => s.unsubscribe())
      this.tabSubs.delete(tab)
    }

    const store = this.tabStores.get(tab)
    if (store) {
      this.tabStores.delete(tab)
      store.destroy()
      this.hostShell?.releaseTransferStore(store)
    }

    const mounted = this.tabMounted.get(tab)
    if (mounted) {
      if (mounted.cleanup) {
        try {
          mounted.cleanup()
        } catch {}
      }
      try {
        this.appRef.detachView(mounted.headerRef.hostView)
        mounted.headerRef.destroy()
      } catch {}

      try {
        this.appRef.detachView(mounted.sftpRef.hostView)
        mounted.sftpRef.destroy()
      } catch {}

      try {
        if (mounted.dockRef && mounted.dockRef !== this.hostShell?.dockRef) {
          this.appRef.detachView(mounted.dockRef.hostView)
          mounted.dockRef.destroy()
        }
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
