#!/bin/bash
# Quick smoke test: verify Level 1 LLM integration files exist and have no syntax errors

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  Level 1 LLM Integration — File Verification"
echo "═══════════════════════════════════════════════════════════════"

# Check required files
files=(
  "llm-task-selector.js"
  "app.js"
  "index.html"
  "styles.css"
  "simulation.js"
  "LEVEL_1_SETUP.md"
)

for f in "${files[@]}"; do
  if [ -f "$f" ]; then
    size=$(wc -c < "$f" | awk '{print $1}')
    lines=$(wc -l < "$f" | awk '{print $1}')
    printf "  %-25s %6d bytes %5d lines  ✓\n" "$f" "$size" "$lines"
  else
    printf "  %-25s MISSING  ✗\n" "$f"
    exit 1
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  JavaScript Syntax Check"
echo "═══════════════════════════════════════════════════════════════"

# Check JS files
for js_file in llm-task-selector.js app.js; do
  echo "  Checking $js_file..."
  if node -c "$js_file" 2>/dev/null; then
    echo "    ✓ Valid JavaScript"
  else
    echo "    ✗ Syntax error"
    exit 1
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Integration Points"
echo "═══════════════════════════════════════════════════════════════"

echo "  Checking HTML includes LLM script..."
if grep -q "llm-task-selector.js" index.html; then
  echo "    ✓ Script tag present in index.html"
else
  echo "    ✗ Script tag missing"
  exit 1
fi

echo "  Checking HTML has LLM checkbox..."
if grep -q "use-llm" index.html; then
  echo "    ✓ Checkbox present in index.html"
else
  echo "    ✗ Checkbox missing"
  exit 1
fi

echo "  Checking app.js hooks LLM..."
if grep -q "useLLMTaskSelection" app.js; then
  echo "    ✓ LLM integration code present in app.js"
else
  echo "    ✗ LLM integration missing"
  exit 1
fi

echo "  Checking styles.css has LLM styles..."
if grep -q "llm-toggle" styles.css; then
  echo "    ✓ LLM styles present in styles.css"
else
  echo "    ✗ LLM styles missing"
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✓ All checks passed! Ready to test Level 1 LLM integration"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo "    1. Open index.html in your browser"
echo "    2. Check the '☐ Use LLM (Level 1)' checkbox"
echo "    3. Paste your Anthropic API key when prompted"
echo "    4. Hit Play and watch agents reason about task selection"
echo "    5. Open DevTools (F12) to see LLM reasoning in the console"
echo ""
