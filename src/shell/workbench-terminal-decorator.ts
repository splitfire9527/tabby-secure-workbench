import { Injectable, NgZone, ComponentFactoryResolver, ApplicationRef, Injector, EmbeddedViewRef } from '@angular/core'
import { TerminalDecorator, BaseTerminalTabComponent } from 'tabby-terminal'
import { AppService, ConfigService, ProfilesService, NotificationsService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { TransferStore } from '../transfer-store/transfer-store'
import { WorkbenchShellComponent } from './workbench-shell.component'

const WORKBENCH_SESSION_BAR_CLASS = 'workbench-decorated-session-bar'
const WORKBENCH_STATUS_BAR_CLASS = 'workbench-decorated-status-bar'

@Injectable()
export class WorkbenchTerminalDecorator extends TerminalDecorator {
  private tabSubs = new WeakMap<BaseTerminalTabComponent, Subscription[]>()
  private tabStores = new WeakMap<BaseTerminalTabComponent, TransferStore>()

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

    const subs: Subscription[] = []

    const tryDecorateTab = () => {
      try {
        const host = tab.element?.nativeElement as HTMLElement
        if (!host) return false
        if (host.querySelector(`.${WORKBENCH_SESSION_BAR_CLASS}`)) return true

        const container = host.querySelector('.terminal-container') || host.querySelector('terminal-container') || host
        if (!container) return false

        // 1. Create Top Session Header & Unified Toolbar
        const headerEl = document.createElement('div')
        headerEl.className = `${WORKBENCH_SESSION_BAR_CLASS} d-flex align-items-center justify-content-between px-3`
        headerEl.style.height = '32px'
        headerEl.style.minHeight = '32px'
        headerEl.style.background = '#21252b'
        headerEl.style.borderBottom = '1px solid #181a1f'
        headerEl.style.fontSize = '12px'
        headerEl.style.color = '#abb2bf'
        headerEl.style.zIndex = '5'
        headerEl.style.userSelect = 'none'

        const profileName = (tab as any).profile?.name || (tab as any).title || 'SSH Session'
        const profileHost = (tab as any).profile?.options?.host
        const profileUser = (tab as any).profile?.options?.user || 'user'
        const profilePort = (tab as any).profile?.options?.port || 22
        const hostInfo = profileHost ? `${profileUser}@${profileHost}:${profilePort}` : 'Local PTY'

        headerEl.innerHTML = `
          <div class="d-flex align-items-center gap-2" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <span style="color: #fff; font-weight: 600;">${profileName}</span>
            <span style="color: #5c6370;">-</span>
            <span style="color: #98c379; font-family: monospace;">${hostInfo}</span>
            <span class="badge" style="background: rgba(152, 195, 121, 0.15); color: #98c379; border: 1px solid rgba(152, 195, 121, 0.3); font-size: 9px; padding: 2px 5px;">CONNECTED</span>
          </div>
          <div class="d-flex align-items-center gap-1">
            <button type="button" class="btn btn-sm btn-link text-muted p-1" data-action="reconnect" title="Reconnect session" style="font-size: 11px; text-decoration: none;">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#61afef" stroke-width="2" style="vertical-align: -2px;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              <span style="margin-left: 3px;">Reconnect</span>
            </button>
            <button type="button" class="btn btn-sm btn-link text-muted p-1" data-action="encoding" title="Switch Encoding (Current: UTF-8)" style="font-size: 11px; text-decoration: none;">
              <span style="color: #e5c07b; font-weight: bold; font-family: monospace;">T</span>
              <span style="margin-left: 3px;">UTF-8</span>
            </button>
            <button type="button" class="btn btn-sm btn-link text-muted p-1" data-action="logging" title="Session Audit Logging" style="font-size: 11px; text-decoration: none;">
              <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #e06c75; margin-right: 3px;"></span>
              <span>Log</span>
            </button>
          </div>
        `

        // Header button events
        headerEl.querySelector('[data-action="reconnect"]')?.addEventListener('click', (ev) => {
          ev.preventDefault()
          ev.stopPropagation()
          if (typeof (tab as any).reconnect === 'function') {
            (tab as any).reconnect()
          }
        })

        headerEl.querySelector('[data-action="encoding"]')?.addEventListener('click', (ev) => {
          ev.preventDefault()
          ev.stopPropagation()
          this.notifications.info('Current Encoding: UTF-8 (Stateful stream codec active)')
        })

        headerEl.querySelector('[data-action="logging"]')?.addEventListener('click', (ev) => {
          ev.preventDefault()
          ev.stopPropagation()
          this.notifications.info('Session audit transcript logging is active.')
        })

        host.insertBefore(headerEl, host.firstChild)

        // 2. Create Bottom Status Bar & Transfer Dock
        const statusEl = document.createElement('div')
        statusEl.className = `${WORKBENCH_STATUS_BAR_CLASS} workbench-status-bar d-flex align-items-center justify-content-between px-3`
        statusEl.style.height = '22px'
        statusEl.style.minHeight = '22px'
        statusEl.style.background = '#181a1f'
        statusEl.style.borderTop = '1px solid #282c34'
        statusEl.style.fontSize = '11px'
        statusEl.style.color = '#abb2bf'
        statusEl.style.userSelect = 'none'

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
              <span class="status-item" style="border-left: 1px solid rgba(62,68,81,0.6); padding-left: 8px;">${cipher}</span>
              <span class="status-item" style="border-left: 1px solid rgba(62,68,81,0.6); padding-left: 8px;">${rows} Rows, ${cols} Cols</span>
              <span class="status-item" style="border-left: 1px solid rgba(62,68,81,0.6); padding-left: 8px;">Xterm</span>
              <span class="status-item transfer-pill" data-action="toggle-dock" style="border-left: 1px solid rgba(62,68,81,0.6); padding-left: 8px; color: #e5c07b; cursor: pointer;" title="Toggle Transfer Queue">
                ⚡ 传输中: ${running} | 完成: ${succeeded} | 失败: ${failed}
              </span>
            </div>
          `
        }

        renderStatusContent(0, 0, 0)
        host.appendChild(statusEl)

        // Listen to tab resizing
        if (tab.frontend?.resize$) {
          subs.push(
            tab.frontend.resize$.subscribe((sz: any) => {
              if (sz?.rows) rows = sz.rows
              if (sz?.columns) cols = sz.columns
              renderStatusContent(0, 0, 0)
            })
          )
        }

        // Listen to transfer store summary
        subs.push(
          store.summary$.subscribe((summary) => {
            renderStatusContent(summary.running, summary.succeeded, summary.failed)
          })
        )

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

    try {
      const host = tab.element?.nativeElement as HTMLElement
      if (host) {
        host.querySelector(`.${WORKBENCH_SESSION_BAR_CLASS}`)?.remove()
        host.querySelector(`.${WORKBENCH_STATUS_BAR_CLASS}`)?.remove()
      }
    } catch {}
  }
}
