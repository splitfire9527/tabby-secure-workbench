import { Injectable } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'
import { CrossTransferClipboardItem } from './clipboard.model'

/**
 * CrossTransferClipboard manages in-memory file references for cross-connection
 * copy and paste operations. Distinct from system clipboard.
 */
@Injectable({ providedIn: 'root' })
export class CrossTransferClipboard {
  private itemSubject = new BehaviorSubject<CrossTransferClipboardItem | null>(null)
  readonly item$: Observable<CrossTransferClipboardItem | null> = this.itemSubject.asObservable()

  copy(item: CrossTransferClipboardItem): void {
    this.itemSubject.next(item)
  }

  getItem(): CrossTransferClipboardItem | null {
    return this.itemSubject.value
  }

  hasItem(): boolean {
    return this.itemSubject.value !== null
  }

  clear(): void {
    this.itemSubject.next(null)
  }
}
