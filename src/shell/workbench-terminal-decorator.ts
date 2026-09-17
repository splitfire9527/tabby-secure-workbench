import { Injectable, NgZone } from '@angular/core'
import { TerminalDecorator, BaseTerminalTabComponent } from 'tabby-terminal'
import { AppService } from 'tabby-core'
import { WorkbenchShellComponent } from './workbench-shell.component'

const WORKBENCH_BTN_SVG = `
<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; vertical-align: -2px;">
  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
  <line x1="8" y1="21" x2="16" y2="21"></line>
  <line x1="12" y1="17" x2="12" y2="21"></line>
</svg>
`

@Injectable()
export class WorkbenchTerminalDecorator extends TerminalDecorator {
  constructor(
    private app: AppService,
    private zone: NgZone
  ) {
    super()
  }

  override attach(tab: BaseTerminalTabComponent): void {
    // Avoid injecting into Workbench tabs themselves
    if ((tab as any) instanceof WorkbenchShellComponent) {
      return
    }

    const tryInject = () => {
      try {
        const host = tab.element?.nativeElement
        if (!host) return false

        const toolbar =
          host.querySelector('.terminal-toolbar') ||
          host.querySelector('terminal-toolbar') ||
          host.querySelector('.btn-toolbar')

        if (!toolbar) return false
        if (toolbar.querySelector('[data-workbench-button="1"]')) return true

        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'btn btn-sm btn-link me-2'
        btn.setAttribute('data-workbench-button', '1')
        btn.title = 'Open in Secure Workbench'
        btn.innerHTML = WORKBENCH_BTN_SVG + ' Workbench'
        btn.style.pointerEvents = 'auto'
        btn.style.zIndex = '10'
        btn.style.position = 'relative'

        btn.addEventListener('mousedown', ev => ev.stopPropagation())
        btn.addEventListener('click', ev => {
          ev.preventDefault()
          ev.stopPropagation()
          this.zone.run(() => {
            this.app.openNewTab({
              type: WorkbenchShellComponent,
              inputs: {
                activeProfile: (tab as any).profile || null,
                title: (tab as any).title || 'Secure Workbench',
              },
            })
          })
        })

        // Place near Reconnect or SFTP button
        const allButtons = Array.from(toolbar.querySelectorAll('button')) as HTMLButtonElement[]
        const targetBtn = allButtons.find(b => {
          const t = `${b.textContent || ''} ${b.title || ''}`.toLowerCase()
          return t.includes('sftp') || t.includes('reconnect')
        })

        if (targetBtn && targetBtn.parentElement) {
          targetBtn.parentElement.insertBefore(btn, targetBtn.nextSibling)
        } else {
          toolbar.appendChild(btn)
        }

        return true
      } catch {
        return false
      }
    }

    let attempts = 0
    const timer = setInterval(() => {
      attempts++
      if (tryInject() || attempts > 15) {
        clearInterval(timer)
      }
    }, 300)
  }
}
