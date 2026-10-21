(async () => {
  const fetch = globalThis.fetch;
  const res = await fetch('http://localhost:9222/json');
  const targets = await res.json();
  const page = targets.find(t => t.type === 'page');
  const ws = new (globalThis.WebSocket)(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const fs = window.require("fs");
        let originalFs = null;
        try { originalFs = window.require("original-fs"); } catch(e) {}
        const asarPath = "/opt/Tabby/resources/app.asar";
        const nodeStat = fs.statSync(asarPath);
        const origStat = originalFs ? originalFs.statSync(asarPath) : null;
        return {
          nodeIsDirectory: nodeStat.isDirectory(),
          nodeSize: nodeStat.size,
          hasOriginalFs: !!originalFs,
          origIsDirectory: origStat ? origStat.isDirectory() : null,
          origSize: origStat ? origStat.size : null
        };
      })()`,
      returnByValue: true
    }
  }));
  ws.onmessage = e => {
    console.log(JSON.parse(e.data).result.result.value);
    process.exit(0);
  };
})();
