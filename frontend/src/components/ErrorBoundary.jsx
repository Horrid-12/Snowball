import React from 'react';
import { getApiErrorMessage } from '../utils/api.js';

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
        const errorMsg = error?.message || error?.toString?.() || '';
        const isChunkError = /Failed to fetch dynamically imported module|Importing a module script failed/i.test(errorMsg);
        if (isChunkError) {
            const hasReloaded = sessionStorage.getItem('chunk_error_reload');
            if (!hasReloaded) {
                sessionStorage.setItem('chunk_error_reload', 'true');
                window.location.reload();
            }
        }
    }

    render() {
        if (this.state.hasError) {
            const errorMsg = this.state.error?.message || this.state.error?.toString?.() || '';
            const isChunkError = /Failed to fetch dynamically imported module|Importing a module script failed/i.test(errorMsg);

            return (
                <div style={{
                    padding: '2rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid #ef4444',
                    borderRadius: '0.75rem',
                    color: '#ef4444',
                    margin: '1rem'
                }}>
                    <h3>{isChunkError ? 'New update available' : 'Something went wrong in this section.'}</h3>
                    <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        {isChunkError
                            ? 'A new version of the app was deployed. Please reload to load the latest components.'
                            : getApiErrorMessage(this.state.error, errorMsg || 'Unexpected error')}
                    </p>
                    <button
                        onClick={() => {
                            if (isChunkError) {
                                window.location.reload();
                            } else {
                                this.setState({ hasError: false, error: null });
                            }
                        }}
                        style={{ marginTop: '1rem', background: '#ef4444', color: '#fff', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', border: 'none', fontWeight: 600 }}
                    >
                        {isChunkError ? 'Reload App' : 'Try again'}
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
