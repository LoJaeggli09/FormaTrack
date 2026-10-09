import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Errore non gestito nel componente:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="error-screen">
        <div className="error-card">
          <div className="error-mark">!</div>
          <h2>Si è verificato un errore imprevisto</h2>
          <p>
            {this.props.message || 'Un componente dell\'applicazione ha smesso di funzionare correttamente.'}
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="error-detail">
              {this.state.error.toString()}
            </pre>
          )}
          <button className="btn-primary" onClick={this.handleReset}>
            {this.props.resetLabel || 'Riprova'}
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
