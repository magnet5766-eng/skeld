/* ─────────────────────────────────────────────
   VoidPacks — script.js
   Starfield + Shooting Stars + Game Fetching
───────────────────────────────────────────── */

/* ══════════════════════════════════════════
   STARFIELD CANVAS
══════════════════════════════════════════ */
const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');

let W, H, stars = [], shootingStars = [], mouse = { x: -9999, y: -9999 };
const STAR_COUNT = 180;
const REPEL_RADIUS = 100;
const REPEL_FORCE = 0.6;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}

function initStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      ox: 0, oy: 0,       // original positions recomputed each frame
      size: Math.random() * 1.4 + 0.3,
      alpha: Math.random() * 0.6 + 0.2,
      twinkleSpeed: Math.random() * 0.015 + 0.005,
      twinkleOffset: Math.random() * Math.PI * 2,
      vx: 0, vy: 0,       // repel velocity
    });
  }
}

/* Shooting stars */
function spawnShootingStar() {
  // start from top-left quarter, head toward bottom-right
  const startX = Math.random() * W * 0.5;
  const startY = Math.random() * H * 0.35;
  const angle = (Math.PI / 4) + (Math.random() - 0.5) * 0.4; // ~45° ± variation
  const speed = 6 + Math.random() * 8;
  shootingStars.push({
    x: startX, y: startY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    len: 80 + Math.random() * 120,
    alpha: 1,
    life: 0,
    maxLife: 55 + Math.random() * 40,
  });
}

function maybespawnShooting() {
  if (Math.random() < 0.004) spawnShootingStar(); // ~0.4% chance per frame
}

let t = 0;
function drawFrame() {
  ctx.clearRect(0, 0, W, H);
  t += 0.016;
  maybespawnShooting();

  // ── Stars ──
  for (const s of stars) {
    // Twinkle
    const twinkle = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed * 60 + s.twinkleOffset);
    const a = s.alpha * (0.55 + 0.45 * twinkle);

    // Mouse repel
    const dx = s.x - mouse.x;
    const dy = s.y - mouse.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < REPEL_RADIUS && dist > 0) {
      const force = (1 - dist / REPEL_RADIUS) * REPEL_FORCE;
      s.vx += (dx / dist) * force;
      s.vy += (dy / dist) * force;
    }

    // Dampen and clamp
    s.vx *= 0.88;
    s.vy *= 0.88;
    const maxV = 4;
    const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (spd > maxV) { s.vx = (s.vx / spd) * maxV; s.vy = (s.vy / spd) * maxV; }

    s.x += s.vx;
    s.y += s.vy;

    // Wrap
    if (s.x < 0) s.x = W;
    if (s.x > W) s.x = 0;
    if (s.y < 0) s.y = H;
    if (s.y > H) s.y = 0;

    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fill();
  }

  // ── Shooting stars ──
  for (let i = shootingStars.length - 1; i >= 0; i--) {
    const ss = shootingStars[i];
    ss.x += ss.vx;
    ss.y += ss.vy;
    ss.life++;
    const progress = ss.life / ss.maxLife;
    ss.alpha = progress < 0.2
      ? progress / 0.2                  // fade in
      : 1 - (progress - 0.2) / 0.8;    // fade out

    const tailX = ss.x - ss.vx * (ss.len / Math.sqrt(ss.vx * ss.vx + ss.vy * ss.vy));
    const tailY = ss.y - ss.vy * (ss.len / Math.sqrt(ss.vx * ss.vx + ss.vy * ss.vy));

    const grad = ctx.createLinearGradient(tailX, tailY, ss.x, ss.y);
    grad.addColorStop(0, `rgba(255,255,255,0)`);
    grad.addColorStop(1, `rgba(255,255,255,${ss.alpha * 0.85})`);
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(ss.x, ss.y);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Head glow
    ctx.beginPath();
    ctx.arc(ss.x, ss.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${ss.alpha})`;
    ctx.fill();

    if (ss.life >= ss.maxLife) shootingStars.splice(i, 1);
  }

  requestAnimationFrame(drawFrame);
}

window.addEventListener('resize', () => { resize(); initStars(); });
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });

resize();
initStars();
drawFrame();


/* ══════════════════════════════════════════
   DATA FETCHING
══════════════════════════════════════════ */

// CORS proxies to try in order
const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://cors-anywhere.herokuapp.com/${url}`,
];

async function fetchWithCorsProxy(url) {
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal: AbortSignal.timeout(8000) });
      if (res.ok) return res;
    } catch (e) {
      // try next proxy
    }
  }
  throw new Error('All CORS proxies failed');
}

// Parse the raw HTML content from WordPress to extract a clean description
function extractDescription(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = tmp.textContent || tmp.innerText || '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 320) + (text.length > 320 ? '…' : '');
}

