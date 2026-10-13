// Only report content size; figures never receive session data or make API calls.
(() => {
  const main = document.querySelector('main');
  let scheduled = false;
  function measure() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      parent.postMessage({ type: 'rcp-guide-size', height: Math.ceil(main.getBoundingClientRect().bottom + 8) }, '*');
    });
  }
  new ResizeObserver(measure).observe(main);
  document.fonts.ready.then(measure);
  window.addEventListener('resize', measure);
  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.type !== 'rcp-guide-theme') return;
    if (!['dark', 'light'].includes(event.data.theme)) return;
    // The machine ships both material palettes; service maps retain their approved dark finish.
    if (!document.querySelector('.machine-card')) return;
    const light = event.data.theme === 'light';
    document.body.classList.toggle('light', light);
    document.body.classList.toggle('dark', !light);
    document.querySelector('.iso-svg').dataset.theme = event.data.theme;
    const button = document.querySelector('#theme');
    if (button) button.textContent = light ? 'Dark' : 'Light';
  });
  measure();
})();
