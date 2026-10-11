// bump this every time the site code changes, so you can tell which version your browser is running
const SITE_VERSION = 'oct 10, 2026 · 6:41 pm';
const badge = document.createElement('div');
badge.className = 'version';
badge.textContent = 'updated ' + SITE_VERSION;
document.body.appendChild(badge);

const list = document.querySelector('#list');
const SECTION = list?.dataset.section;
const HAS_TOKEN = (() => { try { return !!localStorage.getItem('gh-token'); } catch { return false; } })();

// a just-uploaded image takes about a minute to reach the site, so fall back to github's copy meanwhile
function imgFallback(img) {
  img.onerror = null;
  const owner = location.hostname.split('.')[0];
  const parts = location.pathname.split('/').filter(Boolean);
  const repo = parts.length > 1 || (parts.length === 1 && !parts[0].includes('.')) ? parts[0] : location.hostname;
  img.src = `https://raw.githubusercontent.com/${owner}/${repo}/main/${img.getAttribute('src')}`;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stars = r => r ? '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '') : '';
// descriptions: [text](https://link) becomes a link, and so does any bare https:// link
const linkify = s => esc(s)
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  .replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

// entries currently on screen, in display order (admin.js uses this for edit/delete)
let shown = [];

function renderList(items, editable = false) {
  shown = [...items].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  list.innerHTML = shown.length ? shown.map((i, idx) => `
    <li data-idx="${idx}">
      ${i.image ? `<img class="cover" src="${esc(i.image)}" alt="" loading="lazy" onerror="imgFallback(this)">` : '<div class="cover blank"></div>'}
      <div class="body">
        <div class="title">${esc(i.title)}${i.year ? ` <span class="meta">(${esc(i.year)})</span>` : ''}</div>
        <div class="meta">
          ${[i.creator, i.date].filter(Boolean).map(esc).join(' · ')}
          ${i.rating ? ` <span class="rating">${stars(i.rating)}</span>` : ''}
        </div>
        ${i.note ? `<div class="note">${linkify(i.note)}</div>` : ''}
        ${editable ? '<div class="controls"><button data-act="edit">edit</button><button data-act="delete">delete</button></div>' : ''}
      </div>
    </li>`).join('') : '<li class="empty">nothing here yet.</li>';
}

// visitors get the published list; if you're signed in, admin.js loads the live list with edit buttons instead
if (list && !HAS_TOKEN) {
  fetch(list.dataset.src + '?t=' + Date.now())
    .then(r => r.ok ? r.json() : [])
    .then(items => renderList(items))
    .catch(() => { list.innerHTML = '<li class="empty">couldn\'t load entries.</li>'; });
}
