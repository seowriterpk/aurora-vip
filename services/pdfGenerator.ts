import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PageData, CrawlStats, IssueSeverity, Issue } from '../types';

// Define colors
const COLORS = {
  primary: '#2563eb', // Blue 600
  secondary: '#1e293b', // Slate 800
  text: '#334155', // Slate 700
  lightText: '#64748b', // Slate 500
  accent: '#f59e0b', // Amber 500
  bg: '#f8fafc', // Slate 50
  white: '#ffffff',
  critical: '#dc2626', // Red 600
  high: '#ea580c', // Orange 600
  medium: '#d97706', // Amber 600
  low: '#2563eb', // Blue 600
  info: '#64748b', // Slate 500
};

const SEVERITY_COLORS: Record<string, string> = {
  [IssueSeverity.CRITICAL]: COLORS.critical,
  [IssueSeverity.HIGH]: COLORS.high,
  [IssueSeverity.MEDIUM]: COLORS.medium,
  [IssueSeverity.LOW]: COLORS.low,
  [IssueSeverity.INFO]: COLORS.info,
};

export const generatePDF = (pages: PageData[], stats: CrawlStats, targetUrl: string) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;
  let yPos = margin;

  // --- Helper Functions ---

  const addHeader = (title: string) => {
    doc.setFillColor(COLORS.secondary);
    doc.rect(0, 0, pageWidth, 20, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(COLORS.white);
    doc.text('AURORA-X AUDIT', margin, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(title, pageWidth - margin, 13, { align: 'right' });
    yPos = 30;
  };

  const addFooter = (pageNumber: number) => {
    doc.setFontSize(8);
    doc.setTextColor(COLORS.lightText);
    doc.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  };

  const checkPageBreak = (heightNeeded: number) => {
    if (yPos + heightNeeded > pageHeight - margin) {
      doc.addPage();
      addHeader('Continued');
      return true;
    }
    return false;
  };

  // --- Cover Page ---
  doc.setFillColor(COLORS.secondary);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  doc.setTextColor(COLORS.white);
  doc.setFontSize(36);
  doc.setFont('helvetica', 'bold');
  doc.text('SEO & LINK AUDIT', margin, 100);

  doc.setFontSize(18);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.accent);
  doc.text('DEEP SYSTEM ANALYSIS', margin, 115);

  doc.setFontSize(12);
  doc.setTextColor(200, 200, 200);
  doc.text(`Target Site: ${targetUrl}`, margin, 140);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, 150);
  doc.text(`Pages Crawled: ${pages.length}`, margin, 160);

  // --- Page 2: Executive Summary ---
  doc.addPage();
  addHeader('Executive Summary');

  doc.setFontSize(16);
  doc.setTextColor(COLORS.secondary);
  doc.setFont('helvetica', 'bold');
  doc.text('Audit Overview', margin, yPos);
  yPos += 10;

  doc.setFontSize(11);
  doc.setTextColor(COLORS.text);
  doc.setFont('helvetica', 'normal');
  const summary = `This report focuses on critical technical issues, specifically internal link integrity and redirect chains. We analyzed ${pages.length} pages to identify outdated URL patterns (like .php), case sensitivity issues, and broken folder structures that negatively impact SEO and crawl budget.`;
  doc.text(doc.splitTextToSize(summary, pageWidth - (margin * 2)), margin, yPos);
  yPos += 30;

  // Stats Grid
  const statsY = yPos;
  const boxWidth = (pageWidth - (margin * 2) - 10) / 2;

  // Box 1: Link Issues
  const linkIssues = pages.reduce((acc, p) => acc + (p.linkAuditIssues?.length || 0), 0);
  doc.setFillColor(COLORS.bg);
  doc.setDrawColor(COLORS.critical);
  doc.rect(margin, statsY, boxWidth, 40, 'FD');
  doc.setFontSize(24);
  doc.setTextColor(COLORS.critical);
  doc.setFont('helvetica', 'bold');
  doc.text(String(linkIssues), margin + 10, statsY + 25);
  doc.setFontSize(10);
  doc.setTextColor(COLORS.secondary);
  doc.text('Critical Link Errors', margin + 10, statsY + 10);

  // Box 2: Total Issues
  const totalIssues = pages.reduce((acc, p) => acc + p.issues.length, 0);
  doc.setFillColor(COLORS.bg);
  doc.setDrawColor(COLORS.secondary);
  doc.rect(margin + boxWidth + 10, statsY, boxWidth, 40, 'FD');
  doc.setFontSize(24);
  doc.setTextColor(COLORS.secondary);
  doc.text(String(totalIssues), margin + boxWidth + 20, statsY + 25);
  doc.setFontSize(10);
  doc.text('Total Issues Found', margin + boxWidth + 20, statsY + 10);

  yPos += 60;

  // --- Page 3: DEEP LINK AUDIT (The Core Request) ---
  doc.addPage();
  addHeader('Deep Internal Link Audit');

  doc.setFontSize(14);
  doc.setTextColor(COLORS.critical);
  doc.setFont('helvetica', 'bold');
  doc.text('CRITICAL: Internal Link Errors', margin, yPos);
  yPos += 10;

  doc.setFontSize(10);
  doc.setTextColor(COLORS.text);
  doc.setFont('helvetica', 'normal');
  doc.text('The following pages contain internal links to outdated or incorrect URLs. These cause redirects and crawl waste.', margin, yPos);
  yPos += 15;

  // Filter only Link Audit issues
  const allLinkIssues = pages.flatMap(p => p.linkAuditIssues || []);
  const top20Fixes = allLinkIssues.slice(0, 20);

  if (top20Fixes.length === 0) {
    doc.setTextColor(COLORS.secondary);
    doc.text('No critical link structure issues found.', margin, yPos);
  } else {
    // Create a structured table for Link Issues
    autoTable(doc, {
      startY: yPos,
      head: [['Offending Link Details', 'Actionable Fix (Copy/Paste)']],
      body: top20Fixes.map(i => [
        `Source: ${i.sourceUrl}\n\nOffending Link: ${i.offendingLink}\n\nRedirect Chain / Final Target:\n${i.redirectChainReadable || i.observedTarget}\n\nCanonical Mismatch: ${i.targetCanonical !== i.offendingLink ? 'YES' : 'NO'}`,
        `HTML Location:\n${i.htmlLocation}\n\nEXACT FIX:\n${i.exactFixSnippet}`
      ]),
      theme: 'grid',
      headStyles: { fillColor: COLORS.critical, textColor: COLORS.white, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', font: 'courier' },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 'auto' }
      }
    });
    yPos = (doc as any).lastAutoTable.finalY + 20;
  }

  // --- Page 4: Other Technical Issues ---
  doc.addPage();
  addHeader('Other Technical Issues');

  const otherIssuesMap = new Map<string, { count: number, severity: string, rec: string }>();
  pages.forEach(p => {
    p.issues.filter(i => i.type !== 'Link Audit').forEach(i => {
      if (!otherIssuesMap.has(i.message)) {
        otherIssuesMap.set(i.message, { count: 0, severity: i.severity, rec: i.recommendation });
      }
      otherIssuesMap.get(i.message)!.count++;
    });
  });

  const otherIssues = Array.from(otherIssuesMap.entries()).sort((a, b) => b[1].count - a[1].count);

  autoTable(doc, {
    startY: yPos,
    head: [['Issue Type', 'Severity', 'Count', 'Recommendation']],
    body: otherIssues.map(([msg, data]) => [msg, data.severity, data.count, data.rec]),
    theme: 'striped',
    headStyles: { fillColor: COLORS.secondary },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 25 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 'auto' }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        const severity = data.cell.raw as string;
        data.cell.styles.textColor = SEVERITY_COLORS[severity] || COLORS.text;
      }
    }
  });

  // Footer for all pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    if (i > 1 && i <= 2) addHeader('Audit Report'); // Re-add header for pages that didn't get it via checkPageBreak
    addFooter(i);
  }

  doc.save(`Aurora-X_Deep_Audit_${new Date().toISOString().split('T')[0]}.pdf`);
};
