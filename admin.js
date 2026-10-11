// Your controls: the add form on the home page, and edit/delete on each list page.
// They save straight into the site's GitHub repo and only appear in a browser where
// you've saved your token (visit index.html#admin once).
const TOKEN_KEY = 'gh-token';
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = t => { try { localStorage.setItem(TOKEN_KEY, t); } catch {} };

if (location.hash === '#admin') { // visiting #admin always lets you paste a new token
  const t = prompt('paste your github token (only saved in this browser):');
  if (t) { setToken(t.trim()); location.replace(location.pathname); }
  else history.replaceState(null, '', location.pathname);
}

// yourname.github.io -> repo "yourname.github.io"; yourname.github.io/something/ -> repo "something"
const OWNER = location.hostname.split('.')[0];
const parts = location.pathname.split('/').filter(Boolean);
const REPO = parts.length > 1 || (parts.length === 1 && !parts[0].includes('.')) ? parts[0] : location.hostname;
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;

async function gh(path, opts = {}, allow404 = false) {
  const res = await fetch(API + path + (opts.method ? '' : '?t=' + Date.now()), {
    ...opts,
    headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/vnd.github+json' },
  });
  if (allow404 && res.status === 404) return null;
  if (res.status === 401) throw new Error('github rejected the token (expired or pasted wrong). visit index.html#admin to paste it again');
  if (res.status === 404) throw new Error(`the token can't see ${OWNER}/${REPO}, or ${path} is missing`);
  if (res.status === 409) throw new Error('the list changed while saving. refresh and try again');
  if (!res.ok) throw new Error(`github said ${res.status} for ${path}`);
  return res.json();
}

// text <-> base64 that handles accents and emoji
function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const fromB64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), c => c.charCodeAt(0)));

// read / write one section's list (data/<section>.json). a missing file is an empty list.
async function readSection(section) {
  const file = await gh(`data/${section}.json`, {}, true);
  return file ? { items: JSON.parse(fromB64(file.content)), sha: file.sha } : { items: [], sha: undefined };
}
async function writeSection(section, items, sha, message) {
  await gh(`data/${section}.json`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: toB64(JSON.stringify(items, null, 2) + '\n'), ...(sha ? { sha } : {}) }),
  });
}

// shrink the image to max 600px wide jpeg and upload it; returns its path
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 600 / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => reject(new Error("couldn't read that image"));
    img.src = URL.createObjectURL(file);
  });
}
async function uploadImage(section, title, file) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cover';
  const path = `images/${section}-${slug}-${Date.now()}.jpg`;
  await gh(path, { method: 'PUT', body: JSON.stringify({ message: `add image: ${title}`, content: await shrinkImage(file) }) });
  return path;
}
async function deleteImage(path) { // best effort; a leftover image doesn't hurt anything
  try {
    const f = await gh(path, {}, true);
    if (f) await gh(path, { method: 'DELETE', body: JSON.stringify({ message: `remove image ${path}`, sha: f.sha }) });
  } catch {}
}

// older entries have no id, so fall back to title + date
const same = (a, b) => (a.id || b.id) ? a.id === b.id : a.title === b.title && a.date === b.date;

/* ---------- home page: add form ---------- */
const form = document.querySelector('#add-form');
const addStatus = document.querySelector('#add-status');

if (form && getToken()) form.hidden = false;

form?.addEventListener('submit', async e => {
  e.preventDefault();
  const title = form.elements.title.value.trim();
  const section = form.elements.section.value;
  const note = form.elements.note.value.trim();
  const file = form.elements.image.files[0];
  if (!title) return;

  const button = form.querySelector('button');
  button.disabled = true;
  addStatus.textContent = 'saving…';
  try {
    const entry = { id: String(Date.now()), title, date: new Date().toLocaleDateString('en-CA') };
    if (note) entry.note = note;
    if (file) entry.image = await uploadImage(section, title, file);

    const { items, sha } = await readSection(section);
    items.unshift(entry);
    await writeSection(section, items, sha, `add to ${section}: ${title}`);

    form.reset();
    addStatus.innerHTML = `added to <a href="${section}.html">${section}</a>.`;
  } catch (err) {
    addStatus.textContent = `didn't save: ${err.message}.`;
  } finally {
    button.disabled = false;
  }
});

/* ---------- list pages: edit / delete ---------- */
if (typeof list !== 'undefined' && list && getToken()) {
  const status = document.createElement('p');
  status.className = 'meta list-status';
  list.before(status);

  const load = async () => renderList((await readSection(SECTION)).items, true);
  load().catch(err => { status.textContent = `couldn't load: ${err.message}.`; });

  // change the saved list: fn gets the fresh items and the entry's index, and returns the new items
  async function change(entry, fn, message) {
    const { items, sha } = await readSection(SECTION);
    const i = items.findIndex(x => same(x, entry));
    if (i === -1) throw new Error("couldn't find that entry anymore. refresh the page");
    const next = await fn(items, i);
    await writeSection(SECTION, next, sha, message);
    renderList(next, true);
  }

  list.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const li = btn.closest('li');
    const entry = shown[li.dataset.idx];
    const act = btn.dataset.act;

    if (act === 'delete' && !btn.dataset.armed) { // first click asks, second click deletes
      btn.dataset.armed = '1';
      btn.textContent = 'sure? click again';
      setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'delete'; }, 4000);
      return;
    }

    if (act === 'edit') {
      li.querySelector('.body').innerHTML = `
        <form class="edit-form">
          <input name="title" type="text" value="${esc(entry.title)}" required>
          <textarea name="note" rows="2" placeholder="short description (optional)">${esc(entry.note || '')}</textarea>
          <label class="meta">new image (optional) <input name="image" type="file" accept="image/*"></label>
          ${entry.image ? '<label class="meta"><input name="noimage" type="checkbox"> remove image</label>' : ''}
          <div class="controls"><button data-act="save">save</button><button type="button" data-act="cancel">cancel</button></div>
        </form>`;
      return;
    }
    if (act === 'cancel') { renderList(shown, true); return; }
    if (act !== 'save' && act !== 'delete') return;

    e.preventDefault();
    li.querySelectorAll('button').forEach(b => b.disabled = true);
    status.textContent = 'saving…';
    try {
      if (act === 'delete') {
        await change(entry, (items, i) => items.filter((_, j) => j !== i), `remove from ${SECTION}: ${entry.title}`);
        if (entry.image) deleteImage(entry.image);
        status.textContent = `removed "${entry.title}".`;
      } else {
        const f = li.querySelector('form').elements;
        const title = f.title.value.trim();
        if (!title) throw new Error('title is empty');
        const note = f.note.value.trim();
        const file = f.image.files[0];
        const newImage = file ? await uploadImage(SECTION, title, file) : null;
        const dropImage = newImage || f.noimage?.checked;
        await change(entry, (items, i) => {
          const updated = { ...items[i], title };
          if (note) updated.note = note; else delete updated.note;
          if (newImage) updated.image = newImage; else if (dropImage) delete updated.image;
          items[i] = updated;
          return items;
        }, `edit in ${SECTION}: ${title}`);
        if (dropImage && entry.image) deleteImage(entry.image);
        status.textContent = `saved "${title}".`;
      }
    } catch (err) {
      status.textContent = `didn't save: ${err.message}.`;
      li.querySelectorAll('button').forEach(b => b.disabled = false);
    }
  });
}
