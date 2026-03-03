# Skool Commenter + DM Skill

Reusable workflow for DMing Skool community members and replying to their comments via Playwright browser automation.

## Prerequisites
- Skool cookies must be set (auth_token JWT) — user provides these
- Playwright MCP connected to the browser
- Student list with: name, platform (Win/Mac), license key, Skool group URL, post URL

## Phase 1: DM Each Student

### Method: Hover → Chat → Type → Send

**For students who commented on a post:**
```
1. Navigate to the Skool post URL
2. For each student:
   a. Find their name link using href slug: a[href*="student-slug"]
   b. Hover over .nth(1) (the name link in comment, not avatar)
   c. Wait 1500ms for hover card popup
   d. Click button:has-text("Chat")
   e. Wait 1000ms for chat panel to open
   f. Find textbox with placeholder "Message {FirstName}"
   g. .fill() the personalized message
   h. .press('Enter') to send
   i. Verify by checking for license key text on page
   j. Close chat: click 3rd button in .styled__BoxWrapper-sc-esqoz3-0
```

**Reliable run_code pattern (best approach):**
```js
async (page) => {
  // Close previous chat if open
  const closeButtons = page.locator('.styled__BoxWrapper-sc-esqoz3-0 > button:nth-child(3)');
  if (await closeButtons.count() > 0) await closeButtons.last().click();
  await page.waitForTimeout(500);

  // Hover over name link (nth(1) = name text link, not avatar)
  const nameLink = page.locator('a[href*="STUDENT-SLUG"]').nth(1);
  await nameLink.hover();
  await page.waitForTimeout(1500);

  // Click Chat in hover popup
  const chatBtn = page.locator('button:has-text("Chat")');
  await chatBtn.waitFor({ timeout: 3000 });
  await chatBtn.click();
  await page.waitForTimeout(1000);

  // Find message textbox (try by name first, fallback to placeholder)
  let msgBox = null;
  const allTextboxes = await page.getByRole('textbox').all();
  for (const tb of allTextboxes) {
    const placeholder = await tb.getAttribute('placeholder');
    if (placeholder && placeholder.includes('Message')) { msgBox = tb; break; }
  }

  // Fill and send
  await msgBox.fill('YOUR MESSAGE HERE');
  await msgBox.press('Enter');
  await page.waitForTimeout(1000);

  // Verify
  const sent = await page.locator('text=LICENSE-KEY-PREFIX').count();
  return sent > 0 ? 'Sent!' : 'Check manually';
}
```

**Best approach — Profile page navigation (most reliable):**
```
1. Navigate to https://www.skool.com/@STUDENT-SLUG?g=GROUP-SLUG
2. Click the "Chat" button on their profile (always visible, no hover needed)
3. Find textbox with placeholder "Message {FirstName}"
4. .fill() the message → .press('Enter') to send
```
This bypasses all hover card timing issues. Works 100% of the time.

**Alternative — Skool Inbox (for existing conversations):**
```
1. Click the chat/message icon in the Skool header
2. Find the existing conversation in the inbox
3. Click to open → type message → send
```

**Fallback — Members page search:**
```
1. Navigate to /ai-GROUP-SLUG/-/members
2. Use getByTestId('input-component').first() to search
3. Find member, click inline Chat button in their row
```

### Known Slugs (Skool URL slugs for hover/DM)
| Student | Slug | Platform |
|---------|------|----------|
| Isaac Escobar | isaac-escobar-9528 | Mac |
| Kevin Daly | kevin-daly-9892 | Mac |
| Dane Bettridge | dane-bettridge-9084 | Win |
| Hamimi Boukir | hamimi-boukir-9461 | Mac |
| Mathew Ede | mathew-ede-4439 | Mac |
| Naz H | naheed-hussain-8699 | Mac |
| Wai Sun | jason-w-6588 | Mac |
| Sohan Gokarn | sohan-gokarn-7255 | Mac |
| Jia Li Lee | jia-li-lee-5399 | Win |
| Nick Hernandaz | nick-hernandaz-9394 | Win |
| Benjamin Bayless | benjamin-bayless-5262 | Win |
| Fiona Jones | fiona-jones-7810 | Win |
| Stuart Fung | stuart-fung-7003 | Win |
| Paul Collard | paul-collard-9340 | Mac |
| Gustavo Mora | gustavo-mora (accelerator) | Win |
| H F | 95145373 (accelerator) | Mac |
| Troy Woods | troy-woods (accelerator) | Win |

### Skool Groups
- **AI Creator Academy:** skool.com/ai-influencer-academy2026
- **AI CEO Accelerator:** skool.com/ai-ceo-accelerator-7600

## Phase 2: Reply to Comments

### Method: DOM evaluate → Type → Submit

