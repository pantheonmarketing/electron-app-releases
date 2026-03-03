# Giveaway Scout Skill

Find viral giveaway ideas across Instagram, X, TikTok, and the web. Analyzes what's working, why it's working, and gives you an adapted version ready to build.

---

## THREE MODES

### Mode 1: "Swipe This" (URL Analysis)
User gives you a URL to a specific post (Instagram, X, TikTok, or any social media post). You:
1. Scrape the post
2. Extract the giveaway offer, hook, CTA, and engagement data
3. Analyze why it works
4. Generate an adapted version for the user's niche
5. Output a ready-to-build brief

**Trigger phrases:** Any message containing a URL to a social media post, or phrases like "swipe this", "analyze this", "adapt this post"

### Mode 2: "Scout" (Niche Discovery via Web Search)
User gives you a niche or topic. You:
1. Run multiple search passes across platforms
2. Find viral giveaway posts and lead magnets
3. Discover accounts worth following
4. Score and rank ideas by virality potential
5. Output a ranked list with adapted versions

**Trigger phrases:** "scout", "find giveaway ideas", "find viral posts", "what's working in [niche]", or just a niche name like "fitness" or "real estate"

### Mode 3: "Deep Scout" (Apify Pipeline — Instagram)
User gives you an Instagram account (or says "my account"). You:
1. Run the Apify pipeline to scrape all followed accounts + their latest posts
2. Analyze the collected data to identify giveaway/lead-magnet posts
3. Rank the best ideas by engagement and replicability
4. Output a full report with adapted versions ready to build

**Trigger phrases:** "deep scout", "scan my following", "use apify", "scrape my following list", or anything mentioning "following" + "posts"

**This is the most powerful mode** — it analyzes real engagement data from hundreds of accounts you already follow, finding proven winners in your niche.

---

## MODE 1: SWIPE THIS

### Step 1 — Scrape the Post

**For Instagram URLs:**
```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js scrape \
  --model "firecrawl/scrape" \
  --url "THE_INSTAGRAM_URL"
```

**For X/Twitter URLs:**
```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js scrape \
  --model "firecrawl/scrape" \
  --url "THE_X_URL"
```

**For any other URL:** Same Firecrawl scrape command.

If Firecrawl fails (some IG posts are login-walled), try ScrapingDog:
```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js scrape \
  --model "scrapingdog/scrape" \
  --url "THE_URL"
```

If both fail, use Perplexity to search for the post:
```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js search \
  --model "perplexity/sonar-pro" \
  --query "instagram post [username] [any text from the URL or context the user gave]"
```

### Step 2 — Extract & Analyze

From the scraped content, extract:
- **The Offer:** What are they giving away? (e.g., "50 ChatGPT prompts", "Free meal plan PDF")
- **The Hook:** First line or caption hook
- **The CTA:** What do people need to do? (comment keyword, DM, click link)
- **The Keyword:** What word do they ask people to comment?
- **Engagement:** Comments, likes, shares (if visible)
- **Account Size:** Follower count (if visible)
- **Format:** Reel, carousel, static post, tweet, thread

### Step 3 — Analyze Why It Works

Score these virality factors (1-5 each):
- **Specificity:** Is the offer specific? ("50 prompts" > "free guide")
- **Instant Value:** Can they use it immediately?
- **Low Barrier:** Is the CTA frictionless? (comment > sign up > pay)
- **Social Proof:** Does the engagement create FOMO?
- **Curiosity Gap:** Does the hook create curiosity?
- **Number Power:** Does it use a specific number? (numbers always win)
- **Niche Fit:** How well does it match the audience?

### Step 4 — Generate Adapted Version

Create an adapted version with:
- **Your Headline:** Rewritten for the user's niche/brand
- **Your CTA:** Adapted comment keyword
- **Your Hook:** First 2 lines of the caption
- **Funnel Brief:** One-liner ready to paste into AI Create
- **Post Caption:** Full caption draft (use Jonny's writing style if for Jonny's accounts — short punchy sentences, line breaks, conversational, bold claims)

