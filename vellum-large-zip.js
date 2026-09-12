/* Vellum large-ZIP compatibility layer. Keeps the existing Vellum UI unchanged. */
(function () {
  'use strict';

  var LIMIT = 16 * 1024 * 1024;
  var CHUNK_SIZE = 4 * 1024 * 1024;
  var pending = Object.create(null);

  function isWintrChess(file) {
    var name = String((file && (file.name || file.filename)) || '').toLowerCase();
    return name.indexOf('wintrchess') !== -1 && /\.zip$/i.test(name);
  }

  function isLargeZipFile(file) {
    return !!(file && typeof file.size === 'number' && file.size >= LIMIT && /\.zip$/i.test(String(file.name || '')));
  }

  function uploadChunked(id, blob) {
    var key = String(id);
    var p = (async function () {
      var offset = 0;
      var total = blob.size;

      while (offset < total) {
        var end = Math.min(offset + CHUNK_SIZE, total);
        var part = blob.slice(offset, end);
        var response = await fetch('/__vellum_upload_chunk?id=' + encodeURIComponent(key) + '&offset=' + offset, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Vellum-Size': String(total)
          },
          body: part
        });
        if (!response.ok) {
          var detail = '';
          try { detail = await response.text(); } catch (_) {}
          throw new Error('chunk upload failed: ' + response.status + (detail ? ' ' + detail : ''));
        }
        var result = await response.json();
        if (!result.ok || Number(result.offset) !== end) throw new Error('chunk upload offset mismatch');
        offset = end;
      }
      return true;
    })();
    pending[key] = p;
    p.catch(function (e) { console.error('[Vellum] chunked ZIP upload failed', e); });
    return p;
  }

  function download(marker) {
    var id = marker && marker.__vellumLargeZip;
    if (!id) return Promise.reject(new Error('Invalid Vellum ZIP marker'));
    return (pending[id] || Promise.resolve()).then(function () {
      return fetch('/__vellum_blob/' + encodeURIComponent(String(id)), { cache: 'no-store' });
    }).then(function (r) {
      if (!r.ok) throw new Error('saved ZIP is unavailable: ' + r.status);
      return r.blob();
    });
  }

  /* Patch IndexedDB so large ZIP blobs become tiny markers. */
  try {
    var oldPut = IDBObjectStore.prototype.put;
    if (!oldPut.__vellumLargePatch) {
      function put(value, key) {
        if (value && value.isZip && value.blob && typeof value.blob.size === 'number' && value.blob.size >= LIMIT) {
          var blob = value.blob;
          var id = String(value.id);
          var marker = Object.assign({}, value, {
            blob: {
              __vellumLargeZip: id,
              size: blob.size,
              name: blob.name || value.name || 'project.zip',
              type: blob.type || 'application/zip'
            }
          });
          if (!pending[id]) uploadChunked(id, blob);
          return arguments.length > 1 ? oldPut.call(this, marker, key) : oldPut.call(this, marker);
        }
        return arguments.length > 1 ? oldPut.call(this, value, key) : oldPut.call(this, value);
      }
      put.__vellumLargePatch = true;
      IDBObjectStore.prototype.put = put;
    }
  } catch (e) { console.error('[Vellum] could not patch IndexedDB', e); }

  /* Patch JSZip for already-saved large ZIP markers. */
  function patchJSZip() {
    try {
      if (!window.JSZip || !window.JSZip.loadAsync) return false;
      var oldLoad = window.JSZip.loadAsync;
      if (oldLoad.__vellumLargePatch) return true;
      function load(data, options) {
        if (data && data.__vellumLargeZip) {
          return download(data).then(function (blob) { return oldLoad.call(window.JSZip, blob, options); });
        }
        return oldLoad.call(window.JSZip, data, options);
      }
      load.__vellumLargePatch = true;
      window.JSZip.loadAsync = load;
      return true;
    } catch (e) {
      console.error('[Vellum] JSZip patch failed', e);
      return false;
    }
  }

  if (!patchJSZip()) {
    var tries = 0;
    var timer = setInterval(function () {
      if (patchJSZip() || ++tries > 200) clearInterval(timer);
    }, 50);
  }

  /* Most important fix: bypass Vellum's normal JSZip.parse-on-upload path for WintrChess. */
  function patchProcessZipFile() {
    try {
      if (typeof window.processZipFile !== 'function') return false;
      if (window.processZipFile.__vellumWintrChessPatch) return true;

      var original = window.processZipFile;
      async function wrapped(zipBlob, id) {
        if (!isWintrChess(zipBlob) && !isLargeZipFile(zipBlob)) {
          return original.apply(this, arguments);
        }

        /* WintrChess is a source repository ZIP, not a normal static-site ZIP. */
        var record = {
          id: id,
          name: zipBlob.name || 'project.zip',
          type: 'application/zip',
          size: zipBlob.size,
          blob: {
            __vellumLargeZip: String(id),
            size: zipBlob.size,
            name: zipBlob.name || 'project.zip',
            type: 'application/zip'
          },
          isZip: true,
          zipFiles: null,
          indexHtmlPath: isWintrChess(zipBlob)
            ? 'wintrchess-master/client/public/apps/features/analysis.html'
            : null,
          addedAt: Date.now(),
          openCount: 0,
          trashed: false,
          trashedAt: null,
          allowStorage: false
        };

        if (!record.indexHtmlPath) {
          /* For other large ZIPs, let the normal importer handle validation. */
          return original.apply(this, arguments);
        }

        await uploadChunked(id, zipBlob);
        if (typeof window.dbPut === 'function') await window.dbPut(record);
        if (typeof window.setFiles === 'function') {
          window.setFiles(function (fs) { return fs.concat([record]); });
        }
        if (typeof window.updateUpload === 'function') window.updateUpload(id, { progress: 100, status: 'done' });
        if (typeof window.showToast === 'function') window.showToast((zipBlob.name || 'project.zip') + ' saved as project', 'success');
      }

      wrapped.__vellumWintrChessPatch = true;
      window.processZipFile = wrapped;
      return true;
    } catch (e) {
      console.error('[Vellum] processZipFile patch failed', e);
      return false;
    }
  }

  var processTries = 0;
  var processTimer = setInterval(function () {
    if (patchProcessZipFile() || ++processTries > 400) clearInterval(processTimer);
  }, 50);
})();
