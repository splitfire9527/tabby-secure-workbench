import { Injectable, Optional, Inject, forwardRef, NgZone } from '@angular/core'
import { AppService, BaseTabComponent, ConfigService, NotificationsService } from 'tabby-core'
import { BehaviorSubject, Observable } from 'rxjs'

export interface ChromeColor {
  id: string
  name: string
  color: string       // foreground / accent
  bg: string          // pill background when collapsed or normal
  tabBorder: string   // top border for tabs
}

export const CHROME_TAB_GROUP_COLORS: Record<string, ChromeColor> = {
  grey:   { id: 'grey',   name: '灰色', color: '#3c4043', bg: '#dadce0', tabBorder: '#5f6368' },
  blue:   { id: 'blue',   name: '蓝色', color: '#1a73e8', bg: '#d2e3fc', tabBorder: '#1a73e8' },
  red:    { id: 'red',    name: '红色', color: '#d93025', bg: '#fad2cf', tabBorder: '#d93025' },
  yellow: { id: 'yellow', name: '黄色', color: '#b06000', bg: '#feefc3', tabBorder: '#f9ab00' },
  green:  { id: 'green',  name: '绿色', color: '#137333', bg: '#ceead6', tabBorder: '#1e8e3e' },
  pink:   { id: 'pink',   name: '粉色', color: '#c5221f', bg: '#fedfc8', tabBorder: '#e52592' },
  purple: { id: 'purple', name: '紫色', color: '#8430ce', bg: '#f3e8fd', tabBorder: '#9334e6' },
  cyan:   { id: 'cyan',   name: '青色', color: '#007b83', bg: '#cbf0f8', tabBorder: '#12b5cb' },
  orange: { id: 'orange', name: '橙色', color: '#e37400', bg: '#fedfc8', tabBorder: '#e8710a' },
}

export const COLOR_KEYS = Object.keys(CHROME_TAB_GROUP_COLORS)

export interface TabGroup {
  id: string
  title: string
  colorKey: string
  collapsed: boolean
  tabIds: string[]
}

/**
 * WorkbenchTabGroupService implements Chrome-like Tab Grouping:
 * - Group tabs by colored labels
 * - Collapse and expand tabs in a group
 * - Dynamic pill injection before the first tab of the group in .tab-bar
 * - Colored top border on tabs belonging to the group
 * - In-place popup to edit name, color, and manage group
 */
@Injectable({ providedIn: 'root' })
export class WorkbenchTabGroupService {
  private groupsSubject = new BehaviorSubject<TabGroup[]>([])
  readonly groups$: Observable<TabGroup[]> = this.groupsSubject.asObservable()

  // Track which tab belongs to which group
  private tabToGroupMap = new WeakMap<BaseTabComponent, string>()
  private groupTabsMap = new Map<string, Set<BaseTabComponent>>()

  // Floating editor popup element
  private editorEl: HTMLElement | null = null
  private activeEditingGroupId: string | null = null

  constructor(
    public app: AppService,
    private zone: NgZone,
    @Optional() private config?: ConfigService,
    @Optional() private notifications?: NotificationsService
  ) {
    this.initListeners()
  }

  get groups(): TabGroup[] {
    return this.groupsSubject.value
  }

  private initListeners(): void {
    if (this.app) {
      this.app.tabClosed$.subscribe((tab) => {
        this.handleTabClosed(tab)
      })
      this.app.activeTabChange$.subscribe(() => {
        this.syncDom()
      })
    }

    // Periodically sync DOM to keep pill positions and tab headers aligned
    if (typeof window !== 'undefined') {
      setInterval(() => {
        this.syncDom()
      }, 500)
    }
  }

