import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Network, Link as LinkIcon, AlertTriangle, Layers } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';


export const Sitebulb: React.FC = () => {
    const [searchParams] = useSearchParams();
    const crawlId = searchParams.get('crawl_id');

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!crawlId) return;
        setLoading(true);
        fetch(`/api/reports/insights.php?crawl_id=${crawlId}`, { credentials: 'include' })
            .then(res => res.json())
            .then(json => {
                if (!json.error) setData(json);
            })
            .catch(e => console.error("Failed to load Sitebulb data", e))
            .finally(() => setLoading(false));
    }, [crawlId]);

    if (!crawlId) {
        return (
            <div className="flex flex-col items-center justify-center mt-20 space-y-4">
                <div className="p-8 text-center text-slate-400 max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
                    <AlertTriangle className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-white mb-2">Select a Project First</h3>
                    <p className="text-sm mb-6 text-slate-500">To view Sitebulb insights, you must select an active project from the main dashboard.</p>
                    <a href="/" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors inline-block">Return to Dashboard</a>
                </div>
            </div>
        );
    }
    if (loading) return <div className="p-8 text-center text-slate-500">Processing graph analysis...</div>;
    if (!data) return <div className="p-8 text-center text-red-500">Failed to load insight data.</div>;

    const depthData = data.depth_distribution.map((d: any) => ({
        depth: `Level ${d.depth}`,
        pages: parseInt(d.count)
    }));

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between mb-2">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <a href="/" className="text-xs text-slate-500 hover:text-indigo-400 flex items-center gap-1 transition-colors">Dashboard</a>
                    </div>
                    <div className="flex items-center gap-3">
                        <Network className="w-6 h-6 text-indigo-400" />
                        <h2 className="text-2xl font-bold text-white">Site Architecture Insights</h2>
                    </div>
                </div>
            </div>
            <p className="text-sm text-slate-400 mb-6">This tool analyzes the structure of your website, showing how deep pages are buried, finding broken internal links, and identifying upper-case URL issues.</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Depth Distribution */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-2"><Layers className="w-4 h-4" /> Click Depth Distribution</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={depthData}>
                                <XAxis dataKey="depth" stroke="#475569" fontSize={12} />
                                <YAxis stroke="#475569" fontSize={12} />
                                <Tooltip cursor={{ fill: '#1e293b' }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} />
                                <Bar dataKey="pages" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Broken Internal Links */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm flex flex-col">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Broken Internal Links</h3>
                    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                        {data.broken_internal_links.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-slate-500 text-sm">No broken internal links found. Perfect!</div>
                        ) : (
                            data.broken_internal_links.map((link: any, i: number) => (
                                <div key={i} className="bg-slate-950 p-3 rounded border border-slate-800 text-xs">
                                    <div className="flex justify-between mb-1">
                                        <span className="text-slate-500">From:</span>
                                        <span className="text-red-400 font-bold">[{link.status_code}]</span>
                                    </div>
                                    <div className="text-slate-300 font-mono truncate mb-2" title={link.source_url}>{link.source_url}</div>
                                    <div className="text-slate-500 mb-1">Spews to:</div>
                                    <div className="text-indigo-300 font-mono truncate" title={link.target_url}>{link.target_url}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Case Issues */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm lg:col-span-2">
                    <h3 className="text-sm font-semibold text-amber-500 uppercase tracking-wider mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Case Sensitive Mismatches</h3>
                    <p className="text-slate-400 text-sm mb-4">Internal links discovered with uppercase characters. This often causes unnecessary 301 redirects or duplicate content scaling issues on Linux servers.</p>

                    {data.case_issues.length === 0 ? (
                        <div className="p-4 bg-slate-950 rounded text-center text-slate-500 text-sm">No uppercase links detected. Good job.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-950 text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Source URL</th>
                                        <th className="px-4 py-3 text-amber-500">Offending Uppercase Link</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {data.case_issues.map((issue: any, i: number) => (
                                        <tr key={i} className="hover:bg-slate-800/50">
                                            <td className="px-4 py-3 text-slate-300 font-mono truncate max-w-xs">{issue.source_url}</td>
                                            <td className="px-4 py-3 text-amber-400 font-mono font-bold truncate max-w-xs">{issue.target_url}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
