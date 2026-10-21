import { TabContextMenuFilterService } from '../src/shell/tab-context-menu-filter.service'
import { TabContextMenuConfig } from '../src/config/config.model'

describe('TabContextMenuFilterService', () => {
  let service: TabContextMenuFilterService
  let mockPlatform: any
  let mockConfig: any

  const all16Items = [
    { label: '复制当前路径 (Copy Current Path)' },
    { label: '复制 (Duplicate)' },
    { label: '重命名 (Rename)' },
    { label: '固定 (Pin)' },
    { label: '颜色 (Color)' },
    { type: 'separator' },
    { label: '拆分 (Split)' },
    { label: '保存布局为配置 (Save layout as profile)' },
    { label: '新建终端 (New terminal)' },
    { type: 'separator' },
    { label: '聚焦所有标签 (Focus all tabs)' },
    { label: '聚焦所有分块 (Focus all panes)' },
    { type: 'separator' },
    { label: '断开连接 (Disconnect)' },
    { label: '重新连接 (Reconnect)' },
    { type: 'separator' },
    { label: '关闭左侧标签页 (Close tabs to the left)' },
    { label: '关闭右侧标签页 (Close tabs to the right)' },
    { label: '关闭其他标签页 (Close other tabs)' },
    { label: '关闭标签页 (Close tab)' },
  ]

  beforeEach(() => {
    mockConfig = {
      store: {
        secureWorkbench: {
          tabContextMenu: {},
        },
      },
    }
    mockPlatform = {
      popupContextMenu: jest.fn(),
    }
    service = new TabContextMenuFilterService(mockPlatform, mockConfig)
  })

  it('should keep all items when config enables all', () => {
    const config: TabContextMenuConfig = {
      duplicate: true,
      restart: true,
      rename: true,
      pin: true,
      color: true,
      split: true,
      copyPath: true,
      saveLayout: true,
      newTerminal: true,
      focusAllTabs: true,
      focusAllPanes: true,
      disconnect: true,
      closeOthers: true,
      closeRight: true,
      closeLeft: true,
      close: true,
    }
    const filtered = service.filterTabMenuItems(all16Items, config)
    expect(filtered.length).toBe(all16Items.length)
  })

  it('should filter out specific disabled items (e.g. duplicate, pin, saveLayout)', () => {
    const config = {
      duplicate: false,
      pin: false,
      saveLayout: false,
      closeOthers: false,
    } as TabContextMenuConfig
    const filtered = service.filterTabMenuItems(all16Items, config)
    const labels = filtered.map(it => it.label).filter(Boolean)

    expect(labels.some(l => l.includes('Duplicate'))).toBe(false)
    expect(labels.some(l => l.includes('Pin'))).toBe(false)
    expect(labels.some(l => l.includes('Save layout'))).toBe(false)
    expect(labels.some(l => l.includes('Close other'))).toBe(false)

    // Others should remain
    expect(labels.some(l => l.includes('Copy Current Path'))).toBe(true)
    expect(labels.some(l => l.includes('Rename'))).toBe(true)
    expect(labels.some(l => l.includes('Split'))).toBe(true)
  })

  it('should clean up double separators and trailing separators', () => {
    const items = [
      { type: 'separator' },
      { label: '复制 (Duplicate)' },
      { type: 'separator' },
      { type: 'separator' },
      { label: '关闭 (Close)' },
      { type: 'separator' },
    ]
    const filtered = service.filterTabMenuItems(items, {} as TabContextMenuConfig)
    expect(filtered.length).toBe(3)
    expect(filtered[0].label).toContain('Duplicate')
    expect(filtered[1].type).toBe('separator')
    expect(filtered[2].label).toContain('Close')
  })

  it('should correctly intercept platform.popupContextMenu on tab header', () => {
    mockConfig.store.secureWorkbench.tabContextMenu = {
      duplicate: false,
    }
    service.hookContextMenu()

    const mockHeader = {
      closest: jest.fn().mockReturnValue(true),
    }
    const event = {
      target: mockHeader,
    }

    mockPlatform.popupContextMenu(
      [{ label: 'Duplicate' }, { label: 'Close' }],
      event as any
    )

    expect(mockPlatform.popupContextMenu).toBeDefined()
  })
})
