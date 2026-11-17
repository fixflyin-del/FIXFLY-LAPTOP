const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildRouteSeo, injectSsrHead } = require('./seo-helper');
const cloudinaryHelper = require('./cloudinary-config');

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

function readJsonRequestBody(req, callback) {
  let body = '';
  let aborted = false;
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 64 * 1024) {
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

  let isSpaHtmlFallback = false;
  if (!fs.existsSync(filePath)) {
    const cleanHtmlCandidate = path.join(__dirname, safeResolved.replace(/\/+$/, '') + '.html');
    if (safeResolved !== '/' && fs.existsSync(cleanHtmlCandidate) && fs.statSync(cleanHtmlCandidate).isFile()) {
      filePath = cleanHtmlCandidate;
      isSpaHtmlFallback = !['/admin.html', '/download.html', '/404.html'].includes(path.basename(filePath));
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
  } else if (path.extname(filePath).toLowerCase() === '.html' && !['admin.html', 'download.html', '404.html'].includes(path.basename(filePath))) {
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
