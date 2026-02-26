import React, { useState, useEffect, useRef } from 'react';
import { Play, Loader2, DatabaseZap, Search, Globe, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const API_HEADERS = {
    'Authorization': 'Bearer AURORA_SECRET_2026',
    'Content-Type': 'application/json'
};

export const Dashboard: React.FC = () => {
    const [urlInput, setUrlInput] = useState('https://girlswagroup.link');
    const [projects, setProjects] = useState<any[]>([]);
    const [activeCrawl, setActiveCrawl] = useState<any>(null);
    const [isStarting, setIsStarting] = useState(false);

    // Heartbeat Reference
    const workerInterval = useRef<any>(null);

    const loadProjects = async () => {
        try {
            const res = await fetch('/api/sync_status.php' + (activeCrawl ? `?crawl_id=${activeCrawl.id}` : ''), { headers: API_HEADERS });
            const data = await res.json();
            if (data.projects) setProjects(data.projects);
            if (data.detail && data.detail.crawl && data.detail.crawl.status === 'RUNNING') {
                setActiveCrawl(data.detail.crawl);
                triggerWorker(data.detail.crawl.id);
            } else if (data.detail && data.detail.crawl && data.detail.crawl.status === 'COMPLETED') {
                setActiveCrawl(null);
                clearInterval(workerInterval.current);
            }
        } catch (e) {
            console.error("Failed to load projects", e);
        }
    };

    useEffect(() => {
        loadProjects();
        return () => clearInterval(workerInterval.current);
    }, []);

    const triggerWorker = async (crawlId: number) => {
        if (workerInterval.current) return;

        const pingWorker = async () => {
            try {
                const res = await fetch(`/api/worker.php?crawl_id=${crawlId}`, { headers: API_HEADERS });
                const data = await res.json();

                // Refresh UI aggressively while running
                loadProjects();

                if (data.message === 'Crawl Completed' || data.error) {
                    clearInterval(workerInterval.current);
                    workerInterval.current = null;
                    setActiveCrawl(null);
                }
            } catch (e) {
                console.error("Worker error, will retry on next tick", e);
            }
        };

        // Fire heavily, let PHP manage its own timeout
        pingWorker();
        workerInterval.current = setInterval(pingWorker, 5000);
    };

    const startNewCrawl = async () => {
        if (!urlInput) return;
        setIsStarting(true);
        try {
            const res = await fetch('/api/start_crawl.php', {
                method: 'POST',
                headers: API_HEADERS,
                body: JSON.stringify({ url: urlInput })
            });
            const data = await res.json();
            if (data.error) {
                alert(data.error);
            } else {
                setActiveCrawl({ id: data.crawl_id, status: 'RUNNING' });
                triggerWorker(data.crawl_id);
                loadProjects();
            }
        } catch (e) {
            alert('Failed to start crawl.');
        }
        setIsStarting(false);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-sm">
                <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Globe className="w-5 h-5 text-indigo-400" /> Start New Audit</h2>
                <p className="text-slate-400 text-sm mb-6">Enter a root domain to initiate the PHP SQLite crawler engine.</p>

                <div className="flex gap-3">
                    <input
                        type="text"
                        value={urlInput}
                        onChange={e => setUrlInput(e.target.value)}
                        disabled={!!activeCrawl || isStarting}
                        placeholder="https://example.com"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:border-indigo-500 outline-none disabled:opacity-50"
                    />
                    <button
                        onClick={startNewCrawl}
                        disabled={!!activeCrawl || isStarting}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-500 text-white px-8 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                        {activeCrawl ? <><Loader2 className="w-4 h-4 animate-spin" /> Crawling...</> : <><Play className="w-4 h-4 fill-current" /> Start Engine</>}
                    </button>
                </div>

                {activeCrawl && (
                    <div className="mt-4 bg-indigo-950/30 border border-indigo-500/30 rounded-lg p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></div>
                            <span className="text-indigo-300 text-sm font-medium">Engine is active. Processing background queues...</span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono">Crawl ID: {activeCrawl.id}</div>
                    </div>
                )}
            </div>

            <div>
                <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><DatabaseZap className="w-5 h-5" /> Project History</h2>
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    {projects.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">No projects found. Start a crawl above.</div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-950 text-slate-400">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Domain</th>
                                    <th className="px-6 py-4 font-medium">Last Crawl</th>
                                    <th className="px-6 py-4 font-medium text-center">URLs Parsed</th>
                                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {projects.map(p => (
                                    <tr key={p.project_id} className="hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-slate-200">{p.domain}</td>
                                        <td className="px-6 py-4 text-slate-400">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${p.status === 'RUNNING' ? 'bg-indigo-500 animate-pulse' : p.status === 'COMPLETED' ? 'bg-green-500' : 'bg-slate-500'}`}></span>
                                                {p.status || 'NO DATA'} <span className="text-xs opacity-50 ml-2">{p.started_at}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center font-mono text-slate-300">{p.urls_crawled || 0}</td>
                                        <td className="px-6 py-4 text-right">
                                            {p.latest_crawl_id && (
                                                <Link to={`/crawler?crawl_id=${p.latest_crawl_id}`} className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-xs font-semibold uppercase tracking-wider bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded transition-colors">
                                                    View Report <ChevronRight className="w-3 h-3" />
                                                </Link>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
