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

  // Wait for application shell to be fully active
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

  // 1. Verify Global Title Bar
  console.log('[Test] Verifying Title Bar (No mode switch capsule)...')
  const titleBarCheck = await client.eval(`
    (() => {
      const modeCapsule = document.querySelector('.mode-toggle-wrapper');
      const titleBar = document.querySelector('workbench-global-title-bar');
      const windowTitle = titleBar ? titleBar.querySelector('.window-title') : null;
      const winControls = titleBar ? titleBar.querySelector('.window-controls-group') : null;
      return {
        hasModeCapsule: !!modeCapsule,
        hasTitleBar: !!titleBar,
        titleText: windowTitle ? windowTitle.textContent.trim() : null,
        hasWinControls: !!winControls,
      };
    })()
  `)
  console.log('Title Bar Status:', titleBarCheck)
  if (titleBarCheck.hasModeCapsule) {
    throw new Error('Title Bar still contains mode toggle capsule!')
  }
  if (!titleBarCheck.hasTitleBar || !titleBarCheck.hasWinControls) {
    throw new Error('Title Bar or Window Controls missing!')
  }

  // 2. Verify Tab Bar Tools (Home and Local Terminal icons) & Native buttons hidden
  console.log('[Test] Verifying Tab Bar Tools and hidden native buttons...')
  const tabBarCheck = await client.eval(`
    (() => {
      const tools = document.querySelector('workbench-tab-bar-tools');
      const homeBtn = tools ? tools.querySelector('button[title*="主页"]') : null;
      const localBtn = tools ? tools.querySelector('button[title*="本地终端"]') : null;
      
      const tabBar = document.querySelector('.content.main > .tab-bar');
      const nativePlus = tabBar ? tabBar.querySelector('.btn-group:has(.fa-plus), .btn-group:has([data-icon="plus"])') : null;
      const nativeGear = tabBar ? tabBar.querySelector('.btn-group:has(.fa-gear), .btn-group:has([data-icon="gear"])') : null;
      
      const plusVisible = nativePlus ? (window.getComputedStyle(nativePlus).display !== 'none') : false;
      const gearVisible = nativeGear ? (window.getComputedStyle(nativeGear).display !== 'none') : false;

      return {
        hasTools: !!tools,
        hasHomeBtn: !!homeBtn,
        hasLocalBtn: !!localBtn,
        plusVisible,
        gearVisible,
      };
    })()
  `)
  console.log('Tab Bar Status:', tabBarCheck)
  if (!tabBarCheck.hasTools || !tabBarCheck.hasHomeBtn || !tabBarCheck.hasLocalBtn) {
    throw new Error('Tab Bar Tools missing Home or Local terminal button!')
  }
  if (tabBarCheck.plusVisible || tabBarCheck.gearVisible) {
    throw new Error('Native Tabby plus or gear button still visible in tab bar!')
  }

  // 3. Verify Home Screen (SSH Pilot style)
  console.log('[Test] Verifying SSH Pilot style Home screen...')
  const homeCheck = await client.eval(`
    (() => {
      const welcome = document.querySelector('workbench-welcome');
      const searchInput = welcome ? welcome.querySelector('.home-search-input') : null;
      const placeholder = searchInput ? searchInput.getAttribute('placeholder') : '';
      const recentSection = welcome ? welcome.querySelector('.home-recent-container') : null;
      const recentHeader = recentSection ? recentSection.querySelector('.recent-header-title') : null;
      const recentItems = welcome ? welcome.querySelectorAll('.recent-item-card') : [];

      return {
        welcomeVisible: !!welcome && window.getComputedStyle(welcome).display !== 'none',
        hasSearchInput: !!searchInput,
        placeholder,
        hasRecentSection: !!recentSection,
        recentHeaderText: recentHeader ? recentHeader.textContent.trim() : '',
        recentCount: recentItems.length,
      };
    })()
  `)
  console.log('Home Screen Status:', homeCheck)
  if (!homeCheck.welcomeVisible || !homeCheck.hasSearchInput) {
    throw new Error('Home Screen or search input not visible!')
  }
  if (!homeCheck.placeholder.includes('连按两次 Shift')) {
    throw new Error(`Placeholder does not match SSH Pilot style: ${homeCheck.placeholder}`)
  }

  // Capture Screenshot 1: Home Screen
  await client.captureScreenshot('evidence_85_home_screen_ssh_pilot_style.png')

  // 4. Test Predictive Direct Connect Dropdown
  console.log('[Test] Testing predictive direct connect dropdown (media_1789896515544)...')
  await client.eval(`
    (() => {
      const input = document.querySelector('.home-search-input');
      input.value = 'admin@192.168.22.128';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `)
  await sleep(400)

  const dropdownCheck = await client.eval(`
    (() => {
      const dropdown = document.querySelector('.predictive-dropdown');
      const options = dropdown ? dropdown.querySelectorAll('.dropdown-option-row') : [];
      const optionTexts = Array.from(options).map(o => o.textContent.trim());
      const enterBadge = dropdown ? dropdown.querySelector('.enter-badge') : null;

      return {
        hasDropdown: !!dropdown,
        optionCount: options.length,
        optionTexts,
        hasEnterBadge: !!enterBadge,
      };
    })()
  `)
  console.log('Dropdown Status:', dropdownCheck)
  if (!dropdownCheck.hasDropdown || dropdownCheck.optionCount < 2) {
    throw new Error('Predictive direct connect dropdown did not appear or missing options!')
  }

  // Capture Screenshot 2: Predictive Direct Connect Dropdown
  await client.captureScreenshot('evidence_86_direct_connect_predictive_dropdown.png')

  // Clear search input
  await client.eval(`
    (() => {
      const clearBtn = document.querySelector('.btn-clear-search');
      if (clearBtn) clearBtn.click();
    })()
  `)
  await sleep(200)

  // 5. Test Unified New Session Modal
  console.log('[Test] Testing unified new session modal (media_1789896213371 & media_1789896242625)...')
  await client.eval(`
    (() => {
      const newBtn = document.querySelector('workbench-drawer .session-mgr-toolbar button[title*="新建"]');
      if (newBtn) newBtn.click();
    })()
  `)
  await sleep(400)

  const newModalCheck = await client.eval(`
    (() => {
      const modal = document.querySelector('workbench-new-session-modal');
      const title = modal ? modal.querySelector('.modal-title') : null;
      const templates = modal ? modal.querySelectorAll('.template-item') : [];
      const templateNames = Array.from(templates).map(t => t.textContent.trim());
      const nameInput = modal ? modal.querySelector('input[placeholder*="生产服务器"]') : null;
      const sshHost = modal ? modal.querySelector('input[placeholder*="192.168.1.100"]') : null;

      return {
        isOpen: !!modal && modal.querySelector('.new-session-dialog') !== null,
        titleText: title ? title.textContent.trim() : '',
        templateNames,
        hasNameInput: !!nameInput,
        hasSshHost: !!sshHost,
      };
    })()
  `)
  console.log('New Session Modal Status:', newModalCheck)
  if (!newModalCheck.isOpen || newModalCheck.templateNames.length < 4) {
    throw new Error('Unified New Session Modal failed to open or templates missing!')
  }

  // Test dynamic template switching to Serial
  console.log('[Test] Switching template to 串口连接 (Serial)...')
  await client.eval(`
    (() => {
      const templates = document.querySelectorAll('workbench-new-session-modal .template-item');
      // Serial is 3rd item (index 2)
      if (templates[2]) templates[2].click();
    })()
  `)
  await sleep(300)

  const serialParamsCheck = await client.eval(`
    (() => {
      const modal = document.querySelector('workbench-new-session-modal');
      const deviceInput = modal ? modal.querySelector('input[placeholder*="ttyUSB0"]') : null;
      const baudSelect = modal ? modal.querySelector('select[class*="font-mono"]') : null;
      return {
        hasDeviceInput: !!deviceInput,
        hasBaudSelect: !!baudSelect,
      };
    })()
  `)
  console.log('Serial Dynamic Parameters Status:', serialParamsCheck)
  if (!serialParamsCheck.hasDeviceInput) {
    throw new Error('Dynamic parameters did not update for Serial template!')
  }

  // Switch back to SSH for screenshot
  await client.eval(`
    (() => {
      const templates = document.querySelectorAll('workbench-new-session-modal .template-item');
      if (templates[0]) templates[0].click();
    })()
  `)
  await sleep(200)

  // Capture Screenshot 3: New Session Modal
  await client.captureScreenshot('evidence_87_new_session_template_and_params_modal.png')

  // Close modal
  await client.eval(`
    (() => {
      const closeBtn = document.querySelector('workbench-new-session-modal .btn-close-modal');
      if (closeBtn) closeBtn.click();
    })()
  `)
  await sleep(300)

  // 6. Test Session Manager Drawer (Builtin/Recent hidden, Card styling, Context Menu)
  console.log('[Test] Verifying Session Manager Drawer and Right-Click Context Menu...')
  const drawerCheck = await client.eval(`
    (() => {
      const drawer = document.querySelector('workbench-drawer');
      const categoryHeaders = drawer ? Array.from(drawer.querySelectorAll('.tree-category-header')).map(h => h.textContent.trim()) : [];
      const hasBuiltin = categoryHeaders.some(h => h.includes('内置终端'));
      const hasRecent = categoryHeaders.some(h => h.includes('最近连接'));

      const cards = drawer ? drawer.querySelectorAll('.session-card') : [];
      let firstCardStyle = null;
      if (cards.length > 0) {
        const computed = window.getComputedStyle(cards[0]);
        firstCardStyle = {
          border: computed.border,
          borderRadius: computed.borderRadius,
          marginBottom: computed.marginBottom,
          backgroundColor: computed.backgroundColor,
        };
      }

      return {
        categoryHeaders,
        hasBuiltin,
        hasRecent,
        cardCount: cards.length,
        firstCardStyle,
      };
    })()
  `)
  console.log('Drawer Status:', drawerCheck)
  if (drawerCheck.hasBuiltin) {
    throw new Error('Built-in shells should be hidden by default in session manager!')
  }
  if (drawerCheck.hasRecent) {
    throw new Error('Recent connections should not be in the drawer tree (already on Home)!')
  }

  // Right-click on first session card
  console.log('[Test] Right clicking on session card...')
  await client.eval(`
    (() => {
      const firstCard = document.querySelector('workbench-drawer .session-card');
      if (firstCard) {
        const rect = firstCard.getBoundingClientRect();
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 50,
          clientY: rect.top + 15,
        });
        firstCard.dispatchEvent(event);
      }
    })()
  `)
  await sleep(300)

  const contextMenuCheck = await client.eval(`
    (() => {
      const menu = document.querySelector('.session-context-menu');
      const items = menu ? Array.from(menu.querySelectorAll('.menu-item')).map(i => i.textContent.trim()) : [];
      return {
        hasMenu: !!menu,
        menuItems: items,
      };
    })()
  `)
  console.log('Context Menu Status:', contextMenuCheck)
  if (!contextMenuCheck.hasMenu || contextMenuCheck.menuItems.length < 4) {
    throw new Error('Right click context menu failed to display!')
  }

  // Capture Screenshot 4: Drawer Cards & Context Menu
  await client.captureScreenshot('evidence_88_drawer_cards_and_context_menu.png')

  // Dismiss context menu
  await client.eval(`document.body.click()`)
  await sleep(200)

  console.log('[Test] All 6 verification checkpoints passed successfully!')
  client.close()
}

run().catch(err => {
  console.error('[Test Error]', err)
  process.exit(1)
})
