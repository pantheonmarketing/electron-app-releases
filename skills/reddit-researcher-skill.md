# Reddit AI Researcher Skill

Monitor AI subreddits for trending content, viral posts, and community sentiment. Score posts for relevance to Jonnys audience, save the best finds to a persistent CSV spreadsheet that accumulates over time.

**Differs from ai-news-researcher-skill.md:** This is Reddit-specific, goes deeper into community sentiment, tracks posts in a persistent CSV with dedup, and focuses on viral/upvoted content rather than news articles.

---

## PURPOSE

Jonnys audience is non-technical beginners learning to build AI influencers. Reddit surfaces:
- **Case studies** — real people sharing income/results with AI
- **Pain points** — what people struggle with (= content angles)
- **Tool sentiment** — honest reviews before/after hype dies
- **Controversies** — heated debates = manifesto-style posts
- **Trends** — when the same topic appears across subreddits, its a wave

This skill turns Reddit gold into FB posts, emails, Skool discussions, and ad scripts.

---

## SUBREDDIT TIERS

### Tier 1 — CORE (scan every session)
| Subreddit | Why | Members |
|-----------|-----|---------|
| r/ClaudeAI | Claude usage, prompts, workflows — Jonnys primary tool | 200K+ |
| r/ChatGPT | AI comparisons, viral stories, mainstream AI sentiment | 5M+ |
| r/generativeAI | General AI tools and news, creator-adjacent | 100K+ |
| r/ArtificialIntelligence | Broader AI discussions, trend spotting | 1M+ |

### Tier 2 — MONEY & BUSINESS (scan weekly)
| Subreddit | Why |
|-----------|-----|
| r/entrepreneur | AI business ideas, solopreneur stories |
| r/SideProject | People shipping AI tools, launches |
| r/Passive_Income | AI monetization angles |
| r/ContentCreators | Creator economy meets AI |

### Tier 3 — VISUAL AI & TECHNICAL (scan for tutorials/tools)
| Subreddit | Why |
|-----------|-----|
| r/StableDiffusion | Image generation (AI influencer images) |
| r/Midjourney | AI art, prompt techniques |
| r/LocalLLaMA | Open source AI, community sentiment |

---

## REDDIT ACCESS METHOD

### Primary: Bash curl + Reddit JSON API

**CRITICAL: WebFetch is BLOCKED for Reddit.** Always use Bash `curl` with a User-Agent header.

Append `.json` to any Reddit URL. Sorting options: `hot`, `new`, `top` (with `?t=hour/day/week/month/year/all`).

### Tier 1 (combined — every session)
```bash
curl -s "https://www.reddit.com/r/ClaudeAI+ChatGPT+generativeAI+ArtificialIntelligence/top.json?t=week&limit=50" \
  -H "User-Agent: RedditResearchBot/1.0"
```

### Tier 2 (combined — weekly)
```bash
curl -s "https://www.reddit.com/r/entrepreneur+SideProject+Passive_Income+ContentCreators/top.json?t=week&limit=25" \
  -H "User-Agent: RedditResearchBot/1.0"
```

### Tier 3 (combined — as needed)
```bash
curl -s "https://www.reddit.com/r/StableDiffusion+Midjourney+LocalLLaMA/top.json?t=week&limit=25" \
  -H "User-Agent: RedditResearchBot/1.0"
```

### Hot / Rising (catch whats trending NOW)
```bash
curl -s "https://www.reddit.com/r/ClaudeAI+ChatGPT+generativeAI/hot.json?limit=25" \
  -H "User-Agent: RedditResearchBot/1.0"
```

### Todays top (Quick Scan)
```bash
curl -s "https://www.reddit.com/r/ClaudeAI+ChatGPT+generativeAI+ArtificialIntelligence/top.json?t=day&limit=25" \
  -H "User-Agent: RedditResearchBot/1.0"
```

