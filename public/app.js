// MINIMAL AJAX HELPERS
const api = {
  async get(url) {
    const headers = {};
    if (state.userId) headers['x-user-id'] = state.userId;
    const res = await fetch(url, { headers });
    if (res.status === 401) {
      logout();
      throw new Error('Unauthorized');
    }
    return res.json();
  },
  async post(url, data) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.userId) headers['x-user-id'] = state.userId;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    if (res.status === 401) {
      logout();
      throw new Error('Unauthorized');
    }
    return res.json();
  },
  async put(url, data) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.userId) headers['x-user-id'] = state.userId;
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data)
    });
    if (res.status === 401) {
      logout();
      throw new Error('Unauthorized');
    }
    return res.json();
  },
  async del(url) {
    const headers = {};
    if (state.userId) headers['x-user-id'] = state.userId;
    const res = await fetch(url, { method: 'DELETE', headers });
    if (res.status === 401) {
      logout();
      throw new Error('Unauthorized');
    }
    return res.json();
  }
};

// GLOBALS
const state = {
  page: 'home',
  tab: null,
  shows: [],
  watchlist: [],
  clubs: [],
  user: null,
  analytics: null,
  userId: localStorage.getItem('userId') || null,
  userName: localStorage.getItem('userName') || null
};

// ROUTING
const pages = {
  home: { title: 'Home', render: renderHome },
  discussion: { title: 'Discussion', render: renderClubs },
  discover: { title: 'Discover', render: renderBrowse },
  seasonal: { title: 'Seasonal', tabs: ['Last', 'This Season', 'Next', 'Archive'], render: renderSeasonal },
  mylist: { title: 'My List', tabs: ['All', 'Watching', 'Completed', 'On Hold', 'Dropped', 'Plan to Watch'], render: renderMyList },
  profile: { title: 'Profile', render: renderProfile },
  club: { title: 'Club Discussion', render: renderClubDetail },
  login: { title: 'Login', render: renderLogin },
  register: { title: 'Register', render: renderRegister }
};

async function navTo(pageKey, tab = null) {
  // Auth check
  if (!state.userId && pageKey !== 'login' && pageKey !== 'register') {
    return navTo('login');
  }

  state.page = pageKey;
  if (tab) state.tab = tab;
  else if (pages[pageKey].tabs) state.tab = pages[pageKey].tabs[0];
  else state.tab = 'All';

  // Update Bottom Nav
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === pageKey));

  // Render Top Tabs
  const topNav = document.getElementById('topNav');
  if (pages[pageKey].tabs) {
    topNav.innerHTML = pages[pageKey].tabs.map(t => `<div class="tab-btn ${state.tab === t ? 'active' : ''}" onclick="navTo('${pageKey}', '${t}')">${t}</div>`).join('');
    topNav.style.display = 'flex';
  } else {
    topNav.style.display = 'none';
  }

  // Pre-fetch data based on route
  if (pageKey === 'mylist') {
    state.watchlist = await api.get('/api/watchlist');
  } else if (pageKey === 'discover' || pageKey === 'seasonal' || pageKey === 'home') {
    state.shows = await api.get('/api/shows');
    state.watchlist = await api.get('/api/watchlist');
  } else if (pageKey === 'discussion') {
    state.clubs = await api.get('/api/clubs');
  } else if (pageKey === 'profile') {
    state.user = await api.get('/api/profile');
    state.analytics = await api.get('/api/analytics');
  } else if (pageKey === 'club' && tab) {
    state.currentClub = state.clubs.find(c => c.id == tab) || await api.get('/api/clubs/' + tab);
    state.clubPosts = await api.get('/api/clubs/' + tab + '/posts');
  }

  const main = document.getElementById('mainContent');
  main.innerHTML = `<div class="container animate-in">${await pages[pageKey].render(state.tab)}</div>`;

  // Update header visibility, profile button, and avatar
  updateHeaderAvatar();
  const appHeader = document.querySelector('.app-header');
  const bottomNav = document.querySelector('.bottom-nav');
  if (pageKey === 'login' || pageKey === 'register') {
    if (appHeader) appHeader.style.display = 'none';
    if (bottomNav) bottomNav.style.display = 'none';
  } else {
    if (appHeader) appHeader.style.display = 'flex';
    if (bottomNav) bottomNav.style.display = 'flex';
  }
}

