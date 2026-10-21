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
        const el = document.querySelector("workbench-welcome");
        const ctx = el.__ngContext__;
        if (!ctx) return null;
        if (Array.isArray(ctx)) {
          return ctx.map(x => (x && typeof x === 'object') ? (x.constructor ? x.constructor.name : typeof x) : typeof x);
        }
        return typeof ctx;
      })()`,
      returnByValue: true
    }
  }));
  ws.onmessage = e => {
    console.log(e.data);
    process.exit(0);
  };
})();
