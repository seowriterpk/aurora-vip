import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Search, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

const API_HEADERS = {
    'Authorization': 'Bearer AURORA_SECRET_2026',
};

export const SEOptimer: React.FC = () => {
    const [searchParams] = useSearchParams();
    const crawlId = searchParams.get('crawl_id');

    const [urlInput, setUrlInput] = useState('');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const runAudit = async () => {
        if (!crawlId || !urlInput) return;
        setLoading(true);
        setError('');
        setData(null);
        try {
            // make sure it matches the exact crawled URL format
            const cleanUrl = urlInput.trim();
            const res = await fetch(`/api/reports/onpage.php?crawl_id=${crawlId}&url=${encodeURIComponent(cleanUrl)}`, { headers: API_HEADERS });
            const json = await res.json();
            if (json.error) setError(json.error);
            else setData(json);
        } catch (e) {
            setError('Failed to fetch audit data from DB.');
        }
        setLoading(false);
    };

    if (!crawlId) return <div className="p-8 text-center text-slate-500 border border-slate-800 border-dashed rounded-xl">No Crawl ID Selected. Go back to Dashboard.</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
                <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-400" /> URL On-Page SEO Grader</h2>
                <p className="text-slate-400 text-sm mb-6">Enter an exact URL from your active crawl to see its SEOptimer-style grade breakdown.</p>

                <div className="flex gap-3">
                    <input
                        type="text"
                        value={urlInput}
                        onChange={e => setUrlInput(e.target.value)}
                        placeholder="e.g. https://girlswagroup.link/category/xxx"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:border-indigo-500 outline-none"
                    />
                    <button
                        onClick={runAudit}
                        disabled={loading || !urlInput.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 border disabled:border-slate-700 border-indigo-500 disabled:text-slate-500 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                        {loading ? 'Analyzing...' : <><Search className="w-4 h-4" /> Audit Code</>}
                    </button>
                </div>
                {error && <div className="mt-4 text-red-500 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</div>}
            </div>

            {data && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-1 bg-slate-900 border border-slate-800 p-8 rounded-xl flex flex-col items-center justify-center shadow-sm">
                            <span className="text-slate-400 text-xs uppercase tracking-widest font-bold mb-2">On-Page Score</span>
                            <div className="text-7xl font-black" style={{ color: data.score >= 80 ? '#22c55e' : (data.score >= 60 ? '#fbbf24' : '#ef4444') }}>
                                {data.grade}
                            </div>
                            <span className="text-slate-300 font-mono text-xl mt-1">{data.score} / 100</span>
                        </div>
                        <div className="md:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-sm text-sm text-slate-300 space-y-3">
                            <h3 className="text-white font-bold mb-4">Raw Extracted Signals</h3>
                            <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 border border-slate-800 rounded">
                                <div><span className="text-slate-500">Title:</span> <span className="font-mono">{data.page_data.title || 'N/A'}</span></div>
                                <div><span className="text-slate-500">H1:</span> <span className="font-mono">{data.page_data.h1 || 'N/A'}</span></div>
                                <div className="col-span-2"><span className="text-slate-500">Desc:</span> <span className="font-mono line-clamp-2" title={data.page_data.meta_desc}>{data.page_data.meta_desc || 'N/A'}</span></div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 bg-slate-950 p-4 border border-slate-800 rounded">
                                <div><span className="text-slate-500">Words:</span> <span className="font-mono">{data.page_data.word_count}</span></div>
                                <div><span className="text-slate-500">Size:</span> <span className="font-mono">{Math.round(data.page_data.size_bytes / 1024)}KB</span></div>
                                <div><span className="text-slate-500">TTFB:</span> <span className="font-mono">{data.page_data.load_time_ms}ms</span></div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                        {Object.entries(data.audit).map(([category, checks]: [string, any], index) => (
                            <div key={category} className="border-b border-slate-800 last:border-b-0">
                                <div className="bg-slate-950/50 px-6 py-3 font-semibold text-slate-300 uppercase tracking-wider text-xs border-b border-slate-800/50">{category} Analysis</div>
                                <div className="divide-y divide-slate-800/30 font-mono text-sm max-h-[800px] overflow-y-auto w-full">
                                    {checks.map((check: any, i: number) => (
                                        <div key={i} className="flex p-4 hover:bg-slate-800/40 transition-colors">
                                            <div className="w-32 shrink-0 flex items-center pr-4 border-r border-slate-800/50">
                                                {check.status === 'PASS' && <span className="text-green-500 font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> PASS</span>}
                                                {check.status === 'WARN' && <span className="text-yellow-500 font-bold flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> WARN</span>}
                                                {check.status === 'FAIL' && <span className="text-red-500 font-bold flex items-center gap-1"><ShieldAlert className="w-4 h-4" /> FAIL</span>}
                                            </div>
                                            <div className="flex-1 px-4">
                                                <div className="font-bold text-slate-200">{check.title}</div>
                                                <div className="text-slate-400 mt-1">{check.description}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
