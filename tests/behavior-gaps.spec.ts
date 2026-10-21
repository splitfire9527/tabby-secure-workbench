import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as iconv from 'iconv-lite'
import { Subject } from 'rxjs'
import { WorkbenchSftpPaneComponent } from '../src/shell/workbench-sftp-pane.component'
import { WorkbenchBottomDockComponent } from '../src/shell/workbench-bottom-dock.component'
import { WorkbenchToolbarComponent } from '../src/shell/workbench-toolbar.component'
import { WorkbenchTerminalDecorator } from '../src/shell/workbench-terminal-decorator'
import { WorkbenchHostShellService } from '../src/shell/workbench-host-shell.service'
import { WorkbenchConfigProvider } from '../src/config/workbench-config.provider'
import { DEFAULT_WORKBENCH_CONFIG } from '../src/config/config.model'
import { TransferStore } from '../src/transfer-store/transfer-store'
import { CrossTransferClipboard } from '../src/cross-transfer/cross-transfer-clipboard'
import { CrossTransferRelayService } from '../src/cross-transfer/cross-transfer-relay.service'
import { readAuditLines } from '../src/sftp-plus/transfer-audit-log'
import { offersCrossConnectionSync, PREVIEW_MAX_BYTES } from '../src/sftp-plus/navigation-policy'
import { applyNativeSftpVisibility, NATIVE_SFTP_ATTR } from '../src/shell/native-sftp-visibility'
import { SESSION_SEARCH_HOTKEY_ID } from '../src/shell/hotkey-defaults'
import { bindSessionCodec } from '../src/terminal-codec/session-codec-binding'
import { StatefulCodec } from '../src/terminal-codec/stateful-codec'
import { I18nService } from '../src/i18n/i18n.service'

function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

function fileTransfer(overrides: Record<string, any> = {}) {
  return { ...DEFAULT_WORKBENCH_CONFIG.fileTransfer, ...overrides }
}

class FakeEl {
  attrs: Record<string, string>
  children: FakeEl[] = []
  constructor(public tag: string, attrs: Record<string, string> = {}) {
    this.attrs = { ...attrs }
  }
  setAttribute(key: string, value: string): void {
    this.attrs[key] = value
  }
  getAttribute(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null
  }
  removeAttribute(key: string): void {
    delete this.attrs[key]
  }
  walk(): FakeEl[] {
    return [this, ...this.children.flatMap(child => child.walk())]
  }
  querySelectorAll(selector: string): FakeEl[] {
    const all = this.walk()
    if (selector === 'button') return all.filter(el => el.tag === 'button')
    if (selector.includes(NATIVE_SFTP_ATTR)) return all.filter(el => el.getAttribute(NATIVE_SFTP_ATTR) != null)
    return []
  }
}

function remoteFiles() {
  const files = new Map<string, { mode: number; size: number; content: string; isSymlink: boolean; isDir: boolean }>()
  const uploadFile = jest.fn(async (localPath: string, remotePath: string, onProgress?: (n: number) => void) => {
    if (remotePath.includes('explode')) throw new Error('disk full')
    const content = fs.readFileSync(localPath)
    files.set(remotePath, {
      mode: 0o600,
      size: content.length,
      content: content.toString('utf8'),
      isSymlink: false,
      isDir: false,
    })
    onProgress?.(content.length)
  })
  const sftp: any = {
    files,
    uploadFile,
    mkdir: jest.fn(async (remotePath: string) => {
      files.set(remotePath, { mode: 0o755, size: 0, content: '', isSymlink: false, isDir: true })
    }),
    async lstat(remotePath: string) {
      const file = files.get(remotePath)
      if (!file) {
        const err: any = new Error('No such file')
        err.code = 2
        throw err
      }
      return {
        isSymbolicLink: () => file.isSymlink,
        isDirectory: () => file.isDir,
        mode: file.mode,
        size: file.size,
      }
    },
    async chmod(remotePath: string, mode: number) {
      const file = files.get(remotePath)
      if (file) file.mode = mode
    },
    async rename(from: string, to: string) {
      const file = files.get(from)
      if (!file) throw new Error('missing temp')
      files.delete(from)
      files.set(to, file)
    },
    async unlink(remotePath: string) {
      files.delete(remotePath)
    },
    reconnect: jest.fn(),
  }
  return sftp
}

