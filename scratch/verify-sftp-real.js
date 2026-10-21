const fs = require('fs')
const path = require('path')

const ARTIFACT_DIR = '/home/splitfire/.gemini/antigravity/brain/6ed9bb03-3fc0-4a23-a969-e78fbc50ca60'

async function run() {
  const fetch = globalThis.fetch
  const res = await fetch('http://localhost:9222/json')
  const targets = await res.json()
  const page = targets.find(t => t.type === 'page')
  const ws = new (globalThis.WebSocket)(page.webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)

  let id = 1
  const send = (method, params) => new Promise((resolve) => {
    const curId = id++
    const handler = (e) => {
      const data = JSON.parse(e.data)
      if (data.id === curId) {
        ws.removeEventListener('message', handler)
        resolve(data.result)
      }
    }
    ws.addEventListener('message', handler)
    ws.send(JSON.stringify({ id: curId, method, params }))
  })

  // 1. Evaluate loadLocalFiles logic inside Tabby renderer
  const sftpLocalTest = await send('Runtime.evaluate', {
    expression: `(() => {
      const fs = window.require("fs");
      let originalFs = null;
      try { originalFs = window.require("original-fs"); } catch(e) {}
      const dir = "/opt/Tabby/resources";
      const names = fs.readdirSync(dir);
      const items = [];
      for (const n of names) {
        const full = dir + "/" + n;
        const isAsar = n.toLowerCase().endsWith('.asar');
        let st = null;
        if (isAsar && originalFs) {
          try { st = originalFs.statSync(full); } catch(e) {}
        }
        if (!st) {
          st = fs.statSync(full);
        }
        const isDir = isAsar ? false : st.isDirectory();
        const fileSize = isDir ? 0 : st.size;
        items.push({
          name: n,
          isDirectory: isDir,
          size: fileSize,
          icon: isDir ? '📁' : '📄',
          sizeDisplay: isDir ? '--' : (fileSize / (1024 * 1024)).toFixed(1) + ' MB'
        });
      }
      return items;
    })()`,
    returnByValue: true
  })

  console.log('Items in /opt/Tabby/resources:', JSON.stringify(sftpLocalTest.result.value, null, 2))

  // 2. Probing tar capability on local system
  const tarCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const { spawnSync } = window.require("child_process");
      const r = spawnSync("tar", ["--version"]);
      return {
        tarExitCode: r.status,
        tarOutput: (r.stdout || '').toString().slice(0, 100)
      };
    })()`,
    returnByValue: true
  })
  console.log('Tar check on host:', JSON.stringify(tarCheck.result.value, null, 2))

  // 3. Capture screenshot of the window showing Cursor-style border & shadow
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const buf = Buffer.from(shot.data, 'base64')
  const outPath = path.join(ARTIFACT_DIR, 'evidence_116_cursor_window_and_sftp_asar_verified.png')
  fs.writeFileSync(outPath, buf)
  console.log('Captured evidence to:', outPath)

  ws.close()
}

run().catch(console.error)
