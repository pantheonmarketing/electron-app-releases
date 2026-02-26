# IV4 Skill (Influencer V4)

Generate ultra-realistic AI influencer images and scroll-stopping post visuals. Uses SkillBoss AI image generation with advanced skin realism prompting to create images that look like real iPhone selfies, not AI renders.

---

## PHILOSOPHY

The image is NOT an illustration of the post. It's a **pattern interrupt** — something visually arresting that makes someone stop scrolling so they read the text.

Think of it like a movie poster, not a textbook diagram.

### What Makes a Great Post Image:
- **Unexpected action** — coffee spilling toward camera, money raining, someone mid-leap
- **Emotional face close-up** — shock, awe, excitement, mischief
- **Cinematic quality** — looks like a movie still, not a stock photo
- **One clear subject** — not busy, not cluttered, one focal point
- **Bold colors or contrast** — pops in a Facebook feed full of muted selfies
- **Slight absurdity** — just weird enough to make someone pause
- **NO text overlays** — Facebook penalizes images with text, and it looks cheap

### What Makes a BAD Post Image:
- Generic stock photo vibes (person pointing at laptop, smiling at camera)
- Infographics or charts (save those for LinkedIn)
- Screenshot of results (those go in comments, not as the main image)
- Too many elements competing for attention
- Dark/muddy colors that get lost in the feed
- AI-obvious artifacts (six fingers, melted text, uncanny valley faces)
- Literal interpretation of the post (post about money ≠ pile of cash)

---

## IMAGE STYLES BY POST ARCHETYPE

### Type 1: Case Study / Results Post
**Style:** Cinematic "money shot" — luxury, success, but with attitude
```
GOOD: Ultra-realistic AI influencer sitting at a cafe with a MacBook, golden hour light, slight smirk, coffee in hand, casual wealth energy
GOOD: Close-up of hands holding a phone showing notifications, shallow depth of field, warm tones, the phone screen slightly glowing
BAD: Screenshot of revenue dashboard
BAD: Stock photo of person celebrating with money
```

### Type 2: "New Thing I Built" Reveal Post
**Style:** Product reveal energy — dramatic lighting, tech-forward, sleek
```
GOOD: Hyper-realistic AI influencer mid-recording with ring light reflecting in their eyes, studio setup visible, moody purple/blue lighting
GOOD: Split-screen concept: real person on left fading into AI version on right, cinematic lighting, dramatic color grading
BAD: Boring screenshot of the tool
BAD: Generic "futuristic" background with no subject
```

### Type 3: Manifesto / Big Picture Vision Post
**Style:** Epic, almost movie-poster quality — bold, aspirational
```
GOOD: Person standing at edge of cliff looking out at a futuristic city, dramatic sky, silhouette energy, wide angle
GOOD: Single figure walking through a corridor of floating holographic screens, cyberpunk lighting, shot from behind
BAD: Abstract "AI brain" or neural network visualization
BAD: Generic motivational sunset
```

### Type 4: Strategy Drop / Tutorial Post
**Style:** Behind-the-scenes, "caught in the act" of building — authentic but cinematic
```
GOOD: Over-the-shoulder shot of someone at a multi-monitor setup, code/content visible on screens, moody desk lighting, shallow DOF
GOOD: Hands-on-keyboard close-up with holographic UI elements floating above, photorealistic style
BAD: Numbered list graphic
BAD: Stock photo of "brainstorming"
```

### Type 5: Personal / Life Story Post
**Style:** Intimate, warm, documentary-feel — real moments, real emotion
```
GOOD: Close-up portrait with natural window light, slightly off-center, genuine expression (not posed), warm color grade
GOOD: Candid moment — laughing with someone, walking through a city, quiet moment with coffee, bokeh background
BAD: Posed professional headshot
BAD: Overly filtered Instagram-style photo
```

### Type 6: Controversy / Hot Take / Misconception Post
**Style:** Provocative, confrontational energy — makes you feel something
```
GOOD: Attractive AI influencer spilling coffee toward the camera lens, freeze-frame action, dramatic splash, shallow DOF
GOOD: Close-up face with one eyebrow raised, slight smirk, direct eye contact with camera, dramatic side lighting
GOOD: Person casually tossing a phone over their shoulder, motion blur on the phone, sharp focus on the person's unbothered expression
BAD: Two people arguing (too literal)
BAD: "Debate" imagery with pros/cons
```

---

## PROMPT ENGINEERING FOR AI IMAGES

### The Formula
```
[SUBJECT] + [ACTION/POSE] + [SETTING] + [LIGHTING] + [CAMERA ANGLE] + [MOOD/STYLE] + [TECHNICAL SPECS]
```

### Subject Guidelines
- **AI influencer posts:** Use "extremely attractive young woman" or "extremely attractive young man" — describe specific features that make them hot (see ATTRACTIVENESS PROMPTING section below)
- **Personal posts:** "Candid photo of a man in his 30s" — relatable, not model-perfect
- **Abstract concepts:** Use a PERSON reacting to the concept, not the concept itself. "Person looking shocked at their phone" not "abstract representation of AI"

