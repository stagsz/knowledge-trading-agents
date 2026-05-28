# Knowledge Trading Agents — Generation & Creation Flow

## Overview
The simulation generates and creates value through **deterministic procedural generation** at each tick (round). No pre-built data — everything is dynamically created based on current agent state, strategy switching, and random events seeded by a deterministic RNG.

---

## Generation Pipeline (Each Tick)

### 1. **Council Phase: Topic & Goal Generation**
The agents convene and vote on a shared goal. The process is:

```
_candidateTopics()
  ↓
  Generates 4 candidate topics based on network state:
    • Master <strongest skill>     (type: skill lift)
    • Shore up <weakest skill>     (type: skill lift)
    • Ship <mid-tier> contracts    (type: tasks)
    • Build <skill> corpus         (type: knowledge)
  
  Each candidate is dynamically born from:
    - Network's average skill per domain
    - Existing shared knowledge quantity
    - Current round context
```

**Sub-agency Deliberation per Agent:**
```
_agentDeliberate(agent, candidates)
  ↓
  Advocate (self-interest score):
    • Specialist: favors own top domain
    • Trader: favors knowledge/task types
    • Explorer: favors weak domains
    • Imitator: favors leader's strengths
  ↓
  Critic (collective good score):
    • Rates domains by network need (gap to 100)
    • Task goals = 40 + network need
    • Knowledge goals = 30 + network need
  ↓
  Arbiter (blends both, strategy-weighted):
    • Specialist: 70% self, 30% collective
    • Trader: 68% self, 32% collective
    • Imitator: 55% self, 45% collective
    • Explorer: 45% self, 55% collective
    • Generalist: 40% self, 60% collective
```

**Council Voting & Deadlock Detection:**
```
Vote tally (weighted by agent net worth):
  _runCouncil()
    ↓
    Round 1-4: Persuasion attempts
      • Unsure agents (confidence < 0.17) may drift
      • Imitators drift to front-runner
      • Convinced agents hold ground
    ↓
    Outcome classification:
      • Consensus: top choice ≥ 60% vote share
      • Majority: top choice > 12% margin over 2nd
      • **Deadlock**: close split (margin < 12%)
           → Escalate to operator
```

---

### 2. **Task Pool Generation**
```
_spawnTasks()
  ↓
  Creates 2–4 new tasks per round via _makeTask()
  
  Each task has:
    • Random primary domain + difficulty (0.2–1.0)
    • Primary skill requirement: 30 + difficulty × 55
    • Secondary domain (45% chance): 20 + difficulty × 35
    • Reward: 14 + difficulty × 60 credits
    • XP reward: 5 + difficulty × 22
    • Knowledge reward (50%+ difficulty): quality = 40 + difficulty × 50
    
  Task pool management:
    • Age out tasks after 4 rounds
    • Cap pool at 12 tasks (keep readable)
```

---

### 3. **Task Execution & Skill Growth**
```
_attemptTask(agent)
  ↓
  Agent picks best task by expected value (EV):
    EV = success_probability × reward × task_appetite
    
  Success probability = sigmoid((coverage − 1) × 4)
    • coverage = avg(agent_skill[required_domain] / task_requirement)
    • Clamp to 0.03–0.97
  
  Task appetite multiplier per strategy:
    • Specialist: 1.6× if task matches top domain, else 0.7×
    • Explorer: 1.5× if task matches weak domain, else 0.85×
    • Trader: 1.5× if task has knowledge reward, else 0.8×
    • Imitator: 1.4× if task matches leader's top domain, else 0.9×
    • Generalist: 1.0× baseline
    • Shared goal bonus: 1.6× if task matches goal domain
  
  On success:
    • Agent gains: reward credits + XP
    • Skills improve: +2.2 + difficulty × 3
    • Knowledge acquired (if task includes it)
    • Goal progress incremented
  
  On failure:
    • Agent gains: 40% of XP reward
    • Skills improve: +1 + difficulty × 1.4 (learning from failure)
```

---

### 4. **Skill Improvement Mechanics**
```
_improve(agent, domain, amount)
  ↓
  Diminishing returns as mastery approaches:
    new_skill = cur_skill + amount × (0.35 + 0.65 × room)
    room = (100 − current) / 100
  ↓
  Clamped to [0, 100]
```

---

### 5. **Knowledge Marketplace (Generated Trades)**
```
_marketplace()
  ↓
  Phase 1: Build listings
    For each agent's knowledge item:
      IF agent.skills[domain] >= 38:
        price = 8 + quality × margin
        
        Margin by strategy:
          • Trader: 0.34 (low price, volume play)
          • Specialist: 0.60 (premium)
          • Others: 0.46 (moderate)
  
  Phase 2: Buyer agents purchase (random order)
    For each buyer:
      budget = credits × (0.7 if Explorer, else 0.45)
      
      targets = weak domains per strategy:
        • Explorer: 2 weakest domains
        • Generalist: 2 weakest domains
        • Trader: 2 weakest (to resell at profit)
        • Imitator: 2 strongest domains of leader
        • Specialist: (no purchases)
      
      For each target domain:
        Find best deal: highest quality/price ratio
        IF found and affordable:
          • Buyer loses credits, gains knowledge
          • Seller gains credits
          • Buyer's skill in domain improves: +quality × 0.16
          • Trade recorded in activity feed
```

---

### 6. **Continuous Improvement**
```
_continuousImprovement()
  ↓
  Agents refine existing skills via practice:
    • Each agent improves their 2 strongest domains
    • Practise XP gained last round drives improvement
    • Incremental gains (small multiplier, same diminishing-returns math)
```

---

