/*
 * Knowledge Trading Agents — simulation engine.
 *
 * Five autonomous agents discover tasks, build skills by doing them, evaluate
 * their own strengths/weaknesses each round, choose a learning technique
 * (strategy), and trade knowledge/data with one another in a marketplace.
 *
 * Loaded as a classic script (no modules) so it also works over file://.
 * Everything here attaches to the global scope for app.js to consume.
 */

// ---------------------------------------------------------------------------
// Skill domains
// ---------------------------------------------------------------------------
const DOMAINS = [
  { key: 'data',      label: 'Data',      color: '#38bdf8' },
  { key: 'vision',    label: 'Vision',    color: '#a78bfa' },
  { key: 'language',  label: 'Language',  color: '#f472b6' },
  { key: 'reasoning', label: 'Reasoning', color: '#facc15' },
  { key: 'coding',    label: 'Coding',    color: '#34d399' },
  { key: 'planning',  label: 'Planning',  color: '#fb923c' },
];
const DOMAIN_KEYS = DOMAINS.map((d) => d.key);
const DOMAIN_BY_KEY = Object.fromEntries(DOMAINS.map((d) => [d.key, d]));

// Learning techniques the agents can adopt and switch between.
const STRATEGIES = {
  Specialist: 'Doubles down on its strongest domain; sells that expertise.',
  Generalist: 'Spreads learning evenly; takes whatever task fits.',
  Explorer:   'Invests in its weakest domains; buys knowledge to fill gaps.',
  Trader:     'Accumulates and resells knowledge for profit.',
  Imitator:   'Studies the current leader and learns the same domains.',
};
const STRATEGY_KEYS = Object.keys(STRATEGIES);

// Human-ish names + accent colours for the five agents.
const AGENT_BLUEPRINTS = [
  { name: 'Atlas', color: '#60a5fa' },
  { name: 'Nova',  color: '#c084fc' },
  { name: 'Echo',  color: '#f472b6' },
  { name: 'Sage',  color: '#4ade80' },
  { name: 'Orion', color: '#fbbf24' },
];

// The deliverable each domain ships when a goal is fulfilled.
const PRODUCTS = {
  data:      'Data Pipeline',
  vision:    'Vision Model',
  language:  'Language Engine',
  reasoning: 'Reasoning Suite',
  coding:    'Codegen Toolkit',
  planning:  'Planning Optimizer',
};

// Task name fragments per primary domain.
const TASK_NAMES = {
  data:      ['Clean a messy dataset', 'Build an ETL pipeline', 'Forecast quarterly demand', 'Deduplicate records'],
  vision:    ['Classify satellite imagery', 'Detect defects on a line', 'Segment medical scans', 'Caption a photo set'],
  language:  ['Summarize a legal corpus', 'Translate a manual', 'Draft release notes', 'Moderate a comment feed'],
  reasoning: ['Prove a scheduling bound', 'Diagnose a flaky system', 'Optimize a pricing rule', 'Solve a logic puzzle'],
  coding:    ['Debug a payment service', 'Refactor a parser', 'Write an API client', 'Port a module to TS'],
  planning:  ['Optimize delivery routes', 'Plan a sprint backlog', 'Allocate a compute budget', 'Sequence a build'],
};

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32) so a given seed reproduces a run.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

let _idSeq = 1;
const nextId = () => _idSeq++;

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
class Simulation {
  constructor(seed = 1) {
    this.reset(seed);
  }

