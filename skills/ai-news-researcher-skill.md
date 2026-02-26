# AI News Researcher Skill

Find trending AI news relevant to Jonnys AI influencer business. Turns raw news into content angles for Facebook posts, Kit email broadcasts, and Skool community content.

---

## PURPOSE

Jonny teaches people how to create AI influencers to build audiences and make money. His products:
- **AI Creator Workshop** — automated webinar at aicreatorworkshop.com
- **AI Influencer Academy** — Skool community at $9/mo

This skill finds news he can spin into content that drives workshop registrations and Skool memberships. Not just "any AI news" — stories his specific audience cares about.

---

## KEY TOPICS (Priority Tiers)

### Tier 1 — CORE BUSINESS (always search for these)
1. AI influencers / virtual influencers / AI personas / digital humans
2. AI image generation (Flux, Midjourney, DALL-E, Stable Diffusion, Ideogram)
3. AI video generation (Sora, Runway, Kling, Veo, Pika, HeyGen, Synthesia)
4. AI voice / lip-sync / talking head tools (ElevenLabs, D-ID, Hedra)

### Tier 2 — ADJACENT (search weekly)
5. Creator economy + AI intersection
6. AI content automation / AI agents for creators
7. Skool community trends / community building
8. No-code AI tools for non-technical creators
9. Faceless content / anonymous brand building

### Tier 3 — CONTEXT (monitor, dont chase)
10. AI regulations impacting content creation
11. Major AI company launches (OpenAI, Anthropic, Google, Meta)
12. AI ethics debates around synthetic media
13. Creator burnout trends

---

## RESEARCH SOURCES & COMMANDS

### Source 1: Perplexity Sonar Pro (AI-powered search)
**Best for:** Breaking news, trend synthesis, specific deep-dives
**Strength:** Returns synthesized answer + citations from fresh sources
```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js search \
  --model "perplexity/sonar-pro" \
  --query "YOUR QUERY HERE"
```

### Source 2: ScrapingDog Google Search (structured results)
**Best for:** Finding specific articles and pages
**Strength:** Returns organic results with links and snippets
**Note:** Use `scrapingdog/google_search` (not google_news — that model doesnt exist). If the query passes as "undefined", use Perplexity instead — its more reliable.
```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js search \
  --model "scrapingdog/google_search" \
  --query "YOUR QUERY HERE"
```

### Source 3: ScrapingDog YouTube Search (tutorial trends)
**Best for:** What creators are making videos about, whats getting traction
**Strength:** Shows real audience demand by view counts
```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js search \
  --model "scrapingdog/youtube_search" \
  --query "YOUR QUERY HERE"
```

### Source 4: Firecrawl Scrape (full article extraction)
**Best for:** Deep-reading a specific article for details
**Strength:** Clean markdown output, gets full text
```bash
node ~/.claude/skills/skillboss/scripts/api-hub.js scrape \
  --model "firecrawl/scrape" \
  --url "https://example.com/article"
```

### Source 5: RSS Feeds (via WebFetch tool)
**Best for:** Established news with editorial quality
**Feeds to check:**
- TechCrunch AI: `https://techcrunch.com/category/artificial-intelligence/feed/`
- Ars Technica AI: `https://arstechnica.com/ai/feed/`
- Wired AI: `https://www.wired.com/feed/tag/ai/rss`

### Source 6: Reddit (via WebFetch or Firecrawl)
**Best for:** Tool launches, community sentiment, what power users think
**Subreddits:**
- r/StableDiffusion: `https://reddit.com/r/StableDiffusion/`
- r/AIArt: `https://reddit.com/r/AIArt/`
- r/Midjourney: `https://reddit.com/r/Midjourney/`
- r/generativeAI: `https://reddit.com/r/generativeAI/`

### Source 7: WebSearch (built into Claude)
**Best for:** Quick fact-checking, finding specific stories
**Strength:** No SkillBoss credits needed, fast

---

## SEARCH QUERIES (Copy-Paste Ready)

### AI Influencers (Tier 1)
```
AI influencer virtual influencer latest news
digital human AI persona brand partnership
synthetic influencer making money
virtual influencer campaign results
```

### AI Image Generation (Tier 1)
```
Flux Midjourney DALL-E AI image generation latest
AI image generation new model launch
realistic AI photo generation tools
AI art tool update features
```

### AI Video Generation (Tier 1)
```
Sora Runway Kling AI video generation latest
AI video tool new features update
text to video AI creator tools
AI video generation comparison
```

### AI Voice / Talking Head (Tier 1)
```
ElevenLabs voice cloning latest news
AI talking head avatar tools
lip sync AI video creator
AI voice generation tools update
```

