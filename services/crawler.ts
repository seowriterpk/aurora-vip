
import { PageData, CrawlSettings, ImageAsset, SchemaData, InternalLink } from '../types';
import { analyzePage } from './auditor';

// Helper to normalize URLs
const normalizeUrl = (url: string): string => {
  let u = url.trim();
  // Auto-prepend protocol if missing
  if (!u.match(/^https?:\/\//i)) {
    u = 'https://' + u;
  }
  try {
    const urlObj = new URL(u);
    urlObj.hash = ''; // Remove fragments
    return urlObj.toString();
  } catch (e) {
    return '';
  }
};

// Simple DJB2 hash for content fingerprinting
const simpleHash = (str: string): string => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

// Helper to check if URL is a resource/file that shouldn't be crawled as a page
const isResourceUrl = (url: string): boolean => {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const extensions = [
      // Images
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff', '.avif',
      // Documents
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.zip', '.rar', '.7z', '.gz',
      // Media
      '.mp4', '.mp3', '.avi', '.mov', '.wav', '.webm', '.ogg',
      // Code/Styles/Data
      '.css', '.js', '.json', '.xml', '.rss', '.atom', '.map',
      // Fonts
      '.woff', '.woff2', '.ttf', '.eot', '.otf'
    ];
    return extensions.some(ext => pathname.endsWith(ext));
  } catch (e) { return false; }
};

interface QueueItem {
  url: string;
  depth: number;
}

export class Crawler {
  private visited = new Set<string>();
  private queue: QueueItem[] = [];
  private settings: CrawlSettings;
  private isRunning = false;
  private onPageCrawled: (page: PageData) => void;
  private onComplete: () => void;

  private activeRequests = 0;

  constructor(
    settings: CrawlSettings,
    onPageCrawled: (page: PageData) => void,
    onComplete: () => void
  ) {
    this.settings = settings;
    this.onPageCrawled = onPageCrawled;
    this.onComplete = onComplete;
  }

