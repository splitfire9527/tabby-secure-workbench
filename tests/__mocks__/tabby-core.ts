import { Subject, Observable } from 'rxjs'

export class BaseComponent {}

export class BaseTabComponent extends BaseComponent {
  title = ''
  customTitle = ''
  constructor(injector?: any) {
    super()
  }
}

export class ConfigProvider {
  defaults: any = {}
  platformDefaults: any = {}
}

export class ConfigService {
  store: any = { secureWorkbench: {} }
  changed$ = new Subject<void>()
  save = jest.fn()
}

export class PlatformService {
  getHomeDir(): string {
    return '/home/user'
  }
}

export class NotificationsService {
  info = jest.fn()
  error = jest.fn()
  notice = jest.fn()
}

export class HotkeysService {
  hotkey$ = new Subject<string>()
  unfilteredHotkey$ = new Subject<string>()
}

export class AppService {
  tabs: any[] = []
  activeTab: any = null
  openNewTab = jest.fn()
}

export class ToolbarButtonProvider {
  provide(): any[] {
    return []
  }
}

export class ProfileProvider<T = any> {
  id = ''
  name = ''
  async open(profile: any): Promise<any> {
    return {}
  }
}

export class TabRecoveryProvider {
  async applicableTo(token: any): Promise<boolean> {
    return false
  }
  async recover(token: any): Promise<any> {
    return null
  }
}

export class ProfilesService {
  getConfigProxyForProfile(profile: any): any {
    return profile
  }
}

export class HotkeyProvider {
  async provide(): Promise<any[]> {
    return []
  }
}

export default class TabbyCoreModule {}
