import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { atomicDownload } from '../src/sftp-plus/atomic-download'
import { adaptSftpSession } from '../src/sftp-plus/sftp-client-adapter'
import { OverwriteUploader } from '../src/sftp-plus/overwrite-uploader'
import { WorkbenchNewSessionModalComponent } from '../src/shell/workbench-new-session-modal.component'
import { WorkbenchDrawerComponent } from '../src/shell/workbench-drawer.component'
import { WorkbenchDialogService } from '../src/shell/workbench-dialog.service'
import { WorkbenchSftpPaneComponent } from '../src/shell/workbench-sftp-pane.component'
import { CrossTransferClipboard } from '../src/cross-transfer/cross-transfer-clipboard'
import { CrossTransferRelayService } from '../src/cross-transfer/cross-transfer-relay.service'
import { TransferStore } from '../src/transfer-store/transfer-store'
import { SessionLogger } from '../src/session-logging/session-logger'
import { SessionLoggerService } from '../src/session-logging/session-logger.service'
import { VisibleTextFilter } from '../src/session-logging/visible-text-filter'
import { CodecRegistryService } from '../src/terminal-codec/codec-decorator'
import { StatefulCodec } from '../src/terminal-codec/stateful-codec'

const missing = () => Object.assign(new Error('No such file'), { code: 2 })
describe('Security audit regressions', () => {
  let dir: string
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-security-')) })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  function pane(action = 'overwrite') {
    const clipboard = new CrossTransferClipboard()
    const p = new WorkbenchSftpPaneComponent(clipboard, new CrossTransferRelayService(clipboard),
      { info: jest.fn(), error: jest.fn() } as any,
      { store: { secureWorkbench: { fileTransfer: { conflictAction: action }, logging: { directory: dir } } } } as any)
    p.store = new TransferStore()
    jest.spyOn(p as any, 'ensureAudit').mockReturnValue({ record: jest.fn() })
    const view = p.createView('test', dir, '/remote')
    p.views = [view]
    p.activeViewId = view.id
    return { p, view }
  }

  it('preserves an existing download on read failure and closes handles', async () => {
    const dest = path.join(dir, 'existing')
    fs.writeFileSync(dest, 'original')
    const handle = { read: jest.fn().mockResolvedValueOnce(Buffer.from('partial')).mockRejectedValueOnce(new Error('disconnect')), close: jest.fn() }
    await expect(atomicDownload({ open: async () => handle }, '/remote/file', dest)).rejects.toThrow('disconnect')
    expect(fs.readFileSync(dest, 'utf8')).toBe('original')
    expect(fs.readdirSync(dir)).toEqual(['existing'])
    expect(handle.close).toHaveBeenCalledTimes(1)
  })

  it('does not publish a download cancelled during a pending read', async () => {
    let active = true
    const dest = path.join(dir, 'existing')
    fs.writeFileSync(dest, 'original')
    await expect(atomicDownload({ open: async () => ({
      read: async () => { active = false; return Buffer.from('new') }, close: async () => {},
    }) }, '/file', dest, () => { if (!active) throw new Error('cancelled') })).rejects.toThrow('cancelled')
    expect(fs.readFileSync(dest, 'utf8')).toBe('original')
    expect(fs.readdirSync(dir)).toEqual(['existing'])
  })

  it('applies skip to downloads before opening the source', async () => {
    const { p, view } = pane('skip')
    fs.writeFileSync(path.join(dir, 'file'), 'original')
    view.selectedRemoteFile = { name: 'file', size: 3, isDirectory: false } as any
    const open = jest.fn()
    jest.spyOn(p, 'getRealSftpSession').mockResolvedValue({ open })
    await p.downloadSelectedFile(view)
    expect(open).not.toHaveBeenCalled()
    expect(fs.readFileSync(path.join(dir, 'file'), 'utf8')).toBe('original')
    expect(p.store.tasks[0].status).toBe('cancelled')
  })

  it('sets 0600 before the first remote byte and closes on chmod failure', async () => {
    const src = path.join(dir, 'source'); fs.writeFileSync(src, 'secret')
    let mode = 0o644
    const handle = { write: jest.fn(async () => { expect(mode).toBe(0o600) }), close: jest.fn() }
    const sftp = { open: async () => handle, chmod: jest.fn(async (_p, value) => { mode = value }) }
    await adaptSftpSession(sftp).uploadFile(src, '/temp')
    expect(handle.write).toHaveBeenCalled()
    sftp.chmod.mockRejectedValueOnce(new Error('denied'))
    await expect(adaptSftpSession(sftp).uploadFile(src, '/temp')).rejects.toThrow('denied')
    expect(handle.close).toHaveBeenCalledTimes(2)
    expect(handle.write).toHaveBeenCalledTimes(1)
  })

  it('does not publish an upload cancelled after streaming and before rename', async () => {
    const src = path.join(dir, 'source'); fs.writeFileSync(src, 'secret')
    let active = true
    const client = { lstat: async () => ({ mode: 0o600, isDirectory: () => false, isSymbolicLink: () => false }),
      uploadFile: async () => {}, chmod: async () => { active = false }, rename: jest.fn(), unlink: jest.fn() }
    await expect(new OverwriteUploader().uploadWithAtomicOverwrite(client as any, src, '/file', {
      assertActive: () => { if (!active) throw new Error('cancelled') },
    })).rejects.toThrow('cancelled')
    expect(client.rename).not.toHaveBeenCalled()
    expect(client.unlink).toHaveBeenCalled()
  })

  it('preserves remote-only files and skips collisions even when tar is requested', async () => {
    const { p, view } = pane('skip')
    const folder = path.join(dir, 'folder'); fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, 'same'), 'new')
    const files = new Map([['/remote/folder/same', 'old'], ['/remote/folder/remote-only', 'keep']])
    const sftp = { lstat: async (name) => {
      if (name === '/remote/folder') return { isDirectory: () => true, mode: 0o755 }
      if (!files.has(name)) throw missing()
      return { isDirectory: () => false, mode: 0o600 }
    }, mkdir: async () => {}, open: jest.fn(), readdir: async () => [] }
    jest.spyOn(p, 'getRealSftpSession').mockResolvedValue(sftp)
    const tar = jest.spyOn(p.tarChannel, 'tryUploadDir')
    await p.uploadDirectoryFromPath(view, folder, true)
    expect(tar).not.toHaveBeenCalled()
    expect(sftp.open).not.toHaveBeenCalled()
    expect([...files.values()]).toEqual(['old', 'keep'])
    expect(p.store.tasks[0].status).toBe('succeeded')
  })

  it('ignores an older directory response after navigation', async () => {
    const { p, view } = pane()
    let resolveOld: (entries: any[]) => void
    const old = new Promise<any[]>(resolve => { resolveOld = resolve })
    jest.spyOn(p, 'getRealSftpSession').mockResolvedValue({ readdir: (name) => name === '/remote' ? old : Promise.resolve([{ name: 'new', size: 1 }]) })
    const first = p.loadRemoteFiles(view)
    await Promise.resolve(); await Promise.resolve()
    view.remotePath = '/next'
    await p.loadRemoteFiles(view)
    resolveOld!([{ name: 'stale' }]); await first
    expect(view.remoteFiles.map(f => f.name)).toContain('new')
    expect(view.remoteFiles.map(f => f.name)).not.toContain('stale')
  })

  it('preserves authentication, jumps and unedited options when renaming a profile', () => {
    const original = { id: 'one', type: 'ssh', name: 'old', options: { host: 'host', user: 'alice', auth: 'key',
      privateKey: '/key', jumpHost: 'jump', privateKeys: ['/native-key'], secureWorkbench: { custom: true, logging: { promptForFilename: true, maxFileSizeMB: 10 } } } }
    const config: any = { store: { profiles: [original] }, save: jest.fn() }
    const modal = new WorkbenchNewSessionModalComponent(new WorkbenchDialogService(), config, { detectChanges() {} } as any)
    modal.openWithProfile(original); modal.formData.name = 'new'; modal.save()
    expect(config.store.profiles[0].options).toMatchObject(original.options)
    expect(config.store.profiles[0].name).toBe('new')
  })

  it('does not save or carry passwords into another form; connects with a separate copy', async () => {
    const config: any = { store: { profiles: [] }, save: jest.fn() }
    const profiles: any = { getProfiles: async () => [], openNewTabForProfile: jest.fn() }
    const modal = new WorkbenchNewSessionModalComponent(new WorkbenchDialogService(), config, { detectChanges() {} } as any, profiles)
    modal.openWithProfile({}); modal.formData.ssh.host = 'first'; modal.formData.ssh.password = 'secret'
    await modal.saveAndConnect()
    expect(profiles.openNewTabForProfile.mock.calls[0][0].options.password).toBe('secret')
    expect(JSON.stringify(config.store)).not.toContain('secret')
    modal.openWithProfile({}); modal.formData.ssh.host = 'second'; modal.save()
    expect(config.store.profiles[1].options.password).toBeUndefined()
    expect(modal.formData.ssh.password).toBe('')
  })

  it('does not reuse another user or port on the same host', async () => {
    const tab = { profile: { id: 'old', options: { host: 'host', user: 'root', port: 22 } } }
    const app: any = { tabs: [tab], selectTab: jest.fn() }
    const profiles: any = { openNewTabForProfile: jest.fn() }
    const drawer = new WorkbenchDrawerComponent({} as any, {} as any, profiles, undefined, undefined, app)
    await drawer.openSftpForProfile({ id: 'new', type: 'ssh', options: { host: 'host', user: 'alice', port: 2222 } })
    expect(app.selectTab).not.toHaveBeenCalled()
    expect(profiles.openNewTabForProfile).toHaveBeenCalledTimes(1)
  })

  it.each(['append', 'overwrite'])('retains all transcript bytes across %s rotation', async mode => {
    const logger = new SessionLogger({ directory: dir, filenameTemplate: 'fixed.log', appendMode: mode, maxFileSizeMB: 1 / 1048576 }, { id: 'test', name: 'test' })
    logger.writeText('first\n'); logger.writeText('second\n'); await logger.close()
    const contents = fs.readdirSync(dir).filter(n => n.startsWith('fixed.log')).map(n => fs.readFileSync(path.join(dir, n), 'utf8')).join('')
    expect(contents).toContain('first\n'); expect(contents).toContain('second\n')
    expect(contents.length).toBe('first\nsecond\n'.length)
  })

  it('records split raw bytes and continues logging after codec replacement', async () => {
    const registry = new CodecRegistryService()
    const tab: any = { id: 'tab', title: 'test' }
    const service = new SessionLoggerService({ store: { secureWorkbench: { logging: { directory: dir, filenameTemplate: 'raw.log', mode: 'raw' } } } } as any, registry)
    const first = new StatefulCodec('UTF-8'); registry.register(tab, first)
    const logger = service.startLogging(tab)!
    const bytes = Buffer.from('中')
    first.decodeChunk(bytes.subarray(0, 1)); first.decodeChunk(bytes.subarray(1))
    first.destroy()
    const next = new StatefulCodec('UTF-8'); registry.register(tab, next); next.decodeChunk(Buffer.from('new\n'))
    await logger.close(); service.stopLogging(tab)
    expect(fs.readFileSync(path.join(dir, 'raw.log.raw'))).toEqual(Buffer.concat([bytes, Buffer.from('new\n')]))
    expect(fs.readFileSync(path.join(dir, 'raw.log'), 'utf8')).toBe('中new\n')
  })

  it.each(['P', '^', '_', ']'])('suppresses split ESC %s payloads', kind => {
    const filter = new VisibleTextFilter()
    expect(filter.push(`before\x1b${kind}secret`)).toBe('before')
    expect(filter.push('more\x1b')).toBe('')
    expect(filter.push('\\after')).toBe('after')
  })

  it('relays a Tabby open/read/close source without downloadFile', async () => {
    const clipboard = new CrossTransferClipboard()
    const source = { open: async () => ({ read: jest.fn().mockResolvedValueOnce(Buffer.from('payload')).mockResolvedValueOnce(Buffer.alloc(0)), close: jest.fn() }) }
    clipboard.copy({ sourceSessionId: 'source', sourceSessionName: 'source', sourceClientRef: source, remotePath: '/file', fileName: 'file', isDirectory: false, size: 7, copiedAt: new Date() })
    let received = ''
    const target: any = { lstat: async () => { throw missing() }, uploadFile: async (file) => { received = fs.readFileSync(file, 'utf8') }, rename: async () => {}, unlink: async () => {} }
    await new CrossTransferRelayService(clipboard).executeRemotePaste({ sourceClient: source, targetClient: target, targetDirectory: '/target', targetStore: new TransferStore(), tempDir: dir })
    expect(received).toBe('payload'); expect(fs.readdirSync(dir)).toEqual([])
  })
})
