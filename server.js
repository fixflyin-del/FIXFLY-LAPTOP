const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildRouteSeo, injectSsrHead } = require('./seo-helper');

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
