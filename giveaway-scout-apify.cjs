// giveaway-scout-apify.cjs
// Phase 1: Scrape IG following list + latest posts from each account via Apify
// Phase 2: AI agent analyzes all content and ranks giveaway ideas
//
// Usage:
//   node giveaway-scout-apify.cjs --account theaiinfluenceracademy --posts 15
//   node giveaway-scout-apify.cjs --accounts-list "user1,user2,user3" --posts 15
//   node giveaway-scout-apify.cjs --accounts-file accounts.txt --posts 15
//   node giveaway-scout-apify.cjs --following-file results/scout-*-following.json --posts 15
//   node giveaway-scout-apify.cjs --analyze-only results/scout-*-posts.json

const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;

// Actor IDs
const FOLLOWING_ACTOR = 'louisdeconinck~instagram-following-scraper';
const POSTS_ACTOR     = 'shu8hvrXbJbY3Eb9W'; // Apify Instagram Scraper (same as instagram-tracker)

// Instagram cookies file (needed for following scraper)
const COOKIES_FILE = path.join(__dirname, 'ig-cookies.json');

const POLL_INTERVAL = 10000; // 10s
const MAX_POLL_TIME = 10 * 60 * 1000; // 10 min (following list can be slow)

const RESULTS_DIR = path.join(__dirname, 'results');

// ── CLI Args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    account: null,
    accountsList: null,   // comma-separated usernames
    accountsFile: null,   // text file with one username per line
    postsPerAccount: 15,
    skipFollowing: false,
    analyzeOnly: null,
    followingFile: null,  // resume from saved following list (JSON)
    maxAccounts: 0,       // 0 = all
    batchSize: 5,         // how many accounts to scrape per Apify run
    mergeWith: null,      // path to previous -posts.json to merge with (Quick Scan)
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--account': opts.account = args[++i]; break;
      case '--accounts-list': opts.accountsList = args[++i]; break;
      case '--accounts-file': opts.accountsFile = args[++i]; break;
      case '--posts': opts.postsPerAccount = parseInt(args[++i]) || 15; break;
      case '--skip-following': opts.skipFollowing = true; break;
      case '--analyze-only': opts.analyzeOnly = args[++i]; break;
      case '--following-file': opts.followingFile = args[++i]; break;
      case '--max-accounts': opts.maxAccounts = parseInt(args[++i]) || 0; break;
      case '--batch-size': opts.batchSize = parseInt(args[++i]) || 5; break;
      case '--merge-with': opts.mergeWith = args[++i]; break;
    }
  }

  return opts;
}

// ── HTTP Helpers ──────────────────────────────────────────────────────────────

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    }).on('error', reject);
  });
}

// ── Apify Core ────────────────────────────────────────────────────────────────

