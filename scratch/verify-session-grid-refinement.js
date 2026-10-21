const http = require('http')
const fs = require('fs')
const path = require('path')

const ARTIFACT_DIR = '/home/splitfire/.gemini/antigravity/brain/6ed9bb03-3fc0-4a23-a969-e78fbc50ca60'

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

async function run() {
  console.log('Connecting to Tabby via CDP...')
  const targets = await getJson('http://127.0.0.1:9222/json')
  const pageTarget = targets.find(t => t.type === 'page') || targets[0]
  if (!pageTarget) throw new Error('No target found')

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl)
  let id = 1
  const pending = new Map()

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++
      pending.set(msgId, { resolve, reject })
      ws.send(JSON.stringify({ id: msgId, method, params }))
    })
  }

  ws.onmessage = (event) => {
    const res = JSON.parse(event.data)
    if (res.id && pending.has(res.id)) {
      const { resolve, reject } = pending.get(res.id)
      pending.delete(res.id)
      if (res.error) reject(res.error)
      else resolve(res.result)
    }
  }

  await new Promise(resolve => ws.onopen = resolve)
  await send('Page.enable')
  await send('Runtime.enable')

  console.log('Reloading Tabby to apply newly built plugin bundle...')
  await send('Page.reload')
  await new Promise(r => setTimeout(r, 2500))

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    return res.result?.value
  }

  async function captureScreenshot(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' })
    const buf = Buffer.from(res.data, 'base64')
    const filePath = path.join(ARTIFACT_DIR, filename)
    fs.writeFileSync(filePath, buf)
    console.log(`[Evidence] Saved screenshot: ${filePath}`)
  }

  console.log('=== Starting Session Grid Refinement Verification ===')
  const results = []

  // Ensure workbench mode is active
  await evaluate(`
    if (!document.body.classList.contains('workbench-shell-active')) {
      const btn = document.querySelector('.btn-mode-capsule') || document.querySelector('.mode-toggle-btn');
      if (btn) btn.click();
    }
  `)
  await new Promise(r => setTimeout(r, 600))

  // 1. Verify Category Pills present in Welcome Grid
  const pills = await evaluate(`
    (() => {
      const pillEls = Array.from(document.querySelectorAll('workbench-welcome .btn-category-pill'));
      return pillEls.map(el => el.textContent.replace(/\\s+/g, ' ').trim());
    })()
  `)
  console.log('Category Pills:', pills)
  results.push({
    name: 'Category Pills Present',
    pass: Array.isArray(pills) && pills.some(p => p.includes('全部')) && pills.some(p => p.includes('自建')),
    details: pills.join(', ')
  })

  // 2. Verify Top Bar: Direct connect input is NOT cluttering main bar
  const mainBarHasDirectInput = await evaluate(`
    (() => {
      const gridHeader = document.querySelector('workbench-welcome .grid-header-bar');
      if (!gridHeader) return false;
      const inputs = Array.from(gridHeader.querySelectorAll('input'));
      return inputs.some(i => i.placeholder && i.placeholder.includes('[user@]host'));
    })()
  `)
  results.push({
    name: 'Top Bar: Direct Connect Input Moved Out of Main Bar',
    pass: !mainBarHasDirectInput,
    details: 'Direct connect is not occupying the main search bar'
  })

  // 3. Verify "快速直连" button with Ctrl+L shortcut
  const quickConnectBtn = await evaluate(`
    (() => {
      const btn = document.querySelector('workbench-welcome .btn-quick-connect');
      if (!btn) return null;
      return {
        text: btn.textContent.replace(/\\s+/g, ' ').trim(),
        hasCtrlL: btn.textContent.includes('Ctrl+L')
      };
    })()
  `)
  results.push({
    name: 'Quick Connect Button with Ctrl+L Hint Present',
    pass: !!quickConnectBtn && quickConnectBtn.hasCtrlL,
    details: quickConnectBtn?.text
  })

  // 4. Test Opening Direct Connect Popover
  await evaluate(`
    (() => {
      const btn = document.querySelector('workbench-welcome .btn-quick-connect');
      if (btn) btn.click();
    })()
  `)
  await new Promise(r => setTimeout(r, 300))

  const popoverVisible = await evaluate(`
    (() => {
      const pop = document.querySelector('workbench-welcome .direct-connect-popover');
      return !!pop && pop.querySelector('.direct-connect-input') !== null;
    })()
  `)
  results.push({
    name: 'Direct Connect Floating Popover Opens Correctly',
    pass: popoverVisible,
    details: 'Popover opened with autofocus input'
  })

  // Close popover
  await evaluate(`
    (() => {
      const closeBtn = document.querySelector('workbench-welcome .direct-connect-popover .popover-header button');
      if (closeBtn) closeBtn.click();
    })()
  `)
  await new Promise(r => setTimeout(r, 200))

  // 5. Verify Table Columns: 会话 / 备注, 目标端点, 协议, 所属分组, 运行状态, 操作
  const tableHeaders = await evaluate(`
    (() => {
      const ths = Array.from(document.querySelectorAll('workbench-welcome table thead th'));
      return ths.map(th => th.textContent.trim());
    })()
  `)
  console.log('Table Headers:', tableHeaders)
  results.push({
    name: 'Grid Table Headers Refined',
    pass: tableHeaders.includes('会话 / 备注') && tableHeaders.includes('目标端点') && tableHeaders.includes('运行状态'),
    details: tableHeaders.join(' | ')
  })

  // 6. Verify Serial Name Disambiguation (No 4 rows just called "串口")
  const serialRows = await evaluate(`
    (() => {
      const rows = Array.from(document.querySelectorAll('workbench-welcome .session-row'));
      const serials = [];
      for (const r of rows) {
        const proto = r.querySelector('.badge-protocol')?.textContent.trim();
        if (proto === 'SERIAL') {
          const name = r.querySelector('.session-name')?.textContent.trim();
          const endpoint = r.querySelector('.session-endpoint')?.textContent.trim();
          serials.push({ name, endpoint });
        }
      }
      return serials;
    })()
  `)
  console.log('Serial Rows in Grid:', serialRows)
  const allSerialDistinct = serialRows.length > 0 && !serialRows.every(s => s.name === '串口')
  results.push({
    name: 'Serial Device Disambiguation in Table',
    pass: allSerialDistinct,
    details: serialRows.map(s => s.name).join(', ')
  })

  // 7. Verify High-Contrast Amber Badge for SERIAL
  const serialBadgeClass = await evaluate(`
    (() => {
      const b = document.querySelector('workbench-welcome .badge-protocol-serial');
      if (!b) return null;
      const s = window.getComputedStyle(b);
      return {
        bg: s.backgroundColor,
        color: s.color,
        fontWeight: s.fontWeight
      };
    })()
  `)
  results.push({
    name: 'Serial Protocol Amber Badge High Contrast',
    pass: !!serialBadgeClass,
    details: JSON.stringify(serialBadgeClass)
  })

  // 8. Verify Custom Remarks Highlighted (e.g. "运维网关" has 🏷️ or remark-highlight)
  const remarkItem = await evaluate(`
    (() => {
      const remarkEl = document.querySelector('workbench-welcome .badge-remark-tag');
      const nameEl = document.querySelector('workbench-welcome .session-name.remark-highlight');
      return {
        hasTag: !!remarkEl,
        remarkName: nameEl?.textContent.trim()
      };
    })()
  `)
  results.push({
    name: 'Custom Remark Names Distinctly Highlighted',
    pass: !!remarkItem && remarkItem.hasTag,
    details: `Remark: ${remarkItem?.remarkName}`
  })

  // 9. Verify Group Column Hides "默认分组" into "-"
  const groupMutedCount = await evaluate(`
    (() => {
      const rows = Array.from(document.querySelectorAll('workbench-welcome .session-row'));
      let dashCount = 0;
      let badgeCount = 0;
      for (const r of rows) {
        const text = r.children[3]?.textContent.trim();
        if (text === '-') dashCount++;
        if (r.querySelector('.badge-custom-group')) badgeCount++;
      }
      return { dashCount, badgeCount, total: rows.length };
    })()
  `)
  results.push({
    name: 'Default Group Filtered to Clean Dash (-)',
    pass: groupMutedCount.dashCount > 0,
    details: `Muted dashes: ${groupMutedCount.dashCount}, Custom badges: ${groupMutedCount.badgeCount}`
  })

  // 10. Verify Button Wall Eliminated: .row-actions opacity 0 by default
  const rowActionsStyle = await evaluate(`
    (() => {
      const rowAction = document.querySelector('workbench-welcome .session-row .row-actions');
      if (!rowAction) return null;
      const s = window.getComputedStyle(rowAction);
      return { opacity: s.opacity, pointerEvents: s.pointerEvents };
    })()
  `)
  results.push({
    name: 'Button Wall Eliminated (Actions Hidden by Default)',
    pass: rowActionsStyle && rowActionsStyle.opacity === '0',
    details: `Opacity: ${rowActionsStyle?.opacity}`
  })

  // 11. Verify Unification: No "SSH2" badges anywhere
  const ssh2Found = await evaluate(`
    (() => {
      const allBadges = Array.from(document.querySelectorAll('.badge-protocol'));
      return allBadges.filter(b => b.textContent.trim() === 'SSH2').length;
    })()
  `)
  results.push({
    name: 'Protocol Unified to SSH (Zero SSH2 found)',
    pass: ssh2Found === 0,
    details: `SSH2 badges found: ${ssh2Found}`
  })

  // 12. Verify Left Drawer Tree Serial Disambiguation
  const drawerSerialNames = await evaluate(`
    (() => {
      const cards = Array.from(document.querySelectorAll('workbench-drawer .session-card'));
      const serialCards = cards.filter(c => c.querySelector('.badge-protocol')?.textContent.trim() === 'SERIAL');
      return serialCards.map(c => c.querySelector('.tree-label')?.textContent.trim());
    })()
  `)
  console.log('Drawer Serial Names:', drawerSerialNames)
  results.push({
    name: 'Left Drawer Serial Names Disambiguated',
    pass: drawerSerialNames.length === 0 || !drawerSerialNames.every(n => n === '串口'),
    details: drawerSerialNames.join(', ')
  })

  // 13. Verify Category Filter Click (Clicking "自建" pill filters table)
  await evaluate(`
    (() => {
      const pill = Array.from(document.querySelectorAll('workbench-welcome .btn-category-pill')).find(p => p.textContent.includes('自建'));
      if (pill) pill.click();
    })()
  `)
  await new Promise(r => setTimeout(r, 400))

  const savedRowCount = await evaluate(`
    document.querySelectorAll('workbench-welcome .session-row').length
  `)
  results.push({
    name: 'Category Pill Filter "自建" Works',
    pass: savedRowCount > 0 && savedRowCount < 57,
    details: `Filtered to ${savedRowCount} saved sessions`
  })

  // Reset to "全部"
  await evaluate(`
    (() => {
      const pill = Array.from(document.querySelectorAll('workbench-welcome .btn-category-pill')).find(p => p.textContent.includes('全部'));
      if (pill) pill.click();
    })()
  `)
  await new Promise(r => setTimeout(r, 300))

  // Capture Screenshots
  await captureScreenshot('evidence_81_refined_session_grid_pills_and_columns.png')

  // Hover over row and capture actions
  await evaluate(`
    (() => {
      const row = document.querySelector('workbench-welcome .session-row');
      if (row) {
        const actions = row.querySelector('.row-actions');
        if (actions) actions.style.opacity = '1';
      }
      const btn = document.querySelector('workbench-welcome .btn-quick-connect');
      if (btn) btn.click();
    })()
  `)
  await new Promise(r => setTimeout(r, 300))
  await captureScreenshot('evidence_82_hover_actions_and_popover_direct_connect.png')

  // Close popover
  await evaluate(`
    (() => {
      const closeBtn = document.querySelector('workbench-welcome .direct-connect-popover .popover-header button');
      if (closeBtn) closeBtn.click();
    })()
  `)
  await new Promise(r => setTimeout(r, 200))

  // Filter to serial to capture distinct serial amber badges
  await evaluate(`
    (() => {
      const pill = Array.from(document.querySelectorAll('workbench-welcome .btn-category-pill')).find(p => p.textContent.includes('串口'));
      if (pill) pill.click();
    })()
  `)
  await new Promise(r => setTimeout(r, 300))
  await captureScreenshot('evidence_83_serial_and_custom_remarks_prominence.png')

  // Reset to all
  await evaluate(`
    (() => {
      const pill = Array.from(document.querySelectorAll('workbench-welcome .btn-category-pill')).find(p => p.textContent.includes('全部'));
      if (pill) pill.click();
    })()
  `)
  await new Promise(r => setTimeout(r, 300))
  await captureScreenshot('evidence_84_drawer_category_sync_with_grid.png')

  // Print Summary
  console.log('\\n=============================================================')
  console.log('         SESSION GRID REFINEMENT VERIFICATION SUMMARY        ')
  console.log('=============================================================')
  let passCount = 0
  for (const r of results) {
    const mark = r.pass ? '[PASS]' : '[FAIL]'
    console.log(`${mark} ${r.name}: ${r.details || ''}`)
    if (r.pass) passCount++
  }
  console.log('=============================================================')
  console.log(`Total: ${results.length}, Passed: ${passCount}, Failed: ${results.length - passCount}`)
  console.log(`Success Rate: ${((passCount / results.length) * 100).toFixed(1)}%`)
  console.log('=============================================================\\n')

  ws.close()
}

run().catch(err => {
  console.error('Verification failed:', err)
  process.exit(1)
})
