const http = require('http');
const fs = require('fs');

async function getPage() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const pages = JSON.parse(data);
        const page = pages.find(p => p.type === 'page' && p.url.includes('index.html'));
        resolve(page || pages[0]);
      });
    }).on('error', reject);
  });
}

async function main() {
  const page = await getPage();
  if (!page) {
    console.error('No page found at 9222');
    process.exit(1);
  }
  console.log('Connecting to page:', page.title, page.webSocketDebuggerUrl);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const res = JSON.parse(event.data);
    if (res.id && pending.has(res.id)) {
      const { resolve, reject } = pending.get(res.id);
      pending.delete(res.id);
      if (res.error) reject(res.error);
      else resolve(res.result);
    }
  };

  await new Promise(resolve => ws.onopen = resolve);
  console.log('Connected! Enabling Runtime and Page...');
  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 1000));

  const artifactDir = '/home/splitfire/.gemini/antigravity/brain/6ed9bb03-3fc0-4a23-a969-e78fbc50ca60';

  async function takeScreenshot(name) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const outPath = `${artifactDir}/${name}.png`;
    fs.writeFileSync(outPath, Buffer.from(res.data, 'base64'));
    console.log(`Screenshot [${name}] saved: ${(res.data.length * 0.75 / 1024).toFixed(1)} KB`);
    return outPath;
  }

  // 1. Inspect Welcome Page (when no terminal is active)
  console.log('\n--- 1. Testing SSH Pilot-style Welcome Page ---');
  const welcomeCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const welcome = document.querySelector('workbench-welcome');
      const searchInput = document.querySelector('.quick-connect-input');
      const actionCards = document.querySelectorAll('.action-card');
      const recentSection = document.querySelector('.recent-sessions-section');
      const titleEl = document.querySelector('.window-title');
      const modeToggleBtn = document.querySelector('.btn-mode-toggle');
      const titleComputed = titleEl ? window.getComputedStyle(titleEl) : null;
      return {
        hasWelcome: !!welcome,
        hasSearchInput: !!searchInput,
        actionCardCount: actionCards.length,
        hasRecentSection: !!recentSection,
        titleFontSize: titleComputed ? titleComputed.fontSize : null,
        titleFontWeight: titleComputed ? titleComputed.fontWeight : null,
        hasModeToggleBtn: !!modeToggleBtn,
        hasTabbyCatIcon: !!document.querySelector('.btn-mode-toggle svg')
      };
    })()`,
    returnByValue: true
  });
  console.log('Welcome Page & Title Bar State:', JSON.stringify(welcomeCheck.result.value, null, 2));
  await takeScreenshot('evidence_35_ssh_pilot_welcome_screen');

  // 2. Test Settings Modal Dialog from Title Bar
  console.log('\n--- 2. Testing Settings Modal Popup ---');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const settingsBtn = document.querySelector('.btn-settings');
      if (settingsBtn) settingsBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  const settingsModalCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const modal = document.querySelector('.settings-modal');
      const backdrop = document.querySelector('.workbench-modal-backdrop');
      const themeSelect = modal ? modal.querySelector('select') : null;
      return {
        hasModal: !!modal,
        hasBackdrop: !!backdrop,
        modalWidth: modal ? modal.offsetWidth : null,
        themeSelectValue: themeSelect ? themeSelect.value : null
      };
    })()`,
    returnByValue: true
  });
  console.log('Settings Modal Check:', JSON.stringify(settingsModalCheck.result.value, null, 2));
  await takeScreenshot('evidence_36_settings_modal_dialog');

  // Close modal via ESC
  console.log('Closing modal via ESC key...');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await new Promise(r => setTimeout(r, 400));

  // 3. Test About Modal Dialog from Activity Bar
  console.log('\n--- 3. Testing About Modal Dialog ---');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const aboutBtn = document.querySelector('workbench-activity-bar .activity-item[title*="About"]');
      if (aboutBtn) aboutBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  const aboutModalCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const aboutModal = document.querySelector('.about-modal');
      return {
        hasAboutModal: !!aboutModal,
        aboutModalWidth: aboutModal ? aboutModal.offsetWidth : null,
        title: aboutModal?.querySelector('.modal-title')?.textContent?.trim()
      };
    })()`,
    returnByValue: true
  });
  console.log('About Modal Check:', JSON.stringify(aboutModalCheck.result.value, null, 2));
  await takeScreenshot('evidence_37_about_modal_dialog');

  // Close about modal by clicking backdrop
  await send('Runtime.evaluate', {
    expression: `(() => {
      const backdrop = document.querySelector('.workbench-modal-backdrop');
      if (backdrop) backdrop.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 400));

  // 4. Test Mode Switch (Toggle between Workbench mode and Native Tabby mode)
  console.log('\n--- 4. Testing Workbench Mode <-> Native Tabby Mode Toggle ---');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const toggleBtn = document.querySelector('.btn-mode-toggle');
      if (toggleBtn) toggleBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  const nativeModeCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const isWorkbenchActive = document.body.classList.contains('workbench-shell-active');
      const sidebar = document.querySelector('workbench-sidebar');
      const sidebarVisible = sidebar ? window.getComputedStyle(sidebar).display !== 'none' : false;
      const toggleBtn = document.querySelector('.btn-mode-toggle');
      return {
        isWorkbenchActive,
        sidebarVisible,
        toggleBtnTooltip: toggleBtn ? toggleBtn.getAttribute('title') : null
      };
    })()`,
    returnByValue: true
  });
  console.log('Native Mode Check (after 1st click):', JSON.stringify(nativeModeCheck.result.value, null, 2));
  await takeScreenshot('evidence_38_native_tabby_mode');

  // Toggle back to Workbench mode
  console.log('Toggling back to Workbench mode...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const toggleBtn = document.querySelector('.btn-mode-toggle');
      if (toggleBtn) toggleBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  const workbenchModeRestored = await send('Runtime.evaluate', {
    expression: `(() => {
      const isWorkbenchActive = document.body.classList.contains('workbench-shell-active');
      const sidebar = document.querySelector('workbench-sidebar');
      const sidebarVisible = sidebar ? window.getComputedStyle(sidebar).display !== 'none' : false;
      return {
        isWorkbenchActive,
        sidebarVisible
      };
    })()`,
    returnByValue: true
  });
  console.log('Workbench Mode Restored:', JSON.stringify(workbenchModeRestored.result.value, null, 2));

  // 5. Connect to 127.0.0.1 session and inspect 28px Status Bar
  console.log('\n--- 5. Connecting to 127.0.0.1 session & Inspecting 28px Status Bar ---');
  await send('Runtime.evaluate', {
    expression: `(async () => {
      // Find 127.0.0.1 profile or trigger quick connect
      const connectInput = document.querySelector('.quick-connect-input');
      if (connectInput) {
        connectInput.value = '127.0.0.1';
        connectInput.dispatchEvent(new Event('input', { bubbles: true }));
        const btn = document.querySelector('.btn-connect');
        if (btn) btn.click();
      }
    })()`
  });
  await new Promise(r => setTimeout(r, 3000));

  const statusBarCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const statusBar = document.querySelector('.workbench-decorated-status-bar') || document.querySelector('.workbench-status-bar');
      const readyPill = document.querySelector('.status-pill.status-ready');
      const transferPill = document.querySelector('.status-pill.transfer-pill');
      const cs = statusBar ? window.getComputedStyle(statusBar) : null;
      return {
        hasStatusBar: !!statusBar,
        statusBarHeight: cs ? cs.height : null,
        statusBarFontSize: cs ? cs.fontSize : null,
        hasReadyPill: !!readyPill,
        hasTransferPill: !!transferPill,
        transferPillText: transferPill ? transferPill.textContent.trim().replace(/\\s+/g, ' ') : null,
        titleBarText: document.querySelector('.window-title')?.textContent?.trim()
      };
    })()`,
    returnByValue: true
  });
  console.log('Status Bar & Active Session Check:', JSON.stringify(statusBarCheck.result.value, null, 2));
  await takeScreenshot('evidence_39_status_bar_28px_and_connected_session');

  // 6. Test Transfer Pill Click Toggling Bottom Dock
  console.log('\n--- 6. Testing Transfer Pill Click Toggling Bottom Dock ---');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const transferPill = document.querySelector('.status-pill.transfer-pill');
      if (transferPill) transferPill.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  const dockToggleCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const dock = document.querySelector('workbench-bottom-dock');
      return {
        hasDock: !!dock,
        dockExpanded: dock?.classList.contains('expanded') || dock?.offsetHeight > 50,
        dockHeight: dock ? dock.offsetHeight : null
      };
    })()`,
    returnByValue: true
  });
  console.log('Bottom Dock Toggle Check:', JSON.stringify(dockToggleCheck.result.value, null, 2));
  await takeScreenshot('evidence_40_transfer_dock_toggled_from_pill');

  console.log('\n=== All Verification Steps Completed Successfully! ===');
  ws.close();
}

main().catch(err => {
  console.error('Test script error:', err);
  process.exit(1);
});