### Creator Economy + AI (Tier 2)
```
creator economy AI tools trends
faceless content creation AI
AI automation for content creators
making money with AI content creation
```

### Skool / Community (Tier 2)
```
Skool community growth strategies
online community building AI
digital product community revenue
```

---

## RELEVANCE SCORING (1-10)

Only items scoring **7+** make the briefing. Be ruthless.

### Score 9-10: GOLD — Post/Email Immediately
- Directly about AI influencers or virtual influencers
- Major tool launch creators can use TODAY
- Viral case study: someone making money with AI content
- Brand partnership with an AI influencer (proves market demand)

### Score 7-8: STRONG — Plan Content This Week
- Major update to a tool Jonny teaches (Midjourney, Runway, etc.)
- Creator economy trend that AI solves (burnout, consistency, faceless)
- Skool-related growth story
- New no-code AI tool for beginners

### Score 5-6: MONITOR — Maybe Later
- General AI news from big companies
- Regulations that might impact creators eventually
- Tool launches for technical users (not beginner-friendly yet)

### Score 1-4: IGNORE
- Enterprise/B2B AI (not creator-focused)
- AI coding tools (unless for content automation)
- Academic papers with no practical application
- AI doom/hype without actionable angle

### Multipliers (add +1 to +2)
- Story includes a PERSON making MONEY (+2)
- Tool is NO-CODE / beginner-friendly (+1)
- Story includes NUMBERS (revenue, growth, users) (+1)
- Controversial / hot take potential (+1)
- Visual / screenshot-worthy for FB post (+1)

### Penalties (subtract -1 to -2)
- Requires coding / technical skills (-1)
- Enterprise / B2B focus only (-1)
- Theoretical / academic / no practical use (-2)
- Doom-and-gloom with no solution (-1)

---

## SCORING EXAMPLES

### Example 1: "Meta Launches AI Avatar Creation Tool for Instagram Creators"
**Score: 9/10**
- Major company validates AI influencer space ✅
- Tool creators can use ✅
- Beginner-friendly (Meta = mass market) ✅
- Multiplier: +1 (big company validates market)
- **Angle:** Future Pacing — "Big tech is all-in on this. Get ahead now."
- **Use for:** FB post (Manifesto) + Email

### Example 2: "OpenAI Cuts API Pricing by 30%"
**Score: 5/10**
- Technical, not directly about AI influencers ⚠️
- Only affects people already using APIs (small segment) ❌
- Penalty: -1 (requires technical skills)
- **Angle:** Weak. Maybe "tools getting cheaper" but not compelling
- **Use for:** Skip or Skool discussion thread only

### Example 3: "24-Year-Old Makes $200K/Month Selling AI-Generated Art on Etsy"
**Score: 10/10**
- Perfect case study for Jonnys audience ✅✅✅
- Multipliers: +2 (person making money), +1 (numbers), +1 (visual)
- **Angle:** Case Study Breakdown — "Heres exactly what they did"
- **Use for:** FB post (Case Study) + Email + Workshop mention

### Example 4: "AI Researchers Develop New Transformer Architecture"
**Score: 2/10**
- Academic, no practical application ❌
- Penalty: -2 (theoretical)
- **Angle:** None. Skip entirely.

### Example 5: "Runway Adds Motion Brush Feature to Gen-3"
**Score: 8/10**
- Tool Jonny teaches, AI video = Tier 1 ✅
- Creators can use immediately ✅
- Multiplier: +1 (visual/screenshot-worthy)
- **Angle:** Tutorial Drop — "Heres how I use the new feature"
- **Use for:** FB post (Tutorial) or Community tutorial

---

## CONTENT ANGLE FRAMEWORK

For each 7+ story, pick the angle that fits:

### Angle 1: "This Changes Everything"
**When:** Major tool launch or new capability
**Hook:** "Most people dont know this exists yet..."
**Spin:** Frame as the next wave. Jonny teaches how to ride it.
**Maps to:** Reveal post archetype

### Angle 2: "Case Study Breakdown"
**When:** Someone made money with AI content
**Hook:** "This person made $X with a face that doesnt exist..."
**Spin:** Break down what they did. Bridge to how Jonny teaches the same system.
**Maps to:** Case Study post archetype

### Angle 3: "Misconception Buster"
**When:** Common objection or misunderstanding in the news
**Hook:** "Someone commented on my post yesterday..."
**Spin:** Use news as proof the misconception is wrong. Position Jonny as the guide.
**Maps to:** Manifesto post archetype

