// jsdom has no layout or canvas. The dither-kit charts measure their box with ResizeObserver and paint to a
// canvas; in tests they only need to mount quietly.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
