// Editing controls for selected blocks, image framing and imported HTML.
let selectedNode = null;
let selectedTableRow = null;
let selectedTableCell = null;
const imageDialog = $('#image-dialog');
const tablePhotoDialog = $('#table-photo-dialog');
const blockHandle = $('#block-handle');
let hoveredBlock = null;

const tableButtons = [
  ['table-add-row', '＋ Строка'], ['table-add-column', '＋ Столбец'],
  ['table-delete-row', '− Строка'], ['table-delete-column', '− Столбец'],
  ['table-cell-button', '＋ Кнопка в ячейку'], ['table-cell-image', '＋ Изображение в ячейку'],
  ['table-cell-clear', 'Очистить ячейку']
].map(([id, label]) => {
  const button = document.createElement('button');
  button.id = id; button.type = 'button'; button.textContent = label; button.hidden = true;
  $('#toggle-line').before(button);
  return button;
});

function clearSelection() {
  selectedNode?.removeAttribute('data-editor-selected');
  selectedTableCell?.removeAttribute('data-editor-cell-selected');
  selectedNode = null;
  selectedTableRow = null;
  selectedTableCell = null;
  $('#selection-panel').hidden = true;
  blockHandle.classList.remove('selected');
}

function positionSelectionPanel() {
  if (!selectedNode || !canvas.contains(selectedNode) || $('#selection-panel').hidden) return;
  const panel = $('#selection-panel');
  const rect = selectedNode.getBoundingClientRect();
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const left = Math.max(8, Math.min(rect.left, innerWidth - width - 8));
  const above = rect.top - height - 8;
  const top = above >= 74 ? above : Math.min(innerHeight - height - 8, rect.bottom + 8);
  panel.style.left = `${left}px`;
  panel.style.top = `${Math.max(8, top)}px`;
}

function blockFromTarget(target) {
  if (!(target instanceof Element)) return null;
  const block = target.closest('.om-product,.om-table-scroll,.om-toc,.om-cta,.om-callout,.om-note,figure,section.om-section,hr');
  return block && canvas.contains(block) ? block : null;
}

function positionBlockHandle(block) {
  if (!block || !canvas.contains(block)) return blockHandle.hidden = true;
  const shellRect = $('.canvas-shell').getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  const visibleTop = Math.max(canvasRect.top + 8, blockRect.top + 4);
  blockHandle.style.left = `${Math.max(4, canvasRect.left - shellRect.left + 7)}px`;
  blockHandle.style.top = `${visibleTop - shellRect.top}px`;
  blockHandle.hidden = blockRect.bottom < canvasRect.top || blockRect.top > canvasRect.bottom;
}

function movableBlock(node) {
  if (!node || !canvas.contains(node)) return null;
  const block = node.closest('.om-product,.om-table-scroll,.om-toc,.om-cta,.om-callout,figure,section.om-section')
    || (node.parentNode === canvas ? node : null);
  return block?.matches('header') ? null : block;
}

function selectNode(node, tableRow = null, tableCell = null, preserveCaret = false) {
  clearSelection();
  if (!node || !canvas.contains(node)) return;
  if (!preserveCaret) {
    window.getSelection()?.removeAllRanges();
    lastRange = null;
  }
  selectedNode = node;
  selectedTableRow = tableRow || node.closest('tbody tr');
  selectedTableCell = tableCell || node.closest('th,td');
  node.setAttribute('data-editor-selected', '');
  selectedTableCell?.setAttribute('data-editor-cell-selected', '');
  const image = node.tagName === 'IMG';
  const cta = node.matches('.om-cta') ? node : node.closest('.om-cta');
  const section = node.matches('h2, section.om-section') ? node.closest('section.om-section') : null;
  const type = cta ? 'кнопка' : node.matches('.om-product') ? 'карточка товара' : node.matches('.om-table-scroll') ? 'таблица' : node.matches('.om-toc') ? 'содержание' : node.matches('.om-callout') ? 'акцентный блок' : node.matches('.om-note') ? 'выделенный блок' : ({P:'абзац',H1:'заголовок H1',H2:'заголовок H2',H3:'подзаголовок H3',FIGURE:'изображение с подписью',SECTION:'раздел',ARTICLE:'карточка товара',HR:'разделитель',LI:'пункт списка',TABLE:'таблица'}[node.tagName] || 'блок');
  const cellPosition = selectedTableCell ? ` · строка ${selectedTableCell.parentElement.rowIndex + 1}, столбец ${selectedTableCell.cellIndex + 1}` : '';
  $('#selection-label').textContent = image ? 'Выбрано изображение' : selectedTableCell ? `Ячейка таблицы${cellPosition}` : `Выбрано: ${type}`;
  $('#edit-image').hidden = !image;
  $('#edit-cta').hidden = !cta?.querySelector('a[href]');
  $('#change-table-photo').hidden = !selectedTableRow?.querySelector('td:first-child a[href]');
  const table = node.closest('table') || node.querySelector?.('table');
  tableButtons.forEach(button => {button.hidden = !table;});
  for (const id of ['table-cell-button','table-cell-image','table-cell-clear']) $(`#${id}`).hidden = !selectedTableCell;
  $('#table-delete-row').disabled = !selectedTableRow || table?.tBodies[0]?.rows.length <= 1;
  $('#table-delete-column').disabled = !selectedTableCell || table?.rows[0]?.cells.length <= 1;
  $('#drag-selected').hidden = !movableBlock(node);
  $('#toggle-line').hidden = !section;
  if (section) $('#toggle-line').textContent = section.classList.contains('om-no-divider') ? 'Показать линию' : 'Убрать линию';
  $('#delete-selected').disabled = node.matches('h1');
  $('#selection-panel').hidden = false;
  blockHandle.classList.add('selected');
  requestAnimationFrame(positionSelectionPanel);
}

canvas.addEventListener('pointermove', event => {
  if (event.buttons || draggedBlock) return;
  const block = blockFromTarget(event.target);
  if (block === hoveredBlock && !blockHandle.hidden) return;
  hoveredBlock = block;
  positionBlockHandle(block);
});
canvas.addEventListener('pointerleave', event => {
  if (event.relatedTarget === blockHandle || (event.relatedTarget instanceof Node && blockHandle.contains(event.relatedTarget))) return;
  if (selectedNode) return positionBlockHandle(movableBlock(selectedNode) || selectedNode);
  hoveredBlock = null;
  blockHandle.hidden = true;
});
blockHandle.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  const block = hoveredBlock && canvas.contains(hoveredBlock) ? hoveredBlock : movableBlock(selectedNode);
  if (block) selectNode(block);
});
blockHandle.addEventListener('dragstart', event => {
  const block = hoveredBlock && canvas.contains(hoveredBlock) ? hoveredBlock : movableBlock(selectedNode);
  draggedBlock = movableBlock(block);
  if (!draggedBlock) return event.preventDefault();
  selectNode(block);
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-outmax-block', 'move');
});
blockHandle.addEventListener('dragend', () => {
  draggedBlock = null;
  if (selectedNode) positionBlockHandle(movableBlock(selectedNode) || selectedNode);
});

$('#drag-selected').addEventListener('dragstart', event => {
  draggedBlock = movableBlock(selectedNode);
  if (!draggedBlock) return event.preventDefault();
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-outmax-block', 'move');
});
$('#drag-selected').addEventListener('dragend', () => {
  draggedBlock = null;
  if (insertionLocked) showInsertionMarker(insertionBefore, true);
  else $('#insertion-marker').hidden = true;
});

function focusNewParagraph(paragraph) {
  clearSelection();
  canvas.focus();
  const range = document.createRange();
  range.setStart(paragraph, 0);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  lastRange = range.cloneRange();
  paragraph.scrollIntoView({block:'nearest'});
  changed();
}

