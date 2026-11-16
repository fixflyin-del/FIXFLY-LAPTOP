const fs = require('fs');
const path = require('path');

function safeReadJson(relPath, fallback) {
  try {
    const raw = fs.readFileSync(path.join(__dirname, relPath), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function getArticles() {
  return safeReadJson('migrated_blogs.json', []);
}

function getSoftwareServices() {
  return safeReadJson('data/software_products.json', []);
}

const ROUTE_SEO_META = {
  home: {
    title: "Fixfly Innovations Pvt. Ltd. | Independent Doorstep Laptop, MacBook & PC Repair",
    description: "Fixfly Innovations Pvt. Ltd. is an independent multi-brand doorstep laptop, MacBook, and desktop PC repair & maintenance service across Mumbai, Pune, Bangalore & New Delhi. Up to 6 Months Limited Parts Warranty (T&C apply). Call 9931354354.",
    path: "/"
  },
  services: {
    title: "Doorstep Laptop, MacBook & PC Repair Services | Fixfly Innovations",
    description: "Explore Fixfly's independent doorstep laptop repair, deep thermal cleaning, MacBook diagnostics, desktop repair, and motherboard chip-level services across 6 Indian metro cities.",
    path: "/services"
  },
  "laptop-repair": {
    title: "Doorstep Laptop Repair Service at Home | Fixfly Innovations",
    description: "Independent doorstep laptop repair & hardware diagnostics (screens, batteries, keyboards, hinges, power faults) across Mumbai, Thane, Navi Mumbai, Pune, Bangalore & Delhi NCR.",
    path: "/laptop-repair"
  },
  "macbook-repair": {
    title: "Doorstep Apple MacBook Repair & Diagnostics | Fixfly Innovations",
    description: "Independent MacBook Air & Pro hardware diagnostics, battery replacement, trackpad/keyboard service, and logic board repair across 6 Indian metro cities.",
    path: "/macbook-repair"
  },
  "desktop-repair": {
    title: "Doorstep Desktop PC & Workstation Repair | Fixfly Innovations",
    description: "On-site desktop tower repair, SMPS power testing, RAM/SSD upgrades, and workstation maintenance by experienced Fixfly technicians.",
    path: "/desktop-repair"
  },
  "deep-cleaning": {
    title: "Doorstep Laptop Deep Thermal Cleaning & Repasting | Fixfly Innovations",
    description: "Laptop cooling fan cleaning, dust removal, and thermal paste replacement at your home or office desk starting ₹799.",
    path: "/deep-cleaning"
  },
  software: {
    title: "Software Installation, OS Setup & Troubleshooting Support | Fixfly Innovations",
    description: "Remote and doorstep OS clean install, Office configuration, malware cleanup, and driver troubleshooting using the customer's valid official license.",
    path: "/software"
  },
  products: {
    title: "Fixfly Thermal Paste, Cleaning Kits & Hardware Accessories | Amazon Store",
    description: "Browse Fixfly thermal compound, screen cleaning kits, and laptop cooling accessories on the Fixfly Innovations Amazon India Brand Store.",
    path: "/products"
  },
  support: {
    title: "Customer Support & Booking Help | Fixfly Innovations (9931354354)",
    description: "Contact Fixfly's independent repair support desk (9:00 AM - 9:30 PM daily) for doorstep bookings, warranty claims, and service status updates.",
    path: "/support"
  },
  blog: {
    title: "Laptop & MacBook Repair Guides & Tech Blog | Fixfly Innovations",
    description: "Practical laptop troubleshooting articles, overheating prevention guides, SSD upgrade tips, and city-specific repair insights from Fixfly technicians.",
    path: "/blog"
  },
  about: {
    title: "About Fixfly Innovations Pvt. Ltd. | Independent Multi-City Repair Provider",
    description: "Learn about Fixfly Innovations Pvt. Ltd. (est. 2019, Sion Mumbai Registered Desk), our structured ESD-safe workflow, and our independent multi-brand repair technicians.",
    path: "/about"
  },
  contact: {
    title: "Contact Fixfly Innovations | Helpline 9931354354 & Sion Mumbai Desk",
    description: "Reach Fixfly Innovations Pvt. Ltd. in Sion, Mumbai or book independent doorstep laptop repair in Mumbai, Thane, Navi Mumbai, Pune, Bangalore & Delhi NCR.",
    path: "/contact"
  },
  warranty: {
    title: "Limited Warranty Policy (Up to 6 Months on Parts) | Fixfly Innovations",
    description: "Read Fixfly's transparent limited warranty terms covering replacement parts supplied by Fixfly, exclusions, and claim procedure.",
    path: "/warranty"
  },
  terms: {
    title: "Terms & Conditions, Pricing & Cancellation Policy | Fixfly Innovations",
    description: "Review Fixfly's service terms, upfront diagnostic pricing disclosures, booking cancellation terms, data backup responsibility, and independent service scope.",
    path: "/terms"
  },
  privacy: {
    title: "Privacy Policy & Data Protection | Fixfly Innovations Pvt. Ltd.",
    description: "Understand how Fixfly Innovations Pvt. Ltd. collects, uses, and protects booking contact information and device privacy during service.",
    path: "/privacy"
  },
  "admin-portal": {
    title: "Admin Portal | Fixfly Innovations Pvt. Ltd.",
    description: "Internal management portal for Fixfly Innovations Pvt. Ltd.",
    path: "/admin-portal",
    robots: "noindex, nofollow"
  }
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function findArticleByUrlSlug(rawSlug) {
  if (!rawSlug) return null;
  const trimmed = rawSlug.replace(/^\/+|\/+$/g, '').replace(/^blog\//i, '');
  const lowerTrimmed = trimmed.toLowerCase();
  let decoded = trimmed;
  try { decoded = decodeURIComponent(trimmed); } catch (e) {}
  const lowerDecoded = decoded.toLowerCase();

  return getArticles().find(a => {
    if (!a || !a.slug) return false;
    const s = String(a.slug);
    if (s === trimmed || s.toLowerCase() === lowerTrimmed || s === decoded || s.toLowerCase() === lowerDecoded) return true;
    try {
      const sDec = decodeURIComponent(s);
      if (sDec === decoded || sDec.toLowerCase() === lowerDecoded) return true;
    } catch (e) {}
    return false;
  }) || null;
}

function findSoftwareByUrlSlug(swSlug) {
  if (!swSlug) return null;
  const clean = swSlug.replace(/^\/+|\/+$/g, '').toLowerCase();
  return getSoftwareServices().find(p => {
    if (!p) return false;
    if (p.id && p.id.toLowerCase() === clean) return true;
    if (p.title) {
      const slugTitle = p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (slugTitle === clean) return true;
    }
    return false;
  }) || null;
}

function buildRouteSeo(requestPath) {
  let cleanPath = (requestPath || '/').split('?')[0];
  cleanPath = cleanPath.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
  const noSlash = cleanPath.replace(/^\/+|\/+$/g, '');
  const lower = noSlash.toLowerCase();

  if (!noSlash || lower === 'index') {
    const m = ROUTE_SEO_META.home;
    return {
      title: m.title,
      description: m.description,
      canonicalUrl: 'https://fixfly.in/',
      ogType: 'website',
      robots: 'index, follow',
      schema: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": m.title,
        "description": m.description,
        "url": "https://fixfly.in/"
      }
    };
  }

  // Dedicated software setup service routes: /software/sw-*
  if (lower.startsWith('software/')) {
    const swSlug = noSlash.slice('software/'.length);
    const prod = findSoftwareByUrlSlug(swSlug);
    if (prod) {
      const title = `${prod.title} | Software Setup Support | Fixfly`;
      const description = (prod.description || `${prod.title} with remote or doorstep technical setup assistance from Fixfly Innovations Pvt. Ltd.`).substring(0, 160);
      const canonicalUrl = `https://fixfly.in/software/${prod.id}`;
      return {
        title,
        description,
        canonicalUrl,
        ogType: 'website',
        robots: 'index, follow',
        schema: {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Service",
              "name": prod.title,
              "serviceType": prod.category || "Software Installation & Troubleshooting",
              "description": prod.description || "",
              "provider": {
                "@type": "Organization",
                "name": "Fixfly Innovations Pvt. Ltd.",
                "url": "https://fixfly.in/"
              },
              "areaServed": ["Mumbai", "Thane", "Navi Mumbai", "Pune", "Bangalore", "New Delhi"],
              "url": canonicalUrl
            },
            {
              "@type": "BreadcrumbList",
              "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://fixfly.in/" },
                { "@type": "ListItem", "position": 2, "name": "Software Setup Support", "item": "https://fixfly.in/software" },
                { "@type": "ListItem", "position": 3, "name": prod.title, "item": canonicalUrl }
              ]
            }
          ]
        }
      };
    }
  }

  // Known static & service routes
  const mappedKey = lower === 'buy-products' ? 'products' : lower;
  if (ROUTE_SEO_META[mappedKey]) {
    const m = ROUTE_SEO_META[mappedKey];
    const canonicalUrl = 'https://fixfly.in' + m.path;
    return {
      title: m.title,
      description: m.description,
      canonicalUrl,
      ogType: 'website',
      robots: m.robots || 'index, follow',
      schema: {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebPage",
            "name": m.title,
            "description": m.description,
            "url": canonicalUrl
          },
          {
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://fixfly.in/" },
              { "@type": "ListItem", "position": 2, "name": m.title.split('|')[0].trim(), "item": canonicalUrl }
            ]
          }
        ]
      }
    };
  }

  // Blog article slugs (including percent-encoded UTF-8 slugs)
  const article = findArticleByUrlSlug(noSlash);
  if (article) {
    const fallbackImg = 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=1200&q=80';
    const cleanExcerpt = String(article.excerpt || article.title || '').replace(/<[^>]*>/g, '').trim().substring(0, 160);
    const title = `${article.title} | Fixfly Innovations Pvt. Ltd.`;
    const canonicalUrl = `https://fixfly.in/${article.slug}/`;
    return {
      title,
      description: cleanExcerpt,
      canonicalUrl,
      ogType: 'article',
      robots: 'index, follow',
      schema: {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "BlogPosting",
            "headline": article.title,
            "description": cleanExcerpt,
            "image": article.image || fallbackImg,
            "url": canonicalUrl,
            "publisher": {
              "@type": "Organization",
              "name": "Fixfly Innovations Pvt. Ltd.",
              "url": "https://fixfly.in/"
            }
          },
          {
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://fixfly.in/" },
              { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://fixfly.in/blog" },
              { "@type": "ListItem", "position": 3, "name": article.title, "item": canonicalUrl }
            ]
          }
        ]
      }
    };
  }

  // Unknown SPA path fallback
  const fallbackMeta = ROUTE_SEO_META.home;
  return {
    title: fallbackMeta.title,
    description: fallbackMeta.description,
    canonicalUrl: 'https://fixfly.in/' + noSlash,
    ogType: 'website',
    robots: 'noindex, follow',
    schema: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": fallbackMeta.title,
      "description": fallbackMeta.description,
      "url": 'https://fixfly.in/' + noSlash
    }
  };
}

