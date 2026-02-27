import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Network, Link as LinkIcon, AlertTriangle, Layers, RefreshCw, Code, Type, Globe, Shield, Hash, FileWarning, ArrowRight, Download, FileText, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type TabKey = 'overview' | 'content' | 'indexability' | 'redirects' | 'http' | 'www' | 'case' | 'encoding' | 'php' | 'patterns' | 'redirect_pages';

export const Sitebulb: React.FC = () => {
    const [searchParams] = useSearchParams();
    const crawlId = searchParams.get('crawl_id');

    const [insightData, setInsightData] = useState<any>(null);
    const [auditData, setAuditData] = useState<any>(null);
    const [contentData, setContentData] = useState<any>(null);
    const [indexabilityData, setIndexabilityData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>('overview');

    useEffect(() => {
        if (!crawlId) return;
        setLoading(true);
        Promise.all([
            fetch(`/api/reports/insights.php?crawl_id=${crawlId}`, { credentials: 'include' }).then(r => r.json()),
            fetch(`/api/reports/redirect_audit.php?crawl_id=${crawlId}`, { credentials: 'include' }).then(r => r.json()),
            fetch(`/api/reports/content_audit.php?crawl_id=${crawlId}`, { credentials: 'include' }).then(r => r.json()),
            fetch(`/api/reports/indexability_report.php?crawl_id=${crawlId}`, { credentials: 'include' }).then(r => r.json()),
        ])
            .then(([insights, audit, content, indexability]) => {
                if (!insights.error) setInsightData(insights);
                if (!audit.error) setAuditData(audit);
                if (!content.error) setContentData(content);
                if (!indexability.error) setIndexabilityData(indexability);
            })
            .catch(e => console.error("Load error", e))
            .finally(() => setLoading(false));
    }, [crawlId]);

    if (!crawlId) return (
        <div className="flex flex-col items-center justify-center mt-20">
            <div className="p-8 text-center text-slate-400 max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
                <AlertTriangle className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">Select a Project First</h3>
                <p className="text-sm mb-6 text-slate-500">Select an active project from the dashboard to view the audit reports.</p>
                <a href="/" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors inline-block">Return to Dashboard</a>
            </div>
        </div>
    );

    if (loading) return <div className="p-8 flex items-center justify-center gap-3 text-slate-500"><div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /> Analyzing site data...</div>;

    const s = auditData?.summary || {};

    const tabs: { key: TabKey; label: string; icon: any; count?: number }[] = [
        { key: 'overview', label: 'Overview', icon: Layers },
        { key: 'content', label: 'Content Audit', icon: FileText, count: (contentData?.thin_pages?.length || 0) + (contentData?.duplicate_titles?.length || 0) },
        { key: 'indexability', label: 'Indexability', icon: Activity, count: indexabilityData?.soft_404s?.length || 0 },
        { key: 'redirects', label: 'Redirect Links', icon: RefreshCw, count: s.redirect_links },
        { key: 'http', label: 'HTTP Links', icon: Shield, count: s.http_links },
        { key: 'www', label: 'WWW Links', icon: Globe, count: s.www_links },
        { key: 'case', label: 'Case Issues', icon: Type, count: s.case_issues },
        { key: 'encoding', label: 'Bad Caps (+)', icon: Hash, count: s.encoding_issues },
        { key: 'php', label: '.php Links', icon: Code, count: s.php_links },
        { key: 'patterns', label: 'Old Patterns', icon: FileWarning, count: s.old_patterns },
        { key: 'redirect_pages', label: 'All Redirects', icon: ArrowRight, count: s.redirect_pages },
    ];

    const depthData = insightData?.depth_distribution?.map((d: any) => ({
        depth: `Level ${d.depth}`, pages: parseInt(d.count)
    })) || [];

    // Reusable source -> bad link table
    const SourceTable = ({ items, badLabel, showSnippet }: { items: any[]; badLabel: string; showSnippet?: boolean }) => (
        items.length === 0 ? (
            <div className="p-6 text-center text-green-500 text-sm font-medium">✓ No issues found. Clean!</div>
        ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-500 sticky top-0 z-10">
                        <tr>
                            <th className="px-3 py-2.5 font-medium w-1/3">Source Page</th>
                            <th className="px-3 py-2.5 font-medium text-red-400 w-1/3">{badLabel}</th>
                            {showSnippet && <th className="px-3 py-2.5 font-medium w-1/3">HTML Evidence</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {items.map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-800/30">
                                <td className="px-3 py-2 text-slate-300 font-mono text-[11px] truncate max-w-xs" title={item.source_url || item.url}>
                                    {(item.source_url || item.url)?.replace(/^https?:\/\/[^/]+/, '')}
                                </td>
                                <td className="px-3 py-2 text-red-400 font-mono text-[11px] truncate max-w-xs" title={item.target_url || item.bad_link}>
                                    {(item.target_url || item.bad_link)?.replace(/^https?:\/\/[^/]+/, '')}
                                </td>
                                {showSnippet && (
                                    <td className="px-3 py-2 text-slate-500 text-[10px] truncate max-w-xs" title={item.html_snippet}>
                                        {item.html_snippet?.substring(0, 100)}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    );

    return (
        <div className="max-w-6xl mx-auto space-y-5 pb-10">
            {/* Header */}
            <div>
                <a href="/" className="text-xs text-slate-500 hover:text-indigo-400 transition-colors">← Dashboard</a>
                <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3">
                        <Network className="w-6 h-6 text-indigo-400" />
                        <h2 className="text-2xl font-bold text-white">Sitebulb Insights</h2>
                    </div>
                    <a href={`/api/export.php?crawl_id=${crawlId}&type=redirect_links`} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-xs font-medium transition-colors">
                        <Download className="w-3.5 h-3.5" /> Export Redirect Links CSV
                    </a>
                </div>
                <p className="text-sm text-slate-400 mt-1">Deep forensic audit covering content duplicates, thin pages, indexability scoring, and a full redirect link scanner.</p>
            </div>

            {/* Summary Cards */}
            {auditData?.summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                        <div className="text-xl font-black text-white">{s.total_internal_links?.toLocaleString()}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Links Scanned</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                        <div className={`text-xl font-black ${s.total_redirect_issues > 0 ? 'text-red-400' : 'text-green-400'}`}>{s.total_redirect_issues}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Redirect Link Issues</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                        <div className={`text-xl font-black ${contentData?.duplicate_titles?.length > 0 ? 'text-orange-400' : 'text-green-400'}`}>{contentData?.duplicate_titles?.length || 0}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Duplicate Titles</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                        <div className={`text-xl font-black ${indexabilityData?.soft_404s?.length > 0 ? 'text-red-400' : 'text-green-400'}`}>{indexabilityData?.soft_404s?.length || 0}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Soft 404 Pages</div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto bg-slate-900 border border-slate-800 rounded-xl p-1">
                {tabs.map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${activeTab === tab.key ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                        <tab.icon className="w-3 h-3" />
                        {tab.label}
                        {tab.count !== undefined && tab.count > 0 && (
                            <span className="bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded text-[9px] font-bold">{tab.count}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">

                {/* OVERVIEW */}
                {activeTab === 'overview' && insightData && (
                    <div className="p-6 space-y-6">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Layers className="w-4 h-4" /> Click Depth Distribution</h3>
                            <div className="h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={depthData}>
                                        <XAxis dataKey="depth" stroke="#475569" fontSize={11} />
                                        <YAxis stroke="#475569" fontSize={11} />
                                        <Tooltip cursor={{ fill: '#1e293b' }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', fontSize: 11 }} />
                                        <Bar dataKey="pages" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Broken Internal Links (4xx/5xx)</h3>
                            <SourceTable items={insightData.broken_internal_links || []} badLabel="Broken Target" showSnippet={false} />
                        </div>
                        {insightData.low_linked_pages?.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Orphan Pages</h3>
                                <div className="bg-slate-950 rounded-lg p-4 space-y-1 max-h-40 overflow-y-auto">
                                    {insightData.low_linked_pages.map((p: any, i: number) => (
                                        <div key={i} className="text-xs font-mono text-amber-400 truncate">{p.url}</div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* CONTENT AUDIT */}
                {activeTab === 'content' && contentData && (
                    <div className="p-6 space-y-8">
                        <div>
                            <h3 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-2 mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-400" /> Duplicate Titles</h3>
                            {contentData.duplicate_titles?.length === 0 ? <p className="text-green-500 text-sm">✓ No duplicate titles found.</p> : (
                                <div className="space-y-4">
                                    {contentData.duplicate_titles.map((dt: any, i: number) => (
                                        <div key={i} className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                            <div className="text-slate-300 font-bold mb-2">"{dt.title}" <span className="text-xs text-orange-400 ml-2 font-normal">({dt.count} pages)</span></div>
                                            <div className="text-xs font-mono text-slate-500 max-h-24 overflow-y-auto">
                                                {dt.urls.split(',').map((u: string, idx: number) => <div key={idx} className="truncate">{u}</div>)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <h3 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-2 mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-400" /> Duplicate Meta Descriptions</h3>
                            {contentData.duplicate_metas?.length === 0 ? <p className="text-green-500 text-sm">✓ No duplicate metas found.</p> : (
                                <div className="space-y-4">
                                    {contentData.duplicate_metas.map((dm: any, i: number) => (
                                        <div key={i} className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                            <div className="text-slate-300 font-bold mb-2 break-words">"{dm.meta_desc}" <span className="text-xs text-orange-400 ml-2 font-normal">({dm.count} pages)</span></div>
                                            <div className="text-xs font-mono text-slate-500 max-h-24 overflow-y-auto">
                                                {dm.urls.split(',').map((u: string, idx: number) => <div key={idx} className="truncate">{u}</div>)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <h3 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-2 mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" /> Thin Content Pages (&lt;100 words)</h3>
                            {contentData.thin_pages?.length === 0 ? <p className="text-green-500 text-sm">✓ No thin content found.</p> : (
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-950 text-slate-500"><tr><th className="px-3 py-2">URL</th><th className="px-3 py-2 text-center">Word Count</th></tr></thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {contentData.thin_pages.map((p: any, i: number) => (
                                            <tr key={i}><td className="px-3 py-2 font-mono text-slate-300 truncate max-w-lg">{p.url}</td><td className="px-3 py-2 text-center text-red-400 font-bold">{p.word_count}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {contentData.near_duplicates?.length > 0 && (
                            <div>
                                <h3 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-2 mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Near-Duplicate Content (Same SimHash)</h3>
                                <div className="space-y-4">
                                    {contentData.near_duplicates.map((nd: any, i: number) => (
                                        <div key={i} className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                            <div className="text-slate-400 text-xs mb-2">Hash: {nd.content_hash} <span className="text-amber-400 ml-2 font-normal">({nd.count} pages)</span></div>
                                            <div className="text-xs font-mono text-slate-300 max-h-24 overflow-y-auto">
                                                {nd.urls.split(',').map((u: string, idx: number) => <div key={idx} className="truncate">{u}</div>)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* INDEXABILITY */}
                {activeTab === 'indexability' && indexabilityData && (
                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-5 gap-4">
                            {indexabilityData.score_distribution?.map((sd: any) => (
                                <div key={sd.score_range} className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
                                    <div className={`text-2xl font-black ${sd.score_range === '90-100 (Excellent)' ? 'text-green-400' : sd.score_range.includes('Good') ? 'text-indigo-400' : sd.score_range.includes('Average') ? 'text-amber-400' : 'text-red-400'}`}>
                                        {sd.count}
                                    </div>
                                    <div className="text-[10px] uppercase text-slate-500 font-bold mt-1">{sd.score_range}</div>
                                </div>
                            ))}
                        </div>

                        {indexabilityData.soft_404s?.length > 0 && (
                            <div>
                                <h3 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-2 mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-red-500" /> Detected Soft 404s
                                </h3>
                                <p className="text-sm text-slate-400 mb-2">Pages returning 200 OK but appearing empty or showing "Not Found" text. Search engines hate these.</p>
                                <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
                                    <thead className="bg-slate-950 text-slate-500"><tr><th className="px-3 py-2">URL</th><th className="px-3 py-2 text-center">Word Count</th></tr></thead>
                                    <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                                        {indexabilityData.soft_404s.map((p: any, i: number) => (
                                            <tr key={i}><td className="px-3 py-2 font-mono text-red-400 truncate max-w-lg">{p.url}</td><td className="px-3 py-2 text-center text-slate-400">{p.word_count}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {indexabilityData.noindex_pages?.length > 0 && (
                            <div>
                                <h3 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-2 mb-4 flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-slate-400" /> Pages with Noindex Directives
                                </h3>
                                <div className="bg-slate-950 rounded-lg p-4 space-y-1 max-h-40 overflow-y-auto font-mono text-xs text-slate-400">
                                    {indexabilityData.noindex_pages.map((p: any, i: number) => <div key={i} className="truncate">{p.url}</div>)}
                                </div>
                            </div>
                        )}

                        {indexabilityData.lowest_scores?.length > 0 && (
                            <div>
                                <h3 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-2 mb-4">Lowest Indexability Scores</h3>
                                <table className="w-full text-left text-xs bg-slate-950/50 rounded-lg overflow-hidden">
                                    <thead className="bg-slate-950 text-slate-500"><tr><th className="px-3 py-2">URL</th><th className="px-3 py-2 text-center">Score</th></tr></thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {indexabilityData.lowest_scores.map((p: any, i: number) => (
                                            <tr key={i}><td className="px-3 py-2 font-mono text-slate-300 truncate max-w-lg">{p.url}</td><td className="px-3 py-2 text-center text-red-400 font-bold">{p.indexability_score} / 100</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* REDIRECT LINKS — The main "Page with redirect" killer */}
                {activeTab === 'redirects' && auditData && (
                    <div>
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-white font-bold">🔴 Internal Links → Redirecting Pages (3xx)</h3>
                            <p className="text-slate-400 text-xs mt-1">These are the EXACT links causing "Page with redirect" in Google Search Console. Fix the SOURCE page to link to the FINAL destination.</p>
                        </div>
                        {auditData.redirect_links?.length === 0 ? (
                            <div className="p-6 text-center text-green-500 text-sm">✓ No redirect-causing links found!</div>
                        ) : (
                            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-950 text-slate-500 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-3 py-2.5">Source Page</th>
                                            <th className="px-3 py-2.5 text-red-400">Outdated Link</th>
                                            <th className="px-3 py-2.5 text-green-400">Redirects To</th>
                                            <th className="px-3 py-2.5 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {auditData.redirect_links.map((item: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-800/30">
                                                <td className="px-3 py-2 text-slate-300 font-mono text-[11px] truncate max-w-[200px]" title={item.source_url}>
                                                    {item.source_url?.replace(/^https?:\/\/[^/]+/, '')}
                                                </td>
                                                <td className="px-3 py-2 text-red-400 font-mono text-[11px] truncate max-w-[200px]" title={item.bad_link}>
                                                    {item.bad_link?.replace(/^https?:\/\/[^/]+/, '')}
                                                </td>
                                                <td className="px-3 py-2 text-green-400 font-mono text-[11px] truncate max-w-[200px]" title={item.redirects_to}>
                                                    {item.redirects_to?.replace(/^https?:\/\/[^/]+/, '')}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                    <span className="bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded text-[10px] font-bold">{item.status_code}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* HTTP LINKS */}
                {activeTab === 'http' && auditData && (
                    <div>
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-white font-bold">🔒 Internal Links Using http:// (Should Be https://)</h3>
                            <p className="text-slate-400 text-xs mt-1">These links use <code className="text-red-400">http://</code> which redirects to <code className="text-green-400">https://</code>. Fix the source to use https directly.</p>
                        </div>
                        <SourceTable items={auditData.http_links || []} badLabel="HTTP Link (Should Be HTTPS)" showSnippet={true} />
                    </div>
                )}

                {/* WWW LINKS */}
                {activeTab === 'www' && auditData && (
                    <div>
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-white font-bold">🌐 Internal Links Using www. (Should Be Non-WWW)</h3>
                            <p className="text-slate-400 text-xs mt-1">These links use <code className="text-red-400">www.example.com</code> which redirects to <code className="text-green-400">example.com</code>.</p>
                        </div>
                        <SourceTable items={auditData.www_links || []} badLabel="WWW Link (Causes Redirect)" showSnippet={true} />
                    </div>
                )}

                {/* CASE ISSUES */}
                {activeTab === 'case' && auditData && (
                    <div>
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-white font-bold">🔤 Uppercase Characters in URL Paths</h3>
                            <p className="text-slate-400 text-xs mt-1">Links like <code className="text-red-400">/country/India</code> redirect to <code className="text-green-400">/country/india</code>. Google counts both as separate URLs.</p>
                        </div>
                        {auditData.case_issues?.length === 0 ? (
                            <div className="p-6 text-center text-green-500 text-sm">✓ No case mismatches found!</div>
                        ) : (
                            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-950 text-slate-500 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-3 py-2.5">Source Page</th>
                                            <th className="px-3 py-2.5 text-red-400">Uppercase Link</th>
                                            <th className="px-3 py-2.5 text-green-400">Correct (Lowercase)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {auditData.case_issues.map((item: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-800/30">
                                                <td className="px-3 py-2 text-slate-300 font-mono text-[11px] truncate max-w-[200px]" title={item.source_url}>
                                                    {item.source_url?.replace(/^https?:\/\/[^/]+/, '')}
                                                </td>
                                                <td className="px-3 py-2 text-red-400 font-mono text-[11px] truncate max-w-[250px]" title={item.target_url}>
                                                    {item.target_url?.replace(/^https?:\/\/[^/]+/, '')}
                                                </td>
                                                <td className="px-3 py-2 text-green-400 font-mono text-[11px] truncate max-w-[250px]" title={item.suggested_fix}>
                                                    {item.suggested_fix?.replace(/^https?:\/\/[^/]+/, '')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ENCODING ISSUES */}
                {activeTab === 'encoding' && auditData && (
                    <div>
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-white font-bold">➕ Plus Signs / Bad URL Encoding</h3>
                            <p className="text-slate-400 text-xs mt-1">Links like <code className="text-red-400">/country/Sri+Lanka</code> should be <code className="text-green-400">/country/sri-lanka</code>. Plus signs create duplicate URLs.</p>
                        </div>
                        <SourceTable items={auditData.encoding_issues || []} badLabel="URL With Bad Encoding" showSnippet={true} />
                    </div>
                )}

                {/* .PHP LINKS */}
                {activeTab === 'php' && auditData && (
                    <div>
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-white font-bold">📄 Old .php URLs Still Linked</h3>
                            <p className="text-slate-400 text-xs mt-1">Links using <code className="text-red-400">/search.php?q=news</code> should be <code className="text-green-400">/search?q=news</code>.</p>
                        </div>
                        <SourceTable items={auditData.php_links || []} badLabel="Old .php Link" showSnippet={true} />
                    </div>
                )}

                {/* OLD PATTERNS */}
                {activeTab === 'patterns' && auditData && (
                    <div>
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-white font-bold">📁 Old Folder-Based URL Patterns</h3>
                            <p className="text-slate-400 text-xs mt-1">Links using deprecated structures like <code className="text-red-400">/country/xxx</code> or <code className="text-red-400">/category/xxx</code>.</p>
                        </div>
                        <SourceTable items={auditData.old_patterns || []} badLabel="Old Pattern Link" showSnippet={true} />
                    </div>
                )}

                {/* ALL REDIRECT PAGES */}
                {activeTab === 'redirect_pages' && auditData && (
                    <div>
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-white font-bold">📋 All Discovered Pages That Return Redirects</h3>
                            <p className="text-slate-400 text-xs mt-1">Every URL that returned 3xx status. These should NOT exist in your sitemap or internal links.</p>
                        </div>
                        {auditData.redirect_pages?.length === 0 ? (
                            <div className="p-6 text-center text-green-500 text-sm">✓ No redirect pages found!</div>
                        ) : (
                            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-950 text-slate-500 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-3 py-2.5 text-red-400">URL (Redirects)</th>
                                            <th className="px-3 py-2.5 text-green-400">Redirects To</th>
                                            <th className="px-3 py-2.5 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {auditData.redirect_pages.map((item: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-800/30">
                                                <td className="px-3 py-2 text-red-400 font-mono text-[11px] truncate max-w-xs" title={item.url}>{item.url}</td>
                                                <td className="px-3 py-2 text-green-400 font-mono text-[11px] truncate max-w-xs" title={item.redirects_to}>{item.redirects_to}</td>
                                                <td className="px-3 py-2 text-center">
                                                    <span className="bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded text-[10px] font-bold">{item.status_code}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