### Lighting Keywords (pick ONE dominant)
| Keyword | Effect | Best For |
|---------|--------|----------|
| `golden hour light` | Warm, aspirational | Success/lifestyle posts |
| `dramatic side lighting` | Moody, intense | Hot takes, controversy |
| `neon purple and blue` | Tech-forward, modern | AI/tech reveals |
| `soft natural window light` | Intimate, real | Personal stories |
| `studio ring light` | Creator vibes | Behind-the-scenes |
| `cinematic color grading` | Movie-quality | Any post that needs to feel epic |
| `backlit with lens flare` | Dreamy, aspirational | Vision/manifesto posts |

### Camera Angle Keywords
| Keyword | Effect | Best For |
|---------|--------|----------|
| `close-up portrait` | Intimate, emotional | Personal, hot takes |
| `over-the-shoulder` | Voyeuristic, inclusive | Tutorials, behind-scenes |
| `wide angle establishing` | Epic, aspirational | Manifestos, vision |
| `low angle looking up` | Powerful, dominant | Bold claims |
| `eye-level direct` | Confrontational, honest | Controversy, hot takes |
| `shallow depth of field f/1.4` | Professional, cinematic | Everything |

### Style Keywords (always include 2-3)
```
photorealistic, cinematic color grading, 8k resolution, shallow depth of field,
shot on Sony A7IV, professional photography, editorial quality,
hyper-detailed, natural skin texture, volumetric lighting
```

### Anti-AI-Artifact Keywords (add to EVERY prompt)
```
anatomically correct hands, five fingers on each hand, natural proportions,
no text, no watermark, no logos, no writing on image
```

---

## ULTRA-REALISTIC SKIN (CRITICAL — THE #1 AI GIVEAWAY FIX)

The single biggest thing that makes AI images look fake is **perfect skin**. Real humans have pores, redness, blemishes, peach fuzz, uneven tone. AI defaults to porcelain doll skin. This section fixes that.

### The Core Principle
**Imperfection IS realism.** The more "flaws" you describe, the more real it looks. Sounds backwards, but it works every time.

### Skin Realism Prompt Block (add to EVERY person image)
Copy-paste this entire block into any prompt with a human subject:
```
Skin is IMPERFECT and REAL: visible open pores especially on nose and cheeks,
a few tiny red blemishes near the jawline, slight dark circles under eyes,
uneven skin tone with natural redness around the nose and between the brows,
visible peach fuzz on cheeks catching the sidelight, a small mole on one cheek,
natural sebum shine on the T-zone forehead nose and chin, fine lines visible
when smiling around the eyes, skin texture that looks like real human skin
under a phone camera not airbrushed or filtered. NO skin smoothing. NO beauty
filter. NO porcelain doll skin.
```

### Skin Detail Keywords (mix and match 5-8 per prompt)
| Keyword | What It Does |
|---------|-------------|
| `visible open pores especially on nose and cheeks` | Breaks the smooth AI skin look |
| `a few tiny red blemishes near the jawline` | Adds realistic imperfection |
| `slight dark circles under eyes` | Makes face look lived-in, not CGI |
| `uneven skin tone with natural redness around nose` | Real skin has color variation |
| `visible peach fuzz on cheeks catching the sidelight` | Huge realism trigger — side light reveals fuzz |
| `natural sebum shine on T-zone` | Real skin is slightly oily, not matte |
| `fine lines visible when smiling around eyes` | Smile lines = human, not robot |
| `a small mole on one cheek` | Specific imperfections sell realism |
| `natural freckles scattered across nose and cheeks` | Works great for lighter skin tones |
| `subtle texture variation between forehead and cheeks` | Different areas of face have different texture |
| `no smoothing, no beauty filters` | Tells the model what NOT to do |
| `natural skin grain` | Micro-texture that cameras capture on real skin |
| `realistic transitions between light and shadow on skin` | Prevents the flat AI lighting look |

### Makeup Level Matters
The LESS makeup you describe, the more realistic the skin reads:
```
BAD (too polished):  "even foundation with realistic skin coverage, warm blush, subtle contour, soft highlight"
GOOD (barely there): "minimal makeup, barely there: just a touch of mascara and a dab of lip balm, no foundation, no concealer, her natural skin is fully visible with all its texture and variation"
```
Foundation = smooth = AI-looking. Skip it. Let the natural skin show.

### Camera Choice for Realism
Describing the camera as a **phone** instead of a professional camera adds another layer of realism:
```
BAD:  "Shot on Sony A7IV, 8k resolution, cinematic color grading"
GOOD: "Shot on iPhone 15 Pro, natural phone camera quality, slight lens distortion at edges, realistic phone selfie depth of field, not overly sharp or cinematic"
```
Phone photos have slight softness, lens distortion, and auto-exposure that looks "real." Professional camera keywords make it look too polished.

### Anti-Smoothing Keywords (add to end of EVERY prompt)
```
no retouching, no skin smoothing, no beauty mode, no glamour lighting,
no porcelain skin, no airbrushing, no perfection
```

