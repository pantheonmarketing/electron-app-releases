const express = require('express');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const shared = require('../lib/shared');
const { shellEscape } = require('../lib/helpers');
const router = express.Router();

router.post('/scripter/generate', (req, res) => {
  const { framework, topic, rewriteScript, mode, voice, durationSecs } = req.body;
  if (!framework || !topic) return res.status(400).json({ error: 'Framework and topic required' });
  const startTime = Date.now();
  const scriptMode = mode || 'ads';
  const targetSecs = durationSecs || 30;
  const wordsLow = Math.round(targetSecs * 2.5);
  const wordsHigh = Math.round(targetSecs * 3);
  let frameworksPath = path.join(shared.BASE_DIR, 'skills', 'scripter-frameworks.md');
  if (!fs.existsSync(frameworksPath)) frameworksPath = path.join(shared.APP_DIR, 'skills', 'scripter-frameworks.md');
  if (!fs.existsSync(frameworksPath)) return res.status(500).json({ error: 'Frameworks file not found' });
  const frameworksDoc = fs.readFileSync(frameworksPath, 'utf-8');
  const modeInstruction = scriptMode === 'social'
    ? `Generate a viral SOCIAL MEDIA script (organic content for TikTok/Reels/Shorts) using the "${framework}" style.\n\nThis is NOT an ad. The goal is maximum watch time, saves, shares, and comments — NOT selling a product.\n- NO product pitch, NO "link in bio", NO sales CTA\n- End with an ENGAGEMENT prompt: a question, challenge, hot take, "comment if...", or cliffhanger that makes people respond\n- Structure for retention: strong hook (first 2 seconds), curiosity loop or escalating value, satisfying payoff\n- Feel like real content a creator would post, not a brand`
    : `Generate a complete video ad script using the "${framework}" framework.`;
  let userPrompt = `${modeInstruction}\n\nTopic${scriptMode === 'ads' ? '/Product' : ''}: ${topic}\n\nTARGET LENGTH: ${targetSecs} seconds (~${wordsLow}-${wordsHigh} words). This is important — write the script body to fit this duration when read aloud at a natural pace.`;
  if (voice) {
    userPrompt += `\n\nVOICE/PERSONA: Write the entire script in this voice and tone:\n${voice}\nMatch the word choice, slang, sentence structure, and energy of this persona. The script should sound like THIS person actually wrote and would say it — not a generic AI voice.`;
  }
  if (rewriteScript) {
    userPrompt += `\n\nREWRITE MODE: Take the following existing script and rewrite it using the "${framework}" ${scriptMode === 'social' ? 'style' : 'framework structure'}. Preserve the best hooks and proof points but restructure the flow to follow the ${scriptMode === 'social' ? 'style' : 'framework'} exactly.\n\nExisting script to rewrite:\n---\n${rewriteScript}\n---`;
  }
  userPrompt += `\n\nOutput the script in the exact format specified in the system prompt. Include 5 hook variations and all ${scriptMode === 'social' ? 'sections' : 'framework sections'}.${scriptMode === 'social' ? ' Use ENGAGEMENT: instead of CTA: for the ending.' : ''}`;
  const fullPrompt = `<system>\n${frameworksDoc}\n</system>\n\n<user>\n${userPrompt}\n</user>`;
  const promptFile = path.join(shared.LOGS_DIR, `scripter-prompt-${Date.now()}.txt`);
  fs.writeFileSync(promptFile, fullPrompt);
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;
  const escapedPromptFile = shellEscape(promptFile);
  const catCmd = process.platform === 'win32' ? 'type' : 'cat';
  const cmd = `${catCmd} ${escapedPromptFile} | claude -p --dangerously-skip-permissions --output-format text --model sonnet --max-turns 1`;
  console.log(`[Scripter] Generating ${scriptMode}/${framework}/${targetSecs}s script for: "${topic.slice(0, 60)}..."`);
  try {
    const output = execSync(cmd, {
      env: cleanEnv, cwd: shared.BASE_DIR, shell: true, encoding: 'utf-8',
      timeout: 2 * 60 * 1000, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
    });
    const genTime = Date.now() - startTime;
    console.log(`[Scripter] Script generated in ${genTime}ms`);
    res.json({ ok: true, script: output.trim(), framework, topic, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[Scripter] Generation failed:', err.message);
    const details = err.stdout ? err.stdout.slice(0, 500) : err.message;
    res.status(500).json({ ok: false, error: 'Script generation failed', details });
  } finally {
    try { fs.unlinkSync(promptFile); } catch (_) {}
  }
});

router.post('/scripter/transcribe', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  const startTime = Date.now();
  const tmpId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const tmpDir = path.join(shared.WHISPER_CACHE_DIR, tmpId);
  fs.mkdirSync(tmpDir, { recursive: true });
  const audioFile = path.join(tmpDir, 'audio.wav');
  console.log(`[Transcribe] Downloading audio from: ${url.slice(0, 80)}...`);
  const runCmd = (cmd, opts) => new Promise((resolve, reject) => {
    const { exec: execCb } = require('child_process');
    execCb(cmd, opts, (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; return reject(err); }
      resolve({ stdout, stderr });
    });
  });
  try {
    await new Promise((resolve, reject) => {
      const ytdlp = spawn('yt-dlp', ['-x', '--audio-format', 'wav', '--no-playlist', '-o', audioFile, url], {
        cwd: tmpDir, shell: false, windowsHide: true, timeout: 120 * 1000
      });
      let stderr = '';
      ytdlp.stderr.on('data', d => { stderr += d.toString(); });
      ytdlp.on('close', code => {
        if (code === 0) resolve();
        else { const err = new Error(`yt-dlp exited with code ${code}`); err.stderr = stderr; reject(err); }
      });
      ytdlp.on('error', reject);
    });
    let actualAudio = audioFile;
    if (!fs.existsSync(audioFile)) {
      const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.wav'));
      if (files.length > 0) actualAudio = path.join(tmpDir, files[0]);
      else throw new Error('Audio download failed — no .wav file produced');
    }
    const dlTime = Date.now() - startTime;
    console.log(`[Transcribe] Downloaded in ${dlTime}ms, transcribing with faster-whisper...`);
    let transcribeScript = path.join(shared.BASE_DIR, 'transcribe.py');
    if (!fs.existsSync(transcribeScript)) transcribeScript = path.join(shared.APP_DIR, 'transcribe.py');
    const whisperCmd = `python "${transcribeScript}" "${actualAudio}" base`;
    const whisperEnv = { ...process.env, PYTHONIOENCODING: 'utf-8' };
    const { stdout: whisperOut } = await runCmd(whisperCmd, {
      cwd: tmpDir, shell: true, encoding: 'utf-8',
      timeout: 5 * 60 * 1000, windowsHide: true, env: whisperEnv, maxBuffer: 10 * 1024 * 1024
    });
    const result = JSON.parse(whisperOut.trim());
    if (!result.ok) throw new Error(result.error || 'Transcription failed');
    const transcript = result.transcript;
    const totalTime = Date.now() - startTime;
    console.log(`[Transcribe] Done in ${totalTime}ms — ${transcript.length} chars (lang: ${result.language})`);
    res.json({ ok: true, transcript, url, language: result.language, duration_ms: totalTime });
  } catch (err) {
    console.error('[Transcribe] Failed:', err.message?.slice(0, 300));
    const details = err.stderr ? err.stderr.slice(0, 500) : err.message;
    res.status(500).json({ ok: false, error: 'Transcription failed', details });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

module.exports = router;
