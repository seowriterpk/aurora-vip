import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Network, Link as LinkIcon, AlertTriangle, Layers, FileWarning, ArrowRight, RefreshCw, Code, Type } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useToast } from '../App';

type TabKey = 'overview' | 'redirects' | 'php' | 'case' | 'patterns' | 'non200';

export const Sitebulb: React.FC = () => {
    const [searchParams] = useSearchParams();
    const crawlId = searchParams.get('crawl_id');
    const { showToast } = useToast();

    const [insightData, setInsightData] = useState<any>(null);
    const [auditData, setAuditData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>('overview');

    useEffect(() => {
        if (!crawlId) return;
        setLoading(true);

        Promise.all([
            fetch(`/api/reports/insights.php?crawl_id=${crawlId}`, { credentials: 'include' }).then(r => r.json()),
            fetch(`/api/reports/redirect_audit.php?crawl_id=${crawlId}`, { credentials: 'include' }).then(r => r.json()),
        ])
            .then(([insights, audit]) => {
                if (!insights.error) setInsightData(insights);
                if (!audit.error) setAuditData(audit);
            })
            .catch(e => console.error("Failed to load data", e))
            .finally(() => setLoading(false));
    }, [crawlId]);

    if (!crawlId) {
        return (
            <div className="flex flex-col items-center justify-center mt-20 space-y-4">
                <div className="p-8 text-center text-slate-400 max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
                    <AlertTriangle className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-white mb-2">Select a Project First</h3>
                    <p className="text-sm mb-6 text-slate-500">To view Site Architecture & Redirect Audit, select an active project from the dashboard.</p>
                    <a href="/" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors inline-block">Return to Dashboard</a>
                </div>
            </div>
        );
    }

    if (loading) return <div className="p-8 flex items-center justify-center gap-3 text-slate-500"><div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /> Processing site architecture + redirect audit...</div>;

    const tabs: { key: TabKey; label: string; icon: any; count?: number; color: string }[] = [
        { key: 'overview', label: 'Overview', icon: Layers, color: 'indigo' },
        { key: 'redirects', label: 'Redirect Links', icon: RefreshCw, count: auditData?.summary?.redirect_links, color: 'red' },
        { key: 'php', label: '.php Links', icon: Code, count: auditData?.summary?.php_links, color: 'orange' },
        { key: 'case', label: 'Case Issues', icon: Type, count: auditData?.summary?.case_issues, color: 'amber' },
        { key: 'patterns', label: 'Old URL Patterns', icon: FileWarning, count: auditData?.summary?.old_pattern_links, color: 'purple' },
        { key: 'non200', label: 'Non-200 Pages', icon: AlertTriangle, count: auditData?.summary?.non_ok_pages, color: 'rose' },
    ];

    const depthData = insightData?.depth_distribution?.map((d: any) => ({
        depth: `Level ${d.depth}`,
        pages: parseInt(d.count)
    })) || [];

    // Reusable table for source → target link pairs
    const LinkTable = ({ items, label, badLabel }: { items: any[]; label: string; badLabel: string }) => (
        items.length === 0 ? (
            <div className="p-6 bg-slate-950 rounded-lg text-center text-green-500 text-sm font-medium">✓ No {label} found. Clean!</div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-500 sticky top-0">
                        <tr>
                            <th className="px-4 py-3 font-medium">Source Page (Where the bad link lives)</th>
                            <th className="px-4 py-3 font-medium text-red-400">{badLabel}</th>
                            {items[0]?.status_code && <th className="px-4 py-3 font-medium text-center">Status</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {items.map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                                <td className="px-4 py-3 text-slate-300 font-mono truncate max-w-xs" title={item.source_url}>
                                    {item.source_url?.replace(/^https?:\/\/[^/]+/, '') || item.url}
                                </td>
                                <td className="px-4 py-3 text-red-400 font-mono font-bold truncate max-w-md" title={item.target_url || item.url}>
                                    {(item.target_url || item.url)?.replace(/^https?:\/\/[^/]+/, '')}
                                </td>
                                {item.status_code && (
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${item.status_code >= 300 && item.status_code < 400 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>{item.status_code}</span>
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
        <div className="max-w-6xl mx-auto space-y-6 pb-10">
            {/* Header */}
            <div>
                <a href="/" className="text-xs text-slate-500 hover:text-indigo-400 transition-colors">← Dashboard</a>
                <div className="flex items-center gap-3 mt-2">
                    <Network className="w-6 h-6 text-indigo-400" />
                    <h2 className="text-2xl font-bold text-white">Site Architecture & Redirect Audit</h2>
                </div>
                <p className="text-sm text-slate-400 mt-1">Deep analysis of internal links — finds every link that causes redirects, uses old patterns, or has case issues.</p>
            </div>

            {/* Summary Cards */}
            {auditData?.summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                        <div className="text-2xl font-black text-white">{auditData.summary.total_internal_links.toLocaleString()}</div>
                        <div className="text-xs text-slate-500 mt-1">Internal Links Scanned</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                        <div className={`text-2xl font-black ${auditData.summary.total_issues_found > 0 ? 'text-red-400' : 'text-green-400'}`}>{auditData.summary.total_issues_found}</div>
                        <div className="text-xs text-slate-500 mt-1">Total Issues Found</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                        <div className="text-2xl font-black text-amber-400">{auditData.summary.redirect_links}</div>
                        <div className="text-xs text-slate-500 mt-1">Redirect-Causing Links</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                        <div className="text-2xl font-black text-rose-400">{auditData.summary.non_ok_pages}</div>
                        <div className="text-xs text-slate-500 mt-1">Non-200 Pages</div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto bg-slate-900 border border-slate-800 rounded-xl p-1.5">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${activeTab === tab.key ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                    >
                        <tab.icon className="w-3.5 h-3.5" />
                        {tab.label}
                        {tab.count !== undefined && tab.count > 0 && (
                            <span className="bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded text-[10px] font-bold">{tab.count}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                {/* OVERVIEW TAB */}
                {activeTab === 'overview' && insightData && (
                    <div className="p-6 space-y-6">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Layers className="w-4 h-4" /> Click Depth Distribution</h3>
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
                        <div>
                            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Broken Internal Links (4xx/5xx)</h3>
                            <LinkTable items={insightData.broken_internal_links || []} label="broken internal links" badLabel="Broken Target URL" />
                        </div>

                        {/* Orphan Pages */}
                        {insightData.low_linked_pages?.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Orphan Pages (In Sitemap, Not Linked)</h3>
                                <div className="bg-slate-950 rounded-lg p-4 space-y-1 max-h-48 overflow-y-auto">
                                    {insightData.low_linked_pages.map((p: any, i: number) => (
                                        <div key={i} className="text-xs font-mono text-amber-400 truncate" title={p.url}>{p.url}</div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* REDIRECT LINKS TAB */}
                {activeTab === 'redirects' && auditData && (
                    <div>
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-white font-bold">Internal Links Pointing to Redirected Pages (3xx)</h3>
                            <p className="text-slate-400 text-xs mt-1">These links cause "Page with redirect" in Google Search Console. Fix the SOURCE page to link directly to the FINAL destination.</p>
                        </div>
                        <LinkTable items={auditData.redirect_links || []} label="redirect-causing links" badLabel="Link That Redirects (3xx)" />
                    </div>
                )}

                {/* .PHP LINKS TAB */}
                {activeTab === 'php' && auditData && (
                    <div>
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-white font-bold">Internal Links Still Using .php URLs</h3>
                            <p className="text-slate-400 text-xs mt-1">Old URL patterns like <code className="text-orange-400">/search.php?q=news</code> should be replaced with clean URLs like <code className="text-green-400">/search?q=news</code></p>
                        </div>
                        <LinkTable items={auditData.php_links || []} label=".php links" badLabel="Old .php Link" />
                    </div>
                )}

                {/* CASE ISSUES TAB */}
                {activeTab === 'case' && auditData && (
                    <div>
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-white font-bold">Case-Sensitive URL Mismatches (Uppercase in Path)</h3>
                            <p className="text-slate-400 text-xs mt-1">Links like <code className="text-red-400">/country/Indonesia</code> redirect to <code className="text-green-400">/indonesia</code>. Fix the source to use lowercase directly.</p>
                        </div>
                        <LinkTable items={auditData.case_issues || []} label="case mismatches" badLabel="Uppercase Link (Causes Redirect)" />
                    </div>
                )}

                {/* OLD PATTERNS TAB */}
                {activeTab === 'patterns' && auditData && (
                    <div>
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-white font-bold">Old Folder-Based URL Patterns</h3>
                            <p className="text-slate-400 text-xs mt-1">Links using deprecated URL structures like <code className="text-red-400">/country/xxx</code>, <code className="text-red-400">/category/xxx</code>, or <code className="text-red-400">/search.php</code> that should be replaced with clean URLs.</p>
                        </div>
                        <LinkTable items={auditData.old_pattern_links || []} label="old URL patterns" badLabel="Old Pattern Link" />
                    </div>
                )}

                {/* NON-200 PAGES TAB */}
                {activeTab === 'non200' && auditData && (
                    <div>
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-white font-bold">All Non-200 Status Pages Discovered</h3>
                            <p className="text-slate-400 text-xs mt-1">Every page that returned a redirect (3xx), client error (4xx), or server error (5xx). These waste crawl budget.</p>
                        </div>
                        {auditData.non_ok_pages?.length === 0 ? (
                            <div className="p-6 text-center text-green-500 text-sm">✓ All pages returned 200. Perfect!</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-950 text-slate-500 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3">URL</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {auditData.non_ok_pages.map((page: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-800/30">
                                                <td className="px-4 py-3 text-slate-300 font-mono truncate max-w-lg" title={page.url}>{page.url}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${page.status_code >= 300 && page.status_code < 400 ? 'bg-amber-500/15 text-amber-400' : page.status_code >= 400 ? 'bg-red-500/15 text-red-400' : 'bg-slate-700 text-slate-300'}`}>{page.status_code}</span>
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