### Before/After Example
```
BEFORE (AI-looking):
"...natural skin texture, photorealistic, 8k resolution..."
Result: Perfect smooth skin, looks like a beauty ad

AFTER (ultra-realistic):
"...Skin is IMPERFECT and REAL: visible open pores especially on nose and cheeks,
a few tiny red blemishes near the jawline, slight dark circles under eyes,
uneven skin tone with natural redness around the nose, visible peach fuzz on
cheeks catching the sidelight, natural sebum shine on T-zone. NO skin smoothing.
NO beauty filter. Shot on iPhone 15 Pro, natural phone camera quality..."
Result: Looks like a real selfie, people can't tell it's AI
```

### CRITICAL: The More Attractive the Subject, the MORE Imperfections You Need
This is counterintuitive but essential. When you describe a very attractive person, AI cranks up the beauty filter automatically — smoother skin, perfect makeup, porcelain doll effect. To counteract this, you must DOUBLE DOWN on imperfections for attractive subjects.

**Rule of thumb:** If your prompt says "extremely attractive" or "stunning", your skin imperfection block needs to be 2x more detailed than for an average-looking subject. List EVERY individual imperfection explicitly. Don't just say "imperfect skin" — describe blackheads, pimples, peach fuzz, dark circles, pores, lip dryness, stray brow hairs, individually.

---

## ATTRACTIVENESS PROMPTING (MAKING THE INFLUENCER HOT)

### The Problem
Saying "attractive woman" produces a generic pretty face. To get Instagram-model-level attractiveness, you need to describe SPECIFIC features that make someone stunning.

### Face Attractiveness Keywords
Describe each feature individually — the more specific, the better:
```
Face structure: "perfectly symmetrical face, extremely high sharp cheekbones that
create beautiful shadows, strong feminine jawline tapering to a delicate pointed chin"

Eyes: "large captivating dark brown doe eyes with a slight cat eye shape naturally,
thick long natural eyelashes that fan out perfectly"

Lips: "full thick pouty lips with a gorgeous cupids bow and a perfect natural pout,
lips slightly parted"

Brows: "perfectly arched thick dark eyebrows that frame her eyes beautifully"

Nose: "small delicate refined nose with a cute slight upturn"

Overall: "the kind of face that makes you look twice, effortlessly gorgeous"
```

### Body Attractiveness Keywords
Be specific about proportions — vague = generic:
```
"Incredible hourglass body, impossibly narrow tiny wasp waist that looks snatched,
very wide round curvy hips creating a dramatic waist to hip ratio, thick juicy thighs,
very flat toned stomach with visible ab lines, round firm backside, long toned legs"
```

Key phrases that work:
- `impossibly narrow tiny wasp waist` — exaggerates the hourglass
- `dramatic waist to hip ratio` — tells the model what ratio to aim for
- `thick juicy thighs` — prevents stick-thin model legs
- `snatched` — Instagram terminology the model understands
- `flat toned stomach with visible ab lines` — athletic not just skinny

### Pose Keywords for Attractiveness
The pose sells the body as much as the description:
```
"weight shifted to one leg, one hip popped hard to the side accentuating the
extreme waist to hip ratio, S-curve pose, back slightly arched pushing chest
forward and hips back, one hand running through her hair, the other on her hip"
```

Key pose elements:
- `hip popped to the side` — accentuates curves
- `S-curve silhouette` — the classic model stance
- `back slightly arched` — natural feminine posture
- `hand in hair` or `adjusting sunglasses` — casual but sexy
- `chin tilted up` — confident energy

### Expression for Attractive Subjects
Don't say "sexy" or "seductive" — be specific:
```
GOOD: "subtle seductive half-smile, lips slightly parted, eyes looking directly
at camera with relaxed confident energy, she knows exactly how beautiful she is"

GOOD: "looking slightly off camera to the side, relaxed and effortlessly hot,
like she doesnt even know how attractive she is, lips slightly parted, bedroom
eyes but casual"

BAD: "sexy expression" (too vague, often produces cringe duck face)
BAD: "seductive look" (AI interprets this as over-the-top pouty)
```

### Accessories That Sell the Instagram Look
Small details that make it feel like a real influencer photo:
```
- Small gold hoop earrings
- Thin gold belly chain (visible on bare midriff)
- Dainty gold necklace
- Gold anklet
- Small tattoo on ribcage or inner wrist
- Trendy oversized sunglasses (on face or pushed up on head)
```

---

## BODY SKIN REALISM (EQUALLY IMPORTANT AS FACE)

Face skin gets all the attention, but body skin is equally important for full-body and bikini shots. AI makes bodies look like smooth mannequins by default.

### Body Skin Realism Block (add for any shot showing significant skin)
```
Body skin is equally real: natural sweat and sunscreen oil making skin glisten,
visible peach fuzz on arms and stomach glowing in sunlight, subtle stretch marks
on outer hips, tan lines from different clothing visible, slightly darker knees
and elbows, sand/dirt on feet if outdoors, goosebumps on upper arms, a small
bruise or scar on one shin, veins visible on inner wrists and hands, natural
skin texture on thighs and stomach not smoothed.
```