### Parse + Display Pipeline
Pipe curl output to Node for clean display:
```bash
curl -s "URL_HERE" -H "User-Agent: RedditResearchBot/1.0" | \
  node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      const j=JSON.parse(d);
      const posts=j.data.children.map(c=>c.data);
      posts.forEach((p,i)=>{
        console.log(\"\n--- #\"+(i+1)+\" ---\");
        console.log(\"[\"+p.subreddit+\"] \"+p.title);
        console.log(\"Score: \"+p.score+\" | Comments: \"+p.num_comments+\" | Ratio: \"+p.upvote_ratio);
        console.log(\"URL: https://reddit.com\"+p.permalink);
        console.log(\"Date: \"+new Date(p.created_utc*1000).toISOString().split('T')[0]);
        if(p.link_flair_text) console.log(\"Flair: \"+p.link_flair_text);
        if(p.selftext) console.log(\"Preview: \"+p.selftext.substring(0,150).replace(/\\n/g,' '));
      });
    })"
```

### Fallback: Firecrawl (for reading full post + comments)
```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js scrape \
  --model "firecrawl/scrape" \
  --url "https://reddit.com/r/ClaudeAI/comments/POST_ID/post_title/"
```

### Reddit JSON Field Reference
| Reddit Field | CSV Column | Description |
|---|---|---|
| `id` | `reddit_id` | Unique post ID (for dedup) |
| `title` | `title` | Post title |
| `author` | — | Reddit username (not stored) |
| `score` | `upvotes` | Net upvotes |
| `num_comments` | `comments` | Comment count |
| `subreddit` | `subreddit` | Source subreddit |
| `permalink` | `url` | Full Reddit URL |
| `selftext` | — | Post body (used for scoring, not stored full) |
| `created_utc` | `post_date` | Unix timestamp → YYYY-MM-DD |
| `link_flair_text` | `flair` | Subreddit flair tag |
| `upvote_ratio` | `ratio` | Upvote percentage (0.0-1.0) |

---

## CSV SPREADSHEET

### File Location
`reddit-research.csv` in project root (gitignored — not committed)

### Columns (15)
```
date_found,reddit_id,subreddit,title,url,upvotes,comments,ratio,post_date,flair,relevance_score,content_angle,status,notes,used_for
```

| Column | Type | Description |
|---|---|---|
| `date_found` | YYYY-MM-DD | Date this scan found the post |
| `reddit_id` | string | Reddit post ID (dedup key) |
| `subreddit` | string | Which subreddit |
| `title` | string | Post title (CSV-escaped) |
| `url` | string | Full Reddit URL |
| `upvotes` | number | Score at time of scan |
| `comments` | number | Comment count at time of scan |
| `ratio` | float | Upvote ratio 0.0-1.0 |
| `post_date` | YYYY-MM-DD | When the Reddit post was created |
| `flair` | string | Subreddit flair tag |
| `relevance_score` | 1-10 | Score from the framework below |
| `content_angle` | string | One of 6 angle types |
| `status` | string | `New` / `Saved` / `Used` / `Skip` |
| `notes` | string | Hook idea, key quote, spin |
| `used_for` | string | `FB` / `Email` / `Skool` / `Ad` / blank |

### Deduplication
Before appending rows, ALWAYS:
1. Read existing CSV
2. Extract all `reddit_id` values into a Set
3. Only append posts whose `reddit_id` is NOT in the Set

### Fetch + Dedup + Append Script
Create as `reddit-scan.cjs` (temp file — delete after use):

