@echo off
setlocal enabledelayedexpansion
title AICO Task Manager - Setup
color 0A

echo.
echo  ============================================
echo   AICO Task Manager - One-Time Setup
echo  ============================================
echo.
echo  This will install everything you need.
echo  Just follow the prompts!
echo.

:: ── Step 1: Check / Install Node.js ──
echo  [1/6] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  Node.js is not installed. Installing now...
    echo.

    :: Try winget first (Windows 10/11 built-in)
    winget --version >nul 2>&1
    if not errorlevel 1 (
        echo  Installing via winget (this may take 2-3 minutes^)...
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
        if errorlevel 1 (
            echo.
            echo  Winget install failed. Trying alternative method...
            goto :node_manual
        )
        :: Refresh PATH so node is available in this session
        set "PATH=%PATH%;%ProgramFiles%\nodejs;%APPDATA%\npm"
        :: Verify
        node --version >nul 2>&1
        if errorlevel 1 (
            echo.
            echo  Node.js was installed but needs a terminal restart.
            echo  Please CLOSE this window and double-click setup.bat again.
            echo.
            pause
            exit /b 0
        )
        for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
        echo  OK - Node.js !NODE_VER! installed!
    ) else (
        :node_manual
        color 0E
        echo.
        echo  -----------------------------------------------
        echo   Cannot auto-install Node.js
        echo  -----------------------------------------------
        echo.
        echo  Please install manually:
        echo    1. Go to: https://nodejs.org
        echo    2. Click the big green "LTS" button
        echo    3. Run the installer (keep all defaults^)
        echo    4. CLOSE this window and run setup.bat again
        echo.
        echo  Opening nodejs.org in your browser...
        start https://nodejs.org
        echo.
        pause
        exit /b 1
    )
) else (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
    echo  OK - Node.js !NODE_VER! already installed
)

:: ── Step 2: Check / Install Claude CLI ──
echo  [2/6] Checking Claude CLI...
claude --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  Claude CLI not found. Installing via npm...
    echo  (This may take 1-2 minutes^)
    echo.
    call npm install -g @anthropic-ai/claude-code 2>nul
    if errorlevel 1 (
        echo.
        echo  Retrying installation...
        call npm install -g @anthropic-ai/claude-code
    )

    :: Refresh PATH
    set "PATH=%PATH%;%APPDATA%\npm"

    claude --version >nul 2>&1
    if errorlevel 1 (
        color 0E
        echo.
        echo  -----------------------------------------------
        echo   Claude CLI installed but needs a restart
        echo  -----------------------------------------------
        echo.
        echo  Please CLOSE this window and run setup.bat again.
        echo.
        pause
        exit /b 0
    )
    for /f "tokens=*" %%i in ('claude --version') do set CLAUDE_VER=%%i
    echo  OK - Claude CLI !CLAUDE_VER! installed!
) else (
    for /f "tokens=*" %%i in ('claude --version') do set CLAUDE_VER=%%i
    echo  OK - Claude CLI !CLAUDE_VER! already installed
)

:: ── Step 3: Install app dependencies ──
echo  [3/6] Installing app dependencies...
call npm install --silent 2>nul
if errorlevel 1 (
    echo  Retrying...
    call npm install
)
echo  OK - Dependencies installed

:: ── Step 4: Create workspace folders ──
echo  [4/6] Setting up workspace...
if not exist results mkdir results
if not exist logs mkdir logs
if not exist uploads mkdir uploads
if not exist reel-projects mkdir reel-projects
if not exist reel-presets mkdir reel-presets
if not exist whisper-cache mkdir whisper-cache
if not exist tasks.json (
    echo [] > tasks.json
)
if not exist templates.json (
    echo {"templates":[],"routines":[]} > templates.json
)
if not exist projects.json (
    echo [] > projects.json
)
echo  OK - Workspace ready

:: ── Step 5: Log in to Claude ──
echo  [5/6] Claude Login...
echo.
echo  -----------------------------------------------
echo   You need to log in to your Claude Max account
echo  -----------------------------------------------
echo.
echo  A browser window will open. Log in with the
echo  account that has your Claude Max subscription.
echo.
echo  After logging in, come back to this window.
echo.
set /p DO_LOGIN="  Ready to log in? (y/n): "
if /i "!DO_LOGIN!"=="y" (
    echo.
    echo  Opening Claude login... (come back here after^)
    start /wait cmd /c "claude login"
    echo.
    echo  OK - Login complete!
) else (
    echo.
    echo  Skipped. Run this later:  claude login
)

:: ── Step 6: Enable autonomous mode ──
echo  [6/6] Enabling autonomous mode...
echo.
echo  -----------------------------------------------
echo   One last thing!
echo  -----------------------------------------------
echo.
echo  The task manager needs Claude to run without
echo  asking permission for every single action.
echo.
echo  A Claude window will open. Just type "y" when
echo  it asks about trusting files, then press Ctrl+C.
echo.
set /p ENABLE_AUTO="  Ready? (y/n): "
if /i "!ENABLE_AUTO!"=="y" (
    start /wait cmd /c "claude --dangerously-skip-permissions"
    echo  OK - Autonomous mode enabled!
) else (
    echo.
    echo  Skipped. Run later:  claude --dangerously-skip-permissions
)

:: ── Done! ──
color 0A
echo.
echo  ============================================
echo   Setup Complete!
echo  ============================================
echo.
echo  TO USE THE APP:
echo.
echo    Double-click  start.bat
echo.
echo  That's it! A browser window will open
echo  automatically with the task manager.
echo.
echo  ============================================
echo.
pause