### Body-Specific Imperfection Keywords
| Keyword | What It Does |
|---------|-------------|
| `subtle stretch marks on outer hips` | Extremely common on real women, huge realism tell |
| `tan lines from different bikini/clothing` | Proves she exists in multiple outfits |
| `slightly darker knees and elbows` | Real skin pigmentation variation |
| `razor bumps on inner thighs or bikini line` | Very common, very real |
| `goosebumps on upper arms` | Temperature/wind response, sells the environment |
| `small bruise on shin` | Makes her look like she actually lives and moves |
| `sand/dirt stuck to feet and calves` | Environmental interaction = reality |
| `veins visible on inner wrists and hands` | Thin skin areas show veins on real people |
| `natural sweat and sunscreen oil shine` | Bodies glisten in heat, not matte |
| `peach fuzz on arms and stomach catching sunlight` | Golden fuzz in sunlight = instant realism |
| `mosquito bite on ankle` | Tiny detail, massive realism payoff |

---

## CAMERA QUALITY DOWNGRADE (THE REALISM MULTIPLIER)

### Why Downgrade Camera Quality?
High-quality AI images look... too high quality. Real social media photos are taken on phones, often older phones, with imperfect conditions. Matching this imperfection is a massive realism boost.

### Camera Tier System
Pick the camera tier based on how "real" you need the photo to look:

**Tier 1: iPhone 15 Pro (good quality, still realistic)**
```
Shot on iPhone 15 Pro, natural phone camera quality, slight lens distortion
at edges, realistic phone selfie depth of field, not overly sharp or cinematic.
```
Best for: Front-camera selfies, well-lit indoor shots

**Tier 2: iPhone 11 Back Camera (the sweet spot — RECOMMENDED)**
```
Shot on back camera of an iPhone 11, noticeably lower camera quality, grainy
in the shadows, visible digital noise especially in the sky and darker areas,
slightly soft focus not crisp at all, colors are less vibrant and slightly
muddy compared to newer phones, limited dynamic range so the sky is blown out
and shadows are crushed, the photo has that unmistakable 2019-2020 iPhone
quality, slight motion blur, JPEG compression artifacts visible, casual
unedited photo straight from camera roll.
```
Best for: Full-body outdoor shots, beach photos, Instagram-style photos. **This is the tier that produces the most believably real images.**

**Tier 3: Older Android / iPhone 8 (very low quality)**
```
Shot on an old Android phone camera, very grainy and noisy, visible pixelation,
washed out colors, poor dynamic range, blurry edges, the kind of photo from
2017 that you'd find on someone's old Facebook.
```
Best for: "Found footage" aesthetic, throwback vibes (rarely needed)

### Camera Quality Keywords Comparison
| Quality Level | Keywords | Result |
|--------------|----------|--------|
| Too perfect (avoid) | `Shot on Sony A7IV, 8k, cinematic` | Looks like a professional photoshoot |
| Good (selfies) | `iPhone 15 Pro, natural phone quality` | Clean but believable selfie |
| **Sweet spot** | `iPhone 11 back camera, grainy, soft focus, washed out` | **Looks like a real Instagram post** |
| Extra raw | `Old Android, noisy, pixelated, blurry` | Looks like 2017 Facebook |

### The Photographer's Shadow Trick
When using back camera (someone else taking the photo), the AI sometimes adds the photographer's shadow on the ground. **This is GREAT — don't fight it.** A shadow of the person taking the photo is one of the strongest realism signals possible. If you want to encourage it:
```
"the photographer's shadow visible on the ground from the harsh sunlight"
```

---

## COMPLETE PROMPT TEMPLATES

**IMPORTANT:** All person templates below include the Ultra-Realistic Skin block. NEVER skip it — it's the difference between "obviously AI" and "is this a real person?"

### Template 1: AI Influencer Selfie (BEST FOR SOCIAL MEDIA)
```
Ultra-photorealistic casual smartphone selfie of a [woman/man] (early-mid [20s/30s]), [hair description], [clothing], [action/pose]. She/he is holding the camera at arm's length, creating a classic front-facing selfie perspective. [Expression — be specific: "cheeky grin with tongue peeking out", "slight smirk, one eyebrow raised"]. [Setting]. [Lighting — warm natural daylight, directional from one side]. Skin is IMPERFECT and REAL: visible open pores especially on nose and cheeks, a few tiny red blemishes near the jawline, slight dark circles under eyes, uneven skin tone with natural redness around the nose and between the brows, visible peach fuzz on cheeks catching the sidelight, a small mole on one cheek, natural sebum shine on T-zone forehead nose and chin, fine lines visible when smiling around the eyes. NO skin smoothing. NO beauty filter. NO porcelain doll skin. Makeup is minimal, barely there: just a touch of mascara and a dab of lip balm, no foundation, no concealer, natural skin fully visible. Shot on iPhone 15 Pro, natural phone camera quality, slight lens distortion at edges, realistic phone selfie depth of field, not overly sharp or cinematic. Anatomically correct hands, five fingers on each hand, no text, no watermark, no logos, no retouching, no skin smoothing, no beauty mode, no glamour lighting.
```

