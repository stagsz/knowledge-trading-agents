/**
 * Live Topics System
 * 
 * Replace the simulation's procedural task generation with manual topic creation.
 * You create topics in real-time via the UI, agents pick them via LLM,
 * and you resolve outcomes.
 * 
 * Topics are stored in sessionStorage (persist during session, cleared on refresh).
 */

class LiveTopics {
  constructor(sim) {
    this.sim = sim;
    this.topics = [];
    this.topicIdCounter = 1;
    this.activeAgentTasks = {}; // agent.id -> { topicId, status, startedAt }
    this.loadTopics();
  }

  /**
   * Create a new topic manually
   */
  createTopic(config) {
    const topic = {
      id: this.topicIdCounter++,
      title: config.title,
      description: config.description || '',
      domain: config.domain || 'General',
      difficulty: config.difficulty || 0.5,
      reward: config.reward || 100,
      status: 'open', // open, in_progress, completed, cancelled
      createdAt: Date.now(),
      claimedBy: null,
      completedBy: null,
      completedAt: null,
    };

    this.topics.push(topic);
    this.saveTopics();
    return topic;
  }

  /**
   * Get all open topics (available for agents to pick)
   */
  getOpenTopics() {
    return this.topics.filter(t => t.status === 'open');
  }

  /**
   * Get topic by ID
   */
  getTopicById(id) {
    return this.topics.find(t => t.id === id);
  }

  /**
   * Agent claims a topic (picks it to work on)
   */
  claimTopic(topicId, agent) {
    const topic = this.getTopicById(topicId);
    if (!topic || topic.status !== 'open') return false;

    topic.claimedBy = agent.id;
    topic.status = 'in_progress';
    this.activeAgentTasks[agent.id] = {
      topicId,
      status: 'working',
      startedAt: Date.now(),
    };

    this.saveTopics();
    return true;
  }

  /**
   * Agent completes or fails a topic
   */
  resolveTopic(topicId, agentId, success) {
    const topic = this.getTopicById(topicId);
    if (!topic || topic.status !== 'in_progress') return false;

    if (success) {
      topic.status = 'completed';
      topic.completedBy = agentId;
      topic.completedAt = Date.now();

      // Award credits to agent
      const agent = this.sim.agents.find(a => a.id === agentId);
      if (agent) {
        agent.credits += topic.reward;
        agent.xp += Math.round(topic.reward * 0.5);
        agent.tasksDone++;
        this.sim.totals.tasksDone++;
      }
    } else {
      // Topic fails, reset to open
      topic.status = 'open';
      topic.claimedBy = null;

      const agent = this.sim.agents.find(a => a.id === agentId);
      if (agent) {
        agent.tasksFailed++;
        agent.xp += Math.round(topic.reward * 0.2);
        this.sim.totals.tasksFailed++;
      }
    }

    delete this.activeAgentTasks[agentId];
    this.saveTopics();
    return true;
  }

  /**
   * Get topics by status
   */
  getTopicsByStatus(status) {
    return this.topics.filter(t => t.status === status);
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      total: this.topics.length,
      open: this.topics.filter(t => t.status === 'open').length,
      inProgress: this.topics.filter(t => t.status === 'in_progress').length,
      completed: this.topics.filter(t => t.status === 'completed').length,
      cancelled: this.topics.filter(t => t.status === 'cancelled').length,
    };
  }

  /**
   * Persist to session storage
   */
  saveTopics() {
    sessionStorage.setItem('liveTopics', JSON.stringify({
      topics: this.topics,
      counter: this.topicIdCounter,
    }));
  }

  /**
   * Load from session storage
   */
  loadTopics() {
    const saved = sessionStorage.getItem('liveTopics');
    if (saved) {
      const data = JSON.parse(saved);
      this.topics = data.topics;
      this.topicIdCounter = data.counter;
    }
  }

  /**
   * Clear all topics (for reset)
   */
  clearAll() {
    this.topics = [];
    this.topicIdCounter = 1;
    this.activeAgentTasks = {};
    this.saveTopics();
  }
}

// Create global instance once simulation is ready
window.addEventListener('load', () => {
  if (window.KTA && window.KTA.Simulation) {
    // Will be initialized in app.js
    window.liveTopics = null;
  }
});