// Try to extract a good cover image from WP post content
function extractImage(post) {
  // Prefer featured image
  if (post._embedded?.['wp:featuredmedia']?.[0]?.source_url) {
    return post._embedded['wp:featuredmedia'][0].source_url;
  }
  // Fall back: scrape first img src from content
  const tmp = document.createElement('div');
  tmp.innerHTML = post.content?.rendered || '';
  const img = tmp.querySelector('img');
  return img?.src || img?.getAttribute('data-src') || null;
}

// Extract tags from categories/tags embedded
function extractTags(post) {
  const cats = post._embedded?.['wp:term']?.[0] || [];
  return cats.slice(0, 3).map(c => c.name).filter(Boolean);
}

// Format a WP date string nicely
function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ── Fetch FitGirl posts ── */
async function fetchFitGirl(page = 1, perPage = 12) {
  const url = `https://fitgirl-repacks.site/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}&_embed=1`;
  try {
    const res = await fetchWithCorsProxy(url);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Unexpected response');

    return data.map(post => ({
      id: `fg-${post.id}`,
      provider: 'fitgirl',
      providerLabel: 'FitGirl',
      title: post.title?.rendered ? decodeEntities(post.title.rendered) : 'Unknown',
      description: extractDescription(post.content?.rendered || post.excerpt?.rendered || ''),
      image: extractImage(post),
      tags: extractTags(post),
      date: formatDate(post.date),
      url: post.link,
    }));
  } catch (e) {
    console.warn('FitGirl fetch failed:', e.message);
    return [];
  }
}

function decodeEntities(str) {
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}


/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
let allGames = [];
let filteredGames = [];
let activeProvider = 'all';
let searchQuery = '';
let displayedCount = 0;
const PAGE_SIZE = 16;
let currentFGPage = 1;
let fgLoading = false;
let fgExhausted = false;


/* ══════════════════════════════════════════
   RENDER
══════════════════════════════════════════ */
function makeGameCard(game, big = false) {
  const card = document.createElement('div');
  card.className = 'game-card';
  card.dataset.id = game.id;

  const imgSrc = game.image || '';
  const tagsHtml = game.tags.slice(0, 3).map(t => `<span class="tag">${t}</span>`).join('');

  card.innerHTML = `
    ${imgSrc
      ? `<img class="game-card-img loading" src="${imgSrc}" alt="${game.title}" loading="lazy" />`
      : `<div class="game-card-img" style="display:flex;align-items:center;justify-content:center;background:#111;color:rgba(255,255,255,0.1);font-size:32px;">⬡</div>`
    }
    <div class="game-card-body">
      <div class="game-card-provider">${game.providerLabel}</div>
      <div class="game-card-title">${game.title}</div>
      <div class="game-card-tags">${tagsHtml}</div>
    </div>
  `;

  if (imgSrc) {
    const img = card.querySelector('img');
    img.addEventListener('load', () => img.classList.remove('loading'));
    img.addEventListener('error', () => { img.src = ''; img.style.minHeight = '120px'; });
  }

  card.addEventListener('click', () => openModal(game));
  return card;
}

function renderTrending() {
  const grid = document.getElementById('trendingGrid');
  grid.innerHTML = '';
  const trendGames = allGames.slice(0, 4);
  if (trendGames.length === 0) {
    grid.innerHTML = '<div class="error-msg" style="grid-column:1/-1"><strong>Couldn\'t load trending</strong>Check your connection or try again later.</div>';
    return;
  }
  trendGames.forEach(g => grid.appendChild(makeGameCard(g, true)));
}

function getVisible() {
  let games = allGames;
  if (activeProvider !== 'all') games = games.filter(g => g.provider === activeProvider);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    games = games.filter(g => g.title.toLowerCase().includes(q) || g.tags.some(t => t.toLowerCase().includes(q)));
  }
  return games;
}

function renderGames(reset = false) {
  const grid = document.getElementById('gamesGrid');
  filteredGames = getVisible();

  if (reset) {
    grid.innerHTML = '';
    displayedCount = 0;
  }

  const slice = filteredGames.slice(displayedCount, displayedCount + PAGE_SIZE);
  slice.forEach(g => grid.appendChild(makeGameCard(g)));
  displayedCount += slice.length;

  // Update load more
  const btn = document.getElementById('loadMoreBtn');
  const hasMore = displayedCount < filteredGames.length || (!fgExhausted && activeProvider !== 'steamrip' && activeProvider !== 'ankergames' && activeProvider !== 'astralgames');
  btn.disabled = !hasMore;
  btn.style.display = hasMore ? '' : 'none';
}

function renderSkeletons(grid, count = 8) {
  grid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'skeleton-card';
    grid.appendChild(s);
  }
}


