# Giveaway Funnel Builder Skill

Build complete lead-magnet giveaway funnels (opt-in page + thank-you page) using the AI CEO Studio Giveaway API. You generate all the copy, configure the funnel, and optionally deploy to Cloudflare Workers.

---

## How It Works

The AI CEO Studio has a built-in giveaway funnel system with a REST API at `http://localhost:3456`. You create a project, fill in the config with compelling copy, upload a hero image if available, and optionally deploy to Cloudflare Workers.

Each funnel has:
- **Opt-in page** — hero image, headline, name+email form, social proof, CTA button
- **Thank-you page** — confirmation, access button, optional upsell section, optional video embed

---

## API Reference (all endpoints on localhost:3456)

### Create Project
```
POST /api/giveaway/projects
Content-Type: application/json
Body: { "name": "My Funnel Name" }
Response: { "ok": true, "project": { "id": "gv_...", "name": "...", "config": {...}, "deploy": {...} } }
```

### Update Project Config
```
PUT /api/giveaway/projects/:id
Content-Type: application/json
Body: {
  "name": "Funnel Display Name",
  "config": {
    "headline": "50 Free AI Influencer Prompts",
    "subheadline": "The exact prompts to create stunning AI influencer photos",
    "subheadlineBold": "— faces, poses, lighting, and styles that look 100% real.",
    "badge": "Free Download",
    "ctaButton": "Get Instant Access",
    "socialProof": "Downloaded by 2,400+ creators",
    "thankYouTitle": "You're In!",
    "thankYouText": "Your free resource is ready. Click below to access it instantly.",
    "accessButton": "Access Now",
    "accessUrl": "https://example.com/resource",
    "thankYouVideoUrl": "",
    "upsellEnabled": true,
    "upsellHeadline": "Want To Build This Yourself?",
    "upsellText": "Join our community and get the full system — step by step.",
    "upsellBullets": [
      { "emoji": "🎭", "text": "Step-by-step training from scratch" },
      { "emoji": "🎬", "text": "Video tutorials and templates" },
      { "emoji": "💰", "text": "Proven monetization strategies" },
      { "emoji": "🤝", "text": "Community of like-minded creators" }
    ],
    "upsellPrice": "$9",
    "upsellPeriod": "/month",
    "upsellCta": "Join The Community",
    "upsellUrl": "https://www.skool.com/...",
    "upsellDisclaimer": "Cancel anytime. No contracts. No BS.",
    "emailProvider": "none",
    "convertkitApiKey": "",
    "convertkitTagId": "",
    "webhookUrl": "",
    "accentColor": "#7B2FF2",
    "accentLight": "#C084FC",
    "contactEmail": ""
  }
}
Response: { "ok": true, "project": {...} }
```

### Upload Hero Image (from file path)
Use curl with multipart form data. The hero image file must exist on disk.
```bash
curl -X POST http://localhost:3456/api/giveaway/projects/{id}/upload-hero \
  -F "hero=@/path/to/image.jpg"
```
Response: `{ "ok": true, "filename": "hero-1234.jpg" }`

### Preview Funnel HTML
```
GET /api/giveaway/projects/:id/preview?page=optin
GET /api/giveaway/projects/:id/preview?page=thankyou
Response: Full HTML page (can be viewed in browser)
```

### Deploy to Cloudflare Workers
Only works if CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are set in the environment.
```
POST /api/giveaway/projects/:id/deploy
Content-Type: application/json
Body: { "workerName": "my-funnel-name" }
Response: { "ok": true, "url": "https://my-funnel-name.subdomain.workers.dev", "workerName": "my-funnel-name" }
```
Worker name rules: lowercase letters, numbers, and hyphens only.

### List All Projects
```
GET /api/giveaway/projects
Response: { "ok": true, "projects": [...] }
```

### Delete Project
```
DELETE /api/giveaway/projects/:id
Response: { "ok": true }
```

---

## Copy Generation Guidelines

When generating funnel copy, follow these direct-response marketing principles:

### Headlines
- **Be specific** — "50 Free AI Influencer Prompts" beats "Free AI Resources"
- **Lead with the number or benefit** — numbers grab attention
- **Keep it short** — 3-8 words ideal for the headline

### Subheadline
- Expand on the promise in 1-2 sentences
- Split into regular + bold parts for visual emphasis
- Regular part: describe what they get
- Bold part (subheadlineBold): the specific outcome or detail

### Badge
Choose the most appropriate:
- "Free Download" — for PDFs, checklists, templates
- "Free Guide" — for how-to content
- "Free Training" — for video content
- "Free Tool" — for software/apps
- "Free Templates" — for swipe files

### CTA Button
Action-oriented, specific:
- "Get Instant Access" / "Get It Free" / "Download Now"
- "Get Your Free [Thing]" — e.g., "Get Your Free Prompts"
- Include ➡ arrow at the end (the template adds it automatically)

### Social Proof
One line of credibility:
- "Downloaded by X+ [audience]" — e.g., "Downloaded by 2,400+ creators"
- "Trusted by X+ [audience]"
- "Used by [specific impressive group]"
- Make the number believable but impressive

### Thank-You Page
- Title: "You're In!" or "Check Your Email!" or "You Got It!"
- Text: Confirm what they got + tell them what to do next
- Access button text: "Access [Thing] Now" or "Download [Thing]"

