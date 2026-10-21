import { Injectable, Optional } from '@angular/core'
import { PlatformService, ConfigService, AppService, BaseTabComponent } from 'tabby-core'
import { TabContextMenuConfig } from '../config/config.model'
import { WorkbenchTabGroupService } from './workbench-tab-group.service'

/**
 * Service to intercept and filter Tabby's tab header context menu items
 * according to user settings in secureWorkbench.tabContextMenu,
 * and adds Chrome-style Tab Grouping actions.
 */
@Injectable({ providedIn: 'root' })
export class TabContextMenuFilterService {
  constructor(
    @Optional() private platform?: PlatformService,
    @Optional() private config?: ConfigService,
    @Optional() private app?: AppService,
    @Optional() private tabGroupService?: WorkbenchTabGroupService
  ) {
    this.hookContextMenu()
  }

  hookContextMenu(): void {
    if (!this.platform || (this.platform as any).__workbenchContextMenuHooked) return
    ;(this.platform as any).__workbenchContextMenuHooked = true

    const origPopup = this.platform.popupContextMenu.bind(this.platform)
    this.platform.popupContextMenu = (items: any[], event?: MouseEvent) => {
      const headerEl = (event?.target && (event.target as HTMLElement).closest?.('tab-header')) as HTMLElement
      const isTabHeader =
        headerEl ||
        (Array.isArray(items) &&
          items.some(
            (it) =>
              it &&
              typeof it.label === 'string' &&
              (it.label.toLowerCase().includes('duplicate') ||
                it.label.toLowerCase().includes('close other') ||
                it.label.includes('复制') ||
                it.label.includes('关闭其他'))
          ))

      if (isTabHeader) {
        const tabConfig: TabContextMenuConfig = this.config?.store?.secureWorkbench?.tabContextMenu
        if (tabConfig) {
          items = this.filterTabMenuItems(items, tabConfig)
        }

        // Add Chrome-style Tab Grouping items
        if (this.tabGroupService && this.app) {
          let clickedTab: BaseTabComponent | undefined
          if (headerEl) {
            clickedTab = this.app.tabs.find((t: any) => {
              const el = t.element?.nativeElement
              return el && (el === headerEl || el.contains(headerEl))
            })
            if (!clickedTab) {
              const allHeaders = Array.from(document.querySelectorAll('.tab-bar tab-header'))
              const idx = allHeaders.indexOf(headerEl)
              if (idx >= 0 && idx < this.app.tabs.length) {
                clickedTab = this.app.tabs[idx]
              }
            }
          }
          if (!clickedTab) {
            clickedTab = this.app.activeTab
          }

          if (clickedTab) {
            const currentGroup = this.tabGroupService.getGroupByTab(clickedTab)
            const groupMenuItems: any[] = []

            if (currentGroup) {
              groupMenuItems.push({
                label: `从分组中移除 (${currentGroup.title})`,
                click: () => this.tabGroupService?.removeTabFromGroup(clickedTab),
              })
              groupMenuItems.push({
                label: `关闭分组 (${currentGroup.title})`,
                click: () => this.tabGroupService?.closeGroup(currentGroup.id),
              })
            } else {
              groupMenuItems.push({
                label: '向新标签页分组中添加标签页',
                click: () => this.tabGroupService?.createGroup(clickedTab),
              })
              if (this.tabGroupService.groups.length > 0) {
                groupMenuItems.push({
                  type: 'submenu',
                  label: '添加到现有分组',
                  submenu: this.tabGroupService.groups.map((g) => ({
                    label: g.title,
                    click: () => this.tabGroupService?.addTabToGroup(clickedTab, g.id),
                  })),
                })
              }
            }

            groupMenuItems.push({ type: 'separator' })
            items = [...groupMenuItems, ...items]
          }
        }
      }
      return origPopup(items, event)
    }
  }

  filterTabMenuItems(items: any[], config: TabContextMenuConfig): any[] {
    const filtered = (items || []).filter((item) => {
      if (!item || item.type === 'separator') return true
      const label = (item.label || '').toLowerCase()

      // 1. Copy Path (check before duplicate)
      if (label.includes('copy current path') || label.includes('复制当前路径') || label.includes('复制路径')) {
        return config.copyPath !== false
      }
      // 2. Duplicate
      if (label.includes('duplicate') || label.includes('复制标签') || label === '复制' || label.startsWith('复制 ')) {
        return config.duplicate !== false
      }
      // 3. Rename
      if (label.includes('rename') || label.includes('重命名')) {
        return config.rename !== false
      }
      // 4. Pin
      if (label.includes('pin') || label.includes('固定')) {
        return config.pin !== false
      }
      // 5. Color
      if (label.includes('color') || label.includes('颜色')) {
        return config.color !== false
      }
      // 6. Split
      if (label.includes('split') || label.includes('分屏') || label.includes('拆分')) {
        return config.split !== false
      }
      // 7. Save layout as profile
      if (label.includes('save layout') || label.includes('保存布局')) {
        return config.saveLayout !== false
      }
      // 8. New terminal / profiles / admin
      if (
        label.includes('new terminal') ||
        label.includes('new with profile') ||
        label.includes('new admin tab') ||
        label.includes('新建终端') ||
        label.includes('使用配置新建') ||
        label.includes('以管理员')
      ) {
        return config.newTerminal !== false
      }
      // 9. Focus all tabs
      if (label.includes('focus all tabs') || label.includes('聚焦所有标签')) {
        return config.focusAllTabs !== false
      }
      // 10. Focus all panes
      if (label.includes('focus all panes') || label.includes('聚焦所有分块')) {
        return config.focusAllPanes !== false
      }
      // 11. Disconnect (check before reconnect)
      if (label.includes('disconnect') || label.includes('断开连接') || label === '断开') {
        return config.disconnect !== false
      }
      // 12. Reconnect / Restart
      if (label.includes('restart') || label.includes('reconnect') || label.includes('重启') || label.includes('重新连接')) {
        return config.restart !== false
      }
      // 13. Close tabs to the left
      if (label.includes('close tabs to the left') || label.includes('关闭左侧')) {
        return config.closeLeft !== false
      }
      // 14. Close tabs to the right
      if (label.includes('close tabs to the right') || label.includes('关闭右侧')) {
        return config.closeRight !== false
      }
      // 15. Close other tabs
      if (label.includes('close other') || label.includes('关闭其他')) {
        return config.closeOthers !== false
      }
      // 16. Close tab
      if (label === 'close' || label.includes('close tab') || label === '关闭' || label.includes('关闭标签')) {
        return config.close !== false
      }
      return true
    })

    // Clean up duplicate or trailing/leading separators
    const cleaned: any[] = []
    for (let i = 0; i < filtered.length; i++) {
      const it = filtered[i]
      if (it.type === 'separator') {
        if (cleaned.length === 0 || cleaned[cleaned.length - 1].type === 'separator') {
          continue
        }
      }
      cleaned.push(it)
    }
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].type === 'separator') {
      cleaned.pop()
    }
    return cleaned
  }
}
