// Exported figures receive theme only; they do not receive sessions or call the API.
// Dashboard look for embedded figures: tokens and control recipes copied from src/styles.css.
const EMBED_CSS = "/* Dashboard tokens, copied from src/styles.css (:root and :root[data-theme=\"light\"]). The machine switches to the light set with body.light. */\n:root{--d-bg:#0a0a0a;--d-surface:#111111;--d-surface-2:#171717;--d-hover:#1a1a1a;--d-border:#242424;--d-border-strong:#333333;--d-text:#ededed;--d-text-2:#a1a1a1;--d-text-3:#6b6b6b;--d-accent:#7c6cff;--d-accent-text:#b4abff;--d-accent-strong:#d4cfff;--d-accent-soft:color-mix(in srgb,#7c6cff 14%,transparent);--d-ring:rgba(255,255,255,.08);--d-ring-accent:color-mix(in srgb,#7c6cff 45%,transparent);--d-hi:inset 0 1px .4px rgba(255,255,255,.1);--d-hi-accent:inset 0 1px .4px rgba(255,255,255,.16);--d-lo:inset 0 -1px .4px rgba(0,0,0,.25);--d-outer:0 0 0 1px rgba(0,0,0,.6),0 1px 2px rgba(0,0,0,.45);--d-sheen:linear-gradient(180deg,rgba(255,255,255,.03),transparent);--d-pressed:inset 0 0 0 1px var(--d-ring),inset 0 1px 2px rgba(0,0,0,.35);--d-focus-ring:rgba(255,255,255,.06)}\n:root[data-theme=\"light\"],:root:has(body.light){--d-bg:#ededf0;--d-surface:#ffffff;--d-surface-2:#f7f7f9;--d-hover:#f1f1f4;--d-border:#dcdce1;--d-border-strong:#c6c6cd;--d-text:#09090b;--d-text-2:#3f3f46;--d-text-3:#6b6b74;--d-accent:#5b4be0;--d-accent-text:#4a3bc7;--d-accent-strong:#372ba3;--d-accent-soft:rgba(91,75,224,.08);--d-ring:rgba(10,10,11,.1);--d-ring-accent:color-mix(in srgb,#5b4be0 50%,transparent);--d-hi:inset 0 1px .4px #fff;--d-hi-accent:inset 0 1px .4px rgba(255,255,255,.55);--d-lo:inset 0 -1px .4px rgba(10,10,11,.04);--d-outer:0 1px 2px rgba(10,10,11,.06);--d-sheen:linear-gradient(180deg,#ffffff,#f7f7f9);--d-pressed:inset 0 0 0 1px var(--d-ring),inset 0 1px 2px rgba(10,10,11,.12);--d-focus-ring:rgba(10,10,11,.06)}\n/* The machine's own palette variables read the dashboard tokens. */\n@@[data-figure=\"machine\"]{--card:var(--d-surface);--border:var(--d-border);--muted:var(--d-text-3);--text:var(--d-text);--field:var(--d-surface-2);--purple:var(--d-accent-text);--control:var(--d-accent)}\n/* Flush in the panel: no figure background, outer padding, margins or borders. */\nhtml,@@{background:var(--d-surface)}\n@@ main{margin:0!important;padding:0!important;max-width:none}\n@@ main>header,@@ .eyebrow:first-child{display:none!important}\n@@ .map-card,@@ .machine-card,@@ .machine-sidebar,@@ .controls,@@ .toolbar{background:transparent;border-left:0;border-right:0}\n@@ .viewport{padding:0}\n/* Section bars: the .panel-header recipe (49px, 8px/16px padding, hairline below). */\n@@ .toolbar{justify-content:space-between}@@ .controls{justify-content:flex-start}@@ .toolbar,@@ .controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-height:49px;padding:8px 16px;border-top:0;border-bottom:1px solid var(--d-border)}\n@@ .tools,@@ .buttons,@@ .secondary-actions{display:flex;align-items:center;flex-wrap:nowrap;gap:8px}\n@@ .controls .playback{display:contents}@@ .controls .primary-actions{order:1}@@ .controls .secondary-actions{order:2;margin-left:auto}@@ #scenario{width:150px}@media(max-width:760px){@@ .controls .secondary-actions{margin-left:0;flex-wrap:wrap}}\n@@ .controls label{flex:0 1 auto;display:flex;align-items:center;gap:8px;width:auto}\n/* Mono 11px sentence-case labels. */\n@@ .micro,@@ .control-hint,@@ .preset-label,@@ .inputs label,@@ .stamp span,@@ #inspect-kicker,@@ #step-number,@@ .log-header,@@ #facts,@@ .eyebrow,@@ figcaption,@@ .pan-hint,@@ .sim-readout span,@@ .machine-bottom i,@@ #zoom-level{font:400 11px \"Geist Mono\",ui-monospace,monospace;letter-spacing:.04em;text-transform:none;color:var(--d-text-3)}\n@@ .micro{display:inline;margin:0;white-space:nowrap}\n@@ #facts b{color:var(--d-text);font-weight:400}\n@@ #zoom-level{min-width:40px;text-align:center}\n/* .button.secondary */\n@@ button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;min-height:0;padding:0 12px;border:1px solid transparent;border-radius:0;background-color:var(--d-surface);background-image:var(--d-sheen);color:var(--d-text);font:500 13.5px Geist,system-ui,sans-serif;letter-spacing:0;white-space:nowrap;cursor:pointer;box-shadow:inset 0 0 0 1px var(--d-ring),var(--d-hi),var(--d-lo),var(--d-outer);transition:background 120ms,color 120ms}\n@@ button:hover:not(:disabled){background-color:var(--d-hover);border-color:transparent;color:var(--d-text)}\n@@ button:active:not(:disabled){background-image:none;box-shadow:var(--d-pressed)}\n@@ button:disabled{background-image:none;box-shadow:inset 0 0 0 1px var(--d-ring);color:var(--d-text-3);opacity:1;cursor:default}\n@@ button:focus-visible{outline:2px solid var(--d-accent);outline-offset:2px}\n@@ #zoom-out,@@ #zoom-in{width:32px;padding:0}\n/* .button.primary */\n@@ #run{background-color:var(--d-accent-soft);color:var(--d-accent-text);box-shadow:inset 0 0 0 1px var(--d-ring-accent),var(--d-hi-accent),var(--d-lo),var(--d-outer)}\n@@ #run:hover:not(:disabled){background-color:color-mix(in srgb,var(--d-accent) 22%,transparent);color:var(--d-accent-strong)}\n@@ #run:active:not(:disabled){box-shadow:inset 0 0 0 1px var(--d-ring-accent),inset 0 1px 2px rgba(0,0,0,.35)}\n/* Quiet actions: .icon-button without the key. */\n@@ .secondary-actions button{background:none;box-shadow:none;color:var(--d-text-2);padding:0 8px}\n@@ .secondary-actions button:hover:not(:disabled){background:var(--d-hover);color:var(--d-text)}\n@@ .secondary-actions button[aria-pressed=\"true\"]{color:var(--d-accent-text)}\n@@ #theme{display:none}\n/* .segmented: flow chips and stage tabs. */\n@@ .lenses:has(button[data-filter]),@@ .stages{display:inline-flex;max-width:100%;overflow-x:auto;scrollbar-width:none;padding:0;gap:0;border:1px solid var(--d-border);background:var(--d-bg)}\n@@ .lenses:has(button[data-filter])::-webkit-scrollbar,@@ .stages::-webkit-scrollbar{display:none}\n@@ .lenses button[data-filter],@@ .stages button{height:26px;padding:0 10px;border:0;border-radius:0;background:none;box-shadow:none;color:var(--d-text-2);font:500 12.5px Geist,system-ui,sans-serif;text-align:center}\n@@ .lenses button[data-filter]+button,@@ .stages button+button{border-left:1px solid var(--d-border)}\n@@ .lenses button[data-filter]:hover:not(:disabled),@@ .stages button:hover:not(:disabled){background:none;color:var(--d-text)}\n@@ .lenses button[data-filter][aria-pressed=\"true\"],@@ .stages button.active{position:relative;background-color:var(--d-surface-2);background-image:var(--d-sheen);box-shadow:inset 0 0 0 1px var(--d-ring),var(--d-hi),var(--d-lo),var(--d-outer);color:var(--d-accent-text)}\n@@ .lenses button[data-filter][aria-pressed=\"true\"]:hover:not(:disabled),@@ .stages button.active:hover:not(:disabled){background-color:var(--d-hover);color:var(--d-accent-text)}\n@@ .machine-sidebar .stages{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));overflow:hidden;margin:16px 16px 0}\n@@ .machine-sidebar .stages button:nth-child(3n+1){border-left:0}\n@@ .machine-sidebar .stages button:nth-child(n+4){border-top:1px solid var(--d-border)}\n/* Inputs: .field input / select. */\n@@ select,@@ input{height:32px;padding:0 10px;border:1px solid var(--d-border-strong);border-radius:0;background-color:var(--d-bg);color:var(--d-text);font:13.5px Geist,system-ui,sans-serif;letter-spacing:0;outline:0;transition:border-color 120ms,box-shadow 120ms}\n@@ select{appearance:none;padding-right:32px;cursor:pointer;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238f8f8f' stroke-width='2.2' stroke-linecap='square'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 10px center}\n@@ select:focus,@@ input:focus{border-color:var(--d-text-3);box-shadow:0 0 0 3px var(--d-focus-ring)}\n@@ .inputs{gap:8px}@@ .inputs label{display:grid;gap:6px}\n/* Content sections: .panel-body padding with hairline separators. */\n@@ .inspector,@@ .simulator,@@ .machine-sidebar .story,@@ .machine-sidebar .evidence-log{margin:0;padding:16px;border:0;border-top:1px solid var(--d-border);background:transparent;min-height:0}\n@@ .machine-sidebar{border-left:1px solid var(--d-border)}\n@@ .machine-sidebar .story{display:block;border-top:0}\n@@ .inspector-head,@@ .sim-heading,@@ .log-header{display:flex;align-items:center;justify-content:space-between;gap:16px}\n@@ .log-header{margin-bottom:12px}\n@@ .inspector h2,@@ .simulator h2,@@ .story h2{margin:8px 0 4px;font:500 13px Geist,system-ui,sans-serif;letter-spacing:-.01em;color:var(--d-text)}\n@@ .inspector p,@@ .simulator p,@@ .story p{margin:0;max-width:none;font:400 13px/1.5 Geist,system-ui,sans-serif;letter-spacing:0;color:var(--d-text-2)}\n@@ .sim-heading .eyebrow{display:block}\n@@ .sim-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}\n@@ #history .entry{border:1px solid var(--d-border);padding:8px 10px;font:400 11px \"Geist Mono\",ui-monospace,monospace;letter-spacing:0}\n@@ #history .empty{font:400 13px/1.5 Geist,system-ui,sans-serif;color:var(--d-text-2)}\n@@ figcaption,@@ .pan-hint{padding:10px 16px}\n/* Readouts: the .metric tile (hairline cells, mono label, Doto value). */\n@@ .machine-bottom,@@ .sim-readout{display:grid;gap:1px;margin:0;border:0;border-top:1px solid var(--d-border);background:var(--d-border)}\n@@ .machine-bottom{grid-template-columns:repeat(4,minmax(0,1fr))}\n@@ .sim-readout{grid-template-columns:repeat(3,minmax(0,1fr));margin:12px 0;border:1px solid var(--d-border)}\n@@ .machine-bottom>div,@@ .sim-readout>div{display:flex;flex-direction:column;gap:6px;min-width:0;padding:14px 16px;border:0;background:var(--d-surface)}\n@@ .machine-bottom strong,@@ .sim-readout strong{margin:0;font:800 30px/1 Doto,\"Geist Mono\",monospace;letter-spacing:0;font-variant-numeric:tabular-nums;color:var(--d-text)}\n@@ .machine-bottom i{margin-left:6px;font:400 13px Geist,system-ui,sans-serif;letter-spacing:0;font-style:normal}\n@@ #live-verdict[data-long=\"true\"]{font-size:16px}\n@media(max-width:760px){@@ .machine-bottom{grid-template-columns:repeat(2,minmax(0,1fr))}@@ .sim-readout{grid-template-columns:minmax(0,1fr)}@@ .machine-bottom strong,@@ .sim-readout strong{font-size:22px}@@ .machine-sidebar{border-left:0;border-top:1px solid var(--d-border)}}";
(() => {
  const main = document.querySelector('main');
  const embedded = parent !== window;
  if (embedded) {
    document.body.dataset.embedded = 'true';
    const style = document.createElement('style');
    style.textContent = EMBED_CSS.replaceAll('@@', 'body[data-embedded][data-figure]');
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
  }

  let scheduled = false;
  let lastHeight = 0;
  let posted = false;
  let candidate = 0;
  let candidateAt = 0;
  function measure() {
    if (scheduled) return;
    scheduled = true;
    // requestAnimationFrame is paused in hidden or background frames; the timer guarantees a report.
    let ran = false;
    const run = () => {
      if (ran) return;
      ran = true;
      scheduled = false;
      // Hold the first report until the inspector has been sized for its longest text.
      if (embedded && !reserved) return;
      const height = Math.ceil((main || document.body).getBoundingClientRect().height) + 2;
      // The first report must be the settled one: the diagram fits itself as fonts and the frame width arrive, so
      // wait until two measurements 100ms apart agree before telling the dashboard how tall to make the frame.
      if (embedded && !posted) {
        const now = performance.now();
        if (height !== candidate) {
          candidate = height;
          candidateAt = now;
          setTimeout(measure, 110);
          return;
        }
        if (now - candidateAt < 100) {
          setTimeout(measure, 110 - (now - candidateAt));
          return;
        }
        posted = true;
      }
      if (height === lastHeight) return;
      lastHeight = height;
      if (embedded) parent.postMessage({ type: 'rcp-guide-size', height }, '*');
    };
    requestAnimationFrame(run);
    setTimeout(run, 100);
  }
  // The inspector's text changes with every selection. Reserve room for the longest one up front, so choosing a chip,
  // node or stage never changes the frame height (and with it the page layout below the figure).
  let reserved = !embedded;
  let reservedWidth = 0;
  function reserveInspector() {
    const box = document.querySelector('.inspector, .story');
    const previousStage = document.querySelector('.stages button.active');
    const targets = [...document.querySelectorAll('[data-filter],[data-node],[data-rule],[data-example],[data-step]')];
    if (box && targets.length) {
      box.style.minHeight = '0px';
      let tallest = box.getBoundingClientRect().height;
      for (const target of targets) {
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        tallest = Math.max(tallest, box.getBoundingClientRect().height);
      }
      const clear = previousStage || document.querySelector('#clear-selection:not([hidden]), #clear') || document.querySelector('[data-filter="all"]');
      clear?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      box.style.minHeight = `${Math.ceil(tallest)}px`;
    }
    reservedWidth = document.documentElement.clientWidth;
    reserved = true;
    measure();
  }
  const atRest = () => !document.querySelector('[data-node][aria-pressed="true"],[data-rule][aria-pressed="true"],[data-example][aria-pressed="true"]')
    && (!document.querySelector('[data-filter]') || document.querySelector('[data-filter="all"][aria-pressed="true"]'));
  if (embedded) {
    document.fonts.ready.then(() => setTimeout(reserveInspector, 0));
    setTimeout(() => { if (!reserved) reserveInspector(); }, 1500);
    // Text wraps differently at a new width; measure again, but never in the middle of someone's selection.
    window.addEventListener('resize', () => {
      if (reserved && Math.abs(document.documentElement.clientWidth - reservedWidth) > 4 && atRest()) reserveInspector();
    });
  }
  if (main) new ResizeObserver(measure).observe(main);
  document.fonts.ready.then(measure);
  window.addEventListener('load', measure);
  window.addEventListener('resize', measure);
  // Theme: the dashboard sends it (and pre-sets data-theme on <html>); standalone figures follow the system setting.
  function applyTheme(theme) {
    const light = theme === 'light';
    document.documentElement.dataset.theme = theme;
    document.body.classList.toggle('light', light);
    document.body.classList.toggle('dark', !light);
    document.querySelectorAll('.iso').forEach((node) => { node.dataset.theme = theme; });
    if (name === 'machine') {
      const button = document.querySelector('#theme');
      if (button) button.textContent = light ? 'Dark' : 'Light';
    }
  }
  const scheme = matchMedia('(prefers-color-scheme: light)');
  const systemTheme = () => (scheme.matches ? 'light' : 'dark');
  applyTheme(document.documentElement.dataset.theme || systemTheme());
  if (!embedded) scheme.addEventListener?.('change', () => applyTheme(systemTheme()));
  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.type !== 'rcp-guide-theme') return;
    if (!['dark', 'light'].includes(event.data.theme)) return;
    applyTheme(event.data.theme);
    measure();
  });
  measure();
})();