function insertTextBeside(node, side) {
  if (!node || !canvas.contains(node)) return;
  const headingGroup = node.matches('h1,h2') ? node.closest('header,section.om-section') : null;
  const anchor = node.closest('.om-product,.om-table-scroll,.om-toc,.om-callout,.om-note,.om-cta,figure,ul,ol')
    || (side === 'before' && headingGroup ? headingGroup : node);
  const paragraph = document.createElement('p');
  paragraph.append(document.createElement('br'));
  if (side === 'before') anchor.before(paragraph); else anchor.after(paragraph);
  focusNewParagraph(paragraph);
}

$('#insert-text-before').addEventListener('click', () => insertTextBeside(selectedNode, 'before'));
$('#insert-text-after').addEventListener('click', () => insertTextBeside(selectedNode, 'after'));

canvas.addEventListener('pointerdown', event => {
  if (event.target.matches('img,hr')) event.preventDefault();
  else if (selectedNode) clearSelection();
});
canvas.addEventListener('click', event => {
  const target = event.target;
  if (target.matches('img,hr')) {
    event.preventDefault();
    selectNode(target, target.closest('tbody tr'), target.closest('th,td'));
    return;
  }
  const buttonLink = target.closest('a.om-button');
  if (buttonLink) {
    event.preventDefault();
    selectNode(buttonLink.closest('.om-cta'));
    return;
  }
  const cell = target.closest('th,td');
  if (cell && canvas.contains(cell)) selectNode(cell.closest('.om-table-scroll') || cell.closest('table'), cell.closest('tbody tr'), cell, true);
});
canvas.addEventListener('contextmenu', event => {
  const cell = event.target.closest('th,td');
  if (!cell || !canvas.contains(cell)) return;
  event.preventDefault();
  selectNode(cell.closest('.om-table-scroll') || cell.closest('table'), cell.closest('tbody tr'), cell);
});
canvas.addEventListener('editor:body-replaced', event => {
  clearSelection();
  if (event.detail?.normalize === false) return;
  promoteCallToActionLinks(canvas);
  normalizeArticlePatterns(canvas);
  normalizeProductPrices(canvas);
  normalizeProductActions(canvas);
});

function selectedTable() {
  return selectedTableCell?.closest('table') || selectedTableRow?.closest('table') || selectedNode?.closest('table') || selectedNode?.querySelector?.('table');
}

function syncTableLabels(table) {
  const headingRow = table.tHead?.rows[0] || table.rows[0];
  const headings = [...(headingRow?.cells || [])].map(cell => cell.textContent.trim());
  table.dataset.metrics = String(Math.max(1, headings.length - 1));
  for (const body of table.tBodies) for (const row of body.rows) [...row.cells].forEach((cell, index) => cell.dataset.label = headings[index] || `Столбец ${index + 1}`);
}

$('#table-add-row').addEventListener('click', () => {
  const table = selectedTable(); if (!table) return;
  const body = table.tBodies[0] || table.createTBody();
  const row = body.insertRow();
  const count = table.rows[0]?.cells.length || 2;
  for (let index = 0; index < count; index++) row.insertCell().textContent = index ? 'Текст' : 'Новая строка';
  syncTableLabels(table); selectNode(table.closest('.om-table-scroll') || table, row, row.cells[0]); changed();
});
$('#table-add-column').addEventListener('click', () => {
  const table = selectedTable(); if (!table) return;
  const headingRow = table.tHead?.rows[0] || table.rows[0];
  if (!headingRow) return;
  const heading = document.createElement(table.tHead ? 'th' : 'td'); heading.textContent = 'Новый столбец'; headingRow.append(heading);
  for (const body of table.tBodies) for (const row of body.rows) row.insertCell().textContent = 'Текст';
  syncTableLabels(table); selectNode(table.closest('.om-table-scroll') || table, null, heading); changed();
});
$('#table-delete-row').addEventListener('click', () => {
  const table = selectedTable(); if (!table || !selectedTableRow || table.tBodies[0].rows.length <= 1) return;
  selectedTableRow.remove(); clearSelection(); changed();
});
$('#table-delete-column').addEventListener('click', () => {
  const table = selectedTable();
  const index = selectedTableCell?.cellIndex;
  if (!table || !Number.isInteger(index) || table.rows[0].cells.length <= 1) return;
  for (const row of table.rows) row.cells[index]?.remove();
  syncTableLabels(table); clearSelection(); changed();
});

$('#table-cell-button').addEventListener('click', () => {
  if (selectedTableCell && canvas.contains(selectedTableCell)) openButtonDialog(null, selectedTableCell);
});
$('#table-cell-image').addEventListener('click', () => {
  if (selectedTableCell && canvas.contains(selectedTableCell)) requestImageUpload(selectedTableCell);
});
$('#table-cell-clear').addEventListener('click', () => {
  if (!selectedTableCell || !canvas.contains(selectedTableCell)) return;
  selectedTableCell.replaceChildren(document.createElement('br'));
  changed();
  selectNode(selectedNode, selectedTableRow, selectedTableCell, true);
  toast('Ячейка очищена');
});
canvas.addEventListener('input', event => {
  const table = event.target.closest?.('table');
  if (table && event.target.matches('thead th')) syncTableLabels(table);
});

function normalizeProductPrices(root) {
  for (const card of root.querySelectorAll('.om-product, article[id^="product-"]')) {
    const price = [...card.children].find(node => node.matches('p,div,.om-price,[data-price-block]') && /\d[\d\s\u00a0]*\s*₽/.test(node.textContent));
    if (!price) continue;
    const text = price.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const values = [...text.matchAll(/\d[\d ]*\s*₽/g)].map(match => match[0].replace(/\s*₽$/, ' ₽').trim());
    if (!values.length) continue;
    const meta = text.replace(/\d[\d ]*\s*₽/g, '').replace(/^[\s·,;:—-]+/, '').trim();
    price.className = 'om-price';
    price.replaceChildren();
    const amounts = document.createElement('span'); amounts.className = 'om-price-amounts';
    if (values.length > 1) {const old = document.createElement('del');old.className='om-price-old';old.textContent=values[0];amounts.append(old);}
    const current = document.createElement('strong'); current.className='om-price-current';current.textContent=values.at(-1);amounts.append(current);
    price.append(amounts);
    if (meta) {const details=document.createElement('span');details.className='om-price-meta';details.textContent=meta;price.append(details);}
  }
}

function normalizeProductActions(root) {
  for (const card of root.querySelectorAll('.om-product, article[id^="product-"]')) {
    const actions = [...card.children].find(node => node.matches('.om-actions,[data-cta-pair]') && node.querySelector(':scope > a'));
    if (!actions) continue;
    actions.classList.add('om-actions');
    actions.removeAttribute('style');
    [...actions.querySelectorAll(':scope > a')].forEach((link, index) => {
      link.removeAttribute('style');
      link.classList.add('om-button');
      [...link.classList].filter(value => /^om-button--/.test(value)).forEach(value => link.classList.remove(value));
      link.classList.add(ACTIVE_EDITOR.key === 'hasl'
        ? (index === 0 ? 'om-button--lime' : 'om-button--black')
        : (index === 0 ? 'om-button--red' : 'om-button--outline'));
    });
  }
}

function normalizeArticlePatterns(root) {
  for (const section of root.querySelectorAll('section')) {
    const heading = section.querySelector(':scope > h2');
    const title = heading?.textContent.trim().toLocaleLowerCase('ru-RU') || '';
    if (title.startsWith('коротко:')) {
      section.classList.add('om-quick-picks');
      section.querySelector(':scope > ul')?.classList.add('om-shortlist');
    }
    if (title === 'как мы выбирали') {
      section.classList.add('om-method');
      section.querySelector(':scope > div')?.classList.add('om-method-card');
    }
  }
  for (const card of root.querySelectorAll('.om-product, article[id^="product-"]')) {
    for (const list of card.querySelectorAll(':scope > ul')) {
      const rows = [...list.querySelectorAll(':scope > li')];
      if (!rows.length || !rows.every(row => /[●○★☆]/.test(row.lastElementChild?.textContent || ''))) continue;
      list.classList.add('om-ratings');
      for (const row of rows) {
        const rating = row.lastElementChild;
        if (rating.classList.contains('om-stars')) continue;
        const symbols = [...rating.textContent].filter(symbol => /[●○★☆]/.test(symbol));
        rating.className = 'om-stars'; rating.replaceChildren();
        for (const symbol of symbols) {
          const star = document.createElement('span');
          star.className = `om-star${symbol === '●' || symbol === '★' ? ' om-star--filled' : ''}`;
          star.textContent = symbol === '●' || symbol === '★' ? '★' : '☆';
          rating.append(star);
        }
      }
    }
  }
}

