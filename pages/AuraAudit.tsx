import React, { useState, useEffect, useRef } from 'react';
import { Crosshair, Play, XCircle, Download, FileJson, FileCode, CheckCircle, RefreshCcw } from 'lucide-react';
import { useToast } from '../App';

interface ReportRow {
    source_page: string;
    source_location: string;
    raw_href: string;
    normalized_href: string;
    resolved_url: string;
    status_code: number;
    redirect_chain: string[];
    canonical_url: string;
    error_type: string;
    recommendation: string;
    priority: 'high' | 'medium' | 'low';
}

interface Stats {
    crawled: number;
    pending: number;
    issues: number;
}

export const AuraAudit: React.FC = () => {
    const { showToast } = useToast();
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string>('idle');
    const [progress, setProgress] = useState<Stats>({ crawled: 0, pending: 0, issues: 0 });
    const [report, setReport] = useState<ReportRow[]>([]);
    const [sessionId, setSessionId] = useState<string>('');

    const startAudit = async () => {
        if (!url) return;
        setLoading(true);
        setStatus('initializing');
        setReport([]);
        setProgress({ crawled: 0, pending: 0, issues: 0 });

        try {
            const res = await fetch('/api/aura_audit.php?action=start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const data = await res.json();
            if (data.error) {
                showToast(data.error, 'error');
                setLoading(false);
                setStatus('idle');
                return;
            }

            setSessionId(data.session_id);
            setStatus('running');
            showToast('AURA Audit started...', 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
            setLoading(false);
            setStatus('idle');
        }
    };

    const stopAudit = () => {
        setLoading(false);
        setStatus('idle');
        setSessionId('');
    };

    const fetchProgress = async () => {
        if (!sessionId) return;

        try {
            const res = await fetch(`/api/aura_audit.php?action=status&session_id=${sessionId}`);
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            setProgress(data.stats);

            if (data.status === 'completed') {
                setStatus('completed');
                setLoading(false);
                fetchReport();
            } else if (data.status === 'running') {
                // Trigger next batch
                fetch(`/api/aura_audit.php?action=process&session_id=${sessionId}`).catch(() => { });
            }
        } catch (e: any) {
            console.error(e);
        }
    };

    const fetchReport = async () => {
        if (!sessionId) return;
        try {
            const res = await fetch(`/api/aura_audit.php?action=report&session_id=${sessionId}`);
            const data = await res.json();
            if (data.report) {
                setReport(data.report);
                showToast('Audit report ready!', 'success');
            }
        } catch (e: any) {
            showToast('Failed to load report', 'error');
        }
    };

    // Polling loop for status
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === 'running' && sessionId) {
            interval = setInterval(fetchProgress, 2000); // Check every 2s
            // Trigger first process immediately
            fetch(`/api/aura_audit.php?action=process&session_id=${sessionId}`).catch(() => { });
        }
        return () => clearInterval(interval);
    }, [status, sessionId]);


    const getPriorityColor = (priority: string) => {
        if (priority === 'high') return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
        if (priority === 'medium') return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
        return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    };

    const downloadCsv = () => {
        if (report.length === 0) return;
        const headers = ['Source Page', 'Raw Href', 'Resolved URL', 'Status', 'Error Type', 'Priority', 'Recommendation'];
        const rows = report.map(r => [
            r.source_page, r.raw_href, r.resolved_url, r.status_code.toString(), r.error_type, r.priority, r.recommendation
        ].map(col => `"${col.replace(/"/g, '""')}"`).join(','));

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `aura-audit-${new Date().getTime()}.csv`;
        link.click();
    };

    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Crosshair className="w-7 h-7 text-emerald-500" />
                        AURA Audit
                    </h1>
                    <p className="text-slate-400 mt-1">Smart standalone link-audit engine (No DB needed). Imitates real Googlebot linking behaviors.</p>
                </div>
            </header>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-4">
                    <input
                        type="url"
                        placeholder="https://example.com"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500"
                        disabled={loading && status !== 'completed'}
                    />
                    {status === 'idle' || status === 'completed' ? (
                        <button
                            onClick={startAudit}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            <Play className="w-5 h-5" /> Start Audit
                        </button>
                    ) : (
                        <button
                            onClick={stopAudit}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            <XCircle className="w-5 h-5" /> Stop / Reset
                        </button>
                    )}
                </div>

                {(status === 'running' || status === 'completed') && (
                    <div className="mt-8 flex items-center gap-8 border-t border-slate-800 pt-6">
                        <div className="flex-1">
                            <div className="text-sm text-slate-400 mb-1">Links Crawled:</div>
                            <div className="text-3xl font-bold text-emerald-400">{progress.crawled}</div>
                        </div>
                        <div className="w-px h-12 bg-slate-800"></div>
                        <div className="flex-1">
                            <div className="text-sm text-slate-400 mb-1">Queue Pending:</div>
                            <div className="text-3xl font-bold text-slate-200">{progress.pending}</div>
                        </div>
                        <div className="w-px h-12 bg-slate-800"></div>
                        <div className="flex-1">
                            <div className="text-sm text-slate-400 mb-1">Issues Found:</div>
                            <div className="text-3xl font-bold text-rose-400">{progress.issues}</div>
                        </div>

                        <div className="flex-1 flex justify-end gap-3">
                            <span className={`px-3 py-1.5 rounded-full border text-sm font-medium flex items-center gap-2 ${status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 animate-pulse'}`}>
                                {status === 'completed' ? <CheckCircle className="w-4 h-4" /> : <RefreshCcw className="w-4 h-4 animate-spin" />}
                                {status === 'completed' ? 'Audit Complete' : 'Crawling Live...'}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {report.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                        <h2 className="font-semibold text-lg text-white">Detected SEO Actionables ({report.length})</h2>
                        <div className="flex gap-2">
                            <button onClick={downloadCsv} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md text-sm transition-colors text-slate-300">
                                <Download className="w-4 h-4" /> Export CSV
                            </button>
                            <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md text-sm transition-colors text-slate-300">
                                <FileCode className="w-4 h-4" /> Create Diffs
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-slate-950/50 text-slate-400">
                                    <th className="p-4 font-medium border-b border-slate-800">Source Page</th>
                                    <th className="p-4 font-medium border-b border-slate-800">Raw Href (Found)</th>
                                    <th className="p-4 font-medium border-b border-slate-800">Resolved to</th>
                                    <th className="p-4 font-medium border-b border-slate-800">Error Type</th>
                                    <th className="p-4 font-medium border-b border-slate-800">Priority</th>
                                    <th className="p-4 font-medium border-b border-slate-800 whitespace-nowrap">Recommendation</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {report.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-800/20 transition-colors">
                                        <td className="p-4 text-indigo-400 font-mono text-xs max-w-[200px] truncate" title={item.source_page}>{item.source_page}</td>
                                        <td className="p-4 font-mono text-xs text-rose-300 break-all bg-rose-950/10" title={item.raw_href}>{item.raw_href}</td>
                                        <td className="p-4 font-mono text-xs text-emerald-400 break-all" title={item.resolved_url}>{item.resolved_url} {item.status_code ? `(${item.status_code})` : ''}</td>
                                        <td className="p-4">
                                            <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs">
                                                {item.error_type}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded border text-xs font-semibold capitalize ${getPriorityColor(item.priority)}`}>
                                                {item.priority}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-400 text-xs leading-relaxed max-w-[250px]">
                                            {item.recommendation}
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
