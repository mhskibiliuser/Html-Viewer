/* Vellum large-ZIP compatibility layer. Keeps the existing Vellum UI unchanged. */
(function () {
  'use strict';
  var LIMIT = 16 * 1024 * 1024;
  var pending = Object.create(null);
  var LARGE_WINTRCHESS_ENTRY = 'wintrchess-master/client/public/apps/features/analysis.html';

  function upload(id, blob) {
    var p = fetch('/__vellum_upload?id=' + encodeURIComponent(String(id)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip', 'X-Vellum-Size': String(blob.size) },
      body: blob
    }).then(function (r) {
      if (!r.ok) throw new Error('server upload failed: ' + r.status);
      return r.text();
    });
    pending[id] = p;
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

  /* IMPORTANT: patch the actual Vellum ZIP upload function after the app has loaded.
     This avoids asking IndexedDB or JSZip to hold/parse a 71 MB source ZIP. */
  function patchProcessZipFile() {
    try {
      if (typeof window.processZipFile !== 'function') return false;
      if (window.processZipFile.__vellumLargePatch) return true;
      var original = window.processZipFile;

      function largeProcessZipFile(zipBlob, id) {
        var name = String(zipBlob && zipBlob.name || '').toLowerCase();
        if (!(zipBlob && typeof zipBlob.size === 'number' && zipBlob.size >= LIMIT) || name.indexOf('wintrchess') === -1) {
          return original.apply(this, arguments);
        }

        return upload(id, zipBlob).then(function () {
          var record = {
            id: id,
            name: zipBlob.name,
            type: 'application/zip',
            size: zipBlob.size,
            blob: {
              __vellumLargeZip: String(id),
              size: zipBlob.size,
              name: zipBlob.name,
              type: 'application/zip'
            },
            isZip: true,
            zipFiles: null,
            indexHtmlPath: LARGE_WINTRCHESS_ENTRY,
            addedAt: Date.now(),
            openCount: 0,
            trashed: false,
            trashedAt: null,
            allowStorage: false
          };

          /* dbPut is the function that previously caused the 90% failure. */
          return window.dbPut(record).then(function () {
            window.setFiles(function (fs) { return fs.concat([record]); });
            window.updateUpload(id, { progress: 100, status: 'done' });
            window.showToast(zipBlob.name + ' saved as project', 'success');
          });
        });
      }

      largeProcessZipFile.__vellumLargePatch = true;
      window.processZipFile = largeProcessZipFile;
      return true;
    } catch (e) {
      console.error('[Vellum] processZipFile patch failed', e);
      return false;
    }
  }

  /* Fallback: if the functions are not exposed yet, retry briefly. */
  var tries = 0;
  var timer = setInterval(function () {
    if (patchProcessZipFile() || ++tries > 200) clearInterval(timer);
  }, 25);

  /* Large ZIP records contain a marker, so JSZip downloads the real ZIP only when opened. */
  function patchJSZip() {
    try {
      if (!window.JSZip || !window.JSZip.loadAsync) return false;
      var oldLoad = window.JSZip.loadAsync;
      if (oldLoad.__vellumLargePatch) return true;
      function load(data, options) {
        if (data && data.__vellumLargeZip) {
          return download(data).then(function (blob) {
            return oldLoad.call(window.JSZip, blob, options);
          });
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

  patchJSZip();
  var zipTries = 0;
  var zipTimer = setInterval(function () {
    if (patchJSZip() || ++zipTries > 200) clearInterval(zipTimer);
  }, 25);
})();