function removeSelected() {
  if (!selectedNode || !canvas.contains(selectedNode)) return;
  if (selectedNode.matches('h1')) return toast('В статье нужен один H1. Измените его текст.', true);
  let node = selectedNode;
  if (node.tagName === 'IMG') {
    const figure = node.closest('figure');
    const galleryLink = node.closest('.om-gallery > a');
    if (figure) node = figure;
    else if (galleryLink) node = galleryLink;
  }
  node.remove();
  clearSelection();
  changed();
  toast('Элемент удалён');
}

$('#delete-selected').addEventListener('click', removeSelected);
$('#edit-cta').addEventListener('click', () => {
  const link = selectedNode?.closest('.om-cta')?.querySelector('a[href]') || selectedNode?.querySelector?.('.om-cta a[href],a[href]');
  if (link) openButtonDialog(link);
});
$('#toggle-line').addEventListener('click', () => {
  const section = selectedNode?.closest('section.om-section');
  if (!section) return;
  section.classList.toggle('om-no-divider');
  $('#toggle-line').textContent = section.classList.contains('om-no-divider') ? 'Показать линию' : 'Убрать линию';
  changed();
});

function openImageEditor() {
  if (!selectedNode || selectedNode.tagName !== 'IMG') return;
  const img = selectedNode;
  $('#image-preview').src = img.src;
  $('#image-alt').value = img.alt || '';
  $('#image-width').value = parseInt(img.style.width, 10) || 100;
  $('#image-ratio').value = ['1 / 1','4 / 3','16 / 9','3 / 4'].includes(img.style.aspectRatio) ? img.style.aspectRatio : 'auto';
  const [x, y] = (img.style.objectPosition || '50% 50%').split(/\s+/);
  $('#image-x').value = parseInt(x, 10) || 0;
  $('#image-y').value = parseInt(y, 10) || 0;
  if (!img.style.objectPosition) {$('#image-x').value = 50; $('#image-y').value = 50;}
  $('#image-align').value = img.style.marginLeft === 'auto' && img.style.marginRight !== 'auto' ? 'right' : img.style.marginRight === 'auto' && img.style.marginLeft !== 'auto' ? 'left' : 'center';
  $('#image-width-value').value = `${$('#image-width').value}%`;
  $('#image-x-value').value = `${$('#image-x').value}%`;
  $('#image-y-value').value = `${$('#image-y').value}%`;
  imageDialog.showModal();
}

$('#edit-image').addEventListener('click', openImageEditor);
canvas.addEventListener('dblclick', event => {
  if (!event.target.matches('img')) return;
  selectNode(event.target, event.target.closest('tbody tr'));
  if (selectedTableRow) openTablePhotoPicker(); else openImageEditor();
});

function tablePhotoContext(row) {
  const link = row?.querySelector('td:first-child a[href]');
  if (!link) return null;
  const sku = row.dataset.sku || link.getAttribute('href').match(/(?:product-|[-/])(\d{3,12})(?:[/?#]|$)/)?.[1];
  const product = productLibrary.find(item => item.sku === sku);
  const card = sku ? canvas.querySelector(`[id="product-${CSS.escape(sku)}"]`) : null;
  const current = row.querySelector('td:first-child img')?.getAttribute('src') || '';
  const photos = [...new Set([
    ...[...(card?.querySelectorAll('.om-gallery img') || [])].map(img => img.getAttribute('src')),
    ...(product?.images || []), current
  ].filter(src => src && safeAddress(src, true)))];
  return {link, sku, product, photos, current};
}

function renderTablePhotoOptions(photos, current) {
  $('#table-photo-options').innerHTML = photos.length
    ? photos.map((src, index) => `<button type="button" data-photo-src="${escapeHtml(src)}" class="${src === current ? 'active' : ''}" aria-label="Выбрать фото ${index + 1}"><img src="${escapeHtml(src)}" alt="Фото товара ${index + 1}" loading="lazy"><span>Фото ${index + 1}${src === current ? ' · выбрано' : ''}</span></button>`).join('')
    : '<p class="help">Фотографии товара не найдены. Вставьте прямую ссылку на фото ниже.</p>';
}

async function openTablePhotoPicker() {
  const row = selectedTableRow;
  if (!row || !canvas.contains(row)) return;
  const context = tablePhotoContext(row);
  if (!context) return;
  $('#table-photo-name').textContent = context.link.textContent.trim();
  $('#table-photo-url').value = '';
  renderTablePhotoOptions(context.photos, context.current);
  if (!tablePhotoDialog.open) tablePhotoDialog.showModal();
  if (context.photos.length > 1) return;
  const url = context.product?.url || context.link.href;
  if (!outmaxSiteKey(url)) return;
  try {
    const product = await api('/api/fetch', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:url})});
    if (tablePhotoDialog.open && selectedTableRow === row) {
      renderTablePhotoOptions([...new Set([...context.photos, ...product.images])], context.current);
    }
  } catch { /* The current photo and manual URL remain available. */ }
}

function applyTablePhoto(src) {
  const row = selectedTableRow;
  const context = tablePhotoContext(row);
  if (!context || !/^https:\/\//i.test(src) && !src.startsWith('/articles/')) return toast('Укажите прямую HTTPS-ссылку на фото', true);
  let img = row.querySelector('td:first-child img');
  if (!img) {
    img = document.createElement('img');
    const wrapper = context.link.closest('.om-model-cell');
    if (wrapper) wrapper.prepend(img);
    else {
      const span = document.createElement('span');
      span.className = 'om-model-cell';
      context.link.replaceWith(span);
      span.append(img, context.link);
    }
  }
  img.classList.add('om-model-thumb');
  img.src = src;
  img.alt = `${context.link.textContent.replace(/\s*→\s*$/, '').trim()}, фото товара`;
  img.loading = 'lazy';
  img.decoding = 'async';
  tablePhotoDialog.close();
  changed();
  toast('Фото в таблице обновлено');
}

$('#change-table-photo').addEventListener('click', openTablePhotoPicker);
$('#table-photo-options').addEventListener('click', event => {
  const button = event.target.closest('[data-photo-src]');
  if (button) applyTablePhoto(button.dataset.photoSrc);
});
$('#table-photo-apply').addEventListener('click', () => applyTablePhoto($('#table-photo-url').value.trim()));
$('#table-photo-url').addEventListener('keydown', event => {
  if (event.key === 'Enter') {event.preventDefault();applyTablePhoto(event.target.value.trim());}
});
$('#table-photo-close').addEventListener('click', () => tablePhotoDialog.close());
$('#table-photo-done').addEventListener('click', () => tablePhotoDialog.close());

function updateImage() {
  if (!selectedNode || selectedNode.tagName !== 'IMG' || !canvas.contains(selectedNode)) return;
  const img = selectedNode;
  const width = $('#image-width').value;
  const ratio = $('#image-ratio').value;
  img.alt = $('#image-alt').value;
  img.style.width = `${width}%`;
  img.style.aspectRatio = ratio;
  img.style.objectFit = ratio === 'auto' ? 'contain' : 'cover';
  img.style.objectPosition = `${$('#image-x').value}% ${$('#image-y').value}%`;
  img.style.display = 'block';
  img.style.marginLeft = $('#image-align').value === 'left' ? '0' : 'auto';
  img.style.marginRight = $('#image-align').value === 'right' ? '0' : 'auto';
  $('#image-width-value').value = `${width}%`;
  $('#image-x-value').value = `${$('#image-x').value}%`;
  $('#image-y-value').value = `${$('#image-y').value}%`;
  $('#image-preview').style.width = `${width}%`;
  $('#image-preview').style.aspectRatio = ratio;
  $('#image-preview').style.objectFit = ratio === 'auto' ? 'contain' : 'cover';
  $('#image-preview').style.objectPosition = img.style.objectPosition;
  changed();
}
document.querySelectorAll('#image-dialog input:not([type=file]), #image-dialog select').forEach(control => control.addEventListener('input', updateImage));
$('#image-close').addEventListener('click', () => imageDialog.close());
$('#image-done').addEventListener('click', () => imageDialog.close());
$('#remove-image').addEventListener('click', () => {imageDialog.close(); removeSelected();});
$('#replace-image').addEventListener('click', () => $('#replace-image-file').click());
$('#replace-image-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file || !selectedNode || selectedNode.tagName !== 'IMG') return;
  try {
    lockId();
    const result = await api(`/api/upload?draft=${encodeURIComponent(currentId)}&name=${encodeURIComponent(file.name.replace(/\.[^.]+$/, ''))}`, {method:'POST',headers:{'Content-Type':file.type},body:file});
    selectedNode.src = assetUrl(result.src);
    $('#image-preview').src = selectedNode.src;
    changed();
    toast('Изображение заменено');
  } catch(error) {toast(error.message, true);}
  event.target.value = '';
});

