(async () => {
  const fetch = globalThis.fetch;
  const res = await fetch('http://localhost:9222/json');
  const targets = await res.json();
  const page = targets.find(t => t.type === 'page');
  const ws = new (globalThis.WebSocket)(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const send = (method, params) => new Promise(resolve => {
    const curId = id++;
    const handler = e => {
      const data = JSON.parse(e.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  const evalResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const drawer = document.querySelector("workbench-drawer");
      // Find all profiles
      const profs = drawer ? Array.from(drawer.querySelectorAll(".tree-session-row")).map(r => r.textContent.trim().replace(/\\s+/g, ' ')) : [];
      return profs;
    })()`,
    returnByValue: true
  });

  console.log('Profiles in drawer:', evalResult.result.value);
  process.exit(0);
})();
