import { WorkbenchSessionConfigService } from '../src/config/workbench-session-config.service'
import { WorkbenchDialogService } from '../src/shell/workbench-dialog.service'
import { WorkbenchSessionOptionsModalComponent } from '../src/shell/workbench-session-options-modal.component'
import { DEFAULT_WORKBENCH_CONFIG } from '../src/config/config.model'

describe('Session Configuration Unification & Default Session Template', () => {
  let mockConfigService: any
  let mockNotificationsService: any
  let sessionConfigService: WorkbenchSessionConfigService
  let dialogService: WorkbenchDialogService

  beforeEach(() => {
    mockConfigService = {
      store: {
        profiles: [
          {
            id: 'prof-1',
            name: 'Production Server',
            type: 'ssh',
            options: {
              host: '192.168.1.100',
              user: 'root',
              port: 22,
            },
          },
          {
            id: 'prof-2',
            name: 'Legacy Server with Custom Logging',
            type: 'ssh',
            options: {
              host: '10.0.0.1',
              user: 'admin',
              port: 2222,
              loggingConfig: {
                startLogUponConnect: true,
                logFileName: '%H-%Y%M%D.log',
                rawLog: true,
              },
            },
          },
        ],
        secureWorkbench: JSON.parse(JSON.stringify(DEFAULT_WORKBENCH_CONFIG)),
      },
      save: jest.fn(),
    }

    mockNotificationsService = {
      info: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    }

    sessionConfigService = new WorkbenchSessionConfigService(
      mockConfigService,
      mockNotificationsService
    )
    dialogService = new WorkbenchDialogService()
  })

  describe('WorkbenchSessionConfigService', () => {
    it('should retrieve default session configuration template', () => {
      const defaultCfg = sessionConfigService.getDefaultSessionConfig()
      expect(defaultCfg).toBeDefined()
      expect(defaultCfg.encoding).toBe('UTF-8')
      expect(defaultCfg.terminalType).toBe('xterm-256color')
      expect(defaultCfg.logging.startLogUponConnect).toBe(false)
      expect(defaultCfg.sftp.preferredDockMode).toBe('bottom')
    })

    it('should save updates to default session configuration template', () => {
      sessionConfigService.saveDefaultSessionConfig({
        encoding: 'GBK',
        terminalType: 'vt100',
        logging: {
          startLogUponConnect: true,
          logFileName: 'default-%H-%Y%M%D.log',
          mode: 'raw',
          appendMode: 'append',
          promptForFilename: false,
          directory: '~/.tabby/logs',
        },
      })

      expect(mockConfigService.save).toHaveBeenCalled()
      const updated = sessionConfigService.getDefaultSessionConfig()
      expect(updated.encoding).toBe('GBK')
      expect(updated.terminalType).toBe('vt100')
      expect(updated.logging.startLogUponConnect).toBe(true)
      expect(updated.logging.logFileName).toBe('default-%H-%Y%M%D.log')
      expect(updated.logging.mode).toBe('raw')
    })

    it('should get effective session config falling back to default session', () => {
      const profile = mockConfigService.store.profiles[0] // prof-1: no overrides
      const effective = sessionConfigService.getSessionConfig(profile)

      expect(effective.encoding).toBe('UTF-8')
      expect(effective.terminalType).toBe('xterm-256color')
      expect(effective.logging.startLogUponConnect).toBe(false)
      expect(effective.sftp.preferredDockMode).toBe('bottom')
    })

    it('should prioritize profile overrides over default session config', () => {
      const profile = {
        id: 'prof-custom',
        name: 'Custom Profile',
        options: {
          secureWorkbench: {
            encoding: 'GB18030',
            terminalType: 'linux',
            logging: {
              startLogUponConnect: true,
              logFileName: 'custom-%S.log',
              mode: 'raw',
              appendMode: 'overwrite',
              promptForFilename: true,
              directory: '/tmp/custom-logs',
            },
            sftp: {
              preferredDockMode: 'right' as const,
              autoOpenSFTP: true,
              initialLocalPath: '/local/app',
              initialRemotePath: '/var/www',
            },
          },
        },
      }

      const effective = sessionConfigService.getSessionConfig(profile)
      expect(effective.encoding).toBe('GB18030')
      expect(effective.terminalType).toBe('linux')
      expect(effective.logging.startLogUponConnect).toBe(true)
      expect(effective.logging.logFileName).toBe('custom-%S.log')
      expect(effective.logging.mode).toBe('raw')
      expect(effective.logging.appendMode).toBe('overwrite')
      expect(effective.sftp.preferredDockMode).toBe('right')
      expect(effective.sftp.autoOpenSFTP).toBe(true)
    })

    it('should support backward compatibility with legacy loggingConfig', () => {
      const profile = mockConfigService.store.profiles[1] // prof-2: legacy loggingConfig
      const effective = sessionConfigService.getSessionConfig(profile)

      expect(effective.logging.startLogUponConnect).toBe(true)
      expect(effective.logging.logFileName).toBe('%H-%Y%M%D.log')
      expect(effective.logging.mode).toBe('raw')
    })

    it('should save session config into profile.options.secureWorkbench and sync legacy loggingConfig', () => {
      const profile = mockConfigService.store.profiles[0]
      sessionConfigService.saveSessionConfig(profile, {
        encoding: 'BIG5',
        terminalType: 'ansi',
        logging: {
          startLogUponConnect: true,
          promptForFilename: false,
          logFileName: 'session-%H.log',
          mode: 'transcript',
          appendMode: 'append',
          directory: '~/.tabby/logs',
        },
        sftp: {
          preferredDockMode: 'undock',
          autoOpenSFTP: true,
          initialLocalPath: '/home',
          initialRemotePath: '/opt',
        },
      })

      expect(mockConfigService.save).toHaveBeenCalled()
      expect(profile.options.secureWorkbench.encoding).toBe('BIG5')
      expect(profile.options.secureWorkbench.terminalType).toBe('ansi')
      expect(profile.options.secureWorkbench.sftp.preferredDockMode).toBe('undock')
      expect(profile.options.loggingConfig.startLogUponConnect).toBe(true)
      expect(profile.options.loggingConfig.logFileName).toBe('session-%H.log')
    })

    it('should batch-apply default session configuration to all profiles', () => {
      // Set a custom default template first
      sessionConfigService.saveDefaultSessionConfig({
        encoding: 'GBK',
        terminalType: 'vt220',
      })

      const count = sessionConfigService.applyDefaultSessionToAllProfiles(true)
      expect(count).toBe(2)
      expect(mockConfigService.save).toHaveBeenCalled()

      // Both profiles should now have GBK encoding and vt220 terminalType
      expect(mockConfigService.store.profiles[0].options.secureWorkbench.encoding).toBe('GBK')
      expect(mockConfigService.store.profiles[0].options.secureWorkbench.terminalType).toBe('vt220')
      expect(mockConfigService.store.profiles[1].options.secureWorkbench.encoding).toBe('GBK')
      expect(mockConfigService.store.profiles[1].options.secureWorkbench.terminalType).toBe('vt220')
    })
  })

  describe('WorkbenchDialogService Session Options Management', () => {
    it('should open and close session options dialog for a profile', (done) => {
      const testProfile = mockConfigService.store.profiles[0]

      dialogService.sessionOptionsProfile$.subscribe((p) => {
        if (p) {
          expect(p.id).toBe('prof-1')
          expect(dialogService.isSessionOptionsOpen).toBe(true)

          dialogService.closeSessionOptions()
          expect(dialogService.isSessionOptionsOpen).toBe(false)
          done()
        }
      })

      dialogService.openSessionOptions(testProfile)
    })

    it('should close session options dialog on closeAll()', () => {
      dialogService.openSessionOptions(mockConfigService.store.profiles[0])
      expect(dialogService.isSessionOptionsOpen).toBe(true)

      dialogService.closeAll()
      expect(dialogService.isSessionOptionsOpen).toBe(false)
    })
  })

  describe('WorkbenchSessionOptionsModalComponent', () => {
    let component: WorkbenchSessionOptionsModalComponent

    beforeEach(() => {
      component = new WorkbenchSessionOptionsModalComponent(
        dialogService,
        sessionConfigService,
        mockConfigService,
        mockNotificationsService
      )
      component.ngOnInit()
    })

    it('should initialize with connection tab and load profile values', () => {
      const testProfile = mockConfigService.store.profiles[0]
      dialogService.openSessionOptions(testProfile)

      expect(component.profile).toBe(testProfile)
      expect(component.activeCategory).toBe('connection')
      expect(component.tempProfile.name).toBe('Production Server')
      expect(component.tempProfile.options.host).toBe('192.168.1.100')
      expect(component.tempProfile.options.user).toBe('root')
      expect(component.tempProfile.options.port).toBe(22)
      expect(component.tempWorkbench.encoding).toBe('inherit')
    })

    it('should save modifications back to profile and sessionConfigService', () => {
      const testProfile = mockConfigService.store.profiles[0]
      dialogService.openSessionOptions(testProfile)

      component.tempWorkbench.encoding = 'GB2312'
      component.tempLogging.startLogUponConnect = true
      component.tempLogging.logFileName = 'prod-%Y.log'
      component.tempSftp.preferredDockMode = 'right'

      component.save()

      expect(testProfile.options.secureWorkbench.encoding).toBe('GB2312')
      expect(testProfile.options.secureWorkbench.sftp.preferredDockMode).toBe('right')
      expect(mockNotificationsService.info).toHaveBeenCalled()
      expect(dialogService.isSessionOptionsOpen).toBe(false)
    })

    it('should discard changes on cancel()', () => {
      const testProfile = mockConfigService.store.profiles[0]
      delete testProfile.options.secureWorkbench
      dialogService.openSessionOptions(testProfile)

      component.tempWorkbench.encoding = 'GB18030'
      component.cancel()

      expect(dialogService.isSessionOptionsOpen).toBe(false)
      // Profile remains untouched
      expect(testProfile.options.secureWorkbench).toBeUndefined()
    })
  })
})
