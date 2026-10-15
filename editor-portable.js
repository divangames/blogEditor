/* Portable copies; HTML remains the document of record. No server dependency. */
(() => {
  'use strict';
  if (!window.ArticleCommands || !document.getElementById('canvas') || window.__ARTICLE_WORKFLOW_DISABLED__ === true) return;
  const esc = value => String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const xml = content => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+content;
  const wns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const relns='http://schemas.openxmlformats.org/package/2006/relationships';
  const ons='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  function download(blob, extension, filename) {
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=(filename || cleanId(document.getElementById('filename').value || 'article'))+'.'+extension;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function snapshot() {
    const epoch=articleSaveEpoch;
    await window.sharedBlocksEnsureExport?.();
    if(epoch!==articleSaveEpoch)throw new Error('Открыта другая статья. Повторите экспорт для текущего материала.');
    const root=document.createElement('div');root.innerHTML=adminBody();
    root.exportName=cleanId(document.getElementById('filename').value || 'article');
    root.querySelectorAll('script,iframe,object,embed,form').forEach(n=>n.remove());
    root.querySelectorAll('*').forEach(n=>[...n.attributes].forEach(a=>{if(/^on/i.test(a.name))n.removeAttribute(a.name);}));
    root.querySelectorAll('a[href]').forEach(link=>{if(!/^(https?:|mailto:|tel:|#|\/)/i.test(link.getAttribute('href')))link.removeAttribute('href');});
    return root;
  }
  async function docx() {
    if (!window.JSZip) throw new Error('Не удалось загрузить инструмент DOCX. Обновите страницу.');
    const root=await snapshot(),zip=new JSZip(),rels=[],warnings=[];
    const relationship=(type,target,external=false)=>{const id='rId'+(rels.length+1);rels.push(`<Relationship Id="${id}" Type="${ons}/${type}" Target="${esc(target)}"${external?' TargetMode="External"':''}/>`);return id;};
    relationship('styles','styles.xml');relationship('numbering','numbering.xml');
    const images=new Map();let imageId=0,drawingId=0;
    // Fetch as the browser user, with no cross-origin credentials or server URL proxy.
    for (const image of root.querySelectorAll('img')) {
      const src=image.getAttribute('src') || '';
      try {
        const url=new URL(src,location.href);
        if (!['https:','http:','data:','blob:'].includes(url.protocol)) throw new Error('protocol');
        if (images.has(src)) continue;
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);
        let blob;
        try {const response=await fetch(url,{signal:controller.signal,credentials:url.origin===location.origin?'same-origin':'omit'});if(!response.ok)throw new Error('image');blob=await response.blob();}
        finally {clearTimeout(timeout);}
        if(blob.size>8*1024*1024 || !blob.type.startsWith('image/')) throw new Error('size');
        const bitmap=await createImageBitmap(blob);
        const surface=document.createElement('canvas');
        const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));surface.width=Math.max(1,Math.round(bitmap.width*scale));surface.height=Math.max(1,Math.round(bitmap.height*scale));
        surface.getContext('2d').drawImage(bitmap,0,0,surface.width,surface.height);bitmap.close();
        const png=await new Promise(resolve=>surface.toBlob(resolve,'image/png'));if(!png)throw new Error('decode');
        const id=++imageId,name='image'+id+'.png';zip.file('word/media/'+name,await png.arrayBuffer());
        images.set(src,{id,rel:relationship('image','media/'+name),width:surface.width,height:surface.height});
      } catch {warnings.push('Изображение недоступно: '+(image.alt || 'без описания'));}
    }
    const run=(text,props='')=>{props=[...new Map([...props.matchAll(/<w:([a-z]+)(?:\s[^>]*)?\/>/gi)].map(match=>[match[1],match[0]])).values()].join('');return `<w:r>${props?'<w:rPr>'+props+'</w:rPr>':''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;};
    function inline(node,props='') {
      if(node.nodeType===Node.TEXT_NODE)return run(node.textContent,props);
      if(node.nodeType!==Node.ELEMENT_NODE)return '';
      const tag=node.tagName.toLowerCase();
      if(['ul','ol','table','style'].includes(tag))return '';
      if(tag==='br')return '<w:r><w:br/></w:r>';
      if(tag==='img') {
        const item=images.get(node.getAttribute('src'));
        if(!item)return run('[Фото: '+(node.alt || node.getAttribute('src') || 'недоступно')+']');
        const width=Math.min(560,item.width),height=Math.min(640,item.height*width/item.width),scaledWidth=width*height/(item.height*width/item.width);
        const cx=Math.round(scaledWidth*9525),cy=Math.round(height*9525),draw=++drawingId;
        return `<w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${draw}" name="image${draw}" descr="${esc(node.alt || '')}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${draw}" name="image${draw}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${item.rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
      }
      let next=props;
      if(['b','strong'].includes(tag))next+='<w:b/>';
      if(['i','em'].includes(tag))next+='<w:i/>';
      if(tag==='u')next+='<w:u w:val="single"/>';
      if(['s','del','strike'].includes(tag))next+='<w:strike/>';
      if(tag==='sup'||tag==='sub')next+=`<w:vertAlign w:val="${tag==='sup'?'superscript':'subscript'}"/>`;
      const content=[...node.childNodes].map(child=>inline(child,next)).join('');
      if(tag==='a') {
        const href=node.getAttribute('href') || '';
        if(/^(https?:|mailto:|tel:)/i.test(href))return `<w:hyperlink r:id="${relationship('hyperlink',href,true)}">${content}</w:hyperlink>`;
      }
      return content;
    }
    const nums=[];
    function paragraph(node,extra='') {
      const tag=node.tagName.toLowerCase();
      let props=extra;
      if(/^h[1-6]$/.test(tag))props+=`<w:pStyle w:val="${tag==='h1'?'Title':'Heading'+tag[1]}"/>`;
      if(['left','center','right','justify'].includes(node.style.textAlign))props+=`<w:jc w:val="${node.style.textAlign==='justify'?'both':node.style.textAlign}"/>`;
      return `<w:p>${props?'<w:pPr>'+props+'</w:pPr>':''}${[...node.childNodes].map(child=>inline(child)).join('')}</w:p>`;
    }
    function blocks(parent,level=0) {
      let result='';
      for(const node of parent.childNodes) {
        if(node.nodeType===Node.TEXT_NODE){if(node.textContent.trim())result+='<w:p>'+run(node.textContent)+'</w:p>';continue;}
        if(node.nodeType!==Node.ELEMENT_NODE)continue;
        const tag=node.tagName.toLowerCase();
        if(['script','style'].includes(tag))continue;
        if(['p','h1','h2','h3','h4','h5','h6','figcaption','blockquote'].includes(tag))result+=paragraph(node,tag==='blockquote'?'<w:ind w:left="420"/>':'');
        else if(tag==='ul'||tag==='ol') {
          const id=nums.length+1;nums.push({id,ordered:tag==='ol',start:Math.max(1,parseInt(node.getAttribute('start'))||1)});
          for(const item of [...node.children].filter(n=>n.tagName==='LI')){
            result+=paragraph(item,`<w:numPr><w:ilvl w:val="${Math.min(8,level)}"/><w:numId w:val="${id}"/></w:numPr>`);
            for(const child of item.children)if(child.matches('ul,ol')){const host=document.createElement('div');host.append(child.cloneNode(true));result+=blocks(host,level+1);}
          }
        } else if(tag==='table') {
          const rows=[...node.rows],columns=Math.max(1,...rows.map(row=>[...row.cells].reduce((n,c)=>n+c.colSpan,0)));
          result+='<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(side=>`<w:${side} w:val="single" w:sz="4" w:color="D9D9D9"/>`).join('')+'</w:tblBorders><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'+Array.from({length:columns},()=>`<w:gridCol w:w="${Math.floor(9360/columns)}"/>`).join('')+'</w:tblGrid>';
          for(const row of rows)result+='<w:tr>'+([...row.cells].every(c=>c.tagName==='TH')?'<w:trPr><w:tblHeader/></w:trPr>':'')+[...row.cells].map(cell=>'<w:tc><w:tcPr>'+ (cell.colSpan>1?`<w:gridSpan w:val="${cell.colSpan}"/>`:'')+(cell.tagName==='TH'?'<w:shd w:fill="F2F2F2"/>':'')+'</w:tcPr>'+(cell.querySelector('p,ul,ol,table')?blocks(cell):paragraph(cell))+'</w:tc>').join('')+'</w:tr>';
          result+='</w:tbl><w:p/>';
          if(node.querySelector('[rowspan]'))warnings.push('Вертикальное объединение ячеек упрощено');
        } else if(tag==='img')result+='<w:p>'+inline(node)+'</w:p>';
        else if(tag==='hr')result+='<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:color="D9D9D9"/></w:pBdr></w:pPr></w:p>';
        else result+=blocks(node,level);
      }
      return result;
    }
    const body=blocks(root);
    zip.file('word/document.xml',xml(`<w:document xmlns:w="${wns}" xmlns:r="${ons}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1273" w:bottom="1134" w:left="1273"/></w:sectPr></w:body></w:document>`));
    zip.file('word/styles.xml',xml(`<w:styles xmlns:w="${wns}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:color w:val="000000"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="288" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>`+['Title','Heading2','Heading3','Heading4','Heading5','Heading6'].map((id,i)=>`<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="${i?220:0}" w:after="140"/>${i?'<w:outlineLvl w:val="'+(i-1)+'"/>':''}</w:pPr><w:rPr><w:b/><w:sz w:val="${i?Math.max(24,34-i*2):40}"/></w:rPr></w:style>`).join('')+'</w:styles>'));
    zip.file('word/numbering.xml',xml(`<w:numbering xmlns:w="${wns}">`+nums.map(n=>`<w:abstractNum w:abstractNumId="${n.id}">`+Array.from({length:9},(_,level)=>`<w:lvl w:ilvl="${level}"><w:start w:val="${n.start}"/><w:numFmt w:val="${n.ordered?'decimal':'bullet'}"/><w:lvlText w:val="${n.ordered?'%'+(level+1)+'.':'•'}"/><w:pPr><w:ind w:left="${420*(level+1)}" w:hanging="220"/></w:pPr></w:lvl>`).join('')+`</w:abstractNum>`).join('')+nums.map(n=>`<w:num w:numId="${n.id}"><w:abstractNumId w:val="${n.id}"/></w:num>`).join('')+'</w:numbering>'));
    zip.file('word/_rels/document.xml.rels',xml(`<Relationships xmlns="${relns}">${rels.join('')}</Relationships>`));
    zip.file('_rels/.rels',xml(`<Relationships xmlns="${relns}"><Relationship Id="rId1" Type="${ons}/officeDocument" Target="word/document.xml"/></Relationships>`));
    zip.file('[Content_Types].xml',xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'+['document','styles','numbering'].map(name=>`<Override PartName="/word/${name}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${name==='document'?'document.main':name}+xml"/>`).join('')+'</Types>'));
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    download(blob,'docx',root.exportName);return {warnings};
  }
  async function pdf() {
    const root=await snapshot();
    const frame=document.createElement('iframe');frame.id='article-print-frame';frame.title='Печатная копия статьи';
    frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');
    frame.setAttribute('sandbox','allow-same-origin allow-modals');
    frame.style.cssText='position:fixed;width:1px;height:1px;right:0;bottom:0;border:0;opacity:0;pointer-events:none';
    const loaded=new Promise(resolve=>frame.onload=resolve);
    const html=previewDocument(root.innerHTML).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    frame.srcdoc=html.replace('</head>','<style>@page{size:A4;margin:15mm} @media print{html,body{background:#fff!important}.om-guide{width:100%!important;max-width:none!important;margin:0!important}img{max-width:100%!important}figure img{width:auto!important;max-height:90mm!important;margin-inline:auto}p,li,td,th{font-size:11pt!important;line-height:1.45!important}h1{font-size:22pt!important;line-height:1.2!important}h2{font-size:18pt!important}h3{font-size:15pt!important}header{padding:12pt!important;margin-bottom:12pt!important}table{min-width:0!important;width:100%!important}td,th{overflow-wrap:anywhere}h1,h2,h3{break-after:avoid}figure,tr{break-inside:avoid}p{orphans:2;widows:2}}</style></head>');
    document.getElementById('article-print-frame')?.remove();document.body.append(frame);await loaded;
    await Promise.race([Promise.all([...frame.contentDocument.images].map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.onload=resolve;image.onerror=resolve;}))),new Promise(resolve=>setTimeout(resolve,7000))]);
    const warnings=[];
    for(const image of [...frame.contentDocument.images])if(!image.complete || !image.naturalWidth){const note=frame.contentDocument.createElement('p');note.textContent='Фото недоступно: '+(image.alt || 'без описания');image.replaceWith(note);warnings.push(note.textContent);}
    frame.contentWindow.focus();frame.contentWindow.print();
    return {ready:true,warnings};
  }
  ArticleCommands.register({id:'export.docx',label:'Скачать копию для Word DOCX',run:docx});
  ArticleCommands.register({id:'export.pdf',label:'Печать и сохранение PDF',run:pdf});
  const dialog=document.getElementById('export-dialog'),actions=dialog.querySelector('.dialog-actions');
  for(const [id,label,command] of [['export-docx','Скачать DOCX','export.docx'],['export-pdf','Печать / PDF','export.pdf']]){
    const button=document.createElement('button');button.id=id;button.type='button';button.textContent=label;actions.append(button);
    button.onclick=async()=>{button.disabled=true;try{dialog.close();const result=await ArticleCommands.execute(command);if(result.warnings?.length)toast((command==='export.docx'?'DOCX':'Печатная копия')+' подготовлена с ограничениями: '+result.warnings.join('; '),true);}catch(error){toast(error.message,true);}finally{button.disabled=false;}};
  }
  const note=document.createElement('p');note.className='help';note.textContent='DOCX — редактируемая копия для Word с упрощённым оформлением. Недоступные фото заменяются описанием. PDF: в окне печати выберите «Сохранить как PDF» и проверьте страницы. Для сайта используйте HTML / ZIP.';actions.before(note);
})();
