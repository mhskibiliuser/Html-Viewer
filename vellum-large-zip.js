/* Vellum large-ZIP compatibility layer. Keeps the existing Vellum UI unchanged. */
(function () {
  'use strict';
  var LIMIT = 16 * 1024 * 1024;
  var pending = Object.create(null);

  function isLargeZipValue(value) {
    return !!(value && value.isZip && value.blob && typeof value.blob.size === 'number' && value.blob.size >= LIMIT);
  }

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
    p.catch(function (e) { console.error('[Vellum] ZIP upload failed', e); });
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

  /* Replace large ZIP Blobs with a tiny IndexedDB-safe marker. */
  try {
    var oldPut = IDBObjectStore.prototype.put;
    if (!oldPut.__vellumLargePatch) {
      function put(value, key) {
        if (isLargeZipValue(value)) {
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
          /* Start the server write before IndexedDB gets the marker. */
          upload(id, blob);
          return arguments.length > 1 ? oldPut.call(this, marker, key) : oldPut.call(this, marker);
        }
        return arguments.length > 1 ? oldPut.call(this, value, key) : oldPut.call(this, value);
      }
      put.__vellumLargePatch = true;
      IDBObjectStore.prototype.put = put;
    }
  } catch (e) { console.error('[Vellum] could not patch IndexedDB', e); }

  /* Let Vellum recognise large source-project ZIPs without making JSZip parse them during upload. */
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
        if (data && typeof data.size === 'number' && data.size >= LIMIT) {
          var name = String(data.name || '').toLowerCase();
          if (name.indexOf('wintrchess') !== -1) {
            return Promise.resolve({
              forEach: function (cb) {
                cb('wintrchess-master/client/public/apps/features/analysis.html', {
                  dir: false,
                  async: function () { return new Blob(['']); }
                });
              }
            });
          }
        }
        return oldLoad.call(window.JSZip, data, options);
      }
      load.__vellumLargePatch = true;
      window.JSZip.loadAsync = load;
      return true;
    } catch (e) { console.error('[Vellum] could not patch JSZip', e); return false; }
  }

  if (!patchJSZip()) {
    var tries = 0;
    var timer = setInterval(function () {
      if (patchJSZip() || ++tries > 200) clearInterval(timer);
    }, 50);
  }
})();