  start(startUrl: string) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.visited.clear();
    this.activeRequests = 0;
    const normalized = normalizeUrl(startUrl);
    if (!normalized) {
      alert("Invalid Start URL");
      this.stop();
      return;
    }
    this.queue = [{ url: normalized, depth: 0 }];
    this.processQueue();
  }

  stop() {
    this.isRunning = false;
    this.onComplete();
  }

  private async processQueue() {
    if (!this.isRunning) return;

    // Check completion condition: No active requests and empty queue
    if (this.activeRequests === 0 && this.queue.length === 0) {
      this.stop();
      return;
    }

    // Check limits
    if (this.visited.size >= this.settings.maxPages) {
      // If we hit max pages, wait for active requests to finish then stop
      if (this.activeRequests === 0) {
        this.stop();
      }
      return;
    }

    // Spawn workers up to concurrency limit
    while (this.activeRequests < this.settings.concurrency && this.queue.length > 0 && this.isRunning) {
      const item = this.queue.shift();
      if (!item) break;

      if (this.visited.has(item.url)) {
        continue;
      }

      if (item.depth > this.settings.maxDepth) {
        continue;
      }

      this.visited.add(item.url);
      this.activeRequests++;

      // Process in background (no await here to allow parallelism)
      this.crawlPage(item).finally(() => {
        this.activeRequests--;
        // Add a small delay before next batch to respect rate limits slightly
        setTimeout(() => {
          this.processQueue();
        }, this.settings.crawlSpeed);
      });
    }
  }

  private async crawlPage(item: QueueItem) {
    const startTime = performance.now();

    // Define Proxy Fallback Strategy
    // Prioritize the user's configured proxy first
    const proxies = [
      // 1. Local PHP Proxy (Works on Hostinger & Simulated in Dev)
      // We use window.location.origin to point to the same domain
      `${window.location.origin}/proxy.php?url=`,

      // 2. User Configured Proxy
      this.settings.proxyUrl,

      // 3. Fallbacks
      'https://api.allorigins.win/raw?url=',      // Very stable
      'https://corsproxy.io/?',                   // Robust
      'https://api.codetabs.com/v1/proxy?quest=', // Good but strict
      'https://thingproxy.freeboard.io/fetch/',   // Fallback
      'https://cors-get-proxy.sirjosh.workers.dev/?url=', // Another option
      'DIRECT_FETCH'                              // Try without proxy as last resort (if CORS allows)
    ].filter(p => !!p);

    // Deduplicate proxies
    const uniqueProxies = [...new Set(proxies)];

    let rawHtml = '';
    let status = 0;
    let fetchSuccess = false;
    let redirectChain: any[] = [];

    // Try proxies in order
    for (const proxyBase of uniqueProxies) {
      if (fetchSuccess) break;

      let proxyUrl = '';

      if (proxyBase === 'DIRECT_FETCH') {
        proxyUrl = item.url;
      } else {
        // Smart encoding: Some proxies expect encoded params, others (like ThingProxy) expect path appending
        if (proxyBase.includes('thingproxy') || proxyBase.includes('corsproxy.io')) {
          proxyUrl = `${proxyBase}${item.url}`;
        } else {
          proxyUrl = `${proxyBase}${encodeURIComponent(item.url)}`;
        }
      }

      const MAX_RETRIES = 2; // Retries per proxy

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

          const headers: Record<string, string> = {
            'Cache-Control': 'no-cache'
          };

          // If direct fetch, we might need to be careful with headers
          // But generally, standard fetch doesn't let us set unsafe headers anyway.

          const response = await fetch(proxyUrl, {
            signal: controller.signal,
            headers: headers
          });
          clearTimeout(timeoutId);

          status = response.status;

          if (status === 429) {
            throw new Error('Rate Limited');
          }

          // Content Type Check
          const contentType = response.headers.get('content-type') || '';

          try {
            const chainStr = response.headers.get('x-proxy-redirect-chain');
            if (chainStr) redirectChain = JSON.parse(chainStr);
          } catch (e) { }

          if (status === 200 && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
            await response.text();
            return;
          }

          rawHtml = await response.text();

          // Check for Proxy-specific error messages
          if (rawHtml.includes('Could not fetch URL') ||
            rawHtml.includes('Access to the requested resource is forbidden') ||
            (rawHtml.includes('Bad request, valid format is') && rawHtml.includes('codetabs.com'))) {
            throw new Error('Proxy failed to fetch target');
          }

          fetchSuccess = true;
          break; // Break retry loop
        } catch (error: any) {
          console.warn(`Proxy ${proxyBase} failed for ${item.url} (Attempt ${attempt}): ${error.message}`);

          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
    }

    if (!fetchSuccess) {
      console.error(`All proxies failed for ${item.url}`);
      // Log a synthetic "Network Error" page so the user knows it failed
      const failData: PageData = this.createFailedPageData(item.url, 0);
      this.onPageCrawled(failData);
      return;
    }

    const loadTime = Math.round(performance.now() - startTime);
    const size = new Blob([rawHtml]).size;

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    // --- Deep Extraction ---

    // 1. Content & Structure
    const bodyText = doc.body ? doc.body.innerText : '';
    const cleanText = bodyText.replace(/\s+/g, ' ').trim();
    const wordCount = cleanText.length > 0 ? cleanText.split(' ').length : 0;
    const textRatio = size > 0 ? Math.round((cleanText.length / rawHtml.length) * 100) : 0;
    const contentHash = simpleHash(cleanText);
    const domNodeCount = doc.getElementsByTagName('*').length;

    // 2. Meta Headers
    const title = doc.querySelector('title')?.innerText.trim() || null;
    const description = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || null;
    const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || null;
    const charset = doc.characterSet || doc.inputEncoding;

    // 3. Header Structure
    const h1 = doc.querySelector('h1')?.innerText.trim() || null;
    const h2s = Array.from(doc.querySelectorAll('h2')).map(el => el.innerText.trim()).filter(Boolean);
    const h3s = Array.from(doc.querySelectorAll('h3')).map(el => el.innerText.trim()).filter(Boolean);

    // 4. Canonicals, Robots, Pagination, Hreflang
    const canonicalLink = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || null;
    const metaRobots = doc.querySelector('meta[name="robots"]')?.getAttribute('content') || null;
    const relNext = doc.querySelector('link[rel="next"]')?.getAttribute('href') || null;
    const relPrev = doc.querySelector('link[rel="prev"]')?.getAttribute('href') || null;

    const hreflangs = Array.from(doc.querySelectorAll('link[rel="alternate"][hreflang]')).map(el => ({
      lang: el.getAttribute('hreflang') || '',
      url: el.getAttribute('href') || ''
    }));

    // Resolve Canonical
    let absoluteCanonical = null;
    if (canonicalLink) {
      try {
        absoluteCanonical = new URL(canonicalLink, item.url).toString();
      } catch (e) {
        absoluteCanonical = canonicalLink;
      }
    }

    // 5. Social Tags
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || null;
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;
    const twitterCard = doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content') || null;

    // 6. Schema.org Extraction
    const schemas: SchemaData[] = [];
    const scriptTags = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
    scriptTags.forEach(script => {
      const content = script.textContent || '';
      try {
        const json = JSON.parse(content);
        schemas.push({
          type: json['@type'] || 'Unknown',
          raw: JSON.stringify(json, null, 2),
          isValid: true
        });
      } catch (e) {
        schemas.push({
          type: 'Invalid JSON',
          raw: content,
          isValid: false,
          error: (e as Error).message
        });
      }
    });

    // 7. Assets & Images (Deep)
    const images: ImageAsset[] = Array.from(doc.querySelectorAll('img')).map(img => {
      const src = img.getAttribute('src') || '';
      let isExternal = false;
      try { isExternal = new URL(src, item.url).hostname !== new URL(item.url).hostname; } catch (e) { }

      return {
        src,
        alt: img.getAttribute('alt') || '',
        title: img.getAttribute('title') || null,
        width: img.getAttribute('width') || null,
        height: img.getAttribute('height') || null,
        loading: img.getAttribute('loading') || null,
        isExternal
      };
    });

    const scripts = Array.from(doc.querySelectorAll('script'));
    const cssLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    const inlineCssCount = Array.from(doc.querySelectorAll('[style]')).length;

    // 8. Security & Tech
    let analyticsId = null;
    if (rawHtml.match(/UA-\d+-\d+/)) analyticsId = rawHtml.match(/UA-\d+-\d+/)?.[0] || null;
    else if (rawHtml.match(/G-[A-Z0-9]+/)) analyticsId = rawHtml.match(/G-[A-Z0-9]+/)?.[0] || null;

    const deprecatedTags = [];
    if (doc.querySelector('center')) deprecatedTags.push('<center>');
    if (doc.querySelector('font')) deprecatedTags.push('<font>');
    if (doc.querySelector('marquee')) deprecatedTags.push('<marquee>');

    const emailsFound = (bodyText.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi) || [])
      .filter((v, i, a) => a.indexOf(v) === i);

    const unsafeAnchorCount = Array.from(doc.querySelectorAll('a[target="_blank"]:not([rel*="noopener"])')).length;

    // 9. Link Extraction
    const internalLinks: InternalLink[] = [];
    const externalLinks: string[] = [];

    let baseDomain = '';
    try {
      baseDomain = new URL(item.url).hostname;
    } catch (e) { }

    const linkElements = Array.from(doc.querySelectorAll('a[href]'));
    linkElements.forEach(el => {
      const href = el.getAttribute('href');
      if (!href) return;
      if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      const anchorText = (el as HTMLElement).innerText?.replace(/\s+/g, ' ').trim().slice(0, 50) || 'Empty/Image';

      let htmlSnippet = el.outerHTML || '';
      if (htmlSnippet.length > 250) {
        const match = htmlSnippet.match(/^<a[^>]*>/i);
        if (match) htmlSnippet = match[0] + '...</a>';
        else htmlSnippet = htmlSnippet.substring(0, 250) + '...';
      }

      try {
        const absoluteUrl = new URL(href, item.url).toString();
        const urlObj = new URL(absoluteUrl);

        // Remove hash from crawled links
        urlObj.hash = '';
        const cleanUrl = urlObj.toString();

        // Pre-check for resource extensions to avoid queuing them
        const isResource = isResourceUrl(cleanUrl);

        if (urlObj.hostname === baseDomain) {
          internalLinks.push({ url: cleanUrl, text: anchorText, htmlSnippet });
          // Only add to queue if NOT a resource
          if (!this.visited.has(cleanUrl) && !isResource) {
            this.queue.push({ url: cleanUrl, depth: item.depth + 1 });
          }
        } else {
          externalLinks.push(cleanUrl);
        }
      } catch (e) {
        // Invalid URL
      }
    });

    const pageData: PageData = {
      url: item.url,
      status,
      loadTime,
      size,
      wordCount,
      textRatio,
      contentHash,
      domNodeCount,
      title,
      description,
      h1,
      h2s,
      h3s,
      canonical: absoluteCanonical,
      metaRobots,
      viewport,
      charset: charset || 'unknown',
      relNext,
      relPrev,
      hreflangs,
      ogTitle,
      ogImage,
      twitterCard,
      analyticsId,
      deprecatedTags,
      emailsFound,
      schemas,
      images,
      scriptCount: scripts.length,
      cssCount: cssLinks.length,
      inlineCssCount,
      internalLinks,
      externalLinks,
      unsafeAnchorCount,
      inRank: 0,
      inlinksCount: 0,
      issues: [],
      isIndexable: status === 200 && !metaRobots?.includes('noindex'),
      depth: item.depth,
      redirectChain,
    };

    pageData.issues = analyzePage(pageData);

    this.onPageCrawled(pageData);
  }

  // Helper to create a page data object for failed requests
  private createFailedPageData(url: string, status: number): PageData {
    const p: PageData = {
      url,
      status,
      loadTime: 0,
      size: 0,
      wordCount: 0,
      textRatio: 0,
      contentHash: '',
      domNodeCount: 0,
      title: null,
      description: null,
      h1: null,
      h2s: [],
      h3s: [],
      canonical: null,
      metaRobots: null,
      viewport: null,
      charset: null,
      relNext: null,
      relPrev: null,
      hreflangs: [],
      ogTitle: null,
      ogImage: null,
      twitterCard: null,
      analyticsId: null,
      deprecatedTags: [],
      emailsFound: [],
      schemas: [],
      images: [],
      scriptCount: 0,
      cssCount: 0,
      inlineCssCount: 0,
      internalLinks: [],
      externalLinks: [],
      unsafeAnchorCount: 0,
      inRank: 0,
      inlinksCount: 0,
      issues: [],
      isIndexable: false,
      depth: 0,
      redirectChain: []
    };
    p.issues = analyzePage(p);
    return p;
  }
}