// RENDERERS
async function renderHome() {
  const watching = state.watchlist.filter(w => w.status === 'Watching');
  const trending = [...state.shows].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 8);
  const justAdded = [...state.shows].reverse().slice(0, 8);

  return `
    <div style="margin: -16px; padding-bottom: 20px;">
      <div style="padding: 16px;">
        <h3 class="section-title">Now Watching</h3>
      </div>
      <div class="h-scroll">
        ${watching.length ? watching.map(w => renderMiniCard(w, true)).join('') : '<div style="padding: 0 16px; color: var(--text-muted);">No shows currently watching.</div>'}
      </div>
      
      <div style="padding: 16px;">
        <h3 class="section-title">Trending</h3>
      </div>
      <div class="h-scroll">
        ${trending.map(s => renderMiniCard(s)).join('')}
      </div>

      <div style="padding: 16px;">
        <h3 class="section-title">Just Added</h3>
      </div>
      <div class="h-scroll">
        ${justAdded.map(s => renderMiniCard(s)).join('')}
      </div>
    </div>
  `;
}

async function renderBrowse() {
  return `
    <div style="padding: 16px;">
      <div style="position: relative; margin-bottom: 16px;">
        <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 16px; top: 14px; color: var(--text-light);"></i>
        <input type="text" id="searchInput" class="form-control" placeholder="Search anime, series..." style="padding-left: 44px; border-radius: 24px;" oninput="executeSearch()" value="${state.searchQuery || ''}">
      </div>
      <div id="searchResults">
        ${state.searchResults ? renderSearchResults(state.searchResults) : renderBrowsePlaceholder()}
      </div>
    </div>
  `;
}

function renderBrowsePlaceholder() {
  return `<div style="text-align:center; padding: 60px 20px; display: flex; flex-direction: column; align-items: center;">
    <i class="fa-solid fa-magnifying-glass" style="font-size: 72px; color: #b9bec6; margin-bottom: 24px;"></i>
    <h2 style="color: var(--text-main); font-size: 22px; margin-bottom: 8px;">Discovery Search</h2>
    <p style="color: var(--text-muted); font-size: 16px;">Type above to search shows...</p>
  </div>`;
}

async function executeSearch() {
  const q = document.getElementById('searchInput').value.trim();
  state.searchQuery = q;
  if (!q) {
    state.searchResults = null;
    document.getElementById('searchResults').innerHTML = renderBrowsePlaceholder();
    return;
  }
  document.getElementById('searchResults').innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">Searching...</div>';
  state.searchResults = await api.get('/api/shows?q=' + encodeURIComponent(q));
  document.getElementById('searchResults').innerHTML = renderSearchResults(state.searchResults);
}

function renderSearchResults(results) {
  if (!results || !results.length) return `<div style="text-align:center; padding:40px; color:var(--text-muted);">No shows found.</div>`;
  return `<div class="h-scroll" style="padding-top: 16px;">` + results.map(s => renderMiniCard(s)).join('') + `</div>`;
}

async function renderSeasonal() {
  let filtered = [...state.shows];

  // Provide a fake dynamic filter since we don't have real "seasons"
  // just so the tabs demonstrate changing content
  if (state.tab === 'Last') {
    filtered = filtered.filter((s, i) => i % 2 !== 0);
  } else if (state.tab === 'This Season') {
    filtered = filtered.filter(s => s.releaseYear >= 2018);
  } else if (state.tab === 'Next') {
    filtered = filtered.filter((s, i) => i % 3 === 0);
  } else if (state.tab === 'Archive') {
    filtered = filtered.filter(s => s.releaseYear < 2015);
  }

  if (!filtered.length) return `<div style="text-align:center; padding:40px; color:var(--text-muted);">No shows found in '${state.tab}'.</div>`;

  return `<div class="h-scroll" style="padding-top: 16px;">` + filtered.map(s => renderMiniCard(s)).join('') + `</div>`;
}