```javascript
// reddit-scan.cjs — Run: node reddit-scan.cjs
// DELETE THIS FILE AFTER USE
const https = require('https');
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'reddit-research.csv');
const HEADER = 'date_found,reddit_id,subreddit,title,url,upvotes,comments,ratio,post_date,flair,relevance_score,content_angle,status,notes,used_for';

const URLS = [
  'https://www.reddit.com/r/ClaudeAI+ChatGPT+generativeAI+ArtificialIntelligence/top.json?t=week&limit=50',
  // Uncomment for full scan:
  // 'https://www.reddit.com/r/entrepreneur+SideProject+Passive_Income+ContentCreators/top.json?t=week&limit=25',
  // 'https://www.reddit.com/r/StableDiffusion+Midjourney+LocalLLaMA/top.json?t=week&limit=25',
];

function fetchReddit(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'RedditResearchBot/1.0' }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse failed: ' + data.substring(0, 200))); }
      });
    }).on('error', reject);
  });
}

function escapeCSV(str) {
  if (!str) return '';
  str = String(str).replace(/\r?\n/g, ' ').replace(/"/g, '""');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str + '"';
  }
  return str;
}

async function run() {
  // Load existing IDs for dedup
  let existingIds = new Set();
  if (fs.existsSync(CSV_PATH)) {
    const lines = fs.readFileSync(CSV_PATH, 'utf8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^\d{4}-\d{2}-\d{2},([^,]+),/);
      if (match) existingIds.add(match[1]);
    });
    console.log('Existing CSV: ' + existingIds.size + ' posts tracked');
  } else {
    fs.writeFileSync(CSV_PATH, HEADER + '\n');
    console.log('Created new CSV: ' + CSV_PATH);
  }

  const today = new Date().toISOString().split('T')[0];
  let newPosts = [];

  for (const url of URLS) {
    console.log('\nFetching: ' + url.match(/r\/([^/]+)/)[1] + '...');
    const data = await fetchReddit(url);
    const posts = data.data.children.map(c => c.data);
    let added = 0;
    for (const p of posts) {
      if (existingIds.has(p.id)) continue;
      newPosts.push({
        date_found: today,
        reddit_id: p.id,
        subreddit: p.subreddit,
        title: p.title,
        url: 'https://reddit.com' + p.permalink,
        upvotes: p.score,
        comments: p.num_comments,
        ratio: p.upvote_ratio,
        post_date: new Date(p.created_utc * 1000).toISOString().split('T')[0],
        flair: p.link_flair_text || '',
        relevance_score: '',
        content_angle: '',
        status: 'New',
        notes: '',
        used_for: ''
      });
      added++;
    }
    console.log('  ' + posts.length + ' posts fetched, ' + added + ' new (after dedup)');
  }

  // Display new posts for Claude to score
  console.log('\n========================================');
  console.log('NEW POSTS TO SCORE (' + newPosts.length + ' total)');
  console.log('========================================');
  newPosts.sort((a, b) => b.upvotes - a.upvotes);
  newPosts.forEach((p, i) => {
    console.log('\n--- #' + (i + 1) + ' ---');
    console.log('[r/' + p.subreddit + '] ' + p.title);
    console.log('Upvotes: ' + p.upvotes + ' | Comments: ' + p.comments + ' | Ratio: ' + p.ratio);
    console.log('URL: ' + p.url);
    console.log('Date: ' + p.post_date + (p.flair ? ' | Flair: ' + p.flair : ''));
  });

  // Append unscored rows to CSV
  const csvLines = newPosts.map(p =>
    [p.date_found, p.reddit_id, escapeCSV(p.subreddit), escapeCSV(p.title),
     p.url, p.upvotes, p.comments, p.ratio, p.post_date, escapeCSV(p.flair),
     p.relevance_score, p.content_angle, p.status, p.notes, p.used_for
    ].join(',')
  );

  if (csvLines.length > 0) {
    fs.appendFileSync(CSV_PATH, csvLines.join('\n') + '\n');
    console.log('\n✅ Appended ' + csvLines.length + ' new rows to reddit-research.csv');
  } else {
    console.log('\nNo new posts to add (all already tracked).');
  }
}

run().catch(e => console.error('Error:', e.message));
```

