#!/bin/bash
# Knowledge Trading Agents — Deployment Verification Script
# Run this before going live to ensure all components are present and valid

set -e

PROJECT_DIR="."
REQUIRED_FILES=(
  "index.html"
  "styles.css"
  "simulation.js"
  "app.js"
  "live-topics.js"
  "llm-task-selector.js"
  "README.md"
  "PROJECT_REVIEW.md"
)

OPTIONAL_FILES=(
  "obsidian-integration.js"
  "GENERATION_FLOW.md"
  "HERMES_LLM_INTEGRATION.md"
  "LEVEL_1_SETUP.md"
  "LEVEL_1_SUMMARY.md"
  "LIVE_TOPICS_GUIDE.md"
  "LIVE_TOPICS_SUMMARY.md"
)

echo "🔍 Knowledge Trading Agents — Deployment Verification"
echo "======================================================="
echo ""

# Check required files
echo "✓ Checking required files..."
for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$PROJECT_DIR/$file" ]; then
    size=$(wc -c < "$PROJECT_DIR/$file")
    printf "  ✓ %30s (%d bytes)\n" "$file" "$size"
  else
    echo "  ✗ MISSING: $file"
    exit 1
  fi
done
echo ""

# Check optional files
echo "✓ Checking optional documentation..."
for file in "${OPTIONAL_FILES[@]}"; do
  if [ -f "$PROJECT_DIR/$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ○ (optional) $file"
  fi
done
echo ""

# Syntax check JavaScript
echo "✓ Verifying JavaScript syntax..."
for file in simulation.js llm-task-selector.js live-topics.js app.js; do
  if node -c "$PROJECT_DIR/$file" 2>&1 | grep -q "Error"; then
    echo "  ✗ SYNTAX ERROR in $file"
    exit 1
  else
    echo "  ✓ $file"
  fi
done
echo ""

# Check HTML structure
echo "✓ Checking HTML structure..."
script_count=$(grep -c '<script src' "$PROJECT_DIR/index.html")
if [ "$script_count" -eq 4 ]; then
  echo "  ✓ All 4 script includes present"
else
  echo "  ✗ Expected 4 script tags, found $script_count"
  exit 1
fi

if grep -q 'id="btn-play"' "$PROJECT_DIR/index.html"; then
  echo "  ✓ Control buttons present"
else
  echo "  ✗ Control buttons missing"
  exit 1
fi

if grep -q 'id="live-topics-panel"' "$PROJECT_DIR/index.html"; then
  echo "  ✓ Live Topics panel present"
else
  echo "  ✗ Live Topics panel missing"
  exit 1
fi

if grep -q 'id="use-llm"' "$PROJECT_DIR/index.html"; then
  echo "  ✓ LLM checkbox present"
else
  echo "  ✗ LLM controls missing"
  exit 1
fi
echo ""

# Check CSS
echo "✓ Checking stylesheet..."
if [ -f "$PROJECT_DIR/styles.css" ]; then
  rule_count=$(grep -c '^[.#]' "$PROJECT_DIR/styles.css")
  echo "  ✓ styles.css present ($rule_count CSS rules)"
else
  echo "  ✗ styles.css missing"
  exit 1
fi
echo ""

# Check git status
echo "✓ Checking repository status..."
if [ -d .git ]; then
  status=$(git status --short)
  if [ -z "$status" ]; then
    echo "  ✓ Working tree clean"
  else
    echo "  ⚠ Uncommitted changes:"
    echo "$status" | sed 's/^/    /'
  fi
  commit_count=$(git rev-list --count HEAD)
  echo "  ✓ $commit_count commits in history"
else
  echo "  ○ Not a git repository (optional for local testing)"
fi
echo ""

# Summary
total_size=$(du -sh . | cut -f1)
js_lines=$(wc -l *.js 2>/dev/null | tail -1 | awk '{print $1}')
echo "📊 Summary"
echo "=========="
printf "  Project size: %s\n" "$total_size"
printf "  JavaScript: %s lines\n" "$js_lines"
printf "  Status: ✅ READY FOR DEPLOYMENT\n"
echo ""

echo "🚀 To run locally:"
echo "  1. cd /c/Users/staff/anthropicFun/knowledge-trading-agents"
echo "  2. python -m http.server 8765"
echo "  3. Open http://localhost:8765/index.html"
echo ""
