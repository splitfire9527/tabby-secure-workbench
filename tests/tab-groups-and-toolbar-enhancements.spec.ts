if (typeof (global as any).MouseEvent === 'undefined') {
  (global as any).MouseEvent = class MouseEvent {
    constructor(public type: string, public init?: any) {
      Object.assign(this, init)
    }
    preventDefault() {}
    stopPropagation() {}
  }
}
if (typeof (global as any).KeyboardEvent === 'undefined') {
  (global as any).KeyboardEvent = class KeyboardEvent {
    constructor(public type: string, public init?: any) {
      Object.assign(this, init)
    }
    preventDefault() {}
    stopPropagation() {}
  }
}

import { WorkbenchTabGroupService, CHROME_TAB_GROUP_COLORS } from '../src/shell/workbench-tab-group.service'
import { WorkbenchToolbarComponent } from '../src/shell/workbench-toolbar.component'
import { WorkbenchBottomDockComponent } from '../src/shell/workbench-bottom-dock.component'
import { WorkbenchQuickSearchModalComponent } from '../src/shell/workbench-quick-search-modal.component'
import { TransferStore } from '../src/transfer-store/transfer-store'

describe('Tab Groups, Split Close, Bottom Dock & Search Enhancements', () => {
  describe('WorkbenchTabGroupService (Chrome-style Tab Groups)', () => {
    let service: WorkbenchTabGroupService
    let mockApp: any
    let mockZone: any
    let mockConfig: any

    beforeEach(() => {
      mockApp = {
        tabs: [],
        tabsChanged$: { subscribe: jest.fn() },
        tabClosed$: { subscribe: jest.fn() },
        activeTabChange$: { subscribe: jest.fn() },
        closeTab: jest.fn().mockResolvedValue(undefined),
      }
      mockZone = { run: (fn: any) => fn() }
      mockConfig = {
        store: { secureWorkbench: {} },
        save: jest.fn(),
      }
      service = new WorkbenchTabGroupService(mockApp, mockZone, mockConfig)
    })

    it('should initialize with 9 Chrome standard colors', () => {
      const colors = Object.keys(CHROME_TAB_GROUP_COLORS)
      expect(colors.length).toBe(9)
      expect(colors).toContain('grey')
      expect(colors).toContain('blue')
      expect(colors).toContain('red')
      expect(colors).toContain('yellow')
      expect(colors).toContain('green')
      expect(colors).toContain('pink')
      expect(colors).toContain('purple')
      expect(colors).toContain('cyan')
      expect(colors).toContain('orange')
    })

    it('should create group with title and colorKey', () => {
      const mockTab1: any = { id: 'tab-1', title: 'Prod SSH' }
      const group1 = service.createGroup(mockTab1, 'Production', 'red')
      expect(group1.title).toBe('Production')
      expect(group1.colorKey).toBe('red')

      const groupForTab = service.getGroupByTab(mockTab1)
      expect(groupForTab?.id).toBe(group1.id)

      const mockTab2: any = { id: 'tab-2', title: 'Staging SSH' }
      const group2 = service.createGroup(mockTab2, '新分组')
      expect(group2.title).toBe('新分组')
    })

    it('should toggle collapse state of tab group', () => {
      const mockTab: any = { id: 'tab-1' }
      const group = service.createGroup(mockTab, 'DB Group')
      expect(group.collapsed).toBe(false)

      service.toggleGroupCollapse(group.id)
      const after1 = service.groups.find((g) => g.id === group.id)
      expect(after1?.collapsed).toBe(true)

      service.toggleGroupCollapse(group.id)
      const after2 = service.groups.find((g) => g.id === group.id)
      expect(after2?.collapsed).toBe(false)
    })

    it('should remove tab from group and auto delete empty group', () => {
      const mockTab: any = { id: 'tab-1' }
      const group = service.createGroup(mockTab, 'My Group')
      expect(service.groups.length).toBe(1)

      service.removeTabFromGroup(mockTab)
      expect(service.getGroupByTab(mockTab)).toBeUndefined()
    })

    it('should close all tabs in group when closeGroup is invoked', () => {
      const mockTab1: any = { id: 'tab-1' }
      const mockTab2: any = { id: 'tab-2' }
      mockApp.tabs = [mockTab1, mockTab2]
      const group = service.createGroup(mockTab1, 'Group to close')
      service.addTabToGroup(mockTab2, group.id)

      service.closeGroup(group.id)
      expect(mockApp.closeTab).toHaveBeenCalledWith(mockTab1)
      expect(mockApp.closeTab).toHaveBeenCalledWith(mockTab2)
      expect(service.groups.length).toBe(0)
    })
  })

  describe('WorkbenchToolbarComponent - Split Close Icon Visibility', () => {
    let toolbar: WorkbenchToolbarComponent
    let mockNotifications: any
    let mockLogger: any
    let mockConfig: any
    let mockApp: any
    let mockElementRef: any
    let mockCdr: any

    beforeEach(() => {
      mockNotifications = { notice: jest.fn(), info: jest.fn() }
      mockLogger = {}
      mockConfig = {}
      mockElementRef = { nativeElement: { contains: jest.fn() } }
      mockCdr = { detectChanges: jest.fn() }
      mockApp = {
        activeTab: null,
        getParentTab: jest.fn(),
        closeTab: jest.fn().mockResolvedValue(undefined),
      }
      toolbar = new WorkbenchToolbarComponent(
        mockNotifications,
        mockLogger,
        mockConfig,
        mockElementRef,
        mockCdr,
        undefined,
        mockApp
      )
    })

    it('hasMultipleViews should return false when no split parent or only 1 tab exists', () => {
      toolbar.activeTerminalTab = { id: 'leaf-1' }
      expect(toolbar.hasMultipleViews).toBe(false)
    })

    it('hasMultipleViews should return true when parent has multiple tabs', () => {
      const leaf1: any = { id: 'leaf-1' }
      const leaf2: any = { id: 'leaf-2' }
      const splitParent: any = {
        getAllTabs: () => [leaf1, leaf2],
        removeTab: jest.fn(),
      }
      leaf1.parent = splitParent
      toolbar.activeTerminalTab = leaf1

      expect(toolbar.hasMultipleViews).toBe(true)
    })

    it('closeCurrentSplitView should delegate to app.closeTab', () => {
      const leaf1: any = { id: 'leaf-1' }
      toolbar.activeTerminalTab = leaf1

      toolbar.closeCurrentSplitView()
      expect(mockApp.closeTab).toHaveBeenCalledWith(leaf1, true)
    })
  })

  describe('WorkbenchBottomDockComponent - Reverse Order & Resizing', () => {
    let dock: WorkbenchBottomDockComponent
    let store: TransferStore
    let mockConfig: any
    let mockCdr: any

    beforeEach(() => {
      store = new TransferStore()
      mockConfig = {
        store: { secureWorkbench: { transferQueueHeight: 180 } },
        save: jest.fn(),
      }
      mockCdr = { detectChanges: jest.fn() }
      dock = new WorkbenchBottomDockComponent(mockCdr, mockConfig)
      dock.store = store
    })

    it('should initialize height from config and load tasks in reverse order (newest first)', () => {
      dock.ngOnInit()
      expect(dock.height).toBe(180)

      store.addTask({ id: '1', name: 'task-1.txt', direction: 'upload', totalBytes: 1000, sourcePath: '/a/1', targetPath: '/b/1' })
      store.addTask({ id: '2', name: 'task-2.txt', direction: 'download', totalBytes: 2000, sourcePath: '/a/2', targetPath: '/b/2' })
      store.addTask({ id: '3', name: 'task-3.txt', direction: 'upload', totalBytes: 3000, sourcePath: '/a/3', targetPath: '/b/3' })

      expect(dock.tasks.length).toBe(3)
      // Newest (task-3) must be on top!
      expect(dock.tasks[0].name).toBe('task-3.txt')
      expect(dock.tasks[1].name).toBe('task-2.txt')
      expect(dock.tasks[2].name).toBe('task-1.txt')

      dock.ngOnDestroy()
    })

    it('should return correct Chinese status labels', () => {
      expect(dock.getStatusLabel('running')).toBe('传输中')
      expect(dock.getStatusLabel('queued')).toBe('排队中')
      expect(dock.getStatusLabel('succeeded')).toBe('已完成')
      expect(dock.getStatusLabel('failed')).toBe('失败')
      expect(dock.getStatusLabel('cancelled')).toBe('已取消')
    })
  })

  describe('WorkbenchQuickSearchModalComponent - Profile Priority & Shortcuts', () => {
    let modal: WorkbenchQuickSearchModalComponent
    let mockApp: any
    let mockConfig: any
    let mockProfiles: any
    let mockCdr: any

    beforeEach(() => {
      mockApp = {}
      mockConfig = {
        store: {
          profiles: [
            { id: 'p1', name: 'Bastion Server', options: { host: '10.0.0.1', user: 'ops', port: 22 } },
            { id: 'p2', name: 'Database Server', options: { host: '10.0.0.2', user: 'db', port: 5432 } },
          ],
        },
      }
      mockProfiles = {
        getProfiles: jest.fn().mockResolvedValue(mockConfig.store.profiles),
        openNewTabForProfile: jest.fn().mockResolvedValue({}),
        quickConnect: jest.fn().mockResolvedValue(null),
      }
      mockCdr = { detectChanges: jest.fn() }
      modal = new WorkbenchQuickSearchModalComponent(mockApp, mockConfig, mockCdr, mockProfiles)
    })

    it('should place existing saved profiles BEFORE direct connect options', async () => {
      modal.ngOnInit()
      await Promise.resolve()

      modal.searchQuery = 'Bastion'
      modal.onSearchInput()

      expect(modal.dropdownOptions.length).toBeGreaterThanOrEqual(3)
      // First item MUST be the matching saved profile
      expect(modal.dropdownOptions[0].type).toBe('profile')
      expect(modal.dropdownOptions[0].label).toBe('Bastion Server')

      // Direct options must follow
      const directOptions = modal.dropdownOptions.filter((o) => o.type === 'direct')
      expect(directOptions.length).toBe(2)
      expect(directOptions[0].protocol).toBe('SSH')
      expect(directOptions[1].protocol).toBe('TELNET')

      modal.ngOnDestroy()
    })

    it('executeOption with openSftp=true should set __autoOpenSftpFull flag', async () => {
      modal.ngOnInit()
      await Promise.resolve()

      const opt = {
        type: 'profile' as const,
        protocol: 'SSH' as const,
        label: 'Bastion Server',
        profile: { id: 'p1', name: 'Bastion Server', options: { host: '10.0.0.1' } },
      }

      await modal.executeOption(opt, true)
      expect(mockProfiles.openNewTabForProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          __autoOpenSftpFull: true,
          options: expect.objectContaining({
            __autoOpenSftpFull: true,
          }),
        })
      )

      modal.ngOnDestroy()
    })

    it('onKeyDown should distinguish between Enter and Shift + Enter', async () => {
      modal.ngOnInit()
      await Promise.resolve()

      modal.searchQuery = '10.0.0.1'
      modal.onSearchInput()

      const spy = jest.spyOn(modal, 'executeOption').mockImplementation(() => Promise.resolve())

      // 1. Enter key -> openSftp = false
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false })
      modal.onKeyDown(enterEvent)
      expect(spy).toHaveBeenCalledWith(modal.dropdownOptions[0], false)

      // 2. Shift + Enter key -> openSftp = true
      const shiftEnterEvent = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true })
      modal.onKeyDown(shiftEnterEvent)
      expect(spy).toHaveBeenCalledWith(modal.dropdownOptions[0], true)

      modal.ngOnDestroy()
    })
  })
})