**Two-step workflow:**
1. Run the script → fetches, dedupes, appends raw rows, displays posts
2. Claude reads the output, scores each post (1-10), assigns content angle, updates CSV rows via Edit tool

---

## RELEVANCE SCORING (1-10)

Only posts scoring **7+** make the briefing. Be ruthless — Jonnys audience is non-technical beginners building AI influencers.

### Score 9-10: GOLD — Create content immediately
- Someone making money with AI content/influencers (case study with numbers)
- Viral post proving market demand for AI influencers (1000+ upvotes)
- Major tool launch that Jonny teaches, with positive community reaction
- Post about AI replacing traditional content creation (proves the thesis)

### Score 7-8: STRONG — Plan content this week
- Highly upvoted post about AI tools Jonnys audience uses
- Community pain point that Jonnys products solve
- Trending discussion about faceless content / AI personas
- New beginner-friendly AI tool with strong positive reception

### Score 5-6: MONITOR — Save for later
- General AI news with moderate engagement
- Technical discussions that could be simplified for beginners
- Tool comparisons without clear winner

### Score 1-4: SKIP
- Enterprise/B2B discussions
- Deep technical/coding posts
- Low-engagement posts (under 50 upvotes on Tier 1 subs)
- Memes with no substance

### Reddit-Specific Multipliers (add to base score)
| Multiplier | Signal |
|---|---|
| +2 | OP shares specific revenue/income numbers |
| +1 | Post has 500+ upvotes |
| +1 | Post has 100+ comments (heated = content gold) |
| +1 | Sentiment is "frustrated with current solution" (pain point) |
| +1 | Post includes before/after or results |
| +1 | Tier 1 subreddit (inherent) |

### Reddit-Specific Penalties (subtract from base score)
| Penalty | Signal |
|---|---|
| -2 | Meme or joke with no substance |
| -1 | Pricing/billing complaint with no broader angle |
| -1 | Question with no interesting answers yet |
| -1 | Enterprise/developer focused |
| -1 | Requires coding to be relevant |

### Scoring Examples

**"I made $4K/month with AI-generated Instagram content" (r/entrepreneur)**
Score: 10/10 — Perfect case study. +2 income numbers, +1 results, +1 Tier 2 entrepreneurship.
Angle: Case Study Breakdown → Case Study post

**"Claude Opus 4 is insane for writing" (r/ClaudeAI, 800 upvotes)**
Score: 7/10 — Tool Jonny uses, high engagement. +1 for 500+ upvotes, +1 Tier 1.
Angle: Behind The Scenes → Personal post

**"OpenAI raises API prices again" (r/ChatGPT, 2000 upvotes)**
Score: 5/10 — High engagement but enterprise/developer focused. -1 technical, -1 B2B.
Angle: Skip or Skool discussion only.

**"AI art is stealing from real artists" (r/ArtificialIntelligence, 300 comments, 0.65 ratio)**
Score: 8/10 — Controversial (low ratio), high comments = manifesto gold. +1 controversy, +1 Tier 1.
Angle: Misconception Buster → Manifesto post

**"New meme: AI slop everywhere" (r/ChatGPT)**
Score: 2/10 — Meme, no substance. -2 meme penalty.
Angle: Skip.

---

## CONTENT ANGLE MAPPING

For each 7+ post, assign one angle:

| Angle | Reddit Signal | Maps To (jonny-writer) |
|---|---|---|
| This Changes Everything | Major tool launch, 500+ upvotes, positive sentiment | Reveal |
| Case Study Breakdown | OP shares income/results with AI | Case Study |
| Misconception Buster | Heated debate, low upvote ratio (0.60-0.85), 100+ comments | Manifesto |
| Tutorial Drop | Popular "how do I" post or tool walkthrough | Tutorial |
| Future Pacing | Trend post about where AI is going | Manifesto |
| Behind The Scenes | Tool or workflow Jonny already uses | Personal |

---

## SESSION TYPES

