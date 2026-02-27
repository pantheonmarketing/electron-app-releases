// instagram-tracker.cjs
// Fetches Instagram posts via Apify, finds new posts/reels, sends Telegram digest

const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const ACCOUNTS = [
  { name: 'ineffable_ai22', url: 'https://www.instagram.com/ineffable_ai22/' },
];

const APIFY_API_TOKEN    = process.env.APIFY_API_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

const ACTOR_ID    = 'shu8hvrXbJbY3Eb9W'; // Apify Instagram Scraper
const RESULTS_LIMIT = 30;
const POLL_INTERVAL = 10000; // 10 seconds
const MAX_POLL_TIME = 5 * 60 * 1000; // 5 minutes

const STATE_FILE = path.join(__dirname, 'instagram-tracker-state.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { seen: [] }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCount(n) {
  if (!n && n !== 0) return '?';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function postTypeIcon(type) {
  if (!type) return '📷';
  const t = type.toLowerCase();
  if (t === 'video') return '🎬';
  if (t === 'sidecar') return '🎠';
  return '🖼';
}

function postTypeLabel(type) {
  if (!type) return 'Post';
  const t = type.toLowerCase();
  if (t === 'video') return 'Reel';
  if (t === 'sidecar') return 'Carousel';
  return 'Photo';
}

// ── Apify ─────────────────────────────────────────────────────────────────────

async function startApifyRun(accountUrls) {
  const body = JSON.stringify({
    directUrls: accountUrls,
    resultsType: 'posts',
    resultsLimit: RESULTS_LIMIT,
  });

  const res = await httpsRequest({
    hostname: 'api.apify.com',
    path: `/v2/acts/${ACTOR_ID}/runs?token=${APIFY_API_TOKEN}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, body);

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Failed to start Apify actor: ${JSON.stringify(res.body)}`);
  }

  return res.body.data.id;
}

async function pollApifyRun(runId) {
  const start = Date.now();
  while (Date.now() - start < MAX_POLL_TIME) {
    const res = await get(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`);
    const status = res.data && res.data.status;
    console.log(`  Apify run status: ${status}`);
    if (status === 'SUCCEEDED') return res.data.defaultDatasetId;
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify run ${status}: ${runId}`);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  throw new Error('Apify run timed out after 5 minutes');
}

async function fetchDataset(datasetId) {
  const res = await get(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`);
  return Array.isArray(res) ? res : [];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!APIFY_API_TOKEN) {
    console.error('Missing APIFY_API_TOKEN env var');
    process.exit(1);
  }
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env vars');
    process.exit(1);
  }

  const state = loadState();
  const seenSet = new Set(state.seen);

  const accountUrls = ACCOUNTS.map(a => a.url);
  console.log(`Starting Apify run for ${accountUrls.length} account(s)...`);

  const runId = await startApifyRun(accountUrls);
  console.log(`Run started: ${runId}. Polling...`);

  const datasetId = await pollApifyRun(runId);
  console.log(`Run succeeded. Fetching dataset ${datasetId}...`);

  const items = await fetchDataset(datasetId);
  console.log(`Fetched ${items.length} post(s) from Apify.`);

  // Group posts by account, detect new ones
  const newByAccount = {}; // { username: [post, ...] }

  for (const item of items) {
    const postId = `ig:${item.id || item.shortCode}`;
    if (!postId || postId === 'ig:undefined') continue;

    if (!seenSet.has(postId)) {
      const username = item.ownerUsername || 'unknown';
      if (!newByAccount[username]) newByAccount[username] = [];
      newByAccount[username].push({ postId, ...item });
      seenSet.add(postId);
    }
  }

  const totalNew = Object.values(newByAccount).reduce((s, arr) => s + arr.length, 0);

  if (totalNew === 0) {
    console.log('No new posts found.');
    await sendTelegram('📸 <b>Instagram Tracker</b>\n\nNo new posts since last check. All caught up!');
  } else {
    console.log(`Found ${totalNew} new post(s).`);

    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    let msg = `📸 <b>Instagram Tracker — ${totalNew} new post${totalNew > 1 ? 's' : ''}</b>\n`;
    msg += `<i>${dateStr}</i>\n`;

    for (const [username, posts] of Object.entries(newByAccount)) {
      msg += `\n<b>@${username}</b> (${posts.length} new)\n`;
      for (const p of posts) {
        const icon = postTypeIcon(p.type);
        const label = postTypeLabel(p.type);
        const caption = p.caption ? p.caption.replace(/\n/g, ' ').slice(0, 80) + (p.caption.length > 80 ? '…' : '') : '(no caption)';
        const likes = formatCount(p.likesCount);
        const comments = formatCount(p.commentsCount);
        const date = formatDate(p.timestamp);
        const link = p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : '');

        if (link) {
          msg += `${icon} <a href="${link}">${label}: ${caption}</a>\n`;
        } else {
          msg += `${icon} ${label}: ${caption}\n`;
        }
        msg += `  ❤️${likes} 💬${comments}${date ? ' · ' + date : ''}\n`;
      }
    }

    // Split if over Telegram's 4096 char limit
    if (msg.length <= 4096) {
      await sendTelegram(msg);
    } else {
      const header = `📸 <b>Instagram Tracker — ${totalNew} new posts</b>\n(split into multiple messages)\n`;
      await sendTelegram(header);
      for (const [username, posts] of Object.entries(newByAccount)) {
        let chunk = `<b>@${username}</b> (${posts.length} new)\n`;
        for (const p of posts) {
          const icon = postTypeIcon(p.type);
          const label = postTypeLabel(p.type);
          const caption = p.caption ? p.caption.replace(/\n/g, ' ').slice(0, 80) + (p.caption.length > 80 ? '…' : '') : '(no caption)';
          const likes = formatCount(p.likesCount);
          const comments = formatCount(p.commentsCount);
          const date = formatDate(p.timestamp);
          const link = p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : '');
          if (link) {
            chunk += `${icon} <a href="${link}">${label}: ${caption}</a>\n`;
          } else {
            chunk += `${icon} ${label}: ${caption}\n`;
          }
          chunk += `  ❤️${likes} 💬${comments}${date ? ' · ' + date : ''}\n`;
        }
        await sendTelegram(chunk);
      }
    }
  }

  state.seen = [...seenSet];
  saveState(state);
  console.log('Done. State saved.');
}

main().catch(console.error);