canvas.addEventListener('scroll', () => {
  if (selectedNode) {
    positionSelectionPanel();
    positionBlockHandle(movableBlock(selectedNode) || selectedNode);
  }
});
window.addEventListener('resize', () => {
  positionSelectionPanel();
  if (selectedNode) positionBlockHandle(movableBlock(selectedNode) || selectedNode);
});
document.addEventListener('keydown', event => {
  if (!selectedNode || document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape') {
    clearSelection();
    blockHandle.hidden = true;
    return;
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && !event.ctrlKey && !event.metaKey) {
    const selection = window.getSelection();
    if (selectedTableCell && selection?.anchorNode && selectedTableCell.contains(selection.anchorNode)) return;
    event.preventDefault();
    removeSelected();
  }
});

const allowedTags = new Set('article header section nav main aside div span p h1 h2 h3 h4 h5 h6 a img picture ul ol li dl dt dd strong em b i u s small mark sub sup time abbr cite q blockquote details summary table caption colgroup col thead tbody tfoot tr th td figure figcaption br hr code pre iframe video source'.split(' '));
const dropTags = new Set('script style link meta object embed noscript svg canvas audio'.split(' '));
const safeStyleProperties = new Set('max-width min-width margin margin-top margin-right margin-bottom margin-left padding padding-top padding-right padding-bottom padding-left background background-color color font-family font-size font-weight line-height letter-spacing text-transform text-decoration text-decoration-thickness text-underline-offset text-align display flex flex-basis flex-direction flex-grow flex-shrink flex-wrap order grid grid-template-columns grid-template-rows grid-column grid-row gap row-gap column-gap min-height align-items align-content align-self justify-content justify-items justify-self place-items border border-top border-right border-bottom border-left border-collapse border-spacing border-radius width height max-height object-fit object-position overflow overflow-x overflow-y overflow-wrap word-break scroll-snap-type scroll-snap-align -webkit-overflow-scrolling box-sizing white-space position top right bottom left inset z-index vertical-align list-style list-style-type aspect-ratio'.split(' '));