### Quick Scan (5 minutes)
**Goal:** Check whats trending today, find any gold, update CSV.

**Steps:**
1. Fetch Tier 1 `top.json?t=day&limit=25`
2. Parse and display top 10 by upvotes
3. Score each by title + score + subreddit
4. Append 7+ to CSV with angle
5. Output brief

**Output Template:**
```
## Reddit Quick Scan — [Date]

### Top Story (Score: X/10)
**[Title]** — r/[subreddit] (X upvotes, X comments)
URL: [link]
Angle: [Type] — [1 sentence spin for Jonny]
Use for: [FB / Email / Skool]

### Other Notable (Score 7-8)
- [Title] — r/[sub] (X ups) — [Angle]
- [Title] — r/[sub] (X ups) — [Angle]

### CSV Updated
Added X new posts. Total: Y rows.
```

---

### Deep Dive (20 minutes)
**Goal:** Full scan across all tiers, score everything, build weekly content calendar.

**Steps:**
1. Fetch Tier 1: `top.json?t=week&limit=50`
2. Fetch Tier 2: `top.json?t=week&limit=25`
3. Fetch Tier 3: `top.json?t=week&limit=25`
4. Also fetch Tier 1 `hot.json` (catches rising posts)
5. Dedup against existing CSV
6. Score ALL new posts
7. For any 8+ posts, read comments via Firecrawl for sentiment
8. Append all to CSV with scores and angles
9. Output full briefing with content calendar

**Output Template:**
```
## Reddit Deep Dive — [Date]

### GOLD Posts (Score 9-10)
**1. [Title]** — r/[sub]
Upvotes: X | Comments: X | Ratio: X
URL: [link]
Key insight: [What makes this valuable]
Angle: [Type] — [Spin]
Post type: [jonny-writer archetype]

### STRONG Posts (Score 7-8)
**1. [Title]** — r/[sub] (X ups)
Angle: [Type] — [Spin]
...

### Sentiment Highlights
- People love: [pattern across posts]
- People complain about: [pattern = content opportunity]
- Common questions: [FAQ = tutorial opportunities]

### Weekly Content Calendar (from Reddit)
- Monday FB post: [Story, angle, archetype]
- Wednesday FB post: [Story, angle, archetype]
- Friday FB post: [Story, angle, archetype]
- Email: [Best 8+ story] — Subject: [draft]
- Skool discussion: [Question from a 5-6 score post]

### CSV Updated
Added X new posts. Total: Y rows. X scored 7+.
```

---

### Controversy Hunt (15 minutes)
**Goal:** Find heated discussions for Manifesto-style posts.

**Steps:**
1. Fetch Tier 1: `top.json?t=week&limit=50`
2. Sort by `num_comments` (not just upvotes)
3. Look for `upvote_ratio` between 0.60-0.85 (controversial = split opinions)
4. Read top comments via Firecrawl for the most debated posts
5. Find the "wrong" opinion Jonny can counter
6. Output controversy brief

**Output Template:**
```
## Reddit Controversy Hunt — [Date]

### Best Controversy
**[Title]** — r/[sub]
Upvotes: X | Comments: X | Ratio: X (contested!)
The wrong opinion: "[Paraphrased from popular comment]"
Jonnys counter: [How he proves them wrong with his results]
Hook: "[Draft hook for FB post]"
Archetype: Manifesto

### Other Controversies
1. [Title] (X comments, ratio X) — [The debate]
2. [Title] (X comments, ratio X) — [The debate]

### CSV Updated
Added X controversy posts. Total: Y rows.
```

---

## INTEGRATION WITH OTHER SKILLS

### → jonny-writer-skill.md (Facebook Posts)
After finding a Reddit story with angle:
1. **Angle → Archetype mapping** (see table above)
2. Reddit post becomes the personal anchor — "I saw a post blow up on Reddit..." or "Someone asked this question and it got 500 upvotes..."
3. **Never link to Reddit in the FB post** (engagement killer — keep them on FB)
4. Reddit sentiment = the "objection" for the P.S.

