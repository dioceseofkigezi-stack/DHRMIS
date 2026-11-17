import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Avoid sending employee data or raw component errors to the browser console.
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="error-boundary" role="alert">
        <h1>{this.props.title ?? "This section could not be displayed"}</h1>
        <p className="muted">The page stopped unexpectedly. Reload it to try again.</p>
        <button className="button button-primary" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </main>
    );
  }
}
