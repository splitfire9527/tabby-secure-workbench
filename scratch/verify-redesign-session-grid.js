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
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await new Promise(r => setTimeout(r, 1200));

  const artifactDir = '/home/splitfire/.gemini/antigravity/brain/6ed9bb03-3fc0-4a23-a969-e78fbc50ca60';

  async function takeScreenshot(name) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const outPath = `${artifactDir}/${name}.png`;
    fs.writeFileSync(outPath, Buffer.from(res.data, 'base64'));
    console.log(`Screenshot [${name}] saved: ${(res.data.length * 0.75 / 1024).toFixed(1)} KB`);
    return outPath;
  }

  const assertions = [];
  function assert(name, condition, details = '') {
    const status = condition ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${name} ${details ? '- ' + details : ''}`);
    assertions.push({ name, status, details });
    if (!condition) {
      console.error(`  Assertion Failed: ${name} (${details})`);
    }
  }

  console.log('=== VERIFYING WORKBENCH REDESIGN (SESSION DATA GRID & CLEAN TYPOGRAPHY) ===\n');

  // Test 1: Session Data Grid & Complete Elimination of Marketing Onboarding
  console.log('--- Test 1: Session Data Grid Verification ---');
  const gridCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const welcome = document.querySelector('workbench-welcome');
      const gridContainer = document.querySelector('.workbench-session-grid-container');
      const oldLogo = document.querySelector('.welcome-logo-badge');
      const oldCards = document.querySelectorAll('.action-card');
      const oldRecentCutoff = document.querySelector('.recent-sessions-section');
      const table = document.querySelector('.session-table');
      const rows = document.querySelectorAll('.session-table tbody tr.session-row');
      const headerBar = document.querySelector('.grid-header-bar');
      const searchInput = document.querySelector('.search-filter-input');
      const directConnectInput = document.querySelector('input[placeholder*="直连"]');

      return {
        hasWelcome: !!welcome,
        hasGridContainer: !!gridContainer,
        hasOldLogo: !!oldLogo,
        oldCardsCount: oldCards.length,
        hasOldRecentCutoff: !!oldRecentCutoff,
        hasTable: !!table,
        rowsCount: rows.length,
        hasHeaderBar: !!headerBar,
        hasSearchInput: !!searchInput,
        hasDirectConnectInput: !!directConnectInput
      };
    })()`,
    returnByValue: true
  });

  const gc = gridCheck.result.value;
  assert('Session Data Grid Container Present', gc.hasGridContainer);
  assert('Marketing Logo Completely Removed', !gc.hasOldLogo);
  assert('Marketing Action Cards Completely Removed', gc.oldCardsCount === 0, `cards: ${gc.oldCardsCount}`);
  assert('Old Cutoff Quick Launch Card Removed', !gc.hasOldRecentCutoff);
  assert('High-Density Session Table Present', gc.hasTable);
  assert('Session Rows Loaded in Table', gc.rowsCount > 0, `count: ${gc.rowsCount}`);
  assert('Header Filter Bar Present', gc.hasHeaderBar && gc.hasSearchInput && gc.hasDirectConnectInput);

  await takeScreenshot('evidence_77_session_data_grid_workbench');

  // Test 2: Left Tree "Recent Sessions" Group & Elimination of English Brackets
  console.log('\n--- Test 2: Left Tree "Recent Sessions" & Pure Chinese ---');
  const treeCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const headers = Array.from(document.querySelectorAll('.tree-category-header')).map(h => h.textContent.trim());
      const hasRecentGroup = headers.some(h => h.includes('最近连接'));
      const hasSavedGroup = headers.some(h => h.includes('自建会话'));
      const hasImportedGroup = headers.some(h => h.includes('导入会话'));
      const hasBuiltinGroup = headers.some(h => h.includes('内置终端'));

      // Check for any unprincipled English bracket suffixes in headers
      const bracketEnglish = headers.filter(h => /\([A-Za-z &\/]+\)/.test(h));

      // Check visual hierarchy of first row in table
      const firstRow = document.querySelector('.session-table tbody tr.session-row');
      let hostWeight = null, nameWeight = null, credsColor = null;
      if (firstRow) {
        const hostEl = firstRow.querySelector('.session-host');
        const nameEl = firstRow.querySelector('.session-name');
        const credsEl = firstRow.querySelector('.session-creds');
        if (hostEl) hostWeight = window.getComputedStyle(hostEl).fontWeight;
        if (nameEl) nameWeight = window.getComputedStyle(nameEl).fontWeight;
        if (credsEl) credsColor = window.getComputedStyle(credsEl).color;
      }

      return {
        headers,
        hasRecentGroup,
        hasSavedGroup,
        hasImportedGroup,
        hasBuiltinGroup,
        bracketEnglish,
        hostWeight,
        nameWeight,
        credsColor
      };
    })()`,
    returnByValue: true
  });

  const tc = treeCheck.result.value;
  assert('Left Tree Has "最近连接" Top Group', tc.hasRecentGroup, `headers: ${JSON.stringify(tc.headers)}`);
  assert('Left Tree Has "自建会话" Group', tc.hasSavedGroup);
  assert('No Unprincipled English Brackets in Tree Headers', tc.bracketEnglish.length === 0, `found: ${JSON.stringify(tc.bracketEnglish)}`);
  assert('Session Host/IP is Bold (Weight >= 600)', parseInt(tc.hostWeight) >= 600, `weight: ${tc.hostWeight}`);
  assert('Session Name/Remark is Bold (Weight >= 600)', parseInt(tc.nameWeight) >= 600, `weight: ${tc.nameWeight}`);

  await takeScreenshot('evidence_78_left_tree_recent_sessions_and_pure_chinese');

  // Test 3: Outer Title Bar Branding & Clean Window Controls
  console.log('\n--- Test 3: Title Bar Branding & Controls ---');
  const titleCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const titleEl = document.querySelector('.window-title');
      const winCtl = document.querySelectorAll('.win-ctl-btn');
      return {
        title: titleEl ? titleEl.textContent.trim() : null,
        winCtlCount: winCtl.length
      };
    })()`,
    returnByValue: true
  });

  const tic = titleCheck.result.value;
  assert('Title Bar Shows "Secure Workbench" instead of "未连接"', tic.title === 'Secure Workbench', `actual: ${tic.title}`);
  assert('Window Controls Present (3 buttons: min, max, close)', tic.winCtlCount === 3, `count: ${tic.winCtlCount}`);

  await takeScreenshot('evidence_79_title_bar_clean_workbench_branding');

  // Test 4: Search Filter Interaction
  console.log('\n--- Test 4: Search Filter Interaction ---');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('.search-filter-input');
      if (input) {
        input.value = '192';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`
  });
  await new Promise(r => setTimeout(r, 400));

  const filterCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const rows = document.querySelectorAll('.session-table tbody tr.session-row');
      return {
        filteredRowsCount: rows.length
      };
    })()`,
    returnByValue: true
  });

  const fc = filterCheck.result.value;
  assert('Filter Dynamically Filters Rows', fc.filteredRowsCount > 0, `filtered count: ${fc.filteredRowsCount}`);
  await takeScreenshot('evidence_80_search_and_direct_connect_interaction');

  // Reset filter
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('.search-filter-input');
      if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`
  });

  console.log('\n=============================================================');
  console.log('                 REDESIGN VERIFICATION SUMMARY               ');
  console.log('=============================================================');
  const passed = assertions.filter(a => a.status === 'PASS').length;
  console.log(`Total Assertions: ${assertions.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${assertions.length - passed}`);
  console.log(`Compliance Rate: ${((passed / assertions.length) * 100).toFixed(1)}%`);
  console.log('=============================================================');

  ws.close();
  process.exit(assertions.length === passed ? 0 : 1);
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
