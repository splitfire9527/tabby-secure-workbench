import * as iconv from 'iconv-lite'
import { Subject, Observable } from 'rxjs'
import { WorkbenchEncoding } from '../config/config.model'

export interface EncodingChangeEvent {
  timestamp: Date
  oldEncoding: WorkbenchEncoding
  newEncoding: WorkbenchEncoding
  flushedText: string
}

export interface DecodedTextEvent {
  text: string
  rawBytes: Buffer
  timestamp: Date
}

/**
 * StatefulCodec handles multi-byte character boundary caching and bidirectional
 * encoding/decoding between remote byte streams and local UTF-8 terminal buffers.
 */
export class StatefulCodec {
  private currentEncoding: WorkbenchEncoding
  private decoder: any
  private isPaused = false
  private queue: Buffer[] = []

  private textDecodedSubject = new Subject<DecodedTextEvent>()
  private encodingChangedSubject = new Subject<EncodingChangeEvent>()

  readonly textDecoded$: Observable<DecodedTextEvent> = this.textDecodedSubject.asObservable()
  readonly encodingChanged$: Observable<EncodingChangeEvent> = this.encodingChangedSubject.asObservable()

  constructor(initialEncoding: WorkbenchEncoding = 'UTF-8') {
    this.currentEncoding = initialEncoding
    this.initDecoder()
  }

  get encoding(): WorkbenchEncoding {
    return this.currentEncoding
  }

  private initDecoder(): void {
    const encName = this.mapEncodingName(this.currentEncoding)
    this.decoder = iconv.getDecoder(encName)
  }

  private mapEncodingName(enc: WorkbenchEncoding): string {
    switch (enc) {
      case 'UTF-8':
        return 'utf-8'
      case 'GBK':
        return 'gbk'
      case 'GB2312':
        return 'gb2312'
      case 'GB18030':
        return 'gb18030'
      case 'BIG5':
        return 'big5'
      default:
        return 'utf-8'
    }
  }

  /**
   * Decodes incoming session bytes into UTF-8 text and returns UTF-8 Buffer for xterm.
   */
  decodeChunk(data: Buffer): { text: string; utf8Bytes: Buffer } {
    if (this.isPaused) {
      this.queue.push(Buffer.from(data))
      return { text: '', utf8Bytes: Buffer.alloc(0) }
    }

    const decodedStr = this.decoder.write(data) || ''
    const utf8Bytes = Buffer.from(decodedStr, 'utf-8')

    if (decodedStr.length > 0) {
      this.textDecodedSubject.next({
        text: decodedStr,
        rawBytes: data,
        timestamp: new Date(),
      })
    }

    return { text: decodedStr, utf8Bytes }
  }

  /**
   * Encodes user input (UTF-8 from terminal) into the target session encoding.
   */
  encodeInput(data: Buffer): Buffer {
    if (this.currentEncoding === 'UTF-8') {
      return data
    }
    const inputStr = data.toString('utf-8')
    const encName = this.mapEncodingName(this.currentEncoding)
    return iconv.encode(inputStr, encName)
  }

  /**
   * Dynamically switches the encoding following §5.2 protocol:
   * 1. Pauses incoming stream.
   * 2. Flushes current decoder (emitting U+FFFD for incomplete sequences).
   * 3. Records EncodingChangeEvent.
   * 4. Initializes new decoder.
   * 5. Drains queued buffers and resumes.
   */
  switchEncoding(newEncoding: WorkbenchEncoding): EncodingChangeEvent {
    this.isPaused = true

    const oldEncoding = this.currentEncoding
    let flushedText = ''

    try {
      if (this.decoder && typeof this.decoder.end === 'function') {
        flushedText = this.decoder.end() || ''
      }
    } catch {
      flushedText = '\uFFFD'
    }

    this.currentEncoding = newEncoding
    this.initDecoder()

    const changeEvent: EncodingChangeEvent = {
      timestamp: new Date(),
      oldEncoding,
      newEncoding,
      flushedText,
    }
    this.encodingChangedSubject.next(changeEvent)

    if (flushedText.length > 0) {
      this.textDecodedSubject.next({
        text: flushedText,
        rawBytes: Buffer.alloc(0),
        timestamp: new Date(),
      })
    }

    // Process queued chunks
    this.isPaused = false
    const queued = [...this.queue]
    this.queue = []
    for (const chunk of queued) {
      this.decodeChunk(chunk)
    }

    return changeEvent
  }

  destroy(): void {
    this.textDecodedSubject.complete()
    this.encodingChangedSubject.complete()
  }
}
