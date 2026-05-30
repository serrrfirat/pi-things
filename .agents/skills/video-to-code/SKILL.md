---
name: video-to-code
description: Convert video animations and GIF interactions into working React code. Use when the user shares a video URL, GIF, or webpage containing an animation they want to replicate. Triggers include "video to code", "replicate this animation", "build this interaction", "code this GIF", "implement this motion", "recreate this effect". After iterating, use /video-to-code:export to integrate into the project.
---

# Video to Code

Convert video animations, GIFs, and interactive demos into production-ready React components by analyzing visual motion frame-by-frame and iterating based on user feedback.

## Workflow Overview

1. **Receive** - User provides a video URL, GIF, or webpage with animation
2. **Download** - Try direct fetch, fallback to Puppeteer for authenticated URLs
3. **Extract Frames** - Use ffmpeg to extract key frames for visual reference
4. **Analyze** - Review frames visually + send video to Gemini 2.5 Flash
5. **Generate** - Create standalone Animation Lab in `/tmp/animation-lab`
6. **Preview** - User reviews at `http://localhost:5173`
7. **Feedback** - Iterate until animation matches original
8. **Export** - Use `/video-to-code:export` to integrate into user's project

---

## Phase 0: Preflight Check

```bash
echo $GEMINI_API_KEY
```

**If missing:** Stop and direct user to Setup section.

---

## Phase 1: Get Video Source

Ask the user for:
- A direct video/GIF URL (mp4, webm, gif)
- A webpage URL containing the video/animation
- A local file path to a video

---

## Phase 2: Download Video & Extract Frames

### Step 2.1: Try Direct Download First

```bash
curl -L -o /tmp/animation.mp4 "VIDEO_URL" && ls -lh /tmp/animation.mp4
```

If the file is very small (< 1KB), it's likely an auth error. Check contents:
```bash
cat /tmp/animation.mp4
```

If you see XML/JSON error or "Authorization" message → use Puppeteer.

### Step 2.2: Use Puppeteer for Authenticated URLs

When direct download fails (Cloudflare R2, signed URLs, etc.), use Puppeteer:

```javascript
// Save as /tmp/download-video.mjs
import puppeteer from 'puppeteer';
import fs from 'fs';

async function downloadVideo() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  let videoUrl = null;

  // Intercept network requests to find the video URL with auth tokens
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('.mp4') || url.includes('video')) {
      console.log('Found video URL:', url.substring(0, 100) + '...');
      videoUrl = url;
    }
  });

  console.log('Navigating to page...');
  await page.goto('PAGE_URL_HERE', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  // Also try to get the video src directly from the DOM
  const videoSrc = await page.evaluate(() => {
    const video = document.querySelector('video');
    return video ? video.src || video.querySelector('source')?.src : null;
  });

  const finalUrl = videoUrl || videoSrc;

  if (finalUrl) {
    console.log('Downloading video...');
    const response = await fetch(finalUrl);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync('/tmp/animation.mp4', Buffer.from(buffer));
    console.log('Saved to /tmp/animation.mp4');
    console.log('File size:', buffer.byteLength, 'bytes');
  } else {
    console.log('Could not find video URL');
  }

  await browser.close();
}

downloadVideo().catch(console.error);
```

Run it:
```bash
cd /tmp && npm install puppeteer && node /tmp/download-video.mjs
```

### Step 2.3: Extract Key Frames with ffmpeg

**Always extract frames** - this provides critical visual reference that improves analysis accuracy:

```bash
# Create frames directory and extract frames at 2fps
mkdir -p /tmp/animation-frames
ffmpeg -i /tmp/animation.mp4 -vf "fps=2" /tmp/animation-frames/frame_%03d.png -y

# Check how many frames were extracted
ls /tmp/animation-frames/*.png | wc -l
```

Then read the frames to understand the animation visually:
```bash
# List the frames
ls -la /tmp/animation-frames/
```

