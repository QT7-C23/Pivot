import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  message: string | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { message: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: error instanceof Error ? error.message : 'Unknown renderer error' }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    console.error('Pivot renderer boundary caught an error', error, errorInfo.componentStack)
  }

  render(): ReactNode {
    if (this.state.message) {
      return (
        <main className="renderer-fallback">
          <div>
            <div className="eyebrow">Renderer error</div>
            <h1>Pivot could not render this view.</h1>
            <p>{this.state.message}</p>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
