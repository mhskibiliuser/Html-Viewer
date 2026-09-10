from pathlib import Path
p=Path('index.html')
s=p.read_text()
if 'VELLUM_ZIP_SUPPORT_V2' in s: raise SystemExit(0)
s=s.replace('<script src="https://cdn.tailwindcss.com"></script>','<script src="https://cdn.tailwindcss.com"></script>\n<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>',1)
helper=r'''  /* VELLUM_ZIP_SUPPORT_V2 */
  async function uploadZipFile(file) {
    if (file.size > 150 * 1024 * 1024) { showToast(file.name + ' is too large (150MB max)', 'error'); return; }
    var id=genId(); setUploads(function(l){return l.concat([{id:id,name:file.name,progress:0,status:'uploading'}]);});
    try {
      if(!window.JSZip) throw new Error('ZIP engine failed to load');
      var zip=await window.JSZip.loadAsync(file), names=Object.keys(zip.files).filter(function(n){return !zip.files[n].dir&&!/^__MACOSX\//i.test(n);});
      var projectFiles=[],entry=null;
      for(var i=0;i<names.length;i++){var path=names[i].replace(/^\.\//,'');var blob=await zip.files[names[i]].async('blob');projectFiles.push({path:path,blob:blob});if(!entry&&/(^|\/)index\.html?$/i.test(path))entry=path;setUploads(function(l){return l.map(function(u){return u.id===id?Object.assign({},u,{progress:Math.round((i+1)/names.length*90)}):u;});});}
      if(!entry) throw new Error('No index.html found in the ZIP');
      var record={id:id,name:file.name,type:'application/zip',size:file.size,blob:file,projectFiles:projectFiles,entry:entry,isZipProject:true,addedAt:Date.now(),openCount:0,trashed:false,trashedAt:null,allowStorage:false};
      await dbPut(record);setFiles(function(fs){return fs.concat([record]);});updateUpload(id,{progress:100,status:'done'});showToast(file.name+' imported as a website','success');
    }catch(err){console.error(err);updateUpload(id,{status:'error'});showToast('Could not import '+file.name+': '+(err.message||'invalid ZIP'),'error');}
  }
  function zipResolve(base,ref,files){try{if(!ref||/^(data:|blob:|https?:|mailto:|javascript:|#|\/\/)/i.test(ref))return null;var clean=ref.split('#')[0].split('?')[0],dir=base.indexOf('/')>=0?base.slice(0,base.lastIndexOf('/')+1):'',parts=(dir+clean).replace(/\\/g,'/').split('/'),out=[];parts.forEach(function(x){if(!x||x==='.')return;if(x==='..')out.pop();else out.push(x);});var path=out.join('/');return files[path]?path:null;}catch(e){return null;}}
  async function buildZipPreview(record){
    var files={};(record.projectFiles||[]).forEach(function(f){files[f.path]=f;});var urls={};Object.keys(files).forEach(function(p){urls[p]=URL.createObjectURL(files[p].blob);});
    if(!files[record.entry])throw new Error('ZIP entry HTML is missing');var html=await files[record.entry].blob.text(),doc=new DOMParser().parseFromString(html,'text/html');
    function asset(ref,base){var p=zipResolve(base||record.entry,ref,files);return p?urls[p]:ref;}
    Array.prototype.forEach.call(doc.querySelectorAll('[src],[href],[poster],[data],[srcset]'),function(el){['src','href','poster','data'].forEach(function(a){if(el.hasAttribute(a))el.setAttribute(a,asset(el.getAttribute(a)));});if(el.hasAttribute('srcset'))el.setAttribute('srcset',el.getAttribute('srcset').split(',').map(function(x){var b=x.trim().split(/\s+/);b[0]=asset(b[0]);return b.join(' ');}).join(', '));});
    Array.prototype.forEach.call(doc.querySelectorAll('[style]'),function(el){el.setAttribute('style',el.getAttribute('style').replace(/url\((['"]?)([^'")]+)\1\)/gi,function(m,q,r){return 'url("'+asset(r)+'")';}));});
    var links=Array.prototype.slice.call(doc.querySelectorAll('link[rel~="stylesheet"][href]'));for(var i=0;i<links.length;i++){var cp=zipResolve(record.entry,links[i].getAttribute('href'),files);if(!cp)continue;var css=await files[cp].blob.text();css=css.replace(/url\((['"]?)([^'")]+)\1\)/gi,function(m,q,r){var p=zipResolve(cp,r,files);return p?'url("'+urls[p]+'")':m;});var cu=URL.createObjectURL(new Blob([css],{type:'text/css'}));urls[cp]=cu;links[i].setAttribute('href',cu);}
    var final=URL.createObjectURL(new Blob(['<!doctype html>\n'+doc.documentElement.outerHTML],{type:'text/html'}));return{url:final,urls:Object.keys(urls).map(function(k){return urls[k];}).concat(final)};
  }
'''
s=s.replace('  function handleFiles(list) {',helper+'\n  function handleFiles(list) {',1)
old='''  function handleFiles(list) {
    if (!list || !list.length) return;
    Array.prototype.forEach.call(list, function (f) {
      var isHtml = /\.html?$/i.test(f.name) || f.type === 'text/html';
      if (!isHtml) { showToast(f.name + ' is not an HTML file', 'error'); return; }
      uploadFile(f);
    });
  }'''
new='''  function handleFiles(list) {
    if (!list || !list.length) return;
    Array.prototype.forEach.call(list, function (f) {
      var isZip=/\.zip$/i.test(f.name)||f.type==='application/zip'||f.type==='application/x-zip-compressed';
      if(isZip){uploadZipFile(f);return;}
      var isHtml=/\.html?$/i.test(f.name)||f.type==='text/html';
      if(!isHtml){showToast(f.name+' is not an HTML or ZIP file','error');return;}
      uploadFile(f);
    });
  }'''
if old not in s: raise SystemExit('handle block not found')
s=s.replace(old,new,1)
old='''      var url = URL.createObjectURL(updated.blob);
      setPreview({ file: updated, allowStorage: !!updated.allowStorage, url: url, });'''
new='''      var built=updated.isZipProject?await buildZipPreview(updated):{url:URL.createObjectURL(updated.blob),urls:[]};
      setPreview({file:updated,allowStorage:!!updated.allowStorage,url:built.url,urls:built.urls||[]});'''
if old not in s: raise SystemExit('open block not found')
s=s.replace(old,new,1)
old='''    if (preview) { try { URL.revokeObjectURL(preview.url); } catch (e) {} }'''
new='''    if(preview){(preview.urls||[preview.url]).forEach(function(u){try{URL.revokeObjectURL(u);}catch(e){}});}'''
if old not in s: raise SystemExit('close block not found')
s=s.replace(old,new,1)
s=s.replace('Drop in any <em>.html</em> file and open it instantly in a sandboxed preview.','Drop in an <em>.html</em> file or a <em>.zip</em> website project and open it instantly in a sandboxed preview.')
s=s.replace('Drag &amp; drop an HTML file here, or','Drag &amp; drop an HTML or ZIP website here, or')
s=s.replace('accept=".html,.htm,text/html"','accept=".html,.htm,.zip,text/html,application/zip"')
p.write_text(s)
