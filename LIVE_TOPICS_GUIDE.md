# Live Topics Mode

Live Topics replaces the procedural task generation with a **real-time task board** where you manually create topics and agents claim them.

## Quick Start

1. Click **🎯 Live Topics** button in the header
2. A panel opens with a topic creation form
3. Enter a **title**, optional **description**, pick a **domain**, set **difficulty** (0–1), and **reward** (50–500 credits)
4. Click **+ Create Topic**
5. Topics appear in the list below
6. Click **Assign** on a topic to select which agent claims it
7. Once an agent is working, click **✓ Success** or **✗ Failed** to resolve it

## How It Works

- **Persistent storage**: Topics are saved in your browser's session storage. They survive page reloads but clear when the tab closes.
- **Agent rewards**: Successful completions award credits, XP, and update agent stats in real-time.
- **Manual override**: You decide which agent works on what—perfect for testing strategies or exploring "what-if" scenarios.
- **Live updates**: Main dashboard (metrics, agent cards, leaderboard) refreshes when topics are resolved.

## Topic Fields

| Field | Range | Notes |
|-------|-------|-------|
| Title | Text | Required. What is the task? |
| Description | Text | Optional. Why or what's the context? |
| Domain | Category | Defaults to "General". Agents have skills in different domains. |
| Difficulty | 0–1 | Higher difficulty = higher skill requirement. Agents' success chances vary. |
| Reward | 50–500c | Credits awarded on success. |

## Status Filters

- **All** – Show all topics
- **Open** – Available, not yet claimed
- **In Progress** – Claimed by an agent, awaiting outcome
- **Completed** – Successfully resolved

## Interactive Actions

### On Open Topics
- **Assign** – Open a dialog to choose an agent. Agent name must match exactly (e.g., "Alice", "Bob").

### On In-Progress Topics
- **✓ Success** – Agent completed it. Awards full reward, updates stats.
- **✗ Failed** – Agent failed. Topic resets to "Open", 20% XP penalty (if applicable).

## Stats Panel

Real-time counter showing:
- **Total** – All topics ever created
- **Open** – Ready to be claimed
- **In Progress** – Currently being worked on
- **Completed** – Successfully resolved

## Tips

1. **Test LLM + Live Topics together** – Enable "Use LLM" and watch how Haiku picks tasks differently than deterministic logic.
2. **Vary difficulty** – Create easy (0.2), medium (0.5), and hard (0.8) topics to see how agents perform.
3. **Monitor the ticker** – The bottom-left event log shows successes/failures in real-time.
4. **Check agent cards** – After completing topics, scroll down to see updated credits, XP, and win/loss ratio.

## Example Session

```
1. Create: "Implement OAuth" | Domain: General | Difficulty: 0.7 | Reward: 150c
2. Create: "Fix typos" | Domain: General | Difficulty: 0.1 | Reward: 50c
3. Create: "Analyze dataset" | Domain: Mathematics | Difficulty: 0.6 | Reward: 120c

Agents see 3 open topics.

4. Assign "Implement OAuth" → Alice
5. Assign "Fix typos" → Bob
6. Assign "Analyze dataset" → Charlie

Monitor progress. When Alice finishes:
7. Click ✓ Success on "Implement OAuth" → Alice gets +150c, +75XP, +1 win

Now Bob and Charlie are still working while Alice can claim another topic.
```

## Keyboard Shortcuts

None yet. All interactions are button-based for simplicity.

## Troubleshooting

**"Agent not found" error when assigning?**
→ Check the exact name. Agent names are case-sensitive (e.g., "Alice" not "alice").

**Topics disappeared after refresh?**
→ Session storage is cleared on tab close. Reopen the tab and recreate them, or note them down.

**LLM not showing in Live Topics?**
→ LLM task selection works with the *simulation loop*, not manually created topics yet. Level 2 integration will add LLM support for manual topics.

---

**Next Steps**: Level 2 (LLM-powered topic suggestions + council negotiation) will integrate Haiku into the live topic workflow.
