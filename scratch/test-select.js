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
    expression: `(async () => {
      const drawer = document.querySelector("workbench-drawer");
      const rows = Array.from(drawer.querySelectorAll(".tree-session-row"));
      const piRow = rows.find(r => r.textContent.includes("pi"));
      
      const beforeClass = piRow.className;
      
      // Dispatch real mousedown, mouseup, click
      piRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      piRow.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      piRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      
      await new Promise(r => setTimeout(r, 100));
      
      const afterClass = piRow.className;

      return {
        beforeClass,
        afterClass,
        isSelected: piRow.classList.contains('selected')
      };
    })()`,
    returnByValue: true,
    awaitPromise: true
  });

  console.log('Select test result:', JSON.stringify(evalResult.result.value, null, 2));
  process.exit(0);
})();
