import { Injectable } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { SavedCommand } from './command.model'
import { DEFAULT_WORKBENCH_CONFIG } from '../config/config.model'

@Injectable({ providedIn: 'root' })
export class CommandService {
  constructor(private config: ConfigService) {}

  getCommands(): SavedCommand[] {
    const list = this.config.store?.secureWorkbench?.commandLibrary
    if (Array.isArray(list) && list.length > 0) {
      return list
    }
    return DEFAULT_WORKBENCH_CONFIG.commandLibrary
  }

  getCategories(): string[] {
    const cmds = this.getCommands()
    const set = new Set<string>()
    for (const c of cmds) {
      set.add(c.category || 'Default')
    }
    return Array.from(set).sort()
  }

  saveCommands(commands: SavedCommand[]): void {
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    this.config.store.secureWorkbench.commandLibrary = commands
    this.config.save()
  }

  addCommand(commandInit: Omit<SavedCommand, 'id'>): SavedCommand {
    const id = `cmd-${Date.now()}`
    const newCmd: SavedCommand = {
      ...commandInit,
      id,
    }
    const current = this.getCommands()
    this.saveCommands([...current, newCmd])
    return newCmd
  }

  updateCommand(command: SavedCommand): void {
    const current = this.getCommands()
    const idx = current.findIndex(c => c.id === command.id)
    if (idx !== -1) {
      const updated = [...current]
      updated[idx] = { ...command }
      this.saveCommands(updated)
    }
  }

  deleteCommand(id: string): void {
    const current = this.getCommands()
    this.saveCommands(current.filter(c => c.id !== id))
  }

  /**
   * Resolves the active/focused leaf terminal tab from a Tab or SplitTabComponent.
   */
  resolveLeafTerminal(tab: any): any {
    if (!tab) return null
    if (tab.session || typeof tab.sendInput === 'function') {
      return tab
    }
    if (typeof tab.getFocusedTab === 'function') {
      const focused = tab.getFocusedTab()
      if (focused && focused !== tab) {
        const resolved = this.resolveLeafTerminal(focused)
        if (resolved) return resolved
      }
    }
    if (tab.focusedTab && tab.focusedTab !== tab) {
      const resolved = this.resolveLeafTerminal(tab.focusedTab)
      if (resolved) return resolved
    }
    if (Array.isArray(tab.children)) {
      for (const child of tab.children) {
        const resolved = this.resolveLeafTerminal(child)
        if (resolved) return resolved
      }
    }
    return tab
  }

  /**
   * Executes a command on the given terminal tab session.
   * - If autoExecute is false: writes snippet into input buffer without carriage return.
   * - If autoExecute is true: appends \r to execute immediately.
   */
  executeCommand(command: SavedCommand, terminalTab: any): void {
    if (!terminalTab) return
    const targetTab = this.resolveLeafTerminal(terminalTab)
    if (!targetTab) return

    const payload = command.autoExecute ? `${command.snippet}\r` : command.snippet

    if (typeof targetTab.sendInput === 'function') {
      targetTab.sendInput(payload)
      return
    }

    const session = targetTab.session || targetTab._session
    if (session) {
      if (typeof session.write === 'function') {
        session.write(Buffer.from(payload, 'utf-8'))
      } else if (typeof session.feedFromTerminal === 'function') {
        session.feedFromTerminal(Buffer.from(payload, 'utf-8'))
      }
    }
  }
}