### 7. **Strategy Switching (Self-Evaluation)**
```
_selfEvaluate(agent)
  ↓
  Every 3+ rounds, agent evaluates and may switch strategy:
    
    IF success_rate < 40% AND task attempts ≥ 3:
      → Explorer (go learn weak domains)
    
    IF credits > 110 AND knowledge_inventory >= 3:
      → Trader (have capital to resell)
    
    IF skill_spread > 22 (clear strength):
      → Specialist (double down on strength)
    
    IF wealth_rank > 2 AND round > 6:
      → Imitator (falling behind, copy leader)
    
    IF skill_spread < 8 (all equal):
      → Generalist (balance)
```

---

### 8. **Goal Progress Tracking & Portfolio Shipment**
```
_updateGoalProgress()
  ↓
  If goal is "Skill" type:
    • Progress = agents' avg skill in goal domain
    • Success when avg >= target
  
  If goal is "Tasks" type:
    • Progress = tasks completed in goal domain
    • Success when count >= target
  
  If goal is "Knowledge" type:
    • Progress = network's total knowledge in domain
    • Success when total >= target
  
  Goal completion triggers:
    _buildGoal(topic)
      ↓
      Create goal object with:
        • Tracking metrics (skill avg, task count, knowledge sum)
        • Target value from network state
        • Birth date (round)
      ↓
      On completion (success) or expiry (16 rounds):
        • Generate deliverable (shipped/draft)
        • Calculate value from skill + knowledge invested
        • Distribute dividend to top contributors
        • Archive to goalHistory (keep 12 most recent)
        • Trigger new council
```

---

## Value Generation (Portfolios)

Each completed goal creates a **deliverable** with value derived from:

```
Goal Value Calculation:
  • Base: 40 credits (completed) or 20 (missed/draft)
  • Skill bonus: avg agent skill in goal domain × 1.8
  • Knowledge bonus: total network knowledge × 0.5
  • Contributor bonus: skill levels of agents who solved tasks
  
  Dividend distribution:
    • Top 2 agents by contribution get 40% share each
    • Remaining agents split 20%
```

---

## Real-Time UI Generation

All generated data is fed to the **UI in real-time**:

### Metrics Panel (KPI Strip)
```
Renders:
  • Round counter
  • Total net worth (all agents)
  • Total credits traded
  • Average skill level
  • Completed goals count
```

### Council Panel
```
Renders:
  • Current active goal (mission statement)
  • Candidate topics (on deadlock)
  • Vote tally (bar charts)
  • Sub-agency transcripts (per agent)
```

### Network Graph
```
Renders:
  • Agent nodes (size = net worth, glow = activity)
  • Knowledge trade arcs (this round)
  • Legend (domain colors)
```

### Leaderboard
```
Renders:
  • Agent rank by net worth
  • Skills breakdown
  • Strategy label
  • Recent activity
```

### Activity Ticker
```
Renders (last 20 events):
  • Task completions
  • Failures + learning
  • Strategy switches
  • Trades
  • Council votes
```

### Per-Agent Cards
```
For each agent:
  • Name, color, current strategy
  • Skills (bar chart, 6 domains)
  • Knowledge inventory (with quality scores)
  • Credits balance
  • Activity log (last 5 actions)
```

---

## Determinism & Seeding

The simulation is **fully deterministic**:

```
new Simulation(seed)
  ↓
  _seededRNG(seed) initializes Mulberry32 PRNG
  
  All randomness goes through this.rng():
    • Task difficulty
    • Task domain selection
    • Strategy switches (probabilistic)
    • Trade success/failure
    • Agent decision probability
    • Council persuasion attempts
  
  Same seed = identical 1000-tick replay
```

---

## Summary: What Gets Created Each Tick

| **What** | **Source** | **Effect** |
|----------|-----------|-----------|
| **Tasks** | _makeTask() | 2–4 per round, randomly difficultly & domain |
| **Skill gains** | Task success/failure | +1–5 per agent per round (diminishing) |
| **Knowledge** | Task rewards + trades | New knowledge items added to inventory |
| **Credits** | Task rewards + trades | Agent balance changes |
| **Strategies** | _selfEvaluate() | Agents switch learning technique |
| **Goals** | Council vote | New shared goal every 16 rounds (or sooner) |
| **Trades** | Marketplace | 0–N knowledge exchanges per round |
| **Deliverables** | Goal completion | Shipped/draft artifact with value |
| **UI state** | Every tick | Charts, leaderboards, activity feed updated |

---

## Architecture Insight

The simulation is a **feedback loop**:

```
Agent choices → Task outcomes → Skill/knowledge growth → 
  → Strategy shifts → Different task appetites → 
  → New goal proposals → Collective decision → 
  → Shared focus → Aligned effort → 
  → Faster goal completion → Deliverables shipped → 
  → Back to Agent choices (next cycle)
```

Each agent's **self-interest vs collective good** is baked into the sub-agency deliberation, creating emergent tension:
- **Specialists** push for domains they dominate (self)
- **Traders** push for tasks & knowledge (self)
- **Explorers** push for weak areas (collective)
- **Imitators** follow the leader (social)
- **Generalists** balance both (pragmatic)

The **operator's deadlock resolution** injects human judgment when the council reaches a stalemate, breaking the simulation's pure emergence and introducing a human-in-the-loop element.

---

## Performance Notes

**Zero dependencies**: pure vanilla JavaScript, no npm, no WebGL, no WebWorkers.
- ~30KB min JS total
- ~100–150 ticks/sec on modern hardware (depends on tick complexity and UI refresh rate)
- Deterministic seeding allows replayable simulations for debugging or documentation