async function renderMyList() {
  const filtered = state.tab === 'All' ? state.watchlist : state.watchlist.filter(w => w.status === state.tab);
  if (!filtered.length) return `<div style="text-align:center; padding:40px; color:var(--text-muted);">No shows found in '${state.tab}'.</div>`;

  return `<div class="list-group">` + filtered.map(w => {
    const pct = w.totalEpisodes ? Math.min(100, Math.round((w.watchedEpisodes / w.totalEpisodes) * 100)) : 0;
    let coverStyle = w.coverImage ? `background-image: url('${w.coverImage}'); background-size: cover; background-position: center;` : `background-color: var(--mal-blue); display: flex; align-items: center; justify-content: center; font-size: 2rem;`;

    return `
    <div class="tracker-card" data-status="${w.status}" onclick="openShow(${w.showId})">
      <div class="card-cover" style="${coverStyle}">${w.coverImage ? '' : '📺'}</div>
      <div class="card-body">
        <div>
          <div class="card-title">${w.title}</div>
          <div class="card-meta">${w.status} • ${w.language || 'JP'}</div>
        </div>
        <div>
          <div class="card-progress-row">
             <div class="progress-col">
               <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>
             </div>
             <div class="progress-text">${w.watchedEpisodes} / ${w.totalEpisodes || '?'} EP</div>
          </div>
          <div class="card-actions-row">
            <div class="score-box"><i class="fa-solid fa-star"></i> ${w.rating ?? '-'}</div>
            <div class="action-btns">
              <button class="btn-icon" title="Add 1 Episode" onclick="event.stopPropagation(); incEp(${w.showId}, ${w.watchedEpisodes}, ${w.totalEpisodes})"><i class="fa-solid fa-plus"></i></button>
              <button class="btn-icon" title="Edit Progress" onclick="event.stopPropagation(); editProgress(${w.showId})"><i class="fa-solid fa-pen-to-square"></i></button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('') + `</div>`;
}

async function renderClubs() {
  return `<div style="padding: 16px;">
    <h3 class="section-title">Recently Active Clubs</h3>
  </div>
  <div class="list-group" style="padding-top: 0;">` + state.clubs.map((c, i) => `
    <div style="display: flex; gap: 16px; padding: 16px; background: var(--card-bg); margin-bottom: 2px; border-bottom: 1px solid var(--border-light);">
      <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=random&color=000&size=64&length=2&bold=true" alt="Club Avatar" style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover;" />
      <div style="flex: 1;">
        <h4 style="font-size: 15px; font-weight: 600; margin-bottom: 4px; color: var(--text-main);">${c.name}</h4>
        <p style="font-size: 13px; color: var(--text-muted); line-height: 1.4; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${c.description}</p>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 12px; color: var(--text-light);"><i class="fa-solid fa-users"></i> ${c.memberCount >= 1000 ? (c.memberCount / 1000).toFixed(1) + 'k' : c.memberCount}</div>
          ${c.isMember
      ? `<button style="background: var(--mal-blue); color: #fff; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid var(--mal-blue);" onclick="navTo('club', ${c.id})">Open Chat</button>`
      : `<button style="background: var(--bg-color); color: var(--mal-blue); padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid var(--border);" onclick="joinClub(${c.id}, '${c.name.replace(/'/g, "\\'")}')">Join</button>`
    }
        </div>
      </div>
    </div>
  `).join('') + `</div>`;
}

async function renderProfile() {
  const u = state.user;
  const a = state.analytics;
  const stats = [
    { label: 'Watching', val: a.statusBreakdown['Watching'] || 0, color: 'var(--progress-fill)' },
    { label: 'Completed', val: a.statusBreakdown['Completed'] || 0, color: 'var(--mal-blue)' },
    { label: 'On Hold', val: a.statusBreakdown['On Hold'] || 0, color: '#f59e0b' },
    { label: 'Dropped', val: a.statusBreakdown['Dropped'] || 0, color: '#ef4444' },
    { label: 'Planned', val: a.statusBreakdown['Plan to Watch'] || 0, color: '#9ca3af' }
  ];

  return `
    <div style="background: var(--card-bg); margin: -16px; padding: 24px 16px; border-bottom: 1px solid var(--border); text-align: center;">
      <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=2e51a2&color=fff&size=128&length=2&bold=true" style="width: 100px; height: 100px; border-radius: 50%; margin-bottom: 12px; border: 4px solid var(--border-light);" />
      <h2 style="font-size: 22px; margin-bottom: 4px;">${u.name}</h2>
      <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 16px;">Member since ${new Date(u.createdAt).toLocaleDateString()}</p>
      <div style="display: flex; justify-content: center; gap: 20px; border-top: 1px solid var(--border-light); padding-top: 16px;">
        <div><div style="font-weight: 700; font-size: 18px;">${a.totalShows}</div><div class="text-muted">Shows</div></div>
        <div><div style="font-weight: 700; font-size: 18px;">${a.totalWatched}</div><div class="text-muted">Episodes</div></div>
        <div><div style="font-weight: 700; font-size: 18px;">${Math.round(a.totalMinutes / 60)}</div><div class="text-muted">Hours</div></div>
      </div>
    </div>

    <div style="padding: 16px;">
      <h3 class="section-title">Statistics</h3>
      <div style="background: var(--card-bg); border-radius: 12px; padding: 16px; border: 1px solid var(--border);">
        ${stats.map(s => `
          <div style="margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-weight: 500;">
              <span>${s.label}</span><span>${s.val}</span>
            </div>
            <div style="height: 8px; background: var(--bg-color); border-radius: 4px; overflow: hidden;">
              <div style="width: ${(s.val / a.totalShows * 100) || 0}%; height: 100%; background: ${s.color};"></div>
            </div>
          </div>
        `).join('')}
      </div>

      <h3 class="section-title" style="margin-top: 24px;">Quick Actions</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div style="background: var(--card-bg); padding: 16px; border-radius: 12px; border: 1px solid var(--border); text-align: center; cursor: pointer;" onclick="toast('Copied share link!'); navigator.clipboard.writeText('http://localhost:3000/api/share/${u.shareToken}')">
          <i class="fa-solid fa-share-nodes" style="font-size: 24px; color: var(--mal-blue); margin-bottom: 8px;"></i>
          <div style="font-weight: 600;">Share List</div>
        </div>
        <div style="background: var(--card-bg); padding: 16px; border-radius: 12px; border: 1px solid var(--border); text-align: center; cursor: pointer;" onclick="navTo('mylist')">
          <i class="fa-solid fa-list-check" style="font-size: 24px; color: var(--mal-blue); margin-bottom: 8px;"></i>
          <div style="font-weight: 600;">Manage List</div>
        </div>
      </div>
    </div>
  `;
}

async function renderClubDetail(clubId) {
  const c = state.currentClub;
  const posts = state.clubPosts;

  return `
    <div style="background: var(--card-bg); margin: -16px; padding: 16px; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <button onclick="navTo('discussion')" style="font-size: 18px; color: var(--mal-blue);"><i class="fa-solid fa-arrow-left"></i></button>
        <div>
          <h3 style="font-size: 16px; margin-bottom: 2px;">${c.name}</h3>
          <p style="font-size: 12px; color: var(--text-muted);">${c.memberCount} members</p>
        </div>
      </div>
    </div>

    <div style="padding: 16px 0;">
      <div id="chatFeed">
        ${posts.length ? posts.map(p => `
          <div class="post-card">
            <div class="post-header">
              <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(p.userName)}&background=random&length=2&bold=true" />
              <div class="post-meta">
                <h4>${p.userName}</h4>
                <span>${new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            <div class="post-content ${p.spoiler ? 'spoiler-hidden' : ''}" onclick="this.classList.remove('spoiler-hidden')">
              ${p.spoiler ? '<b>SPOILER:</b> Click to reveal' : p.content}
            </div>
          </div>
        `).join('') : '<div style="text-align:center; padding: 40px; color: var(--text-muted);">No messages yet. Start the conversation!</div>'}
      </div>
    </div>

    <div style="position: fixed; bottom: var(--bottom-nav-height); left: 0; right: 0; background: #fff; padding: 12px 16px; border-top: 1px solid var(--border); display: flex; gap: 12px; max-width: 800px; margin: 0 auto;">
      <input type="text" id="postMsg" class="form-control" placeholder="Type a message..." style="background: var(--bg-color); border: none;" onkeyup="if(event.key==='Enter') addPost(${clubId})">
      <button class="btn-primary" style="width: auto; padding: 0 20px;" onclick="addPost(${clubId})">Send</button>
    </div>
  `;
}

async function renderLogin() {
  return `
    <div style="max-width: 400px; margin: 100px auto; padding: 32px; background: var(--card-bg); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <div style="text-align: center; margin-bottom: 32px;">
        <h2 style="font-size: 24px; color: var(--mal-blue);">Welcome Back</h2>
        <p style="color: var(--text-muted);">Sign in to your account</p>
      </div>
      <div class="form-group">
        <label>Email Address</label>
        <input type="email" id="loginEmail" class="form-control" placeholder="user@example.com">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="loginPass" class="form-control" placeholder="••••••••">
      </div>
      <button class="btn-primary" onclick="handleLogin()">Sign In</button>
      <div style="text-align: center; margin-top: 24px; font-size: 14px; color: var(--text-muted);">
        Don't have an account? <a href="#" onclick="navTo('register')" style="color: var(--mal-blue); font-weight: 600;">Create one</a>
      </div>
    </div>
  `;
}

async function renderRegister() {
  return `
    <div style="max-width: 400px; margin: 100px auto; padding: 32px; background: var(--card-bg); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <div style="text-align: center; margin-bottom: 32px;">
        <h2 style="font-size: 24px; color: var(--mal-blue);">Create Account</h2>
        <p style="color: var(--text-muted);">Join the AnimeTrack community</p>
      </div>
      <div class="form-group">
        <label>Display Name</label>
        <input type="text" id="regName" class="form-control" placeholder="John Doe">
      </div>
      <div class="form-group">
        <label>Email Address</label>
        <input type="email" id="regEmail" class="form-control" placeholder="user@example.com">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="regPass" class="form-control" placeholder="••••••••">
      </div>
      <button class="btn-primary" onclick="handleRegister()">Sign Up</button>
      <div style="text-align: center; margin-top: 24px; font-size: 14px; color: var(--text-muted);">
        Already have an account? <a href="#" onclick="navTo('login')" style="color: var(--mal-blue); font-weight: 600;">Sign in</a>
      </div>
    </div>
  `;
}

// ACTIONS & MODALS
async function incEp(showId, current, total) {
  if (total && current >= total) { toast('Already completed!'); return; }
  const next = current + 1;
  const status = (total && next >= total) ? 'Completed' : 'Watching';
  await api.put('/api/watchlist/' + showId, { watchedEpisodes: next, status });
  toast(`Episode ${next} tracked!`);
  navTo(state.page, state.tab);
}

async function joinClub(clubId, clubName) {
  await api.post('/api/clubs/' + clubId + '/join', {});
  toast('Joined ' + clubName + '!');
  state.clubs = await api.get('/api/clubs');
  navTo(state.page, state.tab);
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPass').value;
  if (!email || !password) return toast('Please fill all fields');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.error) return toast(data.error);

    state.userId = data.userId;
    state.userName = data.name;
    localStorage.setItem('userId', data.userId);
    localStorage.setItem('userName', data.name);
    updateHeaderAvatar();
    toast('Welcome back, ' + data.name + '!');
    navTo('home');
  } catch (err) {
    console.error('Login Error:', err);
    toast('Server connection failed. Please try again.');
  }
}

async function handleRegister() {
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPass').value;
  if (!name || !email || !password) return toast('Please fill all fields');

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();

    if (data.error) return toast(data.error);

    state.userId = data.userId;
    state.userName = data.name;
    localStorage.setItem('userId', data.userId);
    localStorage.setItem('userName', data.name);
    updateHeaderAvatar();
    toast('Account created! Welcome, ' + data.name + '!');
    navTo('home');
  } catch (err) {
    console.error('Register Error:', err);
    toast('Sign up failed. Please check your network.');
  }
}

function logout() {
  localStorage.removeItem('userId');
  localStorage.removeItem('userName');
  state.userId = null;
  state.userName = null;
  toast('Logged out successfully');
  navTo('login');
}

async function addPost(clubId) {
  const content = document.getElementById('postMsg').value.trim();
  if (!content) return;
  await api.post(`/api/clubs/${clubId}/posts`, { content });
  document.getElementById('postMsg').value = '';
  state.clubPosts = await api.get(`/api/clubs/${clubId}/posts`);
  // Re-render chat feed only to avoid jumpy scroll
  const feed = document.getElementById('chatFeed');
  if (feed) feed.innerHTML = state.clubPosts.map(p => `
    <div class="post-card">
      <div class="post-header">
        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(p.userName)}&background=random&length=2&bold=true" />
        <div class="post-meta">
          <h4>${p.userName}</h4>
          <span>${new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
      <div class="post-content ${p.spoiler ? 'spoiler-hidden' : ''}" onclick="this.classList.remove('spoiler-hidden')">
        ${p.spoiler ? '<b>SPOILER:</b> Click to reveal' : p.content}
      </div>
    </div>
  `).join('');
}

function updateNotificationDot() {
  const unread = state.notifications.filter(n => !n.isRead).length;
  const bell = document.getElementById('bellBtn');
  if (!bell) return;
  let dot = bell.querySelector('.noti-dot');
  if (unread > 0) {
    if (!dot) {
      dot = document.createElement('div');
      dot.className = 'noti-dot';
      bell.appendChild(dot);
    }
  } else if (dot) {
    dot.remove();
  }
}

async function openNotifications() {
  const modal = `
    <div class="modal-overlay open" onclick="closeModal()">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>Notifications</h3>
          <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body" style="padding: 0;">
          ${state.notifications.length ? state.notifications.map(n => `
            <div style="padding: 16px; border-bottom: 1px solid var(--border-light); background: ${n.isRead ? 'transparent' : '#f0f4ff'};">
              <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                ${n.title} ${!n.isRead ? '<span style="width: 8px; height: 8px; background: red; border-radius: 50%;"></span>' : ''}
              </div>
              <div style="font-size: 13px; color: var(--text-muted);">${n.message}</div>
              <div style="font-size: 11px; color: var(--text-light); margin-top: 8px;">${new Date(n.createdAt).toLocaleString()}</div>
            </div>
          `).join('') : '<div style="padding: 40px; text-align: center; color: var(--text-muted);">No notifications yet.</div>'}
        </div>
      </div>
    </div>
  `;
  document.getElementById('modalContainer').innerHTML = modal;

  // Mark all as read
  if (state.notifications.some(n => !n.isRead)) {
    await api.put('/api/notifications/read', {});
    state.notifications.forEach(n => n.isRead = true);
    updateNotificationDot();
  }
}

async function editProgress(showId) {
  const show = state.shows.find(s => s.id === showId) || await api.get('/api/shows/' + showId);
  const wlEntry = state.watchlist.find(w => w.showId === showId) || { status: 'Watching', watchedEpisodes: 0, rating: null };
  const statuses = ['Watching', 'Completed', 'On Hold', 'Dropped', 'Plan to Watch'];

  const html = `
    <div class="modal-header"><h3>Update Status</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
    <div class="modal-body">
      <h4 style="margin-bottom:16px;">${show.title}</h4>
      <div class="form-group">
        <label>Status</label>
        <div class="status-pill-list">
          ${statuses.map(s => `<div class="status-pill ${wlEntry.status === s ? 'active' : ''}" onclick="document.querySelectorAll('.status-pill').forEach(e=>e.classList.remove('active')); this.classList.add('active'); document.getElementById('m_status').value='${s}';">${s}</div>`).join('')}
        </div>
        <input type="hidden" id="m_status" value="${wlEntry.status}">
      </div>
      <div class="form-group">
        <label>Episodes Watched</label>
        <div class="stepper">
          <button class="stepper-btn" onclick="document.getElementById('m_ep').stepDown()">-</button>
          <input type="number" id="m_ep" class="stepper-val" style="border:none; width:80px;" value="${wlEntry.watchedEpisodes}" min="0" max="${show.totalEpisodes || 9999}">
          <button class="stepper-btn" onclick="document.getElementById('m_ep').stepUp()">+</button>
        </div>
        <div style="text-align:center; margin-top:8px; color:var(--text-light); font-size:12px;">Out of ${show.totalEpisodes || '?'}</div>
      </div>
      <div class="form-group">
        <label>Score (1-10)</label>
        <input type="number" id="m_score" class="form-control" value="${wlEntry.rating || ''}" min="1" max="10" placeholder="Optional">
      </div>
      <button class="btn-primary" onclick="saveProgress(${showId})">Save Update</button>
    </div>`;
  openModal(html);
}

async function openShow(showId) {
  const s = await api.get('/api/shows/' + showId);
  let coverStyle = s.coverImage ? `background-image: url('${s.coverImage}'); background-size: cover; background-position: center; width: 120px; height: 160px; margin: 0 auto; border-radius: 8px;` : `background-color: var(--mal-blue); display: flex; align-items: center; justify-content: center; font-size: 80px; width: 120px; height: 160px; margin: 0 auto; border-radius: 8px;`;
  let coverContent = s.coverImage ? '' : '📺';

  openModal(`
    <div class="modal-header"><h3>Show Info</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
    <div class="modal-body" style="text-align:center;">
      <div style="${coverStyle}">${coverContent}</div>
      <h2 style="margin:12px 0;">${s.title}</h2>
      <div class="score-box" style="justify-content:center; font-size:18px; margin-bottom:16px;"><i class="fa-solid fa-star"></i> ${s.score ?? (s.rating ?? 'N/A')} Score</div>
      <p style="text-align:left; color:var(--text-muted); line-height:1.6; margin-bottom:20px;">${s.description}</p>
      <div style="display:flex; justify-content:space-between; text-align:left; background:var(--bg-color); padding:16px; border-radius:8px;">
        <div><div class="text-muted">Episodes</div><div style="font-weight:600;">${s.totalEpisodes || '?'}</div></div>
        <div><div class="text-muted">Aired</div><div style="font-weight:600;">${s.releaseYear}</div></div>
        <div><div class="text-muted">Studio</div><div style="font-weight:600;">MAPPA</div></div>
      </div>
    </div>
  `);
}

async function saveProgress(showId) {
  const b = { status: document.getElementById('m_status').value, watchedEpisodes: parseInt(document.getElementById('m_ep').value), rating: document.getElementById('m_score').value || null };
  await api.put('/api/watchlist/' + showId, b);
  closeModal(); toast('Saved!'); navTo(state.page, state.tab);
}

// UI HELPERS
function openModal(html) {
  const m = document.getElementById('modalContainer');
  m.innerHTML = `<div class="modal-overlay open" onclick="if(event.target===this) closeModal()"><div class="modal-content">${html}</div></div>`;
}
function closeModal() { document.getElementById('modalContainer').innerHTML = ''; }

function renderMiniCard(s, isWl = false) {
  let coverStyle = s.coverImage ? `background-image: url('${s.coverImage}'); background-size: cover; background-position: center;` : `background-color: var(--mal-blue); display: flex; align-items: center; justify-content: center; font-size: 3rem;`;
  let id = isWl ? s.showId : s.id;
  return `
    <div class="show-card-mini" onclick="openShow(${id})">
      <div class="sc-cover" style="${coverStyle}">${s.coverImage ? '' : '📺'}
        <div class="sc-score-badge"><i class="fa-solid fa-star"></i> ${s.score ?? (s.rating ?? 'N/A')}</div>
        <div class="sc-add-btn" title="Add to List" onclick="event.stopPropagation(); editProgress(${id})"><i class="fa-solid fa-plus"></i></div>
      </div>
      <div class="sc-body">
        <div class="sc-title">${s.title}</div>
        <div class="sc-meta">${s.releaseYear || ''}</div>
      </div>
    </div>
  `;
}

function updateHeaderAvatar() {
  const profileBtn = document.getElementById('profileBtn');
  if (profileBtn && state.userName) {
    profileBtn.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(state.userName)}&background=ffffff&color=2e51a2&length=2&bold=true`;
  }
}

let toastTimer;
function toast(msg) {
  const tc = document.getElementById('toastContainer');
  const t = document.createElement('div'); t.className = 'toast'; t.innerText = msg;
  tc.appendChild(t); setTimeout(() => t.remove(), 2500);
}

// INIT
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => navTo(b.dataset.page)));
document.addEventListener('DOMContentLoaded', () => {
  if (!state.userId) {
    navTo('login');
  } else {
    navTo('home');
  }
});
