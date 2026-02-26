# Skool Poster Skill

Post to Skool communities via browser automation (Playwright MCP). Write posts in Jonny's voice using the jonny-writer-skill.md style guide.

---

## SETUP

### 1. Set Cookies
User provides Skool cookies array. Set them via Playwright:
```js
async (page) => {
  const cookies = [ /* user's cookie array - map to Playwright format */ ];
  // Key cookie: auth_token on .skool.com (httpOnly, secure, sameSite Lax)
  // Also need: client_id, aws-waf-token, AWSALB/AWSALBCORS, AWSALBTG/AWSALBTGCORS
  await page.context().addCookies(cookies);
}
```

**Cookie format mapping (browser → Playwright):**
- `sameSite: "lax"` → `sameSite: "Lax"`
- `sameSite: "strict"` → `sameSite: "Strict"`
- `sameSite: "unspecified"` or `"no_restriction"` → `sameSite: "None"`
- Remove `expirationDate`, `hostOnly`, `storeId`, `session` fields
- Keep: `name`, `value`, `domain`, `path`, `secure`, `httpOnly` (if true), `sameSite`

### 2. Navigate to Community
The community slug is NOT always obvious. To find Jonny's communities:
1. Navigate to `https://www.skool.com/settings?t=communities`
2. Find the community link in the list
3. **AI Influencer Academy** = `/ai-influencer-academy2026` (NOT `/ai-influencer-academy`)

```
https://www.skool.com/ai-influencer-academy2026
```

### 3. Known Community Slugs (Jonny's)
- **AI Influencer Academy:** `/ai-influencer-academy2026`
- **Ineffable.ai — Create with AI:** `/ineffableai-prompts-4855` (624 members, $19/mo)
- **AI Realism Starter Hub:** `/ineffableai`
- **AI Profit Boardroom:** `/ai-profit-lab-7462` (2.3k members, $59/mo)
- **The RoboNuggets Network (free):** `/robonuggets-free`
- **NextGen AI:** `/nextgenai`

---

## POSTING WORKFLOW

### Step 1: Open Editor
Scroll to top, click "Write something" area:
```js
await page.evaluate(() => window.scrollTo(0, 0));
await page.locator('text=Write something').first().click();
```

### Step 2: Fill Title
```js
const title = page.locator('[placeholder="Title"]');
await title.click();
await title.fill('Your title here');
```

### Step 3: Fill Body
Click body area, then type line by line with Enter keys for line breaks:
```js
const body = page.locator('[data-placeholder="Write something..."]');
await body.click();

const lines = [
  "First line.",
  "",           // empty string = blank line (Enter)
  "Second line after gap.",
  "",
  "Third line."
];

for (let i = 0; i < lines.length; i++) {
  if (lines[i] === "") {
    await page.keyboard.press('Enter');
  } else {
    await page.keyboard.type(lines[i], { delay: 3 });
    if (i < lines.length - 1) {
      await page.keyboard.press('Enter');
    }
  }
}
```

**Important:** Use `keyboard.type()` with delay, NOT `fill()` for the body. The Skool editor is a rich text editor (not a plain input), so `fill()` doesn't preserve line breaks properly.

### Step 4: Post
Scroll down ~600px to reveal the toolbar, then click POST:
```js
await page.evaluate(() => window.scrollTo(0, 600));
// POST button may be intercepted by modal overlay - if so, use force click:
await page.locator('button', { hasText: 'POST' }).click({ force: true });
```

**Known issue:** A modal background overlay (`#modalBackground`) can intercept clicks on the POST button. Solutions:
1. Use `{ force: true }` on the click
2. Or use `page.evaluate()` to click via DOM directly
3. Or let the user click POST manually and confirm

### Step 5: Verify
After posting, scroll to top and check the feed for the new post title.

---

## POST CATEGORIES (Skool)

Default category is "General discussion". To change:
- Click the "General discussi..." dropdown in the editor toolbar
- Select the desired category

---

## SEND EMAIL TO ALL MEMBERS

There's a toggle "Send email to all members" below the POST button. Default is OFF.
- Toggle ON to notify all members via email when posting important announcements
- Leave OFF for regular engagement posts

---

## WRITING STYLE

Always use **jonny-writer-skill.md** for voice/tone. Key reminders for Skool posts:

- **Shorter than FB posts** — Skool is a community, not a feed. Keep it punchy.
- **Lowercase "i"** mid-sentence, missing apostrophes ("thats", "whats", "havent", "ill")
- **One thought per line** with blank lines between sections
- **Parenthetical asides** are signature: `(because im building this around what you actually need)`
- **CAPS for single words** only: YOU, NOT, ALOT
- **No emojis** unless functional
- **End on a feeling**, not a polished tagline
- **Engagement posts** should ask for comments (numbers, keywords)

### Skool-Specific Post Types:

**1. Feedback/Poll Post** (like the one we just made):
```
Title: Quick question for you

[Community milestone / acknowledgment]
[What they already have]
[Ask what they need]
[Numbered options - casual, lowercase]
[CTA: drop your number below]
```

**2. Announcement Post:**
```
Title: [What's new - short]

[What just dropped / changed]
[Why it matters to them]
[Where to find it]
[Let me know if you need help]
```

**3. Challenge/Action Post:**
```
Title: [Challenge name]

[What to do]
[Why its important]
[Step by step]
[Post your results below]
```

**4. Help Thread (pinned):**
```
Title: Do you need help with anything? (Help thread)

[This is the official help thread]
[Post your issue and ill answer with a loom video]
```

**5. Value Drop Post:**
```
Title: [Resource name]

[What it is]
[How to use it]
[Where to find it in classroom]
```

---

## TROUBLESHOOTING

### Page loses state / navigates to about:blank
Playwright can lose the page context. Solution:
1. Re-navigate to the community URL
2. Re-open the editor
3. Re-type the content (keep it in a variable)

### POST button blocked by modal overlay
The Skool editor opens as a modal. The `#modalBackground` div can intercept clicks.
```js
// Force click
await page.locator('button', { hasText: 'POST' }).click({ force: true });

// Or DOM click
await page.evaluate(() => {
  const btns = document.querySelectorAll('button');
  for (const btn of btns) {
    if (btn.textContent.trim() === 'POST') { btn.click(); break; }
  }
});
```

### Snapshot too large
The Skool community page generates very large DOM snapshots (80k+ chars). Use:
- `browser_take_screenshot` instead of `browser_snapshot` for visual checks
- `browser_run_code` for targeted DOM queries instead of full snapshots
- Grep on saved snapshot files to find specific elements

### Cookie expiration
The `auth_token` cookie has a ~1 year expiry. Other cookies (AWSALB, aws-waf-token) expire sooner. If auth fails, ask user for fresh cookies.

---

## EXAMPLE SESSION

```
1. User provides cookies
2. Set cookies via addCookies()
3. Navigate to https://www.skool.com/ai-influencer-academy2026
4. Scroll to top, click "Write something"
5. Fill title with page.locator('[placeholder="Title"]').fill()
6. Click body area with page.locator('[data-placeholder="Write something..."]').click()
7. Type body line by line with keyboard.type() + keyboard.press('Enter')
8. Take screenshot to preview
9. User approves → scroll to POST button → click POST
10. Verify post appears in feed
```