### Template 2: Action/Movement Shot
```
Ultra-photorealistic freeze-frame photo of [subject with hair/clothing description] [dramatic action — spilling coffee, tossing phone, turning around suddenly]. [Setting]. Motion blur on [moving element], sharp focus on [subject's face/expression]. [Expression]. [Lighting]. Skin is IMPERFECT and REAL: visible pores, natural redness, slight blemishes, peach fuzz catching sidelight, natural sebum shine, no smoothing, no beauty filters. Shot on iPhone 15 Pro, natural phone camera quality, high speed photography freeze frame effect. Anatomically correct hands, five fingers, no text, no logos, no retouching, no beauty mode.
```

### Template 3: Intimate Portrait
```
Candid close-up portrait of [subject description with specific features], [expression], [eye direction]. [Natural lighting description]. Shallow depth of field, bokeh background, warm color grade. Skin is IMPERFECT and REAL: visible open pores especially on nose and cheeks, uneven skin tone with natural redness, slight dark circles under eyes, visible peach fuzz on cheeks, natural freckles, sebum shine on T-zone, fine smile lines. NO skin smoothing, NO beauty filter, NO porcelain skin. Minimal makeup, natural skin fully visible. Shot on iPhone 15 Pro, realistic phone portrait mode depth of field. No text, no watermark, no retouching.
```

### Template 4: Instagram Influencer Full Body (BEST FOR ATTRACTIVE INFLUENCER SHOTS)
```
Casual back camera phone photo of an extremely attractive [nationality] young [woman/man] ([age]), [standing/posing] in [setting]. [Hair description — long, color, texture, messy details like strands stuck to neck]. [Skin tone description]. [Body description — use attractiveness keywords: hourglass, narrow waist, wide hips, thick thighs, toned stomach]. [Clothing — be specific about fit and how it hugs the body]. [Accessories — gold jewelry, sunglasses, tattoos]. [Pose — hip popped, S-curve, hand placement, weight shift]. [Expression — specific, not just "sexy"]. Full body shot head to feet. Her/his face has ZERO makeup and shows real skin: visible enlarged pores on nose and cheeks and forehead, blackheads on nose tip, a couple small pimples on chin, dark circles under eyes, uneven blotchy skin tone with red patches on cheeks and nose from sun, visible peach fuzz on face especially upper lip sideburns and jawline catching sunlight, lips natural color with slight dryness, beauty mark on face, natural oil and sweat shine on forehead nose and chin, eyebrows natural with stray hairs, eyelashes natural length not dramatic. Body skin equally real: natural sweat and oil making skin glisten, peach fuzz on arms and stomach, stretch marks on outer hips, tan lines from different clothing, darker knees and elbows, goosebumps on upper arms, veins on wrists. ZERO MAKEUP. NO skin smoothing. NO beauty filter. NO airbrushing. [Setting details — worn/real not pristine]. [Lighting — harsh natural sun, real shadows]. Shot on back camera of an iPhone 11, lower quality, grainy in shadows, slightly soft focus, colors warm and washed out, casual unedited photo straight from camera roll. No text, no watermark, no retouching, no filters.
```

### Template 5: Behind-The-Scenes Creator
```
Over-the-shoulder photo of [subject] at [workstation/setup], [screens showing content/code]. [Ambient lighting — desk lamp, monitor glow, ring light]. Shallow depth of field, focus on [specific element]. Skin has natural texture where visible: pores, redness, real human detail. Muted tones with [accent color] highlights. 8k, photorealistic. No text, no watermark, no retouching.
```

### Template 5: Cinematic Wide Shot
```
Wide angle cinematic photo of [single figure] [action] in [dramatic setting]. [Sky/atmosphere description]. [Lighting]. Shot from [angle], sense of scale and possibility. Film grain, cinematic aspect ratio 2.39:1, color graded like [movie reference]. No text, no watermark.
```

---

## IMAGE SIZE BY PLATFORM

| Platform | Size | Aspect | SkillBoss Format | Best For |
|----------|------|--------|-----------------|----------|
| Facebook Feed (landscape) | 1200x630 | ~1.91:1 | `1200*630` | Post images, scenes, action shots |
| Facebook/IG Square | 1080x1080 | 1:1 | `1080*1080` | Close-up portraits, product shots |
| Instagram Portrait | 1080x1350 | 4:5 | `1080*1350` | Full body shots, influencer photos |
| Instagram Story | 1080x1920 | 9:16 | `1080*1920` | Stories, vertical content |
| Full Body Portrait | 630x1200 | ~1:1.9 | `630*1200` | Full body head-to-toe shots |

**Default for Jonny's FB posts: `1200*630`** (landscape, fills the feed)
**Default for influencer full-body shots: `630*1200`** (portrait, shows head to toe)

---

## HOW TO GENERATE A POST IMAGE

### Step 1: Read the Post
Identify:
- What archetype is this? (case study, reveal, manifesto, tutorial, personal, controversy)
- What's the emotional tone? (excitement, shock, mischief, warmth, defiance)
- Is there a specific visual moment mentioned? (someone commenting, a result, a tool)

