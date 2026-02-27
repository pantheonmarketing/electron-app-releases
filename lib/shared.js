/**
 * lib/shared.js — Shared state object populated by server.js at startup.
 * All route files import this to access paths, helpers, and runtime state.
 */

const state = {
  // Paths (set by server.js)
  BASE_DIR: '',
  APP_DIR: '',
  TASKS_FILE: '',
  SKILLS_FILE: '',
  PROJECTS_FILE: '',
  TEMPLATES_FILE: '',
  RESULTS_DIR: '',
  LOGS_DIR: '',
  WORKFLOW_RUNS_FILE: '',
  UPLOADS_DIR: '',
  REEL_PROJECTS_DIR: '',
  REEL_PRESETS_DIR: '',
  WHISPER_CACHE_DIR: '',
  HEYGEN_PROJECTS_DIR: '',
  HEYGEN_CONFIG_FILE: '',
  STORY_PROJECTS_DIR: '',
  STORY_PRESETS_DIR: '',
  SCHEDULES_FILE: '',
  FFMPEG_BIN: 'ffmpeg',

  // Platform
  IS_WIN: process.platform === 'win32',
  IS_MAC: process.platform === 'darwin',

  // Runtime state
  activeWorkers: new Map(),
  whisperJobs: new Map(),

  // References (set by server.js)
  terminalManager: null,
  reelUpload: null,

  // Functions (set by server.js)
  launchWorkerProcess: null,
  killProcessTree: null,
  openInFolder: null,
  getAppDataDir: null,
  getLicenseTier: null,
  checkTool: null,
};

module.exports = state;
