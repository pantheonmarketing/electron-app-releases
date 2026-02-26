# Instagram Tracker Skill

Monitors Instagram accounts via Apify scraper, detects new posts/reels since last run, sends a formatted digest to Telegram. Same pattern as youtube-tracker.

## Quick Reference

| Item | Value |
|------|-------|
| Script | `instagram-tracker.cjs` |
| State file | `instagram-tracker-state.json` |
| API | Apify REST API (actor `shu8hvrXbJbY3Eb9W` = Instagram Scraper) |
| Notifications | Telegram bot |
| Env vars | `APIFY_API_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |

## Run Command

```bash
# With .env.vercel (same as youtube tracker):
node -e "require('fs').readFileSync('.env.vercel','utf8').split('\n').forEach(l=>{const[k,...v]=l.split('=');if(k&&v.length)process.env[k.trim()]=v.join('=').trim().replace(/^\"|\"$/g,'')});require('./instagram-tracker.cjs')"
```

## How It Works

1. Reads `ACCOUNTS` array from config at top of script
2. Sends all account URLs to Apify Instagram Scraper (actor `shu8hvrXbJbY3Eb9W`)
3. Polls Apify every 10s until run completes (max 5 min)
4. Compares returned posts against `instagram-tracker-state.json`
5. New posts get formatted with type icon, caption preview, engagement stats, and IG link
6. Sends digest to Telegram grouped by account
7. Updates state file with all seen post IDs

## Tracked Accounts

Edit the `ACCOUNTS` array at the top of `instagram-tracker.cjs`:

```js
const ACCOUNTS = [
  { name: 'ineffable_ai22', url: 'https://www.instagram.com/ineffable_ai22/' },
  // Add more:
  // { name: 'aitana.lopez', url: 'https://www.instagram.com/aitana.lopez/' },
  // { name: 'lilmiquela', url: 'https://www.instagram.com/lilmiquela/' },
];
```

To add an account: add `{ name: 'username', url: 'https://www.instagram.com/username/' }` to the array.

## Telegram Digest Format

```
📸 Instagram Tracker — 5 new posts
Tuesday, February 24

@ineffable_ai22 (5 new)
🎬 Reel: This new AI tool is insane for creators…
  ❤️12.5K 💬342 · Feb 23, 2026
🖼 Photo: Morning vibes in the studio…
  ❤️8.2K 💬156 · Feb 22, 2026
```

Post types: 🎬 Reel, 🖼 Photo, 🎠 Carousel

## Apify Details

- **Actor:** `shu8hvrXbJbY3Eb9W` (Instagram Scraper)
- **Input:** `directUrls` (array of profile URLs), `resultsType: "posts"`, `resultsLimit: 30`
- **API flow:** POST to start run → poll GET for status → GET dataset items when SUCCEEDED
- **Cost:** ~$0.25-0.50 per run (depends on number of accounts/posts)
- **Rate:** Don't run more than a few times per day to avoid excessive Apify usage

## State File

`instagram-tracker-state.json` stores an array of seen post IDs in format `ig:{postId}`:

```json
{
  "seen": ["ig:abc123", "ig:def456", ...]
}
```

Delete this file to trigger a "first run" that captures all recent posts.

## Post Data Fields (from Apify)

Key fields available from each scraped post:
- `id` / `shortCode` — unique post identifier
- `ownerUsername` — who posted it
- `type` — "Image", "Video", "Sidecar" (carousel)
- `caption` — post caption text
- `likesCount` — number of likes
- `commentsCount` — number of comments
- `timestamp` — when posted
- `url` — direct link to the post
- `videoUrl` — video URL (for reels)
- `displayUrl` — image thumbnail URL

## Adding More Intelligence (future ideas)

- **Engagement rate ranking:** Sort digest by engagement instead of date
- **Caption analysis:** Extract hashtags, mentions, call-to-actions
- **Posting frequency:** Track how often each account posts
- **Top performers:** Weekly summary of highest-engagement posts
- **Content type breakdown:** Reels vs photos vs carousels performance
- **Trend detection:** Flag posts with unusually high engagement

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Missing APIFY_API_TOKEN" | Add `APIFY_API_TOKEN` to `.env.vercel` |
| Apify actor timed out | Instagram may be rate-limiting. Try again later or reduce `RESULTS_LIMIT` |
| No posts found | Check account URL format (must include trailing slash), verify account is public |
| Telegram message too long | Script auto-splits by account. If single account has too many posts, reduce `RESULTS_LIMIT` |
| "Failed to start Apify actor" | Check API token is valid at console.apify.com |

## Environment Variables

```
APIFY_API_TOKEN=apify_api_xxxxx    # From console.apify.com → Settings → Integrations
TELEGRAM_BOT_TOKEN=xxxxx           # Existing bot token (shared with youtube tracker)
TELEGRAM_CHAT_ID=xxxxx             # Existing chat ID (shared with youtube tracker)
```