### → kit-broadcast-skill.md (Email Broadcasts)
For 8+ scored posts:
1. Story becomes email hook: "Something wild is happening on Reddit right now..."
2. Bridge to workshop replay or Skool community
3. Subject formula: `A Reddit thread changed how I think about [topic]`
4. Follow kit-broadcast rules (HTML br tags, draft only, no apostrophes)

### → skool-poster-skill.md (Community Posts)
Score 5-7 posts (not strong enough for FB) are perfect for Skool:
- "What do you guys think about this?" discussion format
- Community questions from Reddit = engagement prompts
- Lower threshold — Skool is for community building, not sales

### → ai-news-researcher-skill.md (Cross-Reference)
Reddit stories often surface BEFORE news articles:
- When a Reddit post trends, search Perplexity for the same topic
- Higher credibility when backed by multiple sources
- Reddit = early signal, news = confirmation

### → iv4-skill.md (Post Images)
When a Reddit story inspires a FB post:
- Post archetype determines image style
- Story context suggests visual concept
- Generate scroll-stopping image with iv4-skill

---

## ADVANCED TECHNIQUES

### Sentiment Mining (The Gold in Comments)
Reddit comments often contain the REAL content gold:
- "I tried X and it didnt work because..." = **Tutorial opportunity**
- "This is BS because..." = **Misconception Buster angle**
- "I made $X doing this" = **Case Study lead**
- "Why doesnt anyone talk about..." = **Untapped topic**

When a post scores 8+, always read the top 10 comments via Firecrawl.

### The Upvote/Comment Ratio
| Pattern | Meaning | Best Angle |
|---|---|---|
| High upvotes, low comments | Agreement (people nod and scroll) | Future Pacing |
| Low upvotes, high comments | Controversy (people fight) | Manifesto / Misconception Buster |
| High both | Viral — everyone cares | Any angle (pick the best) |
| Low both | Not interesting | Skip |

### Cross-Subreddit Trend Detection
When the SAME topic appears in 3+ subreddits in the same week, its a wave:
- Flag as Manifesto opportunity
- Hook: "Everywhere I look, people are talking about [X]..."
- More powerful than any single post

### The "Regular Person" Filter
Jonnys audience is non-technical beginners. When scanning Reddit:
- **Prioritize** posts written by regular people (simple language, no code blocks, dollar amounts not technical metrics)
- **Deprioritize** developer/power-user posts (API calls, model fine-tuning, code snippets)
- The signal: if your mom wouldnt understand the post title, its probably too technical

### Timing Strategy
| Sort | Best For | Session Type |
|---|---|---|
| `top?t=day` | Catch trending stories same-day | Quick Scan |
| `top?t=week` | What dominated the week | Deep Dive |
| `hot` | Whats rising RIGHT NOW | Time-sensitive content |
| `new` | Tool launches (catch before they trend) | Niche research only |
| `top?t=month` | Evergreen patterns | Monthly review |

### Controversy Indicators
Posts with these patterns are manifesto gold:
- `upvote_ratio` between 0.60-0.85 (community is split)
- 100+ comments with under 500 upvotes (people arguing, not agreeing)
- Flair: "Discussion" or "Debate" or "Unpopular Opinion"
- Title starts with "Am I the only one..." or "Unpopular opinion:" or "Hot take:"

---

## GOTCHAS & LESSONS LEARNED