function copySafeInlineStyle(source, target) {
  if (!source.getAttribute('style')) return;
  for (const property of source.style) {
    if (!safeStyleProperties.has(property)) continue;
    const value = source.style.getPropertyValue(property);
    if (!value || /url\s*\(|expression\s*\(|javascript:|@import/i.test(value)) continue;
    target.style.setProperty(property, value, source.style.getPropertyPriority(property));
  }
}

function safeVideoEmbed(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^(?:www\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|rutube\.ru|vkvideo\.ru|vk\.com|vimeo\.com|player\.vimeo\.com)$/.test(url.hostname) ? url.href : '';
  } catch { return ''; }
}

function safeAddress(value, image = false) {
  let url = String(value || '').trim();
  if (!url || /[\u0000-\u001f]/.test(url)) return '';
  if (/^file:/i.test(url) && !image && url.includes('#')) return '#' + url.split('#').pop();
  if (image && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(url)) return url;
  if (url.startsWith('//')) url = 'https:' + url;
  if (/^https?:\/\//i.test(url)) return url;
  if (!image && url.startsWith('#')) return url;
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes(':')) return url;
  if (/^(?:\.\.?\/)?[^/:]+(?:\/[^:]*)?$/i.test(url) && !url.startsWith('//')) return url;
  return '';
}

function cleanImported(node, outputDoc) {
  if (node.nodeType === Node.TEXT_NODE) return outputDoc.createTextNode(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const tag = node.tagName.toLowerCase();
  if (dropTags.has(tag)) return null;
  const clean = allowedTags.has(tag) ? outputDoc.createElement(tag) : outputDoc.createDocumentFragment();
  if (clean.nodeType === Node.ELEMENT_NODE) {
    const classes = [...node.classList].filter(value => /^om-[a-z0-9-]+$/i.test(value));
    if (classes.length) clean.className = classes.join(' ');
    if (node.id && /^[\w-]{1,100}$/.test(node.id)) clean.id = node.id;
    for (const attr of ['alt','title','role','aria-label','data-label','data-metrics','data-sku','data-product-gallery','data-gallery','data-full-review','data-article','data-module','data-toc','data-scenario','data-scenario-id','data-comparison-table','data-scenario-table','data-final-comparison-table','data-ratings-block','data-rating-note','data-cta-pair','data-cta','data-price-block','data-secondary-links','data-editorial-visual','colspan','rowspan']) {
      if (node.hasAttribute(attr)) clean.setAttribute(attr, node.getAttribute(attr).slice(0, 300));
    }
    copySafeInlineStyle(node, clean);
    if (tag === 'a') {
      const href = safeAddress(node.getAttribute('href'));
      if (href) clean.setAttribute('href', href);
    }
    if (tag === 'img') {
      const src = safeAddress(node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('data-original'), true);
      if (!src) return null;
      clean.setAttribute('src', src);
      clean.setAttribute('loading', 'lazy');
      clean.setAttribute('decoding', 'async');
      for (const attribute of ['width','height','sizes']) {
        const value = node.getAttribute(attribute);
        if (value && /^[0-9a-z .,%()\/+*-]+$/i.test(value)) clean.setAttribute(attribute, value.slice(0, 300));
      }
      for (const property of ['width','aspectRatio','objectFit','objectPosition','marginLeft','marginRight']) {
        const value = node.style[property];
        if (value && /^[0-9.% /a-z-]+$/i.test(value)) clean.style[property] = value;
      }
    }
    if (tag === 'iframe') {
      const src = safeVideoEmbed(node.getAttribute('src'));
      if (!src) return null;
      clean.src = src;
      clean.title = node.getAttribute('title') || 'Видео статьи';
      clean.loading = 'lazy';
      clean.setAttribute('allowfullscreen', '');
      clean.setAttribute('allow', 'accelerometer; autoplay; encrypted-media; picture-in-picture');
    }
    if (tag === 'video' || tag === 'source') {
      const src = safeAddress(node.getAttribute('src'));
      if (src && /^https:\/\//i.test(src)) clean.src = src;
      if (tag === 'source' && node.getAttribute('srcset')) {
        const srcset = node.getAttribute('srcset').trim();
        if (srcset.length <= 4000 && !/(?:javascript:|data:text\/html)/i.test(srcset)) clean.setAttribute('srcset', srcset);
        const media = node.getAttribute('media');
        if (media && media.length <= 300) clean.setAttribute('media', media);
      }
      if (tag === 'video') {
        clean.controls = true;
        clean.preload = 'none';
        const poster = safeAddress(node.getAttribute('poster'), true);
        if (poster && /^https:\/\//i.test(poster)) clean.poster = poster;
      }
      if (tag === 'source' && node.getAttribute('type')?.startsWith('video/')) clean.type = node.getAttribute('type');
    }
  }
  for (const child of node.childNodes) {
    const safe = cleanImported(child, outputDoc);
    if (safe) clean.append(safe);
  }
  return clean;
}

function pasteStyleNumber(node, property) {
  const descendants = node.querySelectorAll ? [...node.querySelectorAll('*')] : [];
  const values = [node, ...descendants].map(element => {
    const value = element.style?.[property] || '';
    const match = String(value).match(/[\d.]+/);
    if (!match) return 0;
    const number = Number(match[0]);
    return /pt$/i.test(value.trim()) ? number * 4 / 3 : number;
  });
  return Math.max(0, ...values);
}

function pasteIsBold(node) {
  if (node.matches?.('b,strong')) return true;
  const descendants = node.querySelectorAll ? [...node.querySelectorAll('*')] : [];
  return [node, ...descendants].some(element => {
    const weight = element.style?.fontWeight || '';
    return /bold/i.test(weight) || Number(weight) >= 600 || element.matches?.('b,strong');
  });
}

function pasteHeadingTag(node) {
  const tag = node.tagName?.toLowerCase() || '';
  if (/^h[1-6]$/.test(tag)) return tag;
  const signature = `${node.className || ''} ${node.getAttribute?.('data-heading') || ''} ${node.getAttribute?.('aria-level') || ''}`;
  const wordHeading = signature.match(/(?:msoheading|heading|заголовок)[-_ ]*([1-6])/i);
  if (wordHeading) return `h${wordHeading[1]}`;
  if (/msotitle|document-title|title/i.test(signature)) return 'h1';
  const size = pasteStyleNumber(node, 'fontSize');
  if (!pasteIsBold(node) || node.textContent.trim().length > 220) return 'p';
  if (size >= 28) return 'h1';
  if (size >= 21) return 'h2';
  if (size >= 18) return 'h3';
  return 'p';
}

function cleanPasteInline(node, outputDoc) {
  if (node.nodeType === Node.TEXT_NODE) return outputDoc.createTextNode(node.textContent.replace(/\u00a0/g, ' '));
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const tag = node.tagName.toLowerCase();
  if (dropTags.has(tag)) return null;
  if (tag === 'br') return outputDoc.createElement('br');
  if (tag === 'img') {
    const source = safeAddress(node.getAttribute('src') || node.getAttribute('data-src'), true);
    if (!source) return null;
    const image = outputDoc.createElement('img');
    image.src = source;
    image.alt = node.getAttribute('alt') || 'Изображение из документа';
    image.loading = 'lazy';
    image.decoding = 'async';
    return image;
  }
  let result = outputDoc.createDocumentFragment();
  for (const child of node.childNodes) {
    const clean = cleanPasteInline(child, outputDoc);
    if (clean) result.append(clean);
  }
  const wrap = name => {const element=outputDoc.createElement(name);element.append(result);result=element;};
  const style = node.getAttribute('style') || '';
  if (tag === 'code') wrap('code');
  if (tag === 's' || tag === 'strike' || /line-through/i.test(style)) wrap('s');
  if (tag === 'u' || /underline/i.test(style)) wrap('u');
  if (tag === 'i' || tag === 'em' || /italic/i.test(node.style?.fontStyle || '')) wrap('em');
  if (tag === 'b' || tag === 'strong' || /bold/i.test(node.style?.fontWeight || '') || Number(node.style?.fontWeight) >= 600) wrap('strong');
  if (tag === 'a') {
    const href = safeAddress(node.getAttribute('href'));
    if (href) {
      const link = outputDoc.createElement('a');
      link.href = href;
      if (/^https?:/i.test(href)) {link.target='_blank';link.rel='noopener noreferrer';}
      link.append(result);
      result = link;
    }
  }
  return result;
}

function cleanPasteList(source, outputDoc) {
  const list = outputDoc.createElement(source.tagName.toLowerCase());
  for (const sourceItem of source.querySelectorAll(':scope > li')) {
    const item = outputDoc.createElement('li');
    for (const child of sourceItem.childNodes) {
      const clean = child.nodeType === Node.ELEMENT_NODE && child.matches('ul,ol')
        ? cleanPasteList(child, outputDoc) : cleanPasteInline(child, outputDoc);
      if (clean) item.append(clean);
    }
    if (item.textContent.trim() || item.querySelector('img,ul,ol')) list.append(item);
  }
  return list;
}

function cleanPasteTable(source, outputDoc) {
  const table = cleanImported(source, outputDoc);
  for (const element of [table, ...table.querySelectorAll('*')]) {
    element.removeAttribute('style');
    element.removeAttribute('class');
    element.removeAttribute('id');
    element.removeAttribute('width');
    element.removeAttribute('height');
  }
  const wrapper = outputDoc.createElement('div');
  wrapper.className = 'om-table-scroll';
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', 'Таблица из документа');
  wrapper.append(table);
  return wrapper;
}

function pasteBlocksFromHtml(html, imageData = []) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const clipboardImages = [...imageData];
  for (const image of parsed.querySelectorAll('img')) {
    if (!safeAddress(image.getAttribute('src'), true) && clipboardImages.length) image.src = clipboardImages.shift();
  }
  const outputDoc = document.implementation.createHTMLDocument('paste');
  const blocks = [];
  const visit = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim()) {
        const paragraph = outputDoc.createElement('p');
        paragraph.textContent = node.textContent.trim();
        blocks.push(paragraph);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || dropTags.has(node.tagName.toLowerCase())) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'ul' || tag === 'ol') return blocks.push(cleanPasteList(node, outputDoc));
    if (tag === 'table') return blocks.push(cleanPasteTable(node, outputDoc));
    if (tag === 'blockquote') {
      const note = outputDoc.createElement('div');
      note.className = 'om-note';
      for (const child of node.childNodes) {const clean=cleanPasteInline(child,outputDoc);if(clean)note.append(clean);}
      if (note.textContent.trim() || note.querySelector('img')) blocks.push(note);
      return;
    }
    if (tag === 'figure') {
      const figure = outputDoc.createElement('figure');
      for (const child of node.childNodes) {const clean=cleanPasteInline(child,outputDoc);if(clean)figure.append(clean);}
      if (figure.querySelector('img')) blocks.push(figure);
      return;
    }
    if (tag === 'img') {
      const image = cleanPasteInline(node, outputDoc);
      if (image) {const figure=outputDoc.createElement('figure');figure.append(image);blocks.push(figure);}
      return;
    }
    const isLeafDiv = tag === 'div' && !node.querySelector('p,h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote,figure,div');
    if (tag === 'p' || /^h[1-6]$/.test(tag) || isLeafDiv) {
      const element = outputDoc.createElement(pasteHeadingTag(node));
      for (const child of node.childNodes) {const clean=cleanPasteInline(child,outputDoc);if(clean)element.append(clean);}
      if (!element.textContent.trim() && !element.querySelector('img')) return;
      if (element.tagName === 'P' && element.querySelector('img') && !element.textContent.trim()) {
        const figure=outputDoc.createElement('figure');figure.append(...element.childNodes);blocks.push(figure);
      } else blocks.push(element);
      return;
    }
    for (const child of node.childNodes) visit(child);
  };
  for (const child of parsed.body.childNodes) visit(child);
  while (clipboardImages.length) {
    const figure=outputDoc.createElement('figure');
    const image=outputDoc.createElement('img');image.src=clipboardImages.shift();image.alt='Изображение из документа';image.loading='lazy';image.decoding='async';
    figure.append(image);blocks.push(figure);
  }
  return blocks;
}