### Output Format for Mode 1:

```
═══ SWIPE ANALYSIS ═══

📌 Original Post
   Account: @username (XXK followers)
   Platform: Instagram Reel
   Engagement: ~X,XXX comments / X,XXX likes
   Format: Reel / Carousel / Static

🎁 The Giveaway
   Offer: [What they're giving away]
   CTA: "Comment [KEYWORD] and I'll send you..."
   Hook: "[First line of caption]"

📊 Why It Works (Score: XX/35)
   ✦ Specificity: X/5 — [brief reason]
   ✦ Instant Value: X/5 — [brief reason]
   ✦ Low Barrier: X/5 — [brief reason]
   ✦ Social Proof: X/5 — [brief reason]
   ✦ Curiosity Gap: X/5 — [brief reason]
   ✦ Number Power: X/5 — [brief reason]
   ✦ Niche Fit: X/5 — [brief reason]

✅ YOUR ADAPTED VERSION
   Headline: "[Your version of the giveaway title]"
   CTA Keyword: [KEYWORD]

   Caption Draft:
   [Full caption ready to post —
    hook → value → CTA →
    written in short punchy style]

🚀 Ready to build?
   Paste into AI Create: "[one-line giveaway description]"
```

---

## MODE 2: SCOUT (Niche Discovery)

### Search Strategy — Run ALL Passes

Run these search passes in order. Each pass uses different queries to maximize coverage.

#### Pass 1: Direct Viral Post Search (Perplexity)

Run 2-3 of these queries:
```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js search \
  --model "perplexity/sonar-pro" \
  --query "viral instagram giveaway [NICHE] 2025 2026 comment keyword DM free"
```

```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js search \
  --model "perplexity/sonar-pro" \
  --query "most viral lead magnet [NICHE] instagram tiktok high engagement"
```

```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js search \
  --model "perplexity/sonar-pro" \
  --query "best performing free giveaway [NICHE] social media comment to get 2025 2026"
```

#### Pass 2: X/Twitter Search (Google)

```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js search \
  --model "scrapingdog/google_search" \
  --query "site:x.com \"reply\" OR \"comment\" \"free\" \"DM\" [NICHE] 2025 OR 2026"
```

```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js search \
  --model "scrapingdog/google_search" \
  --query "site:x.com \"I'll send you\" OR \"I'll DM you\" [NICHE]"
```

#### Pass 3: Blog & Roundup Search

```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js search \
  --model "perplexity/sonar-pro" \
  --query "best lead magnet ideas [NICHE] examples viral free download checklist template"
```

```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js search \
  --model "scrapingdog/google_search" \
  --query "\"lead magnet\" \"[NICHE]\" ideas examples viral 2025 OR 2026"
```

#### Pass 4: Reddit & Community Search

```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js search \
  --model "perplexity/sonar-pro" \
  --query "reddit best lead magnet [NICHE] what worked free giveaway high conversion"
```

#### Pass 5: Account Discovery

```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js search \
  --model "perplexity/sonar-pro" \
  --query "top [NICHE] instagram accounts that do giveaways free resources lead magnets creators to follow"
```

### Scrape Top Results

For the most promising URLs found in the searches, scrape them for full details:
```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js scrape \
  --model "firecrawl/scrape" \
  --url "ARTICLE_OR_POST_URL"
```

### Score & Rank Ideas

For each giveaway idea found, score it on:

| Factor | Weight | What to look for |
|--------|--------|-----------------|
| Proven engagement | 3x | Actual comment/share numbers from real posts |
| Replicability | 2x | Can you make this in a day? PDF/checklist > custom tool |
| Niche specificity | 2x | "50 AI Prompts for Realtors" > "Free AI Guide" |
| Evergreen potential | 1x | Will this work in 6 months or is it trend-dependent? |
| Uniqueness in niche | 1x | Is everyone already doing this exact giveaway? |

Score each factor 1-5, multiply by weight, total out of 45.

### Output Format for Mode 2:

