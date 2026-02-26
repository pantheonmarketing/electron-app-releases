# FB Auto Comment Reply Skill

Repeatable blueprint for bulk-replying to Facebook post comments via Chrome DevTools MCP. Designed for replying to lead magnet / freebie requests on organic posts with a short message + link. Supports optional DM follow-up via Messenger mini-chat (hover card method).

---

## When to Use

- Organic FB post gets 50-200+ comments asking for a link
- Need to reply to each person individually with a personalized-feeling message + URL
- Want OG link preview cards to show in each reply (requires proper OG meta tags on the destination URL)
- **Optional:** Want to also DM selected people via Messenger after replying to their comment

---

## Prerequisites

1. **Chrome DevTools MCP** connected to the browser with Facebook open
2. **Logged into Facebook** as the page/profile that owns the post
3. **Post URL** known (the post with all the comments)
4. **Destination URL** with OG meta tags configured (so link previews render in replies)
5. **Reply message variations** pre-approved by user
6. **DM message variations** pre-approved by user (if using DM mode)

---

## Operating Modes

The skill supports three modes. **Always ask the user which mode** at the start of each session:

| Mode | What it does |
|------|-------------|
| **Reply Only** | Reply to comments only (original behavior) |
| **Reply + DM All** | Reply to comment AND DM every person |
| **Reply + DM Selected** | Reply to all comments, DM only user-selected people |

For **Reply + DM Selected** mode, run the Pre-Scan phase first (see below).

---

## Pre-Scan & Selection (for "Reply + DM Selected" mode)

Before replying to anyone, scan all comments and present a numbered pick list:

### Step 1: Scan Comments
- Navigate to post, switch to "All comments", scroll to load all
- Collect every commenter's name + comment text (skip comments already replied to by page owner)

### Step 2: Present Pick List
Show the user a numbered list like this:

```
Comments found (47 unreplied):

 1. Richard Asimba - "I need this!"
 2. Sarah Chen - "Link please"
 3. Mike Johnson - "Send me the link"
 4. Bot Account123 - "Nice post"
 5. Jessica Lima - "How do I get this?"
 ...

Which mode?
 a) Reply only (all 47)
 b) Reply all + DM all
 c) Reply all + DM selected (tell me which numbers, e.g. "1,2,3,5" or "all except 4")
```

### Step 3: User Selects
User responds with selection. Examples:
- `"reply all, DM all except 4"`
- `"reply all, DM 1-10 only"`
- `"reply + DM all"`
- `"reply only"`

Store the DM list and proceed.

---

## Reply Message Variations

Mix of emoji and no-emoji for natural feel. Always use `-` (hyphen), NEVER `---` (em dash).

### Standard Variations (swap `{URL}` with actual link)

1. `here you go {URL}`
2. `here you go! {URL}`
3. `here you go :fire: {URL}`
4. `got you - {URL}`
5. `here it is {URL}`
6. `sent! check it out here :point_right: {URL}`
7. `enjoy :fire: {URL}`
8. `here - {URL}`

### Rules
- **No em dashes** (`---`). Use hyphen (`-`) or nothing
- **~40% emoji, ~60% no-emoji** for natural mix
- **Rotate randomly** - don't use the same variation twice in a row
- **Keep it short** - one line, casual, no salesy language
- **The @mention is auto-included** by Facebook when you click Reply - your message goes AFTER it

---

## DM Message Variations

Casual, personal feel. The DM should feel like a real person following up, not a bot. Always use `-` (hyphen), NEVER `---` (em dash). Swap `{URL}` with actual link.

### Standard DM Variations

1. `hey! just dropped the link on your comment - here it is in case you missed it {URL}`
2. `hey! sent you the link in the comments but wanted to make sure you got it {URL}`
3. `here you go - just replied on the post too but sending here so you don't miss it {URL}`
4. `hey just shot you the link on the post - here it is too {URL}`
5. `hey! here's that link you asked about {URL}`
6. `just replied to your comment - sending here too so it doesn't get buried {URL}`

