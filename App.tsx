import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './pages/Layout';
import { Dashboard } from './pages/Dashboard';
import { Crawler } from './pages/Crawler';
import { GSC } from './pages/GSC';
import { SEOptimer } from './pages/SEOptimer';
import { Sitebulb } from './pages/Sitebulb';

const App: React.FC = () => {
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
