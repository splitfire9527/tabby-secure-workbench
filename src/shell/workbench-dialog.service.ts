import { Injectable } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class WorkbenchDialogService {
  private showSettingsSubject = new BehaviorSubject<boolean>(false)
  private showAboutSubject = new BehaviorSubject<boolean>(false)
  private showNativeSettingsSubject = new BehaviorSubject<boolean>(false)
  private sessionOptionsProfileSubject = new BehaviorSubject<any | null>(null)
  private newSessionProfileSubject = new BehaviorSubject<any | null>(null)

  showSettings$: Observable<boolean> = this.showSettingsSubject.asObservable()
  showAbout$: Observable<boolean> = this.showAboutSubject.asObservable()
  showNativeSettings$: Observable<boolean> = this.showNativeSettingsSubject.asObservable()
  sessionOptionsProfile$: Observable<any | null> = this.sessionOptionsProfileSubject.asObservable()
  newSessionProfile$: Observable<any | null> = this.newSessionProfileSubject.asObservable()

  get isSettingsOpen(): boolean {
    return this.showSettingsSubject.value
  }

  get isAboutOpen(): boolean {
    return this.showAboutSubject.value
  }

  get isNativeSettingsOpen(): boolean {
    return this.showNativeSettingsSubject.value
  }

  get isSessionOptionsOpen(): boolean {
    return this.sessionOptionsProfileSubject.value !== null
  }

  get currentSessionOptionsProfile(): any | null {
    return this.sessionOptionsProfileSubject.value
  }

  get isNewSessionOpen(): boolean {
    return this.newSessionProfileSubject.value !== null
  }

  openSettings(): void {
    this.showAboutSubject.next(false)
    this.showNativeSettingsSubject.next(false)
    this.sessionOptionsProfileSubject.next(null)
    this.newSessionProfileSubject.next(null)
    this.showSettingsSubject.next(true)
  }

  closeSettings(): void {
    this.showSettingsSubject.next(false)
  }

  openAbout(): void {
    this.showSettingsSubject.next(false)
    this.showNativeSettingsSubject.next(false)
    this.sessionOptionsProfileSubject.next(null)
    this.newSessionProfileSubject.next(null)
    this.showAboutSubject.next(true)
  }

  closeAbout(): void {
    this.showAboutSubject.next(false)
  }

  openNativeSettings(): void {
    this.showSettingsSubject.next(false)
    this.showAboutSubject.next(false)
    this.sessionOptionsProfileSubject.next(null)
    this.newSessionProfileSubject.next(null)
    this.showNativeSettingsSubject.next(true)
  }

  closeNativeSettings(): void {
    this.showNativeSettingsSubject.next(false)
  }

  openSessionOptions(profile: any): void {
    this.showSettingsSubject.next(false)
    this.showAboutSubject.next(false)
    this.showNativeSettingsSubject.next(false)
    this.newSessionProfileSubject.next(null)
    this.sessionOptionsProfileSubject.next(profile)
  }

  closeSessionOptions(): void {
    this.sessionOptionsProfileSubject.next(null)
  }

  openNewSession(initialProfile?: any): void {
    this.showSettingsSubject.next(false)
    this.showAboutSubject.next(false)
    this.showNativeSettingsSubject.next(false)
    this.sessionOptionsProfileSubject.next(null)
    this.newSessionProfileSubject.next(initialProfile !== undefined ? initialProfile : {})
  }

  closeNewSession(): void {
    this.newSessionProfileSubject.next(null)
  }

  closeAll(): void {
    this.showSettingsSubject.next(false)
    this.showAboutSubject.next(false)
    this.showNativeSettingsSubject.next(false)
    this.sessionOptionsProfileSubject.next(null)
    this.newSessionProfileSubject.next(null)
  }
}
