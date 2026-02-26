import React, { useState } from 'react';
import { Lock, LogIn, ShieldAlert } from 'lucide-react';

export const Login: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/login.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (res.ok) {
                onLogin();
            } else {
                setError('Invalid Master Password');
            }
        } catch (err) {
            setError('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">

                    {/* Header */}
                    <div className="px-8 pt-8 pb-6 border-b border-slate-800/50 text-center">
                        <div className="mx-auto w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 border border-slate-700">
                            <Lock className="w-8 h-8 text-indigo-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">AURORA <span className="text-indigo-500">VIP</span></h1>
                        <p className="text-slate-400 text-sm">Restricted SEO Auditing Engine</p>
                    </div>

                    {/* Form */}
                    <div className="p-8">
                        <form onSubmit={handleSubmit} className="space-y-6">

                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex gap-3 text-red-500 text-sm items-start">
                                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium text-slate-300 mb-1 block">Username</label>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Admin"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 outline-none transition-colors"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-300 mb-1 block">Master Password</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Enter access sequence"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 outline-none transition-colors"
                                        required
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !password || !username}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex justify-center items-center gap-2"
                            >
                                {loading ? (
                                    <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <LogIn className="w-4 h-4" />
                                        Authenticate
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                </div>

                <p className="text-center text-xs text-slate-500 mt-6 font-mono">
                    System Version 9.2-Stable <br /> Hostinger Deployment
                </p>
            </div>
        </div>
    );
};
