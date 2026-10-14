// Exported figures receive theme only; they do not receive sessions or call the API.
(() => {
  const main = document.querySelector('main');
  const embedded = parent !== window;
  if (embedded) document.body.dataset.embedded = 'true';
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
    requestAnimationFrame(() => {
      scheduled = false;
      const height = Math.ceil(main.getBoundingClientRect().height) + 2;
      if (height === lastHeight) return;
      lastHeight = height;
      if (embedded) parent.postMessage({ type: 'rcp-guide-size', height }, '*');
    });
  }
  new ResizeObserver(measure).observe(main);
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