### Step 2: Pick the Image Style
Match archetype to style (see IMAGE STYLES BY POST ARCHETYPE above).
Don't be literal — be cinematic.

### Step 3: Brainstorm 2-3 Concepts
Think of concepts that are:
- **Unexpected** (what would make YOU stop scrolling?)
- **Single subject** (one clear focal point)
- **Emotionally resonant** (matches the post's energy)

Example for a post about AI influencer misconceptions:
```
Concept A: Attractive AI influencer tipping a coffee cup toward the camera, freeze-frame splash, mischievous smirk, as if saying "you don't get it yet"
Concept B: Close-up of a woman's face, half-human half-digital-glitch effect, one eye normal one eye pixelated, direct camera stare
Concept C: Person casually scrolling their phone, the phone screen projecting a holographic AI face into the air, cafe setting, golden hour
```

### Step 4: Build the Prompt
Use the formula and templates above. Be SPECIFIC. Vague prompts = generic results.

### Step 5: Generate with SkillBoss
```bash
# Primary model (best quality)
node ./skillboss/scripts/api-hub.js image \
  --model "mm/img" \
  --prompt "[YOUR FULL PROMPT]" \
  --size "1200*630" \
  --output /tmp/post-image.png

# If mm/img fails or rate limited, fallback:
node ./skillboss/scripts/api-hub.js image \
  --model "vertex/gemini-3-pro-image-preview" \
  --prompt "[YOUR FULL PROMPT]" \
  --output /tmp/post-image.png

# Second fallback:
node ./skillboss/scripts/api-hub.js image \
  --model "replicate/black-forest-labs/flux-schnell" \
  --prompt "[YOUR FULL PROMPT]" \
  --output /tmp/post-image.png
```

### Step 6: Review Against Checklist
Run through the quality checklist below before using.

---

## MODEL COMPARISON

| Model | Best For | Quality | Speed | Notes |
|-------|----------|---------|-------|-------|
| `mm/img` | Default, photorealistic people | High | Fast | Best for AI influencer shots, supports `size` parameter with `*` format |
| `vertex/gemini-3-pro-image-preview` | Creative scenes, compositions | High | Medium | Great for cinematic/dramatic shots |
| `replicate/black-forest-labs/flux-schnell` | Quick iterations, stylized | Medium-High | Very Fast | Good for testing concepts quickly |

**Recommendation:** Start with `mm/img` for photorealistic people shots. Use `vertex/gemini-3-pro-image-preview` for more creative/cinematic compositions. Use `flux-schnell` for quick concept testing.

---

## PROMPT DO'S AND DON'TS

### DO:
- Describe the person's expression specifically ("cheeky grin with tongue peeking out", "subtle seductive half-smile, lips slightly parted")
- Include clothing details and how it fits the body ("tight cropped jersey that barely reaches above her navel")
- Use iPhone 11 back camera for full-body/outdoor shots (the sweet spot for realism)
- Use iPhone 15 Pro for front-camera selfies
- Add the full Ultra-Realistic Skin block to every person image — FACE AND BODY separately
- Say "ZERO MAKEUP. ZERO FOUNDATION. ZERO MASCARA." — list each product you DON'T want individually
- Describe attractiveness through SPECIFIC features (cheekbones, lip shape, eye shape) not generic words
- Describe body proportions explicitly ("impossibly narrow wasp waist, wide round hips, dramatic waist to hip ratio")
- Add body imperfections separately from face (stretch marks, tan lines, darker knees, razor bumps)
- Use pose keywords that accentuate the body ("hip popped, S-curve, back arched")
- Add small realistic accessories (gold belly chain, anklet, small tattoo)
- For very attractive subjects, DOUBLE the skin imperfection details (AI auto-smooths hot faces)
- Describe the setting as slightly worn/imperfect ("patchy grass", "faded line markings", "rusty goal post")

### DON'T:
- Don't ask for text in the image (AI text always looks garbage)
- Don't describe multiple people in complex interactions (AI struggles with this)
- Don't use brand names ("wearing Nike") — use descriptive alternatives
- Don't ask for specific real people's faces (but referencing types like "like a young Adriana Lima" is ok)
- Don't use overly complex scenes with many elements
- Don't include hands prominently unless necessary (AI still struggles with hands)
- Don't use "beautiful" or "sexy" as descriptors — be specific about features instead
- Don't use "Shot on Sony A7IV" or "8k resolution" for social media images (too cinematic)
- Don't describe ANY makeup for maximum realism (foundation, contour, highlight, mascara = smooth AI skin)
- Don't just say "realistic skin texture" — it does nothing. You MUST describe specific imperfections individually
- Don't skip the anti-smoothing keywords — AI will default to beauty-mode skin every time
- Don't describe the face and body skin in one block — separate them so each gets enough detail
- Don't forget body skin imperfections — smooth mannequin bodies are as much of an AI giveaway as smooth faces

---

## EXAMPLE: FULL WORKFLOW

**Post topic:** AI influencer misconceptions (the Persis Cursetji comment post)

**Step 1: Analyze post**
- Archetype: Controversy / Hot Take
- Tone: Mischievous, confident, playful but confrontational
- Visual moment: Someone commenting something dismissive, "spilling the tea"

**Step 2: Style match**
- Provocative energy but CUTE not angry — playful confrontation > aggressive confrontation
- Selfie format (feels native to Facebook feed)

**Step 3: Concepts**
```
A) AI influencer playfully tossing coffee toward camera — "spill the tea" energy, cheeky grin
B) Close-up of a woman's face, half-human half-digital-glitch effect, direct camera stare
C) Person casually scrolling phone with a "really?" expression, cafe setting
```

**Step 4: Build prompt (going with concept A — the winner)**

Key decisions made during iteration:
- v1: Coffee was too subtle (just sloshing in cup) — needed more aggressive splash
- v2: Expression was angry/fierce — changed to cute/playful (tongue out, cheeky grin)
- v3: Skin was too perfect/polished — added full Ultra-Realistic Skin block
- v4 (final): Added iPhone camera, removed all foundation/makeup, described every skin imperfection

```
Ultra-photorealistic casual smartphone selfie of a young adult woman (early-mid 20s),
captured in a natural everyday setting. She is playfully tossing coffee from a white
cup directly toward the camera lens, coffee mid-splash creating a dramatic freeze-frame
effect, large brown liquid droplets and streams splashing aggressively toward the viewer,
coffee covering parts of the foreground. She is holding the camera at arm's length with
one hand, creating a classic front-facing selfie perspective. She has long straight honey
blonde hair with subtle caramel highlights, silky and flowing, middle part, hair falling
past shoulders with natural movement from the throwing motion, a few stray hairs sticking
to her forehead from the action. Her facial features are balanced with bright blue eyes
that have visible blood vessels in the whites, naturally groomed brows with a few stray
hairs outside the brow line, light natural mascara with one tiny clump visible, softly
contoured cheeks with a sun-kissed glow, lips with natural pink color showing slight
dryness and natural lip texture lines. Her expression is cute and playful, a cheeky grin
with a little tongue peeking out, eyes sparkling with mischief, like she is having the
time of her life throwing this coffee at you. Skin is IMPERFECT and REAL: visible open
pores especially on nose and cheeks, a few tiny red blemishes near the jawline, slight
dark circles under eyes from real life, uneven skin tone with natural redness around the
nose and between the brows, visible peach fuzz on cheeks catching the sidelight, a small
mole on one cheek, natural sebum shine on the T-zone forehead nose and chin, fine lines
visible when smiling around the eyes, skin texture that looks like real human skin under
a phone camera not airbrushed or filtered. NO skin smoothing. NO beauty filter. NO
porcelain doll skin. Makeup is minimal, barely there: just a touch of mascara and a dab
of lip balm, no foundation, no concealer, her natural skin is fully visible with all its
texture and variation. Lighting is warm natural daylight with soft golden tones, directional
from one side, creating gentle shadows that reveal real skin texture and pores. She is
wearing small gold stud earrings and a casual light blue fitted tank top with a tiny
wrinkle near the collar. The coffee splash is dramatic and aggressive, taking up a large
portion of the lower foreground, brown liquid mid-air between the cup and camera, droplets
caught in freeze-frame. The setting is a bright modern cafe with white walls, window with
natural light, plants visible in blurred background. Shot on iPhone 15 Pro, natural phone
camera quality, slight lens distortion at edges, realistic phone selfie depth of field,
not overly sharp or cinematic. Anatomically correct hands, five fingers on each hand, no
text, no watermark, no logos, no retouching, no skin smoothing, no beauty mode, no
glamour lighting.
```

**Step 5: Generate**
```bash
node ./skillboss/scripts/api-hub.js image \
  --model "mm/img" \
  --prompt "[FULL PROMPT ABOVE]" \
  --size "1200*630" \
  --output /tmp/post-image-misconceptions.png
```

**Step 6: Check output against checklist**

### Iteration Lessons Learned (from real examples)

**Coffee Girl Session (selfie + action):**
1. **First attempt will usually have too-subtle action** — push for "aggressive" and "dramatic" in the prompt
2. **Default AI expression is angry/fierce for action shots** — explicitly say "cute", "playful", "cheeky grin", "tongue peeking out" to override
3. **Skin realism requires NEGATIVE keywords** — saying "realistic skin" alone does nothing. You must say "NO smoothing, NO beauty filter, NO porcelain" AND describe specific imperfections (pores, blemishes, redness, peach fuzz)
4. **iPhone > Sony A7IV for realism** — phone camera keywords produce more believable selfie-style images
5. **Remove makeup to reveal skin** — "no foundation, no concealer" forces the model to show actual skin texture instead of covering it with perfect makeup

**Brazilian Influencer Session (full body + attractiveness):**
6. **Attractiveness and realism fight each other** — the hotter you make the subject, the harder AI smooths the skin. Counter by listing EVERY makeup product as "ZERO" individually (ZERO FOUNDATION. ZERO CONCEALER. ZERO MASCARA. ZERO EYELINER.)
7. **iPhone 11 > iPhone 15 for full body outdoor shots** — the lower quality, grain, and washed-out colors of an older phone make full body shots way more believable
8. **Describe face and body skin SEPARATELY** — one skin block for the face (pores, blackheads, pimples, dark circles, peach fuzz on upper lip) and a separate block for the body (stretch marks, tan lines, darker knees, razor bumps, goosebumps)
9. **Specific face features > generic "attractive"** — "high sharp cheekbones, large doe eyes with cat eye shape, full pouty lips with gorgeous cupids bow, small refined nose with cute upturn" produces a WAY more attractive face than just saying "very attractive"
10. **Body proportions need explicit ratios** — "impossibly narrow wasp waist, wide round hips, dramatic waist to hip ratio" beats "curvy body" every time
11. **The photographer's shadow is GOOD** — when it appears on the ground from the back camera, it's a massive realism signal. Don't regenerate to remove it.
12. **Worn/imperfect settings sell realism** — "patchy grass with dirt spots, rusty goal post, faded line markings" beats "beautiful pristine soccer field"
13. **Same character, different settings** — once you nail a character description, you can reuse the face/body/skin blocks in new settings (soccer field → beach → cafe) for consistent influencer identity

---

## QUALITY CHECKLIST

### Must-haves:
- [ ] One clear subject / focal point?
- [ ] Would YOU stop scrolling for this image?
- [ ] Matches the emotional tone of the post?
- [ ] No text, watermarks, or logos in the image?
- [ ] Correct aspect ratio for Facebook (1200x630)?
- [ ] No obvious AI artifacts (wrong number of fingers, melted features)?
- [ ] Colors pop against a typical Facebook feed?

### Skin Realism Check (CRITICAL — zoom in on the face):
- [ ] Can you see pores on the nose/cheeks? (if no → regenerate with skin block)
- [ ] Is there any redness variation? (nose, between brows, cheeks should differ)
- [ ] Does the skin look matte and perfect? (if yes → add sebum shine, remove foundation keywords)
- [ ] Any visible peach fuzz catching the light? (huge realism tell)
- [ ] Does it look like an iPhone selfie or a beauty ad? (should feel like iPhone)
- [ ] Is makeup too heavy/visible? (remove foundation/concealer keywords, keep to mascara + lip balm max)
- [ ] Zoom out — at Facebook feed size, does the face read as "real person"?

### Body Realism Check (for full body / bikini / showing skin):
- [ ] Does the body skin have visible texture or does it look like a smooth mannequin?
- [ ] Any stretch marks, tan lines, or skin color variation visible?
- [ ] Knees and elbows slightly darker than surrounding skin?
- [ ] Natural sweat/oil shine on the body? (not matte plastic)
- [ ] Peach fuzz visible on arms/stomach in sunlight?
- [ ] Does the body look like it exists in the environment? (sand on feet, wet from water, etc.)

### Attractiveness Check (for influencer shots):
- [ ] Does the face have specific attractive features (cheekbones, lip shape) or just generic pretty?
- [ ] Body proportions match what was requested? (waist-to-hip ratio, curves)
- [ ] Pose accentuating the body? (hip pop, S-curve, weight shift)
- [ ] Expression is confident/seductive or just blank/stiff?
- [ ] Accessories visible? (jewelry, sunglasses)

### Kill signals (regenerate if ANY are true):
- [ ] Looks like a stock photo or professional photoshoot
- [ ] Has text or writing visible in the image
- [ ] Multiple subjects competing for attention
- [ ] Hands look wrong (extra fingers, weird angles)
- [ ] Face is in the uncanny valley
- [ ] Skin is porcelain-smooth with no visible pores or texture (AI GIVEAWAY #1)
- [ ] Body looks like a smooth mannequin with no texture or imperfections
- [ ] Too dark or muddy to read on mobile
- [ ] Literally illustrates the post (too on-the-nose)
- [ ] Could be any generic post's image (not specific to THIS post)
- [ ] Expression is angry/fierce when it should be playful (common AI default for action shots)
- [ ] Image quality looks too professional/sharp for a phone photo (downgrade camera tier)
- [ ] Face has visible heavy makeup when bare skin was requested (re-emphasize ZERO MAKEUP)

---

## EXAMPLE PROMPT TO USE THIS SKILL

"Generate a post image for [this Facebook post]. The post is about [topic] with a [tone] vibe. Use the [archetype] style."

Or even simpler:

"Make me an image for this post" — and the skill will analyze the post, pick the style, brainstorm concepts, and generate.

---

## INTEGRATION WITH JONNY WRITER SKILL

This skill (IV4) is designed to work alongside `jonny-writer-skill.md`. The workflow is:

1. **Write the post** using Jonny Writer Skill
2. **Generate the image** using IV4 Skill
3. **Review both together** — does the image make you want to read the post? Does the post deliver on the image's promise?

The image should create curiosity. The post should satisfy it. They work as a pair, not independently.
