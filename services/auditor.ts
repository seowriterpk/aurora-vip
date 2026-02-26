
import { PageData, Issue, IssueSeverity } from '../types';

export const analyzePage = (page: PageData): Issue[] => {
  const issues: Issue[] = [];
  const addIssue = (
    id: string, 
    type: string, 
    severity: IssueSeverity, 
    msg: string, 
    desc: string, 
    rec: string
  ) => {
    issues.push({ id, type, severity, message: msg, description: desc, recommendation: rec });
  };

  // --- 1. RESPONSE CODES ---
  if (page.status === 0) {
    addIssue('network-err', 'Response', IssueSeverity.CRITICAL, 'Crawler Blocked / Network Fail', 
      'The crawler could not access this page. The site likely blocks automated traffic or proxies.', 'Try a different proxy in Settings, or check if the site is online.');
  } else if (page.status >= 400 && page.status < 500) {
    addIssue(`client-${page.status}`, 'Response', IssueSeverity.HIGH, `Client Error ${page.status}`, 
      `Page returned ${page.status}.`, 'Restore page or redirect.');
  } else if (page.status >= 500) {
    addIssue(`server-${page.status}`, 'Response', IssueSeverity.CRITICAL, `Server Error ${page.status}`, 
      'Server crashed processing request.', 'Check server logs.');
  }

  if (page.status !== 200) return issues;

  // --- 2. URL & PROGRAMMATIC STRUCTURE ---
  if (page.url.includes('_')) {
    addIssue('url-underscore', 'URL', IssueSeverity.LOW, 'Underscores in URL', 'Google prefers hyphens.', 'Use hyphens (-) instead.');
  }
  if (/[A-Z]/.test(page.url)) {
    addIssue('url-uppercase', 'URL', IssueSeverity.MEDIUM, 'Uppercase in URL', 'URLs are case-sensitive on many servers.', 'Lowercase all URLs.');
  }
  
  // Programmatic: Parameter Check
  if ((page.url.match(/\?/g) || []).length > 0 && page.url.length > 100) {
      addIssue('complex-params', 'URL', IssueSeverity.MEDIUM, 'Complex Query Parameters', 'URL is long and contains parameters.', 'Use cleaner URLs for programmatic pages.');
  }

  // --- 3. TITLE & DESCRIPTION ---
  if (!page.title) {
    addIssue('missing-title', 'Meta', IssueSeverity.HIGH, 'Missing Title', 'No <title> tag found.', 'Add a unique title.');
  } else {
    if (page.title.length < 10) addIssue('short-title', 'Meta', IssueSeverity.LOW, 'Title Too Short', `Title is ${page.title.length} chars.`, 'Aim for 30-60 chars.');
    if (page.title.length > 60) addIssue('long-title', 'Meta', IssueSeverity.MEDIUM, 'Title Too Long', `Title is ${page.title.length} chars.`, 'Truncate below 60 chars.');
    if (page.h1 && page.title === page.h1) addIssue('title-h1-dup', 'Meta', IssueSeverity.LOW, 'Title equals H1', 'Title and H1 are identical.', 'Optimize Title for SERP and H1 for user context.');
    
    // Keyword stuffing check
    const words = page.title.split(' ');
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    if (words.length > 5 && uniqueWords.size < words.length * 0.6) {
         addIssue('title-stuffing', 'Meta', IssueSeverity.HIGH, 'Title Keyword Stuffing', 'Repetitive words detected.', 'Write natural titles.');
    }
  }

  if (!page.description) {
    addIssue('missing-desc', 'Meta', IssueSeverity.MEDIUM, 'Missing Meta Description', 'No description found.', 'Add meta description for CTR.');
  } else if (page.description.length > 160) {
    addIssue('long-desc', 'Meta', IssueSeverity.LOW, 'Description Too Long', `Length: ${page.description.length}.`, 'Keep under 160 chars.');
  }

  // --- 4. CONTENT QUALITY ---
  if (page.wordCount < 200) {
    addIssue('thin-content', 'Content', IssueSeverity.HIGH, 'Thin Content', `Only ${page.wordCount} words found.`, 'Add more substantial content to rank.');
  }
  if (page.textRatio < 10) {
    addIssue('low-text-ratio', 'Content', IssueSeverity.LOW, 'Low Text-to-HTML Ratio', `Ratio is ${page.textRatio}%. Code bloat detected.`, 'Clean up HTML, reduce scripts/inline CSS.');
  }
  
  // Programmatic: DOM Bloat
  if (page.domNodeCount > 1500) {
      addIssue('dom-bloat', 'Performance', IssueSeverity.MEDIUM, 'Excessive DOM Size', `Found ${page.domNodeCount} nodes.`, 'Reduce DOM complexity (< 1500 nodes) for rendering performance.');
  }

  // --- 5. HEADINGS ---
  if (!page.h1) {
    addIssue('missing-h1', 'Content', IssueSeverity.HIGH, 'Missing H1', 'No H1 tag.', 'Add exactly one H1.');
  } else if (page.h1.length > 70) {
    addIssue('long-h1', 'Content', IssueSeverity.LOW, 'H1 Too Long', 'H1 is very long.', 'Keep H1 concise.');
  }
  
  if (page.h2s.length === 0 && page.h3s.length > 0) {
    addIssue('skipped-heading', 'Structure', IssueSeverity.MEDIUM, 'Skipped Heading Level', 'Page has H3s but no H2s.', 'Maintain strict H1 -> H2 -> H3 hierarchy.');
  }

  // --- 6. INDEXATION & TECHNICAL ---
  if (!page.canonical) {
    addIssue('missing-canonical', 'Indexation', IssueSeverity.MEDIUM, 'Missing Canonical', 'No canonical tag.', 'Add self-referencing canonical.');
  } else if (page.canonical !== page.url) {
    const normUrl = page.url.endsWith('/') ? page.url.slice(0, -1) : page.url;
    const normCanon = page.canonical.endsWith('/') ? page.canonical.slice(0, -1) : page.canonical;

    // Check if the difference is just casing or slug
    let urlPath = '';
    let canonPath = '';
    try {
        urlPath = new URL(page.url).pathname;
        canonPath = new URL(page.canonical).pathname;
    } catch(e) {}

    if (normUrl === normCanon) {
        addIssue('canonical-slash', 'Indexation', IssueSeverity.HIGH, 'Trailing Slash Inconsistency', 
        `Canonical ${page.canonical} differs only by slash.`, 'Enforce trailing slash strategy.');
    } else if (urlPath && canonPath && urlPath.toLowerCase() === canonPath.toLowerCase() && urlPath !== canonPath) {
        addIssue('canonical-casing', 'Indexation', IssueSeverity.HIGH, 'URL Casing Issue', 
        `Accessed via "${urlPath}" but canonical is "${canonPath}".`, 'Ensure internal links use correct casing.');
    } else {
        addIssue('canonicalized', 'Indexation', IssueSeverity.INFO, 'Canonicalized', `Points to ${page.canonical}.`, 'Check if intentional.');
    }
  }

  // Programmatic: Pagination
  if (page.url.match(/page\/\d+/) || page.url.match(/p=\d+/)) {
      if (!page.relPrev && !page.relNext) {
          addIssue('missing-pagination', 'Structure', IssueSeverity.MEDIUM, 'Pagination Tags Missing', 'Page looks paginated but lacks rel="next/prev".', 'Add pagination tags.');
      }
  }

  // International
  if (page.hreflangs.length > 0) {
      // check self reference
      const hasSelf = page.hreflangs.some(h => h.url === page.url || h.url === page.url + '/' || h.url + '/' === page.url);
      if (!hasSelf) {
          addIssue('missing-self-hreflang', 'International', IssueSeverity.MEDIUM, 'Missing Self-Ref Hreflang', 'Hreflang tags found but no self-reference.', 'Add self-referencing hreflang tag.');
      }
  }

  // --- 7. IMAGE SEO (VISUAL/STOCK SITES) ---
  let missingAltCount = 0;
  let missingDimsCount = 0;
  let largeImgCount = 0;
  let oldFormatCount = 0;
  let missingTitleCount = 0;

  page.images.forEach(img => {
    // Skip tracking pixels
    if (img.src.includes('pixel') || img.src.includes('analytics')) return;

    if (!img.alt || img.alt.trim() === '') missingAltCount++;
    else if (img.alt.length > 125) addIssue('long-alt', 'Images', IssueSeverity.LOW, 'Alt Text Too Long', 'Alt text > 125 chars.', 'Keep alt text concise.');

    if (!img.width || !img.height) missingDimsCount++;
    
    // Heuristic: WebP/AVIF check
    if (!img.src.match(/\.(webp|avif|svg)$/i) && !img.src.startsWith('data:')) {
         oldFormatCount++;
    }

    if (!img.title) missingTitleCount++;

    // Protocol check
    if (page.url.startsWith('https') && img.src.startsWith('http:')) {
        addIssue('mixed-content-img', 'Security', IssueSeverity.HIGH, 'Insecure Image', `Image loaded over HTTP: ${img.src}`, 'Use HTTPS for assets.');
    }
  });

  if (missingAltCount > 0) addIssue('missing-alt', 'Images', IssueSeverity.MEDIUM, 'Missing Alt Text', `${missingAltCount} images lack alt text.`, 'Add descriptive alt text.');
  if (missingDimsCount > 0) addIssue('cls-risk', 'Images', IssueSeverity.HIGH, 'Missing Dimensions (CLS)', `${missingDimsCount} images lack width/height.`, 'Add width/height to prevent layout shifts.');
  if (oldFormatCount > 2) addIssue('legacy-format', 'Images', IssueSeverity.LOW, 'Legacy Image Formats', `${oldFormatCount} images are not WebP/AVIF.`, 'Serve images in modern formats.');
  if (missingTitleCount > 5) addIssue('missing-img-title', 'Images', IssueSeverity.INFO, 'Missing Image Titles', 'Many images lack title attributes.', 'Add title attributes for better UX.');

  // --- 8. SCHEMA.ORG ---
  if (page.schemas.length === 0) {
      addIssue('missing-schema', 'Schema', IssueSeverity.LOW, 'No Structured Data', 'No JSON-LD found.', 'Add Schema (Article, Product, Breadcrumb) for rich snippets.');
  } else {
      page.schemas.forEach(s => {
          if (!s.isValid) {
              addIssue('invalid-schema', 'Schema', IssueSeverity.CRITICAL, 'Invalid JSON-LD', `Parse Error: ${s.error}`, 'Fix JSON syntax errors in schema.');
          }
      });
  }

  // --- 9. SECURITY & PERFORMANCE ---
  if (!page.viewport) {
    addIssue('no-viewport', 'Technical', IssueSeverity.CRITICAL, 'Missing Viewport', 'Mobile responsiveness issues.', 'Add viewport meta tag.');
  }
  
  if (page.unsafeAnchorCount > 0) {
      addIssue('unsafe-target', 'Security', IssueSeverity.MEDIUM, 'Unsafe Cross-Origin Links', `${page.unsafeAnchorCount} links use target="_blank" without rel="noopener".`, 'Add rel="noopener" to external links.');
  }

  if (page.inlineCssCount > 20) {
      addIssue('inline-css', 'Performance', IssueSeverity.LOW, 'Excessive Inline CSS', `${page.inlineCssCount} elements with style attribute.`, 'Move styles to external CSS files.');
  }

  if (page.loadTime > 2000) {
    addIssue('slow-response', 'Performance', IssueSeverity.MEDIUM, 'Slow Response', `TTFB ${page.loadTime}ms.`, 'Optimize server.');
  }

  // --- 9. DEEP LINK AUDIT (INTERNAL LINKS) ---
  // We check every internal link found on this page for potential redirect triggers or legacy patterns.
  
  const legacyPatterns = [
      { pattern: /\.php/i, name: 'Legacy PHP Extension', fix: 'Remove .php extension' },
      { pattern: /\/country\//i, name: 'Old Folder Structure (/country/)', fix: 'Update to root or new structure' },
      { pattern: /\/category\//i, name: 'Old Folder Structure (/category/)', fix: 'Update to root or new structure' },
      { pattern: /search\.php/i, name: 'Legacy Search Parameter', fix: 'Use /search?q=...' },
  ];

  // Helper for hash generation
  const simpleHash = (str: string): string => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
  };

  page.internalLinks.forEach(link => {
      let issueFound = false;
      
      // 1. Check for Uppercase (Case Sensitivity)
      try {
          const urlObj = new URL(link.url);
          if (urlObj.pathname !== urlObj.pathname.toLowerCase()) {
              addIssue(
                  `case-sensitive-link-${simpleHash(link.url)}`,
                  'Link Audit',
                  IssueSeverity.HIGH,
                  'Case Sensitivity Issue',
                  `Link to "${link.url}" contains uppercase letters.`,
                  `Change link on this page to lowercase: "${link.url.toLowerCase()}" to prevent redirects.`
              );
              issueFound = true;
          }
      } catch(e) {}

      // 2. Check for Legacy Patterns
      if (!issueFound) { // Avoid double reporting if possible, or report both
          for (const p of legacyPatterns) {
              if (p.pattern.test(link.url)) {
                  addIssue(
                      `legacy-link-${simpleHash(link.url)}`,
                      'Link Audit',
                      IssueSeverity.HIGH,
                      p.name,
                      `Link points to legacy path: "${link.url}"`,
                      `Update internal link on this page. ${p.fix}.`
                  );
              }
          }
      }
  });

  return issues;
};
