import { Component, type ReactNode } from "react";

/** A chart that fails to render hides itself instead of blanking the page around it. */
export class ChartBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