### Angle 4: "Tutorial Drop"
**When:** Tool gets new feature or becomes easier to use
**Hook:** "You can actually do this right now..."
**Spin:** Step-by-step breakdown. CTA to community for full training.
**Maps to:** Tutorial post archetype

### Angle 5: "Future Pacing"
**When:** Trend accelerating or major company validates the space
**Hook:** "Watch as [big thing] becomes normal..."
**Spin:** Position AI influencers as inevitable. Get in early.
**Maps to:** Manifesto post archetype

### Angle 6: "Behind The Scenes"
**When:** Tool or technique Jonny already uses
**Hook:** "So Im using this tool for $X/month..."
**Spin:** Show what it does, casually mention results.
**Maps to:** Personal post archetype

---

## SESSION TYPES

### Quick Scan (5 minutes)
**Goal:** Find todays top story for a FB post or email

**Steps:**
1. Perplexity search: `AI influencer OR virtual influencer news today`
2. Perplexity search: `AI video generation OR AI image generation latest`
3. Score top 5 results
4. Pick the best 9-10 scorer (or best 7-8 if none)
5. Assign content angle
6. Output brief

**Output:**
```
## Todays Top Story

**[Headline]**
Source: [link]
Score: X/10
Why it matters: [1 sentence]
Angle: [Type] — [1 sentence spin]
Use for: [FB post type / Email / Both]
```

### Deep Dive (20 minutes)
**Goal:** Weekly content calendar — 3 FB posts + 1 email

**Steps:**
1. Run Perplexity for EACH Tier 1 topic (4 searches)
2. Run Google News for top 2 topics
3. Fetch 1-2 RSS feeds via WebFetch
4. Score everything, filter to 7+
5. Group by topic
6. Assign angles
7. Look for PATTERNS across stories (manifesto angle?)
8. Output full briefing

**Output:**
```
## AI News Briefing — [Date]

### 🔥 TOP STORY (Score: 9-10)
**[Headline]**
Source: [Link]
Why it matters: [1 sentence]
Content angle: [Type] — [Spin]
Suggested FB post type: [Case Study / Reveal / Manifesto / Tutorial / Personal]
Email subject line: 🟢 [Subject if email-worthy]

---

### 📰 STRONG STORIES (Score: 7-8)

**1. [Headline]**
Source: [Link]
Angle: [Type] — [Spin]
Use for: [FB / Email / Skool]

**2. [Headline]**
...

**3. [Headline]**
...

---

### 📊 PATTERNS & THEMES
[2-3 sentences on whats trending across stories]
[Potential manifesto angle if a theme emerges]

---

### 🚫 MONITORED (Score 5-6, Not Ready Yet)
- [Story] — [Why not ready]
- [Story] — [Why not ready]

---

### 📅 CONTENT CALENDAR

**This Week:**
- Monday: FB post — [Story #X, Angle type]
- Wednesday: FB post — [Story #X, Angle type]
- Friday: FB post — [Story #X, Angle type]
- Email: [Story #X] — Subject: 🟢 [subject line]

**Skool Discussion Prompts:**
- [Question from a story to post in community]
```

### Niche Deep Dive (30+ minutes)
**Goal:** Research a specific tool or trend for workshop/community content

**Steps:**
1. Define the topic (e.g., "Runway Gen-3")
2. Perplexity with 3-5 specific queries about the topic
3. Google News for the tool/topic
4. Scrape top 3 articles with Firecrawl (full text)
5. YouTube search for tutorial volume and titles
6. Reddit check for user sentiment and pain points
7. Synthesize findings

**Output:**
```
## Niche Brief: [Topic]

### Summary
[What is it, whats new, why it matters]

### Key Features / Updates
- [Feature 1]
- [Feature 2]
...

### User Sentiment (Reddit)
- People love: [...]
- People complain about: [...]
- Common questions: [...]

### Tutorial Landscape (YouTube)
- [X] videos in last month
- Most popular angles: [...]
- Gap: [What nobody is covering yet]

### Content Angles for Jonny
1. [Angle + hook]
2. [Angle + hook]
3. [Angle + hook]

### Workshop Update Ideas
- [If worth adding to workshop content]

### Objections to Address
- [Common pushback and how to counter]
```

---

## INTEGRATION WITH OTHER SKILLS

### → jonny-writer-skill.md (Facebook Posts)
After finding a story with angle:
1. **Angle → Archetype mapping:**
   - "This Changes Everything" → Reveal
   - "Case Study Breakdown" → Case Study
   - "Misconception Buster" → Manifesto
   - "Tutorial Drop" → Tutorial
   - "Future Pacing" → Manifesto
   - "Behind The Scenes" → Personal