### DM Rules
- **Rotate randomly** - never same message twice in a row
- **~30% emoji, ~70% no-emoji** (DMs should feel even more personal/natural)
- **No em dashes** (`---`). Use hyphen (`-`) or nothing
- **Keep it casual** - like texting a friend, not marketing
- **First name optional** - Facebook Messenger already shows who you're messaging

---

## Complete Workflow

### Phase 1: Navigate & Prepare

1. Navigate to the FB post URL
2. Take a snapshot to see the current state
3. Switch comment filter to **"All comments"** (not "Most relevant") to load everything:
   - Find the filter dropdown (usually shows "Most relevant")
   - Click it
   - Select "All comments"
   - Wait for comments to reload
4. Scroll down to load more comments if needed (Facebook lazy-loads)
5. **If DM mode:** Run Pre-Scan & Selection (see above) and get user approval

### Phase 2: Reply Loop (Primary Method - Chrome DevTools `fill`)

For each comment:

```
Step 1: SNAPSHOT
- Take a fresh snapshot of the page
- Identify the next unreplied comment
- Find its "Reply" button UID

Step 2: CLICK REPLY
- Click the "Reply" button (e.g., uid="36_123")
- Reply textbox opens below the comment
- Facebook auto-fills the @mention (e.g., "Richard Asimba ")

Step 3: TAKE SNAPSHOT AGAIN
- Get the new snapshot with the reply textbox visible
- Find the textbox UID (aria-label like "Reply to Richard Asimba")
- Find the "Comment" submit button UID

Step 4: FILL THE TEXTBOX
- Use the `fill` tool on the textbox UID
- Value = "@mention name" + " " + reply message
- Example: "Richard Asimba here you go aicreatorworkshop.com/automate"
- IMPORTANT: The @mention name must be included at the start because fill() replaces all content

Step 5: CLICK COMMENT
- Click the "Comment" button UID
- Wait for confirmation

Step 6: VERIFY
- Look for [role="alert"] containing "Your comment was submitted"
- Or take a snapshot and confirm the reply appears
- Comment count should increment by 1

Step 7: DM (if this person is on the DM list)
- See "Phase 2B: DM via Hover Card" below
```

### Phase 2B: DM via Hover Card (Messenger Mini-Chat)

**This method keeps you on the post page the entire time.** No page navigation needed.

After successfully replying to a comment, if this person is on the DM list:

```
Step 1: HOVER OVER PERSON'S NAME
- Hover over the commenter's name link (the one next to their profile pic)
- Wait 1-2 seconds for the profile hover card to appear
- The hover card shows: name, mutual friends, work info, "Friends" button, "Message" button

Step 2: CLICK "MESSAGE" ON HOVER CARD
- Find the "Message" button on the hover card (blue button with Messenger icon)
- Click it
- A Messenger mini-chat window opens in the bottom-right corner of the screen
- The chat is already addressed to the correct person

Step 3: TAKE SNAPSHOT
- Take a snapshot to find the Messenger chat textbox
- Look for textbox with aria-label like "Message" or "Type a message..."
- The textbox is inside the mini-chat window at bottom-right

Step 4: TYPE DM MESSAGE
- Click/focus the Messenger textbox
- Use fill() or evaluate_script to insert the DM message
- Example: "hey! just dropped the link on your comment - here it is in case you missed it aicreatorworkshop.com/automate"
- Do NOT include the person's name - Messenger already shows who you're messaging

Step 5: SEND THE DM
- Press Enter to send (use press_key tool: key="Enter")
- Or find and click the Send button if Enter doesn't work
- Wait for message to appear in the chat as "sent"

Step 6: CLOSE THE MINI-CHAT
- Find the X (close) button on the mini-chat window header
- Click it to close the chat
- You're back to the post comments - ready for the next person

Step 7: VERIFY
- The mini-chat should close cleanly
- You should still be on the post page with comments visible
- If the page scrolled, scroll back to where you were
```

### Phase 2B-JS: DM JavaScript Fallback

When snapshots are too large, use JS to interact with the Messenger mini-chat:

