
import React, { useState } from 'react';
import { PageData, Issue, IssueSeverity } from '../types';
import { AlertTriangle, AlertOctagon, Info, CheckCircle, X, Sparkles, Key, Code, Eye, FileText, Share2, Image as ImageIcon, Braces, Link as LinkIcon } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface IssueDetailsProps {
    page: PageData;
    onClose: () => void;
}

const SeverityIcon = ({ severity }: { severity: IssueSeverity }) => {
    switch (severity) {
        case IssueSeverity.CRITICAL: return <AlertOctagon className="w-5 h-5 text-red-500" />;
        case IssueSeverity.HIGH: return <AlertTriangle className="w-5 h-5 text-orange-500" />;
        case IssueSeverity.MEDIUM: return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
        case IssueSeverity.LOW: return <Info className="w-5 h-5 text-blue-500" />;
        default: return <Info className="w-5 h-5 text-slate-400" />;
    }
};

export const IssueDetails: React.FC<IssueDetailsProps> = ({ page, onClose }) => {
    const [activeTab, setActiveTab] = useState<'ISSUES' | 'IMAGES' | 'SCHEMA' | 'LINKS'>('ISSUES');
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
    const [loadingAi, setLoadingAi] = useState(false);
    const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
    const [showKeyInput, setShowKeyInput] = useState(false);

    const handleAiFix = async (issue: Issue) => {
        if (!apiKey) {
            setShowKeyInput(true);
            return;
        }
        setLoadingAi(true);
        try {
            const ai = new GoogleGenAI({ apiKey });
            const prompt = `SEO Technical Audit. URL: ${page.url}. Issue: ${issue.message} (${issue.description}). Provide technical fix code.`;
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash-latest', contents: prompt });
            setAiAnalysis(response.text);
        } catch (error) {
            setAiAnalysis("Error generating AI fix.");
        } finally {
            setLoadingAi(false);
        }
    };

    const saveKey = (key: string) => {
        setApiKey(key);
        localStorage.setItem('gemini_api_key', key);
        setShowKeyInput(false);
    }

    return (
        <div className="fixed inset-y-0 right-0 w-full md:w-[700px] bg-slate-900 border-l border-slate-700 shadow-2xl transform transition-transform duration-300 overflow-y-auto z-50 flex flex-col">
            <div className="p-6 pb-0 flex-shrink-0">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-2xl font-bold text-white">Audit Details</h2>
                            <span className={`text-xs px-2 py-0.5 rounded font-bold ${page.inRank >= 5 ? 'bg-green-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>InRank: {page.inRank}</span>
                        </div>
                        <p className="text-slate-400 text-sm break-all font-mono">{page.url}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-800 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('ISSUES')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'ISSUES' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'}`}
                    >
                        Issues ({page.issues.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('LINKS')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'LINKS' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'}`}
                    >
                        <LinkIcon className="w-3 h-3" /> Links ({page.internalLinks.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('IMAGES')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'IMAGES' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'}`}
                    >
                        <ImageIcon className="w-3 h-3" /> Images ({page.images.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('SCHEMA')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'SCHEMA' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'}`}
                    >
                        <Braces className="w-3 h-3" /> Schema ({page.schemas.length})
                    </button>
                </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
                {activeTab === 'ISSUES' && (
                    <div className="space-y-6">
                        {/* Metric Cards */}
                        <div className="grid grid-cols-4 gap-2 mb-2">
                            <div className="bg-slate-950 p-2 rounded border border-slate-800 flex flex-col items-center">
                                <span className="text-[10px] text-slate-500 uppercase">Words</span>
                                <span className="font-mono text-lg text-slate-200">{page.wordCount}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800 flex flex-col items-center">
                                <span className="text-[10px] text-slate-500 uppercase">DOM</span>
                                <span className={`font-mono text-lg ${page.domNodeCount > 1500 ? 'text-orange-400' : 'text-slate-200'}`}>{page.domNodeCount}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800 flex flex-col items-center">
                                <span className="text-[10px] text-slate-500 uppercase">Inlinks</span>
                                <span className="font-mono text-lg text-slate-200">{page.inlinksCount}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800 flex flex-col items-center">
                                <span className="text-[10px] text-slate-500 uppercase">Load</span>
                                <span className={`font-mono text-lg ${page.loadTime > 1000 ? 'text-red-400' : 'text-green-400'}`}>{page.loadTime}ms</span>
                            </div>
                        </div>

                        {/* AI Key */}
                        {showKeyInput && (
                            <div className="bg-indigo-900/20 p-4 rounded-lg mb-4 border border-indigo-500/50">
                                <input type="password" placeholder="Gemini API Key..." className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white mb-2" onChange={(e) => setApiKey(e.target.value)} value={apiKey} />
                                <button onClick={() => saveKey(apiKey)} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded w-full">Save Key</button>
                            </div>
                        )}

                        <div className="space-y-3">
                            {page.issues.length === 0 && <p className="text-slate-500 text-sm text-center py-8">No issues found on this page.</p>}
                            {page.issues.map((issue, idx) => (
                                <div key={idx} className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <SeverityIcon severity={issue.severity} />
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <h4 className="text-slate-200 font-medium text-sm">{issue.message}</h4>
                                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide opacity-80 ${issue.severity === IssueSeverity.CRITICAL ? 'bg-red-900 text-red-200' : issue.severity === IssueSeverity.HIGH ? 'bg-orange-900 text-orange-200' : 'bg-blue-900 text-blue-200'}`}>{issue.severity}</span>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-1">{issue.description}</p>
                                            <div className="mt-2 text-xs text-slate-500 border-l-2 border-slate-700 pl-2">Fix: {issue.recommendation}</div>
                                            <button onClick={() => handleAiFix(issue)} disabled={loadingAi} className="mt-3 flex items-center text-[10px] text-indigo-400 hover:text-indigo-300"><Sparkles className="w-3 h-3 mr-1" />{loadingAi ? "Thinking..." : "AI Fix Recommendation"}</button>
                                            {aiAnalysis && !loadingAi && <div className="mt-2 p-3 bg-indigo-950/30 border border-indigo-500/30 rounded text-xs text-indigo-200 relative"><X className="w-3 h-3 absolute top-2 right-2 cursor-pointer" onClick={() => setAiAnalysis(null)} /><pre className="whitespace-pre-wrap font-sans">{aiAnalysis}</pre></div>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'LINKS' && (
                    <div className="space-y-6">
                        {page.linkAuditIssues && page.linkAuditIssues.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-red-400 font-bold flex gap-2 items-center"><AlertTriangle className="w-5 h-5" /> {page.linkAuditIssues.length} Offending Internal Links</h3>
                                {page.linkAuditIssues.map((issue, i) => (
                                    <div key={i} className="bg-slate-900 border border-red-900/50 rounded-lg p-4 space-y-3 relative">
                                        {issue.isTemplateFix && <span className="absolute top-2 right-2 bg-purple-900 text-purple-200 text-[10px] px-2 py-0.5 rounded uppercase font-bold">Template Fix</span>}

                                        <div className="grid grid-cols-1 gap-3 text-xs">
                                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                                                <span className="text-slate-500 uppercase block text-[10px] mb-1">HTML Location (Snippet)</span>
                                                <code className="text-slate-300 font-mono break-all">{issue.htmlLocation}</code>
                                            </div>

                                            <div className="bg-red-950/20 p-2 rounded border border-red-900/30">
                                                <span className="text-red-500/70 uppercase block text-[10px] mb-1">Offending Link</span>
                                                <span className="text-red-400 font-mono break-all">{issue.offendingLink}</span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                                                    <span className="text-slate-500 uppercase block text-[10px] mb-1">Redirect Chain / Status</span>
                                                    <span className="text-slate-300 font-mono break-all">{issue.redirectChainReadable}</span>
                                                </div>
                                                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                                                    <span className="text-slate-500 uppercase block text-[10px] mb-1">Observed Target</span>
                                                    <span className="text-slate-300 font-mono break-all">{issue.observedTarget}</span>
                                                </div>
                                            </div>

                                            {(issue.targetCanonical && issue.targetCanonical !== issue.offendingLink) && (
                                                <div className="bg-orange-950/20 p-2 rounded border border-orange-900/30">
                                                    <span className="text-orange-500/70 uppercase block text-[10px] mb-1 font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Canonical Mismatch Warning</span>
                                                    <div className="text-orange-300">Target canonical is: <span className="font-mono bg-orange-900/40 px-1 rounded">{issue.targetCanonical}</span></div>
                                                    <div className="text-orange-300 mt-1">Final Canonical (Use This): <span className="font-mono bg-orange-900/40 px-1 rounded">{issue.finalCanonical}</span></div>
                                                </div>
                                            )}

                                            <div className="bg-green-950/20 p-3 rounded border border-green-900/30">
                                                <span className="text-green-500/70 uppercase block text-[10px] mb-1 font-bold">Exact Fix (Copy/Paste)</span>
                                                <span className="text-green-300/80 mb-2 block">Replace with:</span>
                                                <code className="text-green-400 font-mono break-all bg-green-950/50 p-2 rounded block">{issue.exactFixSnippet}</code>
                                            </div>

                                            <div className="flex gap-2">
                                                <a href={issue.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded text-[10px] transition-colors"><Eye className="w-3 h-3" /> Preview Source</a>
                                                <a href={new URL(issue.offendingLink, issue.sourceUrl).toString()} target="_blank" rel="noreferrer" className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded text-[10px] transition-colors"><LinkIcon className="w-3 h-3" /> Preview Target</a>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="space-y-2 mt-8">
                            <div className="text-xs text-slate-400">All outgoing internal links:</div>
                            {page.internalLinks.length === 0 ? <p className="text-slate-500 text-sm">No internal links found.</p> : (
                                <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-900 text-slate-400 font-medium">
                                            <tr>
                                                <th className="px-3 py-2">Anchor Text</th>
                                                <th className="px-3 py-2">Target URL</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {page.internalLinks.map((link, i) => (
                                                <tr key={i} className="hover:bg-slate-800/50">
                                                    <td className="px-3 py-2 text-slate-300 font-medium truncate max-w-[150px]" title={link.text}>{link.text}</td>
                                                    <td className="px-3 py-2 text-slate-400 font-mono truncate max-w-[200px]" title={link.url}>{link.url}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'IMAGES' && (
                    <div className="space-y-4">
                        <div className="text-xs text-slate-400 mb-2">Analyzing {page.images.length} images for SEO tags, dimensions, and formats.</div>
                        {page.images.length === 0 ? <p className="text-slate-500">No images found.</p> : (
                            <div className="grid grid-cols-1 gap-3">
                                {page.images.map((img, i) => (
                                    <div key={i} className="bg-slate-950 border border-slate-800 p-3 rounded flex gap-3 items-start">
                                        <div className="w-16 h-16 bg-slate-900 flex items-center justify-center rounded overflow-hidden flex-shrink-0">
                                            <img src={img.src} alt="" className="max-w-full max-h-full opacity-50" onError={(e) => (e.currentTarget.src = 'https://placehold.co/64x64?text=ERR')} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs text-slate-300 font-mono truncate">{img.src.split('/').pop()}</p>
                                                {!img.src.match(/\.(webp|avif)$/i) && !img.src.startsWith('data:') && <span className="text-[9px] bg-orange-900 text-orange-200 px-1 rounded">LEGACY FMT</span>}
                                                {img.src.startsWith('http:') && <span className="text-[9px] bg-red-900 text-red-200 px-1 rounded">INSECURE</span>}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 mt-2">
                                                <div>
                                                    <span className="text-[10px] text-slate-500 block uppercase">Alt Text</span>
                                                    {img.alt ? (
                                                        <span className={`text-xs ${img.alt.length > 100 ? 'text-orange-400' : 'text-slate-300'}`}>{img.alt}</span>
                                                    ) : (
                                                        <span className="text-xs text-red-500 font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Missing</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 block uppercase">Dimensions</span>
                                                    {img.width && img.height ? (
                                                        <span className="text-xs text-slate-300">{img.width} x {img.height}</span>
                                                    ) : (
                                                        <span className="text-xs text-orange-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Missing (CLS)</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'SCHEMA' && (
                    <div className="space-y-4">
                        <div className="text-xs text-slate-400 mb-2">Analyzing structured data (JSON-LD) for Programmatic SEO entities.</div>
                        {page.schemas.length === 0 ? (
                            <div className="bg-slate-950 border border-slate-800 p-8 rounded text-center text-slate-500">
                                <Braces className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>No JSON-LD Schema found.</p>
                                <p className="text-xs mt-1 text-slate-600">Consider adding BreadcrumbList, Article, or Product schema.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {page.schemas.map((s, i) => (
                                    <div key={i} className={`bg-slate-950 border rounded-lg p-3 ${s.isValid ? 'border-slate-800' : 'border-red-900'}`}>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm font-bold text-indigo-400">{s.type}</span>
                                            {s.isValid ? <span className="text-[10px] bg-green-900 text-green-300 px-2 py-0.5 rounded">VALID</span> : <span className="text-[10px] bg-red-900 text-red-200 px-2 py-0.5 rounded">INVALID</span>}
                                        </div>
                                        {s.error && <div className="text-xs text-red-400 mb-2 font-mono bg-red-950/30 p-2 rounded">{s.error}</div>}
                                        <pre className="text-[10px] text-slate-400 font-mono overflow-x-auto bg-slate-900 p-2 rounded">
                                            {s.raw}
                                        </pre>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
};
