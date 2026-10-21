import { WorkbenchDialogService } from '../src/shell/workbench-dialog.service'
import { WorkbenchModalsComponent } from '../src/shell/workbench-modals.component'
import { WorkbenchWelcomeComponent } from '../src/shell/workbench-welcome.component'
import { WorkbenchGlobalTitleBarComponent } from '../src/shell/workbench-global-title-bar.component'

describe('Workbench Dialogs, Modals, and Welcome Screen', () => {
  describe('WorkbenchDialogService', () => {
    let service: WorkbenchDialogService

    beforeEach(() => {
      service = new WorkbenchDialogService()
    })

    it('should open and close settings modal dialog', () => {
      expect(service.isSettingsOpen).toBe(false)
      service.openSettings()
      expect(service.isSettingsOpen).toBe(true)
      expect(service.isAboutOpen).toBe(false)

      service.closeSettings()
      expect(service.isSettingsOpen).toBe(false)
    })

    it('should open and close about modal dialog', () => {
      expect(service.isAboutOpen).toBe(false)
      service.openAbout()
      expect(service.isAboutOpen).toBe(true)
      expect(service.isSettingsOpen).toBe(false)

      service.closeAbout()
      expect(service.isAboutOpen).toBe(false)
    })

    it('should open and close native settings modal dialog', () => {
      expect(service.isNativeSettingsOpen).toBe(false)
      service.openNativeSettings()
      expect(service.isNativeSettingsOpen).toBe(true)
      expect(service.isSettingsOpen).toBe(false)

      service.closeNativeSettings()
      expect(service.isNativeSettingsOpen).toBe(false)
    })

    it('should close all dialogs with closeAll()', () => {
      service.openSettings()
      service.openNativeSettings()
      expect(service.isNativeSettingsOpen).toBe(true)
      service.closeAll()
      expect(service.isSettingsOpen).toBe(false)
      expect(service.isAboutOpen).toBe(false)
      expect(service.isNativeSettingsOpen).toBe(false)
    })
  })

  describe('WorkbenchModalsComponent', () => {
    let component: WorkbenchModalsComponent
    let dialogService: WorkbenchDialogService
    let mockConfig: any
    let mockApp: any

    beforeEach(() => {
      dialogService = new WorkbenchDialogService()
      mockConfig = {
        store: {
          secureWorkbench: {
            frameworkTheme: 'securecrt',
            showTabIndices: false,
            showTabCloseButton: true,
            hideNativeSFTPButton: false,
            defaultEncoding: 'UTF-8',
            dockHeight: 140,
            logging: { directory: '~/.tabby-logs' },
          },
        },
        save: jest.fn(),
      }
      mockApp = {
        openNewTab: jest.fn(),
      }
      component = new WorkbenchModalsComponent(dialogService, mockConfig, mockApp)
    })

    it('should update modal visibility from dialog service including native settings', () => {
      component.ngOnInit()
      expect(component.showSettings).toBe(false)
      expect(component.showAbout).toBe(false)
      expect(component.showNativeSettings).toBe(false)

      dialogService.openSettings()
      expect(component.showSettings).toBe(true)

      dialogService.openNativeSettings()
      expect(component.showNativeSettings).toBe(true)

      component.onEscape()
      expect(component.showSettings).toBe(false)
      expect(component.showAbout).toBe(false)
      expect(component.showNativeSettings).toBe(false)
      component.ngOnDestroy()
    })

    it('should switch tabs directly on the right side without waterfall scroll', () => {
      expect(component.activeNavId).toBe('appearance')
      component.activeNavId = 'tabs'
      expect(component.activeNavId).toBe('tabs')
      component.activeNavId = 'default-session'
      expect(component.activeNavId).toBe('default-session')
      component.activeNavId = 'advanced'
      expect(component.activeNavId).toBe('advanced')
    })

    it('should open native settings modal via openNativeSettings()', () => {
      component.ngOnInit()
      component.openNativeSettings()
      expect(dialogService.isNativeSettingsOpen).toBe(true)
      component.closeNativeSettings()
      expect(dialogService.isNativeSettingsOpen).toBe(false)
      component.ngOnDestroy()
    })

    it('should get and set frameworkTheme, tab indices, tab close button', () => {
      expect(component.frameworkTheme).toBe('securecrt')
      component.frameworkTheme = 'onedark'
      expect(mockConfig.store.secureWorkbench.frameworkTheme).toBe('onedark')

      expect(component.showTabIndices).toBe(false)
      component.showTabIndices = true
      expect(mockConfig.store.secureWorkbench.showTabIndices).toBe(true)

      expect(component.showTabCloseButton).toBe(true)
      component.showTabCloseButton = false
      expect(mockConfig.store.secureWorkbench.showTabCloseButton).toBe(false)

      expect(component.hideNativeSFTP).toBe(false)
      component.hideNativeSFTP = true
      expect(mockConfig.store.secureWorkbench.hideNativeSFTPButton).toBe(true)
    })
  })

  describe('WorkbenchWelcomeComponent', () => {
    let component: WorkbenchWelcomeComponent
    let mockApp: any
    let mockConfig: any
    let mockProfiles: any
    let mockDialog: any

    const testProfiles = [
      { id: '1', name: 'Web Server', options: { host: '192.168.1.10', user: 'root', port: 22 } },
      { id: '2', name: 'DB Server', options: { host: '192.168.1.20', user: 'postgres', port: 5432 } },
    ]

    beforeEach(() => {
      mockApp = {}
      mockConfig = {
        store: { profiles: testProfiles },
      }
      mockProfiles = {
        getProfiles: jest.fn().mockResolvedValue(testProfiles),
        openNewTabForProfile: jest.fn().mockResolvedValue({}),
        quickConnect: jest.fn().mockResolvedValue(testProfiles[0]),
      }
      const mockCdr: any = { detectChanges: jest.fn(), markForCheck: jest.fn() }
      component = new WorkbenchWelcomeComponent(mockApp, mockConfig, mockCdr, mockProfiles, mockDialog)
    })

    it('should load profiles and generate predictive dropdown options', async () => {
      component.ngOnInit()
      await Promise.resolve()

      expect(component.profiles.length).toBe(2)

      component.searchQuery = '192.168.1.10'
      component.onSearchInput()
      expect(component.dropdownOptions.length).toBeGreaterThanOrEqual(3)
      // Existing profile must come FIRST
      expect(component.dropdownOptions[0].type).toBe('profile')
      expect(component.dropdownOptions[0].label).toBe('Web Server')
      // Followed by direct options
      const directSSH = component.dropdownOptions.find((o) => o.type === 'direct' && o.protocol === 'SSH')
      const directTelnet = component.dropdownOptions.find((o) => o.type === 'direct' && o.protocol === 'TELNET')
      expect(directSSH).toBeTruthy()
      expect(directTelnet).toBeTruthy()

      component.ngOnDestroy()
    })

    it('should quick connect on executeOption', async () => {
      component.ngOnInit()
      await Promise.resolve()

      component.searchQuery = 'admin@10.0.0.1:22'
      component.onSearchInput()
      await component.executeOption(component.dropdownOptions[0])
      expect(mockProfiles.quickConnect).toHaveBeenCalledWith('admin@10.0.0.1:22')
      expect(mockProfiles.openNewTabForProfile).toHaveBeenCalled()
    })
  })

  describe('WorkbenchGlobalTitleBarComponent', () => {
    let component: WorkbenchGlobalTitleBarComponent
    let mockApp: any
    let mockHostWindow: any
    let mockConfig: any
    let mockCdr: any
    let mockHostShell: any
    let mockDialog: any

    beforeEach(() => {
      mockApp = {
        activeTab: {
          title: 'Production Jumpbox',
          profile: {
            name: 'Jumpbox',
            options: { host: '10.10.10.1', user: 'ops', port: 22 },
          },
        },
      }
      mockHostWindow = {
        minimize: jest.fn(),
        toggleMaximize: jest.fn(),
        close: jest.fn(),
      }
      mockConfig = {}
      mockCdr = { detectChanges: jest.fn() }
      mockHostShell = {
        isWorkbenchMode: true,
      }
      mockDialog = {
        openSettings: jest.fn(),
      }

      component = new WorkbenchGlobalTitleBarComponent(
        mockApp,
        mockHostWindow,
        mockConfig,
        mockCdr,
        mockHostShell,
        mockDialog
      )
    })

    it('should format title with user@host:port', () => {
      expect(component.displayTitle).toBe('Production Jumpbox - ops@10.10.10.1:22')
    })

    it('should trigger window controls', () => {
      component.minimize()
      expect(mockHostWindow.minimize).toHaveBeenCalled()
      component.toggleMaximize()
      expect(mockHostWindow.toggleMaximize).toHaveBeenCalled()
      component.close()
      expect(mockHostWindow.close).toHaveBeenCalled()
    })

    it('should open settings modal dialog via dialog service', () => {
      component.openSettings()
      expect(mockDialog.openSettings).toHaveBeenCalled()
    })

    it('should correctly report Disconnected when session is closed or undefined', () => {
      // 1. Session is null
      mockApp.activeTab.session = null
      expect(component.connectionState).toBe('Disconnected')

      // 2. Session open is false
      mockApp.activeTab.session = { open: false }
      expect(component.connectionState).toBe('Disconnected')

      // 3. Session open is true
      mockApp.activeTab.session = { open: true }
      expect(component.connectionState).toBe('Connected')
    })
  })

  describe('TabContextMenuFilterService', () => {
    let service: any

    beforeEach(() => {
      const { TabContextMenuFilterService } = require('../src/shell/tab-context-menu-filter.service')
      service = new TabContextMenuFilterService(null, null)
    })

    it('should filter tab context menu items according to user config', () => {
      const items = [
        { label: 'Duplicate' },
        { label: 'Restart' },
        { type: 'separator' },
        { label: 'Rename' },
        { label: 'Split' },
        { label: 'Close other tabs' },
        { label: 'Close tabs to the right' },
        { label: 'Close' },
      ]
      const config = {
        duplicate: false,
        restart: true,
        rename: true,
        split: false,
        color: true,
        closeOthers: true,
        closeRight: false,
        close: true,
      }
      const filtered = service.filterTabMenuItems(items, config)
      const labels = filtered.map((i: any) => i.label)
      expect(labels).not.toContain('Duplicate')
      expect(labels).toContain('Restart')
      expect(labels).toContain('Rename')
      expect(labels).not.toContain('Split')
      expect(labels).toContain('Close other tabs')
      expect(labels).not.toContain('Close tabs to the right')
      expect(labels).toContain('Close')
    })
  })

  describe('WorkbenchDrawerComponent 3-Tier Categorization', () => {
    let drawer: any
    let mockProfiles: any

    beforeEach(() => {
      const { WorkbenchDrawerComponent } = require('../src/shell/workbench-drawer.component')
      mockProfiles = {
        getProfiles: jest.fn().mockResolvedValue([
          { id: '1', name: 'My Server', group: 'Production', type: 'ssh' },
          { id: 'ssh:config:bastion', name: 'Bastion', type: 'ssh' },
          { id: 'local:bash', name: 'Bash', type: 'local', isBuiltin: true },
        ]),
      }
      drawer = new WorkbenchDrawerComponent({ store: {} }, {}, mockProfiles, {})
    })

    it('should categorize profiles into Saved, Imported, and Built-in', async () => {
      await drawer.loadProfiles()
      expect(drawer.savedProfilesList.length).toBe(1)
      expect(drawer.savedProfilesList[0].name).toBe('My Server')

      expect(drawer.importedProfilesList.length).toBe(1)
      expect(drawer.importedProfilesList[0].name).toBe('Bastion')

      expect(drawer.builtinProfilesList.length).toBe(1)
      expect(drawer.builtinProfilesList[0].name).toBe('Bash')
    })
  })

  describe('WorkbenchSftpPaneComponent Multi-View Mode', () => {
    let sftpPane: any
    let store: any
    let clipboard: any
    let relay: any
    let notifications: any

    beforeEach(() => {
      clipboard = {
        hasItem: jest.fn().mockReturnValue(false),
        getItem: jest.fn().mockReturnValue(null),
        copy: jest.fn(),
      }
      relay = {}
      notifications = {
        info: jest.fn(),
        notice: jest.fn(),
        error: jest.fn(),
      }
      store = {
        addTask: jest.fn(),
        updateTaskStatus: jest.fn(),
        updateProgress: jest.fn(),
      }

      const { WorkbenchSftpPaneComponent } = require('../src/shell/workbench-sftp-pane.component')
      sftpPane = new WorkbenchSftpPaneComponent(clipboard, relay, notifications)
      sftpPane.store = store
      sftpPane.ngOnInit()
    })

    it('should initialize with 1 view and default single-tab mode', () => {
      expect(sftpPane.views.length).toBe(1)
      expect(sftpPane.activeView).toBeDefined()
      expect(sftpPane.activeView.title).toBe('视图 1')
      expect(sftpPane.viewDisplayMode).toBe('single-tab')
      expect(sftpPane.displayedViews.length).toBe(1)
    })

    it('should add new views and inherit paths from active view', () => {
      const os = require('os')
      const tmpPath = os.tmpdir()
      sftpPane.activeView.localPath = tmpPath
      sftpPane.activeView.remotePath = '/var/www'
      sftpPane.addNewView()

      expect(sftpPane.views.length).toBe(2)
      expect(sftpPane.activeView.title).toBe('视图 2')
      expect(sftpPane.activeView.localPath).toBe(tmpPath)
      expect(sftpPane.activeView.remotePath).toBe('/var/www')
      expect(notifications.info).toHaveBeenCalledWith('已开启新视图: 视图 2')
    })

    it('should switch between views and manage display modes', () => {
      sftpPane.addNewView()
      const v1 = sftpPane.views[0]
      const v2 = sftpPane.views[1]

      sftpPane.setActiveView(v1.id)
      expect(sftpPane.activeViewId).toBe(v1.id)

      // Single-tab display mode shows only active view
      sftpPane.viewDisplayMode = 'single-tab'
      expect(sftpPane.displayedViews.length).toBe(1)
      expect(sftpPane.displayedViews[0].id).toBe(v1.id)

      // Split modes show all views
      sftpPane.viewDisplayMode = 'split-horizontal'
      expect(sftpPane.displayedViews.length).toBe(2)

      sftpPane.viewDisplayMode = 'split-vertical'
      expect(sftpPane.displayedViews.length).toBe(2)
    })

    it('should close views and prevent closing the last remaining view', () => {
      sftpPane.addNewView()
      expect(sftpPane.views.length).toBe(2)
      const v2Id = sftpPane.views[1].id

      sftpPane.closeView(v2Id)
      expect(sftpPane.views.length).toBe(1)

      // Attempting to close last view
      sftpPane.closeView(sftpPane.views[0].id)
      expect(sftpPane.views.length).toBe(1)
      expect(notifications.notice).toHaveBeenCalledWith('至少保留一个视图窗口')
    })

    it('should navigate active view when navigateTo() is called', () => {
      const os = require('os')
      const tmpPath = os.tmpdir()
      sftpPane.navigateTo(tmpPath, '/new/remote')
      expect(sftpPane.activeView.localPath).toBe(tmpPath)
      expect(sftpPane.activeView.remotePath).toBe('/new/remote')
    })

    it('should share single TransferStore across multiple views', () => {
      sftpPane.addNewView()
      const v1 = sftpPane.views[0]
      const v2 = sftpPane.views[1]

      v1.selectedLocalFile = { name: 'file1.txt', isDirectory: false, size: 100 }
      sftpPane.uploadSelectedFile(v1)
      expect(store.addTask).toHaveBeenCalledTimes(1)

      v2.selectedLocalFile = { name: 'file2.txt', isDirectory: false, size: 200 }
      sftpPane.uploadSelectedFile(v2)
      expect(store.addTask).toHaveBeenCalledTimes(2)
    })
  })
})