  reset(seed = this.seed || 1) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.round = 0;
    this.taskPool = [];
    this.agents = AGENT_BLUEPRINTS.map((bp, i) => this._makeAgent(bp, i));
    this.lastTrades = [];      // trades from the most recent tick (for animation)
    this.events = [];          // rolling activity ticker
    this.totals = { tasksDone: 0, tasksFailed: 0, trades: 0, creditsTraded: 0, goalsMet: 0, goalsMissed: 0, valueCreated: 0 };
    this.artifacts = [];       // value the collective has produced (shipped deliverables)
    this.productVersions = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0]));
    this.currentGoal = null;   // the Topic + Goal the council has agreed to pursue
    this.council = null;       // record of the most recent deliberation (for display)
    this.goalHistory = [];     // past goals with their outcomes
    this.awaitingUserTopic = false; // true when a deadlock needs the operator to choose
    this.pendingCandidates = null;  // the topics offered to the operator on deadlock
    this._emit('info', `Simulation initialised with seed ${this.seed}.`, '#94a3b8');
  }

  _rand(lo, hi) { return lo + this.rng() * (hi - lo); }
  _randInt(lo, hi) { return Math.floor(this._rand(lo, hi + 1)); }
  _pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  _makeAgent(bp, index) {
    const skills = {};
    DOMAIN_KEYS.forEach((k) => { skills[k] = Math.round(this._rand(18, 42)); });
    // Give each agent a natural inclination in one domain.
    const fav = DOMAIN_KEYS[index % DOMAIN_KEYS.length];
    skills[fav] = Math.round(this._rand(48, 64));
    const strategy = STRATEGY_KEYS[index % STRATEGY_KEYS.length];
    return {
      id: nextId(),
      name: bp.name,
      color: bp.color,
      skills,
      knowledge: [{ id: nextId(), domain: fav, quality: Math.round(skills[fav]) }],
      credits: 60,
      xp: 0,
      tasksDone: 0,
      tasksFailed: 0,
      valueContributed: 0,
      strategy,
      lastStrategyChange: 0,
      log: [],
      history: { net: [], skill: [], credits: [] },
    };
  }

  // ---- per-agent derived metrics -----------------------------------------
  skillAvg(a) {
    return DOMAIN_KEYS.reduce((s, k) => s + a.skills[k], 0) / DOMAIN_KEYS.length;
  }
  topDomain(a) {
    return DOMAIN_KEYS.reduce((best, k) => (a.skills[k] > a.skills[best] ? k : best), DOMAIN_KEYS[0]);
  }
  weakDomain(a) {
    return DOMAIN_KEYS.reduce((worst, k) => (a.skills[k] < a.skills[worst] ? k : worst), DOMAIN_KEYS[0]);
  }
  knowledgeValue(a) {
    return a.knowledge.reduce((s, k) => s + k.quality, 0) * 0.3;
  }
  netWorth(a) {
    return Math.round(a.credits + this.knowledgeValue(a) + this.skillAvg(a) * 2 + a.valueContributed * 0.4);
  }
  successRate(a) {
    const t = a.tasksDone + a.tasksFailed;
    return t === 0 ? 0 : a.tasksDone / t;
  }
  leader() {
    return this.agents.reduce((best, a) => (this.netWorth(a) > this.netWorth(best) ? a : best), this.agents[0]);
  }

  // ---- main loop ----------------------------------------------------------
  tick() {
    // Frozen while a deadlocked council waits for the operator's decision.
    if (this.awaitingUserTopic) return this;

    this.round++;
    this.lastTrades = [];

    // 0. Council phase: if there is no active shared goal, the agents convene
    //    their sub-agencies, argue, and agree on a Topic + Goal to pursue.
    this._ensureGoal();
    // A deadlocked council halts the round until the operator chooses.
    if (this.awaitingUserTopic) return this;

    this._spawnTasks();

    // 1. Self-evaluation: each agent reviews its skills/experience and may
    //    switch the learning technique it uses.
    this.agents.forEach((a) => this._selfEvaluate(a));

    // 2. Task phase: agents pick the best task they can and attempt it.
    const order = [...this.agents].sort(() => this.rng() - 0.5);
    order.forEach((a) => this._attemptTask(a));

    // 3. Marketplace phase: agents trade knowledge/data.
    this._marketplace();

    // 3a. Continuous improvement: agents always practise and refine their work.
    this._continuousImprovement();

    // 3b. Track progress toward the agreed goal.
    this._updateGoalProgress();

    // 4. Record history for charts.
    this.agents.forEach((a) => {
      a.history.net.push(this.netWorth(a));
      a.history.skill.push(Math.round(this.skillAvg(a)));
      a.history.credits.push(Math.round(a.credits));
      ['net', 'skill', 'credits'].forEach((k) => {
        if (a.history[k].length > 80) a.history[k].shift();
      });
    });

    return this;
  }

  _spawnTasks() {
    const n = this._randInt(2, 4);
    for (let i = 0; i < n; i++) this.taskPool.push(this._makeTask());
    // Expire old/excess tasks so the pool stays readable.
    this.taskPool.forEach((t) => { t.age = (t.age || 0) + 1; });
    this.taskPool = this.taskPool.filter((t) => t.age <= 4);
    if (this.taskPool.length > 12) this.taskPool = this.taskPool.slice(-12);
  }

  _makeTask() {
    const primary = this._pick(DOMAIN_KEYS);
    const difficulty = this._rand(0.2, 1);
    const required = {};
    required[primary] = Math.round(30 + difficulty * 55);
    // Sometimes a secondary, lower requirement.
    if (this.rng() < 0.45) {
      let sec = this._pick(DOMAIN_KEYS);
      if (sec === primary) sec = DOMAIN_KEYS[(DOMAIN_KEYS.indexOf(sec) + 1) % DOMAIN_KEYS.length];
      required[sec] = Math.round(20 + difficulty * 35);
    }
    const reward = Math.round(14 + difficulty * 60);
    const xpReward = Math.round(5 + difficulty * 22);
    const knowledgeReward = difficulty > 0.5
      ? { domain: primary, quality: Math.round(40 + difficulty * 50) }
      : null;
    return {
      id: nextId(),
      name: this._pick(TASK_NAMES[primary]),
      primary,
      required,
      reward,
      xpReward,
      knowledgeReward,
      difficulty,
      age: 0,
    };
  }

  // Probability the agent succeeds at a task, given its current skills.
  _successProb(a, task) {
    const ratios = Object.entries(task.required).map(
      ([d, lvl]) => clamp(a.skills[d] / lvl, 0, 1.4)
    );
    const coverage = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    return clamp(sigmoid((coverage - 1) * 4), 0.03, 0.97);
  }

  // Strategy-flavoured appetite for a task (multiplier on expected value).
  _taskAppetite(a, task) {
    let m;
    switch (a.strategy) {
      case 'Specialist': m = task.primary === this.topDomain(a) ? 1.6 : 0.7; break;
      case 'Explorer':   m = task.required[this.weakDomain(a)] ? 1.5 : 0.85; break;
      case 'Trader':     m = task.knowledgeReward ? 1.5 : 0.8; break;
      case 'Imitator': {
        const lead = this.leader();
        m = lead !== a && task.primary === this.topDomain(lead) ? 1.4 : 0.9; break;
      }
      default: m = 1; // Generalist
    }
    // The agreed shared goal pulls everyone toward its domain.
    const g = this.currentGoal;
    if (g && g.status === 'active' && task.primary === g.domain) m *= 1.6;
    return m;
  }

  _attemptTask(a) {
    if (this.taskPool.length === 0) return;
    let best = null;
    let bestEV = -Infinity;
    for (const task of this.taskPool) {
      const p = this._successProb(a, task);
      const ev = p * task.reward * this._taskAppetite(a, task);
      if (ev > bestEV) { bestEV = ev; best = task; }
    }
    if (!best) return;
    // Claim the task (one agent per task per round).
    this.taskPool = this.taskPool.filter((t) => t !== best);

    const p = this._successProb(a, best);
    const success = this.rng() < p;
    const involved = Object.keys(best.required);

    if (success) {
      a.credits += best.reward;
      a.xp += best.xpReward;
      a.tasksDone++;
      this.totals.tasksDone++;
      involved.forEach((d) => this._improve(a, d, 2.2 + best.difficulty * 3));
      if (best.knowledgeReward) this._grantKnowledge(a, best.knowledgeReward.domain, best.knowledgeReward.quality);
      const g = this.currentGoal;
      if (g && g.status === 'active' && g.type === 'tasks' && best.primary === g.domain) g.done++;
      this._logAgent(a, `Solved “${best.name}” (+${best.reward}c)`);
      this._emit('task', `${a.name} solved “${best.name}” (+${best.reward}c)`, a.color);
    } else {
      a.tasksFailed++;
      a.xp += Math.round(best.xpReward * 0.4);
      this.totals.tasksFailed++;
      // Learning from failure: smaller skill gain.
      involved.forEach((d) => this._improve(a, d, 1 + best.difficulty * 1.4));
      this._logAgent(a, `Failed “${best.name}” — learning from it`);
      this._emit('fail', `${a.name} failed “${best.name}”`, '#94a3b8');
    }
  }

  _improve(a, domain, amount) {
    const cur = a.skills[domain];
    const room = (100 - cur) / 100; // diminishing returns near mastery
    a.skills[domain] = clamp(cur + amount * (0.35 + 0.65 * room), 0, 100);
  }

  _grantKnowledge(a, domain, quality) {
    const existing = a.knowledge.find((k) => k.domain === domain);
    if (existing) { existing.quality = Math.max(existing.quality, quality); return; }
    a.knowledge.push({ id: nextId(), domain, quality });
  }

  // ---- self-evaluation: pick a learning technique -------------------------
  _selfEvaluate(a) {
    // Inertia: only reconsider every few rounds.
    if (this.round - a.lastStrategyChange < 3) return;
    const rate = this.successRate(a);
    const top = this.topDomain(a);
    const weak = this.weakDomain(a);
    const spread = a.skills[top] - this.skillAvg(a);
    const wealthRank = [...this.agents].sort((x, y) => this.netWorth(y) - this.netWorth(x)).indexOf(a);

    let next = a.strategy;
    if (a.tasksDone + a.tasksFailed >= 3 && rate < 0.4) {
      next = 'Explorer'; // failing too much — go learn
    } else if (a.credits > 110 && a.knowledge.length >= 3) {
      next = 'Trader';   // capital + inventory — go sell
    } else if (spread > 22) {
      next = 'Specialist'; // clear strength — double down
    } else if (wealthRank > 2 && this.round > 6) {
      next = 'Imitator';  // behind — copy the leader
    } else if (spread < 8) {
      next = 'Generalist';
    }

    if (next !== a.strategy) {
      const reason = {
        Explorer: `success only ${(rate * 100) | 0}% — exploring ${DOMAIN_BY_KEY[weak].label}`,
        Trader: 'capital + inventory built up — trading',
        Specialist: `strong in ${DOMAIN_BY_KEY[top].label} — specialising`,
        Imitator: 'falling behind — imitating the leader',
        Generalist: 'skills are even — generalising',
      }[next];
      a.strategy = next;
      a.lastStrategyChange = this.round;
      this._logAgent(a, `Self-review: ${reason}`);
    }
  }

  // ---- knowledge marketplace ---------------------------------------------
  _marketplace() {
    // Build listings: an agent can package any domain it understands well
    // enough (skill >= 38). Traders price low for volume; others price higher.
    const listings = [];
    for (const seller of this.agents) {
      for (const item of seller.knowledge) {
        if (seller.skills[item.domain] < 38) continue;
        const margin = seller.strategy === 'Trader' ? 0.34 : seller.strategy === 'Specialist' ? 0.6 : 0.46;
        const price = Math.round(8 + item.quality * margin);
        listings.push({ seller, domain: item.domain, quality: item.quality, price });
      }
    }

    // Each agent (in random order) may buy up to two knowledge items that
    // fill the gaps its learning technique cares about.
    const buyers = [...this.agents].sort(() => this.rng() - 0.5);
    for (const buyer of buyers) {
      const targets = this._buyTargetDomains(buyer);
      let purchases = 0;
      for (const target of targets) {
        if (purchases >= 2) break;
        const owned = buyer.knowledge.find((k) => k.domain === target);
        const ownedQ = owned ? owned.quality : 0;
        const budget = buyer.credits * (buyer.strategy === 'Explorer' ? 0.7 : 0.45);

        const candidates = listings.filter(
          (l) => l.seller !== buyer && l.domain === target && l.quality > ownedQ + 3 && l.price <= budget
        );
        if (candidates.length === 0) continue;
        // Best value: most quality per credit.
        candidates.sort((x, y) => y.quality / y.price - x.quality / x.price);
        const deal = candidates[0];

        buyer.credits -= deal.price;
        deal.seller.credits += deal.price;
        this._grantKnowledge(buyer, deal.domain, deal.quality);
        // Acquiring data lifts the buyer's skill in that domain.
        this._improve(buyer, deal.domain, deal.quality * 0.16);

        this.totals.trades++;
        this.totals.creditsTraded += deal.price;
        this.lastTrades.push({ from: deal.seller, to: buyer, domain: deal.domain, price: deal.price, quality: deal.quality });
        const dl = DOMAIN_BY_KEY[deal.domain].label;
        this._logAgent(buyer, `Bought ${dl} data from ${deal.seller.name} (−${deal.price}c)`);
        this._logAgent(deal.seller, `Sold ${dl} data to ${buyer.name} (+${deal.price}c)`);
        this._emit('trade', `${deal.seller.name} → ${buyer.name}: ${dl} data (${deal.price}c)`, DOMAIN_BY_KEY[deal.domain].color);
        purchases++;
      }
    }
  }

  // Which domains an agent wants to buy into, per its learning technique.
  _buyTargetDomains(a) {
    const weakest = [...DOMAIN_KEYS].sort((x, y) => a.skills[x] - a.skills[y]);
    switch (a.strategy) {
      case 'Explorer':   return weakest.slice(0, 2);
      case 'Generalist': return weakest.slice(0, 2);
      case 'Trader':     return weakest.slice(0, 2); // round out cheaply to resell
      case 'Imitator': {
        const lead = this.leader();
        if (lead === a) return [];
        return [...DOMAIN_KEYS].sort((x, y) => lead.skills[y] - lead.skills[x]).slice(0, 2);
      }
      case 'Specialist': return []; // builds its own expertise, rarely buys
      default:           return [];
    }
  }

  // =========================================================================
  // Council: agreeing on a shared Topic + Goal
  // =========================================================================
  _networkSkillAvg(domain) {
    return this.agents.reduce((s, a) => s + a.skills[domain], 0) / this.agents.length;
  }
  _networkKnowledge(domain) {
    return this.agents.reduce(
      (s, a) => s + a.knowledge.filter((k) => k.domain === domain).reduce((t, k) => t + k.quality, 0),
      0
    );
  }

  // Convene a council whenever there is no active goal (start, or the last
  // goal was achieved/expired).
  _ensureGoal() {
    if (this.currentGoal && this.currentGoal.status === 'active') return;
    if (this.currentGoal) {
      this.goalHistory.unshift(this.currentGoal);
      if (this.goalHistory.length > 12) this.goalHistory.pop();
    }
    this._runCouncil();
  }

  // Build the slate of candidate topics from the network's current state.
  _candidateTopics() {
    const byAvg = [...DOMAIN_KEYS].sort((x, y) => this._networkSkillAvg(y) - this._networkSkillAvg(x));
    const strongest = byAvg[0];
    const weakest = byAvg[byAvg.length - 1];
    const mid = byAvg[Math.floor(byAvg.length / 2)];
    const L = (d) => DOMAIN_BY_KEY[d].label;

    const topics = [
      {
        id: nextId(), kind: 'master', domain: strongest, type: 'skill',
        title: `Master ${L(strongest)}`,
        target: Math.min(97, Math.round(this._networkSkillAvg(strongest) + 6)),
        goalText: `Lift the network's average ${L(strongest)} skill`,
      },
      {
        id: nextId(), kind: 'shore', domain: weakest, type: 'skill',
        title: `Shore up ${L(weakest)}`,
        target: Math.min(97, Math.round(this._networkSkillAvg(weakest) + 6)),
        goalText: `Raise the collective's weakest area, ${L(weakest)}`,
      },
      {
        id: nextId(), kind: 'ship', domain: mid, type: 'tasks',
        title: `Ship ${L(mid)} contracts`,
        target: 4,
        goalText: `Collectively complete 4 ${L(mid)} tasks`,
      },
      {
        id: nextId(), kind: 'corpus', domain: strongest, type: 'knowledge',
        title: `Build a ${L(strongest)} corpus`,
        target: Math.round(this._networkKnowledge(strongest) + 45),
        goalText: `Grow shared ${L(strongest)} knowledge`,
      },
    ];
    // De-dup if strongest == mid etc. (rare with 6 domains, but be safe).
    const seen = new Set();
    return topics.filter((t) => {
      const key = t.kind + t.domain;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // An agent's internal sub-agency: an Advocate (self-interest) and a Critic
  // (collective good) argue, then an Arbiter evaluates both and decides.
  _agentDeliberate(a, candidates) {
    const selfScore = (t) => {
      const s = a.skills[t.domain];
      switch (a.strategy) {
        case 'Specialist': return (t.domain === this.topDomain(a) ? 60 : 0) + s * 0.5;
        case 'Trader':     return s * 0.5 + (t.type === 'tasks' ? 35 : 0) + (t.type === 'knowledge' ? 20 : 0);
        case 'Explorer':   return (100 - s) + (t.domain === this.weakDomain(a) ? 25 : 0);
        case 'Generalist': return (100 - s) * 0.6 + 25;
        case 'Imitator':   return this.leader().skills[t.domain] * 0.7;
        default:           return s;
      }
    };
    // How much the whole network benefits (raising weak/shared areas helps all).
    const colScore = (t) => {
      const need = 100 - this._networkSkillAvg(t.domain);
      if (t.type === 'tasks') return 40 + need * 0.3;       // earns credits for all
      if (t.type === 'knowledge') return 30 + need * 0.5;   // shared asset
      return need;                                          // skill lift
    };

    const advocate = [...candidates].sort((x, y) => selfScore(y) - selfScore(x))[0];
    const critic = [...candidates].sort((x, y) => colScore(y) - colScore(x))[0];

    // Arbiter blends self-interest vs collective weighting by temperament.
    const w = {
      Specialist: 0.7, Trader: 0.68, Imitator: 0.55, Explorer: 0.45, Generalist: 0.4,
    }[a.strategy] ?? 0.5;
    const blended = candidates.map((t) => ({ t, score: w * selfScore(t) + (1 - w) * colScore(t) }));
    blended.sort((x, y) => y.score - x.score);
    const choice = blended[0].t;
    const second = blended[1] ? blended[1].score : 0;
    const confidence = clamp((blended[0].score - second) / (blended[0].score + 1), 0.05, 0.95);

    const agree = advocate.id === critic.id;
    const transcript = [
      { role: 'Advocate', text: `back “${advocate.title}” — best for me as a ${a.strategy.toLowerCase()}` },
      {
        role: 'Critic',
        text: agree
          ? `agreed, “${critic.title}” also serves the collective`
          : `push back — the group needs “${critic.title}” more`,
      },
      {
        role: 'Arbiter',
        text: `weighed both → back “${choice.title}” (${Math.round(confidence * 100)}% sure)`,
      },
    ];
    return { agent: a, choiceId: choice.id, confidence, transcript, persuaded: false };
  }

  _runCouncil() {
    const candidates = this._candidateTopics();
    const positions = this.agents.map((a) => this._agentDeliberate(a, candidates));

    const maxNet = Math.max(1, ...this.agents.map((a) => this.netWorth(a)));
    const influence = (a) => 1 + this.netWorth(a) / maxNet;

    const tallyOf = () => {
      const t = {};
      candidates.forEach((c) => { t[c.id] = 0; });
      positions.forEach((p) => { t[p.choiceId] += influence(p.agent); });
      return t;
    };

    const rounds = [];
    let agreedId = null;
    let consensus = false;
    for (let r = 0; r < 4; r++) {
      const t = tallyOf();
      rounds.push({ ...t });
      const total = Object.values(t).reduce((s, v) => s + v, 0) || 1;
      agreedId = candidates.reduce((best, c) => (t[c.id] > t[best] ? c.id : best), candidates[0].id);
      const share = t[agreedId] / total;
      if (share >= 0.6) { consensus = true; break; }
      // Persuasion: only genuinely unsure agents (and some Imitators) drift to
      // the front-runner. Convinced agents hold their ground, so a real split
      // can survive — that is what produces a deadlock.
      let changed = false;
      positions.forEach((p) => {
        if (p.choiceId === agreedId) return;
        const swayable = p.confidence < 0.17 || p.agent.strategy === 'Imitator';
        if (swayable && this.rng() < 0.28) {
          p.choiceId = agreedId;
          p.persuaded = true;
          changed = true;
        }
      });
      if (!changed) break;
    }

    // Classify the outcome. A close, sub-consensus split that persuasion could
    // not break is a genuine deadlock — the agents escalate to the operator.
    const finalTally = rounds[rounds.length - 1];
    const total = Object.values(finalTally).reduce((s, v) => s + v, 0) || 1;
    const ranked = [...candidates].sort((a, b) => (finalTally[b.id] || 0) - (finalTally[a.id] || 0));
    const topShare = (finalTally[ranked[0].id] || 0) / total;
    const secondShare = ranked[1] ? (finalTally[ranked[1].id] || 0) / total : 0;
    const margin = topShare - secondShare;
    const outcome = consensus ? 'consensus' : margin < 0.12 ? 'deadlock' : 'majority';
    agreedId = ranked[0].id;

    this.council = {
      round: this.round,
      candidates,
      positions: positions.map((p) => ({
        name: p.agent.name,
        color: p.agent.color,
        strategy: p.agent.strategy,
        choiceId: p.choiceId,
        confidence: p.confidence,
        persuaded: p.persuaded,
        transcript: p.transcript,
      })),
      tally: finalTally,
      deliberationRounds: rounds.length,
      agreedId,
      consensus,
      outcome,
      decidedBy: 'agents',
    };

    if (outcome === 'deadlock') {
      // Hand the decision to the operator; leave the goal unset until they pick.
      this.currentGoal = null;
      this.awaitingUserTopic = true;
      this.pendingCandidates = candidates;
      this._emit('council', `Council deadlocked — asking the operator to choose a topic`, '#f59e0b');
      this.agents.forEach((a) => this._logAgent(a, `Council deadlocked — escalating to operator`));
      return;
    }

    const agreed = candidates.find((c) => c.id === agreedId);
    this.currentGoal = this._buildGoal(agreed);
    this.currentGoal.bornFrom = consensus ? 'consensus' : 'majority';
    this._emit(
      'council',
      `Council ${consensus ? 'reached consensus' : 'agreed by majority'}: “${agreed.title}”`,
      '#a78bfa'
    );
    this.agents.forEach((a) => this._logAgent(a, `Council set goal: ${agreed.title}`));
  }

  // The operator resolves a deadlock by choosing one of the pending topics.
  resolveUserTopic(topicId) {
    if (!this.awaitingUserTopic) return;
    const topic = (this.pendingCandidates || []).find((t) => t.id === topicId);
    if (!topic) return;
    this.currentGoal = this._buildGoal(topic);
    this.currentGoal.bornFrom = 'operator';
    this.awaitingUserTopic = false;
    this.pendingCandidates = null;
    if (this.council) {
      this.council.agreedId = topic.id;
      this.council.decidedBy = 'operator';
      this.council.outcome = 'operator';
    }
    this._emit('council', `Operator chose the topic: “${topic.title}”`, '#f59e0b');
    this.agents.forEach((a) => this._logAgent(a, `Operator set goal: ${topic.title}`));
  }

  // Dev helper: force a deadlock now so the operator-decision flow can be
  // tested on demand instead of waiting for a natural near-tie.
  forceDeadlock() {
    if (this.awaitingUserTopic) return this;
    if (this.currentGoal && this.currentGoal.status === 'active') {
      this.currentGoal.status = 'shelved';
      this.currentGoal.endRound = this.round;
      this.goalHistory.unshift(this.currentGoal);
      if (this.goalHistory.length > 12) this.goalHistory.pop();
    }
    this.currentGoal = null;
    const candidates = this._candidateTopics();
    const positions = this.agents.map((a) => this._agentDeliberate(a, candidates));
    const maxNet = Math.max(1, ...this.agents.map((a) => this.netWorth(a)));
    const tally = {};
    candidates.forEach((c) => { tally[c.id] = 0; });
    positions.forEach((p) => { tally[p.choiceId] += 1 + this.netWorth(p.agent) / maxNet; });
    const agreedId = candidates.reduce((b, c) => (tally[c.id] > tally[b] ? c.id : b), candidates[0].id);
    this.council = {
      round: this.round,
      candidates,
      positions: positions.map((p) => ({
        name: p.agent.name, color: p.agent.color, strategy: p.agent.strategy,
        choiceId: p.choiceId, confidence: p.confidence, persuaded: false, transcript: p.transcript,
      })),
      tally,
      deliberationRounds: 1,
      agreedId,
      consensus: false,
      outcome: 'deadlock',
      decidedBy: 'agents',
    };
    this.awaitingUserTopic = true;
    this.pendingCandidates = candidates;
    this._emit('council', 'Forced deadlock (dev) — operator must choose a topic', '#f59e0b');
    this.agents.forEach((a) => this._logAgent(a, 'Forced deadlock (dev) — escalating to operator'));
    return this;
  }

  _buildGoal(topic) {
    const startValue =
      topic.type === 'tasks' ? 0
      : topic.type === 'knowledge' ? this._networkKnowledge(topic.domain)
      : this._networkSkillAvg(topic.domain);
    return {
      title: topic.title,
      goalText: topic.goalText,
      domain: topic.domain,
      type: topic.type,
      target: topic.target,
      startValue,
      done: 0,
      current: startValue,
      progress: 0,
      startRound: this.round,
      deadline: this.round + 9,
      status: 'active',
    };
  }

  _updateGoalProgress() {
    const g = this.currentGoal;
    if (!g || g.status !== 'active') return;
    g.current =
      g.type === 'tasks' ? g.done
      : g.type === 'knowledge' ? this._networkKnowledge(g.domain)
      : this._networkSkillAvg(g.domain);

    g.progress =
      g.type === 'tasks'
        ? clamp(g.current / g.target, 0, 1)
        : clamp((g.current - g.startValue) / ((g.target - g.startValue) || 1), 0, 1);

    if (g.progress >= 1) {
      g.status = 'achieved';
      g.endRound = this.round;
      this.totals.goalsMet++;
      this._emit('council', `Goal achieved: “${g.title}” 🎯`, '#34d399');
      this._shipValue(g, true);
    } else if (this.round >= g.deadline) {
      g.status = 'expired';
      g.endRound = this.round;
      this.totals.goalsMissed++;
      this._emit('council', `Goal expired: “${g.title}” (${Math.round(g.progress * 100)}%)`, '#94a3b8');
      this._shipValue(g, false);
    }
  }

  _agentKnowledge(a, domain) {
    return a.knowledge.filter((k) => k.domain === domain).reduce((s, k) => s + k.quality, 0);
  }

  // Fulfilling a goal produces value: a concrete deliverable whose worth comes
  // from the skill and knowledge poured into it. Top contributors earn a
  // dividend; a missed goal still ships a lower-value draft.
  _shipValue(goal, shipped) {
    const domain = goal.domain;
    const skill = this._networkSkillAvg(domain);
    const pooled = this._networkKnowledge(domain);
    const base = skill * 1.4 + pooled * 0.35;

    let value, kind;
    if (shipped) {
      const speedBonus = Math.max(0, goal.deadline - this.round) * 4;
      const factor = { consensus: 1.15, majority: 1.05, operator: 1.0 }[goal.bornFrom] || 1.0;
      value = Math.round((base + speedBonus) * factor);
      kind = 'shipped';
    } else {
      value = Math.round(base * 0.3 * goal.progress);
      kind = 'draft';
    }
    value = Math.max(1, value);

    // Contributors: ranked by their skill + knowledge in the goal's domain.
    const ranked = [...this.agents].sort(
      (a, b) =>
        (b.skills[domain] + this._agentKnowledge(b, domain)) -
        (a.skills[domain] + this._agentKnowledge(a, domain))
    );
    const shares = [0.5, 0.3, 0.2];
    const contributors = ranked.slice(0, 3);
    const dividend = Math.round(value * 0.4);
    contributors.forEach((a, i) => {
      a.credits += Math.round(dividend * shares[i]);
      a.valueContributed += Math.round(value * shares[i]);
    });

    const version = (this.productVersions[domain] += 1);
    const name = `${PRODUCTS[domain]} v${version}${shipped ? '' : ' (draft)'}`;
    this.artifacts.unshift({
      id: nextId(),
      name,
      domain,
      value,
      kind,
      round: this.round,
      goalTitle: goal.title,
      bornFrom: goal.bornFrom,
      contributors: contributors.map((a) => ({ name: a.name, color: a.color })),
    });
    if (this.artifacts.length > 24) this.artifacts.pop();
    this.totals.valueCreated += value;
    this._emit('value', `Shipped ${name} — value ${value}`, DOMAIN_BY_KEY[domain].color);
  }

  // Agents never stop refining: every round they practise their focus domain,
  // study toward the shared goal, and upgrade the knowledge they can trade.
  _continuousImprovement() {
    const g = this.currentGoal;
    const goalActive = g && g.status === 'active';
    this.agents.forEach((a) => {
      this._improve(a, this._focusDomain(a), 0.6);
      if (goalActive) this._improve(a, g.domain, 0.7);
      // The work products an agent can sell creep toward its current skill.
      a.knowledge.forEach((k) => {
        const skill = Math.round(a.skills[k.domain]);
        if (skill > k.quality) k.quality = Math.min(skill, k.quality + 2);
      });
    });
  }

  // The domain an agent deliberately practises, per its learning technique.
  _focusDomain(a) {
    switch (a.strategy) {
      case 'Explorer':
      case 'Generalist': return this.weakDomain(a);
      case 'Imitator':   return this.topDomain(this.leader());
      default:           return this.topDomain(a); // Specialist, Trader
    }
  }

  // ---- logging ------------------------------------------------------------
  _logAgent(a, text) {
    a.log.unshift({ round: this.round, text });
    if (a.log.length > 6) a.log.pop();
  }
  _emit(type, text, color) {
    this.events.unshift({ type, text, color, round: this.round });
    if (this.events.length > 40) this.events.pop();
  }
}

// Expose globally for app.js (classic script, file:// friendly).
window.KTA = { Simulation, DOMAINS, DOMAIN_KEYS, DOMAIN_BY_KEY, STRATEGIES, STRATEGY_KEYS };