async function startApifyRun(actorId, input) {
  const body = JSON.stringify(input);
  const res = await httpsRequest({
    hostname: 'api.apify.com',
    path: `/v2/acts/${actorId}/runs?token=${APIFY_API_TOKEN}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, body);

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Apify start failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  return res.body.data.id;
}

async function pollApifyRun(runId, label = '') {
  const start = Date.now();
  while (Date.now() - start < MAX_POLL_TIME) {
    const res = await get(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`);
    const status = res.data && res.data.status;
    const elapsed = Math.round((Date.now() - start) / 1000);
    process.stdout.write(`\r  ${label} Status: ${status} (${elapsed}s)    `);

    if (status === 'SUCCEEDED') {
      console.log('');
      return res.data.defaultDatasetId;
    }
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      console.log('');
      throw new Error(`Apify run ${status}: ${runId}`);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  console.log('');
  throw new Error(`Apify run timed out after ${MAX_POLL_TIME / 60000} minutes`);
}

async function fetchDataset(datasetId) {
  const items = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const res = await get(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}&limit=${limit}&offset=${offset}`
    );
    const batch = Array.isArray(res) ? res : [];
    items.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return items;
}

// ── Phase 1a: Get Following List ──────────────────────────────────────────────

function loadCookies() {
  if (!fs.existsSync(COOKIES_FILE)) return null;
  try {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    // Convert to the string format the actor expects: "name=value; name=value; ..."
    if (Array.isArray(cookies)) {
      return cookies.map(c => `${c.name}=${c.value}`).join('; ');
    }
    if (typeof cookies === 'string') return cookies;
    return null;
  } catch { return null; }
}

async function getFollowingList(username) {
  console.log(`\n[Phase 1a] Getting accounts followed by @${username}...`);

  const input = { usernames: [username] };

  // Load cookies if available (required for following scraper on free plan)
  const cookieStr = loadCookies();
  if (cookieStr) {
    input.cookie = cookieStr;
    console.log(`  Using Instagram cookies from ${COOKIES_FILE}`);
  } else {
    console.log(`  WARNING: No Instagram cookies found at ${COOKIES_FILE}`);
    console.log(`  The following scraper may fail without cookies.`);
    console.log(`  To export cookies, run this in your browser console on instagram.com:`);
    console.log(`    copy(document.cookie)`);
    console.log(`  Then save it to: ${COOKIES_FILE}`);
    console.log(`  Format: "cookie_name=value; cookie_name2=value2; ..."  (as a JSON string)`);
  }

  const runId = await startApifyRun(FOLLOWING_ACTOR, input);
  console.log(`  Run started: ${runId}`);

  const datasetId = await pollApifyRun(runId, 'Following:');
  const items = await fetchDataset(datasetId);

  // Extract clean account list
  const accounts = items.map(item => ({
    username: item.username || item.login || item.user_name,
    fullName: item.full_name || item.fullName || '',
    isPrivate: item.is_private || item.isPrivate || false,
    isVerified: item.is_verified || item.isVerified || false,
    profileUrl: `https://www.instagram.com/${item.username || item.login || item.user_name}/`,
  })).filter(a => a.username);

  console.log(`  Found ${accounts.length} followed accounts`);

  // Filter out private accounts (we can't scrape their posts)
  const publicAccounts = accounts.filter(a => !a.isPrivate);
  const privateCount = accounts.length - publicAccounts.length;
  if (privateCount > 0) {
    console.log(`  Skipping ${privateCount} private accounts`);
  }

  return publicAccounts;
}

// ── Phase 1b: Get Posts From Accounts ─────────────────────────────────────────