function injectSsrHead(html, seo) {
  const safeTitle = escapeHtml(seo.title);
  const safeDesc = escapeHtml(seo.description);
  const safeUrl = escapeHtml(seo.canonicalUrl);
  const safeType = escapeHtml(seo.ogType || 'website');
  const safeRobots = escapeHtml(seo.robots || 'index, follow');
  const safeJsonLd = JSON.stringify(seo.schema || {}).replace(/</g, '\\u003c');

  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"\s*>/i, `<meta name="description" content="${safeDesc}">`)
    .replace(/<meta\s+name="robots"\s+content="[^"]*"\s*>/i, `<meta name="robots" content="${safeRobots}">`)
    .replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*>/i, `<link rel="canonical" href="${safeUrl}">`)
    .replace(/<meta\s+property="og:type"\s+content="[^"]*"\s*>/i, `<meta property="og:type" content="${safeType}">`)
    .replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*>/i, `<meta property="og:url" content="${safeUrl}">`)
    .replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*>/i, `<meta property="og:title" content="${safeTitle}">`)
    .replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*>/i, `<meta property="og:description" content="${safeDesc}">`)
    .replace(/<script\s+type="application\/ld\+json"\s+id="dynamic-page-schema">[\s\S]*?<\/script>/i, `<script type="application/ld+json" id="dynamic-page-schema">${safeJsonLd}</script>`);
}

module.exports = {
  ROUTE_SEO_META,
  getArticles,
  getSoftwareServices,
  findArticleByUrlSlug,
  findSoftwareByUrlSlug,
  buildRouteSeo,
  injectSsrHead
};
