// Add-entry form on the home page. It saves straight into this site's GitHub repo.
// The form only appears on a browser where you've saved your GitHub token (visit index.html#admin once).
const form = document.querySelector('#add-form');
const statusEl = document.querySelector('#add-status');
const TOKEN_KEY = 'gh-token';

const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = t => { try { localStorage.setItem(TOKEN_KEY, t); } catch {} };

if (location.hash === '#admin') { // visiting #admin always lets you paste a new token
  const t = prompt('paste your github token (only saved in this browser):');
  if (t) setToken(t.trim());
  history.replaceState(null, '', location.pathname);
}
if (getToken()) form.hidden = false;

// yourname.github.io -> owner "yourname", repo "yourname.github.io"
// yourname.github.io/something/ -> owner "yourname", repo "something"
const OWNER = location.hostname.split('.')[0];
const parts = location.pathname.split('/').filter(Boolean);
const REPO = parts.length > 1 || (parts.length === 1 && !parts[0].includes('.')) ? parts[0] : location.hostname;
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;

async function gh(path, opts = {}) {
  const res = await fetch((path.startsWith('https') ? path : API + path), {
    ...opts,
    headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/vnd.github+json', ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`github said ${res.status} while saving ${path}`);
  return res.json();
}

// text <-> base64 that handles accents and emoji
const toB64 = str => btoa(String.fromCharCode(...new TextEncoder().encode(str)));
const fromB64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), c => c.charCodeAt(0)));

// shrink the image to max 600px wide jpeg so the repo stays small
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
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

form?.addEventListener('submit', async e => {
  e.preventDefault();
  const title = form.elements.title.value.trim();
  const section = form.elements.section.value;
  const file = form.elements.image.files[0];
  if (!title) return;

  const button = form.querySelector('button');
  button.disabled = true;
  statusEl.textContent = 'saving…';

  try {
    // check the token can see the repo before saving anything
    const repoUrl = `https://api.github.com/repos/${OWNER}/${REPO}`;
    const check = await fetch(repoUrl, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (check.status === 401) throw new Error('github rejected the token (expired or pasted wrong). visit index.html#admin to paste it again');
    if (check.status === 404) throw new Error(`the token can't see the repo ${OWNER}/${REPO}. give it access to that repo, or check the repo name`);
    const info = await check.json();
    if (info.permissions && !info.permissions.push) throw new Error('the token can read the repo but not write. set contents to "read and write"');

    const today = new Date().toLocaleDateString('en-CA'); // yyyy-mm-dd
    const entry = { title, date: today };

    if (file) {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cover';
      const path = `images/${section}-${slug}-${Date.now()}.jpg`;
      await gh(path, { method: 'PUT', body: JSON.stringify({ message: `add image: ${title}`, content: await shrinkImage(file) }) });
      entry.image = path;
    }

    const dataPath = `data/${section}.json`;
    const current = await gh(dataPath);
    const items = JSON.parse(fromB64(current.content));
    items.unshift(entry);
    await gh(dataPath, {
      method: 'PUT',
      body: JSON.stringify({ message: `add to ${section}: ${title}`, content: toB64(JSON.stringify(items, null, 2) + '\n'), sha: current.sha }),
    });

    form.reset();
    statusEl.innerHTML = `added to <a href="${section}.html">${section}</a>. it'll show up in about a minute.`;
  } catch (err) {
    statusEl.textContent = `didn't save: ${err.message}.`;
  } finally {
    button.disabled = false;
  }
});
