#!/bin/bash
set -e

echo ""
echo "  ============================================"
echo "   AICO Task Manager - One-Time Setup"
echo "  ============================================"
echo ""
echo "  This will install everything you need."
echo "  Just follow the prompts!"
echo ""

# ── Step 1: Check / Install Node.js ──
echo "  [1/6] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo ""
    echo "  Node.js is not installed. Installing..."
    echo ""

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            echo "  Installing via Homebrew..."
            brew install node
        else
            echo "  Installing Homebrew first..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            brew install node
        fi
    else
        # Linux
        echo "  Installing via NodeSource..."
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi

    if ! command -v node &> /dev/null; then
        echo ""
        echo "  ERROR: Node.js installation failed."
        echo "  Please install manually from: https://nodejs.org"
        echo ""
        exit 1
    fi
fi
echo "  OK - Node.js $(node --version)"

# ── Step 2: Check / Install Claude CLI ──
echo "  [2/6] Checking Claude CLI..."
if ! command -v claude &> /dev/null; then
    echo ""
    echo "  Claude CLI not found. Installing via npm..."
    echo ""
    npm install -g @anthropic-ai/claude-code

    if ! command -v claude &> /dev/null; then
        echo ""
        echo "  ERROR: Claude CLI installation failed."
        echo "  Try: npm install -g @anthropic-ai/claude-code"
        echo ""
        exit 1
    fi
fi
echo "  OK - $(claude --version 2>/dev/null | head -1)"

# ── Step 3: Install app dependencies ──
echo "  [3/6] Installing app dependencies..."
npm install --silent 2>/dev/null || npm install
echo "  OK - Dependencies installed"

# ── Step 4: Create workspace folders ──
echo "  [4/6] Setting up workspace..."
mkdir -p results logs uploads reel-projects reel-presets whisper-cache
[ ! -f tasks.json ] && echo '[]' > tasks.json
[ ! -f templates.json ] && echo '{"templates":[],"routines":[]}' > templates.json
[ ! -f projects.json ] && echo '[]' > projects.json
echo "  OK - Workspace ready"

# ── Step 5: Log in to Claude ──
echo "  [5/6] Claude Login..."
echo ""
echo "  -----------------------------------------------"
echo "   You need to log in to your Claude Max account"
echo "  -----------------------------------------------"
echo ""
echo "  A browser window will open. Log in with the"
echo "  account that has your Claude Max subscription."
echo ""
read -p "  Ready to log in? (y/n): " DO_LOGIN
if [[ "$DO_LOGIN" == "y" || "$DO_LOGIN" == "Y" ]]; then
    claude login || true
    echo "  OK - Login complete!"
else
    echo "  Skipped. Run later: claude login"
fi

# ── Step 6: Enable autonomous mode ──
echo "  [6/6] Enabling autonomous mode..."
echo ""
echo "  -----------------------------------------------"
echo "   One last thing!"
echo "  -----------------------------------------------"
echo ""
echo "  The task manager needs Claude to run without"
echo "  asking permission for every single action."
echo ""
echo "  Type 'y' when it asks about trusting files,"
echo "  then press Ctrl+C to close."
echo ""
read -p "  Ready? (y/n): " ENABLE_AUTO
if [[ "$ENABLE_AUTO" == "y" || "$ENABLE_AUTO" == "Y" ]]; then
    claude --dangerously-skip-permissions || true
    echo "  OK - Autonomous mode enabled!"
else
    echo "  Skipped. Run later: claude --dangerously-skip-permissions"
fi

# ── Done! ──
echo ""
echo "  ============================================"
echo "   Setup Complete!"
echo "  ============================================"
echo ""
echo "  TO USE THE APP:"
echo ""
echo "    ./start.sh"
echo ""
echo "  That's it! A browser window will open"
echo "  automatically with the task manager."
echo ""
echo "  ============================================"
echo ""
