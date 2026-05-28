# Level 1 LLM Integration — Quick Start

**What it does:**
- LLM task selection replaces the deterministic "pick highest expected value task" logic
- Each agent asks Claude: "Given my strategy and skills, which task should I attempt?"
- Claude reasons about success probability, strategy alignment, and learning goals

**Cost estimate:**
- ~$4-6 per 1000-round simulation run
- 20k LLM calls × 300 tokens average = 6M tokens
- Using Haiku ($0.80/1M input tokens)

## Setup

1. **Get an API key:**
   - Go to https://console.anthropic.com/account/keys
   - Create a new API key
   - Copy it to your clipboard

2. **Enable in dashboard:**
   - Open `index.html` in browser
   - Check the ☐ "Use LLM (Level 1)" checkbox
   - Paste your API key when prompted
   - The key is stored locally in browser, never uploaded

3. **Watch it work:**
   - Press Play
   - Open browser DevTools (F12 → Console tab)
   - You'll see:
     ```
     ✓ LLM chose task for Alice: "Debug Database"
     ✓ LLM chose task for Bob: "Implement Feature"
     ```

4. **Check costs:**
   - Click the 📊 LLM Stats button
   - Prints token count and estimated cost to console

## Files Added

- `llm-task-selector.js` — LLM task selection logic (280 lines)
- Updated `index.html` — checkbox + stats button
- Updated `app.js` — hooks LLM into `sim._attemptTask()`
- Updated `styles.css` — styling for controls

## How Agents Think

Each agent sees this context:

```
You are Alice, a Specialist learner.

Your state:
- Strategy: Specialist
- Credits: 450
- Skill avg: 45
- Top domains: Mathematics, Physics
- Success rate: 68%

Available tasks (formatted with difficulty, requirements, rewards):
1. "Debug Database" — 52% success chance, +180c reward
2. "Implement Feature" — 73% success chance, +120c reward
3. "Write Documentation" — 15% success chance, +80c reward

Pick ONE task or SKIP.
```

The agent then responds: `PICK #2` (plus reasoning).

## Fallback Behavior

If LLM fails (API error, timeout, invalid response):
- Falls back to deterministic task selection automatically
- No manual intervention needed
- Console logs the error

## Limitations (Level 1)

- ✓ Agents reason about task selection
- ✗ Agents don't negotiate or form coalitions
- ✗ Agents don't have memory across rounds
- ✗ Agents don't coordinate with other agents

See `HERMES_LLM_INTEGRATION.md` for Level 2 (negotiation) and Level 3 (subagents).

## Troubleshooting

**"API key rejected"**
- Check https://console.anthropic.com/usage/ for valid keys
- Verify you're using a recent API key (not an old one)

**"LLM Stats button doesn't show"**
- Make sure the checkbox is checked
- Refresh the page

**"Calls are slow"**
- Haiku is ~0.5-1s per call, so gameplay will be slow with LLM enabled
- Increase speed slider to compensate

**"Getting weird task picks"**
- This is expected! The LLM is reasoning, not always picking optimal
- This creates more interesting simulation dynamics than deterministic logic
