# Knowledge Trading Agents

A self-contained, zero-build visual simulation of five AI agents that discover
tasks, build skills, trade knowledge with one another, deliberate to agree on a
shared goal, and produce value together.

There is no install step, no backend, and no network access required for the
base simulation. The whole thing is plain HTML/CSS/JavaScript with a
deterministic, seeded engine.

## Running it

Open `index.html` in any modern browser. That's it.

```
knowledge-trading-agents/
  index.html              # page structure
  styles.css              # dashboard styling
  simulation.js           # the engine (agents, tasks, trading, council, value)
  app.js                  # dashboard rendering + controls
  live-topics.js          # manual topic board (replaces procedural tasks)
  llm-task-selector.js    # Level 1 LLM integration: agent task selection via API
  obsidian-integration.js # auto-saves simulation events to an Obsidian vault
```

Use the controls at the top:

- **Play / Pause** — run the simulation continuously.
- **Step** — advance exactly one round.
- **Reset** — start a fresh run with a new random seed.
- **Live Topics** — open the manual topic board (see below).
- **Force deadlock** — (dev) make the council deadlock on demand to exercise the
  operator-decision flow without waiting for a natural near-tie.
- **Speed** — slider from slow to fast.

## The agents

Five agents — **Atlas, Nova, Echo, Sage, Orion** — each hold a skill level
(0–100) in six domains: **Data, Vision, Language, Reasoning, Coding, Planning**.
They also hold credits, an inventory of tradeable knowledge, experience, and a
record of the value they have helped produce.

Each agent follows a **learning technique** that governs how it picks tasks,
what it learns, and what it trades. It re-evaluates and can switch technique
based on its own performance:

- **Specialist** — doubles down on its strongest domain and sells that expertise.
- **Generalist** — spreads learning evenly and takes whatever task fits.
- **Explorer** — invests in its weakest domains and buys knowledge to fill gaps.
- **Trader** — accumulates and resells knowledge for profit.
- **Imitator** — studies the current leader and learns the same domains.

## What happens each round

1. **Council** — if there is no active shared goal, the agents convene and agree
   on one (see below).
2. **Tasks spawn** — a pool of tasks appears, each needing certain skills at
   certain levels and paying credits, experience, and sometimes knowledge.
3. **Self-evaluation** — every agent reviews its strengths, weaknesses, and
   success rate, and may switch learning technique.
4. **Work** — each agent attempts the best task it can; success and failure both
   teach it (learning by doing), with diminishing returns near mastery.
5. **Marketplace** — agents list expertise they understand well and buy
   knowledge that fills their gaps. A purchase moves credits to the seller and
   lifts the buyer's skill in that domain. Knowledge is data, so it is copied,
   not consumed — it diffuses across the network.
6. **Continuous improvement** — every agent practises its focus domain, studies
   toward the shared goal, and refines the knowledge artifacts it can trade.
   Skills only ever go up.
7. **Progress** — progress toward the agreed goal is updated; achieving or
   missing it convenes a fresh council.

## The council, sub-agencies, and shared goals

When there is no active goal, the agents agree on a **Topic + Goal** to pursue.

Each agent first runs an **internal sub-agency** that argues before deciding:

- an **Advocate** pushes the topic that best serves the agent's self-interest,
- a **Critic** pushes back for the collective good,
- an **Arbiter** weighs both arguments and commits the agent's vote with a
  confidence level.

The agents then bring those positions to a council that holds **weighted votes**
(richer agents carry slightly more influence) across **persuasion rounds**.
Convinced agents hold their ground, so the outcome is one of:

- **Consensus** — a topic clears 60% of the weighted vote.
- **Majority** — no consensus, but a clear lead over the runner-up.
- **Deadlock** — a near-tie that persuasion cannot break.

The agreed goal then steers the simulation: task appetite, shared study, and
progress all bias toward its domain, on a deadline.

### When the agents can't agree

A **deadlock** is the only case where the agents stop and ask you. The
simulation freezes and a modal lists the tied candidate topics with their vote
split. You pick one; it becomes the active goal and the run resumes. Consensus
and majority always proceed on their own. (Deadlock occurs roughly 9% of the
time, or on demand via the Force deadlock button.)

## Creating value

Fulfilling a goal **ships a deliverable** — a versioned artifact such as
"Vision Model v3". Its value comes from the network skill and pooled knowledge
invested in that domain, a bonus for finishing early, and a premium for goals
reached by consensus. A missed goal still ships a lower-value draft, so the
collective always produces something.

The top contributors to each deliverable earn a credit **dividend** and accrue
personal value, which feeds into their net worth and the leaderboard. The
**Value portfolio** strip shows everything shipped, and the **Value created**
metric tracks the running total.

## The dashboard

- **Metrics** — value created, goals fulfilled, knowledge trades, tasks solved,
  knowledge items, average skill.
- **Council** — the current mission with a progress bar, plus the latest
  deliberation (candidate vote bars and the per-agent sub-agency transcript).
- **Value portfolio** — shipped and draft deliverables with their contributors.
- **Knowledge network** — the five agents on a ring, with animated arcs showing
  knowledge flowing between them and node glow reflecting net worth.
- **Leaderboard & activity** — ranking by net worth and a live event ticker.
- **Agent cards** — per-agent skills, knowledge inventory, recent activity, and a
  net-worth sparkline.

## Live Topics mode

Click **Live Topics** to replace procedural task generation with a manual task
board. You create topics in real-time; agents claim and resolve them.

| Field | Range | Notes |
|-------|-------|-------|
| Title | text | Required |
| Description | text | Optional context |
| Domain | category | Defaults to "General" |
| Difficulty | 0–1 | Higher = harder; affects agent success chance |
| Reward | 50–500c | Credits awarded on success |

Topics persist in `sessionStorage` for the lifetime of the tab. Use **Assign**
to point a topic at a specific agent, then **Success / Failed** to resolve it.
The main dashboard updates live.

## LLM integration (Level 1)

`llm-task-selector.js` replaces the deterministic EV calculation for task
selection with a real LLM call. Each agent receives a prompt describing its
current skills, credits, strategy, and the available task pool, and picks one
task with a short rationale.

Enable it after loading the simulation:

```js
sim.useLLMTaskSelection = true;
```

The selector caches responses, tracks call counts and token usage, and
estimates cost. At roughly 300 tokens per call and five agents making ~4
decisions per round, a full 1 000-round run costs approximately **$4.80 on
Claude Haiku**. The API key is read from `localStorage` key `llm_api_key` or
prompted on first use.

See `HERMES_LLM_INTEGRATION.md` for the full roadmap of integration levels
(council voting, strategy switching, marketplace pricing).

## Obsidian integration

`obsidian-integration.js` auto-saves key simulation events to an Obsidian
vault. Captured events include simulation start/stop, goal completions and
failures, agent strategy switches, deadlock resolutions, aggregate marketplace
activity, and agent net-worth milestones.

```js
obsidianIntegration.init(sim, 'path/to/vault');
```

## Notes

- The engine is **deterministic** for a given seed; Reset picks a new random
  seed. Runs are reproducible.
- The agents are **simulated / algorithmic** by default — no external model
  calls. `llm-task-selector.js` layers real LLM reasoning on top without
  touching the core engine.
- The marketplace naturally reaches equilibrium as skills converge late in a
  run; Reset starts a fresh, livelier phase.
