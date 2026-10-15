// jsdom ships no types and @types/jsdom is not a dependency; the figure tests use only this much of it.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>);
    window: Window & typeof globalThis;
  }
}
