import { WorkbenchDrawerComponent } from '../src/shell/workbench-drawer.component'

describe('SecureCRT Session Manager Drawer', () => {
  let drawer: WorkbenchDrawerComponent
  let mockProfilesService: any
  let mockConfig: any
  let mockNotifications: any

  const sampleProfiles = [
    {
      id: 'p1',
      name: '127.0.0.1',
      group: 'Local Devices',
      options: { host: '127.0.0.1', user: 'splitfire', port: 22 },
    },
    {
      id: 'p2',
      name: '192.168.1.110',
      group: 'Lab Servers',
      options: { host: '192.168.1.110', user: 'yangguangjian', port: 9999 },
    },
    {
      id: 'p3',
      name: '192.168.1.201',
      group: 'Lab Servers',
      options: { host: '192.168.1.201', user: 'root', port: 22 },
    },
    {
      id: 'p4',
      name: 'Gateway-Router',
      options: { host: '10.0.0.1', user: 'admin', port: 22 },
    },
  ]

  beforeEach(() => {
    mockConfig = {
      store: {
        secureWorkbench: {},
        profiles: sampleProfiles,
      },
      save: jest.fn(),
    }
    mockNotifications = {
      error: jest.fn(),
      info: jest.fn(),
    }
    mockProfilesService = {
      getProfiles: jest.fn().mockResolvedValue(sampleProfiles),
      showProfileSelector: jest.fn(),
    }

    drawer = new WorkbenchDrawerComponent(mockConfig, mockNotifications, mockProfilesService)
    drawer.savedProfiles = [...sampleProfiles]
  })

  it('should group profiles into folders correctly', () => {
    const groups = drawer.filteredGroups
    expect(groups.length).toBe(2)
    const groupNames = groups.map(g => g.name)
    expect(groupNames).toContain('Local Devices')
    expect(groupNames).toContain('Lab Servers')

    const labGroup = groups.find(g => g.name === 'Lab Servers')!
    expect(labGroup.profiles.length).toBe(2)
  })

  it('should list ungrouped profiles under root Sessions', () => {
    const ungrouped = drawer.filteredUngroupedProfiles
    expect(ungrouped.length).toBe(1)
    expect(ungrouped[0].name).toBe('Gateway-Router')
  })

  it('should filter profiles and folders by search keyword', () => {
    drawer.sessionFilter = '127'
    const filteredGroups = drawer.filteredGroups
    expect(filteredGroups.length).toBe(1)
    expect(filteredGroups[0].profiles[0].name).toBe('127.0.0.1')

    drawer.sessionFilter = 'Lab'
    expect(drawer.filteredGroups.length).toBe(1)
    expect(drawer.filteredGroups[0].profiles.length).toBe(2)

    drawer.sessionFilter = 'Gateway'
    expect(drawer.filteredGroups.length).toBe(0)
    expect(drawer.filteredUngroupedProfiles.length).toBe(1)
  })

  it('should detect active connected profile for SecureCRT red highlight', () => {
    drawer.activeProfile = sampleProfiles[0]
    expect(drawer.isProfileActive(sampleProfiles[0])).toBe(true)
    expect(drawer.isProfileActive(sampleProfiles[1])).toBe(false)

    // Match by host in activeTerminalTab
    drawer.activeProfile = null
    drawer.activeTerminalTab = {
      profile: { options: { host: '192.168.1.110' } },
    }
    expect(drawer.isProfileActive(sampleProfiles[1])).toBe(true)
  })

  it('should format profile tooltip with user@host:port', () => {
    const tooltip = drawer.getProfileTooltip(sampleProfiles[1])
    expect(tooltip).toBe('192.168.1.110 (yangguangjian@192.168.1.110:9999)')
  })
})
