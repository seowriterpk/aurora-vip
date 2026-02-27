import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './pages/Layout';
import { Dashboard } from './pages/Dashboard';
import { Crawler } from './pages/Crawler';
import { GSC } from './pages/GSC';
import { SEOptimer } from './pages/SEOptimer';
import { Sitebulb } from './pages/Sitebulb';
import { AuraAudit } from './pages/AuraAudit';
import { Login } from './pages/Login';

// ============================================================
// GLOBAL TOAST NOTIFICATION SYSTEM
// ============================================================
type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

export const ToastContext = createContext<ToastContextType>({ showToast: () => { } });
export const useToast = () => useContext(ToastContext);

const ToastContainer: React.FC<{ toasts: Toast[]; onDismiss: (id: number) => void }> = ({ toasts, onDismiss }) => {
    if (toasts.length === 0) return null;

    const colors: Record<ToastType, string> = {
        success: 'bg-green-500/15 border-green-500/30 text-green-400',
        error: 'bg-red-500/15 border-red-500/30 text-red-400',
        info: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400',
        warning: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
    };

    const icons: Record<ToastType, string> = {
        success: '✓',
        error: '✕',
        info: 'ℹ',
        warning: '⚠',
    };

    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm shadow-2xl text-sm font-medium animate-slide-in ${colors[toast.type]}`}
                    onClick={() => onDismiss(toast.id)}
                    style={{ cursor: 'pointer' }}
                >
                    <span className="text-lg leading-none mt-0.5">{icons[toast.type]}</span>
                    <span className="flex-1">{toast.message}</span>
                </div>
            ))}
        </div>
    );
};

// ============================================================
// ERROR BOUNDARY — Catches any React crash and shows a recovery UI
// ============================================================
class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; errorMsg: string }
> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, errorMsg: '' };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, errorMsg: error.message };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
                    <div className="max-w-md text-center bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-xl">
                        <div className="text-4xl mb-4">⚠️</div>
                        <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
                        <p className="text-slate-400 text-sm mb-2">{this.state.errorMsg}</p>
                        <p className="text-slate-500 text-xs mb-6">This is a display error only. Your crawl data is safe in the database.</p>
                        <button
                            onClick={() => {
                                this.setState({ hasError: false, errorMsg: '' });
                                window.location.href = '/';
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

// ============================================================
// MAIN APP
// ============================================================
const App: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [checkingSession, setCheckingSession] = useState<boolean>(true);
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toastIdRef = useRef(0);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = ++toastIdRef.current;
        setToasts(prev => [...prev.slice(-4), { id, message, type }]); // Max 5 toasts visible
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000); // Auto-dismiss after 4s
    }, []);

    const dismissToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // On app load, check if session cookie is still valid
    useEffect(() => {
        fetch('/api/sync_status.php', { credentials: 'include' })
            .then(res => {
                if (res.ok) {
                    setIsAuthenticated(true);
                }
            })
            .catch(() => { })
            .finally(() => setCheckingSession(false));
    }, []);

    // Show skeleton loader while checking session
    if (checkingSession) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                    <div className="text-slate-500 text-sm font-mono">Verifying session...</div>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <ToastContext.Provider value={{ showToast }}>
                <Login onLogin={() => {
                    setIsAuthenticated(true);
                    showToast('Authentication successful. Welcome to AURORA.', 'success');
                }} />
                <ToastContainer toasts={toasts} onDismiss={dismissToast} />
            </ToastContext.Provider>
        );
    }

    return (
        <ErrorBoundary>
            <ToastContext.Provider value={{ showToast }}>
                <Routes>
                    <Route path="/" element={<Layout />}>
                        <Route index element={<Dashboard />} />
                        <Route path="crawler" element={<Crawler />} />
                        <Route path="gsc" element={<GSC />} />
                        <Route path="aura-audit" element={<AuraAudit />} />
                        <Route path="seoptimer" element={<SEOptimer />} />
                        <Route path="sitebulb" element={<Sitebulb />} />
                    </Route>
                </Routes>
                <ToastContainer toasts={toasts} onDismiss={dismissToast} />
            </ToastContext.Provider>
        </ErrorBoundary>
    );
};

export default App;
