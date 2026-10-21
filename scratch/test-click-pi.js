const fs = require('fs');

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

  // Check clicking and dblclicking pi session
  const evalResult = await send('Runtime.evaluate', {
    expression: `(async () => {
      const drawer = document.querySelector("workbench-drawer");
      const rows = Array.from(drawer.querySelectorAll(".tree-session-row"));
      const piRow = rows.find(r => r.textContent.includes("pi"));
      if (!piRow) return { error: "pi row not found" };

      const rect = piRow.getBoundingClientRect();
      const parentRect = piRow.parentElement.getBoundingClientRect();
      
      // Let's test what elements are at point (rect.x + 20, rect.y + 10)
      const elementAtPoint = document.elementFromPoint(rect.x + 20, rect.y + 10);
      
      // Check if clicking works or if something intercepts it
      let clicked = false;
      piRow.addEventListener('click', () => { clicked = true; });
      piRow.click();

      return {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        parentRect: { x: parentRect.x, y: parentRect.y, width: parentRect.width, height: parentRect.height },
        elementAtPointTag: elementAtPoint ? elementAtPoint.tagName + '.' + elementAtPoint.className : null,
        isElementInsidePiRow: piRow.contains(elementAtPoint),
        clicked
      };
    })()`,
    returnByValue: true,
    awaitPromise: true
  });

  console.log('Click test result:', JSON.stringify(evalResult.result.value, null, 2));
  process.exit(0);
})();
