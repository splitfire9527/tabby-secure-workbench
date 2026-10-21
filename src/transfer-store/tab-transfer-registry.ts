import { TransferStore } from './transfer-store'

/**
 * Owns one TransferStore per terminal tab. Closing a tab destroys only that store.
 */
export class TabTransferRegistry {
  private stores = new Map<string, TransferStore>()

  attach(tabId: string): TransferStore {
    const existing = this.stores.get(tabId)
    if (existing) return existing
    const store = new TransferStore()
    this.stores.set(tabId, store)
    return store
  }

  get(tabId: string): TransferStore | undefined {
    return this.stores.get(tabId)
  }

  detach(tabId: string): void {
    const store = this.stores.get(tabId)
    if (!store) return
    this.stores.delete(tabId)
    store.destroy()
  }
}
