import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '2rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid #ef4444',
                    borderRadius: '0.75rem',
                    color: '#ef4444',
                    margin: '1rem'
                }}>
                    <h3>Something went wrong in this section.</h3>
                    <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>{this.state.error?.toString()}</p>
                    <button
                        onClick={() => this.setState({ hasError: false })}
                        style={{ marginTop: '1rem', background: '#ef4444', color: '#fff', padding: '0.5rem 1rem', borderRadius: '0.5rem' }}
                    >
                        Try again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