2. Use jonny-writer-skill rules to write the post
3. News story = the ANCHOR, Jonnys experience = the VALUE

### → kit-broadcast-skill.md (Email Broadcasts)
For stories scoring 8+:
1. Story becomes the email hook
2. Bridge to workshop replay or Skool community
3. Subject: `🟢 [Curiosity gap from the story]`
4. Follow kit-broadcast-skill rules (HTML br tags, draft only, no apostrophes)

### → iv4-skill.md (Post Images)
For FB posts needing a scroll-stopping image:
1. Post archetype determines image style
2. News story suggests visual concept
3. Use iv4-skill to generate the image

---

## ADVANCED TECHNIQUES

### Trend Synthesis (Manifesto Hunting)
When running Deep Dive, look for 3+ stories pointing to the SAME theme:
- 3+ stories about AI regulation → Manifesto: "Heres what this means for creators"
- 3+ stories about new video tools → Manifesto: "Were entering the golden age of faceless content"
- 3+ case studies of people quitting jobs → Manifesto: "The 9-5 is over. Heres the new path."

Synthesis > individual stories for manifesto posts.

### Controversy Mining
For high-engagement posts, find stories where:
1. Theres a clear "wrong" opinion in the comments/article
2. Jonny has proof theyre wrong (his results, his communitys results)
3. The misconception is COMMON (lots of people believe it)

Example: "AI influencers are unethical" → Jonnys counter: "CEOs dont film their own content either."

### The "2 Weeks Ahead" Strategy
- Most creators react to news the day it drops (crowded)
- Jonny can react immediately OR wait 2 weeks and do "Heres what everyone missed"
- Especially powerful for tool launches (initial hype dies, then show what ACTUALLY works)

### Cross-Pollination with Community
- Post interesting findings (score 5-7) in Skool for discussion
- Community feedback reveals what audiences actually care about
- Their questions = future content angles
- Their wins = future case studies

---

## GOTCHAS & LESSONS LEARNED

1. **Not all tool launches matter** — Only matters if beginners can use it. If it requires coding, skip it.
2. **Enterprise AI is a trap** — 90% of AI news is B2B. 0% relevant to Jonnys audience. Filter aggressively.
3. **Reddit is gold for sentiment** — What people complain about = content angles. "X is too hard" → "Heres how I make X easy."
4. **YouTube trends LAG actual trends** — By the time theres 50 tutorials, the trend is mainstream. Catch it at 5-10 tutorials.
5. **Numbers = credibility** — Stories with revenue numbers score higher AND perform better. Always prioritize case studies with dollar amounts.
6. **Controversy > news** — A controversial opinion about AI influencers outperforms a tool launch announcement every time.
7. **Perplexity > Google for synthesis** — When you need "whats the big deal about X", Perplexity gives the answer. Google makes you piece it together.
8. **RSS feeds are slow but reliable** — TechCrunch might be 6 hours behind X, but the quality is way higher.
9. **Dont force it** — If nothing scores 7+, dont lower standards. Wait for tomorrow. Consistency > mediocre content.
10. **The "so what?" test** — Every story must answer: "So what does this mean for someone trying to build an AI influencer business?" If you cant answer that, its not relevant.
11. **Save winning angles** — When a post based on a news story performs well, note the angle and source. Pattern = repeatable gold.
12. **ScrapingDog google_search may pass "undefined" as query** — Known bug. If results come back about the word "undefined", use Perplexity sonar-pro instead. Perplexity is the most reliable source anyway.
13. **Perplexity is the #1 source** — Tested and confirmed working. Returns synthesized answer + citations + fresh results. Start every session with Perplexity.
14. **WebSearch (built into Claude) costs nothing** — Use it for quick fact-checks and when you dont want to burn SkillBoss credits.

---

## MAINTENANCE

### Weekly Review
- Which angles got the most engagement?
- Any sources consistently finding gold? (Weight them higher)
- Any sources consistently irrelevant? (Drop from rotation)
- New tools or sources emerging? (Add to rotation)

### Source Performance Log
```
[Date] | Source | Story | Score | Performance
---
YYYY-MM-DD | Perplexity | [Headline] | 9 | FB: X comments, Email: X% open
YYYY-MM-DD | Google News | [Headline] | 7 | Skipped (or posted, results)
```

---

## EXAMPLE PROMPTS

```
"Run a quick scan for todays AI influencer news."

"Deep dive for this week — I need content for 3 FB posts and 1 email."

"Niche research on Runway Gen-3 — whats new and how should I teach it?"

"Find me a controversy to write about — something people are getting wrong about AI."

"Whats trending on Reddit about AI image generation this week?"
```
