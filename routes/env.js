const express = require('express');
const fs = require('fs');
const path = require('path');
const shared = require('../lib/shared');
const router = express.Router();

const getUserEnvFile = () => path.join(shared.BASE_DIR, 'user-env.json');

router.get('/env', (req, res) => {
  try {
    const USER_ENV_FILE = getUserEnvFile();
    const userVars = fs.existsSync(USER_ENV_FILE) ? JSON.parse(fs.readFileSync(USER_ENV_FILE, 'utf-8')) : {};
    const dotenvPath = path.join(shared.BASE_DIR, '.env');
    let dotenvVars = {};
    if (fs.existsSync(dotenvPath)) {
      const lines = fs.readFileSync(dotenvPath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) dotenvVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
      }
    }
    const allVars = { ...dotenvVars, ...userVars };
    const masked = {};
    const sources = {};
    for (const [k, v] of Object.entries(allVars)) {
      masked[k] = v.length > 8 ? v.slice(0, 4) + '...' + v.slice(-4) : '****';
      sources[k] = userVars[k] ? 'settings' : 'dotenv';
    }
    res.json({ vars: masked, sources });
  } catch (_) { res.json({ vars: {}, sources: {} }); }
});

router.put('/env', (req, res) => {
  const { key, value } = req.body;
  if (!key || typeof key !== 'string') return res.status(400).json({ error: 'Key required' });
  const envKey = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  try {
    const USER_ENV_FILE = getUserEnvFile();
    const vars = fs.existsSync(USER_ENV_FILE) ? JSON.parse(fs.readFileSync(USER_ENV_FILE, 'utf-8')) : {};
    if (value === null || value === '') {
      delete vars[envKey];
      delete process.env[envKey];
    } else {
      vars[envKey] = String(value).trim();
      process.env[envKey] = vars[envKey];
    }
    fs.writeFileSync(USER_ENV_FILE, JSON.stringify(vars, null, 2));
    res.json({ ok: true, key: envKey });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/env/:key', (req, res) => {
  const envKey = req.params.key.trim().toUpperCase();
  try {
    // Remove from user-env.json
    const USER_ENV_FILE = getUserEnvFile();
    const vars = fs.existsSync(USER_ENV_FILE) ? JSON.parse(fs.readFileSync(USER_ENV_FILE, 'utf-8')) : {};
    delete vars[envKey];
    fs.writeFileSync(USER_ENV_FILE, JSON.stringify(vars, null, 2));

    // Also remove from .env file if present
    const dotenvPath = path.join(shared.BASE_DIR, '.env');
    if (fs.existsSync(dotenvPath)) {
      const lines = fs.readFileSync(dotenvPath, 'utf-8').split('\n');
      const filtered = lines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return true;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) return true;
        return trimmed.slice(0, eqIdx).trim() !== envKey;
      });
      fs.writeFileSync(dotenvPath, filtered.join('\n'));
    }

    delete process.env[envKey];
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
