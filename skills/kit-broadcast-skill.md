# Kit Broadcast Skill

Write and send email broadcasts to the entire Kit (ConvertKit) subscriber list. This skill covers the full workflow: crafting the email in Jonny's voice, creating the broadcast via API, and sending it.

---

## ACCOUNT DETAILS

- **Platform:** Kit (formerly ConvertKit)
- **API version:** v4
- **Base URL:** `https://api.kit.com/v4`
- **Auth header:** `X-Kit-Api-Key` (value stored in Vercel env as `CONVERTKIT_API_KEY`)
- **Sender:** jonny@tubeempire.co
- **Email template:** "Text only" (ID: 4788097)
- **Publication ID:** 19442309

### How to get the API key
The key lives in Vercel environment variables. Pull it with:
```bash
npx vercel env pull .env.vercel
```
Then read `CONVERTKIT_API_KEY` from `.env.vercel`.

---

## EMAIL WRITING RULES (Jonny's Email Voice)

Jonny's email voice is slightly different from his Facebook voice — shorter, more direct, more like a quick text from a friend.

### Core Principles
1. **Open with first name** — Always `Hey {{ subscriber.first_name }},`
2. **Hook in line 1** — First real sentence should make them lean in
3. **Short paragraphs** — 1-3 sentences max per paragraph
4. **No fancy formatting** — No bold, no headers, no bullet hell. Plain text energy
5. **Conversational** — Write like texting a friend, not writing a newsletter
6. **One big idea per email** — Don't try to cover everything
7. **Strategic P.S.** — Always include a P.S. with urgency or a secondary hook
8. **No apostrophes in contractions** — Write `dont`, `youve`, `isnt`, `thats` (Jonny's quirk, also avoids encoding issues in API calls)
9. **Use hyphen-minus (-) not em dash (—)** — Never use `—` (em dash). Always use `-` (regular dash/hyphen). Jonny uses `-` naturally. This applies to subject lines, body copy, everywhere.

### Structure Template
```
Hey {{ subscriber.first_name }},

[1-2 sentence hook — something wild, unexpected, or curiosity-driven]

[3-5 short paragraphs telling the story / making the point]

[CTA block — clear link with >> arrow prefix]

[1-2 closing paragraphs — social proof or push]

Jonny

P.S. [Urgency, secondary hook, or fear of missing out]
```

### CTA Formatting
In the plain-text version shown to user for approval:
```
>> Watch the AI Creator Workshop replay
https://www.aicreatorworkshop.com

>> Join AI Influencer Academy ($9/mo)
https://www.aicreatorworkshop.com/go
```

In the HTML content sent to Kit API:
```html
>> <a href="https://www.aicreatorworkshop.com">Watch the AI Creator Workshop replay</a>

>> <a href="https://www.aicreatorworkshop.com/go">Join AI Influencer Academy ($9/mo)</a>
```

### Subject Line Rules
1. **Always start with 🟢** — Every subject starts with the green circle emoji so subscribers recognize its from Jonny
2. **Lowercase energy** — Not "HOW TO MAKE MONEY" but "How a fake person made $58K/mo"
3. **Curiosity gap** — Make them NEED to open it
4. **Under 60 characters** (after the emoji) — Short enough for mobile
5. **No clickbait promises** — Intriguing truths > fake hype
6. **Preview text complements** — Subject = hook, preview = payoff tease

### Subject Line Formulas That Work
```
🟢 How [unexpected thing] did [impressive result]
🟢 Someone [did unexpected thing] and [result]
🟢 This [thing] isnt what you think it is
🟢 I showed [X] people this and [reaction]
🟢 The [adjective] part about [topic]
🟢 You missed something (replay inside)
🟢 Sorry about that last email — heres the real one
```

### Content Rules
1. **NEVER name the case study people in emails** — Dont mention "Daniel Riley" or "Matt Stark" by name. Keep it mysterious ("someone built...", "the influencer behind it...", "a regular guy who..."). This makes people watch the workshop to find out who it is.
2. **Reference the workshop content loosely** — Tease what they'll learn without giving it all away
3. **Social proof from real community members is OK** — Use first names + quotes from Skool members

### Workshop Content (for email writing reference)
The workshop covers:
- **Case study:** Someone built a $58.5K/month Skool community (6,500+ paid members at $9/mo) in ~100 days using an AI influencer that isnt a real person
- **The reveal:** The "influencer" face is AI-generated. A regular guy who didnt want to be on camera created an AI persona instead
- **10 use cases:** Digital products, YouTube channels, clone yourself, client work, TikTok Shop, multiple brands, ads without actors, VSLs/webinars, courses, scale social media
- **Jonnys story:** Made $5M online, then disappeared (marriage, kids, couldnt stay on camera). AI influencers = the way out
- **The authenticity argument:** CEOs dont film content, they hire people. AI influencers are the same concept
- **Step by step:** How to create, animate, and automate your own AI influencer

### Key Links
- **Workshop replay:** https://www.aicreatorworkshop.com
- **Skool community ($9/mo):** https://www.aicreatorworkshop.com/go
- **Workshop confirmed page:** https://www.aicreatorworkshop.com/workshop/confirmed

---

## EMAIL ARCHETYPES

### 1. Replay / Rewatch Email
**When:** Nudge people who missed or didnt finish the workshop
**Angle:** Tease the most shocking moment from the workshop, link to replay
```
Subject: How an AI influencer built the fastest growing Skool community
Preview: And I showed you exactly how inside the workshop

Hey {{ subscriber.first_name }},

[Tease the case study or reveal without giving away names]
[Build curiosity — what happened, why it matters]
[Social proof — people who watched joined right after]

>> Watch the AI Creator Workshop replay
https://www.aicreatorworkshop.com

[Push to join if ready]

>> Join AI Influencer Academy ($9/mo)
https://www.aicreatorworkshop.com/go

Jonny

P.S. [Replay wont be up forever / urgency]
```

### 2. Value / Insight Email
**When:** Share a lesson, tip, or realization that leads back to the product
**Angle:** Teach something real, then bridge to the community
```
Subject: [Insight or contrarian take]
Preview: [Expansion of the insight]

Hey {{ subscriber.first_name }},

[Share the insight / story / lesson]
[Why it matters for them]
[Bridge to the community — this is what we teach inside]

>> Join AI Influencer Academy ($9/mo)
https://www.aicreatorworkshop.com/go

Jonny

P.S. [Reinforce the insight or add urgency]
```

### 3. Social Proof Email
**When:** Show that real people are getting results
**Angle:** Quote community members, show momentum
```
Subject: [Quote or result from a member]
Preview: [Expansion]

Hey {{ subscriber.first_name }},

[Share what members are doing / saying]
[Make it feel like theyre missing out]
[Low barrier — its just $9/mo]

>> Join AI Influencer Academy ($9/mo)
https://www.aicreatorworkshop.com/go

Jonny

P.S. [More social proof or urgency]
```

### 4. Urgency / Last Call Email
**When:** Final push before a deadline, price increase, or replay removal
**Angle:** Straight talk, no fluff, respect their intelligence
```
Subject: 🟢 Last call — [thing expiring]
Preview: [Consequence of not acting]

Hey {{ subscriber.first_name }},

[Short and direct — whats happening and when]
[Why they should care]
[Remove objections — its $9, cancel anytime]

>> [CTA]
https://link.com

Jonny

P.S. [Final push]
```

### 5. Oops / Correction Email
**When:** Previous email had a formatting issue, broken link, or mistake
**Angle:** Own it casually (very on-brand for Jonny), then deliver the real content. "Oops" emails actually get HIGHER open rates than normal emails — people are curious.
```
Subject: 🟢 Sorry about that last email — heres the real one
Preview: [Original email subject or hook]

Hey {{ subscriber.first_name }},

Apologies — that last email came through as [describe the issue casually].
My AI assistant had a formatting meltdown lol.

Heres what it was supposed to say:

[Full email content from the original — properly formatted this time]

Jonny

P.S. [Same P.S. as original or new one]
```
**Pro tip:** Oops emails get crazy open rates. If you ever mess up, lean into it — its actually an opportunity.

---

## PROVEN EMAIL (Reference Copy)

This email was sent to the entire list and references the workshop case study without naming names (keeping it mysterious so people watch):

```
Subject: How an AI influencer built the fastest growing Skool community
Preview: And I showed you exactly how inside the workshop

Hey {{ subscriber.first_name }},

I need to tell you something wild.

During the AI Creator Workshop, I showed a case study that made people lose their minds.

Someone built a Skool community with 6,500+ paying members at $9/mo. Thats $58,500 a month. In about 100 days.

Heres the crazy part — the influencer behind it all is not a real person.

The face is AI-generated. The videos are AI-generated. The entire brand was built from scratch using AI tools.

The real person behind it? Just a regular guy who didnt want to be on camera. So he created an AI influencer to be the face of his business instead.

And it worked. Better than anyone imagined.

People who watched the workshop couldnt believe what they were seeing. A bunch of them joined the community right after because they realized — this isnt some future thing. This is happening RIGHT NOW.

If you missed it (or want to watch it again), the replay is live for a limited time:

>> Watch the AI Creator Workshop replay
https://www.aicreatorworkshop.com

I walk you through the whole thing step by step — how to create your own AI influencer from scratch, make it talk and move, and use it to build an audience and income without ever showing your face.

And if youve already seen it and youre ready to get started — the community is just $9/mo. No contracts, cancel anytime.

>> Join AI Influencer Academy ($9/mo)
https://www.aicreatorworkshop.com/go

The people who joined after watching are already building their first AI influencers this week. Just saying.

Jonny

P.S. This replay wont be up forever. If youve been curious about AI influencers, this workshop will show you exactly why people are calling it the biggest opportunity in content creation right now.
```

**Broadcast ID:** 22853874
**Sent:** 2026-02-08T21:17:30Z
**To:** Entire list (all subscribers)

---

## API WORKFLOW (Step by Step)

### Step 1: Create a Broadcast Draft

```
POST https://api.kit.com/v4/broadcasts
Content-Type: application/json
X-Kit-Api-Key: {CONVERTKIT_API_KEY}

{
  "subject": "Your subject line here",
  "preview_text": "Preview text here",
  "content": "Full email body with {{ subscriber.first_name }} merge tag",
  "description": "Internal description for Kit dashboard",
  "public": false,
  "email_template": { "id": 4788097 },
  "subscriber_filter": []
}
```

**Response:** Returns broadcast object with `id`.

### Step 2: Update a Broadcast (if needed)

```
PUT https://api.kit.com/v4/broadcasts/{broadcast_id}
Content-Type: application/json
X-Kit-Api-Key: {CONVERTKIT_API_KEY}

{
  "subject": "Updated subject",
  "preview_text": "Updated preview",
  "content": "Updated email body"
}
```

### Step 3: Send the Broadcast

To send, update the broadcast with `public: true` and `send_at` set to now (or a future time):

```
PUT https://api.kit.com/v4/broadcasts/{broadcast_id}
Content-Type: application/json
X-Kit-Api-Key: {CONVERTKIT_API_KEY}

{
  "public": true,
  "send_at": "2026-02-08T21:00:00Z"
}
```

**IMPORTANT:** There is no separate `/send` endpoint. Sending is done by setting `public: true` + `send_at` on the existing broadcast via PUT.

### Subscriber Filters

**Entire list (all subscribers):**
```json
"subscriber_filter": []
```
Note: `all_subscribers` type causes a 422 error. Use empty array for entire list.

**By tag:**
```json
"subscriber_filter": [{ "all": [{ "type": "tag", "id": "15741990" }] }]
```

**Tag IDs:**
- `autowebby` = `15741990` (workshop registrants)
- `realism` = `15664991` (freebie opt-in)

---

## NODE.JS IMPLEMENTATION

Because the project uses `"type": "module"` in package.json, scripts must use `.cjs` extension for CommonJS require syntax. Always clean up temp scripts after use.

### Draft-Only Script Template

```javascript
// save as broadcast-draft.cjs (NOT .js — project is ESM)
const https = require('https');

const API_KEY = 'kit_XXXXX'; // from .env.vercel CONVERTKIT_API_KEY

// Build email as array of lines (empty string = paragraph break)
const emailLines = [
  'Hey {{ subscriber.first_name }},',
  '',
  'First line of email...',
  '',
  'Rest of email...',
  '',
  '>> <a href="https://www.aicreatorworkshop.com">Watch the replay</a>',
  '',
  'Jonny',
  '',
  'P.S. Your P.S. here.'
];

// CRITICAL: Convert to HTML — Kit strips plain \n
const htmlContent = emailLines.map(line => {
  if (line === '') return '<br>';
  return line;
}).join('<br>\n');

function kitRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.kit.com',
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Kit-Api-Key': API_KEY
      }
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: responseBody }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  // DRAFT ONLY — user sends manually from Kit dashboard
  console.log('Creating broadcast DRAFT (will NOT send)...');
  const createRes = await kitRequest('POST', '/v4/broadcasts', {
    subject: '\uD83D\uDFE2 Your subject here',
    preview_text: 'Your preview here',
    content: htmlContent,
    description: 'Internal note',
    public: false,
    email_template: { id: 4788097 },
    subscriber_filter: []  // empty = entire list
  });

  if (createRes.status !== 201 && createRes.status !== 200) {
    console.log('Failed:', createRes.body);
    return;
  }

  const broadcast = JSON.parse(createRes.body).broadcast;
  console.log('\n=== DRAFT SAVED ===');
  console.log('Broadcast ID:', broadcast.id);
  console.log('Subject:', broadcast.subject);
  console.log('Preview:', broadcast.preview_text);
  console.log('Public:', broadcast.public);
  console.log('\nGo to Kit dashboard to review and send manually.');
}

run().catch(e => console.error('Error:', e));
```

### Usage
```bash
node broadcast-draft.cjs
# Then go to Kit dashboard → Broadcasts → find the draft → review → send
```

---

## GOTCHAS & LESSONS LEARNED

### CRITICAL: HTML Formatting Required
Kit's "Text only" template **strips all newlines** from plain text content. Sending `\n` results in one giant wall of text with zero line breaks.

**ALWAYS send content as HTML with `<br>` tags.** Build email as array of lines, then convert:

```javascript
const emailLines = [
  'Hey {{ subscriber.first_name }},',
  '',
  'First paragraph here.',
  '',
  'Second paragraph here.',
];

// Convert: empty lines = double break (paragraph gap), text lines joined with <br>
const htmlContent = emailLines.map(line => {
  if (line === '') return '<br>';
  return line;
}).join('<br>\n');
```

This produces proper spacing. Plain `\n` does NOT work.

### CRITICAL: Draft Only — NEVER Auto-Send
**NEVER send broadcasts programmatically.** Always save as draft (`public: false`, no `send_at`). The user reviews in Kit dashboard and clicks send manually. This prevents formatting disasters going to the whole list.

### All Gotchas

1. **HTML `<br>` tags required** — Kit "Text only" template strips `\n`. Use `<br>` for line breaks, `<br><br>` for paragraph breaks. (See above)
2. **DRAFT ONLY** — Never set `public: true` or `send_at` via API. Save draft, user sends from Kit dashboard
3. **No apostrophes in email copy** — Use `dont`, `youve`, `isnt` instead of `don't`, `you've`, `isn't`. Avoids JSON/shell escaping nightmares
4. **Use .cjs extension** — Project has `"type": "module"` in package.json, so `.js` files are treated as ESM. Use `.cjs` for scripts with `require()`
5. **No separate send endpoint** — Kit v4 has NO `/broadcasts/{id}/send` endpoint. Sending is done via PUT with `public: true` + `send_at`
6. **Build email as array of lines** — Use `[...lines].join('<br>\n')` after converting empties to `<br>`. Do NOT use template literals (dollar signs like `$9/mo` break them)
7. **Subscriber filter for entire list** — Use `"subscriber_filter": []` (empty array). The `all_subscribers` type causes a 422 error
8. **Always clean up temp scripts** — Delete `.cjs` files after running them
9. **Merge tags** — Use `{{ subscriber.first_name }}` (with spaces inside braces) for personalization
10. **Links as HTML anchors** — Use `<a href="URL">Link text</a>` for clickable links in the HTML content
11. **🟢 emoji in subject** — Always prefix subject with 🟢 (use `\uD83D\uDFE2` in JS strings)
12. **Show email to user before creating draft** — Always display the full email copy and get explicit approval before even creating the draft

---

## FULL WORKFLOW CHECKLIST

1. [ ] Get the API key from Vercel env vars (or `.env.vercel` if already pulled)
2. [ ] Understand the context — what is this email about? Read relevant files (slides, landing page, etc.)
3. [ ] Read `jonny-writer-skill.md` for voice reference
4. [ ] Write the email following the rules above (🟢 in subject, HTML `<br>` formatting, no apostrophes)
5. [ ] Show the full email to the user for approval (subject, preview, body)
6. [ ] Apply any feedback / edits
7. [ ] Create the broadcast as a **DRAFT ONLY** via API (`public: false`, no `send_at`)
8. [ ] Confirm creation (check subject, content, `public: false` in response)
9. [ ] **STOP** — Tell user the draft is ready in Kit dashboard for them to review and send
10. [ ] Clean up any temp `.cjs` script files
11. [ ] Report back to user with: broadcast ID, subject, draft status

**NEVER send programmatically. User always clicks send from Kit dashboard.**

---

## ITERATION LESSONS (from real sends)

1. **First email sent without 🟢 emoji** — Always forgotten on first draft. Check subject line before creating draft
2. **Plain `\n` renders as nothing in Kit** — Entire email arrived as one wall of text. MUST use `<br>` HTML tags. This is the #1 lesson
3. **First attempt used `all_subscribers` filter** — Kit v4 returns 422 error. Use empty array `[]` for entire list
4. **Tried `/broadcasts/{id}/send` endpoint** — Returns 404. Kit has no send endpoint. Use PUT with `public: true` + `send_at`
5. **Template literals break with dollar signs** — `$9/mo` in backtick strings causes `\9` syntax error in Node. Use array of strings joined together instead
6. **Shell escaping killed first curl attempt** — Apostrophes and quotes in JSON body cause silent failures. Use a `.cjs` script file instead of inline curl/node -e
7. **"Oops" email is actually a TACTIC** — Higher open rates than normal emails. People are curious about mistakes. Own it and re-deliver the content
8. **Never name the case study people** — Keep Daniel Riley and Matt Stark anonymous in emails. Mystery = reason to watch the workshop
9. **Always show full email to user before creating draft** — Caught the "no names" feedback before the corrected version went out
10. **Draft only, always** — Never programmatically send. One bad send goes to entire list with no undo

---

## PAST BROADCASTS (Log)

| Date | Broadcast ID | Subject | Audience | Status | Notes |
|------|-------------|---------|----------|--------|-------|
| 2026-02-08 | 22853874 | How an AI influencer built the fastest growing Skool community | All subscribers | Sent | ⚠️ Formatting broken — plain \n, no line breaks rendered |
| 2026-02-08 | 22854100 | 🟢 Sorry about that last email — heres the real one | All subscribers | Draft | Fixed with HTML `<br>` tags, oops-style subject |
| 2026-02-12 | 22902443 | 🟢 Wrong link - heres the real one (sorry) | All subscribers | Draft | Oops wrong link angle, AI Influencer Academy push, 54 members social proof |
