/**
 * Level 1 LLM Integration: Task Selection
 * 
 * Replaces deterministic task picking with LLM reasoning.
 * 
 * Each agent calls LLM to decide which task to attempt,
 * based on its current state (skills, credits, strategy).
 * 
 * Usage: Include in app.js after simulation is loaded
 * Enable: sim.useLLMTaskSelection = true
 * 
 * Cost: ~5 agents × 4 decisions/round × 1000 rounds = 20k calls
 *       At ~300 tokens/call = 6M tokens = ~$4.80 (Haiku) per run
 */

class LLMTaskSelector {
  constructor(apiKey = null) {
    this.apiKey = apiKey || this._getApiKey();
    this.cache = {};
    this.callCount = 0;
    this.totalTokens = 0;
    this.costEstimate = 0.0;
  }

  /**
   * Get API key from environment or ask user
   */
  _getApiKey() {
    // Try to get from localStorage (user set it once)
    let key = localStorage.getItem('llm_api_key');
    if (key) return key;

    // Ask user
    key = prompt(
      'Paste your Anthropic API key to enable LLM task selection.\n' +
      '(Your key is stored locally in browser, never sent anywhere but Anthropic.)\n\n' +
      'Get key from: https://console.anthropic.com/account/keys'
    );

    if (!key) {
      console.warn('LLM task selection disabled: no API key provided');
      return null;
    }

    localStorage.setItem('llm_api_key', key);
    return key;
  }

  /**
   * Main entry: pick task for an agent via LLM
   */
  async selectTask(agent, taskPool, sim) {
    if (!this.apiKey) return null;

    try {
      const taskDescriptions = taskPool
        .map((t, i) => this._formatTask(t, i, agent, sim))
        .join('\n\n');

      const prompt = this._buildPrompt(agent, taskDescriptions, sim);

      const response = await this._callClaude(prompt);
      this.callCount++;

      const chosenTaskId = this._parseResponse(response, taskPool);
      if (chosenTaskId === null) {
        console.warn(`LLM response invalid, falling back to deterministic choice`, response);
        return null; // Fall back to deterministic
      }

      console.log(
        `✓ LLM chose task for ${agent.name}: ${taskPool.find(t => t.id === chosenTaskId)?.name || '?'}`
      );

      return chosenTaskId;
    } catch (err) {
      console.error('LLM task selection error:', err);
      return null; // Fall back to deterministic
    }
  }

  /**
   * Format a task for the prompt
   */
  _formatTask(task, index, agent, sim) {
    // Calculate success probability (simplified version of sigmoid)
    const ratios = Object.entries(task.required).map(
      ([d, lvl]) => Math.max(0, Math.min(1.4, agent.skills[d] / lvl))
    );
    const coverage = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    const successProb = Math.round(
      Math.max(0.03, Math.min(0.97, 1 / (1 + Math.exp(-(coverage - 1) * 4)))) * 100
    );

    const requiredStr = Object.entries(task.required)
      .map(([d, lvl]) => `${d}: ${lvl} (you: ${Math.round(agent.skills[d])})`)
      .join(', ');

    return `Task #${index + 1}: "${task.name}"
  Domain: ${task.primary}
  Difficulty: ${Math.round(task.difficulty * 100)}%
  Requires: ${requiredStr}
  Reward: +${task.reward} credits, +${task.xpReward} XP
  Knowledge: ${task.knowledgeReward ? `Yes (quality ${task.knowledgeReward.quality})` : 'No'}
  Success probability: ~${successProb}%`;
  }

  /**
   * Build the LLM prompt
   */
  _buildPrompt(agent, taskDescriptions, sim) {
    const topDomains = [...Object.keys(agent.skills)]
      .sort((a, b) => agent.skills[b] - agent.skills[a])
      .slice(0, 2);

    return `You are ${agent.name}, a ${agent.strategy} learner in an economic simulation.

Your current state:
- Strategy: ${agent.strategy}
- Credits: ${agent.credits}
- Skill average: ${Math.round(Object.values(agent.skills).reduce((s, v) => s + v, 0) / 6)}
- Top domains: ${topDomains.join(', ')}
- Knowledge items: ${agent.knowledge.length}
- Success rate: ${Math.round(this._successRate(agent) * 100)}%

Your strategy's focus:
${this._strategyContext(agent.strategy)}

Available tasks this round:
${taskDescriptions}

You can pick ONE task to attempt this round, or say "SKIP" if none appeal.

Consider:
1. Will you succeed? (high probability is safer)
2. Does it align with your strategy?
3. Will it advance your learning goals?
4. Is the reward worth the risk?

Respond with ONLY: "PICK #N" (where N is 1-${taskDescriptions.split('\n\n').length}) or "SKIP"
Then on the next line, explain your reasoning in 1-2 sentences.

Example response:
PICK #3
I'm a Specialist and task #3 is in my strong domain with 75% success chance.`;
  }

