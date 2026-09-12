const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0';
const DOCROOT = path.resolve(__dirname);
const STORAGE = path.join(DOCROOT, '.vellum-storage');
fs.mkdirSync(STORAGE, { recursive: true });

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.gif': 'image/gif',
  '.map': 'application/json'
};

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 200);
}

function storedPath(id) {
  return path.join(STORAGE, safeId(id) + '.zip');
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname || '/';

  // Legacy one-request upload endpoint.
  if (req.method === 'POST' && pathname === '/__vellum_upload') {
    const id = safeId(parsedUrl.query.id);
    if (!id) return send(res, 400, 'text/plain; charset=utf-8', 'missing id');
    const target = storedPath(id);
    const out = fs.createWriteStream(target);
    let failed = false;
    req.on('error', () => { failed = true; out.destroy(); });
    out.on('error', () => { failed = true; });
    out.on('finish', () => {
      if (!failed) send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, id: id }));
    });
    req.pipe(out);
    return;
  }

  // Chunked upload endpoint. Vellum sends a large ZIP as small sequential pieces.
  if (req.method === 'POST' && pathname === '/__vellum_upload_chunk') {
    const id = safeId(parsedUrl.query.id);
    const offset = Number(parsedUrl.query.offset);
    if (!id || !Number.isSafeInteger(offset) || offset < 0) {
      return send(res, 400, 'text/plain; charset=utf-8', 'bad chunk parameters');
    }

    const target = storedPath(id);
    fs.stat(target, (statErr, stats) => {
      const currentSize = statErr ? 0 : stats.size;
      if (currentSize !== offset) {
        return send(res, 409, 'application/json; charset=utf-8', JSON.stringify({ ok: false, expectedOffset: currentSize }));
      }

      const out = fs.createWriteStream(target, { flags: offset === 0 ? 'w' : 'a' });
      let failed = false;
      req.on('error', () => { failed = true; out.destroy(); });
      out.on('error', () => { failed = true; });
      out.on('finish', () => {
        if (failed) return;
        fs.stat(target, (err, statsAfter) => {
          if (err) return send(res, 500, 'text/plain; charset=utf-8', 'could not verify chunk');
          send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, id: id, offset: statsAfter.size }));
        });
      });
      req.pipe(out);
    });
    return;
  }

  // Retrieve a previously uploaded ZIP.
  if (req.method === 'GET' && pathname.indexOf('/__vellum_blob/') === 0) {
    const id = safeId(pathname.slice('/__vellum_blob/'.length));
    const target = storedPath(id);
    fs.stat(target, (err, stats) => {
      if (err || !stats.isFile()) return send(res, 404, 'text/plain; charset=utf-8', 'ZIP not found');
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': stats.size,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(target).pipe(res);
    });
    return;
  }

  if (req.method === 'DELETE' && pathname.indexOf('/__vellum_blob/') === 0) {
    const id = safeId(pathname.slice('/__vellum_blob/'.length));
    fs.unlink(storedPath(id), () => send(res, 200, 'application/json; charset=utf-8', '{"ok":true}'));
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  try {
    pathname = decodeURIComponent(pathname);
  } catch (_) {
    return send(res, 400, 'text/plain; charset=utf-8', '400 Bad Request');
  }

  const relativePath = pathname.replace(/^[/\\]+/, '');
  const filePath = path.resolve(DOCROOT, relativePath);
  const rootPrefix = DOCROOT.endsWith(path.sep) ? DOCROOT : DOCROOT + path.sep;
  if (filePath !== DOCROOT && !filePath.startsWith(rootPrefix)) {
    return send(res, 403, 'text/plain; charset=utf-8', '403 Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return send(res, 404, 'text/html; charset=utf-8', '<!doctype html><html><body><h1>404 - File Not Found</h1><p>Path: ' + pathname + '</p></body></html>');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // Inject compatibility helpers into the existing Vellum page only.
    if (path.basename(filePath).toLowerCase() === 'index.html') {
      fs.readFile(filePath, 'utf8', (readErr, html) => {
        if (readErr) return send(res, 500, 'text/plain; charset=utf-8', '500 Server Error');
        const helperTag = '<script src="/vellum-large-zip.js?v=chunked-4mb"></script>';
        const interceptorTag = '<script src="/vellum-large-source-interceptor.js?v=direct-wintrchess-1"></script>';
        html = html.replace(/<script\s+src=["']\/vellum-large-zip\.js(?:\?[^"']*)?["']><\/script>/gi, '');
        html = html.replace(/<script\s+src=["']\/vellum-large-source-interceptor\.js(?:\?[^"']*)?["']><\/script>/gi, '');
        html = html.replace('</head>', helperTag + interceptorTag + '</head>');
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(html);
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`HTTP Server Started on ${HOST}:${PORT}`);
  console.log(`Root: ${DOCROOT}`);
});

server.on('error', (err) => console.error('Server error:', err));
