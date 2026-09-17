import { CommandService } from '../src/command-library/command.service'
import { SavedCommand } from '../src/command-library/command.model'

class MockConfigService {
  store = {
    secureWorkbench: {
      commandLibrary: [
        {
          id: 'c1',
          category: 'Docker',
          name: 'List Containers',
          snippet: 'docker ps',
          autoExecute: true,
        },
        {
          id: 'c2',
          category: 'System',
          name: 'Check Disk',
          snippet: 'df -h',
          autoExecute: false,
        },
      ],
    },
  }
  save = jest.fn()
}

describe('Command Library Layer (§7)', () => {
  let commandService: CommandService
  let mockConfig: MockConfigService

  beforeEach(() => {
    mockConfig = new MockConfigService()
    commandService = new CommandService(mockConfig as any)
  })

  it('should retrieve commands and unique categories', () => {
    const commands = commandService.getCommands()
    expect(commands.length).toBe(2)

    const categories = commandService.getCategories()
    expect(categories).toEqual(['Docker', 'System'])
  })

  it('should append carriage return \\r when autoExecute is true', () => {
    let writtenBuffer: Buffer | null = null
    const mockSession = {
      write: (buf: Buffer) => {
        writtenBuffer = buf
      },
    }
    const mockTerminalTab = { session: mockSession }

    const autoCmd: SavedCommand = {
      id: 'cmd-auto',
      category: 'Test',
      name: 'Auto Cmd',
      snippet: 'echo auto',
      autoExecute: true,
    }

    commandService.executeCommand(autoCmd, mockTerminalTab)
    expect(writtenBuffer).not.toBeNull()
    expect(writtenBuffer!.toString('utf-8')).toBe('echo auto\r')
  })

  it('should NOT append carriage return when autoExecute is false', () => {
    let writtenBuffer: Buffer | null = null
    const mockSession = {
      write: (buf: Buffer) => {
        writtenBuffer = buf
      },
    }
    const mockTerminalTab = { session: mockSession }

    const manualCmd: SavedCommand = {
      id: 'cmd-manual',
      category: 'Test',
      name: 'Manual Cmd',
      snippet: 'rm -rf /tmp/test',
      autoExecute: false,
    }

    commandService.executeCommand(manualCmd, mockTerminalTab)
    expect(writtenBuffer).not.toBeNull()
    expect(writtenBuffer!.toString('utf-8')).toBe('rm -rf /tmp/test')
  })
})