function pasteBlocksFromText(text) {
  const outputDoc = document.implementation.createHTMLDocument('paste-text');
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let list = null;
  const nonempty = lines.filter(line => line.trim());
  for (const line of lines) {
    const value = line.trim();
    if (!value) {list=null;continue;}
    const bullet = value.match(/^(?:[-–—•*]|\d+[.)])\s+(.+)/);
    if (bullet) {
      const ordered = /^\d/.test(value);
      if (!list || list.tagName !== (ordered ? 'OL' : 'UL')) {list=outputDoc.createElement(ordered?'ol':'ul');blocks.push(list);}
      const item=outputDoc.createElement('li');item.textContent=bullet[1];list.append(item);continue;
    }
    list = null;
    const first = value === nonempty[0] && value.length <= 220;
    const question = /[?？]$/.test(value) && value.length <= 180;
    const heading = first ? 'h1' : question ? 'h2' : 'p';
    const element=outputDoc.createElement(heading);element.textContent=value;blocks.push(element);
  }
  return blocks;
}

function assemblePastedBlocks(blocks) {
  const outputDoc = document.implementation.createHTMLDocument('assembled-paste');
  const hasH1 = blocks.some(node => node.tagName === 'H1');
  const headings = blocks.filter(node => /^H[1-3]$/.test(node.tagName));
  const fullDocument = hasH1 && (headings.length > 1 || blocks.reduce((sum,node)=>sum+node.textContent.length,0) > 300);
  if (!fullDocument) return {html:blocks.map(node=>node.outerHTML).join(''), fullDocument:false, title:''};
  const root = outputDoc.createElement('div');
  const header = outputDoc.createElement('header');
  root.append(header);
  let section = null;
  let title = '';
  for (const original of blocks) {
    const node = outputDoc.importNode(original, true);
    if (node.tagName === 'H1' && !title) {
      title = node.textContent.trim();
      header.append(node);
      continue;
    }
    if (node.tagName === 'H1') {
      const replacement=outputDoc.createElement('h2');replacement.innerHTML=node.innerHTML;
      section=outputDoc.createElement('section');section.className='om-section';section.append(replacement);root.append(section);continue;
    }
    if (node.tagName === 'H2') {
      section=outputDoc.createElement('section');section.className='om-section';section.append(node);root.append(section);continue;
    }
    if (!section && header.querySelector('h1')) {header.append(node);continue;}
    if (!section) {section=outputDoc.createElement('section');section.className='om-section';root.append(section);}
    section.append(node);
  }
  const sections = [...root.querySelectorAll('section.om-section')].filter(item=>item.querySelector(':scope > h2'));
  sections.forEach((item,index)=>item.id=`section-${index+1}`);
  if (sections.length > 1) {
    const nav=outputDoc.createElement('nav');nav.className='om-toc';nav.setAttribute('aria-label','Содержание статьи');
    nav.innerHTML=`<h2>В этой статье</h2><div>${sections.map(item=>`<a href="#${item.id}">${escapeHtml(item.querySelector(':scope > h2').textContent.trim())}<span>↓</span></a>`).join('')}</div>`;
    header.after(nav);
  }
  return {html:root.innerHTML, fullDocument:true, title};
}

