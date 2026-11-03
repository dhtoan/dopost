import { browserExtensions } from "./extensions.js";
export { browserExtensions } from "./extensions.js";
import { counterPlatforms } from "./counter-platforms.js";
export { counterPlatforms } from "./counter-platforms.js";
import { previewTools } from "./preview-tools.js";
export { previewTools } from "./preview-tools.js";
import { marketingGuides } from "./guides.js";
import { mediaTools } from "./media-tools.js";
export {
  mediaTools,
  imageConversions,
  imageFormats,
  mediaConversionTools,
  mediaToolThumbnailTone,
  videoFormats,
  audioFormats,
} from "./media-tools.js";
export { marketingGuides } from "./guides.js";
import { docsPageCatalog } from "./docs-catalog.js";
import { docsRouteFromPage } from "./docs-route.js";

export { docsRouteFromPage } from "./docs-route.js";

export const marketingSiteUrl = "https://openpo.st";
export const docsBasePath = "/docs";
export const docsSiteUrl = `${marketingSiteUrl}${docsBasePath}`;

export function docsPath(pathname = "/") {
  const normalized = pathname === "/" ? "" : `/${pathname.replace(/^\/+/, "")}`;
  return `${docsBasePath}${normalized}`;
}

export function docsSocialImageKey(route) {
  const routeWithoutBase = route?.startsWith(`${docsBasePath}/`)
    ? route.slice(docsBasePath.length)
    : route === docsBasePath
      ? "/"
      : route;
  const normalized =
    !routeWithoutBase || routeWithoutBase === "/"
      ? "/"
      : `/${routeWithoutBase
          .split("?")[0]
          .split("#")[0]
          .replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "home" : normalized.slice(1).replaceAll("/", "--");
}

export function docsSocialImageUrlForRoute(route) {
  return `${docsSiteUrl}/og/${docsSocialImageKey(route)}.png`;
}

function socialImageUrl(entry) {
  const origin = entry.kind === "docs" ? docsSiteUrl : marketingSiteUrl;
  return `${origin}/og/${entry.key}.png`;
}

const platformNames = [
  ["x", "X"],
  ["mastodon", "Mastodon"],
  ["pixelfed", "Pixelfed"],
  ["peertube", "PeerTube"],
  ["lemmy", "Lemmy"],
  ["piefed", "PieFed"],
  ["bluesky", "Bluesky"],
  ["linkedin", "LinkedIn"],
  ["threads", "Threads"],
  ["facebook", "Facebook Pages"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
  ["pinterest", "Pinterest"],
  ["googlebusiness", "Google Business"],
  ["telegram", "Telegram"],
  ["discord", "Discord"],
  ["devnull", "dev/null"],
];

const toolPages = [
  ...browserExtensions,
  ...previewTools,
  ...mediaTools,
  {
    slug: "social-media-video-editor",
    name: "Social media video editor",
    title: "Free social media video editor - dopost Video Editor",
    description:
      "Record or import footage, edit for four social formats, and export without a watermark.",
  },
  {
    slug: "social-media-image-editor",
    name: "Social media image editor",
    title: "Free social media image editor - dopost Image Editor",
    description: "Create posts, carousel pages, Story slides, and thumbnails in your browser.",
  },
  {
    slug: "multi-platform-character-counter",
    name: "Multi-platform character counter",
    title: "Free social media character counter - dopost",
    description: `Check one draft against the limits and counting rules for ${counterPlatforms.length} social networks.`,
  },
  {
    slug: "post-preview-generator",
    name: "Post preview generator",
    title: "Free social post preview generator - dopost",
    description: "Preview text, links, media, and supported formats before you publish.",
  },
  {
    slug: "thread-splitter",
    name: "Thread splitter",
    title: "Free thread splitter for X, Bluesky & Threads - dopost",
    description:
      "Split a long post into numbered parts within each network's character limit. Review, copy, or continue your thread in dopost.",
  },
  {
    slug: "fediverse-handle-checker",
    name: "Fediverse handle checker",
    title: "Fediverse and Bluesky handle checker - dopost",
    description: "Validate a Fediverse or Bluesky handle, then choose whether to run a live check.",
  },
  {
    slug: "linkedin-text-formatter",
    name: "LinkedIn text formatter",
    title: "Accessible LinkedIn post formatter - dopost",
    description:
      "Clean up spacing, shorten paragraphs, and check length without using fake Unicode styles.",
  },
  {
    slug: "best-time-to-post-calculator",
    name: "Timezone posting planner",
    title: "Free social posting schedule planner - dopost",
    description: "Turn your audience hours and timezone into a weekly posting plan you can reuse.",
  },
  {
    slug: "utm-link-builder",
    name: "UTM link builder",
    title: "Free UTM link builder - dopost",
    description: "Add campaign tags to a link, then copy a clean URL for your social post.",
  },
];

const staticMarketingEntries = [
  {
    path: "/guides",
    key: "guides",
    title: "Guides and tool comparisons - dopost",
    socialTitle: "Make more of your work. Find a better way.",
    description:
      "Practical guides to choosing social tools, writing useful posts, and planning your content.",
    label: "Guides & comparisons",
    kind: "document",
    agentRepresentation: "static",
    agentDiscovery: { membership: "primary" },
    priority: "0.8",
  },
  {
    path: "/comparisons",
    key: "comparisons",
    title: "Compare publishing, image and video tools - dopost",
    socialTitle: "Compare your tools. Choose for the job.",
    description:
      "Compare dopost with Buffer, Postiz, Metricool, Hootsuite, Photoshop, DaVinci Resolve and Premiere Pro. Sourced costs, limits, and reasons to choose each tool.",
    label: "Comparisons",
    kind: "document",
    agentRepresentation: "static",
    agentDiscovery: { membership: "primary" },
    priority: "0.8",
  },
  ...marketingGuides.map((guide) => ({
    path: `/guides/${guide.slug}`,
    key: `guide-${guide.slug}`,
    title: `${guide.question} - dopost`,
    socialTitle: guide.question,
    description: guide.socialDescription,
    label: guide.comparison ? "Tool comparison" : "Content guide",
    kind: "document",
    agentRepresentation: "static",
    agentDiscovery: { membership: "primary" },
    priority: "0.7",
  })),
  {
    path: "/",
    key: "home",
    title: "dopost - The all-in-one content team for solo founders",
    socialTitle: "Your socials, on steroids.",
    description:
      "Create, edit, and schedule social content in dopost. Turn GitHub releases and RSS feeds into drafts with visual workflows, AI, and review steps.",
    label: "The content team for companies of one",
    kind: "home",
    agentRepresentation: "static",
    agentDiscovery: { membership: "primary" },
    priority: "1.0",
  },
  {
    path: "/pricing",
    key: "pricing",
    title: "dopost pricing",
    socialTitle: "A content system that grows with your company.",
    description:
      "Compare dopost Hosted service plans with clear limits for workspaces, accounts, posts, media, and seats.",
    label: "Hosted service plans",
    kind: "workflow",
    agentRepresentation: "static",
    agentDiscovery: { membership: "primary" },
    priority: "0.9",
  },
  {
    path: "/platforms",
    key: "platforms",
    title: "Social platform integrations in dopost",
    socialTitle: "Your business. Your channels.",
    description:
      "Find ideas and tools for your next Instagram, LinkedIn, Facebook, TikTok, or YouTube post. Check which channels work with your account.",
    label: `Explore your social channels`,
    kind: "platforms",
    agentRepresentation: "static",
    agentDiscovery: { membership: "primary" },
    priority: "0.9",
  },
  {
    path: "/tools",
    key: "tools",
    title: "dopost free tools: post previews, threads, image & video editors",
    socialTitle: "Useful social tools. No account required.",
    description:
      "Preview social posts, split threads, format LinkedIn text, edit images and videos, or convert files. Use dopost's free browser tools without an account.",
    label: "dopost free tools",
    kind: "tools-index",
    agentRepresentation: "static",
    agentDiscovery: { membership: "optional" },
    priority: "0.8",
  },
  {
    path: "/faq",
    key: "faq",
    title: "dopost FAQ",
    socialTitle: "A few answers before you start.",
    description:
      "Answers about making content, scheduling posts, your free trial, billing, and account security.",
    label: "Frequently asked questions",
    kind: "document",
    agentRepresentation: "static",
    agentDiscovery: { membership: "primary" },
    priority: "0.7",
  },
  {
    path: "/security",
    key: "security",
    title: "Security controls and responsibilities - dopost",
    socialTitle: "Your accounts. Your control.",
    description:
      "See how dopost encrypts account keys, limits tool access, and protects sign-in sessions.",
    label: "Security",
    kind: "security",
    agentRepresentation: "static",
    agentDiscovery: { membership: "primary" },
    priority: "0.7",
  },
  {
    path: "/trust",
    key: "trust",
    title: "Your data and privacy - dopost",
    socialTitle: "Where your data goes.",
    description:
      "See where dopost Cloud stores your data, which services help run it, and who can access it.",
    label: "Your data in dopost",
    kind: "security",
    agentRepresentation: "static",
    agentDiscovery: { membership: "primary" },
    priority: "0.6",
  },
  {
    path: "/about",
    key: "about",
    title: "About dopost",
    socialTitle: "Why dopost exists and who runs it.",
    description:
      "Meet the maker behind dopost and the idea behind a simpler way to create and schedule content for your business.",
    label: "About dopost",
    kind: "document",
    agentRepresentation: "static",
    agentDiscovery: { membership: "primary" },
    priority: "0.7",
  },
  {
    path: "/contact",
    key: "contact",
    title: "Contact dopost",
    socialTitle: "Contact dopost support or the community.",
    description:
      "Find the right dopost contact for product, account, billing, privacy, security, community, and contribution questions.",
    label: "Contact dopost",
    kind: "document",
    agentRepresentation: "static",
    agentDiscovery: { membership: "primary" },
    priority: "0.6",
  },
  {
    path: "/changelog",
    key: "changelog",
    title: "dopost changelog",
    socialTitle: "What changed in dopost, in plain language.",
    description: "See the latest tools, improvements, and fixes in dopost.",
    label: "Changelog",
    kind: "document",
    agentRepresentation: "static",
    agentDiscovery: { membership: "unlisted" },
    priority: "0.6",
  },
  {
    path: "/privacy",
    key: "privacy",
    title: "Privacy Policy - dopost",
    socialTitle: "dopost privacy policy.",
    description:
      "How dopost collects, uses, shares, protects, exports, and deletes hosted-service data.",
    label: "Legal",
    kind: "document",
    agentRepresentation: "static",
    agentDiscovery: { membership: "unlisted" },
    priority: "0.4",
  },
  {
    path: "/terms",
    key: "terms",
    title: "Terms of Service - dopost",
    socialTitle: "dopost terms of service.",
    description:
      "Terms for hosted accounts, plans, connected networks, publishing, and acceptable use.",
    label: "Legal",
    kind: "document",
    agentRepresentation: "static",
    agentDiscovery: { membership: "unlisted" },
    priority: "0.4",
  },
  {
    path: "/refunds",
    key: "refunds",
    title: "Refund Policy - dopost",
    socialTitle: "dopost refund policy.",
    description:
      "How to cancel, request a refund, report a billing error, and use mandatory consumer rights.",
    label: "Legal",
    kind: "document",
    agentRepresentation: "static",
    agentDiscovery: { membership: "unlisted" },
    priority: "0.4",
  },
];

const platformEntries = platformNames.map(([slug, name]) => ({
  path: `/platforms/${slug}`,
  key: `platform-${slug}`,
  title: `${name} content and scheduling - dopost`,
  socialTitle: name,
  description: `Explore ideas, editing tools, and posting options for your business on ${name}.`,
  label: "Channel guide",
  kind: "platform",
  agentRepresentation: "platform",
  agentDiscovery: { membership: "optional", section: "platforms" },
  subject: name,
  platform: slug,
  priority: "0.7",
}));

const toolEntries = toolPages.map((tool) => ({
  path: `/tools/${tool.slug}`,
  key: `tool-${tool.slug}`,
  title: tool.title,
  socialTitle: tool.name,
  description: tool.description,
  label: "Free browser tool",
  kind: "tool",
  agentRepresentation: "tool",
  agentDiscovery: { membership: "optional", section: "tools" },
  subject: tool.name,
  priority: "0.6",
}));

export const marketingRouteManifest = Object.freeze(
  [...staticMarketingEntries, ...platformEntries, ...toolEntries].map((entry) => {
    const resolved = {
      ...entry,
      id: `marketing:${entry.key}`,
      canonical: canonicalMarketingUrl(entry.path),
      imageAlt: `${entry.socialTitle} dopost social preview.`,
    };
    return { ...resolved, imageUrl: socialImageUrl(resolved) };
  }),
);

export const marketingSocialEntries = marketingRouteManifest;

const prerenderSections = new Set(["/platforms", "/tools", "/guides"]);

export function marketingPrerenderEntries(section) {
  const normalizedSection = normalizeMarketingPath(section);
  if (!prerenderSections.has(normalizedSection)) {
    throw new Error(`Unknown marketing prerender section: ${section}`);
  }
  const prefix = `${normalizedSection}/`;
  return marketingRouteManifest.flatMap((entry) => {
    if (!entry.path.startsWith(prefix)) return [];
    const slug = entry.path.slice(prefix.length);
    return slug && !slug.includes("/") ? [{ slug }] : [];
  });
}

const marketingByPath = new Map(marketingSocialEntries.map((entry) => [entry.path, entry]));

export function normalizeMarketingPath(pathname) {
  if (!pathname || pathname === "/") return "/";
  return `/${pathname
    .split("?")[0]
    .split("#")[0]
    .replace(/^\/+|\/+$/g, "")}`;
}

// Only catalogue-owned public paths are safe analytics dimensions. Unknown
// paths can contain user data and must never be forwarded to analytics.
export function marketingTelemetryPath(pathname) {
  const path = normalizeMarketingPath(pathname);
  return marketingByPath.has(path) ? path : "/unknown";
}

export function canonicalMarketingUrl(pathname) {
  const path = normalizeMarketingPath(pathname);
  return path === "/" ? marketingSiteUrl : `${marketingSiteUrl}${path}`;
}

export function marketingAgentMarkdownUrl(entry) {
  if (!entry.agentDiscovery) return undefined;
  return entry.path === "/" ? `${marketingSiteUrl}/index.md` : `${entry.canonical}.md`;
}

export function resolveMarketingSocial(pathname) {
  const path = normalizeMarketingPath(pathname);
  const exact = marketingByPath.get(path);
  if (exact) return exact;

  const fallback = marketingByPath.get("/");
  const resolved = {
    ...fallback,
    path,
    canonical: canonicalMarketingUrl(path),
  };
  return { ...resolved, imageUrl: socialImageUrl(resolved) };
}

export function docsImageKey(page) {
  return docsSocialImageKey(docsRouteFromPage(page));
}

export function docsSectionForPage(page) {
  const route = docsRouteFromPage(page);
  if (route === "/") return "dopost docs";
  if (route.startsWith("/usage/") || route.startsWith("/guide/what-is")) {
    return "User guide";
  }
  if (route.startsWith("/providers/")) return "Provider guide";
  if (route.startsWith("/installation/")) return "Installation";
  if (route.startsWith("/configuration/")) return "Configuration";
  if (route.startsWith("/operations/")) return "Operations";
  if (route.startsWith("/self-hosting/")) {
    return "Self-hosting";
  }
  if (route.startsWith("/cli/")) return "CLI guide";
  if (route.startsWith("/mcp/")) return "MCP guide";
  if (route.startsWith("/development/")) return "Developer docs";
  if (route.startsWith("/reference/")) return "Reference";
  return "dopost docs";
}

export function docsDescriptionForPage(page) {
  const section = docsSectionForPage(page);
  const descriptions = {
    "dopost docs": "Learn how to create, adapt, schedule, publish, and track content with dopost.",
    "User guide":
      "Use the dopost app to manage drafts, destinations, media, schedules, results, and replies.",
    "Provider guide":
      "Check provider setup, supported formats, limits, permissions, and live-test requirements.",
    Installation: "Install dopost with the deployment path that fits your server or device.",
    Configuration:
      "Configure dopost storage, databases, URLs, providers, updates, and production settings.",
    Operations:
      "Operate dopost with clear health checks, logs, backups, upgrades, and recovery steps.",
    "Self-hosting": "Run dopost as one Go service with SQLite and local media by default.",
    "CLI guide": "Use dopost from a terminal, script, scheduled job, or CI workflow.",
    "MCP guide": "Connect AI tools to dopost without sharing social account credentials.",
    "Developer docs":
      "Understand the dopost architecture, API, tests, adapters, jobs, and release workflow.",
    Reference: "Look up dopost API, CLI, configuration, and deployment details.",
  };
  return descriptions[section];
}

export function resolveDocsSocial({ page, title, description }) {
  const route = docsRouteFromPage(page);
  const cleanTitle = title?.trim() || "dopost documentation";
  const cleanDescription = description?.trim() || docsDescriptionForPage(page);
  const key = docsImageKey(page);

  const resolved = {
    id: `docs:${key}`,
    path: route,
    key,
    title: `${cleanTitle} | dopost Docs`,
    socialTitle: cleanTitle,
    description: cleanDescription,
    label: docsSectionForPage(page),
    kind: "docs",
    canonical: route === "/" ? docsSiteUrl : `${docsSiteUrl}${route}`,
    imageAlt: `${cleanTitle}. dopost documentation social preview.`,
  };
  return { ...resolved, imageUrl: socialImageUrl(resolved) };
}

export const docsSocialEntries = Object.freeze(
  docsPageCatalog.map((entry) => ({
    ...resolveDocsSocial(entry),
    page: entry.page,
    route: entry.route,
    agentRepresentation: entry.agentRepresentation,
    agentDiscovery: entry.agentDiscovery,
    agentCorpus: entry.agentCorpus,
  })),
);

const documentationRoutes = new Set(docsSocialEntries.map((entry) => entry.route));

export function documentationTelemetryPath(pathname) {
  const path = normalizeMarketingPath(pathname);
  const route =
    path === docsBasePath
      ? "/"
      : path.startsWith(`${docsBasePath}/`)
        ? path.slice(docsBasePath.length)
        : path;
  return documentationRoutes.has(route) ? docsPath(route) : `${docsBasePath}/unknown`;
}
