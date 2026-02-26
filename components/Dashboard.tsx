import React from 'react';
import { PageData, IssueSeverity } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

interface DashboardProps {
  data: PageData[];
}

const COLORS = {
  success: '#22c55e', // green-500
  warning: '#eab308', // yellow-500
  error: '#ef4444',   // red-500
  info: '#3b82f6',    // blue-500
  slate: '#64748b'    // slate-500
};

export const Dashboard: React.FC<DashboardProps> = ({ data }) => {
  // Metric: Status Codes
  const statusCounts = data.reduce((acc, page) => {
    if (page.status >= 200 && page.status < 300) acc.ok++;
    else if (page.status >= 300 && page.status < 400) acc.redirect++;
    else if (page.status >= 400 && page.status < 500) acc.clientErr++;
    else if (page.status >= 500) acc.serverErr++;
    else acc.blocked++;
    return acc;
  }, { ok: 0, redirect: 0, clientErr: 0, serverErr: 0, blocked: 0 });

  const statusData = [
    { name: '200 OK', value: statusCounts.ok, color: COLORS.success },
    { name: '3xx Redirect', value: statusCounts.redirect, color: COLORS.warning },
    { name: '4xx Error', value: statusCounts.clientErr, color: COLORS.error },
    { name: '5xx Error', value: statusCounts.serverErr, color: '#b91c1c' },
    { name: 'Blocked/0', value: statusCounts.blocked, color: COLORS.slate },
  ].filter(d => d.value > 0);

  // Metric: Word Count Distribution
  const wordCountData = [
    { name: '< 300', value: data.filter(p => p.wordCount < 300).length },
    { name: '300-1000', value: data.filter(p => p.wordCount >= 300 && p.wordCount < 1000).length },
    { name: '1000+', value: data.filter(p => p.wordCount >= 1000).length },
  ].filter(d => d.value > 0);

  // Metric: Issues by Severity
  const issues = data.flatMap(p => p.issues);
  const severityCounts = issues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const severityData = [
    { name: 'Critical', value: severityCounts[IssueSeverity.CRITICAL] || 0, color: '#ef4444' },
    { name: 'High', value: severityCounts[IssueSeverity.HIGH] || 0, color: '#f97316' }, // orange
    { name: 'Medium', value: severityCounts[IssueSeverity.MEDIUM] || 0, color: '#eab308' },
    { name: 'Low', value: severityCounts[IssueSeverity.LOW] || 0, color: '#3b82f6' },
  ].filter(d => d.value > 0);

  // Metric: Link Audit Issues
  const linkAuditIssues = data.flatMap(p => p.linkAuditIssues || []);
  const totalOffendingLinks = linkAuditIssues.length;
  const uniqueSourcePages = new Set(linkAuditIssues.map(i => i.sourceUrl)).size;

  const offendingLinkCounts = linkAuditIssues.reduce((acc, issue) => {
    acc[issue.offendingLink] = (acc[issue.offendingLink] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const top10Offending = Object.entries(offendingLinkCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Chart 1 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <h3 className="text-slate-200 font-semibold mb-4 text-xs uppercase tracking-wider">Response Codes</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                  itemStyle={{ color: '#f1f5f9' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <h3 className="text-slate-200 font-semibold mb-4 text-xs uppercase tracking-wider">Issues by Severity</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tick={false} />
                <Tooltip cursor={{ fill: '#334155', opacity: 0.2 }} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3 - Content Quality */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <h3 className="text-slate-200 font-semibold mb-4 text-xs uppercase tracking-wider">Word Count Distribution</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wordCountData} layout="vertical">
                <XAxis type="number" stroke="#94a3b8" fontSize={10} hide />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={60} />
                <Tooltip cursor={{ fill: '#334155', opacity: 0.2 }} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }} />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Deep Link Audit Summary */}
      {
        totalOffendingLinks > 0 && (
          <div className="bg-slate-900 border border-red-900/50 rounded-xl p-4 shadow-sm mt-2 mb-6">
            <h3 className="text-red-400 font-bold mb-4 flex items-center gap-2">Deep Internal Link Audit Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-950 border border-slate-800 p-3 rounded text-center">
                <div className="text-[10px] text-slate-500 uppercase">Offending Links Found</div>
                <div className="text-2xl font-mono text-red-400">{totalOffendingLinks}</div>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-3 rounded text-center">
                <div className="text-[10px] text-slate-500 uppercase">Impacted Source Pages</div>
                <div className="text-2xl font-mono text-orange-400">{uniqueSourcePages}</div>
              </div>
            </div>

            <h4 className="text-xs text-slate-400 uppercase tracking-wider mb-2">Top 10 Most Common Outdated Links</h4>
            <div className="bg-slate-950 border border-slate-800 rounded overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 font-medium">
                  <tr>
                    <th className="px-3 py-2 w-16 text-center">Count</th>
                    <th className="px-3 py-2">Offending Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {top10Offending.map(([link, count], i) => (
                    <tr key={i} className="hover:bg-slate-800/50">
                      <td className="px-3 py-2 text-center font-bold text-red-400">{count}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{link}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
    </>
  );
};