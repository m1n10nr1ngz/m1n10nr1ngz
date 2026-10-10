// Reads the JSON file named in <ul id="list" data-src="..."> and lists the entries, newest first.
const list = document.querySelector('#list');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stars = r => r ? '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '') : '';

if (list) {
  fetch(list.dataset.src + '?t=' + Date.now()) // skip the browser cache so new entries show up
    .then(r => r.json())
    .then(items => {
      items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      list.innerHTML = items.length ? items.map(i => `
        <li>
          ${i.image ? `<img class="cover" src="${esc(i.image)}" alt="" loading="lazy">` : '<div class="cover blank"></div>'}
          <div>
            <div class="title">${esc(i.title)}${i.year ? ` <span class="meta">(${esc(i.year)})</span>` : ''}</div>
            <div class="meta">
              ${[i.creator, i.date].filter(Boolean).map(esc).join(' · ')}
              ${i.rating ? ` <span class="rating">${stars(i.rating)}</span>` : ''}
            </div>
            ${i.note ? `<div class="note">${esc(i.note)}</div>` : ''}
          </div>
        </li>`).join('') : '<li class="empty">nothing here yet.</li>';
    })
    .catch(() => { list.innerHTML = '<li class="empty">couldn\'t load entries.</li>'; });
}
