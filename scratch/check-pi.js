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
      const cfg = window.require("tabby-core").ConfigService;
      // Let's get config or profiles from Angular or localStorage
      const cfgStr = localStorage.getItem('tabby-config');
      let parsed = null;
      try { parsed = window.require('js-yaml').load(cfgStr); } catch(e) {}
      if (!parsed) {
        try { parsed = JSON.parse(cfgStr); } catch(e) {}
      }
      const pi = parsed?.profiles?.find(p => p.name === 'pi' || (p.options && p.options.host === '192.168.22.12'));
      return {
        hasPi: !!pi,
        pi
      };
    })()`,
    returnByValue: true
  });

  console.log('Pi profile in config:', JSON.stringify(evalResult.result.value, null, 2));
  process.exit(0);
})();