```javascript
// Step 1: Find the Messenger textbox (after clicking Message on hover card)
(() => {
  // Messenger mini-chat textboxes have role="textbox" inside the chat window
  const chatBoxes = document.querySelectorAll('[role="textbox"][contenteditable="true"]');
  // The Messenger one is typically the last one (comment textboxes come first)
  const messengerBox = Array.from(chatBoxes).find(tb => {
    // Messenger textbox is inside a container with specific Messenger classes
    // or has aria-label containing "Message" or "Type a message"
    const label = tb.getAttribute('aria-label') || '';
    return label.includes('Message') || label.includes('message');
  });
  if (!messengerBox) return 'Messenger textbox not found';
  messengerBox.focus();
  return 'focused Messenger textbox';
})()

// Step 2: Insert the DM text
(() => {
  const chatBoxes = document.querySelectorAll('[role="textbox"][contenteditable="true"]');
  const messengerBox = Array.from(chatBoxes).find(tb => {
    const label = tb.getAttribute('aria-label') || '';
    return label.includes('Message') || label.includes('message');
  });
  if (!messengerBox) return 'not found';
  messengerBox.focus();
  document.execCommand('insertText', false, 'hey! here is that link you asked about aicreatorworkshop.com/automate');
  return 'inserted DM text';
})()

// Step 3: Press Enter to send (use press_key tool: key="Enter")

// Step 4: Close the mini-chat
(() => {
  // Find close button - it's an X or close icon in the chat header
  // Look for SVG close icons or buttons with aria-label "Close" in the chat area
  const closeButtons = document.querySelectorAll('[aria-label="Close chat"], [aria-label="Close"]');
  for (const btn of closeButtons) {
    // Make sure it's the Messenger close, not something else
    const rect = btn.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 500 && rect.right > window.innerWidth - 400) {
      btn.click();
      return 'closed mini-chat';
    }
  }
  return 'close button not found - try clicking X manually';
})()
```

### Phase 3: JavaScript Fallback (When Snapshot Too Large)

When the page has many expanded reply threads, the snapshot can exceed the ~50K character limit. Use `evaluate_script` instead:

```javascript
// Step 1: Find the Reply button and click it
// (First identify the comment by the person's name visible on page)

// Step 2: Find the reply textbox by aria-label
(() => {
  const tb = document.querySelector('[role="textbox"][aria-label*="Reply to PersonName"]');
  if (!tb) return 'textbox not found';
  tb.focus();
  return 'focused';
})()

// Step 3: Clear existing content and insert reply
(() => {
  const tb = document.querySelector('[role="textbox"][aria-label*="Reply to PersonName"]');
  if (!tb) return 'not found';
  tb.focus();
  document.execCommand('selectAll', false, null);
  return 'selected all';
})()

// Step 3b: Press Backspace to clear, then insert text
// Use press_key tool: key="Backspace"

// Step 3c: Insert the reply text
(() => {
  const tb = document.querySelector('[role="textbox"][aria-label*="Reply to PersonName"]');
  if (!tb) return 'not found';
  tb.focus();
  document.execCommand('insertText', false, 'PersonName here you go aicreatorworkshop.com/automate');
  return 'inserted';
})()

// Step 4: Find and click the Comment button
(() => {
  const tb = document.querySelector('[role="textbox"][aria-label*="Reply to PersonName"]');
  if (!tb) return 'textbox not found';
  let parent = tb.parentElement;
  for (let i = 0; i < 10; i++) {
    const buttons = parent.querySelectorAll('[role="button"]');
    for (const btn of buttons) {
      if (btn.textContent?.trim() === 'Comment') {
        btn.click();
        return 'clicked Comment';
      }
    }
    parent = parent.parentElement;
  }
  return 'Comment button not found';
})()
```

**Key JS notes:**
- Facebook uses **Lexical editor** for comment boxes
- `appendChild(textNode)` does NOT work - Lexical won't recognize it
- Must use `document.execCommand('insertText', ...)` which Lexical hooks into
- `selectAll` + `Backspace` clears the auto-filled @mention so you can type fresh
- The @mention gets re-created by Facebook when you type the person's name

