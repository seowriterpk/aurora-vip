import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './pages/Layout';
import { Dashboard } from './pages/Dashboard';
import { Crawler } from './pages/Crawler';
import { GSC } from './pages/GSC';
import { SEOptimer } from './pages/SEOptimer';
import { Sitebulb } from './pages/Sitebulb';
import { Login } from './pages/Login';

const App: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [checkingSession, setCheckingSession] = useState<boolean>(true);

    // On app load, ping backend to check if session cookie is still valid
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

    // Show nothing while checking session (prevents flash of login screen)
    if (checkingSession) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="text-slate-500 text-sm font-mono">Verifying session...</div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Login onLogin={() => setIsAuthenticated(true)} />;
    }

    return (
        <Routes>
            <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="crawler" element={<Crawler />} />
                <Route path="gsc" element={<GSC />} />
                <Route path="seoptimer" element={<SEOptimer />} />
                <Route path="sitebulb" element={<Sitebulb />} />
            </Route>
        </Routes>
    );
};

export default App;