  createGroup(tab: BaseTabComponent, title = '新分组', colorKey = 'blue'): TabGroup {
    const id = 'group-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
    const newGroup: TabGroup = {
      id,
      title: title || '新分组',
      colorKey: CHROME_TAB_GROUP_COLORS[colorKey] ? colorKey : 'blue',
      collapsed: false,
      tabIds: [],
    }

    const currentGroups = [...this.groupsSubject.value, newGroup]
    this.groupsSubject.next(currentGroups)

    const set = new Set<BaseTabComponent>()
    set.add(tab)
    this.groupTabsMap.set(id, set)
    this.tabToGroupMap.set(tab, id)
    ;(tab as any).__workbenchGroupId = id

    this.syncDom()
    this.openGroupEditor(id)
    return newGroup
  }

  addTabToGroup(tab: BaseTabComponent, groupId: string): void {
    const group = this.groups.find((g) => g.id === groupId)
    if (!group) return

    // Remove from previous group if any
    this.removeTabFromGroup(tab)

    let set = this.groupTabsMap.get(groupId)
    if (!set) {
      set = new Set()
      this.groupTabsMap.set(groupId, set)
    }
    set.add(tab)
    this.tabToGroupMap.set(tab, groupId)
    ;(tab as any).__workbenchGroupId = groupId

    this.syncDom()
  }

  removeTabFromGroup(tab: BaseTabComponent): void {
    const oldGroupId = this.tabToGroupMap.get(tab) || (tab as any).__workbenchGroupId
    if (oldGroupId) {
      const set = this.groupTabsMap.get(oldGroupId)
      if (set) {
        set.delete(tab)
        if (set.size === 0) {
          this.disbandGroup(oldGroupId)
        }
      }
      this.tabToGroupMap.delete(tab)
      delete (tab as any).__workbenchGroupId
    }
    this.syncDom()
  }

  toggleGroupCollapse(groupId: string): void {
    const groups = this.groups.map((g) => {
      if (g.id === groupId) {
        return { ...g, collapsed: !g.collapsed }
      }
      return g
    })
    this.groupsSubject.next(groups)
    this.syncDom()
  }

  updateGroup(groupId: string, data: Partial<TabGroup>): void {
    const groups = this.groups.map((g) => {
      if (g.id === groupId) {
        return { ...g, ...data }
      }
      return g
    })
    this.groupsSubject.next(groups)
    this.syncDom()
  }

  disbandGroup(groupId: string): void {
    const set = this.groupTabsMap.get(groupId)
    if (set) {
      for (const tab of set) {
        this.tabToGroupMap.delete(tab)
        delete (tab as any).__workbenchGroupId
      }
      this.groupTabsMap.delete(groupId)
    }
    const filtered = this.groups.filter((g) => g.id !== groupId)
    this.groupsSubject.next(filtered)
    this.removeGroupPillDom(groupId)
    this.closeGroupEditor()
    this.syncDom()
  }

  closeGroup(groupId: string): void {
    const set = this.groupTabsMap.get(groupId)
    if (set) {
      const tabsToClose = Array.from(set)
      for (const tab of tabsToClose) {
        try {
          this.app.closeTab(tab)
        } catch {
          if (typeof tab.destroy === 'function') tab.destroy()
        }
      }
    }
    this.disbandGroup(groupId)
  }

  getGroupByTab(tab: BaseTabComponent): TabGroup | undefined {
    const groupId = this.tabToGroupMap.get(tab) || (tab as any).__workbenchGroupId
    if (!groupId) return undefined
    return this.groups.find((g) => g.id === groupId)
  }

  getTabsInGroup(groupId: string): BaseTabComponent[] {
    const set = this.groupTabsMap.get(groupId)
    if (!set) return []
    return Array.from(set).filter((t) => this.app.tabs.includes(t))
  }

  private handleTabClosed(tab: BaseTabComponent): void {
    this.removeTabFromGroup(tab)
  }

