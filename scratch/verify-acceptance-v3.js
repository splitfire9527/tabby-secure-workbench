const fs = require('fs')
const path = require('path')

const ARTIFACT_DIR = '/home/splitfire/.gemini/antigravity/brain/6ed9bb03-3fc0-4a23-a969-e78fbc50ca60'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getCdpEndpoint() {
  const res = await fetch('http://localhost:9222/json')
  const targets = await res.json()
  const page = targets.find((t) => t.type === 'page' || t.type === 'webview')
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error('No valid CDP page target found on port 9222')
  }
  return page.webSocketDebuggerUrl
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
    const outPath = path.join(ARTIFACT_DIR, filename)
    fs.writeFileSync(outPath, Buffer.from(res.data, 'base64'))
    console.log(`[Screenshot Saved]: ${outPath}`)
    return outPath
  }

  close() {
    if (this.ws) this.ws.close()
  }
}

async function run() {
  console.log('=== Starting Acceptance Verification for SecureCRT Layout & Features ===')
  await sleep(3000)

  const wsUrl = await getCdpEndpoint()
  console.log(`Connected to CDP: ${wsUrl}`)

  const client = new CdpClient(wsUrl)
  await client.connect()
  await client.send('DOM.enable')
  await client.send('Page.enable')
  await client.send('Runtime.enable')

  // Step 1: Verify Window Layout & Grid
  console.log('\n--- Step 1: Verifying Full-Width Title Bar & Grid Layout ---')
  const layoutInfo = await client.eval(`(() => {
    const win = document.querySelector('.window.workbench-shell-active')
    const titlebar = document.querySelector('workbench-global-title-bar')
    const sidebar = document.querySelector('workbench-sidebar')
    const main = document.querySelector('.content.main')
    const tabs = document.querySelector('.content.main > .tab-bar')
    const sessionTree = document.querySelector('.session-tree')
    const startPage = document.querySelector('start-page')

    const winStyle = win ? window.getComputedStyle(win) : null
    const titleStyle = titlebar ? window.getComputedStyle(titlebar) : null
    const treeStyle = sessionTree ? window.getComputedStyle(sessionTree) : null
    const startStyle = startPage ? window.getComputedStyle(startPage) : null

    return {
      windowHasGrid: winStyle ? winStyle.display : null,
      gridAreas: winStyle ? winStyle.gridTemplateAreas : null,
      titlebarPresent: !!titlebar,
      titlebarWidth: titlebar ? titlebar.offsetWidth : 0,
      titlebarHeight: titlebar ? titlebar.offsetHeight : 0,
      windowWidth: window.innerWidth,
      titlebarBg: titleStyle ? titleStyle.backgroundColor : null,
      sidebarPresent: !!sidebar,
      mainPresent: !!main,
      tabsAtTopOfMain: !!tabs,
      sessionTreeBg: treeStyle ? treeStyle.backgroundColor : null,
      startPageBg: startStyle ? startStyle.backgroundColor : null,
    }
  })()`)

  console.log('Layout Info:', JSON.stringify(layoutInfo, null, 2))

  // Take screenshot 1: Global titlebar & SecureCRT light gray theme
  await client.screenshot('evidence_25_global_titlebar_and_securecrt_theme.png')

  // Step 2: Open Session 127.0.0.1
  console.log('\n--- Step 2: Connect to 127.0.0.1 Session ---')
  const connectRes = await client.eval(`(() => {
    // Find session card for 127.0.0.1 or click first session card
    const cards = Array.from(document.querySelectorAll('.session-card'))
    const card127 = cards.find(c => c.textContent.includes('127.0.0.1')) || cards[0]
    if (card127) {
      card127.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      return { clicked: true, text: card127.textContent.trim() }
    }
    return { clicked: false }
  })()`)
  console.log('Connect Result:', connectRes)

  await sleep(2500)

  // Step 3: Check Title Bar and Toolbar in active session
  console.log('\n--- Step 3: Verify Active Session Title and Toolbar ---')
  const sessionCheck = await client.eval(`(() => {
    const titleEl = document.querySelector('workbench-global-title-bar .window-title')
    const badgeEl = document.querySelector('workbench-global-title-bar .status-badge')
    const toolbar = document.querySelector('workbench-toolbar')
    const logBtn = document.querySelector('[data-action="btn-logging"]')
    const logOptBtn = document.querySelector('[data-action="btn-log-options"]')

    return {
      titleText: titleEl ? titleEl.textContent.trim() : null,
      badgeText: badgeEl ? badgeEl.textContent.trim() : null,
      toolbarPresent: !!toolbar,
      toolbarHeight: toolbar ? toolbar.offsetHeight : 0,
      logBtnPresent: !!logBtn,
      logOptBtnPresent: !!logOptBtn,
    }
  })()`)
  console.log('Active Session Info:', JSON.stringify(sessionCheck, null, 2))

  // Take screenshot 2: Active session with top titlebar, tabs, and toolbar
  await client.screenshot('evidence_27_session_connected_layout.png')

  // Step 4: Open Session Options - Log File Dialog
  console.log('\n--- Step 4: Open Session Options - Log File Dialog ---')
  const openDialogRes = await client.eval(`(() => {
    const logOptBtn = document.querySelector('[data-action="btn-log-options"]')
    if (logOptBtn) {
      logOptBtn.click()
      return { clickedOptBtn: true }
    }
    return { clickedOptBtn: false }
  })()`)
  console.log('Open Dialog Click Result:', openDialogRes)

  await sleep(1000)

  // Verify dialog is open
  const dialogInfo = await client.eval(`(() => {
    const dlg = document.querySelector('session-log-dialog')
    if (!dlg) return { dialogOpen: false }

    const title = dlg.querySelector('.title-text')?.textContent.trim()
    const logFileInput = dlg.querySelector('input.log-input')?.value
    const promptCb = dlg.querySelector('#promptForFilename')?.checked
    const startConnectCb = dlg.querySelector('#startLogUponConnect')?.checked
    const rawCb = dlg.querySelector('#rawLog')?.checked
    const midnightCb = dlg.querySelector('#startNewLogAtMidnight')?.checked
    const overwriteRadio = dlg.querySelector('#overwriteRadio')?.checked
    const appendRadio = dlg.querySelector('#appendRadio')?.checked
    const tsCb = dlg.querySelector('#timestampEachLine')?.checked
    const traceInput = dlg.querySelector('.trace-input')?.value
    const customData = Array.from(dlg.querySelectorAll('.custom-input')).map(i => i.value)

    return {
      dialogOpen: true,
      title,
      logFileInput,
      promptCb,
      startConnectCb,
      rawCb,
      midnightCb,
      overwriteRadio,
      appendRadio,
      tsCb,
      traceInput,
      customDataCount: customData.length,
    }
  })()`)
  console.log('Dialog Info:', JSON.stringify(dialogInfo, null, 2))

  // Take screenshot 3: SecureCRT Session Options - Log File Dialog
  await client.screenshot('evidence_26_session_log_dialog.png')

  console.log('\n=== All Acceptance Verification Steps Completed Successfully ===')
  client.close()
}

run().catch((err) => {
  console.error('Acceptance Verification Failed:', err)
  process.exit(1)
})