```
═══ GIVEAWAY SCOUT: [NICHE] ═══
Searched: Instagram, X, TikTok, Reddit, blogs
Found: X giveaway ideas, Y accounts worth following

────────────────────────────────

🏆 #1 — "[Giveaway Title]" (Score: XX/45)
   Platform: [Where it was found]
   Source: @account (XXK followers) — [link if available]
   Engagement: ~X,XXX comments
   Format: [Reel/Post/Tweet/Thread]
   CTA: "Comment [WORD] and I'll..."

   Why it works: [1-2 sentences]

   ✅ Your version: "[Adapted title for your brand]"
   → AI Create prompt: "[one-liner to paste]"

────────────────────────────────

🥈 #2 — "[Giveaway Title]" (Score: XX/45)
   [same format]

────────────────────────────────

[Continue for top 5-7 ideas]

════════════════════════════════

📋 ACCOUNTS TO FOLLOW
These accounts regularly do giveaways in [NICHE]:
1. @account1 — [platform] — [why follow them]
2. @account2 — [platform] — [why follow them]
[up to 10 accounts]

💡 TOP 3 QUICK WINS
Ideas you could build TODAY:
1. [Title] — [why it's a quick win]
2. [Title] — [why it's a quick win]
3. [Title] — [why it's a quick win]
```

---

## MODE 3: DEEP SCOUT (Apify Pipeline)

This is the most powerful mode. It uses Apify to scrape real Instagram data and find proven giveaway winners from accounts the user already follows.

### Prerequisites
- `APIFY_API_TOKEN` must be set (check `.env`)
- Script location: `giveaway-scout-apify.cjs` (in the task-manager root)
- Results saved to: `results/` folder

### Step 1 — Prepare the Accounts List

The pipeline needs a list of IG accounts to scrape. There are 3 ways to provide it:

**Option A: Accounts file (recommended)**
Create a text file with one username per line:
```bash
cat > scout-accounts.txt << 'EOF'
ineffable_ai22
marselcreates.ai
aitoolsclub
ai.creators.hub
the.ai.marketer
EOF
```

**Option B: Comma-separated list (quick)**
Pass directly on command line: `--accounts-list "ineffable_ai22,marselcreates.ai,aitoolsclub"`

**Option C: From previous run**
Re-use a saved following JSON: `--following-file results/scout-*-following.json`

**Where to get the accounts:**
- Open the user's Instagram profile → click "Following" → note down the accounts
- Ask the user: "Which IG accounts do you want to scout?"
- Use the Instagram Tracker config to find accounts already being monitored

### Step 2 — Run the Apify Pipeline Script

Use a launcher script to load env vars and set the args:

```javascript
// Create a file like run-scout.cjs:
const fs = require('fs');
fs.readFileSync('.env', 'utf8').split('\n').forEach(l => {
  const [k, ...v] = l.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
});
process.argv = ['node', 'giveaway-scout-apify.cjs',
  '--accounts-file', 'scout-accounts.txt',
  '--posts', '15',
  '--batch-size', '5',
];
require('./giveaway-scout-apify.cjs');
```

Then run: `node run-scout.cjs`