/* ══════════════════════════════════════════
   MODAL
══════════════════════════════════════════ */
function openModal(game) {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');

  const tagsHtml = game.tags.map(t => `<span class="tag">${t}</span>`).join('');
  const imgHtml = game.image
    ? `<img class="modal-img" src="${game.image}" alt="${game.title}" />`
    : `<div class="modal-img" style="background:#111;display:flex;align-items:center;justify-content:center;font-size:48px;color:rgba(255,255,255,0.1);">⬡</div>`;

  content.innerHTML = `
    ${imgHtml}
    <div class="modal-provider">${game.providerLabel}</div>
    <div class="modal-title">${game.title}</div>
    ${game.date ? `<div class="modal-date">Posted ${game.date}</div>` : ''}
    ${tagsHtml ? `<div class="modal-tags">${tagsHtml}</div>` : ''}
    ${game.description ? `<div class="modal-desc">${game.description}</div>` : ''}
    <div class="modal-actions">
      <a href="${game.url}" target="_blank" class="modal-btn modal-btn-primary">↗ View on ${game.providerLabel}</a>
      <a href="${game.url}" target="_blank" class="modal-btn modal-btn-secondary">⬡ Open Source</a>
    </div>
  `;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });


/* ══════════════════════════════════════════
   PROVIDER FILTER
══════════════════════════════════════════ */
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeProvider = btn.dataset.provider;
    renderGames(true);

    // If non-fitgirl provider selected, show info
    if (['steamrip', 'ankergames', 'astralgames'].includes(activeProvider)) {
      const grid = document.getElementById('gamesGrid');
      if (grid.children.length === 0 || grid.children.length < 2) {
        showProviderPlaceholder(activeProvider, grid);
      }
    }
  });
});

function showProviderPlaceholder(provider, grid) {
  const urls = {
    steamrip: 'https://steamrip.com',
    ankergames: 'https://ankergames.net',
    astralgames: 'https://astral-games.net',
  };
  const labels = { steamrip: 'SteamRIP', ankergames: 'AnkerGames', astralgames: 'AstralGames' };
  grid.innerHTML = `
    <div class="error-msg" style="grid-column:1/-1">
      <strong>${labels[provider]}</strong>
      This provider doesn't expose a public API we can read from the browser.<br/>
      Visit their site directly to browse their library.
      <br/><br/>
      <a href="${urls[provider]}" target="_blank" class="modal-btn modal-btn-secondary" style="display:inline-flex;margin-top:8px;">
        ↗ Go to ${labels[provider]}
      </a>
    </div>
  `;
}


/* ══════════════════════════════════════════
   SEARCH
══════════════════════════════════════════ */
let searchDebounce;
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = e.target.value.trim();
    renderGames(true);
  }, 280);
});


/* ══════════════════════════════════════════
   LOAD MORE
══════════════════════════════════════════ */
document.getElementById('loadMoreBtn').addEventListener('click', async () => {
  const btn = document.getElementById('loadMoreBtn');

  // If we have more locally, just render more
  if (displayedCount < filteredGames.length) {
    renderGames(false);
    return;
  }

  // Otherwise fetch next page from FitGirl
  if (fgExhausted || fgLoading) return;
  fgLoading = true;
  btn.textContent = 'Loading…';
  btn.disabled = true;

  currentFGPage++;
  const newGames = await fetchFitGirl(currentFGPage, 12);
  fgLoading = false;

  if (newGames.length === 0) {
    fgExhausted = true;
    btn.textContent = 'No more games';
    return;
  }

  allGames = [...allGames, ...newGames];
  btn.textContent = 'Load More';
  renderGames(false);
});


/* ══════════════════════════════════════════
   FAQ ACCORDION
══════════════════════════════════════════ */
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});


/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
async function init() {
  // Render skeletons immediately
  const trendGrid = document.getElementById('trendingGrid');
  const gamesGrid = document.getElementById('gamesGrid');
  renderSkeletons(trendGrid, 4);
  renderSkeletons(gamesGrid, 8);

  document.getElementById('loadMoreBtn').textContent = 'Loading…';
  document.getElementById('loadMoreBtn').disabled = true;

  // Fetch FitGirl page 1
  const games = await fetchFitGirl(1, 20);

  if (games.length === 0) {
    trendGrid.innerHTML = `<div class="error-msg" style="grid-column:1/-1"><strong>Couldn't load games</strong>FitGirl's API may be temporarily unreachable. Try refreshing.</div>`;
    gamesGrid.innerHTML = `<div class="error-msg" style="grid-column:1/-1"><strong>No games loaded</strong>Check your connection and try again.</div>`;
    document.getElementById('loadMoreBtn').style.display = 'none';
    return;
  }

  allGames = games;

  // Update stat
  document.getElementById('statGames').textContent = allGames.length + '+';

  renderTrending();
  renderGames(true);
}

init();
