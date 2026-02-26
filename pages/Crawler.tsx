import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, AlertCircle, RefreshCw, Download } from 'lucide-react';


export const Crawler: React.FC = () => {
    const [searchParams] = useSearchParams();
    const crawlId = searchParams.get('crawl_id');

    const [data, setData] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');

    const limit = 50;

    const loadData = async () => {
        if (!crawlId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/get_pages.php?crawl_id=${crawlId}&limit=${limit}&offset=${page * limit}&search=${encodeURIComponent(search)}`, { credentials: 'include' });
            const json = await res.json();
            if (json.data) {
                setData(json.data);
                setTotal(json.total);
            }
        } catch (e) {
            console.error("Failed to fetch crawler data", e);
        }
        setLoading(false);
    };

    useEffect(() => {
        const bounce = setTimeout(() => {
            loadData();
        }, 300);
        return () => clearTimeout(bounce);
    }, [crawlId, page, search]);

    if (!crawlId) {
        return (
            <div className="flex flex-col items-center justify-center mt-20 space-y-4">
                <div className="p-8 text-center text-slate-400 max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
                    <AlertCircle className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-white mb-2">Select a Project First</h3>
                    <p className="text-sm mb-6 text-slate-500">To view crawler data, you must select a project from the main dashboard.</p>
                    <a href="/" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors inline-block">Return to Dashboard</a>
                </div>
            </div>
        );
    }

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex items-center justify-between shrink-0">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <a href="/" className="text-xs text-slate-500 hover:text-indigo-400 flex items-center gap-1 transition-colors"><ChevronLeft className="w-3 h-3" /> Dashboard</a>
                    </div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">Every URL Discovered</h2>
                    <p className="text-sm text-slate-400">This table lists all HTML pages the engine found. Review status codes, internal headings, and response times to ensure quality.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Filter URLs..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-md pl-9 pr-4 py-1.5 text-sm focus:border-indigo-500 outline-none text-slate-300"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                        />
                    </div>
                    <button onClick={loadData} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-400 hover:text-white transition-colors"><RefreshCw className="w-4 h-4" /></button>

                    <a
                        href={`/api/export.php?crawl_id=${crawlId}&type=pages`}
                        download
                        className="p-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 rounded-md text-emerald-400 transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                        <Download className="w-4 h-4" /> Export CSV
                    </a>
                </div>
            </div>

            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-sm">
                <div className="flex-1 overflow-x-auto overflow-y-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap min-w-max">
                        <thead className="bg-slate-950 text-slate-400 font-medium sticky top-0 z-10 shadow-sm border-b border-slate-800">
                            <tr>
                                <th className="px-4 py-3">Address</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3">Indexability</th>
                                <th className="px-4 py-3">Title 1</th>
                                <th className="px-4 py-3">H1 1</th>
                                <th className="px-4 py-3">Meta Description 1</th>
                                <th className="px-4 py-3">JSON-LD Schema</th>
                                <th className="px-4 py-3 text-center">Word Count</th>
                                <th className="px-4 py-3 text-center">Text Ratio</th>
                                <th className="px-4 py-3 text-center">Response Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {loading && data.length === 0 ? (
                                <tr><td colSpan={9} className="p-8 text-center text-slate-500"><div className="flex items-center justify-center gap-3"><div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /> Loading crawl data...</div></td></tr>
                            ) : data.length === 0 ? (
                                <tr><td colSpan={9} className="p-8 text-center text-slate-500">No matching URLs found.</td></tr>
                            ) : (
                                data.map(row => (
                                    <tr key={row.id} className="hover:bg-slate-800/50 transition-colors">
                                        <td className="px-4 py-2 font-mono text-slate-300 max-w-[300px] truncate" title={row.url}>{row.url}</td>
                                        <td className="px-4 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.status_code >= 200 && row.status_code < 300 ? 'bg-green-500/20 text-green-400' : row.status_code >= 300 && row.status_code < 400 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-400'}`}>
                                                {row.status_code}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2">
                                            {row.is_indexable == 1 ? <span className="text-green-400">Indexable</span> : <span className="text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Non-Indexable</span>}
                                        </td>
                                        <td className="px-4 py-2 max-w-[200px] truncate text-slate-400" title={row.title}>{row.title || '-'}</td>
                                        <td className="px-4 py-2 max-w-[200px] truncate text-slate-400" title={row.h1}>{row.h1 || '-'}</td>
                                        <td className="px-4 py-2 max-w-[200px] truncate text-slate-400" title={row.meta_desc}>{row.meta_desc || '-'}</td>
                                        <td className="px-4 py-2 text-xs text-indigo-400 max-w-[150px] truncate" title={row.schema_types}>{row.schema_types || 'N/A'}</td>
                                        <td className="px-4 py-2 text-center text-slate-400">{row.word_count}</td>
                                        <td className="px-4 py-2 text-center text-slate-400">{row.text_ratio_percent}%</td>
                                        <td className="px-4 py-2 text-center text-slate-400 font-mono">{row.load_time_ms}ms</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="h-12 border-t border-slate-800 bg-slate-950 flex items-center justify-between px-4 shrink-0">
                    <div className="text-xs text-slate-500">
                        Showing {total === 0 ? 0 : page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total} rows
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={page === 0}
                            onClick={() => setPage(p => p - 1)}
                            className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-50 disabled:hover:text-slate-400"
                        ><ChevronLeft className="w-4 h-4" /></button>
                        <span className="text-xs text-slate-400 font-mono px-2">Page {page + 1} of {Math.max(1, totalPages)}</span>
                        <button
                            disabled={page >= totalPages - 1}
                            onClick={() => setPage(p => p + 1)}
                            className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-50 disabled:hover:text-slate-400"
                        ><ChevronRight className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>
        </div>
    );
};
