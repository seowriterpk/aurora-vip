
export enum IssueSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO',
}

export interface Issue {
  id: string;
  type: string;
  severity: IssueSeverity;
  message: string;
  description: string;
  recommendation: string;
}

export interface ImageAsset {
  src: string;
  alt: string;
  title: string | null;
  width: string | null;
  height: string | null;
  loading: string | null;
  isExternal: boolean;
}

export interface SchemaData {
  type: string;
  raw: string; // JSON string
  isValid: boolean;
  error?: string;
}

export interface RedirectStep {
  url: string;
  status: number;
}

export interface InternalLink {
  url: string;
  text: string;
  htmlSnippet: string; // The raw <a href="...">...</a> snippet
  redirectChain?: RedirectStep[]; // Array of redirects followed
  targetCanonical?: string; // Captured from target page if accessible
  finalStatus?: number; // Final HTTP status of target
}

export interface DeepLinkAuditIssue {
  sourceUrl: string;
  htmlLocation: string;
  offendingLink: string;
  observedTarget: string;
  targetCanonical: string;
  finalCanonical: string;
  redirectChainReadable: string; // e.g., "301 /a -> 301 /b -> 200 /c"
  severity: IssueSeverity;
  exactFixSnippet: string;
  isTemplateFix?: boolean;
}

export interface PageData {
  url: string;
  status: number;
  loadTime: number; // ms
  size: number; // bytes (approx)

  // Content Metrics
  wordCount: number;
  textRatio: number; // 0 to 100
  contentHash: string; // For duplicate detection
  domNodeCount: number; // DOM Complexity

  // Meta
  title: string | null;
  description: string | null;
  h1: string | null;
  h2s: string[];
  h3s: string[];
  canonical: string | null;
  metaRobots: string | null;
  viewport: string | null;
  charset: string | null;

  // International & Pagination
  hreflangs: { lang: string; url: string }[];
  relNext: string | null;
  relPrev: string | null;

  // Social
  ogTitle: string | null;
  ogImage: string | null;
  twitterCard: string | null;

  // Technical
  analyticsId: string | null;
  deprecatedTags: string[];
  emailsFound: string[];
  schemas: SchemaData[];

  // Assets
  images: ImageAsset[];
  scriptCount: number;
  cssCount: number;
  inlineCssCount: number;

  // Links
  internalLinks: InternalLink[];
  externalLinks: string[];
  unsafeAnchorCount: number;

  // Calculated Metrics (Post-Crawl)
  inRank: number; // Internal PageRank (0-10)
  inlinksCount: number;

  // Audit Results
  issues: Issue[];
  linkAuditIssues?: DeepLinkAuditIssue[]; // Specific deep link issues

  // Flags
  isIndexable: boolean;
  depth: number;

  redirectChain?: RedirectStep[];
}

export interface CrawlStats {
  pagesCrawled: number;
  queueLength: number;
  currentDepth: number;
  startTime: number;
  endTime: number | null;
  status: 'IDLE' | 'CRAWLING' | 'ANALYZING' | 'PAUSED' | 'COMPLETED' | 'ERROR';
}

export interface CrawlSettings {
  maxDepth: number;
  maxPages: number;
  crawlSpeed: number; // delay in ms
  ignoreRobotsTxt: boolean;
  proxyUrl: string; // CORS proxy
  userAgent: string;
  concurrency: number; // Number of parallel requests
}

export const DEFAULT_SETTINGS: CrawlSettings = {
  maxDepth: 3,
  maxPages: 50,
  crawlSpeed: 100, // Reduced default delay for speed
  ignoreRobotsTxt: true,
  proxyUrl: 'https://api.codetabs.com/v1/proxy?quest=',
  userAgent: 'AURORA-X-Bot/3.0',
  concurrency: 5, // Default concurrency
};