describe('close-workbench-behavior-gaps', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-gaps-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  function makePane(storeConfig?: any) {
    const clipboard = new CrossTransferClipboard()
    const relay = new CrossTransferRelayService(clipboard)
    const notifications = { info: jest.fn(), error: jest.fn(), notice: jest.fn() }
    const config = storeConfig || {
      store: {
        secureWorkbench: {
          fileTransfer: fileTransfer({ conflictAction: 'overwrite' }),
          logging: { directory: tempDir },
          pathMemory: {},
          bookmarks: [],
        },
      },
      save: jest.fn(),
    }
    const pane = new WorkbenchSftpPaneComponent(clipboard, relay, notifications as any, config as any)
    pane.store = new TransferStore()
    const view = pane.createView('view', tempDir, '/remote')
    pane.views = [view]
    pane.activeViewId = view.id
    return { pane, clipboard, notifications, config, view }
  }

  describe('per-tab queues', () => {
    it('keeps tasks on the tab that started them and cancels only that tab on detach', () => {
      const hostShell = {
        bindActiveTransferStore: jest.fn(),
        releaseTransferStore: jest.fn(),
        dockRef: null,
      }
      const app: any = { activeTab: null }
      const decorator = new WorkbenchTerminalDecorator(
        app,
        { run: (fn: any) => fn() } as any,
        { store: { secureWorkbench: {} } } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { info: jest.fn(), error: jest.fn(), notice: jest.fn() } as any,
        { stopLogging: jest.fn(), startLogging: jest.fn() } as any,
        hostShell as any
      )
      const tabA: any = { id: 'A' }
      const tabB: any = { id: 'B' }
      app.activeTab = tabA
      decorator.attach(tabA)
      decorator.attach(tabB)

      tabA.__workbenchTransferStore.addTask({
        id: 'task-a',
        name: 'from-A',
        sourcePath: '/a',
        targetPath: '/b',
        direction: 'upload',
        totalBytes: 1,
      })
      tabA.__workbenchTransferStore.updateTaskStatus('task-a', 'running')
      const cleanup = jest.fn()
      tabA.__workbenchTransferStore.tasks[0].cleanupHandler = cleanup
      tabB.__workbenchTransferStore.addTask({
        id: 'task-b',
        name: 'from-B',
        sourcePath: '/c',
        targetPath: '/d',
        direction: 'upload',
        totalBytes: 1,
      })

      expect(tabA.__workbenchTransferStore.tasks.map((task: any) => task.name)).toEqual(['from-A'])
      expect(tabB.__workbenchTransferStore.tasks.map((task: any) => task.name)).toEqual(['from-B'])
      expect(hostShell.bindActiveTransferStore).toHaveBeenCalledTimes(1)
      expect(hostShell.bindActiveTransferStore).toHaveBeenCalledWith(tabA.__workbenchTransferStore)

      decorator.detach(tabA)
      expect(tabA.__workbenchTransferStore.tasks[0].status).toBe('cancelled')
      expect(cleanup).toHaveBeenCalled()
      expect(tabB.__workbenchTransferStore.tasks[0].status).toBe('queued')
      decorator.detach(tabB)
    })

    it('rebinds the bottom dock summary to the active tab only', () => {
      const storeA = new TransferStore()
      const storeB = new TransferStore()
      storeA.addTask({ id: 'a', name: 'alpha', sourcePath: 's', targetPath: 't', direction: 'upload', totalBytes: 1 })
      storeB.addTask({ id: 'b', name: 'beta', sourcePath: 's', targetPath: 't', direction: 'upload', totalBytes: 1 })
      const dock = new WorkbenchBottomDockComponent({ detectChanges: jest.fn() } as any, {
        store: { secureWorkbench: {} },
      } as any)
      dock.ngOnInit()
      const app: any = { activeTab: { __workbenchTransferStore: storeA }, ready$: null, tabs: [] }
      const host = new WorkbenchHostShellService(
        {} as any,
        {} as any,
        {} as any,
        app,
        { store: { hotkeys: {}, secureWorkbench: {} } } as any,
        { run: (fn: any) => fn() } as any
      )
      host.dockRef = { instance: dock } as any
      host.syncActiveTabStore()
      expect(dock.tasks.map(task => task.name)).toEqual(['alpha'])
      app.activeTab = { __workbenchTransferStore: storeB }
      host.syncActiveTabStore()
      expect(dock.tasks.map(task => task.name)).toEqual(['beta'])
      expect(dock.summary.total).toBe(1)
      storeA.destroy()
      storeB.destroy()
    })
  })

  describe('upload, conflict, and audit', () => {
    it('overwrites through the atomic uploader and keeps permission bits', async () => {
      const { pane, view } = makePane()
      const sftp = remoteFiles()
      sftp.files.set('/remote/note.txt', { mode: 0o644, size: 3, content: 'old', isSymlink: false, isDir: false })
      pane.activeTab = { id: 'tab', title: 'tab', profile: { id: 'p1' }, sshSession: { openSFTP: async () => sftp } }
      const src = path.join(tempDir, 'note.txt')
      fs.writeFileSync(src, 'new-body')
      await pane.uploadSingleFilePath(view, src)
      expect(sftp.files.get('/remote/note.txt')?.content).toBe('new-body')
      expect(sftp.files.get('/remote/note.txt')?.mode).toBe(0o644)
      expect(pane.store.tasks[0].status).toBe('succeeded')
      await pane.auditLog?.close()
    })

    it('leaves the original file in place when the upload fails', async () => {
      const { pane, view } = makePane()
      const sftp = remoteFiles()
      sftp.files.set('/remote/note.txt', { mode: 0o644, size: 3, content: 'old', isSymlink: false, isDir: false })
      sftp.uploadFile.mockImplementation(async (_local: string, remotePath: string) => {
        if (remotePath.includes('.tmp.')) throw new Error('disk full')
      })
      pane.activeTab = { sshSession: { openSFTP: async () => sftp }, profile: { id: 'p1' } }
      const src = path.join(tempDir, 'note.txt')
      fs.writeFileSync(src, 'new-body')
      await pane.uploadSingleFilePath(view, src)
      expect(sftp.files.get('/remote/note.txt')?.content).toBe('old')
      expect(pane.store.tasks[0].status).toBe('failed')
      await pane.auditLog?.close()
    })

    it('refuses to overwrite a symlink', async () => {
      const { pane, view } = makePane()
      const sftp = remoteFiles()
      sftp.files.set('/remote/link', { mode: 0o777, size: 1, content: 'target', isSymlink: true, isDir: false })
      pane.activeTab = { sshSession: { openSFTP: async () => sftp }, profile: { id: 'p1' } }
      const src = path.join(tempDir, 'link')
      fs.writeFileSync(src, 'new-body')
      await pane.uploadSingleFilePath(view, src)
      expect(sftp.files.get('/remote/link')?.content).toBe('target')
      expect(sftp.files.get('/remote/link')?.isSymlink).toBe(true)
      expect(sftp.uploadFile).not.toHaveBeenCalled()
      expect(pane.store.tasks[0].status).toBe('failed')
      await pane.auditLog?.close()
    })

    it('skips an existing target and does not write before a prompt is answered', async () => {
      const { pane, view, config } = makePane()
      const sftp = remoteFiles()
      sftp.files.set('/remote/note.txt', { mode: 0o644, size: 3, content: 'old', isSymlink: false, isDir: false })
      pane.activeTab = { sshSession: { openSFTP: async () => sftp }, profile: { id: 'p1' } }
      const src = path.join(tempDir, 'note.txt')
      fs.writeFileSync(src, 'new-body')

      config.store.secureWorkbench.fileTransfer.conflictAction = 'skip'
      await pane.uploadSingleFilePath(view, src)
      expect(sftp.uploadFile).not.toHaveBeenCalled()
      expect(sftp.files.get('/remote/note.txt')?.content).toBe('old')
      expect(pane.store.tasks[0].status).not.toBe('succeeded')

      config.store.secureWorkbench.fileTransfer.conflictAction = 'prompt'
      let answer: (decision: 'overwrite' | 'skip' | 'cancel') => void = () => {}
      pane.conflictChooser = () => new Promise(resolve => { answer = resolve })
      const pending = pane.uploadSingleFilePath(view, src)
      await flush()
      expect(sftp.uploadFile).not.toHaveBeenCalled()
      expect(sftp.files.get('/remote/note.txt')?.content).toBe('old')
      answer('skip')
      await pending
      expect(sftp.uploadFile).not.toHaveBeenCalled()
      await pane.auditLog?.close()
    })

    it('fails the directory task when one file fails and writes audit outside the transcript', async () => {
      const transcript = path.join(tempDir, 'session.log')
      fs.writeFileSync(transcript, 'VISIBLE\n')
      const { pane, view } = makePane()
      const sftp = remoteFiles()
      sftp.uploadFile.mockImplementation(async (localPath: string, remotePath: string) => {
        if (remotePath.includes('bad.txt')) throw new Error('disk full')
        const content = fs.readFileSync(localPath)
        sftp.files.set(remotePath, { mode: 0o644, size: content.length, content: content.toString(), isSymlink: false, isDir: false })
      })
      pane.activeTab = { id: 'tab', title: 'tab', sshSession: { openSFTP: async () => sftp }, profile: { id: 'p1' } }
      const dir = path.join(tempDir, 'bundle')
      fs.mkdirSync(dir)
      fs.writeFileSync(path.join(dir, 'ok.txt'), 'ok')
      fs.writeFileSync(path.join(dir, 'bad.txt'), 'bad')
      await pane.uploadDirectoryFromPath(view, dir, false)
      const task = pane.store.tasks[0]
      expect(task?.status).toBe('failed')
      expect(task?.status).not.toBe('succeeded')
      expect(task?.error).toContain('bad.txt')
      await pane.auditLog?.close()
      const audit = readAuditLines(path.join(tempDir, 'sftp-transfer-audit.jsonl'))
      expect(audit.some(event => event.type === 'transfer-failed')).toBe(true)
      expect(fs.readFileSync(transcript, 'utf8')).toBe('VISIBLE\n')
    })
  })

  describe('cross-connection paste', () => {
    it('reads the copied session even when the target has no file at that path', async () => {
      const { pane, clipboard, view } = makePane()
      const source = {
        closed: false,
        reconnect: jest.fn(),
        downloadFile: jest.fn(async (_remote: string, localDest: string) => {
          fs.writeFileSync(localDest, 'from-session-a')
        }),
      }
      const target = remoteFiles()
      pane.activeTab = { id: 'B', title: 'B', sshSession: { openSFTP: async () => target }, profile: { id: 'p1' } }
      clipboard.copy({
        sourceSessionId: 'A',
        sourceSessionName: 'A',
        sourceClientRef: source,
        remotePath: '/only-on-a/note.txt',
        fileName: 'note.txt',
        isDirectory: false,
        size: 14,
        copiedAt: new Date(),
      })
      await pane.pasteFromOtherConnection(view)
      expect(target.files.get('/remote/note.txt')?.content).toBe('from-session-a')
      expect(source.reconnect).not.toHaveBeenCalled()
      expect(pane.store.tasks[0].status).toBe('succeeded')
      expect(pane.store.tasks[0].direction).toBe('cross-remote')
    })

    it('fails a disconnected source, removes the temp file, and does not reconnect', async () => {
      const clipboard = new CrossTransferClipboard()
      const relay = new CrossTransferRelayService(clipboard)
      const store = new TransferStore()
      clipboard.copy({
        sourceSessionId: 'A',
        sourceSessionName: 'A',
        remotePath: '/src/note.txt',
        fileName: 'note.txt',
        isDirectory: false,
        size: 4,
        copiedAt: new Date(),
      })
      const source = {
        closed: false,
        reconnect: jest.fn(),
        downloadFile: jest.fn(async (_remote: string, localDest: string) => {
          fs.writeFileSync(localDest, 'part')
          source.closed = true
          throw new Error('Source connection is disconnected')
        }),
      }
      const target = remoteFiles()
      await expect(
        relay.executeRemotePaste({
          sourceClient: source,
          targetClient: target,
          targetDirectory: '/remote',
          targetStore: store,
          tempDir,
        })
      ).rejects.toThrow('Source connection is disconnected')
      expect(store.tasks[0].status).toBe('failed')
      expect(fs.readdirSync(tempDir)).toEqual([])
      expect(source.reconnect).not.toHaveBeenCalled()
      expect(target.files.has('/remote/note.txt')).toBe(false)
      store.destroy()
    })

    it('copies a directory tree and offers no sync action', async () => {
      const clipboard = new CrossTransferClipboard()
      const relay = new CrossTransferRelayService(clipboard)
      const store = new TransferStore()
      clipboard.copy({
        sourceSessionId: 'A',
        sourceSessionName: 'A',
        remotePath: '/src/folder',
        fileName: 'folder',
        isDirectory: true,
        size: 4,
        copiedAt: new Date(),
      })
      const source = {
        closed: false,
        reconnect: jest.fn(),
        readdir: jest.fn(async () => [{ name: 'note.txt', isDirectory: false }]),
        downloadFile: jest.fn(async (_remote: string, localDest: string) => {
          fs.writeFileSync(localDest, 'tree')
        }),
      }
      const target = remoteFiles()
      const result = await relay.executeRemotePaste({
        sourceClient: source,
        targetClient: target,
        targetDirectory: '/remote',
        targetStore: store,
        tempDir,
      })
      expect(result.targetPath).toBe('/remote/folder')
      expect(target.files.get('/remote/folder/note.txt')?.content).toBe('tree')
      expect(fs.readdirSync(tempDir)).toEqual([])
      const { pane } = makePane()
      expect(offersCrossConnectionSync(pane.contextActions)).toBe(false)
      store.destroy()
    })

    it('reports an empty clipboard without creating a target file', async () => {
      const { pane, view, notifications } = makePane()
      const target = remoteFiles()
      pane.activeTab = { sshSession: { openSFTP: async () => target } }
      await pane.pasteFromOtherConnection(view)
      expect(notifications.error).toHaveBeenCalled()
      expect(target.uploadFile).not.toHaveBeenCalled()
      expect(target.files.size).toBe(0)
    })
  })

  describe('navigation', () => {
    it('uses one file list and follows path mode', async () => {
      const shellSrc = fs.readFileSync(path.join(__dirname, '../src/shell/workbench-shell.component.ts'), 'utf8')
      expect(shellSrc).not.toContain('SFTP+ Dual-Pane')
      expect(shellSrc).not.toContain('Local filesystem view ready')
      expect(shellSrc).not.toContain('refreshLocal')
      const paneSrc = fs.readFileSync(path.join(__dirname, '../src/shell/workbench-sftp-pane.component.ts'), 'utf8')
      expect(paneSrc).toContain('filteredLocalFiles')
      expect(paneSrc).toContain('filteredRemoteFiles')

      const remembered = fs.mkdtempSync(path.join(tempDir, 'remembered-'))
      const defaults = fs.mkdtempSync(path.join(tempDir, 'defaults-'))
      fs.writeFileSync(path.join(defaults, 'listed.txt'), 'x')
      const config: any = {
        store: {
          secureWorkbench: {
            fileTransfer: fileTransfer({ pathMode: 'off', defaultLocalPath: defaults, defaultRemotePath: '/default-remote' }),
            pathMemory: { p1: { localPath: remembered, remotePath: '/remembered-remote' } },
            logging: { directory: tempDir },
          },
        },
        save: jest.fn(),
      }
      const { pane } = makePane(config)
      pane.activeTab = { profile: { id: 'p1' }, session: { getWorkingDirectory: async () => '/from-cwd' } }
      pane.ngOnInit()
      expect(pane.activeView.localPath).toBe(defaults)
      expect(pane.activeView.remotePath).toBe('/default-remote')
      expect(pane.activeView.localFiles.map(file => file.name)).toContain('listed.txt')

      config.store.secureWorkbench.fileTransfer.pathMode = 'remember'
      pane.ngOnInit()
      expect(pane.views[pane.views.length - 1].localPath).toBe(remembered)
      expect(pane.views[pane.views.length - 1].remotePath).toBe('/remembered-remote')

      config.store.secureWorkbench.fileTransfer.pathMode = 'sync'
      pane.ngOnInit()
      await flush()
      expect(pane.views[pane.views.length - 1].remotePath).toBe('/from-cwd')
    })

    it('rejects an empty directory pair and moves only the filled side', () => {
      const notifications = { info: jest.fn(), error: jest.fn(), notice: jest.fn() }
      const config: any = {
        store: { secureWorkbench: { directoryPairs: [{ id: 'keep', title: 'old', localPath: '/a', remotePath: '/b' }] } },
        save: jest.fn(),
      }
      const toolbar = new WorkbenchToolbarComponent(
        notifications as any,
        {} as any,
        config,
        { nativeElement: { contains: () => false } } as any,
        { detectChanges: jest.fn() } as any
      )
      toolbar.newPairTitle = 'blank'
      toolbar.newPairLocal = ' '
      toolbar.newPairRemote = ''
      toolbar.saveNewPair()
      expect(config.store.secureWorkbench.directoryPairs).toHaveLength(1)
      expect(notifications.error).toHaveBeenCalled()

      const { pane, view } = makePane()
      view.localPath = tempDir
      view.remotePath = '/before'
      pane.applyDirectoryPair({ localPath: '', remotePath: '/after' })
      expect(view.localPath).toBe(tempDir)
      expect(view.remotePath).toBe('/after')
    })

    it('opens a remote bookmark without changing the local path', () => {
      const { pane, view, config } = makePane()
      pane.activeTab = { profile: { id: 'p1' } }
      view.localPath = tempDir
      view.remotePath = '/first'
      pane.saveBookmark('remote')
      view.remotePath = '/elsewhere'
      view.localPath = tempDir
      pane.openBookmark(config.store.secureWorkbench.bookmarks[0])
      expect(view.remotePath).toBe('/first')
      expect(view.localPath).toBe(tempDir)
    })

    it('previews small text, refuses an oversized file, and transfers without a preview', async () => {
      const { pane, view, config } = makePane()
      fs.writeFileSync(path.join(tempDir, 'note.txt'), 'hello preview')
      view.localPath = tempDir
      pane.onDblClickLocal(view, { name: 'note.txt', isDirectory: false, size: 13 })
      expect(pane.previewText).toBe('hello preview')
      expect(pane.store.tasks).toHaveLength(0)

      pane.previewText = null
      pane.onDblClickLocal(view, { name: 'big.txt', isDirectory: false, size: PREVIEW_MAX_BYTES + 1 })
      expect(pane.previewText).toBeNull()
      expect(pane.previewNotice).toBeTruthy()
      expect(pane.store.tasks).toHaveLength(0)

      const sftp = remoteFiles()
      pane.activeTab = { sshSession: { openSFTP: async () => sftp }, profile: { id: 'p1' } }
      config.store.secureWorkbench.fileTransfer.doubleClickAction = 'transfer'
      pane.onDblClickLocal(view, { name: 'note.txt', isDirectory: false, size: 13 })
      await flush()
      expect(pane.previewText).toBeNull()
      expect(pane.store.tasks.length).toBeGreaterThan(0)
      expect(pane.store.tasks[0].direction).toBe('upload')
      await pane.auditLog?.close()
    })
  })

  describe('codec, hotkeys, forwards, and language', () => {
    it('decodes a split GBK character once and encodes input as GBK', () => {
      const codec = new StatefulCodec('GBK')
      const emitted: Buffer[] = []
      const written: Buffer[] = []
      const session: any = {
        emitOutput(data: Buffer) { emitted.push(Buffer.from(data)) },
        write(data: Buffer) { written.push(Buffer.from(data)) },
      }
      bindSessionCodec(session, codec)
      const wrapped = session.emitOutput
      bindSessionCodec(session, new StatefulCodec('GBK'))
      expect(session.emitOutput).toBe(wrapped)
      const bytes = iconv.encode('测', 'gbk')
      session.emitOutput(bytes.slice(0, 1))
      session.emitOutput(bytes.slice(1))
      expect(Buffer.concat(emitted).toString('utf8')).toBe('测')
      session.write(Buffer.from('测', 'utf8'))
      expect(written[0].equals(iconv.encode('测', 'gbk'))).toBe(true)
    })

    it('shows the encoding switch and keeps the old encoding on cancel', () => {
      const notifications = { info: jest.fn(), error: jest.fn(), notice: jest.fn() }
      const toolbar = new WorkbenchToolbarComponent(
        notifications as any,
        {} as any,
        { store: {} } as any,
        { nativeElement: { contains: () => false } } as any,
        { detectChanges: jest.fn() } as any
      )
      const codec = new StatefulCodec('UTF-8')
      toolbar.activeTerminalTab = { __workbenchCodec: codec }
      toolbar.requestEncodingSwitch('GBK')
      expect(toolbar.encodingPrompt?.oldEncoding).toBe('UTF-8')
      expect(toolbar.encodingPrompt?.newEncoding).toBe('GBK')
      expect(toolbar.encodingPrompt?.at).toBeInstanceOf(Date)
      expect(toolbar.encodingPrompt?.warning).toContain('U+FFFD')
      expect(codec.encoding).toBe('UTF-8')
      toolbar.cancelEncodingSwitch()
      expect(toolbar.currentEncoding).toBe('UTF-8')
      expect(codec.encoding).toBe('UTF-8')
      toolbar.requestEncodingSwitch('GBK')
      toolbar.confirmEncodingSwitch()
      expect(codec.encoding).toBe('GBK')
      expect(toolbar.currentEncoding).toBe('GBK')
    })

    it('leaves unrelated buttons visible and does not paint the terminal black', () => {
      const root = new FakeEl('div')
      const sftp = new FakeEl('button', { title: 'SFTP' })
      const plus = new FakeEl('button', { title: 'New tab' })
      const gear = new FakeEl('button', { title: 'Settings' })
      root.children.push(sftp, plus, gear)
      expect(applyNativeSftpVisibility(root as any, false).hidden).toBe(0)
      expect(sftp.getAttribute(NATIVE_SFTP_ATTR)).toBeNull()

      const hidden = applyNativeSftpVisibility(root as any, true)
      expect(hidden.recognized).toBe(true)
      expect(sftp.getAttribute(NATIVE_SFTP_ATTR)).toBe('1')
      expect(plus.getAttribute(NATIVE_SFTP_ATTR)).toBeNull()
      expect(gear.getAttribute(NATIVE_SFTP_ATTR)).toBeNull()

      const unknown = new FakeEl('div')
      unknown.children.push(new FakeEl('button', { title: 'New tab' }))
      const missed = applyNativeSftpVisibility(unknown as any, true)
      expect(missed.recognized).toBe(false)
      expect(missed.hidden).toBe(0)
      expect(unknown.children[0].getAttribute(NATIVE_SFTP_ATTR)).toBeNull()

      const scss = fs.readFileSync(path.join(__dirname, '../src/themes/workbench-theme.scss'), 'utf8')
      const decorator = fs.readFileSync(path.join(__dirname, '../src/shell/workbench-terminal-decorator.ts'), 'utf8')
      expect(scss).not.toMatch(/terminal-tab[\s\S]{0,160}background-color:\s*#000000/)
      expect(decorator).not.toMatch(/backgroundColor\s*=\s*['"]#000000['"]/)
      expect(DEFAULT_WORKBENCH_CONFIG.hideNativeSFTPButton).toBe(false)
    })

    it('keeps Alt-C on the command that already owns it', () => {
      const provider = new WorkbenchConfigProvider()
      expect(provider.defaults.hotkeys[SESSION_SEARCH_HOTKEY_ID]).toEqual(['Alt-C'])
      const notifications = { notice: jest.fn(), info: jest.fn(), error: jest.fn() }
      const hotkeys = { hotkey$: new Subject<string>() }
      let focused = false
      const previousDocument = (global as any).document
      ;(global as any).document = { querySelector: () => ({ focus: () => { focused = true } }) }
      const config: any = { store: { hotkeys: { 'other-command': ['Alt-C'] }, secureWorkbench: {} } }
      const host = new WorkbenchHostShellService(
        {} as any,
        {} as any,
        {} as any,
        { ready$: null, activeTab: null, tabs: [] } as any,
        config,
        { run: (fn: any) => fn() } as any,
        undefined,
        undefined,
        hotkeys as any,
        notifications as any
      )
      expect(host.reconcileSearchHotkey()).toEqual([])
      expect(config.store.hotkeys['other-command']).toEqual(['Alt-C'])
      expect(config.store.hotkeys[SESSION_SEARCH_HOTKEY_ID]).toEqual([])
      expect(host.searchHotkeyNotice).toContain('Alt+C')
      expect(notifications.notice).toHaveBeenCalled()
      hotkeys.hotkey$.next(SESSION_SEARCH_HOTKEY_ID)
      expect(focused).toBe(true)
      ;(global as any).document = previousDocument
    })

    it('persists a port forward on the profile and translates covered labels', async () => {
      const notifications = { notice: jest.fn(), info: jest.fn(), error: jest.fn() }
      const profile: any = { id: 'ssh-1', options: {} }
      const config: any = { store: { secureWorkbench: { uiLanguage: 'en-US' } }, save: jest.fn().mockResolvedValue(undefined) }
      const profiles = { getConfigProxyForProfile: (item: any) => item }
      const i18n = new I18nService(config)
      const toolbar = new WorkbenchToolbarComponent(
        notifications as any,
        {} as any,
        config,
        { nativeElement: { contains: () => false } } as any,
        { detectChanges: jest.fn() } as any,
        undefined,
        undefined,
        profiles as any,
        i18n
      )
      toolbar.activeTerminalTab = { profile }
      toolbar.forwardPort = 2222
      toolbar.forwardTargetHost = '10.0.0.8'
      toolbar.forwardTargetPort = 80
      await toolbar.savePortForward()
      expect(profile.options.portForwards[0]).toMatchObject({
        sourcePort: 2222,
        targetHost: '10.0.0.8',
        targetPort: 80,
      })
      expect(config.save).toHaveBeenCalled()
      expect(notifications.notice.mock.calls[0][0]).toMatch(/next reconnect/i)
      expect(toolbar.t('settings.fileTransfer')).toBe('File Transfer (SFTP)')
      expect(toolbar.t('sftp.newDirectoryPair')).toBe('New directory pair')
      expect(toolbar.t('sftp.encodingSwitch')).toBe('Encoding switch')
      expect(toolbar.t('sftp.zhOnlyHint')).toBe('仅中文回退')
      expect(i18n.t('settings.fileTransfer')).not.toBe('文件传输 (SFTP)')
    })
  })
})