Use the Read tool to view the extracted frames. Look for:
- Visual layout and structure
- Color palette (note hex codes)
- Animation progression (what changes frame to frame)
- Element positions and sizes
- Any text content and fonts

**Why frames matter:** Gemini video analysis can miss details or hallucinate. Frames provide ground truth you can verify visually.

---

## Phase 3: Analyze with Gemini

**Best practice:** Combine frame analysis (from Step 2.3) with Gemini's video analysis:
1. First, review the extracted frames yourself to understand the animation
2. Then run Gemini for additional details (timing, easing, interactions)
3. Cross-reference Gemini's output against the frames - trust frames when they conflict

If Gemini is unavailable (503 errors after retries), you can proceed with frame analysis alone.

### Step 3.1: Run Gemini Analysis

Create and run analysis script:

```javascript
// Save as /tmp/analyze-video.mjs
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const ANALYSIS_PROMPT = `Watch this video carefully, frame by frame. Your job is to write a detailed implementation spec that another AI (Claude) will use to code this exact animation.

First, identify the animation type:
- Is it interactive (responds to mouse/touch)?
- Is it time-based (plays automatically on load)?
- Is it scroll-triggered?
- Is it a combination?

Then describe:

1. **Layout**: What is the overall structure? (single element, grid, columns, side-by-side, layers, terminal window, etc.) Describe the container and how elements are positioned relative to each other.

2. **Visual elements**: List EVERY element on screen. For each element describe: exact appearance, colors (use hex codes), position, size, font/typography if text.

3. **Animation sequence**: How does the animation progress? What changes over time? In what order do things appear/move/transform? Describe each step.

4. **Timing**: Total duration, delays between steps, easing functions (linear, ease-in-out, spring, etc.), frame rate if relevant.

5. **Trigger**: What starts the animation? (page load, mouse enter, scroll position, click, hover, etc.)

6. **Final state**: What does it look like when the animation completes? Describe the end result in detail.

Format your response as: "Build a React component that..."

Be extremely specific with:
- Colors (hex codes like #1e1e1e)
- Sizes (px or %)
- Timing (milliseconds)
- Exact text content if any
- Font styles (monospace, serif, size, weight)
- Border radius, shadows, spacing`;

async function analyzeVideo() {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const videoData = fs.readFileSync("/tmp/animation.mp4");
  const base64Video = videoData.toString("base64");

  console.log("Video size:", videoData.length, "bytes");

  const maxRetries = 3;
  const retryDelay = 5000; // 5 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Sending to Gemini (attempt ${attempt}/${maxRetries})...\n`);

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: "video/mp4",
            data: base64Video,
          },
        },
        { text: ANALYSIS_PROMPT },
      ]);

      console.log(result.response.text());
      return; // Success - exit
    } catch (err) {
      if (err.status === 503 && attempt < maxRetries) {
        console.log(`Model overloaded, retrying in ${retryDelay/1000}s...`);
        await new Promise(r => setTimeout(r, retryDelay));
      } else {
        // Don't fallback to different model - fail and let user retry later
        throw new Error(`Gemini 2.5 Flash unavailable after ${attempt} attempts: ${err.message}`);
      }
    }
  }
}

analyzeVideo().catch(err => {
  console.error(err.message);
  console.log("\nPlease try again in a few minutes when the model is less busy.");
  process.exit(1);
});
```

Run it:
```bash
cd /tmp && npm install @google/generative-ai && node /tmp/analyze-video.mjs
```

**IMPORTANT:** Gemini requires `inlineData` with base64 - it cannot fetch external URLs directly.

---

## Phase 4: Generate Animation Lab

Create a standalone React app in `/tmp/animation-lab`:

### Step 4.1: Create Project Structure

```bash
mkdir -p /tmp/animation-lab/src
```

### Step 4.2: Create package.json

```bash
cat > /tmp/animation-lab/package.json << 'EOF'
{
  "name": "animation-lab",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "framer-motion": "^11.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.2.0",
    "vite": "^5.0.0"
  }
}
EOF
```

### Step 4.3: Create Vite Config

```bash
cat > /tmp/animation-lab/vite.config.ts << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
EOF
```

### Step 4.4: Create index.html

```bash
cat > /tmp/animation-lab/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Animation Lab</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #09090b; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF
```

### Step 4.5: Create main.tsx

```bash
cat > /tmp/animation-lab/src/main.tsx << 'EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Animation } from './Animation'

