import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, AlertCircle, RefreshCw, Download, Database, AlertTriangle, Link, Image as ImageIcon } from 'lucide-react';

type TabKey = 'pages' | 'issues' | 'canonical' | 'images';

export const Crawler: React.FC = () => {
    const [searchParams] = useSearchParams();
    const crawlId = searchParams.get('crawl_id');

    const [activeTab, setActiveTab] = useState<TabKey>('pages');

    // Pages State
    const [pagesData, setPagesData] = useState<any[]>([]);
    const [pagesTotal, setPagesTotal] = useState(0);
    const [pagesPage, setPagesPage] = useState(0);
    const [pagesSearch, setPagesSearch] = useState('');
    const [pagesLoading, setPagesLoading] = useState(false);

    // Issues State
    const [issuesData, setIssuesData] = useState<any[]>([]);
    const [issuesTotal, setIssuesTotal] = useState(0);
    const [issuesSeverityCounts, setIssuesSeverityCounts] = useState<any[]>([]);
    const [issuesTypeCounts, setIssuesTypeCounts] = useState<any[]>([]);
    const [issuesPage, setIssuesPage] = useState(0);
    const [issuesFilterSeverity, setIssuesFilterSeverity] = useState('');
    const [issuesFilterType, setIssuesFilterType] = useState('');
    const [issuesLoading, setIssuesLoading] = useState(false);

    // Canonical State
    const [canonicalData, setCanonicalData] = useState<any>(null);
    const [canonicalLoading, setCanonicalLoading] = useState(false);

    // Images State
    const [imagesData, setImagesData] = useState<any>(null);
    const [imagesLoading, setImagesLoading] = useState(false);

    const limit = 50;

    // Load Pages
    const loadPages = async () => {
        if (!crawlId) return;
        setPagesLoading(true);
        try {
            const res = await fetch(`/api/get_pages.php?crawl_id=${crawlId}&limit=${limit}&offset=${pagesPage * limit}&search=${encodeURIComponent(pagesSearch)}`, { credentials: 'include' });
            const json = await res.json();
            if (json.data) {
                setPagesData(json.data);
                setPagesTotal(json.total);
            }
        } catch (e) {
            console.error("Failed to fetch crawler data", e);
        }
        setPagesLoading(false);
    };

    useEffect(() => {
        if (activeTab === 'pages') {
            const bounce = setTimeout(() => { loadPages(); }, 300);
            return () => clearTimeout(bounce);
        }
    }, [crawlId, pagesPage, pagesSearch, activeTab]);

    // Load Issues
    const loadIssues = async () => {
        if (!crawlId) return;
        setIssuesLoading(true);
        try {
            const res = await fetch(`/api/reports/issues_report.php?crawl_id=${crawlId}&limit=${limit}&offset=${issuesPage * limit}&severity=${issuesFilterSeverity}&type=${issuesFilterType}`, { credentials: 'include' });
            const json = await res.json();
            if (!json.error) {
                setIssuesData(json.data);
                setIssuesTotal(json.total);
                setIssuesSeverityCounts(json.severity_counts);
                setIssuesTypeCounts(json.type_counts);
            }
        } catch (e) { console.error("Failed to fetch issues data", e); }
        setIssuesLoading(false);
    };

    useEffect(() => {
        if (activeTab === 'issues') {
            loadIssues();
        }
    }, [crawlId, issuesPage, issuesFilterSeverity, issuesFilterType, activeTab]);

    // Load Canonical
    const loadCanonical = async () => {
        if (!crawlId) return;
        setCanonicalLoading(true);
        try {
            const res = await fetch(`/api/reports/canonical_audit.php?crawl_id=${crawlId}`, { credentials: 'include' });
            const json = await res.json();
            if (!json.error) setCanonicalData(json);
        } catch (e) { console.error("Failed to fetch canonical data", e); }
        setCanonicalLoading(false);
    };

    useEffect(() => {
        if (activeTab === 'canonical' && !canonicalData) loadCanonical();
    }, [crawlId, activeTab]);

    // Load Images
    const loadImages = async () => {
        if (!crawlId) return;
        setImagesLoading(true);
        try {
            const res = await fetch(`/api/reports/image_audit.php?crawl_id=${crawlId}`, { credentials: 'include' });
            const json = await res.json();
            if (!json.error) setImagesData(json);
        } catch (e) { console.error("Failed to fetch image data", e); }
        setImagesLoading(false);
    };

    useEffect(() => {
        if (activeTab === 'images' && !imagesData) loadImages();
    }, [crawlId, activeTab]);


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

    const Header = () => (
        <div className="flex flex-col gap-4 shrink-0">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <a href="/" className="p-2 -ml-2 text-slate-500 hover:text-indigo-400 rounded-lg hover:bg-indigo-500/10 transition-colors"><ChevronLeft className="w-5 h-5" /></a>
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">Technical Crawler</h2>
                        <p className="text-sm text-slate-400 mt-1">Deep forensic scan of URL discovery, architecture, and SEO anomalies.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <a href={`/api/export.php?crawl_id=${crawlId}&type=${activeTab}`} download className="flex items-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        <Download className="w-4 h-4" /> Export {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} CSV
                    </a>
                </div>
            </div>

            <div className="flex gap-2 border-b border-slate-800">
                <button onClick={() => setActiveTab('pages')} className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'pages' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>
                    <Database className="w-4 h-4" /> All URls
                </button>
                <button onClick={() => setActiveTab('issues')} className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'issues' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>
                    <AlertTriangle className="w-4 h-4" /> Auto-Detected Issues
                </button>
                <button onClick={() => setActiveTab('canonical')} className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'canonical' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>
                    <Link className="w-4 h-4" /> Canonical Audit
                </button>
                <button onClick={() => setActiveTab('images')} className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'images' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>
                    <ImageIcon className="w-4 h-4" /> Image SEO
                </button>
            </div>
        </div>
    );

    const PagesTab = () => {
        const totalPages = Math.ceil(pagesTotal / limit);
        return (
            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-sm mt-4">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                    <div className="relative w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input type="text" placeholder="Filter URLs..." className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm focus:border-indigo-500 outline-none text-slate-300" value={pagesSearch} onChange={(e) => { setPagesSearch(e.target.value); setPagesPage(0); }} />
                    </div>
                </div>
                <div className="flex-1 overflow-x-auto overflow-y-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap min-w-max">
                        <thead className="bg-slate-950 text-slate-400 font-medium sticky top-0 z-10 shadow-sm border-b border-slate-800">
                            <tr>
                                <th className="px-4 py-3">Address</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3">Indexability</th>
                                <th className="px-4 py-3">Score</th>
                                <th className="px-4 py-3">Title</th>
                                <th className="px-4 py-3">H1</th>
                                <th className="px-4 py-3">Canonical Status</th>
                                <th className="px-4 py-3 text-center">Word Count</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {pagesLoading && pagesData.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-500">Loading crawl data...</td></tr>
                            ) : pagesData.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-500">No matching URLs found.</td></tr>
                            ) : (
                                pagesData.map((row: any) => (
                                    <tr key={row.id} className="hover:bg-slate-800/50 transition-colors">
                                        <td className="px-4 py-2 font-mono text-slate-300 max-w-[300px] truncate" title={row.url}>{row.url}</td>
                                        <td className="px-4 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.status_code >= 200 && row.status_code < 300 ? 'bg-green-500/20 text-green-400' : row.status_code >= 300 && row.status_code < 400 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-400'}`}>
                                                {row.status_code}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-center text-[10px] font-bold">
                                            {row.is_indexable == 1 ? <span className="text-green-400">Yes</span> : <span className="text-red-400 bg-red-500/10 px-1 rounded">No</span>}
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.indexability_score >= 80 ? 'text-green-400' : row.indexability_score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                {row.indexability_score}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 max-w-[200px] truncate text-slate-400" title={row.title}>{row.title || '-'}</td>
                                        <td className="px-4 py-2 max-w-[200px] truncate text-slate-400" title={row.h1}>{row.h1 || '-'}</td>
                                        <td className="px-4 py-2 capitalize text-slate-400">{row.canonical_status || 'Unknown'}</td>
                                        <td className="px-4 py-2 text-center text-slate-400">{row.word_count}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="h-12 border-t border-slate-800 bg-slate-950 flex items-center justify-between px-4 shrink-0">
                    <div className="text-xs text-slate-500">Showing {pagesTotal === 0 ? 0 : pagesPage * limit + 1} to {Math.min((pagesPage + 1) * limit, pagesTotal)} of {pagesTotal}</div>
                    <div className="flex gap-2">
                        <button disabled={pagesPage === 0} onClick={() => setPagesPage(p => p - 1)} className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                        <button disabled={pagesPage >= totalPages - 1} onClick={() => setPagesPage(p => p + 1)} className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>
        );
    };

    const IssuesTab = () => {
        const totalPages = Math.ceil(issuesTotal / limit);
        return (
            <div className="flex-1 flex flex-col mt-4 space-y-4">
                <div className="grid grid-cols-4 gap-4">
                    {issuesSeverityCounts.map((sc: any) => (
                        <div key={sc.severity} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col">
                            <span className="text-xs uppercase text-slate-500 font-bold tracking-wider">{sc.severity} Issues</span>
                            <span className={`text-2xl font-black mt-1 ${sc.severity === 'Critical' ? 'text-red-500' : sc.severity === 'High' ? 'text-orange-400' : sc.severity === 'Medium' ? 'text-amber-400' : 'text-blue-400'}`}>{sc.count}</span>
                        </div>
                    ))}
                </div>
                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-sm">
                    <div className="p-4 border-b border-slate-800 flex gap-4 bg-slate-950">
                        <select className="bg-slate-900 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 text-sm outline-none w-48" value={issuesFilterSeverity} onChange={e => { setIssuesFilterSeverity(e.target.value); setIssuesPage(0); }}>
                            <option value="">All Severities</option>
                            <option value="Critical">Critical</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                        </select>
                        <select className="bg-slate-900 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 text-sm outline-none w-64" value={issuesFilterType} onChange={e => { setIssuesFilterType(e.target.value); setIssuesPage(0); }}>
                            <option value="">All Types</option>
                            {issuesTypeCounts.map((tc: any) => (
                                <option key={tc.type} value={tc.type}>{tc.type} ({tc.count})</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 overflow-x-auto overflow-y-auto">
                        <table className="w-full text-left text-xs whitespace-nowrap min-w-max">
                            <thead className="bg-slate-950 text-slate-400 font-medium sticky top-0 z-10 border-b border-slate-800">
                                <tr>
                                    <th className="px-4 py-3">Severity</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3 w-1/3">URL</th>
                                    <th className="px-4 py-3">Message</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {issuesLoading && issuesData.length === 0 ? (
                                    <tr><td colSpan={4} className="p-8 text-center text-slate-500">Loading issues...</td></tr>
                                ) : issuesData.length === 0 ? (
                                    <tr><td colSpan={4} className="p-8 text-center text-slate-500">No issues found.</td></tr>
                                ) : (
                                    issuesData.map((row: any) => (
                                        <tr key={row.id} className="hover:bg-slate-800/50">
                                            <td className="px-4 py-2 font-bold">
                                                <span className={`${row.severity === 'Critical' ? 'text-red-500' : row.severity === 'High' ? 'text-orange-400' : row.severity === 'Medium' ? 'text-amber-400' : 'text-blue-400'}`}>{row.severity}</span>
                                            </td>
                                            <td className="px-4 py-2 text-slate-300">{row.type}</td>
                                            <td className="px-4 py-2 font-mono text-slate-400 max-w-[300px] truncate" title={row.url}>{row.url?.replace(/^https?:\/\/[^/]+/, '')}</td>
                                            <td className="px-4 py-2 text-slate-300 truncate max-w-[400px]" title={row.message}>{row.message}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="h-12 border-t border-slate-800 bg-slate-950 flex items-center justify-between px-4 shrink-0">
                        <div className="text-xs text-slate-500">Showing {issuesTotal === 0 ? 0 : issuesPage * limit + 1} to {Math.min((issuesPage + 1) * limit, issuesTotal)} of {issuesTotal}</div>
                        <div className="flex gap-2">
                            <button disabled={issuesPage === 0} onClick={() => setIssuesPage(p => p - 1)} className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                            <button disabled={issuesPage >= totalPages - 1} onClick={() => setIssuesPage(p => p + 1)} className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const CanonicalTab = () => {
        if (!canonicalData) return <div className="p-8 text-center text-slate-500 mt-4">Loading canonical audit...</div>;
        return (
            <div className="flex-col flex gap-4 mt-4">
                <div className="grid grid-cols-5 gap-4">
                    {canonicalData.status_distribution?.map((sd: any) => (
                        <div key={sd.canonical_status} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                            <div className="text-2xl font-black text-indigo-400">{sd.count}</div>
                            <div className="text-xs uppercase text-slate-500 font-bold mt-1">{sd.canonical_status}</div>
                        </div>
                    ))}
                </div>

                <h3 className="text-lg font-bold text-slate-200 mt-4 border-b border-slate-800 pb-2">Canonical Mismatches</h3>
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-slate-950 text-slate-400 font-medium border-b border-slate-800">
                            <tr><th className="px-4 py-2">Page URL</th><th className="px-4 py-2">Canonical Target</th><th className="px-4 py-2 text-center">Status</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {canonicalData.mismatches?.map((m: any, i: number) => (
                                <tr key={i} className="hover:bg-slate-800/50">
                                    <td className="px-4 py-2 text-red-400 truncate max-w-[300px]" title={m.url}>{m.url}</td>
                                    <td className="px-4 py-2 text-green-400 truncate max-w-[300px]" title={m.canonical}>{m.canonical}</td>
                                    <td className="px-4 py-2 text-center text-slate-500">{m.status_code}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <h3 className="text-lg font-bold text-slate-200 mt-4 border-b border-slate-800 pb-2">Canonical → Non-200 Targets</h3>
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto mb-10">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-slate-950 text-slate-400 font-medium border-b border-slate-800">
                            <tr><th className="px-4 py-2">Page URL</th><th className="px-4 py-2 text-red-400">Broken Target</th><th className="px-4 py-2 text-center">Target Status</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {canonicalData.bad_targets?.map((m: any, i: number) => (
                                <tr key={i} className="hover:bg-slate-800/50">
                                    <td className="px-4 py-2 text-slate-400 truncate max-w-[300px]">{m.url}</td>
                                    <td className="px-4 py-2 text-red-400 truncate max-w-[300px]">{m.canonical}</td>
                                    <td className="px-4 py-2 text-center font-bold text-red-500">{m.target_status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const ImagesTab = () => {
        if (!imagesData) return <div className="p-8 text-center text-slate-500 mt-4">Loading image audit...</div>;
        const sum = imagesData.summary || {};
        return (
            <div className="flex-col flex gap-4 mt-4 mb-10">
                <div className="grid grid-cols-4 gap-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-xs uppercase text-slate-500 font-bold tracking-wider">Total Images</div><div className="text-2xl font-black mt-1 text-slate-200">{sum.total_images}</div></div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-xs uppercase text-slate-500 font-bold tracking-wider">Missing Alt Text</div><div className="text-2xl font-black mt-1 text-red-400">{sum.missing_alt}</div></div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-xs uppercase text-slate-500 font-bold tracking-wider">With Lazy Loading</div><div className="text-2xl font-black mt-1 text-green-400">{sum.lazy_loading?.lazy || 0}</div></div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-xs uppercase text-slate-500 font-bold tracking-wider">Missing Lazy Loading</div><div className="text-2xl font-black mt-1 text-yellow-400">{sum.lazy_loading?.not_lazy || 0}</div></div>
                </div>

                <h3 className="text-lg font-bold text-slate-200 mt-4 border-b border-slate-800 pb-2">Images Missing Alt Attributes</h3>
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto max-h-[500px]">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-slate-950 text-slate-400 font-medium border-b border-slate-800 sticky top-0">
                            <tr><th className="px-4 py-2">Found On Page</th><th className="px-4 py-2">Image Source (src)</th><th className="px-4 py-2">Format</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {imagesData.images_missing_alt?.map((m: any, i: number) => (
                                <tr key={i} className="hover:bg-slate-800/50">
                                    <td className="px-4 py-2 text-slate-400 truncate max-w-[300px]" title={m.page_url}>{m.page_url?.replace(/^https?:\/\/[^/]+/, '')}</td>
                                    <td className="px-4 py-2 text-indigo-400 truncate max-w-[400px]" title={m.src}>{m.src}</td>
                                    <td className="px-4 py-2 text-slate-500 uppercase">{m.format || 'Unknown'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <Header />
            {activeTab === 'pages' && <PagesTab />}
            {activeTab === 'issues' && <IssuesTab />}
            {activeTab === 'canonical' && <CanonicalTab />}
            {activeTab === 'images' && <ImagesTab />}
        </div>
    );
};
