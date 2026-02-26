import React, { useState, useEffect, useRef } from 'react';
import { Play, Loader2, DatabaseZap, Globe, ChevronRight, Pause, Square, Trash2, Terminal, Download, Map } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const API_HEADERS = {
    'Content-Type': 'application/json'
};

export const Dashboard: React.FC = () => {
    const [urlInput, setUrlInput] = useState('https://girlswagroup.link');
    const [projects, setProjects] = useState<any[]>([]);
    const [activeCrawl, setActiveCrawl] = useState<any>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [logs, setLogs] = useState<any[]>([]);

    const navigate = useNavigate();
    const workerInterval = useRef<any>(null);
    const logInterval = useRef<any>(null);

    const loadProjects = async () => {
        try {
            const res = await fetch('/api/sync_status.php' + (activeCrawl ? `?crawl_id=${activeCrawl.id}` : ''), { headers: API_HEADERS });
            const data = await res.json();
            if (data.projects) setProjects(data.projects);

            // Check active crawl status from backend
            if (data.detail && data.detail.crawl) {
                const status = data.detail.crawl.status;
                if (status === 'RUNNING') {
                    if (!activeCrawl || activeCrawl.status !== 'RUNNING') {
                        setActiveCrawl(data.detail.crawl);
                        triggerWorker(data.detail.crawl.id);
                        startLogStream(data.detail.crawl.id);
                    }
                } else if (status === 'COMPLETED' || status === 'ERROR') {
                    setActiveCrawl(null);
                    clearInterval(workerInterval.current);
                    clearInterval(logInterval.current);
                } else if (status === 'PAUSED') {
                    setActiveCrawl(data.detail.crawl); // Keep context but don't hit worker
                    clearInterval(workerInterval.current);
                }
            }
        } catch (e) {
            console.error("Failed to load projects", e);
        }
    };

    useEffect(() => {
        loadProjects();
        return () => {
            clearInterval(workerInterval.current);
            clearInterval(logInterval.current);
        };
    }, []);

    const fetchLogs = async (crawlId: number) => {
        try {
            const res = await fetch(`/api/get_logs.php?crawl_id=${crawlId}`, { headers: API_HEADERS });
            const data = await res.json();
            if (data.logs) setLogs(data.logs);
        } catch (e) { }
    }

    const startLogStream = (crawlId: number) => {
        if (logInterval.current) clearInterval(logInterval.current);
        fetchLogs(crawlId);
        logInterval.current = setInterval(() => fetchLogs(crawlId), 3000);
    }

    const triggerWorker = async (crawlId: number) => {
        if (workerInterval.current) return;

        const pingWorker = async () => {
            try {
                const res = await fetch(`/api/worker.php?crawl_id=${crawlId}`, { headers: API_HEADERS });
                const data = await res.json();
                loadProjects();

                if (data.message === 'Crawl Completed' || data.error) {
                    clearInterval(workerInterval.current);
                    workerInterval.current = null;
                    setActiveCrawl(null);
                }
            } catch (e) {
                console.error("Worker error, retry...", e);
            }
        };

        pingWorker();
        // Hostinger specific: heartbeat every 5s instead of rapid loop
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
                startLogStream(data.crawl_id);
                loadProjects();
            }
        } catch (e) {
            alert('Failed to start crawl.');
        }
        setIsStarting(false);
    };

    const handleAction = async (crawlId: number, action: string) => {
        if (action === 'DELETE' && !window.confirm("Are you sure you want to permanently delete this project and all of its data? This cannot be undone.")) return;
        if (action === 'STOP' && !window.confirm("Are you sure you want to stop this active crawl?")) return;

        try {
            await fetch('/api/manage_crawl.php', {
                method: 'POST',
                headers: API_HEADERS,
                body: JSON.stringify({ crawl_id: crawlId, action })
            });

            if (action === 'DELETE') {
                if (activeCrawl?.id === crawlId) {
                    setActiveCrawl(null);
                    setLogs([]);
                    clearInterval(workerInterval.current);
                    clearInterval(logInterval.current);
                    workerInterval.current = null;
                }
                loadProjects();
            } else if (action === 'PAUSE' || action === 'STOP') {
                clearInterval(workerInterval.current);
                workerInterval.current = null;
                if (action === 'STOP') setActiveCrawl(null);
                loadProjects();
            } else if (action === 'RESUME') {
                setActiveCrawl({ id: crawlId, status: 'RUNNING' });
                triggerWorker(crawlId);
                loadProjects();
            }
        } catch (e) {
            console.error(e);
        }
    }

    const analyzeSitemap = async (crawlId: number) => {
        try {
            const res = await fetch(`/api/reports/sitemap_parser.php?crawl_id=${crawlId}`, { headers: API_HEADERS });
            const data = await res.json();
            if (data.error) {
                alert(data.error);
            } else {
                alert(`${data.message}\nFound: ${data.sitemap_urls_found} URLs\nOrphans Inserted: ${data.orphans_found}`);
            }
        } catch (e) {
            alert('Failed to analyze sitemap.');
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-10">
            {/* Start Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-sm">
                <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Globe className="w-5 h-5 text-indigo-400" /> Start New Audit</h2>
                <p className="text-slate-400 text-sm mb-6">Enter a root domain to initiate the PHP Hostinger crawler engine.</p>

                <div className="flex gap-3">
                    <input
                        type="text"
                        value={urlInput}
                        onChange={e => setUrlInput(e.target.value)}
                        disabled={!!activeCrawl && activeCrawl.status === 'RUNNING'}
                        placeholder="https://example.com"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:border-indigo-500 outline-none disabled:opacity-50"
                    />
                    <button
                        onClick={startNewCrawl}
                        disabled={!!activeCrawl && activeCrawl.status === 'RUNNING' || isStarting}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-500 text-white px-8 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                        {!!activeCrawl && activeCrawl.status === 'RUNNING' ? <><Loader2 className="w-4 h-4 animate-spin" /> Crawling...</> : <><Play className="w-4 h-4 fill-current" /> Start Engine</>}
                    </button>
                </div>
            </div>

            {/* Live Terminal Log */}
            {activeCrawl && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col h-64">
                    <div className="bg-slate-900 border-b border-slate-800 p-3 flex justify-between items-center shrink-0">
                        <h3 className="text-xs font-semibold text-slate-400 flex items-center gap-2 uppercase tracking-wider">
                            <Terminal className="w-4 h-4" /> Live Engine Output (Crawl #{activeCrawl.id})
                        </h3>
                        {activeCrawl.status === 'RUNNING' ? (
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span> PROCESSING
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-amber-500 text-xs font-mono">
                                <span className="w-2 h-2 rounded-full bg-amber-500"></span> PAUSED
                            </div>
                        )}
                    </div>
                    <div className="p-4 overflow-y-auto flex-1 font-mono text-xs space-y-1">
                        {logs.length === 0 ? (
                            <div className="text-slate-600">Waiting for engine heartbeat...</div>
                        ) : (
                            logs.map((log, i) => (
                                <div key={i} className="flex gap-3 hover:bg-slate-900/50 p-1 rounded">
                                    <span className="text-slate-600 shrink-0">[{log.created_at.split(' ')[1]}]</span>
                                    <span className={log.type === 'ERROR' ? 'text-red-400' : log.type === 'SUCCESS' ? 'text-green-400' : 'text-slate-300'}>{log.message}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Project List & Controls */}
            <div>
                <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><DatabaseZap className="w-5 h-5" /> Project Management</h2>
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    {projects.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">No projects found. Start a crawl above.</div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-950 text-slate-400">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Domain</th>
                                    <th className="px-6 py-4 font-medium">Status</th>
                                    <th className="px-6 py-4 font-medium text-center">URLs Parsed</th>
                                    <th className="px-6 py-4 font-medium text-right">Controls & Export</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {projects.map(p => (
                                    <tr key={p.latest_crawl_id || p.project_id} className="hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-slate-200">{p.domain}</td>
                                        <td className="px-6 py-4 text-slate-400">
                                            <div className="flex items-center gap-2 font-mono text-xs">
                                                <span className={`w-2 h-2 rounded-full ${p.status === 'RUNNING' ? 'bg-indigo-500 animate-pulse' : p.status === 'COMPLETED' ? 'bg-green-500' : p.status === 'PAUSED' ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                                                {p.status || 'NO DATA'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center font-mono text-slate-300">{p.urls_crawled || 0}</td>

                                        <td className="px-6 py-4">
                                            <div className="flex justify-end items-center gap-2">
                                                {/* Start/Pause controls for active runs */}
                                                {p.status === 'RUNNING' && (
                                                    <button onClick={() => handleAction(p.latest_crawl_id, 'PAUSE')} className="p-1.5 text-amber-500 hover:bg-amber-500/10 rounded" title="Pause Crawl">
                                                        <Pause className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {p.status === 'PAUSED' && (
                                                    <button onClick={() => handleAction(p.latest_crawl_id, 'RESUME')} className="p-1.5 text-indigo-400 hover:bg-indigo-500/10 rounded" title="Resume Crawl">
                                                        <Play className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {(p.status === 'RUNNING' || p.status === 'PAUSED') && (
                                                    <button onClick={() => handleAction(p.latest_crawl_id, 'STOP')} className="p-1.5 text-slate-400 hover:bg-slate-500/10 rounded" title="Stop & Mark Completed">
                                                        <Square className="w-4 h-4 fill-current" />
                                                    </button>
                                                )}

                                                {p.latest_crawl_id && (
                                                    <a href={`/api/export.php?crawl_id=${p.latest_crawl_id}&type=pages`} download className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded ml-2" title="Export CSV Pages">
                                                        <Download className="w-4 h-4" />
                                                    </a>
                                                )}

                                                <button onClick={() => handleAction(p.latest_crawl_id, 'DELETE')} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded ml-2" title="Permanently Delete Project">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>

                                                {p.latest_crawl_id && p.status === 'COMPLETED' && (
                                                    <button onClick={() => analyzeSitemap(p.latest_crawl_id)} className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded" title="Analyze XML Sitemap for Orphans">
                                                        <Map className="w-4 h-4" />
                                                    </button>
                                                )}

                                                <div className="w-px h-6 bg-slate-700 mx-2"></div>

                                                {p.latest_crawl_id && (
                                                    <button
                                                        onClick={() => {
                                                            navigate(`?crawl_id=${p.latest_crawl_id}`);
                                                            alert(`Project ${p.domain} Selected. You can now use the sidebar tools.`);
                                                        }}
                                                        className="inline-flex items-center gap-1 text-slate-300 hover:text-white text-xs font-semibold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded transition-colors">
                                                        Select Project
                                                    </button>
                                                )}

                                                {p.latest_crawl_id && (
                                                    <button
                                                        onClick={() => {
                                                            navigate(`/crawler?crawl_id=${p.latest_crawl_id}`);
                                                        }}
                                                        className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-xs font-semibold uppercase tracking-wider bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded transition-colors">
                                                        View Report <ChevronRight className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
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
