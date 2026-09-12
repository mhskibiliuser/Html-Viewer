/* Vellum large source-ZIP interceptor. Keeps the existing UI unchanged. */
(function () {
  'use strict';

  var LIMIT = 16 * 1024 * 1024;
  var CHUNK_SIZE = 1024 * 1024;
  var MARKER = '__vellumLargeZip';
  var busy = false;

  function isTarget(file) {
    if (!file || typeof file.size !== 'number') return false;
    var name = String(file.name || '').toLowerCase();
    return file.size >= LIMIT && /\.zip$/i.test(name) && name.indexOf('wintrchess') !== -1;
  }

  function idFor(file) {
    return 'large_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function toast(message, error) {
    var el = document.getElementById('__vellum_large_zip_notice');
    if (!el) {
      el = document.createElement('div');
      el.id = '__vellum_large_zip_notice';
      el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:999999;padding:12px 16px;border-radius:10px;background:#16171c;color:#f4f2ec;border:1px solid rgba(255,255,255,.14);font:500 14px Inter,Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);max-width:90vw;text-align:center;';
      document.body.appendChild(el);
    }
    el.style.borderColor = error ? 'rgba(248,113,113,.5)' : 'rgba(139,92,246,.45)';
    el.textContent = message;
  }

  function removeToast() {
    var el = document.getElementById('__vellum_large_zip_notice');
    if (el) el.remove();
  }

  function upload(id, file) {
    return (async function () {
      var offset = 0;
      var total = file.size;
      while (offset < total) {
        var end = Math.min(offset + CHUNK_SIZE, total);
        var part = file.slice(offset, end);
        var r = await fetch('/__vellum_upload_chunk?id=' + encodeURIComponent(id) + '&offset=' + offset, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-Vellum-Size': String(total) },
          body: part
        });
        if (!r.ok) {
          var detail = '';
          try { detail = await r.text(); } catch (_) {}
          throw new Error('upload failed: ' + r.status + (detail ? ' ' + detail : ''));
        }
        var data = await r.json();
        if (!data.ok || Number(data.offset) !== end) throw new Error('server offset mismatch');
        offset = end;
        toast('Saving WintrChess ZIP… ' + Math.floor((offset / total) * 100) + '%');
      }
    })();
  }

  function saveRecord(id, file) {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open('vellum-db', 1);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      };
      request.onerror = function () { reject(request.error || new Error('IndexedDB open failed')); };
      request.onsuccess = function () {
        var db = request.result;
        try {
          var tx = db.transaction('files', 'readwrite');
          var record = {
            id: id,
            name: file.name || 'wintrchess-master.zip',
            type: file.type || 'application/zip',
            size: file.size,
            blob: { [MARKER]: id, size: file.size, name: file.name || 'wintrchess-master.zip', type: file.type || 'application/zip' },
            isZip: true,
            zipFiles: null,
            indexHtmlPath: 'wintrchess-master/client/public/apps/features/analysis.html',
            addedAt: Date.now(),
            openCount: 0,
            trashed: false,
            trashedAt: null,
            allowStorage: false
          };
          tx.objectStore('files').put(record);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error || new Error('IndexedDB save failed')); };
          tx.onabort = function () { reject(tx.error || new Error('IndexedDB save aborted')); };
        } catch (e) { reject(e); }
      };
    });
  }

  async function handle(file) {
    if (busy) return;
    busy = true;
    var id = idFor(file);
    try {
      toast('Preparing WintrChess ZIP…');
      await upload(id, file);
      toast('Saving WintrChess ZIP… 100%');
      await saveRecord(id, file);
      toast('WintrChess ZIP saved ✓');
      setTimeout(function () { location.reload(); }, 500);
    } catch (e) {
      console.error('[Vellum] large source ZIP interceptor failed', e);
      toast('Could not save WintrChess ZIP: ' + (e && e.message ? e.message : 'unknown error'), true);
      busy = false;
    }
  }

  function onChange(event) {
    if (busy) return;
    var input = event.target;
    if (!input || String(input.type).toLowerCase() !== 'file' || !input.files || !input.files.length) return;
    var file = input.files[0];
    if (!isTarget(file)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handle(file);
  }

  document.addEventListener('change', onChange, true);

  document.addEventListener('drop', function (event) {
    if (busy || !event.dataTransfer || !event.dataTransfer.files || !event.dataTransfer.files.length) return;
    var file = event.dataTransfer.files[0];
    if (!isTarget(file)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handle(file);
  }, true);
})();
