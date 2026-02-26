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
    // Basic local state for login (session is verified backend)
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

    // In a real app we'd ping the backend to verify session cookie on load, 
    // but for this internal tool, just showing the lock screen until they hit Auth is sufficient 
    // since the API endpoints will throw 401s if the session is invalid anyway.

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
