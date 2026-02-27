// youtube-tracker.cjs
// Fetches YouTube RSS feeds, finds new videos, sends Telegram digest

const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const CHANNELS = [
  { name: 'RoboNuggets',              rss: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCgscS8mBsQZ5sFRkJIFWD7Q' },
  { name: 'AiorBust',                 rss: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbS2SdnBf99NOcpFViPEPBw' },
  { name: 'All About AI',             rss: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCR9j1jqqB5Rse69wjUnbYwA' },
  { name: 'Filip AI Influencer',      rss: 'https://www.youtube.com/feeds/videos.xml?channel_id=UClWni8ApyQ80vHF8gUMPlkQ' },
  { name: 'MreFlow',                  rss: 'https://www.youtube.com/feeds/videos.xml?channel_id=UChpleBmo18P08aKCIgti38g' },
];

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

const STATE_FILE = path.join(__dirname, '.claude-youtube-tracker-state.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseVideos(xml) {
  const videos = [];
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const entry of entries) {
    const id    = (entry.match(/<yt:videoId>(.+?)<\/yt:videoId>/) || [])[1];
    const title = (entry.match(/<title>(.+?)<\/title>/)           || [])[1];
    const pub   = (entry.match(/<published>(.+?)<\/published>/)   || [])[1];
    const link  = `https://www.youtube.com/watch?v=${id}`;
    if (id && title) videos.push({ id: `yt:video:${id}`, title, pub, link });
  }
  return videos;
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
    const body = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: false });
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
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env vars');
    process.exit(1);
  }

  const state = loadState();
  const seenSet = new Set(state.seen);
  const newVideos = []; // { channel, title, link, pub }

  for (const channel of CHANNELS) {
    console.log(`Fetching ${channel.name}...`);
    try {
      const xml = await get(channel.rss);
      const videos = parseVideos(xml);
      for (const v of videos) {
        if (!seenSet.has(v.id)) {
          newVideos.push({ channel: channel.name, ...v });
          seenSet.add(v.id);
        }
      }
    } catch (e) {
      console.error(`Error fetching ${channel.name}:`, e.message);
    }
  }

  // Sort newest first
  newVideos.sort((a, b) => new Date(b.pub) - new Date(a.pub));

  if (newVideos.length === 0) {
    console.log('No new videos found.');
    await sendTelegram('📺 <b>YouTube Tracker</b>\n\nNo new videos since last check. All caught up!');
  } else {
    console.log(`Found ${newVideos.length} new video(s).`);

    // Group by channel for readability
    const byChannel = {};
    for (const v of newVideos) {
      if (!byChannel[v.channel]) byChannel[v.channel] = [];
      byChannel[v.channel].push(v);
    }

    let msg = `📺 <b>YouTube Tracker — ${newVideos.length} new video${newVideos.length > 1 ? 's' : ''}</b>\n`;
    msg += `<i>${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</i>\n`;

    for (const [channelName, videos] of Object.entries(byChannel)) {
      msg += `\n<b>@${channelName}</b>\n`;
      for (const v of videos) {
        msg += `• <a href="${v.link}">${v.title}</a> <i>(${formatDate(v.pub)})</i>\n`;
      }
    }

    // Telegram has a 4096 char limit — split if needed
    if (msg.length <= 4096) {
      await sendTelegram(msg);
    } else {
      // Send in chunks per channel
      const header = `📺 <b>YouTube Tracker — ${newVideos.length} new videos</b>\n\n`;
      await sendTelegram(header + '(split into multiple messages due to length)');
      for (const [channelName, videos] of Object.entries(byChannel)) {
        let chunk = `<b>@${channelName}</b>\n`;
        for (const v of videos) chunk += `• <a href="${v.link}">${v.title}</a> <i>(${formatDate(v.pub)})</i>\n`;
        await sendTelegram(chunk);
      }
    }
  }

  // Save updated state
  state.seen = [...seenSet];
  saveState(state);
  console.log('Done. State saved.');
}

main().catch(console.error);