const clipboardFileData = file => new Promise((resolve,reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

canvas.addEventListener('paste', async event => {
  const data = event.clipboardData;
  if (!data) return;
  const html = data.getData('text/html');
  const text = data.getData('text/plain');
  const files = [...data.files].filter(file => file.type.startsWith('image/'));
  if (!html && !files.length && !/[\r\n]/.test(text)) return;
  event.preventDefault();
  const savedRange = lastRange?.cloneRange();
  const imageData = await Promise.all(files.map(clipboardFileData));
  const blocks = html ? pasteBlocksFromHtml(html, imageData) : pasteBlocksFromText(text);
  const pasted = assemblePastedBlocks(blocks);
  if (!pasted.html.trim()) return toast('В буфере обмена нет текста или изображений', true);
  const currentText = canvas.innerText.trim();
  const placeholder = /Заголовок статьи[\s\S]*Кратко расскажите читателю[\s\S]*Первый раздел/.test(currentText);
  const selection = window.getSelection();
  const selectedAll = selection && !selection.isCollapsed && selection.toString().trim().length >= currentText.length * .8;
  if (pasted.fullDocument && (placeholder || selectedAll)) {
    setBody(pasted.html);
    if (pasted.title) $('#page-title').value = pasted.title;
  } else {
    canvas.focus({preventScroll:true});
    if (savedRange && canvas.contains(savedRange.commonAncestorContainer)) {
      selection.removeAllRanges();selection.addRange(savedRange);
    }
    document.execCommand('insertHTML', false, pasted.html);
    changed();
  }
  toast(`Вставлено из документа: ${blocks.filter(node=>/^H[1-6]$/.test(node.tagName)).length} заголовков, ${blocks.filter(node=>node.querySelector?.('img')||node.tagName==='IMG').length} изображений.`);
});

function articleFromHtml(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const site = `https://${OUTMAX_SITES[$('#product-site').value] || OUTMAX_SITES.ru}`;
  for (const image of parsed.querySelectorAll('img[src]')) {
    const source = image.getAttribute('src').trim();
    if (/^\/?images\//i.test(source)) image.setAttribute('src', new URL(source.replace(/^\/?/, '/'), site).href);
  }
  for (const link of parsed.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href').trim();
    if (/^\/?(?:snickers|article|news)\//i.test(href) || /^\/?\d+-(?:news|blog)\//i.test(href)) {
      link.setAttribute('href', new URL(href.replace(/^\/?/, '/'), site).href);
    }
  }
  const sourceArticle = parsed.querySelector('.om-guide') || parsed.querySelector('.article-content,.entry-content') || parsed.querySelector('main article,main,article') || parsed.body;
  const temp = document.implementation.createHTMLDocument('import');
  temp.body.append(cleanImported(sourceArticle, temp));
  const chosen = temp.body.querySelector('.om-guide') || temp.body.querySelector('main,article') || temp.body;
  if (ACTIVE_EDITOR.key === 'hasl') {
    chosen.querySelectorAll('nav[data-toc],nav').forEach(node => node.classList.add('om-toc'));
    chosen.querySelectorAll('section').forEach(node => node.classList.add('om-section'));
    chosen.querySelectorAll('article[data-full-review],article[id^="model-"]').forEach(card => {
      card.classList.add('om-product');
      const sku = card.dataset.sku || card.id.match(/(\d{3,12})$/)?.[1];
      if (sku) {
        card.dataset.sku = sku;
        const marker = [...card.children].find(node => new RegExp(`(?:Арт\\.|Артикул)\\s*${sku}`, 'i').test(node.textContent));
        if (marker) marker.classList.add('om-sku');
      }
      card.querySelectorAll('[data-gallery], [data-product-gallery]').forEach(node => node.classList.add('om-gallery'));
      card.querySelectorAll('[data-ratings-block]').forEach(node => node.classList.add('om-ratings'));
      card.querySelectorAll('[data-cta-pair]').forEach(node => node.classList.add('om-actions'));
    });
    chosen.querySelectorAll('[data-comparison-table], [data-final-comparison-table]').forEach(node => node.classList.add('om-table-scroll'));
  }
  promoteCallToActionLinks(chosen);
  normalizeArticlePatterns(chosen);
  normalizeProductPrices(chosen);
  normalizeProductActions(chosen);
  return {body: chosen.innerHTML, title: parsed.title || parsed.querySelector('h1')?.textContent?.trim() || `Статья ${ACTIVE_EDITOR.name}`};
}

/** Превращает отдельные призывы «Смотреть…» и похожие ссылки в CTA-кнопки. */
function promoteCallToActionLinks(root) {
  for (const link of [...root.querySelectorAll('a[href]')]) {
    const text = link.textContent.trim();
    const parent = link.parentElement;
    const excluded = link.closest('nav,h1,h2,h3,h4,.om-actions,.om-cta');
    const paragraph = parent?.tagName === 'P' && parent.textContent.trim() === text && parent.querySelectorAll(':scope > a').length === 1;
    const standalone = parent && link.parentElement === parent && parent.querySelectorAll(':scope > a').length === 1
      && parent.matches('section,article,div') && /^\s*$/.test([...parent.childNodes].filter(node => node !== link && node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(''));
    if (excluded || !(paragraph || standalone) || !/^(?:смотреть|перейти|купить|выбрать|открыть|все)(?:\s|$)/i.test(text)) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'om-cta';
    link.removeAttribute('style');
    link.classList.add('om-button');
    if (![...link.classList].some(value => /^om-button--/.test(value))) {
      link.classList.add(ACTIVE_EDITOR.key === 'hasl' ? 'om-button--lime' : 'om-button--red');
    }
    if (paragraph) parent.replaceWith(wrapper);
    else link.replaceWith(wrapper);
    wrapper.append(link);
  }
}

$('#open-article').addEventListener('click', () => $('#article-file').click());
$('#open-article-folder').addEventListener('click', () => $('#article-folder').click());

async function readArticleText(file) {
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buffer);
  if (/charset\s*=\s*["']?(?:windows-1251|cp1251)/i.test(text.slice(0, 1500))) text = new TextDecoder('windows-1251').decode(buffer);
  return text;
}

async function attachFolderImages(html, page, files) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const pagePath = (page.webkitRelativePath || page.name).replace(/\\/g, '/');
  const byPath = new Map(files.map(file => [(file.webkitRelativePath || file.name).replace(/\\/g, '/').toLowerCase(), file]));
  const uploaded = new Map();
  let count = 0;
  for (const image of parsed.querySelectorAll('img[src]')) {
    const source = image.getAttribute('src').trim();
    if (!source || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(source)) continue;
    let resolved;
    try {resolved = decodeURIComponent(new URL(source, `https://folder.local/${pagePath}`).pathname.slice(1)).toLowerCase();}
    catch {continue;}
    const file = byPath.get(resolved);
    if (!file || !/\.(?:jpe?g|png|webp|gif)$/i.test(file.name)) continue;
    let stored = uploaded.get(resolved);
    if (!stored) {
      const extension = file.name.split('.').pop().toLowerCase();
      const mime = file.type || ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'}[extension]);
      const result = await api(`/api/upload?draft=${encodeURIComponent(currentId)}&name=${encodeURIComponent(file.name.replace(/\.[^.]+$/, ''))}`, {method:'POST',headers:{'Content-Type':mime},body:file});
      stored = result.src;
      uploaded.set(resolved, stored);
      count += 1;
    }
    image.setAttribute('src', stored);
    image.removeAttribute('srcset');
  }
  return {html: parsed.documentElement.outerHTML, images: count};
}

async function openArticleSelection(fileList, folderMode = false) {
  const files = [...fileList];
  let file = files[0];
  if (folderMode) {
    const pages = files.filter(item => /\.html?$/i.test(item.name));
    file = pages.sort((left, right) => {
      const a = left.webkitRelativePath || left.name;
      const b = right.webkitRelativePath || right.name;
      return a.split('/').length - b.split('/').length || a.length - b.length;
    })[0];
    if (!file) return toast('В выбранной папке нет HTML-статьи', true);
  }
  try {
    if ($('#status').textContent.includes('несохранённые')) {
      const backupId = `${currentId}-backup-${Date.now()}`;
      await api('/api/save', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:backupId,title:`Резервная копия: ${$('#page-title').value}`,body:encodedBody(),products:productLibrary})});
      await listDrafts();
    }
    let data;
    let bundle = null;
    let folderImages = 0;
    if (file.name.toLowerCase().endsWith('.zip')) {
      bundle = await api('/api/import-bundle', {method:'POST',headers:{'Content-Type':'application/zip'},body:file});
      data = articleFromHtml(bundle.html);
      data.title = bundle.title || data.title;
      data.products = bundle.products;
    } else {
      let text = await readArticleText(file);
      if (file.name.toLowerCase().endsWith('.json')) {
        const json = JSON.parse(text);
        if (typeof json.body !== 'string') throw new Error('В JSON нет содержимого статьи');
        data = {body: json.body, title: json.title || `Статья ${ACTIVE_EDITOR.name}`, products:json.products};
      } else {
        currentId = cleanId(file.name.replace(/\.[^.]+$/, ''));
        if (folderMode) {
          const attached = await attachFolderImages(text, file, files);
          text = attached.html;
          folderImages = attached.images;
        }
        data = articleFromHtml(text);
      }
    }
    currentId = bundle?.id || cleanId(file.name.replace(/\.[^.]+$/, ''));
    lockedId = !!bundle?.images || folderImages > 0;
    $('#filename').disabled = lockedId;
    $('#filename').value = currentId;
    $('#page-title').value = data.title;
    setBody(data.body);
    const needsAdaptation = !canvas.querySelector('.om-section,.om-product,.om-toc');
    if (needsAdaptation) adaptArticle();
    restoreProducts(data.products);
    setTab('editor');
    const relative = [...canvas.querySelectorAll('img[src]')].filter(img => !/^(?:https?:|blob:|\/articles\/)/i.test(img.getAttribute('src')));
    const importedImages = bundle?.images || folderImages;
    toast(relative.length ? `Статья открыта. Не найдено локальных изображений: ${relative.length}.` : `Статья открыта${importedImages ? `, импортировано фото: ${importedImages}` : ''}`);
  } catch(error) {toast(error.message, true);}
}

$('#article-file').addEventListener('change', async event => {
  await openArticleSelection(event.target.files);
  event.target.value = '';
});
$('#article-folder').addEventListener('change', async event => {
  await openArticleSelection(event.target.files, true);
  event.target.value = '';
});

function addHaslTableThumbnails(root) {
  if (ACTIVE_EDITOR.key !== 'hasl') return;
  const key = value => String(value || '').replace(/\s*→\s*$/, '').trim().toLocaleLowerCase('ru-RU');
  const images = new Map([...root.querySelectorAll('.om-product')].map(card => [
    key(card.querySelector('h3 a')?.textContent),
    card.querySelector('.om-gallery img')?.getAttribute('src')
  ]).filter(([,src]) => src));
  for (const cell of root.querySelectorAll('table tbody td:first-child')) {
    const link = cell.querySelector('a[href]');
    const image = cell.querySelector('img');
    if (link && image?.getAttribute('src')) images.set(key(link.textContent), image.getAttribute('src'));
  }
  for (const row of root.querySelectorAll('table tbody tr')) {
    const cell = row.cells?.[0];
    const link = cell?.querySelector('a[href]');
    const source = link ? images.get(key(link.textContent)) : '';
    if (!source || cell.querySelector('img')) continue;
    let wrapper = link.closest('.om-model-cell');
    if (!wrapper) {
      wrapper = document.createElement('span');
      wrapper.className = 'om-model-cell';
      link.replaceWith(wrapper);
      wrapper.append(link);
    }
    const image = document.createElement('img');
    image.className = 'om-model-thumb';
    image.src = source;
    image.alt = `${link.textContent.trim()}, фото товара`;
    wrapper.prepend(image);
  }
}

function adaptArticle() {
  const working = document.createElement('div');
  working.innerHTML = encodedBody();
  const preserveHaslDesign = ACTIVE_EDITOR.key === 'hasl' && !!working.querySelector('[data-module="intro"],[data-full-review],[data-article]');
  for (const nav of working.querySelectorAll('nav')) nav.classList.add('om-toc');
  for (const card of working.querySelectorAll('article[id^="product-"]')) {
    card.classList.add('om-product');
    const direct = [...card.children];
    const sku = direct.find(node => /^Арт\.\s*\d{3,12}$/i.test(node.textContent.trim()));
    if (sku) sku.classList.add('om-sku');
    const gallery = card.querySelector('[data-product-gallery],.om-gallery');
    if (gallery) gallery.classList.add('om-gallery');
    const ratings = [...card.querySelectorAll('ul')].find(list => /оцен/i.test(list.getAttribute('aria-label') || ''));
    if (ratings) ratings.classList.add('om-ratings');
    const actions = direct.find(node => node.tagName === 'DIV' && node.querySelector(':scope > a')
      && [...node.querySelectorAll(':scope > a')].every(link => /^смотреть(?:\s|$)/i.test(link.textContent.trim())));
    if (actions) actions.classList.add('om-actions');
  }
  working.querySelectorAll('hr:not(.om-divider)').forEach(line => line.remove());
  working.querySelectorAll('script,style,form').forEach(node => node.remove());
  for (const node of working.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) if (attr.name.startsWith('on')) node.removeAttribute(attr.name);
    if (!preserveHaslDesign && node.tagName !== 'IMG') node.removeAttribute('style');
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^file:/i.test(href) && href.includes('#')) node.setAttribute('href', '#' + href.split('#').pop());
      if (/^https?:\/\//i.test(href)) {node.target = '_blank';node.rel = 'noopener noreferrer';}
    }
  }
  let wrappers = true;
  while (wrappers) {
    wrappers = false;
    const structuralWrappers = [...working.children].filter(node =>
      node.matches('main,.om-guide') || (node.tagName === 'DIV' && !node.className));
    for (const wrapper of structuralWrappers) {
      if (wrapper.querySelector('h1,h2,section')) {wrapper.replaceWith(...wrapper.childNodes);wrappers = true;}
    }
  }
  const result = document.createElement('div');
  const existingHeader = working.querySelector(':scope > header');
  const header = existingHeader || document.createElement('header');
  const h1 = working.querySelector('h1');
  if (h1 && !header.contains(h1)) header.prepend(h1);
  if (!h1) {const heading=document.createElement('h1');heading.textContent=$('#page-title').value.replace(new RegExp(`\\s*[—-]\\s*${ACTIVE_EDITOR.name}$`,'i'),'') || 'Заголовок статьи';header.prepend(heading);}
  if (!existingHeader) {
    const lead = working.querySelector(':scope > p');
    if (lead) header.append(lead);
  }
  result.append(header);
  let currentSection = null;
  for (const node of [...working.childNodes]) {
    if (node === header || node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'H2') {
      currentSection = document.createElement('section');
      currentSection.className = 'om-section';
      currentSection.append(node);
      result.append(currentSection);
      continue;
    }
    if (node.nodeType === Node.ELEMENT_NODE && node.matches('section,article.om-product,nav.om-toc')) {
      if (node.matches('section')) node.classList.add('om-section');
      result.append(node);
      currentSection = null;
      continue;
    }
    if (!currentSection) {currentSection=document.createElement('section');currentSection.className='om-section';result.append(currentSection);}
    currentSection.append(node);
  }
  for (const extra of [...result.querySelectorAll('h1')].slice(1)) {
    const heading = document.createElement('h2');
    heading.innerHTML = extra.innerHTML;
    extra.replaceWith(heading);
  }
  for (const image of result.querySelectorAll('img')) {
    const source = image.getAttribute('src') || '';
    const productFile = source.match(/(?:^|\/)\b([a-z0-9-]+-(\d{3,12})-\d+\.(?:jpe?g|png|webp))$/i);
    if (source.includes('OUTMAX_files/') && productFile) {
      image.src = `https://${OUTMAX_SITES[$('#product-site').value]}/components/com_jshopping/files/img_products/${productFile[2]}/${productFile[1]}`;
    }
    if (!image.hasAttribute('alt')) image.alt = 'Описание изображения';
    image.loading = 'lazy';
    image.decoding = 'async';
    if (image.parentElement?.tagName === 'P' && !image.parentElement.textContent.trim()) {
      const figure = document.createElement('figure');
      image.parentElement.replaceWith(figure);
      figure.append(image);
    }
  }
  for (const quote of result.querySelectorAll('blockquote')) {
    const note = document.createElement('div');note.className='om-note';note.innerHTML=quote.innerHTML;quote.replaceWith(note);
  }
  for (const table of result.querySelectorAll('table')) {
    syncTableLabels(table);
    if (!table.closest('.om-table-scroll')) {
      const wrap = document.createElement('div');wrap.className='om-table-scroll';wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Таблица');wrap.tabIndex=0;table.replaceWith(wrap);wrap.append(table);
    }
  }
  for (const section of result.querySelectorAll('section.om-section')) {
    const heading = section.querySelector(':scope > h2');
    if (heading && !section.id) section.id = `section-${[...result.querySelectorAll('section.om-section')].indexOf(section)+1}`;
  }
  const sections = [...result.querySelectorAll('section.om-section')].filter(section => section.querySelector(':scope > h2'));
  result.querySelectorAll(':scope > nav.om-toc').forEach(nav => nav.remove());
  if (sections.length) {
    const nav = document.createElement('nav');nav.className='om-toc';nav.setAttribute('aria-label','Содержание статьи');
    nav.innerHTML = `<h2>В этой статье</h2><div>${sections.map(section => `<a href="#${escapeHtml(section.id)}">${escapeHtml(section.querySelector(':scope > h2').textContent.trim())}<span>↓</span></a>`).join('')}</div>`;
    header.after(nav);
  }
  promoteCallToActionLinks(result);
  addHaslTableThumbnails(result);
  setBody(result.innerHTML);
  addHaslTableThumbnails(canvas);
  setTab('editor');
  toast(`Структура и оформление адаптированы под ${ACTIVE_EDITOR.name}. Проверьте текст, ссылки и изображения.`);
}

