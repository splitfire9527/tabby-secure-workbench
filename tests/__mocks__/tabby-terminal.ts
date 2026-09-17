import { Subject, Observable } from 'rxjs'

export class SessionMiddleware {
  outputToSession = new Subject<Buffer>()
  outputToTerminal = new Subject<Buffer>()

  get outputToSession$(): Observable<Buffer> {
    return this.outputToSession.asObservable()
  }

  get outputToTerminal$(): Observable<Buffer> {
    return this.outputToTerminal.asObservable()
  }

  feedFromSession(data: Buffer): void {
    this.outputToTerminal.next(data)
  }

  feedFromTerminal(data: Buffer): void {
    this.outputToSession.next(data)
  }

  close(): void {
    this.outputToSession.complete()
    this.outputToTerminal.complete()
  }
}

export class TerminalDecorator {
  attach(tab: any): void {}
  detach(tab: any): void {}
}

export class TerminalColorSchemeProvider {
  async getSchemes(): Promise<any[]> {
    return []
  }
}

export interface TerminalColorScheme {
  name: string
  foreground: string
  background: string
  cursor: string
  cursorAccent: string
  selection: string
  colors: string[]
}

export class BaseTerminalTabComponent<P = any> {
  session: any = null
  sessionChanged$ = new Subject<any>()
  title = ''
}

export class BaseSession {
  middleware: SessionMiddleware[] = []
  open = true
}
