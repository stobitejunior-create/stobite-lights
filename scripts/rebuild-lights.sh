#!/bin/bash
# rebuild-lights ["what changed"] [minor|major|same]
# Tests, bumps the version, commits everything, pushes to GitHub (plain push, no Actions),
# then builds the Windows installer and both Mac installers into dist/ and opens the folder.
set -e
cd "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")/.." || exit 1

msg=""; bump="patch"
for a in "$@"; do
  case "$a" in minor|major|same) bump="$a" ;; *) msg="$a" ;; esac
done

echo "▸ Running tests"
npm test --silent 2>&1 | grep -E "^ℹ (tests|pass|fail)" || true
if ! npm test --silent >/dev/null 2>&1; then echo "✗ Tests failed — nothing was committed or built."; npm test 2>&1 | grep -B2 -A12 "failing tests" | head -40; exit 1; fi

[ "$bump" != "same" ] && npm version "$bump" --no-git-tag-version >/dev/null
ver=$(node -p "require('./package.json').version")

echo "▸ Committing version $ver"
git add -A
if git diff --cached --quiet; then echo "  (no changes to commit)"; else
  git commit -q -m "${msg:-Stobite Lights $ver}" -m "Version $ver"
fi
if git remote get-url origin >/dev/null 2>&1; then
  pushed=""
  for try in 1 2 3; do
    if git push -q 2>/dev/null; then pushed=1; break; fi
    sleep 4
  done
  [ -n "$pushed" ] && echo "  pushed to GitHub" || echo "  (couldn't push to GitHub; building anyway — run 'git push' in ~/Developer/Lights later)"
fi

echo "▸ Building Stobite Lights $ver (Windows, Mac Apple Silicon, Mac Intel)"
# Finder can recreate .DS_Store while we delete, so retry.
for try in 1 2 3; do rm -rf dist 2>/dev/null && break; sleep 1; done
build() { npx electron-builder "$@" 2>&1 | grep -E "⨯|error|building +target" || true; }
build --mac --arm64 --x64
build --win

echo
echo "✓ Done — Stobite Lights $ver"
ls -1 dist/*.exe dist/*.dmg 2>/dev/null | sed 's|^|   |'
open dist
