#!/usr/bin/env bash
# Installs git hooks for this repo. Run once after cloning.
set -euo pipefail

HOOKS_DIR="$(git rev-parse --git-dir)/hooks"

cat > "$HOOKS_DIR/pre-push" << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

echo "Running pre-push checks..."

echo "[1/6] TypeScript type check..."
npx tsc --noEmit
echo "  ✓ No type errors"

echo "[2/6] Tests with coverage (threshold: 90%)..."
EXPO_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
  npm test -- --coverage --ci --forceExit
echo "  ✓ All tests pass, coverage ≥ 90%"

echo "[3/6] Expo doctor..."
EXPO_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
  npx expo-doctor 2>&1 | tail -3
echo "  ✓ No Expo issues"

echo "[4/6] Grafana dashboard validation..."
node scripts/validate-grafana-dashboard.js
echo "  ✓ Grafana dashboard valid"

echo "[5/6] Checking for committed .env files..."
TRACKED=$(git ls-files | grep -E '^\.env$|^\.env\.[^e]|^\.env\.local$' || true)
if [ -n "$TRACKED" ]; then
  echo "  ERROR: .env file(s) are tracked by git:"
  echo "$TRACKED"
  echo "  Remove with: git rm --cached <file>"
  exit 1
fi
echo "  ✓ No .env files tracked by git"

echo "[6/6] Secret scan (gitleaks)..."
if ! command -v gitleaks &>/dev/null; then
  echo "  ERROR: gitleaks not installed. Install with: brew install gitleaks"
  exit 1
fi
gitleaks detect --source . --verbose --redact --exit-code 1
echo "  ✓ Working tree clean"
gitleaks git --verbose --redact --exit-code 1
echo "  ✓ Git history clean"

echo "All pre-push checks passed."
EOF

chmod +x "$HOOKS_DIR/pre-push"
echo "pre-push hook installed."
