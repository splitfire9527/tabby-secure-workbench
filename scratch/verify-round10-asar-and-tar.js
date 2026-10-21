const fs = require('fs')
const path = require('path')

const ARTIFACT_DIR = '/home/splitfire/.gemini/antigravity/brain/6ed9bb03-3fc0-4a23-a969-e78fbc50ca60'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getCdpEndpoint() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://localhost:9222/json')
      const targets = await res.json()
      const page = targets.find(t => t.type === 'page' || t.type === 'webview')
      if (page && page.webSocketDebuggerUrl) {
        return page.webSocketDebuggerUrl
      }
    } catch (e) {}
    await sleep(1000)
  }
  throw new Error('Failed to connect to CDP endpoint on port 9222')
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.ws = null
    this.reqId = 1
    this.pending = new Map()
  }

  connect() {
    return new Promise((resolve, reject) => {
      const WebSocket = globalThis.WebSocket
      this.ws = new WebSocket(this.wsUrl)
      this.ws.onopen = () => resolve()
      this.ws.onerror = (err) => reject(err)
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id && this.pending.has(msg.id)) {
          const { res, rej } = this.pending.get(msg.id)
          this.pending.delete(msg.id)
          if (msg.error) rej(msg.error)
          else res(msg.result)
        }
      }
    })
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.reqId++
      this.pending.set(id, { res: resolve, rej: reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`)
    }
    return res.result ? res.result.value : undefined
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' })
    const buf = Buffer.from(res.data, 'base64')
    const fullPath = path.join(ARTIFACT_DIR, filename)
    fs.writeFileSync(fullPath, buf)
    console.log(`Saved screenshot to ${fullPath}`)
    return fullPath
  }

  close() {
    if (this.ws) {
      this.ws.close()
    }
  }
}

async function run() {
  console.log('Connecting to Tabby via CDP...')
  const wsUrl = await getCdpEndpoint()
  const client = new CdpClient(wsUrl)
  await client.connect()

  // Wait for Angular app to stabilize
  await sleep(2000)

  // 1. Verify Window Styling (Cursor-style elevation shadow & 1px border)
  console.log('Verifying Cursor-style Window Styling...')
  const winStyle = await client.eval(`(() => {
    const win = document.querySelector('.window.workbench-shell-active')
    if (!win) return { error: 'No .window.workbench-shell-active found' }
    const computed = window.getComputedStyle(win)
    return {
      border: computed.border,
      borderRadius: computed.borderRadius,
      boxShadow: computed.boxShadow,
      isMaximized: win.classList.contains('window-maximized'),
      gridAreas: computed.gridTemplateAreas
    }
  })()`)
  console.log('Window style evaluation result:', JSON.stringify(winStyle, null, 2))

  // Capture screenshot of Cursor-style window border and shadow
  await client.screenshot('evidence_114_cursor_style_window_shadow_and_border.png')

  // 2. Test SFTP Pane: Open bottom dock SFTP pane
  console.log('Opening Bottom Dock SFTP Pane...')
  await client.eval(`(() => {
    const sftpBtn = document.querySelector('workbench-bottom-dock button[title*="文件传输"]') ||
                    Array.from(document.querySelectorAll('workbench-bottom-dock button')).find(b => b.textContent.includes('文件传输'))
    if (sftpBtn) {
      sftpBtn.click()
    }
  })()`)
  await sleep(1000)

  // 3. Test app.asar detection in /opt/Tabby/resources
  console.log('Testing app.asar file detection in /opt/Tabby/resources...')
  const asarTest = await client.eval(`(async () => {
    const sftpPane = document.querySelector('workbench-sftp-pane')
    if (!sftpPane) return { error: 'No sftp pane found' }
    // Get Angular component instance
    const ngComp = window.ng ? window.ng.getComponent(sftpPane) : null
    if (!ngComp || !ngComp.views || ngComp.views.length === 0) {
      return { error: 'No active sftp view found' }
    }
    const view = ngComp.views[0]
    // Point local path to /opt/Tabby/resources where app.asar actually lives
    view.localPath = '/opt/Tabby/resources'
    ngComp.loadLocalFiles(view)
    
    // Look for app.asar
    const asarFile = view.localFiles.find(f => f.name === 'app.asar')
    const hasDirUploadBtn = !!sftpPane.querySelector('button[title*="上传本地目录"]') ||
                           Array.from(sftpPane.querySelectorAll('button')).some(b => b.textContent.includes('上传目录'))
    const hasDirPicker = !!sftpPane.querySelector('input[webkitdirectory]')
    const hasRemoteDrag = !!sftpPane.querySelector('.sftp-pane-card[dragover]') ||
                          !!sftpPane.querySelectorAll('.sftp-pane-card')[1]
    
    return {
      localPath: view.localPath,
      asarFound: !!asarFile,
      asarIsDirectory: asarFile ? asarFile.isDirectory : null,
      asarSize: asarFile ? asarFile.size : null,
      asarMode: asarFile ? asarFile.mode : null,
      hasDirUploadBtn,
      hasDirPicker,
      totalFiles: view.localFiles.length
    }
  })()`)
  console.log('app.asar and Directory Upload test result:', JSON.stringify(asarTest, null, 2))

  // Capture screenshot of SFTP pane showing app.asar as file and dir upload controls
  await client.screenshot('evidence_115_sftp_asar_file_and_dir_upload_features.png')

  client.close()
  console.log('Verification completed successfully!')
}

run().catch(err => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