  /**
   * Get strategy-specific context
   */
  _strategyContext(strategy) {
    const contexts = {
      Specialist: `You focus on mastering ONE domain. Pick tasks in your strong area.
You want 1.6× appetite for tasks in your top domain, 0.7× for others.
Rarely buy knowledge; instead, build your own expertise.`,

      Trader: `You buy knowledge cheap and sell it high. Pick tasks that yield knowledge rewards.
You have capital to invest. Buy weaker domains to resell.
Aim for 1.5× appetite for knowledge-yielding tasks, 0.8× for pure skill tasks.`,

      Explorer: `You're learning broadly. Pick tasks in your weakest domains.
Short-term pain (low success), long-term gain (broad skills).
You want 1.5× appetite for weak-domain tasks, 0.85× for others.
Spend aggressively on knowledge (70% of budget).`,

      Imitator: `You copy the leader's strategy. You want tasks in the leader's strong domain.
You're easily influenced; if unsure, think about what the leader would pick.
Appetite 1.4× for leader's domain, 0.9× for others.`,

      Generalist: `You stay balanced across domains. Pick tasks that round out your weaknesses.
You're adaptable and pragmatic. Appetite is 1.0× baseline (neutral).
You help hold the collective together.`,
    };
    return contexts[strategy] || '';
  }

  /**
   * Calculate success rate
   */
  _successRate(agent) {
    const t = agent.tasksDone + agent.tasksFailed;
    return t === 0 ? 0 : agent.tasksDone / t;
  }

  /**
   * Call Claude API (Anthropic)
   */
  async _callClaude(prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Anthropic API error: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    this.totalTokens += data.usage?.input_tokens || 0;

    // Cost calculation (Haiku pricing as of 2024)
    const costPerMToken = 0.80; // $0.80 per 1M input tokens
    this.costEstimate += (data.usage?.input_tokens || 0) / 1_000_000 * costPerMToken;

    return data.content[0]?.text || '';
  }

  /**
   * Parse LLM response: extract task choice
   */
  _parseResponse(response, taskPool) {
    const text = response.trim().toUpperCase();

    if (text.includes('SKIP')) {
      return null; // Agent passes
    }

    const match = text.match(/PICK #(\d+)/);
    if (!match) {
      console.warn('Could not parse LLM response:', response);
      return null;
    }

    const chosenIndex = parseInt(match[1], 10) - 1;
    if (chosenIndex < 0 || chosenIndex >= taskPool.length) {
      console.warn(`LLM chose out-of-range task #${chosenIndex + 1}, pool size ${taskPool.length}`);
      return null;
    }

    return taskPool[chosenIndex].id;
  }

  /**
   * Get stats on this session
   */
  getStats() {
    return {
      calls: this.callCount,
      totalTokens: this.totalTokens,
      estimatedCost: `$${this.costEstimate.toFixed(2)}`,
      avgTokensPerCall: this.callCount > 0
        ? Math.round(this.totalTokens / this.callCount)
        : 0,
    };
  }

  /**
   * Print stats to console
   */
  printStats() {
    const stats = this.getStats();
    console.log(`
╔══════════════════════════════════════╗
║   LLM Task Selection Statistics      ║
╚══════════════════════════════════════╝
Calls made:              ${stats.calls}
Total tokens used:       ${stats.totalTokens.toLocaleString()}
Avg tokens per call:     ${stats.avgTokensPerCall}
Estimated cost:          ${stats.estimatedCost}
    `);
  }
}

// Create global instance
if (!window.llmTaskSelector) {
  window.llmTaskSelector = new LLMTaskSelector();
}
window.llmTaskSelector = new LLMTaskSelector();