1. **WebFetch is BLOCKED for Reddit** — MUST use Bash `curl` with User-Agent header. This is the #1 gotcha. WebFetch returns "unable to fetch" for all Reddit domains.
2. **User-Agent is REQUIRED** — Without it, Reddit returns 403 or 429. Use `User-Agent: RedditResearchBot/1.0` or similar.
3. **Combined subreddits have size bias** — `r/ChatGPT+ClaudeAI` will show mostly ChatGPT posts (5M members vs 200K). For accurate per-sub results, fetch separately.
4. **Use .cjs extension for temp scripts** — Project has `"type": "module"` in package.json. CommonJS scripts must use `.cjs` (same as kit-broadcast-skill).
5. **Delete temp scripts after use** — Same pattern as all other skills. `reddit-scan.cjs` is a temp file.
6. **CSV escaping is critical** — Post titles often contain commas, quotes, colons, and special characters. ALWAYS use the `escapeCSV()` function.
7. **Score at scan time is a snapshot** — A post at 500 upvotes today might be at 5000 tomorrow. For time-sensitive content, re-check hot posts.
8. **Dont chase low-engagement posts** — On Tier 1 subs (r/ChatGPT = 5M members), posts under 100 upvotes are noise. On smaller Tier 2/3 subs, threshold is lower (~20+).
9. **selftext may be empty** — Link posts have empty selftext. The title alone must be enough to score. Check `is_self` if you need post body.
10. **Reddit pagination** — The `after` field enables fetching more than 100 posts. But 25-50 per group is usually enough.
11. **Rate limiting** — Reddit allows ~60 requests/min unauthenticated. With 3-5 fetches per session, never an issue. But dont loop 50 individual subreddits.
12. **created_utc is Unix timestamp** — Multiply by 1000 for JavaScript Date. Convert to YYYY-MM-DD for CSV.

---

## MAINTENANCE

### Weekly Review
1. Open `reddit-research.csv` and filter by `status=New`
2. Update status: `New` → `Saved` (keep for later) or `Used` (turned into content) or `Skip` (not relevant)
3. Fill in `used_for` column when content was created (FB / Email / Skool / Ad)
4. Review which subreddits produced the most 7+ scores — weight them higher
5. Note any new relevant subreddits discovered

### Monthly Review
1. Archive rows older than 60 days with status `Skip` or `New` (stale)
2. Analyze: which content angles performed best?
3. Analyze: which subreddits consistently produce gold?
4. Update Tier assignments if needed (promote/demote subreddits)

### CSV Health Check Commands
```bash
# Count total rows
wc -l reddit-research.csv

# Count by status
node -e "const fs=require('fs');const d=fs.readFileSync('reddit-research.csv','utf8').split('\n');const s={};d.slice(1).filter(l=>l.trim()).forEach(l=>{const c=l.split(',');if(c[12])s[c[12]]=(s[c[12]]||0)+1});console.log(s)"

# Show all 7+ scored posts
node -e "const fs=require('fs');const d=fs.readFileSync('reddit-research.csv','utf8').split('\n');d.slice(1).filter(l=>l.trim()).forEach(l=>{const c=l.split(',');if(parseInt(c[10])>=7)console.log(c[10]+' | r/'+c[2]+' | '+c[3].substring(0,60))})"

# Show unused high-value posts
node -e "const fs=require('fs');const d=fs.readFileSync('reddit-research.csv','utf8').split('\n');d.slice(1).filter(l=>l.trim()).forEach(l=>{const c=l.split(',');if(parseInt(c[10])>=7&&c[12]==='New')console.log(c[10]+' | r/'+c[2]+' | '+c[3].substring(0,60))})"
```

---

## EXAMPLE PROMPTS

```
"Quick scan Reddit for todays top AI stories."

"Deep dive Reddit — I need content for this weeks FB posts."

"Hunt for controversies on Reddit about AI influencers."

"Update my Reddit CSV — scan all tiers and add new posts."

"Whats trending on r/ClaudeAI this week? Score and save to CSV."

"Find Reddit posts where someone is making money with AI — case studies only."

"Check Reddit sentiment on [specific tool] — what do people love and hate?"

"Show me my Reddit CSV — how many posts scored 7+? Which havent been used yet?"

"Scan Reddit for anything about AI clones or digital humans this week."
```