function App() {
  const [iteration, setIteration] = React.useState(1)
  const [key, setKey] = React.useState(0)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#09090b', color: 'white' }}>
      <div style={{
        padding: '12px 20px',
        backgroundColor: '#18181b',
        borderBottom: '1px solid #27272a',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div>
          <span style={{ color: '#10b981', fontWeight: 600 }}>Animation Lab</span>
          <span style={{ color: '#525252', margin: '0 8px' }}>•</span>
          <span style={{ color: '#a1a1aa' }}>Iteration {iteration}</span>
        </div>
        <button
          onClick={() => setKey(k => k + 1)}
          style={{
            padding: '6px 12px',
            backgroundColor: '#27272a',
            color: '#a1a1aa',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Replay
        </button>
      </div>
      <div style={{ height: 'calc(100vh - 49px)' }}>
        <Animation key={key} />
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
EOF
```

### Step 4.6: Create Animation.tsx

Create `/tmp/animation-lab/src/Animation.tsx` with the implementation based on the Gemini spec.

### Step 4.7: Save Gemini Spec

Save the raw Gemini output to `/tmp/animation-lab/gemini-spec.md` for reference.

### Step 4.8: Install & Start

```bash
cd /tmp/animation-lab && npm install && npm run dev
```

Run this in the background or tell the user to run it.

---

## Phase 5: Present Animation Lab

After generating files, tell the user:

```
✅ Animation Lab created! (Iteration 1)

Preview at: http://localhost:5173

Compare it to the original and let me know what needs adjusting.

When you're happy with the result, run /video-to-code:export to add it to your project.
```

---

## Phase 6: Collect Feedback & Iterate

### Step 1: Check Match Quality

Use AskUserQuestion:
```
Question: "How well does the animation match the original?"
Header: "Match"
Options:
- "Perfect!" - Ready to finalize and export
- "Close, minor tweaks" - Small adjustments needed
- "Getting there" - Several things to fix
- "Way off" - Major rework needed
```

### Step 2: If Not Perfect, Get Details

Use AskUserQuestion:
```
Question: "What specifically needs adjustment?"
Header: "Adjustments"
Options (multiSelect: true):
- "Timing" - Animation speed/duration
- "Easing" - Spring feels too stiff or bouncy
- "Movement amount" - Rotates/moves too much or too little
- "Visual appearance" - Dots, colors, sizing
```

Then ask for specific details in chat.

### Common Adjustments Reference

| Issue | What to change |
|-------|----------------|
| "Too stiff" | Lower `stiffness`, increase `damping` |
| "Too bouncy" | Increase `damping`, lower `mass` |
| "Too slow" | Increase `stiffness` |
| "Too fast" | Lower `stiffness`, increase `mass` |
| "Not enough movement" | Increase `maxRotation` or movement multiplier |
| "Too much movement" | Decrease `maxRotation` or movement multiplier |
| "Dots too small" | Increase dot width/height (e.g., 2.5 → 4) |
| "Elements too small" | Increase element size (e.g., 70px → 100px) |
| "Not alive enough" | Add opacity variation, increase dot density |

### Step 3: Apply Changes

1. Update `/tmp/animation-lab/src/Animation.tsx`
2. The dev server will hot-reload automatically
3. Tell user to check the preview again
4. Repeat feedback loop

---

## Phase 7: Finalize

When user says "Perfect!" or approves:

Tell them to run `/video-to-code:export` to integrate the animation into their project.

The animation component stays in `/tmp/animation-lab/src/Animation.tsx` until exported.

---

## Abort Handling

If user says "cancel", "abort", "stop", "nevermind", or indicates they don't need it:

1. Confirm: "Got it - cleaning up."
2. Delete the temp directory:
```bash
rm -rf /tmp/animation-lab
```
3. Acknowledge: "Animation lab cleaned up."

---

## Animation Library Reference

| Animation Type | Recommended Libraries |
|----------------|----------------------|
| Parallax/mouse tracking | `framer-motion` with `useSpring` |
| Spring physics | `framer-motion`, `react-spring` |
| Complex timelines | `gsap` (GreenSock) |
| Lottie animations | `lottie-react` |
| 3D/WebGL | `@react-three/fiber` |
| Gestures | `@use-gesture/react` + `framer-motion` |

---

## Setup

### 1. Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click "Create API key"
3. Copy the key

### 2. Configure the API Key

Add to `~/.zshrc` or `~/.bashrc`:
```bash
export GEMINI_API_KEY="your-api-key-here"
```
Then `source ~/.zshrc` and restart Claude Code.

### 3. Dependencies

The skill installs these in `/tmp` as needed:
- `@google/generative-ai` - Gemini API
- `puppeteer` - Video download from authenticated URLs
- `react`, `vite`, `framer-motion` - For the standalone Animation Lab

---

## Tips

- Videos should be 5-30 seconds showing the interaction clearly
- **Always extract frames** - they provide ground truth when Gemini's analysis is unclear
- Frame extraction is especially useful for:
  - Complex animations with multiple elements
  - Precise color matching (pick hex codes directly from frames)
  - Understanding exact animation sequences
  - When Gemini gives vague or incorrect descriptions
- If Gemini is overloaded (503 errors), you can often proceed using frame analysis alone
- Gemini needs `inlineData` (base64) - it won't fetch URLs
- Use Puppeteer when direct download fails (auth errors)
- Start with Gemini's suggested values, then iterate based on feel
- Common iterations: 2-4 rounds to match the original

---

# /video-to-code:export

Export the finalized animation component from the Animation Lab into the user's project.

## When to Use

Run this after the user is happy with the animation in `/tmp/animation-lab`.

## Workflow

### 1. Verify Animation Lab Exists

```bash
ls /tmp/animation-lab/src/Animation.tsx
```

If not found, tell user to run `/video-to-code` first.

### 2. Detect Project Framework

Check for config files in the current working directory:
- `next.config.js` or `next.config.mjs` or `next.config.ts` → **Next.js**
- `vite.config.js` or `vite.config.ts` → **Vite**
- `package.json` with react → **React (generic)**

### 3. Ask Export Location

Use AskUserQuestion:
```
Question: "Where should I save the animation component?"
Header: "Location"
Options:
- "src/components/" - Components folder
- "Let me specify" - Custom path
```

### 4. Ask Component Name

Use AskUserQuestion:
```
Question: "What should the component be named?"
Header: "Name"
Options:
- "[Descriptive name based on animation]" - e.g., "AsciiLogoAnimation"
- "Animation" - Keep generic name
- "Let me specify" - Custom name
```

### 5. Copy & Adapt Component

1. Read `/tmp/animation-lab/src/Animation.tsx`
2. Copy to chosen location with chosen name
3. Adjust imports if needed (check if framer-motion is installed)
4. Add TypeScript props interface if needed

### 6. Check Dependencies

If the animation uses libraries not in the project:
```bash
# Check if framer-motion is needed and missing
grep "framer-motion" package.json
```

If missing, ask user if they want to install it.

### 7. Cleanup

```bash
rm -rf /tmp/animation-lab
```

### 8. Summary

```
✅ Animation exported!

Component: [path/ComponentName.tsx]

Usage:
import { ComponentName } from '[path]'

<ComponentName />

Animation Lab cleaned up.
```
