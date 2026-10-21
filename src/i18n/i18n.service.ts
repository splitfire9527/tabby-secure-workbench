import { Injectable, OnDestroy } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { BehaviorSubject, Subscription } from 'rxjs'
import { zhCN } from './locales/zh-CN'
import { enUS } from './locales/en-US'
import { UILanguage } from '../config/config.model'

export type LocaleDict = typeof zhCN

function lookupLocale(dict: any, path: string): string | null {
  if (!dict) return null
  let curr = dict
  for (const part of path.split('.')) {
    if (curr && typeof curr === 'object' && part in curr) curr = curr[part]
    else return null
  }
  return typeof curr === 'string' ? curr : null
}

@Injectable({ providedIn: 'root' })
export class I18nService implements OnDestroy {
  private locales: Record<string, any> = {
    'zh-CN': zhCN,
    'en-US': enUS,
  }

  private currentLangSubject = new BehaviorSubject<string>('zh-CN')
  public currentLang$ = this.currentLangSubject.asObservable()
  private configSub?: Subscription

  constructor(private config: ConfigService) {
    this.updateLanguage()
    if (this.config.changed$) {
      this.configSub = this.config.changed$.subscribe(() => this.updateLanguage())
    }
  }

  ngOnDestroy(): void {
    if (this.configSub) {
      this.configSub.unsubscribe()
      this.configSub = undefined
    }
  }

  /**
   * Register third-party or community translation locale.
   */
  registerLocale(name: string, dictionary: any): void {
    this.locales[name] = dictionary
    this.updateLanguage()
  }

  get currentLanguage(): string {
    return this.currentLangSubject.value
  }

  updateLanguage(): void {
    const pref: UILanguage = this.config.store?.secureWorkbench?.uiLanguage || 'auto'
    let resolved = 'zh-CN'

    if (pref === 'zh-CN' || pref === 'en-US') {
      resolved = pref
    } else if (pref === 'auto' || pref === 'tabby') {
      // Check system or Tabby language
      const sysLang = typeof navigator !== 'undefined' ? navigator.language || (navigator as any).userLanguage : ''
      if (sysLang.startsWith('en')) {
        resolved = 'en-US'
      } else {
        resolved = 'zh-CN'
      }
    }

    if (this.currentLangSubject.value !== resolved) {
      this.currentLangSubject.next(resolved)
    }
  }

  t(path: string, fallback?: string): string {
    const fromCurrent = lookupLocale(this.locales[this.currentLanguage], path)
    if (fromCurrent != null) return fromCurrent
    const fromZh = lookupLocale(this.locales['zh-CN'], path)
    if (fromZh != null) return fromZh
    return fallback || path
  }

  get dict(): LocaleDict {
    return this.locales[this.currentLanguage] || this.locales['zh-CN']
  }
}
