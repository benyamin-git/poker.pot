import { Component, type ReactNode } from "react";
import { Button } from "./ui";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="screen">
          <div className="center">
            <h1 className="title-lg">Something went wrong</h1>
            <p className="muted">{this.state.error.message}</p>
            <Button variant="primary" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