**CLI options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--accounts-file PATH` | — | Text file with one username per line |
| `--accounts-list "a,b,c"` | — | Comma-separated usernames |
| `--following-file PATH` | — | Saved JSON from previous run |
| `--account USERNAME` | — | IG account to scrape following from (needs cookies) |
| `--posts N` | 15 | Number of latest posts per account |
| `--batch-size N` | 5 | Accounts per Apify batch (higher = faster but pricier) |
| `--max-accounts N` | all | Limit how many accounts to process |
| `--analyze-only PATH` | — | Skip scraping, just analyze saved posts JSON |

**Example launcher scripts:**

Full run with accounts file:
```javascript
const fs = require('fs');
fs.readFileSync('.env', 'utf8').split('\n').forEach(l => {
  const [k, ...v] = l.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
});
process.argv = ['node', 'giveaway-scout-apify.cjs',
  '--accounts-file', 'scout-accounts.txt',
  '--posts', '15',
];
require('./giveaway-scout-apify.cjs');
```

Quick test (3 accounts, 5 posts each):
```javascript
const fs = require('fs');
fs.readFileSync('.env', 'utf8').split('\n').forEach(l => {
  const [k, ...v] = l.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
});
process.argv = ['node', 'giveaway-scout-apify.cjs',
  '--accounts-list', 'ineffable_ai22,marselcreates.ai,aitoolsclub',
  '--posts', '5',
];
require('./giveaway-scout-apify.cjs');
```

Re-analyze saved data (no Apify cost):
```javascript
const fs = require('fs');
fs.readFileSync('.env', 'utf8').split('\n').forEach(l => {
  const [k, ...v] = l.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
});
process.argv = ['node', 'giveaway-scout-apify.cjs',
  '--analyze-only', 'results/scout-custom-list-TIMESTAMP-posts.json',
];
require('./giveaway-scout-apify.cjs');
```

### Step 2 — Wait for Results

The script will:
1. Scrape the following list via Apify (~1-3 min)
2. Batch-scrape posts from each account (~2-5 min per batch of 5)
3. Auto-detect giveaway posts based on caption analysis
4. Save everything to `results/` folder

**Output files:**
| File | Content |
|------|---------|
| `results/scout-{account}-{timestamp}-following.json` | List of all followed accounts |
| `results/scout-{account}-{timestamp}-posts.csv` | All posts as spreadsheet |
| `results/scout-{account}-{timestamp}-posts.json` | All posts as JSON (for AI analysis) |
| `results/scout-{account}-{timestamp}-giveaways.csv` | Only giveaway-detected posts |
| `results/scout-{account}-{timestamp}-summary.json` | Summary with top giveaways + accounts |

### Step 3 — AI Analysis

Once the script completes, read the summary JSON file and perform deep analysis.

**Read the summary:**
```bash
cat results/scout-*-summary.json
```

**From the summary data, analyze each giveaway post:**

For each giveaway post in `summary.giveawayPosts`, score it on:

| Factor | Weight | Scoring Guide |
|--------|--------|--------------|
| **Engagement proof** | 3x | Comments are king. 1000+ comments = 5, 500+ = 4, 100+ = 3, 50+ = 2, <50 = 1 |
| **Replicability** | 2x | PDF/checklist = 5, template = 4, resource list = 4, mini course = 3, tool = 2, video = 3 |
| **Specificity** | 2x | Has number + specific topic = 5, specific topic = 4, generic = 2 |
| **FB/IG cross-platform** | 1x | Would this work on BOTH FB + IG? Same CTA style = 5, needs adapting = 3, platform-specific = 1 |
| **Freshness** | 1x | Posted in last 30 days = 5, 30-90 days = 4, 90-180 days = 3, older = 2 |

Total score out of 45.

### Step 4 — Generate Report

Output the full ranked report:

```
═══ DEEP SCOUT REPORT ═══
Account: @theaiinfluenceracademy
Following: X accounts scraped
Posts analyzed: X total, X giveaway posts detected
Apify cost: ~$X.XX

════════════════════════════════════════

