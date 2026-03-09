// ═══════════════════════════════════════════════
// Scout Dashboard — IG + YouTube Content Explorer
// ═══════════════════════════════════════════════

let scData = null;       // Current run summary data
let scRuns = [];         // Available run list
let scTab = 'posts';     // Active tab
let scSelectedPost = null;
let scInited = false;
let scPlatform = 'instagram'; // Current platform view: 'instagram' or 'youtube'

// ── Init ──
async function scInit() {
  if (scInited) return;
  scInited = true;
  await scLoadRuns();
  scLoadAccounts(); // fire-and-forget
  scLoadYTChannels(); // fire-and-forget
}

// ── Platform Toggle (IG/YT icons) ──
function scSetPlatform(platform) {
  scPlatform = platform;
  document.querySelectorAll('.sc-platform-icon').forEach(b => b.classList.toggle('active', b.dataset.platform === platform));
  // Auto-select the latest run for this platform
  const matchingRun = scRuns.find(r => r.source === platform || r.source === 'both');
  if (matchingRun) {
    document.getElementById('scRunSelect').value = matchingRun.filename;
    scSelectRun(matchingRun.filename);
  } else {
    // No runs for this platform, clear display
    scData = null;
    scSelectedPost = null;
    document.getElementById('scPostList').innerHTML = '<div class="sc-empty">No ' + platform + ' scout runs yet. Click Start Scout to begin.</div>';
    document.getElementById('scDetailPanel').innerHTML = '<div class="sc-detail-empty">Click a post to view details</div>';
  }
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
    // Compute channel averages for outlier detection
    scComputeChannelAverages();
    scPopulateFilters();
    scRender();
  } catch (e) {
    console.error('Scout: failed to load summary', e);
  }
}

// ── Compute channel averages (for YouTube outlier detection) ──
let scChannelAvg = {}; // { channelName: { avgViews, avgComments, count } }

function scComputeChannelAverages() {
  scChannelAvg = {};
  if (!scData) return;
  const posts = scData.giveawayPosts || [];
  const byChannel = {};
  posts.forEach(p => {
    if (p.source !== 'youtube') return;
    const ch = p.ownerUsername || 'unknown';
    if (!byChannel[ch]) byChannel[ch] = { totalViews: 0, totalComments: 0, count: 0 };
    byChannel[ch].totalViews += (p.videoViewCount || 0);
    byChannel[ch].totalComments += (p.commentsCount || 0);
    byChannel[ch].count++;
  });
  for (const [ch, d] of Object.entries(byChannel)) {
    scChannelAvg[ch] = {
      avgViews: d.count ? Math.round(d.totalViews / d.count) : 0,
      avgComments: d.count ? Math.round(d.totalComments / d.count) : 0,
      count: d.count,
    };
  }
}

function scGetOutlierMultiplier(post) {
  if (post.source !== 'youtube') return 0;
  const avg = scChannelAvg[post.ownerUsername];
  if (!avg || avg.avgViews < 100) return 0;
  const views = post.videoViewCount || 0;
  return views / avg.avgViews;
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
  // Update labels based on whether YT data exists
  const hasYT = (d.giveawayPosts || []).some(p => p.source === 'youtube');
  const gvLabel = document.getElementById('scStatGiveawaysLabel');
  const rateLabel = document.getElementById('scStatRateLabel');
  if (gvLabel) gvLabel.textContent = hasYT ? 'Top Content' : 'Giveaways';
  if (rateLabel) rateLabel.textContent = hasYT ? 'Hit Rate' : 'Hit Rate';
}

// ═══ SCORING ═══

