#!/bin/sh
python3 - <<'PY'
from pathlib import Path
import re
p=Path('index.html'); s=p.read_text()
s=s.replace('50 * 1024 * 1024','150 * 1024 * 1024').replace('50MB max','150MB max')
# ZIP: store only the original ZIP; extract files when the project is opened.
a=s.index('  async function processZipFile('); b=s.index('\n  function handleFiles',a)
s=s[:a]+'''  async function processZipFile(zipBlob, id) {
    if (!window.JSZip) throw new Error('JSZip library not loaded');
    var zip = await window.JSZip.loadAsync(zipBlob);
    var indexHtmlPath = null;
    zip.forEach(function(path, file) {
      if (!file.dir && !/^__MACOSX\\//i.test(path) && !indexHtmlPath && /(^|\\/)index\\.html?$/i.test(path)) indexHtmlPath = path.replace(/^\\.\\//,'');
    });
    if (!indexHtmlPath) throw new Error('ZIP does not contain index.html or index.htm');
    var record = {id:id,name:zipBlob.name,type:'application/zip',size:zipBlob.size,blob:zipBlob,isZip:true,zipFiles:null,indexHtmlPath:indexHtmlPath,addedAt:Date.now(),openCount:0,trashed:false,trashedAt:null,allowStorage:false};
    await dbPut(record);
    setFiles(function(fs){return fs.concat([record]);});
    updateUpload(id,{progress:100,status:'done'});
    showToast(zipBlob.name+' saved as project','success');
  }
''' + s[b:]
# ZIP: extract on demand from saved original ZIP.
a=s.index('  async function openFile(f) {'); b=s.index('\n  function blobToText',a)
s=s[:a]+'''  async function openFile(f) {
    try {
      var updated=Object.assign({},f,{openCount:(f.openCount||0)+1});
      await dbPut(updated);
      setFiles(function(fs){return fs.map(function(x){return x.id===f.id?updated:x;});});
      var url,blobUrls={};
      if(updated.isZip){
        if(!window.JSZip) throw new Error('JSZip library not loaded');
        var zip=await window.JSZip.loadAsync(updated.blob), zipFiles={}, jobs=[];
        zip.forEach(function(path,file){if(file.dir||/^__MACOSX\\//i.test(path))return;var clean=path.replace(/^\\.\\//,'');jobs.push(file.async('blob').then(function(blob){zipFiles[clean]=blob;}));});
        await Promise.all(jobs);
        var entry=updated.indexHtmlPath||Object.keys(zipFiles).find(function(p){return /(^|\\/)index\\.html?$/i.test(p);});
        if(!entry||!zipFiles[entry])throw new Error('index.html not found in saved ZIP');
        var htmlText=await blobToText(zipFiles[entry]);
        var processedHtml=processZipHtml(htmlText,zipFiles,blobUrls,entry);
        url=URL.createObjectURL(new Blob([processedHtml],{type:'text/html; charset=utf-8'}));
      }else{url=URL.createObjectURL(updated.blob);}
      setPreview({file:updated,allowStorage:!!updated.allowStorage,url:url,blobUrls:blobUrls});
      setDrawer(null);
    }catch(err){
      console.error(err);
      var msg=(err&&err.name==='QuotaExceededError')?'Not enough browser storage to save this project':(err&&err.message)||'unknown error';
      showToast('Could not save/open '+f.name+': '+msg,'error');
    }
  }
''' + s[b:]
# Make IndexedDB writes expose abort/request errors.
a=s.index('async function dbPut(record) {'); b=s.index('\n}\n\nasync function dbGetAll',a)
s=s[:a]+'''async function dbPut(record) {
  var db=await dbOpen();
  return new Promise(function(resolve,reject){
    try{
      var tx=db.transaction(STORE_NAME,'readwrite');
      var req=tx.objectStore(STORE_NAME).put(record), done=false;
      function fail(e){if(!done){done=true;reject(e||new Error('IndexedDB write failed'));}}
      req.onerror=function(){fail(req.error);};
      tx.onerror=function(){fail(tx.error||req.error);};
      tx.onabort=function(){fail(tx.error||req.error||new Error('IndexedDB transaction aborted'));};
      tx.oncomplete=function(){if(!done){done=true;resolve();}};
    }catch(e){reject(e);}
  });
''' + s[b:]
p.write_text(s)
PY
