// ═══════════════════════════════════════════════
// Scout Dashboard — Giveaway Idea Explorer
// ═══════════════════════════════════════════════

let scData = null;       // Current run summary data
let scRuns = [];         // Available run list
let scTab = 'posts';     // Active tab
let scSelectedPost = null;
let scInited = false;

// ── Init ──
async function scInit() {
  if (scInited) return;
  scInited = true;
  await scLoadRuns();
  scLoadAccounts(); // fire-and-forget
}

// ── Load available runs ──
async function scLoadRuns() {
  try {
    const res = await fetch('/api/scout/runs');
    const json = await res.json();
    if (!json.ok) return;
    scRuns = json.runs;
    const sel = document.getElementById('scRunSelect');
    if (!scRuns.length) {
      sel.innerHTML = '<option value="">No scout runs found</option>';
      return;
    }
    sel.innerHTML = scRuns.map(r =>
      `<option value="${r.filename}">${r.label}</option>`
    ).join('');
    // Auto-load the most recent run
    scSelectRun(scRuns[0].filename);
  } catch (e) {
    console.error('Scout: failed to load runs', e);
  }
}

// ── Select a run ──
async function scSelectRun(filename) {
  if (!filename) return;
  try {
    const res = await fetch(`/api/scout/summary/${filename}`);
    const json = await res.json();
    if (!json.ok) return;
    scData = json.data;
    scSelectedPost = null;
    scPopulateFilters();
    scRender();
  } catch (e) {
    console.error('Scout: failed to load summary', e);
  }
}

// ── Populate dynamic filter options ──
function scPopulateFilters() {
  if (!scData) return;
  const posts = scData.giveawayPosts || [];

  // Offer types
  const offers = new Set();
  posts.forEach(p => {
    const t = scExtractOfferType(p.caption || '');
    if (t) offers.add(t);
  });
  const offerSel = document.getElementById('scOfferFilter');
  offerSel.innerHTML = '<option value="all">All Offers</option>' +
    [...offers].sort().map(o => `<option value="${o}">${o}</option>`).join('');

  // Accounts
  const accts = new Set();
  posts.forEach(p => { if (p.ownerUsername) accts.add(p.ownerUsername); });
  const acctSel = document.getElementById('scAccountFilter');
  acctSel.innerHTML = '<option value="all">All Accounts</option>' +
    [...accts].sort().map(a => `<option value="${a}">@${a}</option>`).join('');
}

// ── Master render ──
function scRender() {
  if (!scData) return;
  scRenderStats();
  scRenderPosts();
  scRenderAccounts();
  scRenderInsights();
}

// ── Stats header ──
function scRenderStats() {
  const d = scData;
  document.getElementById('scStatAccounts').textContent = (d.totalAccounts || 0).toLocaleString();
  document.getElementById('scStatPosts').textContent = (d.totalPosts || 0).toLocaleString();
  document.getElementById('scStatGiveaways').textContent = (d.totalGiveaways || 0).toLocaleString();
  const rate = d.totalPosts ? Math.round((d.totalGiveaways / d.totalPosts) * 100) : 0;
  document.getElementById('scStatRate').textContent = rate + '%';
}

// ═══ SCORING ═══

