import React from 'react';

// Utility to get helpful browser info for bug reports
function getBrowserInfo() {
  try {
    return `${navigator.userAgent} (Platform: ${navigator.platform})`;
  } catch {
    return 'Unknown browser';
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      copied: false,
    };
    this.errorId = Math.random().toString(36).slice(2, 10);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    // Optionally log to an external service here
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary] Error:', error, errorInfo);
    }
    // Optionally: send to Sentry or similar
    if (window && window.fxSyncErrorLogger) {
      window.fxSyncErrorLogger(error, errorInfo, this.errorId);
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      copied: false,
    });
    if (typeof this.props.onRetry === 'function') {
      this.props.onRetry();
    }
  };

  handleToggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  handleCopyDetails = () => {
    const { error, errorInfo } = this.state;
    const details = [
      `Error ID: ${this.errorId}`,
      `Time: ${new Date().toISOString()}`,
      `Browser: ${getBrowserInfo()}`,
      `Error: ${error && error.stack ? error.stack : String(error)}`,
      errorInfo && errorInfo.componentStack ? `Component Stack:\n${errorInfo.componentStack}` : '',
    ].join('\n\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(details).then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 1800);
      });
    }
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, showDetails, copied } = this.state;
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-0 animate-fade-in">
          <div className="relative bg-neutral-900/95 border border-neutral-800 rounded-2xl shadow-xl px-8 py-10 max-w-md w-full text-center flex flex-col items-center gap-7">
            {/* Minimalist error icon */}
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-neutral-950 border border-neutral-800 mb-2 shadow-md">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" stroke="white" strokeOpacity="0.10" fill="none"/>
                <path d="M12 8v4" stroke="white" />
                <circle cx="12" cy="16" r="1" fill="white" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white tracking-tight mb-1">Something went wrong</h2>
            <p className="text-neutral-400 text-sm mb-2 font-mono break-words">
              {error?.message || 'An unexpected error occurred.'}
            </p>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={this.handleRetry}
                className="px-5 py-2 bg-white text-black font-medium rounded-full shadow-sm hover:bg-neutral-200 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-white/30"
                autoFocus
              >
                Retry
              </button>
              <div className="flex flex-row gap-2 justify-center">
                {errorInfo && (
                  <button
                    onClick={this.handleToggleDetails}
                    className="px-4 py-1.5 text-xs bg-neutral-900 text-neutral-200 rounded-full hover:bg-neutral-800 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-white/20"
                    aria-expanded={showDetails}
                    aria-controls="error-details"
                  >
                    {showDetails ? 'Hide details' : 'Show details'}
                  </button>
                )}
                {errorInfo && (
                  <button
                    onClick={this.handleCopyDetails}
                    className="px-4 py-1.5 text-xs bg-neutral-900 text-white rounded-full hover:bg-neutral-700 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-white/20"
                    title="Copy error details for support"
                  >
                    {copied ? 'Copied!' : 'Copy details'}
                  </button>
                )}
              </div>
            </div>
            {showDetails && errorInfo && (
              <pre
                id="error-details"
                className="text-left text-xs bg-black/90 text-white rounded-lg p-3 mt-2 max-h-60 overflow-auto w-full border border-neutral-800"
                style={{ fontFamily: 'Menlo, monospace', wordBreak: 'break-all' }}
              >
                {`Error ID: ${this.errorId}\nTime: ${new Date().toLocaleString()}\nBrowser: ${getBrowserInfo()}\n`}
                {error && error.stack ? error.stack : String(error)}
                {'\n'}
                {errorInfo && errorInfo.componentStack}
              </pre>
            )}
            <div className="text-xs text-neutral-500 mt-2 w-full">
              <div className="flex flex-col items-center gap-1">
                <span>
                  If this keeps happening,{' '}
                  <a
                    href="mailto:support@fxsync.app?subject=FxSync%20Error%20Report&body=Please%20paste%20the%20error%20details%20here."
                    className="underline hover:text-white"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    contact support
                  </a>
                  {' '}or refresh the page.
                </span>
                <div className="mt-1 text-neutral-700 text-[11px]">
                  Error ID: <span className="font-mono">{this.errorId}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;