---

## Batch Timing (Human-Like Pacing)

**CRITICAL: Do not reply to all comments in rapid succession. Facebook will flag this as spam.**

### Reply-Only Batch Pattern
```
Batch 1: Reply to 5 people
Break: 8-10 minutes
Batch 2: Reply to 4-7 people
Break: 8-10 minutes
Batch 3: Reply to 5-6 people
Break: 8-10 minutes
... repeat until done
```

### Reply + DM Batch Pattern (STRICTER - DMs are more scrutinized)
```
Batch 1: Reply + DM 3 people
Break: 10-15 minutes
Batch 2: Reply + DM 3-4 people
Break: 10-15 minutes
Batch 3: Reply + DM 3 people
Break: 10-15 minutes
... repeat until done
```

### Timing Comparison Table

| | Reply Only | Reply + DM |
|---|---|---|
| Batch size | 5 replies | 3 reply+DMs |
| Break between batches | 8-10 min | 10-15 min |
| Delay between each person | 5-15 sec | 15-30 sec |
| Daily safe limit | 50-80 replies | 20-30 reply+DMs |
| Risky threshold | 100+ | 40+ |

### Within Each Batch
- Wait 5-15 seconds between each reply (reply-only) or 15-30 seconds (reply+DM)
- Vary the reply AND DM message each time (rotate through variations)
- Don't use the same variation twice in a row for either replies or DMs
- **DM extra delay:** Wait 3-5 seconds after reply before starting the DM hover

### Daily Limits
- **Reply only safe zone:** ~50-80 replies per day
- **Reply + DM safe zone:** ~20-30 per day
- **Risky:** 100+ replies or 40+ DMs in one session
- If Facebook shows a "slow down" warning, stop immediately and wait 1 hour

---

## Loading All Comments

Facebook shows "Most relevant" comments by default (typically 20-30). To load ALL comments:

1. **Switch filter:** Click "Most relevant" dropdown near top of comments section
2. **Select "All comments"** from the dropdown
3. **Scroll to load more:** Facebook lazy-loads comments in batches
   - Scroll down slowly
   - Wait for "Loading..." spinners to resolve
   - Keep scrolling until no more new comments appear
4. **"View more comments" links:** Click these to expand hidden replies

### Tracking Progress
- Note the total comment count shown on the post (e.g., "137 comments")
- Track how many you've replied to per session
- Track how many DMs sent per session (if applicable)
- After each batch, note the last person you replied to

---

## Important Rules

### DO
- Use `-` (hyphen) not `---` (em dash) in replies AND DMs
- Mix emoji and no-emoji variations (~40/60 for replies, ~30/70 for DMs)
- Rotate message variations randomly
- Take breaks between batches (8-10 min reply-only, 10-15 min reply+DM)
- Verify each reply posted ("Your comment was submitted")
- Verify each DM sent (message appears in chat as sent)
- Include the person's @mention name at the start of the fill value (for comment replies)
- Take a fresh snapshot before each reply (page state changes)
- Close the Messenger mini-chat after each DM before moving to the next person
- Wait 3-5 seconds after reply before starting the DM hover

### DON'T
- Reply to 10+ comments in under 2 minutes
- Send 5+ DMs in under 5 minutes
- Use the exact same message for consecutive replies OR DMs
- Use em dashes (`---`) anywhere
- Skip the verification step (for either replies or DMs)
- Reply to comments that already have a reply from the page owner
- Ignore Facebook's "slow down" warnings
- Navigate away from the post page (use hover card DM method, not profile navigation)
- Leave Messenger mini-chats open (always close after sending)
- DM someone without replying to their comment first

---

## OG Link Preview

When you include a URL in the reply, Facebook generates a rich link preview card IF the destination has proper OG meta tags. This is handled by the serverless OG function (e.g., `api/og-automate.js`) that serves different HTML to social crawlers vs real users.