**Best working pattern (batch all at once):**
```js
async (page) => {
  const replyMsg = " YOUR REPLY MESSAGE HERE";

  const names = ['Name1', 'Name2', ...];
  const slugs = ['slug1', 'slug2', ...];
  const results = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const slug = slugs[i];

    try {
      // Scroll to commenter
      const nameLink = page.locator(`a[href*="${slug}"]`).nth(1);
      await nameLink.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);

      // Click Reply button via DOM (most reliable method)
      const clicked = await page.evaluate((s) => {
        const links = document.querySelectorAll(`a[href*="${s}"]`);
        for (const link of links) {
          let el = link.parentElement;
          for (let j = 0; j < 10; j++) {
            if (!el) break;
            const btns = el.querySelectorAll('button');
            for (const btn of btns) {
              if (btn.textContent.trim() === 'Reply' && btn.offsetParent !== null) {
                btn.click();
                return true;
              }
            }
            el = el.parentElement;
          }
        }
        return false;
      }, slug);

      if (!clicked) { results.push(`${name}: couldn't click Reply`); continue; }
      await page.waitForTimeout(800);

      // Type after @mention
      const para = page.locator(`p:has-text("@${name}")`).first();
      if (await para.count() === 0) {
        const cancelBtn = page.getByRole('button', { name: 'Cancel' }).first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
        results.push(`${name}: @mention not found`);
        await page.waitForTimeout(500);
        continue;
      }

      await para.click();
      await page.keyboard.press('End');
      await page.waitForTimeout(100);
      await page.keyboard.type(replyMsg, { delay: 0 });
      await page.waitForTimeout(600);

      // CRITICAL: Click the submit Reply button (next to Cancel)
      const cancelBtns = await page.getByRole('button', { name: 'Cancel' }).all();
      let posted = false;
      for (const cancel of cancelBtns) {
        const parent = cancel.locator('..');
        const submitBtn = parent.locator('button:has-text("Reply")').first();
        if (await submitBtn.count() > 0 && !(await submitBtn.isDisabled())) {
          await submitBtn.click();
          posted = true;
          await page.waitForTimeout(2000);
          break;
        }
      }

      results.push(`${name}: ${posted ? 'POSTED' : 'submit failed'}`);
    } catch (err) {
      results.push(`${name}: ERROR`);
      const cancelBtn = page.getByRole('button', { name: 'Cancel' }).first();
      if (await cancelBtn.count() > 0) await cancelBtn.click();
      await page.waitForTimeout(500);
    }
  }
  return results.join('\n');
}
```

## Key Gotchas

1. **Hover card disappears fast** — use run_code with 1500ms wait, NOT snapshot-based hover+click (refs go stale)
2. **Reply button must be CLICKED to submit** — typing alone does NOT send. Always find the Cancel/Reply pair and click Reply
3. **Finding submit Reply vs comment Reply** — submit Reply is next to a Cancel button; comment Reply buttons are standalone
4. **The `p:has-text("@Name")` locator** finds the @mention paragraph in the reply editor
5. **`page.keyboard.type(msg, { delay: 0 })`** is faster than typing char-by-char
6. **DOM evaluate for clicking Reply** is the most reliable approach — Playwright refs and xpath both fail due to Skool's deeply nested styled-components
7. **Chat panel close button** is always the 3rd button in `.styled__BoxWrapper-sc-esqoz3-0`
8. **"Message {Name}" textbox** — for short names like "H F", use placeholder search fallback instead of getByRole name matching
9. **Members search** uses `getByTestId('input-component').first()` (there are 2 search boxes)
10. **Batch approach** — the run_code loop that does all replies in one call is much faster and more reliable than individual ref-based clicks

## DM Message Template
```
Hey {NAME}! Your AI CEO Studio {TIER} license is ready 🎉

Your license key: {KEY}

Download ({PLATFORM}): {DOWNLOAD_URL}

Training video (watch first): {VIDEO_URL}

Important: The setup is fully automated except for one thing — it will ask you to log into your Claude account. You need a Claude account for the app to work (recommend the $20/month Pro plan at minimum). Without it the AI features won't run.

Install → enter your license key → log into Claude → you're good to go. Let me know if you need any help!
```

## Comment Reply Template
```
@{NAME} Check your inbox! Just sent you your license key and download link. I've unlocked all premium features for you for the next week — after that it'll switch to basic, and if you want premium again I'll let you know the steps. For now just install it and get set up. I'll have a live training soon that you can watch live or catch the replay 🙌
```

## Download URLs (v1.7.0)
- **Windows:** https://github.com/pantheonmarketing/aiceo-downloads/releases/download/v1.7.0/AI-CEO-Setup-1.7.0.exe
- **Mac:** https://github.com/pantheonmarketing/aiceo-downloads/releases/download/v1.7.0/AI.CEO-1.7.0-arm64.dmg
- **Public repo:** pantheonmarketing/aiceo-downloads (no source code, just binaries)
- **Training video:** https://www.tella.tv/video/funnels-video-2zmk