async function getPostsFromAccounts(accounts, postsPerAccount, batchSize) {
  console.log(`\n[Phase 1b] Scraping latest ${postsPerAccount} posts from ${accounts.length} accounts...`);

  const allPosts = [];
  const batches = [];

  // Split accounts into batches
  for (let i = 0; i < accounts.length; i += batchSize) {
    batches.push(accounts.slice(i, i + batchSize));
  }

  console.log(`  Processing in ${batches.length} batch(es) of up to ${batchSize} accounts each\n`);

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const batch = batches[bIdx];
    const batchNames = batch.map(a => '@' + a.username).join(', ');
    console.log(`  Batch ${bIdx + 1}/${batches.length}: ${batchNames}`);

    const urls = batch.map(a => a.profileUrl);

    try {
      const runId = await startApifyRun(POSTS_ACTOR, {
        directUrls: urls,
        resultsType: 'posts',
        resultsLimit: postsPerAccount,
      });

      const datasetId = await pollApifyRun(runId, `Batch ${bIdx + 1}:`);
      const items = await fetchDataset(datasetId);

      console.log(`  Got ${items.length} posts from batch ${bIdx + 1}`);

      for (const item of items) {
        allPosts.push({
          // Account info
          ownerUsername: item.ownerUsername || '',
          ownerFullName: item.ownerFullName || '',

          // Post info
          postId: item.id || item.shortCode || '',
          shortCode: item.shortCode || '',
          url: item.url || (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : ''),
          type: item.type || 'Image', // Video = Reel, Sidecar = Carousel, Image = Photo
          timestamp: item.timestamp || '',

          // Content
          caption: (item.caption || '').replace(/\r?\n/g, ' ').trim(),
          hashtags: (item.hashtags || []).join(', '),
          mentions: (item.mentions || []).join(', '),

          // Engagement
          likesCount: item.likesCount != null ? item.likesCount : -1,
          commentsCount: item.commentsCount != null ? item.commentsCount : 0,
          videoViewCount: item.videoViewCount || 0,
          videoDuration: item.videoDuration || 0,

          // Media
          displayUrl: item.displayUrl || '',
          videoUrl: item.videoUrl || '',
        });
      }
    } catch (err) {
      console.error(`  Error in batch ${bIdx + 1}: ${err.message}`);
      // Continue with next batch rather than stopping
    }

    // Small delay between batches to be nice to Apify
    if (bIdx < batches.length - 1) {
      console.log('  Waiting 5s before next batch...\n');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  return allPosts;
}

// ── CSV Export ─────────────────────────────────────────────────────────────────

function escapeCSV(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function postsToCSV(posts) {
  const headers = [
    'Account', 'Full Name', 'Post URL', 'Type', 'Date',
    'Caption', 'Hashtags', 'Mentions',
    'Likes', 'Comments', 'Video Views', 'Video Duration (s)',
  ];

  const rows = [headers.map(escapeCSV).join(',')];

  for (const p of posts) {
    rows.push([
      p.ownerUsername,
      p.ownerFullName,
      p.url,
      p.type === 'Video' ? 'Reel' : p.type === 'Sidecar' ? 'Carousel' : 'Photo',
      p.timestamp ? new Date(p.timestamp).toISOString().split('T')[0] : '',
      p.caption,
      p.hashtags,
      p.mentions,
      p.likesCount === -1 ? 'hidden' : p.likesCount,
      p.commentsCount,
      p.videoViewCount || '',
      p.videoDuration || '',
    ].map(escapeCSV).join(','));
  }

  return rows.join('\n');
}

// ── Giveaway Detection ────────────────────────────────────────────────────────

function isLikelyGiveaway(caption) {
  if (!caption) return false;
  const lower = caption.toLowerCase();

  // Strong giveaway signals
  const strongSignals = [
    'comment', 'dm me', 'dm you', 'send you', 'send it',
    'free guide', 'free download', 'free template', 'free checklist',
    'free prompts', 'free resource', 'free pdf', 'free ebook',
    'grab your', 'get your free', 'drop a', 'type',
    'lead magnet', 'giveaway', 'freebie',
  ];

  // Weak signals (need 2+ to count)
  const weakSignals = [
    'free', 'link in bio', 'save this', 'share this',
    'tag a friend', 'follow', 'repost',
  ];

  const strongHits = strongSignals.filter(s => lower.includes(s)).length;
  const weakHits = weakSignals.filter(s => lower.includes(s)).length;

  return strongHits >= 1 || weakHits >= 2;
}

function extractGiveawayDetails(post) {
  const caption = (post.caption || '').toLowerCase();
  const details = {
    isGiveaway: isLikelyGiveaway(post.caption),
    hasKeywordCTA: false,
    keyword: null,
    offerType: null,
    engagement: post.commentsCount + (post.likesCount > 0 ? post.likesCount : 0),
  };

  // Try to extract the keyword CTA (e.g., "Comment PROMPTS", "Type FREE")
  const keywordPatterns = [
    /comment\s+["']?(\w+)["']?/i,
    /type\s+["']?(\w+)["']?/i,
    /drop\s+(?:a\s+)?["']?(\w+)["']?/i,
    /say\s+["']?(\w+)["']?/i,
    /dm\s+(?:me\s+)?["']?(\w+)["']?/i,
  ];

  for (const pat of keywordPatterns) {
    const m = caption.match(pat);
    if (m) {
      details.hasKeywordCTA = true;
      details.keyword = m[1].toUpperCase();
      break;
    }
  }

  // Detect offer type
  const offerTypes = [
    { pattern: /prompt/i, type: 'Prompt Pack' },
    { pattern: /checklist/i, type: 'Checklist' },
    { pattern: /template/i, type: 'Template' },
    { pattern: /swipe\s*file/i, type: 'Swipe File' },
    { pattern: /cheat\s*sheet/i, type: 'Cheat Sheet' },
    { pattern: /guide/i, type: 'Guide/PDF' },
    { pattern: /course|training|masterclass/i, type: 'Mini Course' },
    { pattern: /tool|calculator|spreadsheet/i, type: 'Tool/Calculator' },
    { pattern: /script/i, type: 'Script' },
    { pattern: /list|resource/i, type: 'Resource List' },
    { pattern: /pdf|ebook|book/i, type: 'PDF/eBook' },
    { pattern: /video|tutorial/i, type: 'Video Training' },
  ];

  for (const { pattern, type } of offerTypes) {
    if (pattern.test(caption)) {
      details.offerType = type;
      break;
    }
  }

  return details;
}

// ── Summary Stats ─────────────────────────────────────────────────────────────

function generateSummary(posts, following) {
  const giveawayPosts = posts.filter(p => isLikelyGiveaway(p.caption));
  const accountStats = {};

  for (const p of posts) {
    if (!accountStats[p.ownerUsername]) {
      accountStats[p.ownerUsername] = {
        username: p.ownerUsername,
        fullName: p.ownerFullName,
        totalPosts: 0,
        giveawayPosts: 0,
        totalLikes: 0,
        totalComments: 0,
        topPost: null,
      };
    }

    const s = accountStats[p.ownerUsername];
    s.totalPosts++;
    if (isLikelyGiveaway(p.caption)) s.giveawayPosts++;
    if (p.likesCount > 0) s.totalLikes += p.likesCount;
    s.totalComments += p.commentsCount || 0;

    if (!s.topPost || (p.commentsCount || 0) > (s.topPost.commentsCount || 0)) {
      s.topPost = p;
    }
  }

  // Sort giveaway posts by engagement (comments are the best signal)
  giveawayPosts.sort((a, b) => (b.commentsCount || 0) - (a.commentsCount || 0));

  // Top giveaway accounts (most giveaway posts + highest engagement)
  const giveawayAccounts = Object.values(accountStats)
    .filter(a => a.giveawayPosts > 0)
    .sort((a, b) => b.giveawayPosts - a.giveawayPosts || b.totalComments - a.totalComments);

  return {
    totalAccounts: following.length,
    totalPosts: posts.length,
    totalGiveaways: giveawayPosts.length,
    giveawayPosts: giveawayPosts.slice(0, 50), // Top 50
    giveawayAccounts: giveawayAccounts.slice(0, 20),
    accountStats,
  };
}

// ── Merge Posts (Quick Scan) ──────────────────────────────────────────────────

function mergePosts(newPosts, existingPostsFile) {
  console.log(`\n[Merge] Loading existing posts from: ${path.basename(existingPostsFile)}`);
  const existing = JSON.parse(fs.readFileSync(existingPostsFile, 'utf8'));
  const existingPosts = existing.posts || [];
  console.log(`  Existing: ${existingPosts.length} posts`);
  console.log(`  New:      ${newPosts.length} posts`);

  const seen = new Set(existingPosts.map(p => p.shortCode));
  let addedCount = 0;
  for (const p of newPosts) {
    if (p.shortCode && !seen.has(p.shortCode)) {
      p._isNew = true; // Flag for UI "NEW" badge
      existingPosts.push(p);
      seen.add(p.shortCode);
      addedCount++;
    }
  }

  console.log(`  Added ${addedCount} new posts (${newPosts.length - addedCount} duplicates skipped)`);
  console.log(`  Total after merge: ${existingPosts.length} posts`);
  return existingPosts;
}

// ── Save Results ──────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveResults(opts, following, posts, summary) {
  ensureDir(RESULTS_DIR);

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const prefix = `scout-${opts.account}-${ts}`;

  // 1. Save following list
  const followingPath = path.join(RESULTS_DIR, `${prefix}-following.json`);
  fs.writeFileSync(followingPath, JSON.stringify(following, null, 2));
  console.log(`  Following list saved: ${followingPath}`);

  // 2. Save all posts as JSON (for AI analysis)
  const postsJsonPath = path.join(RESULTS_DIR, `${prefix}-posts.json`);
  fs.writeFileSync(postsJsonPath, JSON.stringify({
    source: `@${opts.account}`,
    scrapedAt: new Date().toISOString(),
    postsPerAccount: opts.postsPerAccount,
    totalAccounts: following.length,
    totalPosts: posts.length,
    posts,
  }, null, 2));
  console.log(`  Posts JSON saved: ${postsJsonPath}`);

  // 3. Save all posts as CSV (spreadsheet)
  const csvPath = path.join(RESULTS_DIR, `${prefix}-posts.csv`);
  fs.writeFileSync(csvPath, postsToCSV(posts));
  console.log(`  Posts CSV saved: ${csvPath}`);

  // 4. Save giveaway-only posts as CSV
  const giveawayPosts = posts.filter(p => isLikelyGiveaway(p.caption));
  if (giveawayPosts.length > 0) {
    const gvCsvPath = path.join(RESULTS_DIR, `${prefix}-giveaways.csv`);
    fs.writeFileSync(gvCsvPath, postsToCSV(giveawayPosts));
    console.log(`  Giveaway posts CSV saved: ${gvCsvPath}`);
  }

  // 5. Save summary for AI analysis
  const summaryPath = path.join(RESULTS_DIR, `${prefix}-summary.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`  Summary saved: ${summaryPath}`);

  return { followingPath, postsJsonPath, csvPath, summaryPath, prefix };
}

// ── Format Count ──────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || n < 0) return '?';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  if (!APIFY_API_TOKEN) {
    console.error('Missing APIFY_API_TOKEN. Set it in your environment or .env file.');
    process.exit(1);
  }

  // ── Analyze-only mode ──
  if (opts.analyzeOnly) {
    console.log(`\nLoading saved data from: ${opts.analyzeOnly}`);
    const data = JSON.parse(fs.readFileSync(opts.analyzeOnly, 'utf8'));
    console.log(`Loaded ${data.posts.length} posts from ${data.totalAccounts} accounts`);

    const giveawayPosts = data.posts.filter(p => isLikelyGiveaway(p.caption));
    console.log(`\nFound ${giveawayPosts.length} potential giveaway posts`);
    console.log('\nTop giveaway posts by comments:\n');

    giveawayPosts
      .sort((a, b) => (b.commentsCount || 0) - (a.commentsCount || 0))
      .slice(0, 20)
      .forEach((p, i) => {
        const details = extractGiveawayDetails(p);
        console.log(`${i + 1}. @${p.ownerUsername} — ${fmt(p.commentsCount)} comments / ${fmt(p.likesCount)} likes`);
        console.log(`   Type: ${p.type === 'Video' ? 'Reel' : p.type === 'Sidecar' ? 'Carousel' : 'Photo'}${details.offerType ? ' | Offer: ' + details.offerType : ''}${details.keyword ? ' | Keyword: ' + details.keyword : ''}`);
        console.log(`   ${p.caption.slice(0, 120)}${p.caption.length > 120 ? '...' : ''}`);
        console.log(`   ${p.url}`);
        console.log('');
      });

    console.log('Done. Use the posts JSON file with the Giveaway Scout skill for full AI analysis.');
    return;
  }

  // ── Full pipeline ──
  const label = opts.account || 'custom-list';

  if (!opts.account && !opts.accountsList && !opts.accountsFile && !opts.followingFile) {
    console.error(`Usage:
  node giveaway-scout-apify.cjs --account USERNAME [--posts 15]
  node giveaway-scout-apify.cjs --accounts-list "user1,user2,user3" [--posts 15]
  node giveaway-scout-apify.cjs --accounts-file accounts.txt [--posts 15]
  node giveaway-scout-apify.cjs --following-file results/following.json [--posts 15]
  node giveaway-scout-apify.cjs --analyze-only results/posts.json`);
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  GIVEAWAY SCOUT — Apify Pipeline');
  console.log('═══════════════════════════════════════════');
  console.log(`  Source: ${opts.account ? '@' + opts.account : opts.accountsList ? 'manual list' : opts.accountsFile || opts.followingFile}`);
  console.log(`  Posts per account: ${opts.postsPerAccount}`);
  console.log(`  Max accounts: ${opts.maxAccounts || 'all'}`);
  console.log(`  Batch size: ${opts.batchSize}`);
  console.log('═══════════════════════════════════════════');

  // ── Phase 1a: Get account list ──
  let following;

  if (opts.accountsList) {
    // Direct comma-separated list: --accounts-list "user1,user2,user3"
    following = opts.accountsList.split(',').map(u => u.trim()).filter(Boolean).map(u => ({
      username: u.replace(/^@/, ''),
      fullName: '',
      isPrivate: false,
      isVerified: false,
      profileUrl: `https://www.instagram.com/${u.replace(/^@/, '')}/`,
    }));
    console.log(`\n[Phase 1a] Using manual list: ${following.length} accounts`);

  } else if (opts.accountsFile) {
    // Text file with one username per line: --accounts-file accounts.txt
    const raw = fs.readFileSync(opts.accountsFile, 'utf8');
    following = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(u => ({
      username: u.replace(/^@/, ''),
      fullName: '',
      isPrivate: false,
      isVerified: false,
      profileUrl: `https://www.instagram.com/${u.replace(/^@/, '')}/`,
    }));
    console.log(`\n[Phase 1a] Loaded ${following.length} accounts from ${opts.accountsFile}`);

  } else if (opts.followingFile) {
    // Saved JSON from a previous run: --following-file results/scout-*-following.json
    console.log(`\n[Phase 1a] Loading following list from: ${opts.followingFile}`);
    following = JSON.parse(fs.readFileSync(opts.followingFile, 'utf8'));
    console.log(`  Loaded ${following.length} accounts`);

  } else {
    // Apify following scraper (requires cookies): --account USERNAME
    following = await getFollowingList(opts.account);
  }

  // Override opts.account for file naming
  if (!opts.account) opts.account = label;

  // Apply max accounts limit
  if (opts.maxAccounts > 0 && following.length > opts.maxAccounts) {
    console.log(`  Limiting to first ${opts.maxAccounts} accounts`);
    following = following.slice(0, opts.maxAccounts);
  }

  if (following.length === 0) {
    console.log('\nNo public accounts to scrape. Done.');
    return;
  }

  // ── Phase 1b: Get posts from each account ──
  const scrapedPosts = await getPostsFromAccounts(following, opts.postsPerAccount, opts.batchSize);

  console.log(`\n[Phase 1 Complete] Total posts collected: ${scrapedPosts.length}`);

  // ── Merge with previous run (Quick Scan) ──
  const posts = opts.mergeWith ? mergePosts(scrapedPosts, opts.mergeWith) : scrapedPosts;

  // ── Analysis ──
  const summary = generateSummary(posts, following);

  console.log(`\n[Analysis]`);
  console.log(`  Total accounts scraped: ${summary.totalAccounts}`);
  console.log(`  Total posts: ${summary.totalPosts}`);
  console.log(`  Giveaway/lead-magnet posts detected: ${summary.totalGiveaways}`);

  if (summary.giveawayPosts.length > 0) {
    console.log(`\n  Top 10 giveaway posts by engagement:`);
    summary.giveawayPosts.slice(0, 10).forEach((p, i) => {
      const details = extractGiveawayDetails(p);
      console.log(`  ${i + 1}. @${p.ownerUsername} — ${fmt(p.commentsCount)} comments${details.keyword ? ' (keyword: ' + details.keyword + ')' : ''}`);
      console.log(`     ${p.caption.slice(0, 100)}${p.caption.length > 100 ? '...' : ''}`);
    });
  }

  if (summary.giveawayAccounts.length > 0) {
    console.log(`\n  Top giveaway accounts:`);
    summary.giveawayAccounts.slice(0, 10).forEach((a, i) => {
      console.log(`  ${i + 1}. @${a.username} — ${a.giveawayPosts} giveaway posts, ${fmt(a.totalComments)} total comments`);
    });
  }

  // ── Save everything ──
  console.log('\n[Saving results]');
  const files = saveResults(opts, following, posts, summary);

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  DONE — Results saved to results/ folder`);
  console.log(`═══════════════════════════════════════════`);
  console.log(`  Following: ${files.followingPath}`);
  console.log(`  All posts CSV: ${files.csvPath}`);
  console.log(`  Posts JSON: ${files.postsJsonPath}`);
  console.log(`  Summary: ${files.summaryPath}`);
  console.log(`\n  Next step: Run the Giveaway Scout skill`);
  console.log(`  with the summary JSON for full AI analysis.`);
  console.log(`═══════════════════════════════════════════\n`);
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