function scScorePost(post) {
  const c = post.commentsCount || 0;
  const days = (Date.now() - new Date(post.timestamp).getTime()) / 86400000;
  const cap = (post.caption || '').toLowerCase();

  // Engagement (weight 3x) — out of 5
  const eng = c >= 10000 ? 5 : c >= 5000 ? 4 : c >= 1000 ? 3 : c >= 500 ? 2 : 1;

  // Replicability (weight 2x) — based on offer type
  const offer = scExtractOfferType(cap);
  const rep = ['Prompt Pack', 'Checklist'].includes(offer) ? 5
    : ['Template', 'Resource List', 'Swipe File'].includes(offer) ? 4
    : ['Guide/PDF', 'Cheat Sheet'].includes(offer) ? 4
    : ['Mini Course', 'Video Training'].includes(offer) ? 3 : 2;

  // Specificity (weight 2x)
  const hasNum = /\d+/.test(cap);
  const hasTopic = /prompt|workflow|ugc|clone|skin|cinematic|realistic|influencer|effect|avatar|nano|4k|hq|quality/.test(cap);
  const spec = (hasNum && hasTopic) ? 5 : hasTopic ? 4 : hasNum ? 3 : 2;

  // Cross-platform (weight 1x)
  const cross = /comment\s*["'""\u201C\u201D]\w+/i.test(cap) ? 5 : /dm\s+me/i.test(cap) ? 3 : 2;

  // Freshness (weight 1x)
  const fresh = days < 30 ? 5 : days < 90 ? 4 : days < 180 ? 3 : 2;

  const total = (eng * 3) + (rep * 2) + (spec * 2) + cross + fresh;
  return { total, max: 45, breakdown: { eng, rep, spec, cross, fresh } };
}

function scExtractOfferType(caption) {
  const c = (caption || '').toLowerCase();
  if (/prompt/.test(c)) return 'Prompt Pack';
  if (/checklist/.test(c)) return 'Checklist';
  if (/template/.test(c)) return 'Template';
  if (/swipe/.test(c)) return 'Swipe File';
  if (/cheat\s*sheet/.test(c)) return 'Cheat Sheet';
  if (/guide|pdf|ebook|doc\b/.test(c)) return 'Guide/PDF';
  if (/course|training|lesson/.test(c)) return 'Mini Course';
  if (/tool|calculator/.test(c)) return 'Tool';
  if (/script/.test(c)) return 'Script';
  if (/list|resource/.test(c)) return 'Resource List';
  if (/workflow|system|stack/.test(c)) return 'Workflow';
  if (/video|tutorial/.test(c)) return 'Video Training';
  return 'Other';
}

function scTimeAgo(timestamp) {
  if (!timestamp) return '';
  const ms = Date.now() - new Date(timestamp).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return days + 'd ago';
  const weeks = Math.floor(days / 7);
  if (days < 30) return weeks + 'w ago';
  const months = Math.floor(days / 30);
  return months + 'mo ago';
}

function scExtractKeyword(caption) {
  const m = (caption || '').match(/(?:comment|type|drop|say)\s+["'""\u201C\u201D]?(\w+)["'""\u201C\u201D]?/i);
  return m ? m[1].toUpperCase() : null;
}

// ═══ POSTS TAB ═══

function scGetFilteredPosts() {
  if (!scData) return [];
  let posts = (scData.giveawayPosts || []).slice();

  // Add score to each
  posts = posts.map(p => ({ ...p, _score: scScorePost(p), _offer: scExtractOfferType(p.caption), _keyword: scExtractKeyword(p.caption) }));

  // Filters
  const typeFilter = document.getElementById('scTypeFilter').value;
  const offerFilter = document.getElementById('scOfferFilter').value;
  const minComments = parseInt(document.getElementById('scMinComments').value) || 0;
  const accountFilter = document.getElementById('scAccountFilter').value;

  if (typeFilter !== 'all') posts = posts.filter(p => p.type === typeFilter);
  if (offerFilter !== 'all') posts = posts.filter(p => p._offer === offerFilter);
  if (minComments > 0) posts = posts.filter(p => (p.commentsCount || 0) >= minComments);
  if (accountFilter !== 'all') posts = posts.filter(p => p.ownerUsername === accountFilter);

  // Sort
  const sort = document.getElementById('scSortSelect').value;
  posts.sort((a, b) => {
    if (sort === 'score') return b._score.total - a._score.total;
    if (sort === 'comments') return (b.commentsCount || 0) - (a.commentsCount || 0);
    if (sort === 'likes') return (b.likesCount || 0) - (a.likesCount || 0);
    if (sort === 'views') return (b.videoViewCount || 0) - (a.videoViewCount || 0);
    if (sort === 'date') return new Date(b.timestamp) - new Date(a.timestamp);
    return 0;
  });

  return posts;
}

function scRenderPosts() {
  const posts = scGetFilteredPosts();
  const list = document.getElementById('scPostList');

  if (!posts.length) {
    list.innerHTML = '<div class="sc-empty">No posts match your filters</div>';
    return;
  }

  list.innerHTML = posts.map((p, i) => {
    const rank = i + 1;
    const score = p._score;
    const keyword = p._keyword;
    const offer = p._offer;
    const caption = (p.caption || '').slice(0, 80).replace(/</g, '&lt;');
    const isSelected = scSelectedPost && scSelectedPost.postId === p.postId;

    const age = scTimeAgo(p.timestamp);
    const isNew = p._isNew;

    return `<div class="sc-post-card${isSelected ? ' selected' : ''}" onclick="scSelectPost('${p.postId}')">
      <div class="sc-post-rank ${rank <= 3 ? 'top3' : ''}">#${rank}</div>
      <div class="sc-post-thumb" style="background-image:url('${scImgUrl(p.displayUrl)}')"></div>
      <div class="sc-post-info">
        <div class="sc-post-account">@${p.ownerUsername || 'unknown'}${age ? `<span class="sc-post-age">${age}</span>` : ''}${isNew ? '<span class="sc-new-badge">NEW</span>' : ''}</div>
        <div class="sc-post-caption">${caption}${(p.caption || '').length > 80 ? '...' : ''}</div>
        <div class="sc-post-metrics">
          <span title="Comments">\uD83D\uDCAC ${scFmt(p.commentsCount)}</span>
          <span title="Likes">\u2764\uFE0F ${scFmt(p.likesCount)}</span>
          ${p.videoViewCount ? `<span title="Views">\uD83D\uDC41 ${scFmt(p.videoViewCount)}</span>` : ''}
        </div>
        <div class="sc-post-badges">
          <span class="sc-score-pill">${score.total}/${score.max}</span>
          ${keyword ? `<span class="sc-keyword-badge">${keyword}</span>` : ''}
          <span class="sc-offer-badge">${offer}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function scSelectPost(postId) {
  const posts = scGetFilteredPosts();
  const post = posts.find(p => p.postId === postId);
  if (!post) return;
  scSelectedPost = post;
  scRenderPosts(); // Re-render to show selection
  scRenderDetail(post);
}

function scRenderDetail(post) {
  const panel = document.getElementById('scDetailPanel');
  const score = post._score;
  const keyword = post._keyword;
  const offer = post._offer;
  const date = post.timestamp ? new Date(post.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const duration = post.videoDuration ? Math.round(post.videoDuration) + 's' : '';
  const caption = (post.caption || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');

  const factors = [
    { label: 'Engagement', value: score.breakdown.eng, max: 5, weight: '3x' },
    { label: 'Replicable', value: score.breakdown.rep, max: 5, weight: '2x' },
    { label: 'Specificity', value: score.breakdown.spec, max: 5, weight: '2x' },
    { label: 'Cross-plat', value: score.breakdown.cross, max: 5, weight: '1x' },
    { label: 'Freshness', value: score.breakdown.fresh, max: 5, weight: '1x' },
  ];

  panel.innerHTML = `
    <div class="sc-detail-inner">
      ${post.displayUrl ? `<div class="sc-detail-thumb" style="background-image:url('${scImgUrl(post.displayUrl)}')"></div>` : ''}
      <div class="sc-detail-header">
        <div class="sc-detail-account">@${post.ownerUsername || 'unknown'}</div>
        <div class="sc-detail-name">${post.ownerFullName || ''}</div>
        <div class="sc-detail-meta">${date}${post.type ? ' \u00B7 ' + post.type : ''}${duration ? ' \u00B7 ' + duration : ''}</div>
      </div>

      <div class="sc-detail-score-section">
        <div class="sc-detail-score-header">
          <span>SCORE</span>
          <span class="sc-detail-score-total">${score.total}/${score.max}</span>
        </div>
        ${factors.map(f => `
          <div class="sc-score-row">
            <span class="sc-score-label">${f.label} <span class="sc-score-weight">${f.weight}</span></span>
            <div class="sc-score-bar-track">
              <div class="sc-score-bar-fill" style="width:${(f.value / f.max) * 100}%"></div>
            </div>
            <span class="sc-score-val">${f.value}/${f.max}</span>
          </div>
        `).join('')}
      </div>

      <div class="sc-detail-section">
        <div class="sc-detail-section-title">CAPTION</div>
        <div class="sc-detail-caption">${caption}</div>
      </div>

      <div class="sc-detail-section">
        <div class="sc-detail-tags">
          ${keyword ? `<div><span class="sc-detail-label">KEYWORD</span> <span class="sc-keyword-badge">${keyword}</span></div>` : ''}
          <div><span class="sc-detail-label">OFFER</span> <span class="sc-offer-badge">${offer}</span></div>
          <div><span class="sc-detail-label">TYPE</span> <span class="sc-type-badge">${post.type || 'Post'}</span></div>
        </div>
      </div>

      <div class="sc-detail-metrics-grid">
        <div class="sc-detail-metric"><div class="sc-detail-metric-val">${scFmt(post.commentsCount)}</div><div class="sc-detail-metric-label">Comments</div></div>
        <div class="sc-detail-metric"><div class="sc-detail-metric-val">${scFmt(post.likesCount)}</div><div class="sc-detail-metric-label">Likes</div></div>
        ${post.videoViewCount ? `<div class="sc-detail-metric"><div class="sc-detail-metric-val">${scFmt(post.videoViewCount)}</div><div class="sc-detail-metric-label">Views</div></div>` : ''}
      </div>

      <a class="sc-detail-link" href="${post.url || '#'}" target="_blank" rel="noopener">Open on Instagram \u2197</a>
    </div>
  `;
}

// ═══ ACCOUNTS TAB ═══

function scRenderAccounts() {
  const container = document.getElementById('scAccountList');
  if (!scData) return;

  const stats = scData.accountStats || {};
  const accounts = Object.entries(stats)
    .map(([username, s]) => ({
      username,
      fullName: s.fullName || username,
      totalPosts: s.totalPosts || 0,
      giveawayCount: s.giveawayPosts || s.giveawayCount || 0,
      rate: s.totalPosts ? Math.round(((s.giveawayPosts || s.giveawayCount || 0) / s.totalPosts) * 100) : 0,
      totalComments: s.totalComments || 0,
      totalLikes: s.totalLikes || 0,
      topPost: s.topPost || null
    }))
    .sort((a, b) => b.totalComments - a.totalComments);

  if (!accounts.length) {
    container.innerHTML = '<div class="sc-empty">No account data available</div>';
    return;
  }

  container.innerHTML = accounts.map((a, i) => {
    const topCaption = a.topPost ? (a.topPost.caption || '').slice(0, 60).replace(/</g, '&lt;') : '';
    const topComments = a.topPost ? scFmt(a.topPost.commentsCount) : '—';
    const topKeyword = a.topPost ? scExtractKeyword(a.topPost.caption) : null;
    return `<div class="sc-account-card">
      <div class="sc-account-rank">#${i + 1}</div>
      <div class="sc-account-info">
        <div class="sc-account-header">
          <span class="sc-account-username">@${a.username}</span>
          <span class="sc-account-fullname">${a.fullName}</span>
        </div>
        <div class="sc-account-bar-row">
          <span class="sc-account-rate-label">${a.giveawayCount}/${a.totalPosts} giveaways (${a.rate}%)</span>
          <div class="sc-account-bar-track">
            <div class="sc-account-bar-fill" style="width:${a.rate}%"></div>
          </div>
          <span class="sc-account-engagement">${scFmt(a.totalComments)} comments</span>
        </div>
        ${a.topPost ? `<div class="sc-account-top">Top: "${topCaption}${topCaption.length >= 60 ? '...' : ''}" \u00B7 ${topComments} comments${topKeyword ? ' \u00B7 ' + topKeyword : ''}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ═══ INSIGHTS TAB ═══

function scRenderInsights() {
  const grid = document.getElementById('scInsightsGrid');
  if (!scData || !scData.giveawayPosts || !scData.giveawayPosts.length) {
    grid.innerHTML = '<div class="sc-empty">No data to compute insights</div>';
    return;
  }

  const posts = scData.giveawayPosts;

  // Most common offer type
  const offerCounts = {};
  posts.forEach(p => {
    const o = scExtractOfferType(p.caption);
    offerCounts[o] = (offerCounts[o] || 0) + 1;
  });
  const topOffer = Object.entries(offerCounts).sort((a, b) => b[1] - a[1])[0];
  const topOfferPct = topOffer ? Math.round((topOffer[1] / posts.length) * 100) : 0;

  // Average comments
  const avgComments = Math.round(posts.reduce((s, p) => s + (p.commentsCount || 0), 0) / posts.length);

  // Best format
  const formatCounts = {};
  const formatComments = {};
  posts.forEach(p => {
    const t = p.type || 'Other';
    formatCounts[t] = (formatCounts[t] || 0) + 1;
    formatComments[t] = (formatComments[t] || 0) + (p.commentsCount || 0);
  });
  const bestFormat = Object.entries(formatComments).sort((a, b) => b[1] - a[1])[0];
  const bestFormatAvg = bestFormat ? Math.round(formatComments[bestFormat[0]] / formatCounts[bestFormat[0]]) : 0;

  // Top 5 CTA keywords
  const kwCounts = {};
  posts.forEach(p => {
    const kw = scExtractKeyword(p.caption);
    if (kw) kwCounts[kw] = (kwCounts[kw] || 0) + 1;
  });
  const topKeywords = Object.entries(kwCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // 100% giveaway rate accounts
  const stats = scData.accountStats || {};
  const perfectAccounts = Object.entries(stats)
    .filter(([, s]) => s.totalPosts > 0 && (s.giveawayPosts || s.giveawayCount || 0) === s.totalPosts)
    .map(([u]) => '@' + u);

  // Freshest high-performer
  const now = Date.now();
  const highPerformers = posts
    .filter(p => (p.commentsCount || 0) >= 10000)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const freshest = highPerformers[0];
  const freshestAge = freshest ? Math.round((now - new Date(freshest.timestamp).getTime()) / 86400000) : null;

  // Average score
  const scores = posts.map(p => scScorePost(p).total);
  const avgScore = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);

  grid.innerHTML = `
    <div class="sc-insight-card">
      <div class="sc-insight-icon">\uD83C\uDFC6</div>
      <div class="sc-insight-title">Top Offer Type</div>
      <div class="sc-insight-value">${topOffer ? topOffer[0] : '—'}</div>
      <div class="sc-insight-detail">${topOfferPct}% of giveaways (${topOffer ? topOffer[1] : 0} posts)</div>
    </div>
    <div class="sc-insight-card">
      <div class="sc-insight-icon">\uD83D\uDCAC</div>
      <div class="sc-insight-title">Avg Comments</div>
      <div class="sc-insight-value">${scFmt(avgComments)}</div>
      <div class="sc-insight-detail">Per giveaway post</div>
    </div>
    <div class="sc-insight-card">
      <div class="sc-insight-icon">\uD83C\uDFAC</div>
      <div class="sc-insight-title">Best Format</div>
      <div class="sc-insight-value">${bestFormat ? bestFormat[0] : '—'}</div>
      <div class="sc-insight-detail">${scFmt(bestFormatAvg)} avg comments (${bestFormat ? formatCounts[bestFormat[0]] : 0} posts)</div>
    </div>
    <div class="sc-insight-card">
      <div class="sc-insight-icon">\u2B50</div>
      <div class="sc-insight-title">Avg Score</div>
      <div class="sc-insight-value">${avgScore}/45</div>
      <div class="sc-insight-detail">Across ${posts.length} giveaway posts</div>
    </div>
    <div class="sc-insight-card sc-insight-wide">
      <div class="sc-insight-icon">\uD83D\uDD11</div>
      <div class="sc-insight-title">Top CTA Keywords</div>
      <div class="sc-insight-keywords">
        ${topKeywords.map(([kw, cnt]) => `<span class="sc-keyword-badge">${kw} <small>(${cnt})</small></span>`).join(' ')}
        ${topKeywords.length === 0 ? '<span style="color:rgba(255,255,255,0.3)">No keywords detected</span>' : ''}
      </div>
    </div>
    <div class="sc-insight-card sc-insight-wide">
      <div class="sc-insight-icon">\uD83D\uDCAF</div>
      <div class="sc-insight-title">100% Giveaway Rate</div>
      <div class="sc-insight-detail">${perfectAccounts.length ? perfectAccounts.join(', ') : 'None'}</div>
    </div>
    ${freshest ? `
    <div class="sc-insight-card sc-insight-wide">
      <div class="sc-insight-icon">\uD83D\uDD25</div>
      <div class="sc-insight-title">Freshest Hit</div>
      <div class="sc-insight-value">@${freshest.ownerUsername}</div>
      <div class="sc-insight-detail">${scFmt(freshest.commentsCount)} comments \u00B7 ${freshestAge} days ago \u00B7 "${(freshest.caption || '').slice(0, 50).replace(/</g, '&lt;')}..."</div>
    </div>` : ''}
  `;
}

// ═══ TAB SWITCHING ═══

function scSwitchTab(tab) {
  scTab = tab;
  document.querySelectorAll('.sc-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('scTabPosts').classList.toggle('active', tab === 'posts');
  document.getElementById('scTabAccounts').classList.toggle('active', tab === 'accounts');
  document.getElementById('scTabInsights').classList.toggle('active', tab === 'insights');
  document.getElementById('scFilters').style.display = tab === 'posts' ? '' : 'none';
}

function scApplyFilters() {
  scRenderPosts();
}

// ═══ HELPERS ═══

function scFmt(n) {
  if (n == null) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function scImgUrl(url) {
  if (!url) return '';
  return '/api/scout/img?url=' + encodeURIComponent(url);
}

// ═══ ACCOUNT MANAGEMENT ═══

let scAccountPanelOpen = false;
let scAccounts = [];

function scCleanUsernames(rawText) {
  return [...new Set(
    rawText.split(/[\n,;\s]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
        s = s.replace(/\/+$/, '').replace(/\?.*$/, '');
        s = s.replace(/^@/, '');
        return s.toLowerCase();
      })
      .filter(s => s && /^[a-z0-9_.]+$/.test(s))
  )];
}

async function scLoadAccounts() {
  try {
    const res = await fetch('/api/scout/accounts');
    const json = await res.json();
    if (json.ok) scAccounts = json.accounts;
    const badge = document.getElementById('scHeaderAcctCount');
    if (badge) badge.textContent = scAccounts.length;
  } catch (e) {
    console.error('Scout: failed to load accounts', e);
  }
}

function scToggleAccountPanel() {
  scAccountPanelOpen = !scAccountPanelOpen;
  const panel = document.getElementById('scAccountPanel');
  panel.classList.toggle('active', scAccountPanelOpen);
  if (scAccountPanelOpen) {
    scLoadAccounts().then(() => scRenderAccountPanel());
  }
}

function scRenderAccountPanel() {
  const list = document.getElementById('scAccountPanelList');
  const countEl = document.getElementById('scAccountPanelCount');
  countEl.textContent = `${scAccounts.length} accounts`;
  const badge = document.getElementById('scHeaderAcctCount');
  if (badge) badge.textContent = scAccounts.length;

  list.innerHTML = scAccounts.map(username => `
    <div class="sc-acct-item">
      <span class="sc-acct-name">@${username}</span>
      <button class="sc-acct-remove" onclick="scRemoveAccount('${username}')" title="Remove">&times;</button>
    </div>
  `).join('') || '<div class="sc-acct-empty">No accounts added yet</div>';
}

function scRemoveAccount(username) {
  scAccounts = scAccounts.filter(a => a !== username);
  scRenderAccountPanel();
  scSaveAccounts();
}

function scAddAccountsFromInput() {
  const textarea = document.getElementById('scAccountInput');
  const raw = textarea.value;
  if (!raw.trim()) return;

  const newUsernames = scCleanUsernames(raw);
  const before = scAccounts.length;
  scAccounts = [...new Set([...scAccounts, ...newUsernames])];
  const added = scAccounts.length - before;
  textarea.value = '';
  scRenderAccountPanel();
  scSaveAccounts();

  const btn = document.getElementById('scAddAccountsBtn');
  const orig = btn.textContent;
  btn.textContent = added > 0 ? `Added ${added} account${added !== 1 ? 's' : ''}` : 'No new accounts';
  setTimeout(() => btn.textContent = orig, 2000);
}

async function scSaveAccounts() {
  try {
    await fetch('/api/scout/accounts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accounts: scAccounts }),
    });
  } catch (e) {
    console.error('Scout: failed to save accounts', e);
  }
}

// ═══ START SCOUT + PROGRESS ═══

let scPollingInterval = null;

async function scStartScout(mode) {
  mode = mode || 'full';
  const btn = document.getElementById('scStartBtn');
  const quickBtn = document.getElementById('scQuickBtn');
  btn.disabled = true;
  quickBtn.disabled = true;
  if (mode === 'quick') {
    quickBtn.textContent = 'Scanning...';
  } else {
    btn.textContent = 'Starting...';
  }

  try {
    const res = await fetch('/api/scout/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, posts: mode === 'quick' ? 3 : 15, batchSize: 5 }),
    });
    const json = await res.json();

    if (!json.ok) {
      btn.disabled = false; quickBtn.disabled = false;
      btn.textContent = 'Start Scout'; quickBtn.textContent = 'Quick Scan';
      alert(json.error || 'Failed to start scout run');
      return;
    }

    document.getElementById('scProgress').classList.add('active');
    scPollStatus();
    scPollingInterval = setInterval(scPollStatus, 5000);
  } catch (e) {
    btn.disabled = false; quickBtn.disabled = false;
    btn.textContent = 'Start Scout'; quickBtn.textContent = 'Quick Scan';
    console.error('Scout: failed to start run', e);
  }
}

async function scPollStatus() {
  try {
    const res = await fetch('/api/scout/run/status');
    const json = await res.json();

    const statusEl = document.getElementById('scProgressStatus');
    const logEl = document.getElementById('scProgressLog');

    const lastLines = (json.output || []).slice(-5);
    logEl.textContent = lastLines.join('\n');

    if (json.running) {
      const elapsed = Math.round((Date.now() - new Date(json.startedAt).getTime()) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      statusEl.textContent = `Scouting in progress... (${mins}m ${secs}s)`;
      statusEl.style.color = '';
    } else {
      clearInterval(scPollingInterval);
      scPollingInterval = null;

      const btn = document.getElementById('scStartBtn');
      const quickBtn = document.getElementById('scQuickBtn');
      btn.disabled = false; quickBtn.disabled = false;
      btn.textContent = 'Start Scout'; quickBtn.textContent = 'Quick Scan';

      if (json.exitCode === 0) {
        statusEl.textContent = 'Scout completed successfully!';
        statusEl.style.color = '#4ade80';
        await scLoadRuns();
      } else {
        statusEl.textContent = `Scout failed: ${json.error || 'Unknown error'}`;
        statusEl.style.color = '#f87171';
      }

      setTimeout(() => {
        document.getElementById('scProgress').classList.remove('active');
        statusEl.style.color = '';
      }, 8000);
    }
  } catch (e) {
    console.error('Scout: failed to poll status', e);
  }
}
