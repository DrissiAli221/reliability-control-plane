// Exported figures receive theme only; they do not receive sessions or call the API.
(() => {
  const main = document.querySelector('main');
  const embedded = parent !== window;
  if (embedded) {
    document.body.dataset.embedded = 'true';
    const style = document.createElement('style');
    style.textContent = [
      // Sit flush in the dashboard panel: no figure background, outer padding, margins or borders.
      'html:not(:has(body.light)),body[data-embedded]:not(.light){background:#111111}',
      'body[data-embedded] main{margin:0!important;padding:0!important;max-width:none}',
      'body[data-embedded] main>header,body[data-embedded] .eyebrow:first-child{display:none!important}',
      'body[data-embedded] .map-card,body[data-embedded] .machine-card,body[data-embedded] .machine-sidebar,body[data-embedded] .controls,body[data-embedded] .toolbar{background:transparent;border-left:0;border-right:0}',
      // Dashboard density: 8px rows, 26px controls, 11px captions, 16px content padding.
      'body[data-embedded] .toolbar,body[data-embedded] .controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:8px 16px;border-top:0;border-bottom:1px solid var(--border,#242424)}',
      'body[data-embedded] .lenses,body[data-embedded] .tools,body[data-embedded] .playback,body[data-embedded] .buttons,body[data-embedded] .secondary-actions{gap:8px}',
      'body[data-embedded] .controls label{flex:0 1 auto;display:flex;align-items:center;gap:8px;width:auto}',
      'body[data-embedded] .controls .micro,body[data-embedded] .control-hint,body[data-embedded] .preset-label{margin:0;font:400 11px "Geist Mono",ui-monospace,monospace;letter-spacing:0;color:#6b6b6b}',
      'body[data-embedded] button,body[data-embedded] .figure-open{min-height:0;height:26px;padding:0 10px;display:inline-flex;align-items:center;justify-content:center;border-radius:0;font:500 12.5px Geist,system-ui,sans-serif;letter-spacing:0}',
      'body[data-embedded] select{height:26px;padding:0 8px;border-radius:0;font:500 12.5px Geist,system-ui,sans-serif}',
      'body[data-embedded] .secondary-actions button{padding:0 10px}',
      'body[data-embedded] #zoom-level{min-width:40px;text-align:center;font:400 11px "Geist Mono",ui-monospace,monospace}',
      'body[data-embedded] .inspector,body[data-embedded] .simulator{margin:0;padding:16px;border:0;border-top:1px solid var(--border,#242424);min-height:0}',
      'body[data-embedded] .inspector h2,body[data-embedded] .simulator h2{margin:8px 0 4px;font-size:13px;font-weight:500;letter-spacing:0}',
      'body[data-embedded] .inspector p,body[data-embedded] .simulator p{font-size:12.5px;line-height:1.5;margin:0}',
      'body[data-embedded] .sim-heading{gap:16px}body[data-embedded] .sim-actions{margin:12px 0;gap:8px}body[data-embedded] .sim-readout>div{padding:12px}body[data-embedded] .inputs{gap:8px}',
      'body[data-embedded] figcaption,body[data-embedded] .pan-hint{padding:8px 16px;font:400 11px "Geist Mono",ui-monospace,monospace;letter-spacing:0}',
      'body[data-embedded] .viewport{padding:0}',
      'body[data-embedded] .machine-sidebar .story{padding:16px}body[data-embedded] .machine-sidebar .evidence-log{padding:16px}body[data-embedded] .machine-bottom>div{padding:12px 16px}',
      'body[data-embedded] .stages button{height:32px;padding:0 4px}'
    ].join('');
    document.head.append(style);
  }
  const name = document.body.dataset.figure;
  const controls = document.querySelector('.toolbar .tools, .controls .secondary-actions');
  if (controls && ['deployment', 'lifecycle', 'verdicts', 'availability', 'machine'].includes(name)) {
    if (name === 'machine') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Export SVG';
      button.addEventListener('click', () => {
        const svg = document.querySelector('.iso-svg').cloneNode(true);
        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = [...document.querySelectorAll('style')].map((node) => node.textContent).join('\n');
        svg.prepend(style);
        const variables = getComputedStyle(document.body);
        for (const key of variables) if (key.startsWith('--')) svg.style.setProperty(key, variables.getPropertyValue(key));
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'rcp-monitoring-machine.svg';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      controls.append(button);
    }
    const link = document.createElement('a');
    link.href = `./${name}.html`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'figure-open';
    link.textContent = 'Open figure ↗';
    controls.append(link);
  }

  let scheduled = false;
  let lastHeight = 0;
  function measure() {
    if (scheduled) return;
    scheduled = true;
    // requestAnimationFrame is paused in hidden or background frames; the timer guarantees a report.
    let ran = false;
    const run = () => {
      if (ran) return;
      ran = true;
      scheduled = false;
      const height = Math.ceil((main || document.body).getBoundingClientRect().height) + 2;
      if (height === lastHeight) return;
      lastHeight = height;
      if (embedded) parent.postMessage({ type: 'rcp-guide-size', height }, '*');
    };
    requestAnimationFrame(run);
    setTimeout(run, 100);
  }
  if (main) new ResizeObserver(measure).observe(main);
  document.fonts.ready.then(measure);
  window.addEventListener('load', measure);
  window.addEventListener('resize', measure);
  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.type !== 'rcp-guide-theme') return;
    if (!['dark', 'light'].includes(event.data.theme)) return;
    if (name === 'machine') {
      const light = event.data.theme === 'light';
      document.body.classList.toggle('light', light);
      document.body.classList.toggle('dark', !light);
      document.querySelector('.iso-svg').dataset.theme = event.data.theme;
      const button = document.querySelector('#theme');
      if (button) button.textContent = light ? 'Dark' : 'Light';
    }
    measure();
  });
  measure();
})();