  /**
   * Synchronizes group pills into .tab-bar > .tabs and updates tab-header styling/visibility.
   */
  syncDom(): void {
    if (typeof document === 'undefined') return

    const tabsContainer = document.querySelector('.tab-bar .tabs') as HTMLElement
    if (!tabsContainer) return

    const tabHeaders = Array.from(tabsContainer.querySelectorAll('tab-header')) as HTMLElement[]
    const allTabs = this.app.tabs

    for (const group of this.groups) {
      const groupTabs = this.getTabsInGroup(group.id)
      if (groupTabs.length === 0) {
        this.removeGroupPillDom(group.id)
        continue
      }

      // Find the first tab header in this group
      let firstHeaderIndex = -1
      for (let i = 0; i < allTabs.length; i++) {
        if (groupTabs.includes(allTabs[i])) {
          firstHeaderIndex = i
          break
        }
      }

      const colorDef = CHROME_TAB_GROUP_COLORS[group.colorKey] || CHROME_TAB_GROUP_COLORS.blue
      let pillEl = tabsContainer.querySelector(`.tab-group-pill[data-group-id="${group.id}"]`) as HTMLElement

      if (!pillEl) {
        pillEl = document.createElement('div')
        pillEl.className = 'tab-group-pill'
        pillEl.setAttribute('data-group-id', group.id)
        pillEl.addEventListener('click', (e) => {
          e.stopPropagation()
          this.toggleGroupCollapse(group.id)
        })
        pillEl.addEventListener('contextmenu', (e) => {
          e.preventDefault()
          e.stopPropagation()
          this.openGroupEditor(group.id, e)
        })
      }

      pillEl.style.backgroundColor = colorDef.bg
      pillEl.style.color = colorDef.color
      pillEl.style.border = `1px solid ${colorDef.tabBorder}`
      if (group.collapsed) {
        pillEl.classList.add('collapsed')
      } else {
        pillEl.classList.remove('collapsed')
      }

      pillEl.innerHTML = `
        <span class="group-pill-dot" style="background: ${colorDef.tabBorder};"></span>
        <span class="group-pill-title">${group.title || '分组'}</span>
        <span class="group-pill-collapse-icon" style="transform: ${group.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'};">▾</span>
      `

      // Place pill before the first header of the group
      if (firstHeaderIndex >= 0 && firstHeaderIndex < tabHeaders.length) {
        const targetHeader = tabHeaders[firstHeaderIndex]
        if (pillEl.nextSibling !== targetHeader) {
          tabsContainer.insertBefore(pillEl, targetHeader)
        }
      } else {
        if (!tabsContainer.contains(pillEl)) {
          tabsContainer.appendChild(pillEl)
        }
      }

      // Update visibility & styling of tabs in this group
      for (let i = 0; i < allTabs.length && i < tabHeaders.length; i++) {
        const tab = allTabs[i]
        const header = tabHeaders[i]
        if (groupTabs.includes(tab)) {
          header.setAttribute('data-group-id', group.id)
          header.style.borderTop = `3px solid ${colorDef.tabBorder}`
          if (group.collapsed) {
            header.style.display = 'none'
          } else {
            header.style.display = ''
          }
        }
      }
    }

    // Clean up headers not in any group
    for (let i = 0; i < allTabs.length && i < tabHeaders.length; i++) {
      const tab = allTabs[i]
      const header = tabHeaders[i]
      if (!this.getGroupByTab(tab)) {
        header.removeAttribute('data-group-id')
        if (!header.classList.contains('active')) {
          header.style.borderTop = ''
        }
        header.style.display = ''
      }
    }
  }

  private removeGroupPillDom(groupId: string): void {
    if (typeof document === 'undefined') return
    const pill = document.querySelector(`.tab-group-pill[data-group-id="${groupId}"]`)
    if (pill && pill.parentNode) {
      pill.parentNode.removeChild(pill)
    }
  }

