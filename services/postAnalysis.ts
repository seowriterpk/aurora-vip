
import { PageData, Issue, IssueSeverity } from '../types';

export const runPostCrawlAnalysis = (pages: PageData[]): PageData[] => {
    const urlMap = new Map<string, PageData>();
    const contentHashMap = new Map<string, string[]>();
    const inlinksMap = new Map<string, number>();

    // 1. Build Indexes
    pages.forEach(p => {
        urlMap.set(p.url, p);

        // Fingerprint duplicate content
        if (!contentHashMap.has(p.contentHash)) {
            contentHashMap.set(p.contentHash, []);
        }
        contentHashMap.get(p.contentHash)?.push(p.url);

        // Count basic inlinks (using object structure)
        p.internalLinks.forEach(link => {
            const currentCount = inlinksMap.get(link.url) || 0;
            inlinksMap.set(link.url, currentCount + 1);
        });
    });

    return pages.map(p => {
        const newIssues = [...p.issues];

        // A. Duplicate Content Clusters (Programmatic Issue)
        const duplicates = contentHashMap.get(p.contentHash) || [];
        if (duplicates.length > 1) {
            if (p.canonical && p.canonical !== p.url) {
                // Safe: Page is duplicate but canonicalized correctly
            } else {
                // Issue: Duplicate page without canonical pointing elsewhere
                const others = duplicates.filter(d => d !== p.url).slice(0, 3).join(', ');
                newIssues.push({
                    id: 'duplicate-content',
                    type: 'Content',
                    severity: IssueSeverity.HIGH,
                    message: 'Duplicate Content',
                    description: `Identical to ${duplicates.length - 1} other page(s): ${others}...`,
                    recommendation: 'Use canonical tags or 301 redirects.'
                });
            }
        }

        // Deep Link Audit Engine
        const linkAuditIssues: any[] = [];

        // B. Link Consistency & Intelligence (Deep Analysis)
        p.internalLinks.forEach(link => {
            const targetPage = urlMap.get(link.url);

            if (targetPage) {
                let errorDetected = false;
                let severity = IssueSeverity.LOW;
                let message = '';

                // Reconstruct the redirect chain
                const chain = targetPage.redirectChain || [];
                let chainReadable = '';
                if (chain.length > 1) {
                    // If the last step is 200, the previous was 301/302
                    chainReadable = chain.map((step, idx) => {
                        // The last item in our proxy chain gets the final status of the page if it didn't redirect
                        return `${step.status} ${new URL(step.url).pathname + new URL(step.url).search}`;
                    }).join(' → ');
                }

                const isRedirect = chain.length > 1 || (targetPage.status >= 300 && targetPage.status < 400);
                const observedTarget = chain.length > 1 ? chain[chain.length - 1].url : targetPage.url;
                const targetCanonical = targetPage.canonical || observedTarget;

                // Check issues
                if (isRedirect) {
                    errorDetected = true;
                    severity = IssueSeverity.HIGH;
                    message = 'Link to Redirect';
                } else if (link.url !== targetCanonical) {
                    const linkObj = new URL(link.url);
                    const targetObj = new URL(targetCanonical);
                    const linkPath = decodeURIComponent(linkObj.pathname);
                    const targetPath = decodeURIComponent(targetObj.pathname);

                    if (linkPath !== targetPath) {
                        if (linkPath.toLowerCase() === targetPath.toLowerCase()) {
                            errorDetected = true; severity = IssueSeverity.HIGH; message = 'Link Casing Mismatch';
                        } else {
                            errorDetected = true; severity = IssueSeverity.HIGH; message = 'Link Slug Mismatch';
                        }
                    } else if (linkObj.search !== targetObj.search) {
                        errorDetected = true; severity = IssueSeverity.MEDIUM; message = 'Link Parameter Mismatch';
                    } else if (link.url.endsWith('/') !== targetCanonical.endsWith('/')) {
                        errorDetected = true; severity = IssueSeverity.MEDIUM; message = 'Trailing Slash Inconsistency';
                    }
                }

                // Also check for .php manually just in case it doesn't redirect but we still want to flag it
                if (!errorDetected && link.url.endsWith('.php')) {
                    errorDetected = true; severity = IssueSeverity.HIGH; message = 'Legacy PHP Extension';
                }

                if (errorDetected) {
                    // Determine exact fix
                    // Naive approach: string replace the href value
                    // Find href="..." in htmlSnippet
                    let exactFixSnippet = link.htmlSnippet;

                    // Get absolute href or relative href that was used
                    const matchRegex = /href=["']([^"']+)["']/i;
                    const match = link.htmlSnippet.match(matchRegex);

                    if (match) {
                        const originalHref = match[1];
                        // We must determine what the final canonical is (relative or absolute)
                        // Let's just output the targetCanonical for now
                        let replacementUrl = targetCanonical;
                        // If original was relative, try to make replacement relative
                        if (originalHref.startsWith('/')) {
                            replacementUrl = new URL(targetCanonical).pathname + new URL(targetCanonical).search;
                        }
                        exactFixSnippet = exactFixSnippet.replace(matchRegex, `href="${replacementUrl}"`);
                    }

                    linkAuditIssues.push({
                        sourceUrl: p.url,
                        htmlLocation: link.htmlSnippet,
                        offendingLink: link.url,
                        observedTarget: observedTarget,
                        targetCanonical: targetPage.canonical || 'Not Specified',
                        finalCanonical: targetCanonical,
                        redirectChainReadable: chainReadable || `${targetPage.status} ${new URL(link.url).pathname + new URL(link.url).search}`,
                        severity: severity,
                        exactFixSnippet: exactFixSnippet,
                        isTemplateFix: p.url.includes('/category/') || p.url.includes('/country/')
                    });

                    // Also add a generic issue so the main dashboard picks it up
                    newIssues.push({
                        id: `deep-link-${message.replace(/\s+/g, '-').toLowerCase()}`,
                        type: 'Link Audit',
                        severity,
                        message: message,
                        description: `Link "${link.url}" triggers ${chainReadable ? 'redirects' : 'mismatches'}.`,
                        recommendation: `Update link to exactly ${targetCanonical}`
                    });
                }
            }
        });

        // C. Orphan Pages
        const inlinks = inlinksMap.get(p.url) || 0;
        if (inlinks === 0 && p.depth > 0) {
            newIssues.push({
                id: 'orphan-page',
                type: 'Structure',
                severity: IssueSeverity.HIGH,
                message: 'Orphan Page',
                description: 'No internal links point to this page.',
                recommendation: 'Link from relevant content or sitemap.'
            });
        }

        // D. Internal Link Score
        const inRank = Math.min(10, Math.ceil((inlinks / Math.max(1, pages.length * 0.1)) * 10));

        return {
            ...p,
            issues: newIssues,
            inlinksCount: inlinks,
            inRank
        };
    });
};
