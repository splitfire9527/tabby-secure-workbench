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

  it('should deduplicate host in primary and secondary text', () => {
    // When name is remark:
    expect(drawer.getProfilePrimaryName(sampleProfiles[3])).toBe('Gateway-Router')
    expect(drawer.getProfileSecondaryText(sampleProfiles[3])).toBe('admin@10.0.0.1')

    // When name is host:
    expect(drawer.getProfilePrimaryName(sampleProfiles[1])).toBe('192.168.1.110')
    expect(drawer.getProfileSecondaryText(sampleProfiles[1])).toBe('yangguangjian')

    // Standard port 22 with host name:
    expect(drawer.getProfilePrimaryName(sampleProfiles[0])).toBe('127.0.0.1')
    expect(drawer.getProfileSecondaryText(sampleProfiles[0])).toBe('splitfire')
  })

  it('should hide protocol badge for standard port 22 SSH and show for non-standard or other types', () => {
    // Standard SSH port 22 -> null (hidden)
    expect(drawer.getProfileTypeBadge(sampleProfiles[0])).toBeNull()
    expect(drawer.getProfileTypeBadge(sampleProfiles[2])).toBeNull()

    // Non-standard port 9999 -> :9999
    expect(drawer.getProfileTypeBadge(sampleProfiles[1])).toBe(':9999')

    // Serial -> SERIAL
    expect(drawer.getProfileTypeBadge({ type: 'serial', options: {} })).toBe('SERIAL')
  })

  it('should translate Imported from .ssh/config to Chinese', () => {
    expect(drawer.getGroupDisplayName('Imported from .ssh/config')).toBe('SSH 配置导入')
    expect(drawer.getGroupDisplayName('Lab Servers')).toBe('Lab Servers')
  })

  it('should map protocol icons to Tabby style icons', () => {
    expect(drawer.getProfileIconClass({ type: 'ssh', options: { host: '1.2.3.4' } })).toBe('fas fa-desktop')
    expect(drawer.getProfileIconClass({ type: 'serial', options: {} })).toBe('fas fa-microchip')
    expect(drawer.getProfileIconClass({ type: 'telnet', options: {} })).toBe('fas fa-sitemap')
    expect(drawer.getProfileIconClass({ type: 'local', options: {} })).toBe('fas fa-terminal')
    expect(drawer.getProfileIconClass({ options: { host: '192.168.1.1' } })).toBe('fas fa-desktop')
  })

  it('should identify SSH profiles for hover SFTP button', () => {
    expect(drawer.isSshProfile({ type: 'ssh', options: {} })).toBe(true)
    expect(drawer.isSshProfile({ options: { host: '1.2.3.4' } })).toBe(true)
    expect(drawer.isSshProfile({ type: 'serial', options: {} })).toBe(false)
    expect(drawer.isSshProfile({ type: 'local', options: {} })).toBe(false)
  })

  it('should handle hideSavedRootWhenSole and isOnlySavedRoot correctly', () => {
    // Only saved profiles present, no imported, no builtin
    drawer.showImportedSessions = true
    drawer.showBuiltinSessions = false
    drawer.hideSavedRootWhenSole = false
    expect(drawer.isOnlySavedRoot).toBe(true)
    expect(drawer.shouldHideSavedRoot).toBe(false)

    // User enables hideSavedRootWhenSole
    drawer.hideSavedRootWhenSole = true
    expect(drawer.shouldHideSavedRoot).toBe(true)

    // If imported sessions exist and showImportedSessions is true:
    drawer.savedProfiles.push({ id: 'imported:1', name: 'Imported Host', isImported: true })
    expect(drawer.isOnlySavedRoot).toBe(false)
    expect(drawer.shouldHideSavedRoot).toBe(false)

    // If user hides imported sessions:
    drawer.showImportedSessions = false
    expect(drawer.isOnlySavedRoot).toBe(true)
    expect(drawer.shouldHideSavedRoot).toBe(true)
  })

  it('should provide trackBy functions for stable DOM reconciliation', () => {
    expect(drawer.trackByGroupName(0, { name: '运维网关', profiles: [], expanded: true })).toBe('运维网关')
    expect(drawer.trackByProfileId(0, { id: 'workbench:123', name: 'pi' })).toBe('workbench:123')
    expect(drawer.trackByProfileId(1, { name: 'unnamed-session' })).toBe('unnamed-session')
  })

  it('should cache filteredData to prevent Angular Zone.js recreation and flicker', () => {
    const data1 = drawer.savedFilteredData
    const data2 = drawer.savedFilteredData
    expect(data1).toBe(data2) // Same object reference

    drawer.sessionFilter = '127'
    const data3 = drawer.savedFilteredData
    expect(data3).not.toBe(data1)
    expect(drawer.savedFilteredData).toBe(data3) // Cached under new query
  })

  it('should auto-normalize missing type to ssh when options.host is present', async () => {
    const rawPi = {
      id: 'workbench:pi',
      name: 'pi',
      group: '运维网关',
      options: { host: '192.168.22.12', port: 22, user: 'root' },
    }
    mockProfilesService.getProfiles.mockResolvedValue([rawPi])
    await drawer.loadProfiles()

    expect(drawer.savedProfiles[0].type).toBe('ssh')

    // Test onSelectProfile
    const profileNoType: any = { options: { host: '192.168.1.1' } }
    drawer.onSelectProfile(profileNoType)
    expect(profileNoType.type).toBe('ssh')

    // Test onConnectProfile
    const profileNoType2: any = { id: 'p-test', options: { host: '192.168.1.2' } }
    let emitted: any = null
    drawer.connectProfile.subscribe(p => emitted = p)
    drawer.onConnectProfile(profileNoType2)
    expect(profileNoType2.type).toBe('ssh')
    expect(emitted?.type).toBe('ssh')
  })
})
