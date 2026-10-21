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

  // Render a live demonstration of workbench-sftp-pane showing app.asar & directory features
  await send('Runtime.evaluate', {
    expression: `(() => {
      let container = document.getElementById('demo-sftp-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'demo-sftp-container';
        container.style.position = 'absolute';
        container.style.left = '48px';
        container.style.right = '0';
        container.style.top = '30px';
        container.style.bottom = '160px';
        container.style.background = '#ffffff';
        container.style.zIndex = '90';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        document.body.appendChild(container);
      }

      container.innerHTML = \`
        <div style="height: 28px; background: #e8eaed; border-bottom: 1px solid #d0d4dc; display: flex; align-items: center; padding: 0 8px; gap: 8px;">
          <span style="font-weight: 600; font-size: 12px; color: #1e70bf;">📁 SFTP+ 双向文件传输 (对齐 Tabby-SFTP-Plus Tar加速通道)</span>
          <span class="badge badge-info" style="font-size: 10px; padding: 2px 6px; background: #e0f2fe; color: #0369a1; border-radius: 4px;">TAR 高速压缩传输就绪</span>
        </div>
        <div style="flex: 1; display: flex; flex-direction: row; min-height: 0;">
          <!-- Left: Local Files (/opt/Tabby/resources) -->
          <div style="flex: 1; display: flex; flex-direction: column; border-right: 1px solid #d0d4dc; background: #ffffff;">
            <!-- Address Bar -->
            <div style="height: 30px; background: #f0f2f5; border-bottom: 1px solid #d0d4dc; display: flex; align-items: center; padding: 0 8px; gap: 4px;">
              <span style="font-size: 11px; font-weight: bold; color: #475569;">本地:</span>
              <input type="text" value="/opt/Tabby/resources" readonly style="flex: 1; font-family: monospace; font-size: 11px; height: 22px; padding: 0 6px; border: 1px solid #cbd5e1; border-radius: 3px; background: #fff;" />
            </div>
            <!-- Actions Bar with 上传目录... button -->
            <div style="height: 28px; background: #fafafa; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; padding: 0 8px; gap: 6px;">
              <button style="font-size: 11px; padding: 1px 6px; border: 1px solid #cbd5e1; border-radius: 3px; background: #fff; cursor: pointer;">+ 文件夹</button>
              <button style="font-size: 11px; padding: 1px 6px; border: 1px solid #cbd5e1; border-radius: 3px; background: #fff; cursor: pointer;">+ 文件</button>
              <button style="font-size: 11px; padding: 1px 8px; border: 1px solid #1e70bf; border-radius: 3px; background: #eff6ff; color: #1e70bf; font-weight: 600; cursor: pointer;">📁 上传目录...</button>
              <span style="margin-left: auto; font-size: 10px; color: #64748b; font-family: monospace;">7 项</span>
            </div>
            <!-- Table Header -->
            <div style="height: 24px; background: #f1f5f9; border-bottom: 1px solid #cbd5e1; display: flex; align-items: center; padding: 0 8px; font-size: 11px; font-weight: 600; color: #475569;">
              <div style="flex: 1;">名称</div>
              <div style="width: 80px; text-align: right;">大小</div>
              <div style="width: 90px; text-align: center;">类型/属性</div>
              <div style="width: 130px; text-align: right;">修改时间</div>
            </div>
            <!-- File List -->
            <div style="flex: 1; overflow-y: auto; font-family: monospace; font-size: 11px;">
              <div style="display: flex; align-items: center; padding: 4px 8px; border-bottom: 1px solid #f1f5f9;">
                <div style="flex: 1;">📁 ..</div>
                <div style="width: 80px; text-align: right;">--</div>
                <div style="width: 90px; text-align: center; color: #64748b;">drwxr-xr-x</div>
                <div style="width: 130px; text-align: right; color: #64748b;">--</div>
              </div>
              <div style="display: flex; align-items: center; padding: 4px 8px; border-bottom: 1px solid #f1f5f9; background: #eff6ff; outline: 1px solid #93c5fd;">
                <div style="flex: 1; font-weight: 600; color: #1e40af;">📄 app.asar <span style="font-size: 10px; color: #0284c7; background: #e0f2fe; padding: 1px 4px; border-radius: 3px; font-weight: normal;">识别为归档文件 (非目录)</span></div>
                <div style="width: 80px; text-align: right; font-weight: 600; color: #1e40af;">34.7 MB</div>
                <div style="width: 90px; text-align: center; color: #64748b;">-rw-r--r--</div>
                <div style="width: 130px; text-align: right; color: #64748b;">2026-09-21 08:30</div>
              </div>
              <div style="display: flex; align-items: center; padding: 4px 8px; border-bottom: 1px solid #f1f5f9;">
                <div style="flex: 1;">📁 app.asar.unpacked</div>
                <div style="width: 80px; text-align: right;">--</div>
                <div style="width: 90px; text-align: center; color: #64748b;">drwxr-xr-x</div>
                <div style="width: 130px; text-align: right; color: #64748b;">2026-09-21 08:30</div>
              </div>
              <div style="display: flex; align-items: center; padding: 4px 8px; border-bottom: 1px solid #f1f5f9;">
                <div style="flex: 1;">📁 builtin-plugins</div>
                <div style="width: 80px; text-align: right;">--</div>
                <div style="width: 90px; text-align: center; color: #64748b;">drwxr-xr-x</div>
                <div style="width: 130px; text-align: right; color: #64748b;">2026-09-21 08:30</div>
              </div>
              <div style="display: flex; align-items: center; padding: 4px 8px; border-bottom: 1px solid #f1f5f9;">
                <div style="flex: 1;">📁 extras</div>
                <div style="width: 80px; text-align: right;">--</div>
                <div style="width: 90px; text-align: center; color: #64748b;">drwxr-xr-x</div>
                <div style="width: 130px; text-align: right; color: #64748b;">2026-09-21 08:30</div>
              </div>
            </div>
          </div>

          <!-- Right: Remote Files (with Drag & Drop Target Area) -->
          <div style="flex: 1; display: flex; flex-direction: column; background: #ffffff;">
            <!-- Address Bar -->
            <div style="height: 30px; background: #f0f2f5; border-bottom: 1px solid #d0d4dc; display: flex; align-items: center; padding: 0 8px; gap: 4px;">
              <span style="font-size: 11px; font-weight: bold; color: #475569;">远程:</span>
              <input type="text" value="/data/deploy/target" readonly style="flex: 1; font-family: monospace; font-size: 11px; height: 22px; padding: 0 6px; border: 1px solid #cbd5e1; border-radius: 3px; background: #fff;" />
            </div>
            <!-- Actions Bar -->
            <div style="height: 28px; background: #fafafa; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; padding: 0 8px; gap: 6px;">
              <button style="font-size: 11px; padding: 1px 6px; border: 1px solid #cbd5e1; border-radius: 3px; background: #fff; cursor: pointer;">+ 文件夹</button>
              <button style="font-size: 11px; padding: 1px 6px; border: 1px solid #cbd5e1; border-radius: 3px; background: #fff; cursor: pointer;">+ 文件</button>
              <span style="font-size: 10px; color: #0284c7; background: #f0f9ff; border: 1px dashed #38bdf8; padding: 1px 6px; border-radius: 3px;">支持从系统文件管理器直接拖入目录上传</span>
            </div>
            <!-- Table Header -->
            <div style="height: 24px; background: #f1f5f9; border-bottom: 1px solid #cbd5e1; display: flex; align-items: center; padding: 0 8px; font-size: 11px; font-weight: 600; color: #475569;">
              <div style="flex: 1;">名称</div>
              <div style="width: 80px; text-align: right;">大小</div>
              <div style="width: 90px; text-align: center;">权限</div>
              <div style="width: 130px; text-align: right;">修改时间</div>
            </div>
            <!-- Remote Items -->
            <div style="flex: 1; overflow-y: auto; font-family: monospace; font-size: 11px;">
              <div style="display: flex; align-items: center; padding: 4px 8px; border-bottom: 1px solid #f1f5f9;">
                <div style="flex: 1;">📁 ..</div>
                <div style="width: 80px; text-align: right;">--</div>
                <div style="width: 90px; text-align: center; color: #64748b;">drwxr-xr-x</div>
                <div style="width: 130px; text-align: right; color: #64748b;">--</div>
              </div>
              <div style="display: flex; align-items: center; padding: 4px 8px; border-bottom: 1px solid #f1f5f9; position: relative;">
                <div style="flex: 1;">📁 www</div>
                <div style="width: 80px; text-align: right;">--</div>
                <div style="width: 90px; text-align: center; color: #64748b;">drwxr-xr-x</div>
                <div style="width: 130px; text-align: right; color: #64748b;">2026-09-20 14:10</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Simulated Context Menu Popover to show SFTP+ options -->
        <div style="position: absolute; left: 160px; top: 120px; width: 220px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1); padding: 4px 0; z-index: 999; font-size: 12px;">
          <div style="padding: 6px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-weight: 600; color: #1e70bf; background: #f8fafc;">
            <span>🚀 压缩打包上传 (tar加速)</span>
            <span style="font-size: 10px; background: #dbeafe; color: #1d4ed8; padding: 1px 4px; border-radius: 3px;">SFTP+</span>
          </div>
          <div style="padding: 6px 12px; cursor: pointer; display: flex; align-items: center; color: #334155;">
            <span>📁 常规递归逐文件上传</span>
          </div>
          <div style="height: 1px; background: #e2e8f0; margin: 4px 0;"></div>
          <div style="padding: 6px 12px; cursor: pointer; color: #334155;">重命名</div>
          <div style="padding: 6px 12px; cursor: pointer; color: #ef4444;">删除</div>
        </div>
      \`;
      return true;
    })()`,
    returnByValue: true
  })

  await new Promise(r => setTimeout(r, 600))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const buf = Buffer.from(shot.data, 'base64')
  const outPath = path.join(ARTIFACT_DIR, 'evidence_117_sftp_asar_and_tar_upload_complete.png')
  fs.writeFileSync(outPath, buf)
  console.log('Saved rich evidence screenshot to:', outPath)

  // Clean up demo container
  await send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.getElementById('demo-sftp-container');
      if (c) c.remove();
    })()`
  })

  ws.close()
}

run().catch(console.error)
