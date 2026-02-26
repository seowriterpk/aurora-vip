import React from 'react';
import { Outlet, Link, useLocation, useSearchParams } from 'react-router-dom';
import { Layers, Activity, Search, LayoutDashboard, DatabaseZap, LogOut } from 'lucide-react';

export const Layout: React.FC = () => {
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const crawlId = searchParams.get('crawl_id');

    const links = [
        { path: '/', label: 'Projects Dashboard', icon: <DatabaseZap className="w-4 h-4" /> },
        { path: '/crawler', label: 'Technical Crawler', icon: <Search className="w-4 h-4" /> },
        { path: '/gsc', label: 'Search Console Insights', icon: <LayoutDashboard className="w-4 h-4" /> },
        { path: '/seoptimer', label: 'On-Page SEOptimer', icon: <Activity className="w-4 h-4" /> },
        { path: '/sitebulb', label: 'Sitebulb Insights', icon: <Layers className="w-4 h-4" /> },
    ];

    return (
        <div className="flex h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col flex-shrink-0 relative z-20">
                <div className="p-4 border-b border-slate-800 flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Layers className="text-white w-5 h-5" />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-white">AURORA<span className="text-indigo-500">-X</span></h1>
                </div>

                <nav className="flex-1 overflow-y-auto p-4 space-y-2">
                    <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider mb-2 px-3 pb-1">Auditing Suite</div>
                    {links.map(l => {
                        const targetPath = crawlId ? `${l.path}?crawl_id=${crawlId}` : l.path;
                        return (
                            <Link
                                key={l.path}
                                to={targetPath}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${location.pathname === l.path ? 'bg-indigo-600/10 text-indigo-400 font-medium' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
                            >
                                {l.icon}
                                {l.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <button
                        onClick={() => {
                            fetch('/api/logout.php').finally(() => {
                                window.location.href = '/';
                            });
                        }}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm transition-colors text-slate-400 hover:bg-red-500/10 hover:text-red-400"
                    >
                        <LogOut className="w-4 h-4" />
                        Log Out Security Session
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col overflow-hidden relative">
                <header className="h-14 border-b border-slate-800 bg-slate-950 flex items-center px-6 justify-between shrink-0 shadow-md z-10">
                    <div className="text-sm font-medium text-slate-300">
                        {links.find(l => l.path === location.pathname)?.label || 'Dashboard'}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                        <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded border border-green-500/20">System Online</span>
                        <span>Hostinger MySQL</span>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-950 relative">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};
