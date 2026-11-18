const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildRouteSeo, injectSsrHead } = require('./seo-helper');
const cloudinaryHelper = require('./cloudinary-config');

const CUSTOM_BLOGS_PATH = path.join(__dirname, 'data', 'custom_blogs.json');
const DELETED_BLOGS_PATH = path.join(__dirname, 'data', 'deleted_blogs.json');
const MIGRATED_JSON_PATH = path.join(__dirname, 'migrated_blogs.json');
const MIGRATED_JS_PATH = path.join(__dirname, 'migrated_blogs.js');

function readJsonArraySafe(absPath) {
  try {
    if (!fs.existsSync(absPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeFileAtomic(absPath, content) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const tmp = absPath + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, absPath);
}

function normalizeServerDeletedList(list) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach(item => {
    if (typeof item === 'string' && item.trim()) {
      const slug = item.trim();
      if (!map.has(slug)) map.set(slug, { slug, deletedAt: 1 });
    } else if (item && typeof item === 'object' && item.slug) {
      const slug = String(item.slug).trim();
      const ts = Number(item.deletedAt) || 1;
      const prev = map.get(slug);
      if (!prev || ts > prev.deletedAt) map.set(slug, { slug, deletedAt: ts });
    }
  });
  return Array.from(map.values());
}

function sanitizeServerArticle(art) {
  if (!art || typeof art !== 'object' || !art.slug) return null;
  const slug = String(art.slug).trim().replace(/^\/+|\/+$/g, '').replace(/^blog\//i, '');
  if (!slug) return null;
  return {
    slug,
    title: String(art.title || 'Untitled Article').trim(),
    category: String(art.category || 'Laptop Repair').trim(),
    date: String(art.date || new Date().toISOString().split('T')[0]).trim(),
    image: String(art.image || 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=1200&q=80').trim(),
    excerpt: String(art.excerpt || '').trim(),
    content: String(art.content || '').trim(),
    updatedAt: Number(art.updatedAt) || Date.now(),
    isCustom: true
  };
}

function appendBlogUrlsToSitemap(slugs) {
  const today = new Date().toISOString().split('T')[0];
  ['sitemap.xml', path.join('public', 'sitemap.xml'), path.join('app', 'src', 'main', 'assets', 'sitemap.xml')].forEach(rel => {
    const abs = path.join(__dirname, rel);
    if (!fs.existsSync(abs)) return;
    try {
      let xml = fs.readFileSync(abs, 'utf8');
      let changed = false;
      slugs.forEach(slug => {
        const loc = `https://fixfly.in/${slug}/`;
        if (!xml.includes(`<loc>${loc}</loc>`)) {
          const entry = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
          xml = xml.replace('</urlset>', entry + '</urlset>');
          changed = true;
        }
      });
      if (changed) writeFileAtomic(abs, xml);
    } catch (e) {}
  });
}

function persistBlogsToDisk(customBlogs, deletedSlugs, affectedSlugs) {
  const cleanCustom = [];
  const seenCustom = new Set();
  (Array.isArray(customBlogs) ? customBlogs : []).forEach(item => {
    const clean = sanitizeServerArticle(item);
    if (clean && !seenCustom.has(clean.slug)) {
      seenCustom.add(clean.slug);
      cleanCustom.push(clean);
    }
  });
  const cleanDeleted = normalizeServerDeletedList(deletedSlugs);
  const deletedMap = new Map(cleanDeleted.map(d => [d.slug, d.deletedAt]));

  writeFileAtomic(CUSTOM_BLOGS_PATH, JSON.stringify(cleanCustom, null, 2) + '\n');
  writeFileAtomic(DELETED_BLOGS_PATH, JSON.stringify(cleanDeleted, null, 2) + '\n');

  const existingMigrated = readJsonArraySafe(MIGRATED_JSON_PATH);
  const mergedMap = new Map();
  cleanCustom.forEach(a => {
    const delTs = deletedMap.get(a.slug) || 0;
    if (delTs > (a.updatedAt || 0)) return;
    mergedMap.set(a.slug, a);
  });
  existingMigrated.forEach(a => {
    if (!a || !a.slug) return;
    if (deletedMap.has(a.slug) && !mergedMap.has(a.slug)) return;
    if (!mergedMap.has(a.slug)) mergedMap.set(a.slug, a);
  });

  const mergedArticles = Array.from(mergedMap.values());
  const jsonStr = JSON.stringify(mergedArticles, null, 2) + '\n';
  const jsStr = 'window.WP_MIGRATED_ARTICLES = ' + JSON.stringify(mergedArticles, null, 2) + ';\n';

  writeFileAtomic(MIGRATED_JSON_PATH, jsonStr);
  writeFileAtomic(MIGRATED_JS_PATH, jsStr);
  [path.join('public', 'migrated_blogs.js'), path.join('app', 'src', 'main', 'assets', 'migrated_blogs.js')].forEach(rel => {
    const abs = path.join(__dirname, rel);
    if (fs.existsSync(path.dirname(abs))) {
      try { writeFileAtomic(abs, jsStr); } catch (e) {}
    }
  });

  // Pre-render static HTML pages & update sitemaps for newly published/edited slugs
  const toPrerender = Array.isArray(affectedSlugs) && affectedSlugs.length
    ? affectedSlugs.filter(Boolean)
    : cleanCustom.map(a => a.slug);

  if (toPrerender.length && fs.existsSync(path.join(__dirname, 'index.html'))) {
    try {
      const baseHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      const renderedSlugs = [];
      toPrerender.forEach(slug => {
        if (!mergedMap.has(slug)) return;
        let decodedDir = slug;
        try { decodedDir = decodeURIComponent(slug); } catch (e) {}
        const safeDir = path.normalize(decodedDir).replace(/^(\.\.[/\\])+/, '');
        if (!safeDir || safeDir === '.' || safeDir.includes('..')) return;
        const seo = buildRouteSeo('/' + slug + '/');
        const rendered = injectSsrHead(baseHtml, seo);
        writeFileAtomic(path.join(__dirname, safeDir, 'index.html'), rendered);
        renderedSlugs.push(slug);
      });
      if (renderedSlugs.length) appendBlogUrlsToSitemap(renderedSlugs);
    } catch (e) {}
  }

  return { customBlogs: cleanCustom, deletedSlugs: cleanDeleted, articles: mergedArticles };
}

function getServerCloudinarySettings() {
  const baseCfg = (cloudinaryHelper && cloudinaryHelper.config) || {};
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || baseCfg.cloudName || '').trim();
  const uploadPreset = String(process.env.CLOUDINARY_UPLOAD_PRESET || baseCfg.uploadPreset || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  const folder = String(process.env.CLOUDINARY_FOLDER || baseCfg.folder || 'fixfly').trim() || 'fixfly';
  const hasSigned = Boolean(cloudName && apiKey && apiSecret);
  const hasUnsigned = Boolean(cloudName && uploadPreset);
  return {
    cloudName,
    uploadPreset,
    apiKey,
    apiSecret,
    folder,
    hasSigned,
    hasUnsigned
  };
}

function readJsonRequestBody(req, callback, maxBytes) {
  const limit = maxBytes || (5 * 1024 * 1024);
  let body = '';
  let aborted = false;
  req.on('data', chunk => {
    body += chunk;
    if (body.length > limit) {
      aborted = true;
      callback(new Error('Request payload too large'), null);
      req.destroy();
    }
  });
  req.on('end', () => {
    if (aborted) return;
    if (!body.trim()) return callback(null, {});
    try {
      callback(null, JSON.parse(body));
    } catch (e) {
      callback(e, null);
    }
  });
  req.on('error', err => {
    if (!aborted) callback(err, null);
  });
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
  '.aab': 'application/octet-stream',
  '.apk': 'application/vnd.android.package-archive',
  '.pem': 'application/x-pem-file',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const rawUrlPath = (req.url || '/').split('?')[0];
  let urlPath = rawUrlPath;

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // Cloudinary configuration (public fields only — never returns API secret)
  if (req.method === 'GET' && urlPath === '/api/cloudinary-config') {
    const cfg = getServerCloudinarySettings();
    const payload = {
      configured: cfg.hasSigned || cfg.hasUnsigned,
      mode: cfg.hasSigned ? 'signed' : (cfg.hasUnsigned ? 'unsigned' : 'unconfigured'),
      cloudName: cfg.cloudName,
      uploadPreset: cfg.hasUnsigned ? cfg.uploadPreset : '',
      folder: cfg.folder
    };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(payload));
    return;
  }

  // Cloudinary signed upload signature endpoint (requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)
  if (req.method === 'POST' && urlPath === '/api/cloudinary-sign') {
    readJsonRequestBody(req, (err, payload) => {
      if (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON request body' }));
        return;
      }
      const cfg = getServerCloudinarySettings();
      if (!cfg.hasSigned) {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          ok: false,
          error: 'Cloudinary signed upload secrets are not configured on server yet.'
        }));
        return;
      }
      const timestamp = Math.floor(Date.now() / 1000);
      const reqFolder = String((payload && payload.folder) || cfg.folder)
        .replace(/[^a-zA-Z0-9/_-]/g, '') || cfg.folder;
      const paramsToSign = { folder: reqFolder, timestamp };
      if (payload && typeof payload.public_id === 'string' && payload.public_id.trim()) {
        paramsToSign.public_id = payload.public_id.trim().replace(/[^a-zA-Z0-9/_-]/g, '');
      }
      const serialized = Object.keys(paramsToSign)
        .sort()
        .map(k => `${k}=${paramsToSign[k]}`)
        .join('&');
      const signature = crypto
        .createHash('sha1')
        .update(serialized + cfg.apiSecret)
        .digest('hex');

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify({
        ok: true,
        cloudName: cfg.cloudName,
        apiKey: cfg.apiKey,
        timestamp,
        folder: reqFolder,
        signature
      }));
    });
    return;
  }

  // Lifetime Blog Persistence API (reads/writes data/custom_blogs.json, migrated_blogs.json/.js, static HTML, and sitemap)
  if (req.method === 'GET' && urlPath === '/api/blogs') {
    const customBlogs = readJsonArraySafe(CUSTOM_BLOGS_PATH);
    const deletedSlugs = normalizeServerDeletedList(readJsonArraySafe(DELETED_BLOGS_PATH));
    const articles = readJsonArraySafe(MIGRATED_JSON_PATH);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify({ ok: true, persistedToDisk: true, customBlogs, deletedSlugs, articles }));
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/blogs') {
    readJsonRequestBody(req, (err, payload) => {
      if (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: false, error: err.message || 'Invalid JSON payload' }));
        return;
      }
      const existingCustom = readJsonArraySafe(CUSTOM_BLOGS_PATH);
      const existingDeleted = normalizeServerDeletedList(readJsonArraySafe(DELETED_BLOGS_PATH));
      const customMap = new Map();
      const deletedMap = new Map();

      existingDeleted.forEach(d => deletedMap.set(d.slug, d.deletedAt));
      if (Array.isArray(payload && payload.deletedSlugs)) {
        normalizeServerDeletedList(payload.deletedSlugs).forEach(d => {
          const prev = deletedMap.get(d.slug) || 0;
          if (d.deletedAt >= prev) deletedMap.set(d.slug, d.deletedAt);
        });
      }

      const mergeIntoCustom = (arr) => {
        (Array.isArray(arr) ? arr : []).forEach(item => {
          const clean = sanitizeServerArticle(item);
          if (!clean) return;
          const prev = customMap.get(clean.slug);
          if (!prev || (clean.updatedAt || 0) >= (prev.updatedAt || 0)) {
            customMap.set(clean.slug, clean);
          }
        });
      };

      mergeIntoCustom(existingCustom);
      if (Array.isArray(payload && payload.customBlogs)) {
        mergeIntoCustom(payload.customBlogs);
      }

      const affectedSlugs = [];
      if (payload && payload.article) {
        const clean = sanitizeServerArticle(payload.article);
        if (clean) {
          const origSlug = String(payload.origSlug || '').trim();
          if (origSlug && origSlug !== clean.slug) customMap.delete(origSlug);
          deletedMap.delete(clean.slug);
          customMap.set(clean.slug, clean);
          affectedSlugs.push(clean.slug);
        }
      }

      const mergedCustom = Array.from(customMap.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const mergedDeleted = Array.from(deletedMap.entries()).map(([slug, deletedAt]) => ({ slug, deletedAt }));
      const result = persistBlogsToDisk(mergedCustom, mergedDeleted, affectedSlugs);

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify({
        ok: true,
        persistedToDisk: true,
        customCount: result.customBlogs.length,
        totalArticles: result.articles.length
      }));
    }, 5 * 1024 * 1024);
    return;
  }

  if ((req.method === 'POST' && urlPath === '/api/blogs/delete') || (req.method === 'DELETE' && urlPath === '/api/blogs')) {
    readJsonRequestBody(req, (err, payload) => {
      const parsedUrl = new URL(req.url || '/api/blogs', 'http://localhost');
      const targetSlug = String((payload && payload.slug) || parsedUrl.searchParams.get('slug') || '').trim();
      const existingCustom = readJsonArraySafe(CUSTOM_BLOGS_PATH).filter(a => a && a.slug !== targetSlug);
      const deletedList = normalizeServerDeletedList(readJsonArraySafe(DELETED_BLOGS_PATH));
      if (targetSlug) {
        const filtered = deletedList.filter(d => d.slug !== targetSlug);
        filtered.push({ slug: targetSlug, deletedAt: Date.now() });
        const result = persistBlogsToDisk(existingCustom, filtered, []);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, persistedToDisk: true, totalArticles: result.articles.length }));
        return;
      }
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: false, error: 'Missing slug' }));
    }, 5 * 1024 * 1024);
    return;
  }

  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Clean static route aliases
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  if (urlPath === '/admin' || urlPath === '/admin/') urlPath = '/admin.html';
  if (urlPath === '/download' || urlPath === '/download/') urlPath = '/download.html';
  if (urlPath === '/download-zip') urlPath = '/fixfly-netlify-ready.zip';
  if (urlPath === '/download-aab' || urlPath === '/aab') urlPath = '/fixfly-app.aab';
  if (urlPath === '/download-apk' || urlPath === '/apk') urlPath = '/fixfly-app.apk';
  if (urlPath === '/download-pem' || urlPath === '/pem' || urlPath === '/certificate') urlPath = '/upload_certificate.pem';

  // API redirects
  if (urlPath === '/api/services') urlPath = '/data/services.json';
  if (urlPath === '/api/software') urlPath = '/data/software_products.json';
  if (urlPath === '/api/rates') urlPath = '/data/rates.json';
  if (urlPath === '/api/experts') urlPath = '/data/experts.json';
  if (urlPath === '/api/amazon-products') urlPath = '/data/amazon_products.json';
  if (urlPath === '/api/google-reviews') urlPath = '/data/google_reviews.json';
  if (urlPath === '/api/software-reviews') urlPath = '/data/software_reviews.json';
  if (urlPath === '/api/all-reviews' || urlPath === '/api/service-reviews') urlPath = '/data/service_reviews.json';
  if (urlPath === '/api/orders') urlPath = '/data/orders.json';

  // Asset redirect
  if (urlPath.startsWith('/assets/')) urlPath = '/public' + urlPath;

  let decodedUrlPath = urlPath;
  try {
    decodedUrlPath = decodeURIComponent(urlPath);
  } catch (e) {}

  const safeResolved = path.normalize(decodedUrlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(__dirname, safeResolved);

  const isDirectStaticHtml = (file) => {
    const base = path.basename(file);
    return ['admin.html', 'download.html', '404.html'].includes(base) || /^google[a-f0-9]+\.html$/i.test(base);
  };

  let isSpaHtmlFallback = false;
  if (!fs.existsSync(filePath)) {
    const cleanHtmlCandidate = path.join(__dirname, safeResolved.replace(/\/+$/, '') + '.html');
    if (safeResolved !== '/' && fs.existsSync(cleanHtmlCandidate) && fs.statSync(cleanHtmlCandidate).isFile()) {
      filePath = cleanHtmlCandidate;
      isSpaHtmlFallback = !isDirectStaticHtml(filePath);
    } else {
      filePath = path.join(__dirname, 'index.html');
      isSpaHtmlFallback = true;
    }
  } else if (fs.statSync(filePath).isDirectory()) {
    const dirIndex = path.join(filePath, 'index.html');
    if (fs.existsSync(dirIndex) && fs.statSync(dirIndex).isFile()) {
      filePath = dirIndex;
    } else {
      filePath = path.join(__dirname, 'index.html');
    }
    isSpaHtmlFallback = true;
  } else if (path.extname(filePath).toLowerCase() === '.html' && !isDirectStaticHtml(filePath)) {
    isSpaHtmlFallback = true;
  }

  if (isSpaHtmlFallback) {
    fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, html) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }
      const seo = buildRouteSeo(rawUrlPath);
      const rendered = injectSsrHead(html, seo);
      const buf = Buffer.from(rendered, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': buf.length,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(buf);
    });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const headers = {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    };

    if (ext === '.zip') headers['Content-Disposition'] = 'attachment; filename="fixfly-netlify-ready.zip"';
    if (ext === '.aab') headers['Content-Disposition'] = 'attachment; filename="fixfly-app.aab"';
    if (ext === '.apk') headers['Content-Disposition'] = 'attachment; filename="fixfly-app.apk"';
    if (ext === '.pem') headers['Content-Disposition'] = 'attachment; filename="upload_certificate.pem"';

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Fixfly web server with SSR SEO metadata running on port ${PORT}`);
});
