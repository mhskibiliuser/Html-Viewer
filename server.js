const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Use the hosting platform's port when provided, otherwise 8080 for Codespaces/local use.
const PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0';
const DOCROOT = path.resolve(__dirname);

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
  '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname || '/';

  // Default to index.html for root.
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Decode the URL safely before resolving the file path.
  try {
    pathname = decodeURIComponent(pathname);
  } catch (_) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }

  // Remove the leading slash for file lookup.
  const relativePath = pathname.replace(/^[/\\]+/, '');
  const filePath = path.resolve(DOCROOT, relativePath);

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);

  // Security check: prevent directory traversal outside the project root.
  const rootPrefix = DOCROOT.endsWith(path.sep) ? DOCROOT : DOCROOT + path.sep;
  if (filePath !== DOCROOT && !filePath.startsWith(rootPrefix)) {
    console.log(`[${new Date().toISOString()}] DENIED: Directory traversal attempt`);
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      console.log(`[${new Date().toISOString()}] File not found: ${filePath}`);
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><body><h1>404 - File Not Found</h1><p>Path: ' + pathname + '</p></body></html>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] Stream error:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('500 Server Error');
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\nHTTP Server Started`);
  console.log(`Host: ${HOST}`);
  console.log(`Port: ${PORT}`);
  console.log(`Root: ${DOCROOT}\n`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
