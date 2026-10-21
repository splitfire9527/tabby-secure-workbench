import { WorkbenchSftpPaneComponent } from '../src/shell/workbench-sftp-pane.component'
import { CrossTransferClipboard } from '../src/cross-transfer/cross-transfer-clipboard'
import { CrossTransferRelayService } from '../src/cross-transfer/cross-transfer-relay.service'

describe('WorkbenchSftpPaneComponent - Zero Mock Policy & Real SFTP', () => {
  let component: WorkbenchSftpPaneComponent
  let clipboard: CrossTransferClipboard
  let relay: CrossTransferRelayService
  let mockNotifications: any

  beforeEach(() => {
    clipboard = new CrossTransferClipboard()
    relay = new CrossTransferRelayService(clipboard)
    mockNotifications = {
      info: jest.fn(),
      error: jest.fn(),
      notice: jest.fn(),
    }
    component = new WorkbenchSftpPaneComponent(clipboard, relay, mockNotifications)
  })

  it('should initialize with empty remoteFiles when no SSH/SFTP session is available', async () => {
    component.activeTab = null
    const view = component.createView('Test View', '/tmp', '/root')
    component.views = [view]
    component.activeViewId = view.id

    await component.loadRemoteFiles(view)

    // Strictly empty, NEVER populated with fake mock files
    expect(view.remoteFiles).toEqual([])
    expect(view.filteredRemoteFiles).toEqual([])
  })

  it('should never contain hardcoded mock files like access.log or ssl-certs', async () => {
    component.activeTab = null
    const view = component.createView('Test View', '/tmp', '/root')
    await component.loadRemoteFiles(view)

    const names = view.remoteFiles.map(f => f.name)
    expect(names).not.toContain('access.log')
    expect(names).not.toContain('ssl-certs')
    expect(names).not.toContain('nginx.conf.bak')
  })

  it('should show error notification and refuse deletion when SFTP is not connected', async () => {
    component.activeTab = null
    const view = component.createView('Test View', '/tmp', '/root')
    view.selectedRemoteFile = {
      name: 'some-file.txt',
      isDirectory: false,
      size: 100,
      mode: '-rw-r--r--',
      modified: '',
      modifiedMs: 0,
    }

    await component.deleteSelectedRemote(view)

    expect(mockNotifications.error).toHaveBeenCalledWith('未建立远程 SFTP 会话，无法删除项目')
  })

  it('should show error notification and refuse cross-connection paste when SFTP is not connected', async () => {
    component.activeTab = null
    const view = component.createView('Test View', '/tmp', '/root')
    clipboard.copy({
      sourceSessionId: 'src-1',
      sourceSessionName: 'Src Tab',
      remotePath: '/root/test.sh',
      fileName: 'test.sh',
      isDirectory: false,
      size: 123,
      copiedAt: new Date(),
    })

    component.store = {
      addTask: jest.fn(),
      updateTaskStatus: jest.fn(),
      updateProgress: jest.fn(),
    } as any

    await component.pasteFromOtherConnection(view)

    expect(mockNotifications.error).toHaveBeenCalledWith('未建立远程 SFTP 会话，无法跨连接粘贴')
  })

  it('should correctly load and map real server directory entries when real SFTP session is available', async () => {
    const mockServerFiles = [
      { name: 'create_hid_gadget.sh', isDirectory: false, size: 2450, mode: 0o755, modified: 1700000000000 },
      { name: 'monit-5.34.4', isDirectory: true, size: 4096, mode: 0o755, modified: 1700000000000 },
      { name: 'log', isDirectory: true, size: 4096, mode: 0o755, modified: 1700000000000 },
    ]

    const mockSftpSession = {
      readdir: jest.fn().mockResolvedValue(mockServerFiles),
    }

    component.activeTab = {
      id: 'tab-1',
      sshSession: {
        openSFTP: jest.fn().mockResolvedValue(mockSftpSession),
      },
    } as any

    const view = component.createView('Real Gateway', '/tmp', '/root')
    await component.loadRemoteFiles(view)

    expect(mockSftpSession.readdir).toHaveBeenCalledWith('/root')
    expect(view.remoteFiles.length).toBe(4) // '..' parent directory + 3 server items
    expect(view.remoteFiles.some(f => f.name === 'create_hid_gadget.sh')).toBe(true)
    expect(view.remoteFiles.some(f => f.name === 'monit-5.34.4')).toBe(true)
    expect(view.remoteFiles.some(f => f.name === 'log')).toBe(true)
  })

  it('should recognize app.asar as a regular file with isDirectory: false, not a folder', () => {
    const fs = require('fs')
    const path = require('path')
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'asar-test-'))
    const asarFile = path.join(tmpDir, 'app.asar')
    fs.writeFileSync(asarFile, 'fake asar content for testing')

    const view = component.createView('Local Asar Test', tmpDir, '/root')
    component.loadLocalFiles(view)

    const asarItem = view.localFiles.find(f => f.name === 'app.asar')
    expect(asarItem).toBeDefined()
    expect(asarItem?.isDirectory).toBe(false)
    expect(asarItem?.size).toBeGreaterThan(0)
    expect(asarItem?.mode?.startsWith('-')).toBe(true)

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should upload directory using TarChannel when preferTar is true and tar is available', async () => {
    const fs = require('fs')
    const path = require('path')
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dir-upload-test-'))
    const subFolder = path.join(tmpDir, 'my-folder')
    fs.mkdirSync(subFolder)
    fs.writeFileSync(path.join(subFolder, 'hello.txt'), 'world')

    const view = component.createView('Dir Upload View', tmpDir, '/remote/dest')
    component.store = {
      addTask: jest.fn(),
      updateTaskStatus: jest.fn(),
      updateProgress: jest.fn(),
    } as any

    jest.spyOn(component.tarChannel, 'tryUploadDir').mockResolvedValue('succeeded')
    jest.spyOn(component, 'loadRemoteFiles').mockImplementation(() => Promise.resolve())

    await component.uploadDirectoryFromPath(view, subFolder, true)

    expect(component.store.addTask).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'upload',
        sourcePath: subFolder,
        targetPath: '/remote/dest/my-folder',
      })
    )
    expect(component.tarChannel.tryUploadDir).toHaveBeenCalled()
    expect(component.store.updateTaskStatus).toHaveBeenCalledWith(expect.any(String), 'succeeded')
    expect(mockNotifications.info).toHaveBeenCalledWith(expect.stringContaining('tar压缩加速'))

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should fallback to regular recursive upload when TarChannel returns fallback', async () => {
    const fs = require('fs')
    const path = require('path')
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dir-fallback-test-'))
    const subFolder = path.join(tmpDir, 'fallback-folder')
    fs.mkdirSync(subFolder)
    fs.writeFileSync(path.join(subFolder, 'f1.txt'), 'f1-content')

    const view = component.createView('Dir Fallback View', tmpDir, '/remote/dest')
    component.store = {
      addTask: jest.fn(),
      updateTaskStatus: jest.fn(),
      updateProgress: jest.fn(),
    } as any

    const mockSftp = {
      mkdir: jest.fn().mockResolvedValue(undefined),
      lstat: jest.fn(async () => {
        const err: any = new Error('No such file')
        err.code = 2
        throw err
      }),
      open: jest.fn().mockResolvedValue({
        write: jest.fn().mockResolvedValue(10),
        close: jest.fn().mockResolvedValue(undefined),
      }),
      chmod: jest.fn().mockResolvedValue(undefined),
      rename: jest.fn().mockResolvedValue(undefined),
      unlink: jest.fn().mockResolvedValue(undefined),
    }
    jest.spyOn(component, 'getRealSftpSession').mockResolvedValue(mockSftp)
    jest.spyOn(component.tarChannel, 'tryUploadDir').mockResolvedValue('fallback')
    jest.spyOn(component, 'loadRemoteFiles').mockImplementation(() => Promise.resolve())

    await component.uploadDirectoryFromPath(view, subFolder, true)

    expect(component.tarChannel.tryUploadDir).toHaveBeenCalled()
    expect(mockSftp.mkdir).toHaveBeenCalledWith('/remote/dest/fallback-folder')
    expect(mockSftp.open).toHaveBeenCalled()
    const stagedPath = mockSftp.open.mock.calls[0][0]
    expect(stagedPath).not.toBe('/remote/dest/fallback-folder/f1.txt')
    expect(mockSftp.rename).toHaveBeenCalledWith(stagedPath, '/remote/dest/fallback-folder/f1.txt')
    expect(component.store.updateTaskStatus).toHaveBeenCalledWith(expect.any(String), 'succeeded')

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should download directory using TarChannel when available and fallback if needed', async () => {
    const view = component.createView('Dir Download View', '/local/dest', '/remote')
    component.store = {
      addTask: jest.fn(),
      updateTaskStatus: jest.fn(),
      updateProgress: jest.fn(),
    } as any

    jest.spyOn(component.tarChannel, 'tryDownloadDir').mockResolvedValue('succeeded')
    jest.spyOn(component, 'loadLocalFiles').mockImplementation(() => {})

    const folderItem = {
      name: 'remote-app',
      isDirectory: true,
      size: 4096,
      mode: 'drwxr-xr-x',
    }

    await component.downloadDirectory(view, folderItem, true)

    expect(component.tarChannel.tryDownloadDir).toHaveBeenCalledWith(
      '/remote/remote-app',
      '/local/dest/remote-app',
      component.store,
      expect.any(String)
    )
    expect(component.store.updateTaskStatus).toHaveBeenCalledWith(expect.any(String), 'succeeded')
    expect(mockNotifications.info).toHaveBeenCalledWith(expect.stringContaining('tar压缩加速'))
  })
})
