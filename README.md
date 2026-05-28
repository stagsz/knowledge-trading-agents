# Knowledge Trading Agents

Five AI agents discover tasks, build skills, trade knowledge, deliberate on shared goals, and produce value together — all running in a single HTML file with no install, no backend, no build step.

---

## Quick start

```
open index.html
```

That's it. Any modern browser works.

---

## Controls

| Control | What it does |
|---------|-------------|
| Play / Pause | Run the simulation continuously |
| Step | Advance exactly one round |
| Reset | Start fresh with a new random seed |
| Live Topics | Switch to manual task board mode |
| Force deadlock | (Dev) Trigger a council deadlock on demand |
| Speed | Slider from slow to fast |

---

## The agents

Five agents — **Atlas, Nova, Echo, Sage, Orion** — each hold a skill level (0–100) across six domains: **Data, Vision, Language, Reasoning, Coding, Planning**. They also hold credits, a knowledge inventory, experience, and a record of value produced.

Each agent follows one of five learning strategies, which it can switch based on performance:

| Strategy | Behaviour |
|----------|-----------|
| Specialist | Doubles down on its strongest domain; sells that expertise |
| Generalist | Spreads learning evenly; takes whatever task fits |
| Explorer | Invests in weakest domains; buys knowledge to fill gaps |
| Trader | Accumulates and resells knowledge for profit |
| Imitator | Studies the current leader and mirrors their focus |

---

## Each round

1. **Council** — if no goal is active, agents convene and vote on one
2. **Tasks spawn** — a pool of tasks appears, each requiring certain skills and paying credits, XP, and sometimes knowledge
3. **Self-evaluation** — every agent reviews its success rate and may switch strategy
4. **Work** — each agent attempts the best available task; success and failure both teach (diminishing returns near mastery)
5. **Marketplace** — agents sell expertise and buy knowledge that fills their gaps; knowledge is copied, not consumed, so it diffuses across the network
6. **Continuous improvement** — every agent practises its focus domain and refines tradeable knowledge artifacts
7. **Progress** — goal progress updates; completing or missing a goal triggers a fresh council

---

## The council

When no goal is active, agents vote on a **Topic + Goal** to pursue together.

Each agent runs an internal three-way debate before voting:

- **Advocate** — argues for the topic that best serves self-interest
- **Critic** — pushes back for the collective good
- **Arbiter** — weighs both and commits a vote with a confidence level

Votes are weighted by net worth and run through persuasion rounds. The result is always one of:

| Outcome | Condition | What happens |
|---------|-----------|-------------|
| Consensus | ≥ 60% weighted vote | Goal set automatically |
| Majority | Clear lead, no consensus | Goal set automatically |
| Deadlock | Near-tie persuasion can't break | Simulation pauses — you pick |

Deadlock occurs ~9% of the time naturally, or on demand via **Force deadlock**.

---

## Value and deliverables

Completing a goal ships a versioned deliverable (e.g. "Vision Model v3"). Its value is calculated from:

- Network skill and pooled knowledge in the goal's domain
- Early-finish bonus
- Consensus premium

A missed goal still ships a lower-value draft — the collective always produces something. Top contributors earn a credit dividend; their net worth and leaderboard rank update accordingly.

---

## Dashboard panels

| Panel | Contents |
|-------|----------|
| Metrics | Value created, goals fulfilled, knowledge trades, tasks solved, average skill |
| Council | Active mission + progress bar, vote breakdown, per-agent sub-agency transcript |
| Value portfolio | Shipped and draft deliverables with contributor credits |
| Knowledge network | Agents on a ring; animated arcs show knowledge flow; node glow = net worth |
| Leaderboard & activity | Net-worth ranking and live event ticker |
| Agent cards | Per-agent skills, knowledge inventory, recent activity, net-worth sparkline |

---

## Modes

### Default (deterministic)

The base engine uses rule-based decision logic — no external calls. Runs are fully reproducible for a given seed.

### Live Topics

Click **Live Topics** to replace procedural task generation with a manual board. You create topics; agents claim them; you resolve outcomes.

| Field | Range | Notes |
|-------|-------|-------|
| Title | text | Required |
| Description | text | Optional |
| Domain | category | Defaults to "General" |
| Difficulty | 0–1 | Higher = harder; affects success probability |
| Reward | 50–500c | Credits on success |

Topics persist in `sessionStorage` for the lifetime of the tab. Use **Assign** to route a topic to a specific agent, then **Success / Failed** to resolve it. The dashboard updates live.

### LLM task selection (Level 1)

`llm-task-selector.js` replaces the deterministic EV calculation with a Claude API call. Each agent receives a prompt with its current skills, credits, strategy, and the task pool, then picks a task with a short rationale.

**Enable:**

```js
sim.useLLMTaskSelection = true;
```

Or check **Use LLM (Level 1)** in the UI. The API key is stored in `localStorage` (`llm_api_key`) and prompted once on first use.

**Cost estimate:** ~300 tokens per call × 5 agents × 4 decisions/round × 1 000 rounds ≈ **$4.80 on Claude Haiku** per full run. The selector caches responses and tracks token usage; click **LLM Stats** to see live totals.

Fallback to deterministic is automatic on any API error — the simulation never halts.

See `HERMES_LLM_INTEGRATION.md` for the full roadmap (Level 2: council negotiation via LLM; Level 3: subagent autonomy).

---

## Obsidian integration

`obsidian-integration.js` auto-saves key simulation events to an Obsidian vault.

**Captured events:** simulation start/stop · goal completions and failures · agent strategy switches · deadlock resolutions · aggregate marketplace activity · agent net-worth milestones

```js
obsidianIntegration.init(sim, 'C:/path/to/vault');
```

---

## File structure

```
index.html              page structure and LLM controls
styles.css              dashboard styling
simulation.js           core engine: agents, tasks, trading, council, value
app.js                  dashboard rendering, controls, LLM integration hook
live-topics.js          manual topic board
llm-task-selector.js    Level 1 LLM task selection
obsidian-integration.js event logger to Obsidian vault
```

---

## Notes

- **Deterministic by default** — the engine is seeded; Reset picks a new seed. Runs are reproducible.
- **No external dependencies** — base simulation runs entirely offline.
- **LLM is opt-in** — `llm-task-selector.js` wraps the engine without modifying core logic; disable at any time.
- **Marketplace equilibrium** — trades slow naturally as skills converge late in a run; Reset restarts a livelier phase.
