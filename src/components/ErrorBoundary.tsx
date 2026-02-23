import { Component, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  sectionTitle?: string;
  selectedTicker?: string | null;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  stack: string | null;
  resetKey: number;
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    stack: null,
    resetKey: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    this.setState({ error, stack: info.componentStack });
  }

  private handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      stack: null,
      resetKey: prev.resetKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      const inDev = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
      return (
        <div className="breadcontainersinglecolumn" style={{ border: "1px solid rgba(125,0,0,0.25)", borderRadius: "8px", padding: "12px", background: "rgba(255,255,255,0.4)" }}>
          <h3 className="subrub small" style={{ marginTop: 0 }}>{this.props.sectionTitle ?? "Single Stock Dashboard"}</h3>
          <p className="status error" style={{ marginBottom: "6px" }}>Något gick fel när bolaget laddades.</p>
          {this.props.selectedTicker ? <p className="status">Vald ticker: <strong>{this.props.selectedTicker}</strong></p> : null}
          <p className="status error" style={{ whiteSpace: "pre-wrap" }}>{this.state.error?.message ?? "Okänt fel."}</p>
          {inDev && this.state.stack ? <pre className="status" style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>{this.state.stack}</pre> : null}
          <button type="button" onClick={this.handleRetry}>Försök igen</button>
        </div>
      );
    }

    return <div key={this.state.resetKey}>{this.props.children}</div>;
  }
}
