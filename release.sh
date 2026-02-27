#!/bin/bash
# ═══════════════════════════════════════════════
#  AI CEO Studio — One-command release script
#  Usage: bash release.sh "1.4.4" "Short description of changes"
# ═══════════════════════════════════════════════

set -e

VERSION="$1"
NOTES="$2"
REPO="pantheonmarketing/electron-app-releases"

if [ -z "$VERSION" ] || [ -z "$NOTES" ]; then
  echo "Usage: bash release.sh <version> <release-notes>"
  echo "Example: bash release.sh 1.4.4 \"Fix subtitle rendering bug\""
  exit 1
fi

echo ""
echo "══════════════════════════════════════"
echo "  Releasing AI CEO Studio v${VERSION}"
echo "══════════════════════════════════════"
echo ""

# 1. Bump version in package.json
echo "[1/6] Bumping version to ${VERSION}..."
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" package.json

# 2. Commit and push
echo "[2/6] Committing and pushing..."
git add -A
git commit -m "v${VERSION}: ${NOTES}

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin main

# 3. Build Windows exe
echo "[3/6] Building Windows exe..."
npx electron-builder --win --publish never 2>&1 | tail -5

EXE_FILE="dist/AI-CEO-Setup-${VERSION}.exe"
if [ ! -f "$EXE_FILE" ]; then
  echo "ERROR: Build failed — ${EXE_FILE} not found"
  exit 1
fi

# 4. Generate latest.yml
echo "[4/6] Generating latest.yml..."
SIZE=$(stat -c%s "$EXE_FILE" 2>/dev/null || stat -f%z "$EXE_FILE" 2>/dev/null)
SHA=$(sha512sum "$EXE_FILE" | awk '{print $1}' | xxd -r -p | base64 -w 0)
DATE=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

cat > dist/latest.yml << YMLEOF
version: ${VERSION}
files:
  - url: AI-CEO-Setup-${VERSION}.exe
    sha512: ${SHA}
    size: ${SIZE}
path: AI-CEO-Setup-${VERSION}.exe
sha512: ${SHA}
releaseDate: '${DATE}'
YMLEOF

# 5. Create GitHub release + upload
echo "[5/6] Creating GitHub release v${VERSION}..."
gh release create "v${VERSION}" "$EXE_FILE" "dist/latest.yml" \
  --repo "$REPO" \
  --title "AI CEO Studio v${VERSION}" \
  --notes "## v${VERSION}

${NOTES}"

# 6. Trigger Mac build
echo "[6/6] Triggering Mac DMG build..."
gh workflow run build-mac.yml --repo "$REPO" -f "tag=v${VERSION}"

echo ""
echo "══════════════════════════════════════"
echo "  v${VERSION} RELEASED!"
echo "  Windows: uploaded"
echo "  Mac: building on GitHub Actions"
echo "  https://github.com/${REPO}/releases/tag/v${VERSION}"
echo "══════════════════════════════════════"