function scScorePost(post) {
  const c = post.commentsCount || 0;
  const v = post.videoViewCount || 0;
  const days = (Date.now() - new Date(post.timestamp).getTime()) / 86400000;
  const cap = (post.caption || '').toLowerCase();
  const isYT = post.source === 'youtube';

  // Engagement (weight 3x) — out of 5
  let eng;
  if (isYT) {
    // YouTube: use views as primary signal
    eng = v >= 1000000 ? 5 : v >= 500000 ? 4 : v >= 100000 ? 3 : v >= 50000 ? 2 : 1;
  } else {
    eng = c >= 10000 ? 5 : c >= 5000 ? 4 : c >= 1000 ? 3 : c >= 500 ? 2 : 1;
  }

  // Replicability (weight 2x) — based on offer type
  const offer = scExtractOfferType(cap);
  const rep = ['Prompt Pack', 'Checklist'].includes(offer) ? 5
    : ['Template', 'Resource List', 'Swipe File'].includes(offer) ? 4
    : ['Guide/PDF', 'Cheat Sheet'].includes(offer) ? 4
    : ['Mini Course', 'Video Training'].includes(offer) ? 3 : 2;

  // Specificity (weight 2x)
  const hasNum = /\d+/.test(cap);
  const hasTopic = /prompt|workflow|ugc|clone|skin|cinematic|realistic|influencer|effect|avatar|nano|4k|hq|quality|ai\s/.test(cap);
  const spec = (hasNum && hasTopic) ? 5 : hasTopic ? 4 : hasNum ? 3 : 2;

  // Outlier factor (weight 1x) — replaces cross-platform for YT
  let outlier;
  if (isYT) {
    const mult = scGetOutlierMultiplier(post);
    outlier = mult >= 10 ? 5 : mult >= 5 ? 4 : mult >= 3 ? 3 : mult >= 2 ? 2 : 1;
  } else {
    outlier = /comment\s*["'""\u201C\u201D]\w+/i.test(cap) ? 5 : /dm\s+me/i.test(cap) ? 3 : 2;
  }

  // Freshness (weight 1x)
  const fresh = days < 30 ? 5 : days < 90 ? 4 : days < 180 ? 3 : 2;

  const total = (eng * 3) + (rep * 2) + (spec * 2) + outlier + fresh;
  return { total, max: 45, breakdown: { eng, rep, spec, outlier, fresh } };
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

function scFormatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
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

  // Filter by active platform icon
  posts = posts.filter(p => (p.source || 'instagram') === scPlatform);

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
    const isYT = p.source === 'youtube';

    const age = scTimeAgo(p.timestamp);
    const isNew = p._isNew;
    const outlierMult = scGetOutlierMultiplier(p);
    const isOutlier = outlierMult >= 3;

    const thumbClass = 'sc-post-thumb' + (isYT ? ' yt-thumb' : '');
    const srcBadge = isYT
      ? '<span class="sc-source-badge yt">YT</span>'
      : '<span class="sc-source-badge ig">IG</span>';

    return `<div class="sc-post-card${isSelected ? ' selected' : ''}" onclick="scSelectPost('${p.postId}')">
      <div class="sc-post-rank ${rank <= 3 ? 'top3' : ''}">#${rank}</div>
      <div class="${thumbClass}" style="background-image:url('${scImgUrl(p.displayUrl)}')"></div>
      <div class="sc-post-info">
        <div class="sc-post-account">${srcBadge} @${p.ownerUsername || 'unknown'}${age ? `<span class="sc-post-age">${age}</span>` : ''}${isNew ? '<span class="sc-new-badge">NEW</span>' : ''}${isOutlier ? `<span class="sc-outlier-badge">${Math.round(outlierMult)}x outlier</span>` : ''}</div>
        <div class="sc-post-caption">${caption}${(p.caption || '').length > 80 ? '...' : ''}</div>
        <div class="sc-post-metrics">
          <span title="Comments">\uD83D\uDCAC ${scFmt(p.commentsCount)}</span>
          <span title="Likes">\u2764\uFE0F ${scFmt(p.likesCount)}</span>
          ${p.videoViewCount ? `<span title="Views">\uD83D\uDC41 ${scFmt(p.videoViewCount)}</span>` : ''}
          ${p.videoDuration ? `<span title="Duration">\u23F1 ${scFormatDuration(p.videoDuration)}</span>` : ''}
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
  const duration = post.videoDuration ? scFormatDuration(post.videoDuration) : '';
  const caption = (post.caption || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
  const isYT = post.source === 'youtube';
  const outlierMult = scGetOutlierMultiplier(post);
  const channelAvg = scChannelAvg[post.ownerUsername];

  const factors = [
    { label: 'Engagement', value: score.breakdown.eng, max: 5, weight: '3x' },
    { label: 'Replicable', value: score.breakdown.rep, max: 5, weight: '2x' },
    { label: 'Specificity', value: score.breakdown.spec, max: 5, weight: '2x' },
    { label: isYT ? 'Outlier' : 'Cross-plat', value: score.breakdown.outlier, max: 5, weight: '1x' },
    { label: 'Freshness', value: score.breakdown.fresh, max: 5, weight: '1x' },
  ];

  const thumbClass = isYT ? 'sc-detail-thumb yt-thumb' : 'sc-detail-thumb';
  const platformName = isYT ? 'YouTube' : 'Instagram';
  const platformIcon = isYT ? '\uD83D\uDCFA' : '\uD83D\uDCF8';
  const openUrl = post.url || '#';

  // Description section (YouTube has separate title + description)
  const descriptionHtml = isYT && post.description
    ? `<div class="sc-detail-section">
        <div class="sc-detail-section-title">DESCRIPTION</div>
        <div class="sc-detail-caption">${(post.description || '').slice(0, 500).replace(/</g, '&lt;').replace(/\n/g, '<br>')}${(post.description || '').length > 500 ? '...' : ''}</div>
      </div>`
    : '';

  // Transcript section (YouTube only)
  const transcriptHtml = isYT && post.subtitles
    ? `<div class="sc-detail-section">
        <div class="sc-detail-section-title">TRANSCRIPT</div>
        <div class="sc-detail-transcript">${scParseSRT(post.subtitles).slice(0, 2000)}${post.subtitles.length > 2000 ? '...' : ''}</div>
      </div>`
    : '';

  // Outlier info
  const outlierHtml = isYT && outlierMult >= 2 && channelAvg
    ? `<div class="sc-detail-section">
        <div class="sc-detail-section-title">OUTLIER ANALYSIS</div>
        <div style="font-size:12px;color:#999;line-height:1.6;">
          This video has <strong style="color:#FBBF24">${Math.round(outlierMult)}x</strong> the channel's average views.<br>
          Channel avg: ${scFmt(channelAvg.avgViews)} views (across ${channelAvg.count} videos)<br>
          This video: ${scFmt(post.videoViewCount)} views
        </div>
      </div>`
    : '';

  panel.innerHTML = `
    <div class="sc-detail-inner">
      ${post.displayUrl ? `<div class="${thumbClass}" style="background-image:url('${scImgUrl(post.displayUrl)}')">
        <a class="sc-detail-thumb-download" href="${scImgUrl(post.displayUrl)}" download="thumbnail.jpg" title="Download thumbnail" onclick="event.stopPropagation();">\u2B07</a>
      </div>` : ''}
      <div class="sc-detail-header">
        <div class="sc-detail-account">${isYT ? '<span class="sc-source-badge yt" style="margin-right:6px">YT</span>' : '<span class="sc-source-badge ig" style="margin-right:6px">IG</span>'}@${post.ownerUsername || 'unknown'}</div>
        <div class="sc-detail-name">${post.ownerFullName || ''}</div>
        <div class="sc-detail-meta">${date}${post.type ? ' \u00B7 ' + post.type : ''}${duration ? ' \u00B7 ' + duration : ''}</div>
      </div>

      ${outlierHtml}

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
        <div class="sc-detail-section-title">${isYT ? 'TITLE' : 'CAPTION'}</div>
        <div class="sc-detail-caption">${caption}</div>
      </div>

      ${descriptionHtml}
      ${transcriptHtml}

      <div class="sc-detail-section">
        <div class="sc-detail-tags">
          ${keyword ? `<div><span class="sc-detail-label">KEYWORD</span> <span class="sc-keyword-badge">${keyword}</span></div>` : ''}
          <div><span class="sc-detail-label">OFFER</span> <span class="sc-offer-badge">${offer}</span></div>
          <div><span class="sc-detail-label">TYPE</span> <span class="sc-type-badge">${post.type || 'Post'}</span></div>
          <div><span class="sc-detail-label">SOURCE</span> <span class="sc-source-badge ${isYT ? 'yt' : 'ig'}">${platformName}</span></div>
        </div>
      </div>

      <div class="sc-detail-metrics-grid">
        <div class="sc-detail-metric"><div class="sc-detail-metric-val">${scFmt(post.commentsCount)}</div><div class="sc-detail-metric-label">Comments</div></div>
        <div class="sc-detail-metric"><div class="sc-detail-metric-val">${scFmt(post.likesCount)}</div><div class="sc-detail-metric-label">Likes</div></div>
        ${post.videoViewCount ? `<div class="sc-detail-metric"><div class="sc-detail-metric-val">${scFmt(post.videoViewCount)}</div><div class="sc-detail-metric-label">Views</div></div>` : ''}
      </div>

      <a class="sc-detail-link" href="${openUrl}" target="_blank" rel="noopener">${platformIcon} Open on ${platformName} \u2197</a>
    </div>
  `;
}

// ── Parse SRT subtitles to plain text ──
function scParseSRT(srt) {
  if (!srt) return '';
  // Remove timing lines and sequence numbers, keep only text
  return srt
    .replace(/^\d+\s*$/gm, '')
    .replace(/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}\s*$/gm, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
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
    const topComments = a.topPost ? scFmt(a.topPost.commentsCount) : '\u2014';
    const topKeyword = a.topPost ? scExtractKeyword(a.topPost.caption) : null;
    const isYT = a.topPost && a.topPost.source === 'youtube';
    const srcBadge = isYT ? '<span class="sc-source-badge yt" style="margin-left:6px">YT</span>' : '';
    return `<div class="sc-account-card">
      <div class="sc-account-rank">#${i + 1}</div>
      <div class="sc-account-info">
        <div class="sc-account-header">
          <span class="sc-account-username">@${a.username}${srcBadge}</span>
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
    .filter(p => (p.commentsCount || 0) >= 10000 || (p.videoViewCount || 0) >= 500000)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const freshest = highPerformers[0];
  const freshestAge = freshest ? Math.round((now - new Date(freshest.timestamp).getTime()) / 86400000) : null;

  // Average score
  const scores = posts.map(p => scScorePost(p).total);
  const avgScore = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);

  // Source breakdown
  const igCount = posts.filter(p => (p.source || 'instagram') === 'instagram').length;
  const ytCount = posts.filter(p => p.source === 'youtube').length;

  // Top YouTube outliers
  const outliers = posts
    .filter(p => p.source === 'youtube')
    .map(p => ({ ...p, _mult: scGetOutlierMultiplier(p) }))
    .filter(p => p._mult >= 3)
    .sort((a, b) => b._mult - a._mult)
    .slice(0, 5);

  grid.innerHTML = `
    <div class="sc-insight-card">
      <div class="sc-insight-icon">\uD83C\uDFC6</div>
      <div class="sc-insight-title">Top Offer Type</div>
      <div class="sc-insight-value">${topOffer ? topOffer[0] : '\u2014'}</div>
      <div class="sc-insight-detail">${topOfferPct}% of posts (${topOffer ? topOffer[1] : 0} posts)</div>
    </div>
    <div class="sc-insight-card">
      <div class="sc-insight-icon">\uD83D\uDCAC</div>
      <div class="sc-insight-title">Avg Comments</div>
      <div class="sc-insight-value">${scFmt(avgComments)}</div>
      <div class="sc-insight-detail">Per content post</div>
    </div>
    <div class="sc-insight-card">
      <div class="sc-insight-icon">\uD83C\uDFAC</div>
      <div class="sc-insight-title">Best Format</div>
      <div class="sc-insight-value">${bestFormat ? bestFormat[0] : '\u2014'}</div>
      <div class="sc-insight-detail">${scFmt(bestFormatAvg)} avg comments (${bestFormat ? formatCounts[bestFormat[0]] : 0} posts)</div>
    </div>
    <div class="sc-insight-card">
      <div class="sc-insight-icon">\u2B50</div>
      <div class="sc-insight-title">Avg Score</div>
      <div class="sc-insight-value">${avgScore}/45</div>
      <div class="sc-insight-detail">Across ${posts.length} posts</div>
    </div>
    ${(igCount > 0 && ytCount > 0) ? `
    <div class="sc-insight-card">
      <div class="sc-insight-icon">\uD83D\uDCCA</div>
      <div class="sc-insight-title">Sources</div>
      <div class="sc-insight-detail" style="margin-top:8px">
        <span class="sc-source-badge ig" style="margin-right:6px">IG</span> ${igCount} posts
        <span style="margin:0 8px;color:#444">\u00B7</span>
        <span class="sc-source-badge yt" style="margin-right:6px">YT</span> ${ytCount} videos
      </div>
    </div>` : ''}
    <div class="sc-insight-card sc-insight-wide">
      <div class="sc-insight-icon">\uD83D\uDD11</div>
      <div class="sc-insight-title">Top CTA Keywords</div>
      <div class="sc-insight-keywords">
        ${topKeywords.map(([kw, cnt]) => `<span class="sc-keyword-badge">${kw} <small>(${cnt})</small></span>`).join(' ')}
        ${topKeywords.length === 0 ? '<span style="color:rgba(255,255,255,0.3)">No keywords detected</span>' : ''}
      </div>
    </div>
    ${outliers.length ? `
    <div class="sc-insight-card sc-insight-wide">
      <div class="sc-insight-icon">\uD83D\uDE80</div>
      <div class="sc-insight-title">YouTube Outliers (vs channel avg)</div>
      <div class="sc-insight-detail" style="margin-top:6px">
        ${outliers.map(o => `<div style="margin-bottom:4px"><span class="sc-outlier-badge">${Math.round(o._mult)}x</span> @${o.ownerUsername}: "${(o.caption || '').slice(0, 50).replace(/</g, '&lt;')}..." \u00B7 ${scFmt(o.videoViewCount)} views</div>`).join('')}
      </div>
    </div>` : ''}
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
      <div class="sc-insight-detail">${scFmt(freshest.commentsCount)} comments${freshest.videoViewCount ? ' \u00B7 ' + scFmt(freshest.videoViewCount) + ' views' : ''} \u00B7 ${freshestAge} days ago \u00B7 "${(freshest.caption || '').slice(0, 50).replace(/</g, '&lt;')}..."</div>
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
  if (n == null) return '\u2014';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function scImgUrl(url) {
  if (!url) return '';
  // YouTube thumbnails can be loaded directly (no CORS issues), but proxy for consistency
  return '/api/scout/img?url=' + encodeURIComponent(url);
}

// ═══ ACCOUNT MANAGEMENT (IG) ═══

let scAccountPanelOpen = false;
let scAccounts = [];
let scYTChannels = [];
let scAcctTab = 'ig'; // 'ig' or 'yt'

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

function scCleanYTChannels(rawText) {
  return [...new Set(
    rawText.split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        // Keep full URLs as-is
        if (s.includes('youtube.com') || s.includes('youtu.be')) return s;
        // Add @ prefix for handles if missing
        if (!s.startsWith('@')) s = '@' + s;
        return s;
      })
      .filter(s => s.length > 1)
  )];
}

async function scLoadAccounts() {
  try {
    const res = await fetch('/api/scout/accounts');
    const json = await res.json();
    if (json.ok) scAccounts = json.accounts;
    scUpdateAccountBadge();
  } catch (e) {
    console.error('Scout: failed to load accounts', e);
  }
}

async function scLoadYTChannels() {
  try {
    const res = await fetch('/api/scout/yt-channels');
    const json = await res.json();
    if (json.ok) scYTChannels = json.channels;
    scUpdateAccountBadge();
  } catch (e) {
    console.error('Scout: failed to load YT channels', e);
  }
}

function scUpdateAccountBadge() {
  const badge = document.getElementById('scHeaderAcctCount');
  if (badge) badge.textContent = scAccounts.length + scYTChannels.length;
}

function scToggleAccountPanel() {
  scAccountPanelOpen = !scAccountPanelOpen;
  const panel = document.getElementById('scAccountPanel');
  panel.classList.toggle('active', scAccountPanelOpen);
  if (scAccountPanelOpen) {
    Promise.all([scLoadAccounts(), scLoadYTChannels()]).then(() => {
      scRenderAccountPanel();
      scRenderYTChannelPanel();
    });
  }
}

function scSwitchAcctTab(tab) {
  scAcctTab = tab;
  document.querySelectorAll('.sc-acct-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('scAcctAddIG').style.display = tab === 'ig' ? '' : 'none';
  document.getElementById('scAcctAddYT').style.display = tab === 'yt' ? '' : 'none';
  document.getElementById('scAccountPanelList').style.display = tab === 'ig' ? '' : 'none';
  document.getElementById('scYTChannelList').style.display = tab === 'yt' ? '' : 'none';
}

function scRenderAccountPanel() {
  const list = document.getElementById('scAccountPanelList');
  const countEl = document.getElementById('scAccountPanelCount');
  countEl.textContent = `${scAccounts.length} IG + ${scYTChannels.length} YT`;
  scUpdateAccountBadge();

  list.innerHTML = scAccounts.map(username => `
    <div class="sc-acct-item">
      <span class="sc-acct-name"><span class="sc-source-badge ig" style="margin-right:4px">IG</span> @${username}</span>
      <button class="sc-acct-remove" onclick="scRemoveAccount('${username}')" title="Remove">&times;</button>
    </div>
  `).join('') || '<div class="sc-acct-empty">No IG accounts added yet</div>';
}

function scRenderYTChannelPanel() {
  const list = document.getElementById('scYTChannelList');

  list.innerHTML = scYTChannels.map((ch, i) => {
    const display = ch.startsWith('@') ? ch : ch.replace(/^https?:\/\/(www\.)?youtube\.com\//i, '').replace(/\/.*$/, '');
    return `<div class="sc-acct-item">
      <span class="sc-acct-name"><span class="sc-source-badge yt" style="margin-right:4px">YT</span> ${display}</span>
      <button class="sc-acct-remove" onclick="scRemoveYTChannel(${i})" title="Remove">&times;</button>
    </div>`;
  }).join('') || '<div class="sc-acct-empty">No YouTube channels added yet</div>';
}

function scRemoveAccount(username) {
  scAccounts = scAccounts.filter(a => a !== username);
  scRenderAccountPanel();
  scSaveAccounts();
}

function scRemoveYTChannel(index) {
  scYTChannels.splice(index, 1);
  scRenderYTChannelPanel();
  scSaveYTChannels();
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

function scAddYTChannelsFromInput() {
  const textarea = document.getElementById('scYTChannelInput');
  const raw = textarea.value;
  if (!raw.trim()) return;

  const newChannels = scCleanYTChannels(raw);
  const before = scYTChannels.length;
  scYTChannels = [...new Set([...scYTChannels, ...newChannels])];
  const added = scYTChannels.length - before;
  textarea.value = '';
  scRenderYTChannelPanel();
  scSaveYTChannels();

  const btn = document.getElementById('scAddYTBtn');
  const orig = btn.textContent;
  btn.textContent = added > 0 ? `Added ${added} channel${added !== 1 ? 's' : ''}` : 'No new channels';
  setTimeout(() => btn.textContent = orig, 2000);
}

async function scSaveAccounts() {
  try {
    await fetch('/api/scout/accounts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accounts: scAccounts }),
    });
    scUpdateAccountBadge();
  } catch (e) {
    console.error('Scout: failed to save accounts', e);
  }
}

async function scSaveYTChannels() {
  try {
    await fetch('/api/scout/yt-channels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channels: scYTChannels }),
    });
    scUpdateAccountBadge();
  } catch (e) {
    console.error('Scout: failed to save YT channels', e);
  }
}

// ═══ SCOUT DIALOG ═══

function scOpenScoutDialog() {
  // Reset dialog to match current platform view
  scDialogSetPlatform(scPlatform);
  document.getElementById('scDialogBackdrop').classList.add('active');
  document.getElementById('scDialog').classList.add('active');
}

function scCloseScoutDialog() {
  document.getElementById('scDialogBackdrop').classList.remove('active');
  document.getElementById('scDialog').classList.remove('active');
}

function scDialogSetPlatform(platform) {
  document.querySelectorAll('#scDialogPlatform .sc-dialog-opt').forEach(b => b.classList.toggle('active', b.dataset.val === platform));
  const igMode = document.getElementById('scDialogIGMode');
  const ytMode = document.getElementById('scDialogYTMode');
  igMode.style.display = (platform === 'instagram' || platform === 'both') ? '' : 'none';
  ytMode.style.display = (platform === 'youtube' || platform === 'both') ? '' : 'none';
}

function scDialogSetOpt(btn) {
  // Toggle within the same options group (only one active per group)
  btn.parentElement.querySelectorAll('.sc-dialog-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function scStartFromDialog() {
  const platform = document.querySelector('#scDialogPlatform .sc-dialog-opt.active')?.dataset.val || 'instagram';
  const igMode = document.querySelector('#scDialogIGMode .sc-dialog-opt.active')?.dataset.val || 'giveaway';
  const ytMode = document.querySelector('#scDialogYTMode .sc-dialog-opt.active')?.dataset.val || 'latest';
  const postsCount = parseInt(document.getElementById('scDialogPosts').value) || 10;

  // Determine content mode
  let contentMode = 'giveaway';
  if (platform === 'youtube') contentMode = ytMode === 'outlier' ? 'all' : 'all';
  else if (platform === 'instagram') contentMode = igMode;
  else contentMode = igMode === 'all' ? 'all' : 'giveaway'; // both: use IG mode setting

  scCloseScoutDialog();
  scStartScout('full', platform, contentMode, postsCount);
}

// ═══ START SCOUT + PROGRESS ═══

let scPollingInterval = null;

async function scStartScout(mode, source, contentMode, postsCount) {
  mode = mode || 'full';
  source = source || scPlatform;
  contentMode = contentMode || 'giveaway';
  postsCount = postsCount || (mode === 'quick' ? 3 : 10);

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
      body: JSON.stringify({ mode, source, contentMode, posts: postsCount, batchSize: 5 }),
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
