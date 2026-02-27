import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle, ShieldAlert, FileSearch, ArrowRight, Play, Search, Hash, Download } from 'lucide-react';

const COLORS = ['#22c55e', '#64748b']; // Green for Valid, Gray for Excluded
const REASON_COLORS = ['#fbbf24', '#f87171', '#38bdf8', '#c084fc'];

type TabKey = 'coverage' | 'solver';

export const GSC: React.FC = () => {
    const [searchParams] = useSearchParams();
    const crawlId = searchParams.get('crawl_id');

    const [activeTab, setActiveTab] = useState<TabKey>('coverage');

    // Coverage Data
    const [coverageData, setCoverageData] = useState<any>(null);
    const [coverageLoading, setCoverageLoading] = useState(true);

    // Solver Data
    const [solverInput, setSolverInput] = useState('');
    const [solverResults, setSolverResults] = useState<any[]>([]);
    const [solverLoading, setSolverLoading] = useState(false);
    const [solverError, setSolverError] = useState('');

    useEffect(() => {
        if (!crawlId || activeTab !== 'coverage') return;
        if (coverageData) return; // Already loaded

        setCoverageLoading(true);
        fetch(`/api/reports/coverage.php?crawl_id=${crawlId}`, { credentials: 'include' })
            .then(res => res.json())
            .then(json => {
                if (json.coverage) setCoverageData(json);
            })
            .catch(e => console.error("Failed to load GSC data", e))
            .finally(() => setCoverageLoading(false));
    }, [crawlId, activeTab, coverageData]);

    const runSolver = async () => {
        if (!solverInput.trim()) {
            setSolverError("Please enter at least one URL");
            return;
        }

        const urls = solverInput.split('\n').map(u => u.trim()).filter(u => u.length > 0);
        if (urls.length === 0) return;

        setSolverLoading(true);
        setSolverError('');
        setSolverResults([]);

        try {
            const res = await fetch('/api/reports/gsc_solver.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ crawl_id: crawlId, urls }),
                credentials: 'include'
            });
            const json = await res.json();

            if (json.error) {
                setSolverError(json.error);
            } else if (json.results) {
                setSolverResults(json.results);
            }
        } catch (e: any) {
            setSolverError(e.message || "Failed to run GSC URL Solver");
        } finally {
            setSolverLoading(false);
        }
    };

    const exportTraceCSV = () => {
        if (!solverResults || solverResults.length === 0) return;
        let csvContent = "data:text/csv;charset=utf-8,Input URL,Found In Sitemap,Found In Canonical,Found In Hreflang,Internal Links Count,Evidence Source URL,Evidence HTML Snippet\n";
        solverResults.forEach(res => {
            const hasSitemap = res.found_in_sitemap ? "Yes" : "No";
            const hasCanon = res.found_in_canonical ? "Yes" : "No";
            const hasHreflang = res.found_in_hreflang ? "Yes" : "No";
            const linksCount = res.source_pages ? res.source_pages.length : 0;

            if (linksCount === 0) {
                csvContent += `"${res.url}","${hasSitemap}","${hasCanon}","${hasHreflang}","0","",""\n`;
            } else {
                res.source_pages.forEach((p: any) => {
                    const snippet = (p.html_snippet || "").replace(/"/g, '""');
                    csvContent += `"${res.url}","${hasSitemap}","${hasCanon}","${hasHreflang}","${linksCount}","${p.source_url}","${snippet}"\n`;
                });
            }
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `aurora_gsc_trace_results.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

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

    const Header = () => (
        <div className="flex flex-col gap-4 shrink-0 mb-6">
            <div className="flex items-center justify-between">
                <div>
                    <a href="/" className="text-xs text-slate-500 hover:text-indigo-400 transition-colors mb-1 inline-block">← Dashboard</a>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">Search Console Insights</h2>
                    <p className="text-sm text-slate-400 mt-1">Simulate index coverage and trace the exact sources of GSC URL errors.</p>
                </div>
            </div>

            <div className="flex gap-2 border-b border-slate-800">
                <button onClick={() => setActiveTab('coverage')} className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'coverage' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>
                    <ShieldAlert className="w-4 h-4" /> Coverage Simulation
                </button>
                <button onClick={() => setActiveTab('solver')} className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'solver' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>
                    <FileSearch className="w-4 h-4" /> GSC URL Problem Solver
                </button>
            </div>
        </div>
    );

    const CoverageTab = () => {
        if (coverageLoading) return <div className="p-8 flex items-center justify-center gap-3 text-slate-500"><div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /> Generating Index Coverage Report...</div>;
        if (!coverageData) return <div className="p-8 text-center text-red-500">Failed to load data.</div>;

        const pieData = [
            { name: 'Valid (Indexed)', value: coverageData.coverage.valid },
            { name: 'Excluded', value: coverageData.coverage.excluded }
        ];

        const breakdownData = [
            { name: 'Excluded by ‘noindex’', value: coverageData.coverage.breakdown.noindex },
            { name: 'Page with redirect', value: coverageData.coverage.breakdown.redirects },
            { name: 'Not found (404)', value: coverageData.coverage.breakdown.not_found_40x },
            { name: 'Alternate page with proper canonical tag', value: coverageData.coverage.breakdown.alternate_page_proper_canonical }
        ].filter(i => i.value > 0);

        return (
            <div className="space-y-6">
                <p className="text-sm text-slate-400">This tool mimics Google Search Console. It shows exactly which pages search engines will index, and which pages they will ignore (and why).</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 text-center">Pages</h3>
                        <div className="flex items-center justify-around mb-8">
                            <div className="text-center">
                                <div className="text-3xl font-bold text-green-500">{coverageData.coverage.valid}</div>
                                <div className="text-xs text-slate-500 mt-1 uppercase">Valid</div>
                            </div>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-slate-400">{coverageData.coverage.excluded}</div>
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

                {coverageData.mismatches && coverageData.mismatches.length > 0 && (
                    <div className="bg-orange-950/20 border border-orange-900/50 rounded-xl p-6 shadow-sm mb-10">
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
                                    {coverageData.mismatches.map((m: any, i: number) => (
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

    const SolverTab = () => {
        return (
            <div className="space-y-6 mb-10">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                        <Search className="w-5 h-5 text-indigo-400" /> Trace Problematic URLs from GSC
                    </h3>
                    <p className="text-sm text-slate-400 mb-4">Paste URLs from your Google Search Console export (e.g. "Page with redirect" or "Not found"). AURORA will search the entire crawl database to tell you exactly <b>where</b> those URLs are still being linked from (internal links, canonicals, sitemap, hreflang).</p>

                    <textarea
                        className="w-full h-40 bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm font-mono text-slate-300 focus:border-indigo-500 outline-none mb-4"
                        placeholder="Paste URLs here (one per line)...&#10;https://example.com/old-page&#10;https://example.com/category/wrong"
                        value={solverInput}
                        onChange={e => setSolverInput(e.target.value)}
                    ></textarea>

                    {solverError && <div className="text-red-400 text-sm mb-4 bg-red-500/10 p-3 rounded">{solverError}</div>}

                    <div className="flex justify-end">
                        <button
                            onClick={runSolver}
                            disabled={solverLoading}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            {solverLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play className="w-4 h-4" />}
                            Run Trace
                        </button>
                    </div>
                </div>

                {solverResults.length > 0 && (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                            <h3 className="font-bold text-white">Trace Results ({solverResults.length})</h3>
                            <button onClick={exportTraceCSV} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                                <Download className="w-3.5 h-3.5" /> Export Trace CSV
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-950 text-slate-400">
                                    <tr>
                                        <th className="px-4 py-3 min-w-[200px]">Problem URL (Input)</th>
                                        <th className="px-4 py-3 text-yellow-400">Where it exists in your site</th>
                                        <th className="px-4 py-3 text-indigo-400">Evidence</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {solverResults.map((res: any, i: number) => (
                                        <tr key={i} className="hover:bg-slate-800/50 align-top">
                                            <td className="px-4 py-3 font-mono text-red-400 text-[11px] truncate max-w-[250px]" title={res.url}>{res.url}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-1.5">
                                                    {res.found_in_sitemap && <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded w-max text-[10px] font-bold">In Sitemap</span>}
                                                    {res.found_in_canonical && <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded w-max text-[10px] font-bold">In Canonical Tag</span>}
                                                    {res.found_in_hreflang && <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded w-max text-[10px] font-bold">In Hreflang</span>}
                                                    {res.found_in_links && <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded w-max text-[10px] font-bold">Internal Links</span>}
                                                    {!res.found_in_sitemap && !res.found_in_canonical && !res.found_in_hreflang && !res.found_in_links && (
                                                        <span className="text-slate-500 italic">Not found in current crawl</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-[10px] text-slate-400 max-w-[400px]">
                                                {res.source_pages && res.source_pages.length > 0 ? (
                                                    <div className="flex flex-col gap-2">
                                                        {res.source_pages.map((p: any, idx: number) => (
                                                            <div key={idx} className="bg-slate-950 p-2 rounded border border-slate-800">
                                                                <div className="text-indigo-400 truncate mb-1">Found on: {p.source_url}</div>
                                                                <div className="text-slate-500 truncate" title={p.html_snippet}>{p.html_snippet}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <span className="text-slate-600">No evidence found</span>}
                                            </td>
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

    return (
        <div className="max-w-6xl mx-auto h-full overflow-y-auto pr-2 pb-10">
            <Header />
            {activeTab === 'coverage' && <CoverageTab />}
            {activeTab === 'solver' && <SolverTab />}
        </div>
    );
};
