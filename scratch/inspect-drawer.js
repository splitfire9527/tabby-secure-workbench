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

  const res1 = await send('Runtime.evaluate', {
    expression: `(() => {
      const drawer = document.querySelector("workbench-drawer");
      if (!drawer) return { error: "no drawer" };
      const rows = Array.from(drawer.querySelectorAll(".tree-session-row")).map(r => ({
        text: r.textContent.trim().replace(/\\s+/g, " "),
        classes: r.className,
        parentClass: r.parentElement ? r.parentElement.className : '',
        box: r.getBoundingClientRect()
      }));
      const folders = Array.from(drawer.querySelectorAll(".tree-folder")).map(f => ({
        text: f.textContent.trim().replace(/\\s+/g, " "),
        box: f.getBoundingClientRect()
      }));
      return { rows, folders };
    })()`,
    returnByValue: true
  });
  console.log(JSON.stringify(res1.result.value, null, 2));
  process.exit(0);
})();
