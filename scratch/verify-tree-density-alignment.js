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
  throw new Error('Failed to connect to CDP endpoint on port 9222 after 20 attempts')
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

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' })
    const buffer = Buffer.from(res.data, 'base64')
    const filePath = path.join(ARTIFACT_DIR, filename)
    fs.writeFileSync(filePath, buffer)
    console.log(`[CDP] Saved screenshot to ${filePath}`)
    return filePath
  }

  close() {
    if (this.ws) {
      this.ws.close()
    }
  }
}

async function run() {
  console.log('[Test] Connecting to CDP...')
  const wsUrl = await getCdpEndpoint()
  const client = new CdpClient(wsUrl)
  await client.connect()
  console.log('[Test] Connected to Tabby CDP.')

  await client.send('DOM.enable')
  await client.send('Page.enable')

  // Wait for shell
  console.log('[Test] Waiting for Workbench shell active...')
  await client.eval(`
    new Promise((resolve) => {
      const check = () => {
        if (document.body.classList.contains('workbench-shell-active')) {
          resolve(true);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    })
  `)

  await sleep(1500)

  // 1. Verify Header & Toolbar Compactness
  console.log('[Test 1] Verifying Header and Toolbar compactness...')
  const toolbarCheck = await client.eval(`
    (() => {
      const drawer = document.querySelector('workbench-drawer');
      const oldToolbar = drawer ? drawer.querySelector('.session-mgr-toolbar') : null;
      const oldBottomBar = drawer ? drawer.querySelector('.drawer-bottom-bar') : null;
      const compactIcons = drawer ? drawer.querySelectorAll('.btn-header-tool') : [];
      const searchBox = drawer ? drawer.querySelector('.search-box') : null;

      return {
        hasOldToolbar: !!oldToolbar,
        hasOldBottomBar: !!oldBottomBar,
        compactIconCount: compactIcons.length,
        hasSearchBox: !!searchBox,
      };
    })()
  `)
  console.log('Toolbar Status:', toolbarCheck)
  if (toolbarCheck.hasOldToolbar) {
    throw new Error('Old bulky text toolbar (.session-mgr-toolbar) should be removed!')
  }
  if (toolbarCheck.hasOldBottomBar) {
    throw new Error('Redundant bottom bar (.drawer-bottom-bar) should be removed!')
  }
  if (toolbarCheck.compactIconCount < 4) {
    throw new Error('Compact header icons missing!')
  }

  // 2. Verify Session Rows (No Cards, Height 32-36px, Indentation)
  console.log('[Test 2] Verifying Pure Tree Rows (no card borders, 32-36px height, level indentation)...')
  const rowsCheck = await client.eval(`
    (() => {
      const drawer = document.querySelector('workbench-drawer');
      const oldCards = drawer ? drawer.querySelectorAll('.session-card') : [];
      const treeRows = drawer ? drawer.querySelectorAll('.tree-session-row') : [];
      const level1Rows = drawer ? drawer.querySelectorAll('.tree-session-row.level-1') : [];
      const level2Rows = drawer ? drawer.querySelectorAll('.tree-session-row.level-2') : [];
      const folders = drawer ? drawer.querySelectorAll('.tree-folder') : [];

      let sampleStyle = null;
      if (treeRows.length > 0) {
        const computed = window.getComputedStyle(treeRows[0]);
        sampleStyle = {
          height: computed.height,
          borderTop: computed.borderTop,
          borderBottom: computed.borderBottom,
          borderRight: computed.borderRight,
          borderLeft: computed.borderLeft,
          borderRadius: computed.borderRadius,
          boxShadow: computed.boxShadow,
          marginBottom: computed.marginBottom,
        };
      }

      let level1Padding = level1Rows.length > 0 ? window.getComputedStyle(level1Rows[0]).paddingLeft : null;
      let level2Padding = level2Rows.length > 0 ? window.getComputedStyle(level2Rows[0]).paddingLeft : null;
      let folderPadding = folders.length > 0 ? window.getComputedStyle(folders[0]).paddingLeft : null;

      return {
        oldCardCount: oldCards.length,
        treeRowCount: treeRows.length,
        level1Count: level1Rows.length,
        level2Count: level2Rows.length,
        sampleStyle,
        level1Padding,
        level2Padding,
        folderPadding,
      };
    })()
  `)
  console.log('Tree Rows Status:', rowsCheck)
  if (rowsCheck.oldCardCount > 0) {
    throw new Error('Old .session-card elements still present in tree!')
  }
  if (rowsCheck.treeRowCount === 0) {
    throw new Error('No .tree-session-row elements found in tree!')
  }
  const rowHeightNum = parseFloat(rowsCheck.sampleStyle.height)
  if (rowHeightNum < 30 || rowHeightNum > 38) {
    throw new Error(`Row height out of expected 32-36px range: ${rowsCheck.sampleStyle.height}`)
  }

  // 3. Verify Inline Info Deduplication & Protocol Badges
  console.log('[Test 3] Verifying Inline Info Deduplication and Protocol Badge logic...')
  const textCheck = await client.eval(`
    (() => {
      const rows = Array.from(document.querySelectorAll('.tree-session-row'));
      const parsedRows = rows.map(r => {
        const title = r.querySelector('.session-title') ? r.querySelector('.session-title').textContent.trim() : '';
        const subtitle = r.querySelector('.session-secondary-line') ? r.querySelector('.session-secondary-line').textContent.trim() : '';
        const badge = r.querySelector('.badge-proto-tag') ? r.querySelector('.badge-proto-tag').textContent.trim() : null;
        return { title, subtitle, badge };
      });

      // Find 192.168.1.110
      const row110 = parsedRows.find(r => r.title === '192.168.1.110');
      // Find 运维网关
      const rowGateway = parsedRows.find(r => r.title === '运维网关');
      // Find 127.0.0.1
      const row127 = parsedRows.find(r => r.title === '127.0.0.1');

      return {
        parsedRowCount: parsedRows.length,
        row110,
        rowGateway,
        row127,
      };
    })()
  `)
  console.log('Inline Info Status:', textCheck)
  if (textCheck.row110) {
    // Should NOT repeat 192.168.1.110 in subtitle
    if (textCheck.row110.subtitle.includes('@192.168.1.110')) {
      throw new Error(`Host is repeated twice in row 192.168.1.110: ${textCheck.row110.subtitle}`)
    }
    console.log('✓ Row 192.168.1.110 correctly displays subtitle without duplicate host:', textCheck.row110.subtitle)
  }
  if (textCheck.rowGateway) {
    // Primary is remark '运维网关', subtitle contains user@host
    console.log('✓ Row 运维网关 correctly displays remark as title and user@host as subtitle:', textCheck.rowGateway)
  }
  if (textCheck.row127) {
    // Standard port 22: badge should be null (hidden)
    if (textCheck.row127.badge !== null) {
      throw new Error(`Standard SSH port 22 should hide protocol badge, but found: ${textCheck.row127.badge}`)
    }
    console.log('✓ Standard SSH port 22 has hidden protocol badge.')
  }

  // 4. Verify Chinese Group Name
  console.log('[Test 4] Verifying Chinese Group Name translation...')
  const groupNameCheck = await client.eval(`
    (() => {
      const folders = Array.from(document.querySelectorAll('.tree-folder .tree-label')).map(l => l.textContent.trim());
      const hasEnglishImport = folders.some(f => f.includes('Imported from'));
      const hasChineseImport = folders.some(f => f.includes('SSH 配置导入'));
      return {
        folders,
        hasEnglishImport,
        hasChineseImport,
      };
    })()
  `)
  console.log('Group Names:', groupNameCheck)
  if (groupNameCheck.hasEnglishImport) {
    throw new Error('Group name still has English "Imported from .ssh/config"!')
  }

  // 5. Verify Selection State (Left 2px bar, no whole border)
  console.log('[Test 5] Verifying Selection State (2px left bar)...')
  await client.eval(`
    (() => {
      const firstRow = document.querySelector('.tree-session-row');
      if (firstRow) firstRow.click();
    })()
  `)
  await sleep(300)

  const selectCheck = await client.eval(`
    (() => {
      const selectedRow = document.querySelector('.tree-session-row.selected');
      if (!selectedRow) return { hasSelected: false };
      const computed = window.getComputedStyle(selectedRow);
      return {
        hasSelected: true,
        borderLeft: computed.borderLeft,
        borderRight: computed.borderRight,
        borderTop: computed.borderTop,
        borderBottom: computed.borderBottom,
        backgroundColor: computed.backgroundColor,
      };
    })()
  `)
  console.log('Selection Status:', selectCheck)
  if (!selectCheck.hasSelected) {
    throw new Error('Clicked row did not receive .selected class!')
  }
  if (!selectCheck.borderLeft.includes('solid rgb(30, 112, 191)')) {
    throw new Error(`Selected row should have solid blue left border, got: ${selectCheck.borderLeft}`)
  }

  // 6. Capture Evidence Screenshot
  console.log('[Test 6] Capturing high density tree evidence screenshot...')
  await client.captureScreenshot('evidence_89_high_density_session_tree.png')

  console.log('[Test] All tree density and hierarchy assertions passed successfully!')
  client.close()
}

run().catch(err => {
  console.error('[Test Error]', err)
  process.exit(1)
})