### What the preview shows:
- Hero image (`og:image`)
- Title (`og:title`)
- Description (`og:description`)
- Domain name

### How it works:
1. You post: "here you go aicreatorworkshop.com/automate"
2. Facebook's crawler hits the URL
3. Serverless function detects `facebookexternalhit` user agent
4. Returns HTML with OG meta tags
5. Facebook renders the rich preview card in the reply

**Note:** OG previews also appear in Messenger DMs. The link in your DM will show a rich card too.

---

## Troubleshooting

### "Textbox not found" in JS fallback
- The person's name in `aria-label` must match exactly (including spaces, capitalization)
- Try partial match: `aria-label*="Reply to FirstName"`

### Snapshot too large
- Switch to JS fallback method (Phase 3 for replies, Phase 2B-JS for DMs)
- Or collapse reply threads before taking snapshot (click "Hide replies" on expanded threads)

### Reply doesn't post
- Check if the Comment button UID is correct (it's inside the reply form, not the main comment form)
- Make sure the textbox has actual text content (not just the @mention tag)
- Facebook sometimes requires a small delay between filling and clicking Comment

### "Your comment was submitted" doesn't appear
- The reply may have still posted - scroll down to check
- Take a new snapshot to verify

### Hover card doesn't appear
- Make sure you're hovering over the person's NAME link, not their profile picture
- Hold hover for 1-2 seconds - the card takes a moment to load
- If using JS, you may need to dispatch mouseenter/mouseover events on the name element

### "Message" button not on hover card
- The person may have DM restrictions (not friends, privacy settings)
- Skip this person for DM and move to the next
- Log them as "DM skipped - no Message button"

### Messenger textbox not found
- The mini-chat may not have fully loaded - wait 2-3 seconds after clicking Message
- Check for multiple textboxes on page - the Messenger one has aria-label containing "Message"
- Try the JS fallback (Phase 2B-JS) if snapshot method fails

### DM doesn't send
- Make sure you pressed Enter or clicked Send
- Check if Facebook is showing a "can't message this person" error
- Some users have restricted DMs from non-friends

### Mini-chat won't close
- Look for X button in the chat window header (top-right of the mini-chat)
- Try clicking the person's name in the chat header to collapse it
- As last resort, press Escape key

### Facebook rate limiting
- Stop all activity for 1 hour
- When resuming, start with a batch of 3 (or 2 if reply+DM) and monitor
- If still limited, wait 24 hours

---

## Session Log Template

Track progress across sessions:

```
## [Date] Session
Post: [URL]
Mode: [Reply Only / Reply + DM All / Reply + DM Selected]
Total comments: [N]
Replied this session: [N]
DMs sent this session: [N]
DMs skipped (no Message button): [N]
Running total replied: [N]
Running total DMs: [N]
Last person replied to: [Name]
Last person DM'd: [Name]
Notes: [Any issues, rate limits, etc.]
```

---

## Quick Reference

### Reply Only
```
1. Navigate to post
2. Switch to "All comments" filter
3. For each comment:
   a. Click "Reply" button
   b. Snapshot to get textbox + Comment button UIDs
   c. Fill textbox: "[Name] [variation] [URL]"
   d. Click "Comment" button
   e. Verify "Your comment was submitted"
4. After 5 replies, break 8-10 minutes
5. Repeat until done
```

### Reply + DM
```
1. Navigate to post
2. Switch to "All comments" filter
3. Pre-scan comments → present pick list → get user selection
4. For each comment:
   a. Click "Reply" button
   b. Snapshot to get textbox + Comment button UIDs
   c. Fill textbox: "[Name] [variation] [URL]"
   d. Click "Comment" button
   e. Verify "Your comment was submitted"
   f. IF this person is on DM list:
      - Wait 3-5 seconds
      - Hover over person's name → wait for hover card
      - Click "Message" on hover card
      - Mini-chat opens bottom-right
      - Type DM message in chat textbox
      - Press Enter to send
      - Verify message sent
      - Close mini-chat (click X)
5. After 3 reply+DMs, break 10-15 minutes
6. Repeat until done
```
