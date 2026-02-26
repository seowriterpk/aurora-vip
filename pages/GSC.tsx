import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { AlertTriangle, Info, CheckCircle2, ShieldAlert } from 'lucide-react';


const COLORS = ['#22c55e', '#64748b']; // Green for Valid, Gray for Excluded
const REASON_COLORS = ['#fbbf24', '#f87171', '#38bdf8', '#c084fc'];

export const GSC: React.FC = () => {
    const [searchParams] = useSearchParams();
    const crawlId = searchParams.get('crawl_id');

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!crawlId) return;
        setLoading(true);
        fetch(`/api/reports/coverage.php?crawl_id=${crawlId}`)
            .then(res => res.json())
            .then(json => {
                if (json.coverage) setData(json);
            })
            .catch(e => console.error("Failed to load GSC data", e))
            .finally(() => setLoading(false));
    }, [crawlId]);

    if (!crawlId) {
        return (
            <div className="flex flex-col items-center justify-center mt-20 space-y-4">
                <div className="p-8 text-center text-slate-400 max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
                    <AlertTriangle className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-white mb-2">Select a Project First</h3>
                    <p className="text-sm mb-6 text-slate-500">To view Search Console data, you must select an active project from the main dashboard.</p>
                    <a href="/" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors inline-block">Return to Dashboard</a>
                </div>
            </div>
        );
    }
    if (loading) return <div className="p-8 text-center text-slate-500">Generating Index Coverage Report...</div>;
    if (!data) return <div className="p-8 text-center text-red-500">Failed to load data.</div>;

    const pieData = [
        { name: 'Valid (Indexed)', value: data.coverage.valid },
        { name: 'Excluded', value: data.coverage.excluded }
    ];

    const breakdownData = [
        { name: 'Excluded by ‘noindex’', value: data.coverage.breakdown.noindex },
        { name: 'Page with redirect', value: data.coverage.breakdown.redirects },
        { name: 'Not found (404)', value: data.coverage.breakdown.not_found_40x },
        { name: 'Alternate page with proper canonical tag', value: data.coverage.breakdown.alternate_page_proper_canonical }
    ].filter(i => i.value > 0);

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between mb-2">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <a href="/" className="text-xs text-slate-500 hover:text-indigo-400 flex items-center gap-1 transition-colors">Dashboard</a>
                    </div>
                    <div className="flex items-center gap-3">
                        <ShieldAlert className="w-6 h-6 text-indigo-400" />
                        <h2 className="text-2xl font-bold text-white">Index Coverage Simulation</h2>
                    </div>
                </div>
            </div>
            <p className="text-sm text-slate-400 mb-6">This tool mimics Google Search Console. It shows exactly which pages search engines will index, and which pages they will ignore (and why).</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 text-center">Pages</h3>
                    <div className="flex items-center justify-around mb-8">
                        <div className="text-center">
                            <div className="text-3xl font-bold text-green-500">{data.coverage.valid}</div>
                            <div className="text-xs text-slate-500 mt-1 uppercase">Valid</div>
                        </div>
                        <div className="text-center">
                            <div className="text-3xl font-bold text-slate-400">{data.coverage.excluded}</div>
                            <div className="text-xs text-slate-500 mt-1 uppercase">Excluded</div>
                        </div>
                    </div>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                                    ))}
                                </Pie>
                                <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f1f5f9' }} itemStyle={{ color: '#e2e8f0' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Why pages aren't indexed</h3>
                        <div className="space-y-3">
                            {breakdownData.map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded bg-slate-950 border border-slate-800">
                                    <span className="text-sm text-slate-300 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: REASON_COLORS[i % REASON_COLORS.length] }}></span>
                                        {item.name}
                                    </span>
                                    <span className="font-bold text-slate-400">{item.value}</span>
                                </div>
                            ))}
                            {breakdownData.length === 0 && <div className="text-sm text-slate-500 italic">No excluded pages found in sample.</div>}
                        </div>
                    </div>
                </div>
            </div>

            {data.mismatches && data.mismatches.length > 0 && (
                <div className="bg-orange-950/20 border border-orange-900/50 rounded-xl p-6 shadow-sm">
                    <h3 className="text-orange-400 font-bold mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Canonical Mismatch Examples</h3>
                    <p className="text-sm text-orange-200/70 mb-4">These pages are indexable (200 OK), but their canonical tag points to a different URL entirely. This confuses search engines.</p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-orange-950/50 text-orange-300/70">
                                <tr>
                                    <th className="px-4 py-2">Crawled URL</th>
                                    <th className="px-4 py-2">Target Canonical Tag</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-orange-900/30">
                                {data.mismatches.map((m: any, i: number) => (
                                    <tr key={i}>
                                        <td className="px-4 py-3 font-mono text-orange-200 max-w-[300px] truncate" title={m.url}>{m.url}</td>
                                        <td className="px-4 py-3 font-mono text-orange-400 max-w-[300px] truncate" title={m.canonical}>{m.canonical}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
