const fs = require('fs');
const path = require('path');
const {
  ROUTE_SEO_META,
  getArticles,
  getSoftwareServices,
  buildRouteSeo,
  injectSsrHead
} = require('./seo-helper');

const baseHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
let generatedCount = 0;

function writePreRenderedFile(relFilePath, routeUrl) {
  const seo = buildRouteSeo(routeUrl);
  const rendered = injectSsrHead(baseHtml, seo);
  const absPath = path.join(__dirname, relFilePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, rendered, 'utf8');
  generatedCount++;
}

// 1. Pre-render top-level static & service routes (both <route>.html and <route>/index.html for Vercel cleanUrls + Netlify compatibility)
for (const key of Object.keys(ROUTE_SEO_META)) {
  if (key === 'home') continue;
  const routePath = ROUTE_SEO_META[key].path; // e.g. /services, /warranty, /admin-portal
  const relName = routePath.replace(/^\/+/, '');
  writePreRenderedFile(`${relName}.html`, routePath);
  writePreRenderedFile(path.join(relName, 'index.html'), routePath);
}

// 2. Pre-render all 6 software setup support pages (/software/sw-*)
for (const prod of getSoftwareServices()) {
  if (!prod || !prod.id) continue;
  const routePath = `/software/${prod.id}`;
  const relName = routePath.replace(/^\/+/, '');
  writePreRenderedFile(`${relName}.html`, routePath);
  writePreRenderedFile(path.join(relName, 'index.html'), routePath);
}

// 3. Pre-render all 51 blog routes (/<decoded-slug>/index.html) preserving exact canonical URL
for (const article of getArticles()) {
  if (!article || !article.slug) continue;
  const routePath = `/${article.slug}/`;
  let decodedDir = article.slug;
  try {
    decodedDir = decodeURIComponent(article.slug);
  } catch (e) {}
  writePreRenderedFile(path.join(decodedDir, 'index.html'), routePath);
}

console.log(`Pre-rendered ${generatedCount} static HTML files across all public, service, software, legal, and 51 blog routes.`);
