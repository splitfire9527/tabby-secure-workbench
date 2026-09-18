import { WorkbenchSidebarComponent } from '../src/shell/workbench-sidebar.component'
import { Subject } from 'rxjs'

describe('WorkbenchSidebarComponent (Host-level Shell)', () => {
  let sidebar: WorkbenchSidebarComponent
  let mockApp: any
  let mockConfig: any
  let mockProfilesService: any
  let mockNotifications: any
  let tabsChanged$: Subject<void>
  let activeTabChange$: Subject<any>

  const sampleProfiles = [
    {
      id: 'p1',
      name: 'Gateway-SSH',
      group: 'Production',
      options: { host: '192.168.1.10', user: 'root', port: 22 },
    },
    {
      id: 'p2',
      name: 'Lab-Host',
      group: 'Lab',
      options: { host: '192.168.100.60', user: 'root', port: 22 },
    },
  ]

  beforeEach(() => {
    tabsChanged$ = new Subject<void>()
    activeTabChange$ = new Subject<any>()

    mockApp = {
      tabs: [],
      activeTab: null,
      tabsChanged$,
      activeTabChange$,
      selectTab: jest.fn(),
    }

    mockConfig = {
      store: { secureWorkbench: {} },
      save: jest.fn(),
    }

    mockProfilesService = {
      getProfiles: jest.fn().mockResolvedValue(sampleProfiles),
      openNewTabForProfile: jest.fn().mockResolvedValue({}),
      quickConnect: jest.fn().mockResolvedValue(sampleProfiles[0]),
    }

    mockNotifications = {
      info: jest.fn(),
      error: jest.fn(),
    }

    const mockZone: any = {
      run: (fn: Function) => fn(),
    }

    const mockCdr: any = {
      markForCheck: jest.fn(),
    }

    sidebar = new WorkbenchSidebarComponent(
      mockApp,
      mockConfig,
      mockZone,
      mockCdr,
      mockProfilesService,
      mockNotifications
    )
  })

  afterEach(() => {
    sidebar.ngOnDestroy()
  })

  it('should initialize and listen to tab changes', () => {
    sidebar.ngOnInit()
    expect(sidebar.activeView).toBe('sessions')
    expect(sidebar.isCollapsed).toBe(false)

    // Simulate tab addition
    const dummyTab = { title: 'Terminal', session: {} }
    mockApp.tabs = [dummyTab]
    tabsChanged$.next()

    expect(sidebar.activeSessions.length).toBe(1)
    expect(sidebar.activeSessions[0]).toBe(dummyTab)
  })

  it('should toggle sidebar collapse state', () => {
    expect(sidebar.isCollapsed).toBe(false)
    sidebar.toggleCollapse()
    expect(sidebar.isCollapsed).toBe(true)
    sidebar.toggleCollapse()
    expect(sidebar.isCollapsed).toBe(false)
  })

  it('should collapse when clicking the active view icon again', () => {
    sidebar.activeView = 'sessions'
    sidebar.isCollapsed = false

    // Click same tab
    sidebar.onViewChange('sessions')
    expect(sidebar.isCollapsed).toBe(true)

    // Click different tab
    sidebar.onViewChange('commands')
    expect(sidebar.activeView).toBe('commands')
    expect(sidebar.isCollapsed).toBe(false)
  })

  it('should switch to tab if profile is already open in workspace', async () => {
    const existingTab = {
      title: 'Gateway-SSH',
      profile: sampleProfiles[0],
    }
    mockApp.tabs = [existingTab]

    await sidebar.onSelectSession(sampleProfiles[0])
    expect(mockApp.selectTab).toHaveBeenCalledWith(existingTab)
    expect(mockProfilesService.openNewTabForProfile).not.toHaveBeenCalled()
  })

  it('should open new tab in right workspace if profile is not open yet', async () => {
    mockApp.tabs = []

    await sidebar.onSelectSession(sampleProfiles[0])
    expect(mockProfilesService.openNewTabForProfile).toHaveBeenCalledWith(sampleProfiles[0])
  })

  it('should handle quick connect correctly', async () => {
    await sidebar.onQuickConnect({ host: '10.0.0.1', port: 22, user: 'admin' })
    expect(mockProfilesService.quickConnect).toHaveBeenCalledWith('admin@10.0.0.1:22')
    expect(mockProfilesService.openNewTabForProfile).toHaveBeenCalledWith(sampleProfiles[0])
  })
})