  /**
   * Opens floating Chrome-style group customization popup
   */
  openGroupEditor(groupId: string, event?: MouseEvent): void {
    if (typeof document === 'undefined') return
    this.closeGroupEditor()

    const group = this.groups.find((g) => g.id === groupId)
    if (!group) return

    this.activeEditingGroupId = groupId
    const pillEl = document.querySelector(`.tab-group-pill[data-group-id="${groupId}"]`) as HTMLElement
    const rect = pillEl ? pillEl.getBoundingClientRect() : { left: 100, bottom: 40, top: 10 }

    const editor = document.createElement('div')
    editor.className = 'tab-group-editor-popup shadow-lg'
    editor.style.position = 'fixed'
    editor.style.left = `${Math.max(10, rect.left)}px`
    editor.style.top = `${(rect as any).bottom + 4}px`
    editor.style.zIndex = '70000'

    const colorDotsHtml = COLOR_KEYS.map((k) => {
      const c = CHROME_TAB_GROUP_COLORS[k]
      const isSelected = group.colorKey === k
      return `
        <button
          type="button"
          class="color-dot-btn ${isSelected ? 'selected' : ''}"
          data-color="${k}"
          style="background-color: ${c.tabBorder};"
          title="${c.name}"
        ></button>
      `
    }).join('')

    editor.innerHTML = `
      <div class="p-3">
        <input
          type="text"
          class="form-control form-control-sm group-name-input mb-2"
          value="${group.title || ''}"
          placeholder="为该分组命名"
          autofocus
        />
        <div class="color-palette d-flex align-items-center gap-1 mb-3">
          ${colorDotsHtml}
        </div>
        <hr class="my-2 border-secondary" />
        <div class="group-editor-actions d-flex flex-column gap-1">
          <button class="btn btn-sm btn-link text-left action-new-tab p-1 text-dark">
            <span class="mr-2">➕</span> 在分组中新建标签页
          </button>
          <button class="btn btn-sm btn-link text-left action-ungroup p-1 text-dark">
            <span class="mr-2">📂</span> 取消分组 (解散)
          </button>
          <button class="btn btn-sm btn-link text-left action-close-group p-1 text-danger">
            <span class="mr-2">&times;</span> 关闭分组及所有标签
          </button>
        </div>
      </div>
    `

    // Event handlers for editor
    const nameInput = editor.querySelector('.group-name-input') as HTMLInputElement
    if (nameInput) {
      nameInput.addEventListener('input', () => {
        this.updateGroup(groupId, { title: nameInput.value.trim() || '分组' })
      })
      nameInput.addEventListener('keydown', (e) => {
        e.stopPropagation()
        if (e.key === 'Enter' || e.key === 'Escape') {
          this.closeGroupEditor()
        }
      })
      setTimeout(() => nameInput.focus(), 50)
    }

    const dotButtons = editor.querySelectorAll('.color-dot-btn')
    dotButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const col = btn.getAttribute('data-color') || 'blue'
        this.updateGroup(groupId, { colorKey: col })
        dotButtons.forEach((b) => b.classList.remove('selected'))
        btn.classList.add('selected')
      })
    })

    const newTabBtn = editor.querySelector('.action-new-tab')
    if (newTabBtn) {
      newTabBtn.addEventListener('click', async () => {
        this.closeGroupEditor()
        try {
          const tab = await (this.app as any).openNewTab?.() || (this.app as any).openNewTabForProfile?.({ type: 'local' })
          if (tab) {
            this.addTabToGroup(tab, groupId)
          }
        } catch {}
      })
    }

    const ungroupBtn = editor.querySelector('.action-ungroup')
    if (ungroupBtn) {
      ungroupBtn.addEventListener('click', () => {
        this.disbandGroup(groupId)
      })
    }

    const closeGrpBtn = editor.querySelector('.action-close-group')
    if (closeGrpBtn) {
      closeGrpBtn.addEventListener('click', () => {
        this.closeGroup(groupId)
      })
    }

    // Dismiss on clicking outside
    const onDocClick = (e: MouseEvent) => {
      if (!editor.contains(e.target as Node)) {
        this.closeGroupEditor()
        document.removeEventListener('click', onDocClick)
      }
    }
    setTimeout(() => {
      document.addEventListener('click', onDocClick)
    }, 100)

    document.body.appendChild(editor)
    this.editorEl = editor
  }

  closeGroupEditor(): void {
    if (this.editorEl && this.editorEl.parentNode) {
      this.editorEl.parentNode.removeChild(this.editorEl)
      this.editorEl = null
      this.activeEditingGroupId = null
    }
  }
}
