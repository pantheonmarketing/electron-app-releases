#!/bin/bash
echo ""
echo "  Starting AICO Task Manager..."
echo "  (Browser will open automatically)"
echo ""
echo "  Press Ctrl+C to stop the server."
echo ""

# Open browser (Mac or Linux)
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:3456 &
else
    xdg-open http://localhost:3456 2>/dev/null &
fi

node server.js