$('#adapt-article').addEventListener('click', () => {
  try {adaptArticle();} catch(error) {toast(error.message, true);}
});

async function adaptArticleFromUrl() {
  const input = $('#article-url');
  const url = normalizeOutmaxUrl(input.value);
  if (!isOutmaxArticleUrl(url)) {
    return toast(`Вставьте ссылку на отдельную статью ${ACTIVE_EDITOR.name}`, true);
  }
  input.value = url;
  const sourceSite = outmaxSiteKey(url);
  $('#product-site').value = sourceSite;
  const exportSite = document.querySelector(`[name="export-site"][value="${sourceSite}"]`);
  if (exportSite) exportSite.checked = true;
  const button = $('#adapt-article-url');
  button.disabled = true;
  button.textContent = 'Загружаем статью…';
  try {
    const data = await api('/api/fetch-article', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const imported = articleFromHtml(data.html);
    if (!imported.body.trim()) throw new Error('На странице не найдено содержимое статьи');
    if ($('#status').textContent.includes('несохранённые')) {
      const backupId = `${currentId}-backup-${Date.now()}`;
      await api('/api/save', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:backupId,title:`Резервная копия: ${$('#page-title').value}`,body:encodedBody(),products:productLibrary})});
    }
    currentId = cleanId(`${data.id}-adapted`);
    lockedId = false;
    $('#filename').disabled = false;
    $('#filename').value = currentId;
    $('#page-title').value = data.title;
    setBody(imported.body, {normalize:false});
    restoreProducts(undefined, {enhance:false});
    await listDrafts();
    toast(`Статья загружена без пересборки: текст, структура, стили и ${canvas.querySelectorAll('img').length} фото сохранены.`);
  } catch(error) {toast(error.message, true);}
  finally {button.disabled = false;button.innerHTML = '↓ Загрузить статью без изменений <span>↗</span>';}
}

$('#adapt-article-url').addEventListener('click', adaptArticleFromUrl);
$('#article-url').addEventListener('keydown', event => {
  if (event.key === 'Enter') {event.preventDefault();adaptArticleFromUrl();}
});
