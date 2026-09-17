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
   * Executes a command on the given terminal tab session.
   * - If autoExecute is false: writes snippet into input buffer without carriage return.
   * - If autoExecute is true: appends \r to execute immediately.
   */
  executeCommand(command: SavedCommand, terminalTab: any): void {
    if (!terminalTab) return

    const session = terminalTab.session || terminalTab._session
    if (!session) return

    const payload = command.autoExecute ? `${command.snippet}\r` : command.snippet
    const buffer = Buffer.from(payload, 'utf-8')

    if (typeof session.write === 'function') {
      session.write(buffer)
    } else if (typeof terminalTab.sendInput === 'function') {
      terminalTab.sendInput(payload)
    }
  }
}