🏆 #1 — "[Giveaway Title]" (Score: XX/45)
   Account: @username
   Post: [URL]
   Type: Reel / Carousel / Photo
   Date: YYYY-MM-DD
   Engagement: X,XXX comments / X,XXX likes
   CTA: "Comment [KEYWORD]..."

   📝 Caption excerpt:
   "[First 200 chars of caption]"

   📊 Scoring:
   ✦ Engagement proof: X/5 (×3) — [reason]
   ✦ Replicability: X/5 (×2) — [reason]
   ✦ Specificity: X/5 (×2) — [reason]
   ✦ FB/IG cross-platform: X/5 (×1) — [reason]
   ✦ Freshness: X/5 (×1) — [reason]

   ✅ YOUR VERSION:
   Headline: "[Adapted giveaway title]"
   CTA keyword: [WORD]
   Hook: "[2-line hook for the caption]"
   AI Create prompt: "[one-liner to paste into Funnel Builder]"

   Why this will go viral for you:
   [2-3 sentences explaining why this specific idea
    is perfect for Jonny's audience on FB + IG]

════════════════════════════════════════

[Continue for top 10 ideas]

════════════════════════════════════════

📋 GIVEAWAY-HEAVY ACCOUNTS
These accounts post the most giveaways — follow & monitor:
1. @account — X giveaway posts found, avg X,XXX comments
2. @account — X giveaway posts found, avg X,XXX comments
[up to 15 accounts]

💡 TOP 3 QUICK WINS
Build these TODAY with Funnel Builder:
1. "[Title]" — [what to create + why it's fast]
2. "[Title]" — [what to create + why it's fast]
3. "[Title]" — [what to create + why it's fast]

📊 NICHE INSIGHTS
- Most common giveaway type: [type]
- Average engagement on giveaway posts: [X,XXX comments]
- Best performing format: [Reel/Carousel/Photo]
- Most used CTA style: [Comment keyword / DM / Link in bio]
- Peak posting time: [if detectable from timestamps]
```

---

## GIVEAWAY TYPES TO LOOK FOR

These are the formats that go viral as giveaways:

| Type | Example | Replicability |
|------|---------|--------------|
| **Prompt packs** | "100 ChatGPT Prompts for Marketing" | Easy |
| **Checklists** | "The Ultimate SEO Checklist" | Easy |
| **Templates** | "My Exact Cold Email Template" | Easy |
| **Swipe files** | "50 High-Converting Headlines" | Easy |
| **Cheat sheets** | "Instagram Algorithm Cheat Sheet" | Easy |
| **Mini courses** | "Free 5-Day Email Course" | Medium |
| **Tools/calculators** | "Free ROI Calculator" | Harder |
| **Video trainings** | "Free 30-Min Masterclass" | Medium |
| **Resource lists** | "My Top 20 AI Tools (with links)" | Easy |
| **Scripts** | "My Exact DM Script That Closes" | Easy |

Prioritize the easy-to-replicate types (prompts, checklists, templates, swipe files, resource lists) because:
1. You can create them in minutes with AI
2. They have the highest perceived value-to-effort ratio
3. They work across every niche

---

## SAVING DISCOVERED ACCOUNTS

When the skill discovers accounts worth following, save them to a JSON file so they can be monitored later:

```bash
# Save to a niche-specific file
cat > giveaway-accounts-[NICHE].json << 'EOF'
{
  "niche": "[NICHE]",
  "updated": "[DATE]",
  "accounts": [
    {
      "username": "@account",
      "platform": "instagram",
      "followers": "XXK",
      "url": "https://instagram.com/account",
      "notes": "Does weekly prompt giveaways, 5K+ comments average"
    }
  ]
}
EOF
```

Tell the user you've saved the accounts and they can use them for future monitoring.

---

## IMPORTANT NOTES

- **Mode 3 (Deep Scout) is the best for finding proven winners.** Real engagement data beats web search every time.
- **Always run at least 3 search passes in Mode 2.** More searches = better results. Don't stop after one query.
- **Scrape at least 2-3 promising URLs** from the search results for deeper analysis.
- **Quality over quantity.** 5 great ideas beat 20 mediocre ones. Be selective.
- **The "Your version" adaptation is the most valuable part.** Don't just list what you found — transform it into something the user can build immediately.
- **If ScrapingDog returns "undefined" or fails**, fall back to Perplexity. Perplexity is the most reliable search tool.
- **Save accounts to JSON** whenever you discover good ones. This builds a monitoring list over time.
- **Include the AI Create prompt** for every idea so the user can go straight from scout → build.
- **Apify costs ~$0.25-0.50 per batch.** A full Deep Scout of 50 accounts costs roughly $2-5 total. Don't run unnecessarily.
- **Re-use the following list.** Once scraped, save the following JSON and use `--following-file` next time to skip re-scraping.
