import { Subject, Observable } from 'rxjs'
import { StatefulCodec } from './stateful-codec'

/**
 * Standard SessionMiddleware contract for Tabby terminal byte stream interception.
 */
export class SessionMiddleware {
  protected outputToSession = new Subject<Buffer>()
  protected outputToTerminal = new Subject<Buffer>()

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

/**
 * CodecMiddleware intercepts bidirectional byte streams for a Tabby terminal session.
 * - In feedFromSession: transforms remote bytes (e.g. GBK/BIG5) into UTF-8 for xterm.
 * - In feedFromTerminal: transforms local terminal input (UTF-8) into target encoding.
 */
export class CodecMiddleware extends SessionMiddleware {
  constructor(readonly codec: StatefulCodec) {
    super()
  }

  override feedFromSession(data: Buffer): void {
    const { utf8Bytes } = this.codec.decodeChunk(data)
    if (utf8Bytes.length > 0) {
      this.outputToTerminal.next(utf8Bytes)
    }
  }

  override feedFromTerminal(data: Buffer): void {
    const encodedBytes = this.codec.encodeInput(data)
    if (encodedBytes.length > 0) {
      this.outputToSession.next(encodedBytes)
    }
  }

  override close(): void {
    this.codec.destroy()
    super.close()
  }
}