### Upsell Section (when enabled)
- Headline: "Want To [Next Level Goal]?" or "Ready For The Full System?"
- 4-5 bullets with emojis — each bullet is one clear benefit
- Keep bullets scannable (under 10 words each)
- Price should feel like a no-brainer ($9/mo, $19/mo, $29 one-time)
- CTA: "Join Now" / "Get Started" / "Start Today"
- Disclaimer: "Cancel anytime. No contracts. No BS."

### Video Embed (when enabled)
- Set thankYouVideoUrl to the video URL
- Works with: YouTube embeds, Vimeo, Bunny.net HLS, direct .mp4
- The video appears between the access button and the upsell section

---

## Workflow

When given a task to build a funnel, follow these steps:

### Step 1: Understand the Brief
Extract from the user's description:
- What's the giveaway? (topic, name, what they're giving away)
- Who's the target audience?
- Is there a specific access URL for the freebie?
- Should it collect emails? (ConvertKit API key + tag, or webhook URL)
- Is there an upsell? (product name, price, URL)
- Is there a video for the thank-you page?
- Is there a hero image file path?

### Step 2: Create the Project
```bash
curl -s -X POST http://localhost:3456/api/giveaway/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Funnel Name Here"}'
```
Save the project ID from the response.

### Step 3: Generate Copy & Configure
Based on the brief, generate all the copy fields and send them:
```bash
curl -s -X PUT http://localhost:3456/api/giveaway/projects/{PROJECT_ID} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "...",
    "config": {
      "headline": "...",
      "subheadline": "...",
      "subheadlineBold": "...",
      "badge": "...",
      "ctaButton": "...",
      "socialProof": "...",
      "thankYouTitle": "...",
      "thankYouText": "...",
      "accessButton": "...",
      "accessUrl": "...",
      "thankYouVideoUrl": "",
      "upsellEnabled": true,
      "upsellHeadline": "...",
      "upsellText": "...",
      "upsellBullets": [...],
      "upsellPrice": "...",
      "upsellPeriod": "...",
      "upsellCta": "...",
      "upsellUrl": "...",
      "upsellDisclaimer": "Cancel anytime. No contracts. No BS.",
      "emailProvider": "none",
      "accentColor": "#7B2FF2",
      "accentLight": "#C084FC",
      "contactEmail": ""
    }
  }'
```

**Important:** Use a script file for the curl command if the JSON contains special characters (quotes, dollar signs). Write a `.cjs` file:
```javascript
const http = require('http');
const data = JSON.stringify({ name: '...', config: { ... } });
const req = http.request({
  hostname: 'localhost', port: 3456, method: 'PUT',
  path: `/api/giveaway/projects/${projectId}`,
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log(body));
});
req.write(data);
req.end();
```

### Step 4: Upload Hero Image (if provided)
If the user provided a hero image path:
```bash
curl -s -X POST http://localhost:3456/api/giveaway/projects/{PROJECT_ID}/upload-hero \
  -F "hero=@/path/to/hero-image.jpg"
```

### Step 5: Verify
Check the preview to confirm it looks right:
```bash
curl -s http://localhost:3456/api/giveaway/projects/{PROJECT_ID}/preview?page=optin | head -20
curl -s http://localhost:3456/api/giveaway/projects/{PROJECT_ID}/preview?page=thankyou | head -20
```

### Step 6: Deploy (if Cloudflare credentials are set)
```bash
curl -s -X POST http://localhost:3456/api/giveaway/projects/{PROJECT_ID}/deploy \
  -H "Content-Type: application/json" \
  -d '{"workerName":"funnel-name-here"}'
```

### Step 7: Report Results
Tell the user:
- Project ID and name
- What copy was generated (summary)
- Preview URL: `http://localhost:3456/api/giveaway/projects/{ID}/preview?page=optin`
- If deployed: the live Cloudflare Workers URL
- Next steps: they can edit the funnel in the Funnels tab, upload a different hero image, or re-deploy

---

## Config Field Reference

If the user specified config values in the skill configuration (below the skill in the skill editor), use those as defaults:
- `default_upsell_url` → use as `upsellUrl`
- `default_email_provider` → use as `emailProvider`
- `default_convertkit_key` → use as `convertkitApiKey`
- `default_convertkit_tag` → use as `convertkitTagId`
- `default_contact_email` → use as `contactEmail`

---

## Examples

**User says:** "Create a giveaway funnel for 50 AI influencer prompts. Collect emails via ConvertKit. Upsell to Skool at $9/mo."

**You generate:**
- headline: "50 Free AI Influencer Prompts"
- subheadline: "The exact prompts to create stunning AI influencer photos"
- subheadlineBold: "— faces, poses, lighting, and styles that look 100% real."
- badge: "Free Download"
- ctaButton: "Get 50 Free Prompts"
- socialProof: "Downloaded by 2,400+ creators building AI influencers"
- thankYouTitle: "You're In!"
- thankYouText: "Your 50 AI influencer prompts are ready. Click below to access them instantly."
- accessButton: "Access 50 Free Prompts"
- upsellHeadline: "Want To Build This Yourself?"
- upsellBullets: 4-5 relevant benefits with emojis
- upsellPrice: "$9", upsellPeriod: "/month"
- emailProvider: "convertkit"

**User says:** "Build a funnel for a free SEO checklist. No email collection, no upsell. Keep it simple."

**You generate:**
- headline: "The Ultimate SEO Checklist"
- subheadline: "Everything you need to rank your website on Google"
- subheadlineBold: "— on-page, off-page, technical, and content optimization."
- badge: "Free Guide"
- ctaButton: "Get The Checklist"
- upsellEnabled: false
- emailProvider: "none"
