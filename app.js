/*
 * Dashboard rendering + controls for the Knowledge Trading Agents simulation.
 * Plain DOM/SVG, no framework. Builds static scaffolding once, then repaints
 * the dynamic bits after every tick.
 */
(function () {
  const { Simulation, DOMAINS, DOMAIN_KEYS, DOMAIN_BY_KEY } = window.KTA;

  const sim = new Simulation(Math.floor(Math.random() * 1e9));

  // ---- control state ------------------------------------------------------
  let playing = false;
  let timer = null;
  let speed = 650; // ms per tick

  const el = (id) => document.getElementById(id);
  const roundCounter = el('round-counter');
  const btnPlay = el('btn-play');

  let resumeAfterModal = false;

  // Advance one round. Returns false if the run must halt for an operator
  // decision (a deadlocked council).
  function advance() {
    sim.tick();
    render();
    if (sim.awaitingUserTopic) { openTopicModal(); return false; }
    return true;
  }
  function loop() {
    if (!playing) return;
    if (!advance()) return; // halted: council needs the operator to choose
    timer = setTimeout(loop, speed);
  }
  function play() {
    if (playing || sim.awaitingUserTopic) return;
    playing = true;
    btnPlay.textContent = '❚❚ Pause';
    btnPlay.classList.add('active');
    loop();
  }
  function pause() {
    playing = false;
    btnPlay.textContent = '▶ Play';
    btnPlay.classList.remove('active');
    clearTimeout(timer);
  }

  btnPlay.addEventListener('click', () => (playing ? pause() : play()));
  el('btn-step').addEventListener('click', () => { pause(); advance(); });
  el('btn-reset').addEventListener('click', () => {
    pause();
    el('topic-modal').hidden = true;
    sim.reset(Math.floor(Math.random() * 1e9));
    render();
  });
  el('btn-deadlock').addEventListener('click', () => {
    if (sim.awaitingUserTopic) return;
    sim.forceDeadlock();
    render();
    openTopicModal();
  });

  // ---- operator decision modal (shown only on a deadlock) -----------------
  const modal = el('topic-modal');
  function openTopicModal() {
    resumeAfterModal = playing;
    pause();
    const c = sim.council;
    const cands = sim.pendingCandidates || [];
    const total = c ? (Object.values(c.tally).reduce((s, v) => s + v, 0) || 1) : 1;
    el('topic-choices').innerHTML = cands
      .map((t) => {
        const share = c ? Math.round(((c.tally[t.id] || 0) / total) * 100) : 0;
        const col = DOMAIN_BY_KEY[t.domain].color;
        return `<button class="topic-choice" data-id="${t.id}" style="--c:${col}">
          <span class="tc-title">${t.title}</span>
          <span class="tc-goal">${t.goalText}</span>
          <span class="tc-share">council split · ${share}%</span>
        </button>`;
      })
      .join('');
    el('topic-choices')
      .querySelectorAll('.topic-choice')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          sim.resolveUserTopic(Number(btn.dataset.id));
          modal.hidden = true;
          render();
          if (resumeAfterModal) play();
        });
      });
    modal.hidden = false;
  }
  el('speed').addEventListener('input', (e) => {
    // Slider is intuitive left=slow→right=fast, so invert.
    speed = 1480 - Number(e.target.value);
  });
  speed = 1480 - Number(el('speed').value);

  // ---- LLM Task Selection (Level 1) -----------------------------------------------
  let useLLMTaskSelection = false;
  const useLLMCheckbox = el('use-llm');
  const llmStatsBtn = el('btn-llm-stats');

  useLLMCheckbox.addEventListener('change', (e) => {
    useLLMTaskSelection = e.target.checked;
    llmStatsBtn.hidden = !useLLMTaskSelection;
    
    if (useLLMTaskSelection && !window.llmTaskSelector.apiKey) {
      // Prompt for API key
      const key = prompt(
        'Paste your Anthropic API key to enable LLM task selection.\n\n' +
        'Your key is stored locally in browser, never sent anywhere but Anthropic.\n\n' +
        'Get key from: https://console.anthropic.com/account/keys'
      );
      
      if (!key) {
        useLLMCheckbox.checked = false;
        useLLMTaskSelection = false;
        llmStatsBtn.hidden = true;
        alert('LLM task selection disabled.');
        return;
      }
      
      window.llmTaskSelector.apiKey = key;
      localStorage.setItem('llm_api_key', key);
    }
    
    console.log(useLLMTaskSelection ? '✓ LLM task selection ENABLED' : '✗ LLM task selection disabled');
  });

  llmStatsBtn.addEventListener('click', () => {
    window.llmTaskSelector.printStats();
    alert(
      'LLM Stats printed to console (F12 → Console tab)\n\n' +
      window.llmTaskSelector.getStats().estimatedCost
    );
  });

  // Hook LLM into simulation's task selection
  const originalAttemptTask = sim._attemptTask.bind(sim);
  sim._attemptTask = async function(agent) {
    if (useLLMTaskSelection && this.taskPool.length > 0) {
      try {
        const llmTaskId = await window.llmTaskSelector.selectTask(agent, this.taskPool, this);
        
        if (llmTaskId !== null) {
          // LLM chose a task; find and remove it from pool, then execute
          const llmTask = this.taskPool.find(t => t.id === llmTaskId);
          if (llmTask) {
            this.taskPool = this.taskPool.filter(t => t !== llmTask);
            const p = this._successProb(agent, llmTask);
            const success = this.rng() < p;
            const involved = Object.keys(llmTask.required);

            if (success) {
              agent.credits += llmTask.reward;
              agent.xp += llmTask.xpReward;
              agent.tasksDone++;
              this.totals.tasksDone++;
              involved.forEach((d) => this._improve(agent, d, 2.2 + llmTask.difficulty * 3));
              if (llmTask.knowledgeReward) this._grantKnowledge(agent, llmTask.knowledgeReward.domain, llmTask.knowledgeReward.quality);
              const g = this.currentGoal;
              if (g && g.status === 'active' && g.type === 'tasks' && llmTask.primary === g.domain) g.done++;
              this._logAgent(agent, `[LLM] Solved "${llmTask.name}" (+${llmTask.reward}c)`);
              this._emit('task', `${agent.name} solved "${llmTask.name}" (+${llmTask.reward}c)`, agent.color);
            } else {
              agent.tasksFailed++;
              agent.xp += Math.round(llmTask.xpReward * 0.4);
              this.totals.tasksFailed++;
              involved.forEach((d) => this._improve(agent, d, 1 + llmTask.difficulty * 1.4));
              this._logAgent(agent, `[LLM] Failed "${llmTask.name}" — learning from it`);
              this._emit('fail', `${agent.name} failed "${llmTask.name}"`, '#94a3b8');
            }
            return;
          }
        }
      } catch (err) {
        console.error('LLM task selection failed, falling back to deterministic:', err);
      }
    }
    
    // Fall back to deterministic if LLM disabled or failed
    originalAttemptTask(agent);
  };

  // ---- one-time scaffolding ----------------------------------------------
  function buildLegend() {
    el('legend').innerHTML = DOMAINS.map(
      (d) => `<span class="legend-item"><i style="background:${d.color}"></i>${d.label}</span>`
    ).join('');
  }

  // Positions of the 5 agent nodes around a circle.
  function nodeLayout() {
    const cx = 260, cy = 220, r = 150;
    return sim.agents.map((a, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / sim.agents.length;
      return { a, x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
    });
  }

  // ---- network graph ------------------------------------------------------
  function renderNetwork() {
    const svg = el('network');
    const layout = nodeLayout();
    const posById = Object.fromEntries(layout.map((n) => [n.a.id, n]));
    const maxNet = Math.max(1, ...sim.agents.map((a) => sim.netWorth(a)));

    const parts = [];

    // Trade arcs from the most recent tick (animated).
    sim.lastTrades.forEach((t, i) => {
      const from = posById[t.from.id], to = posById[t.to.id];
      const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
      // Bow the arc toward the centre for a clean look.
      const cx = mx + (260 - mx) * 0.35, cy = my + (220 - my) * 0.35;
      const color = DOMAIN_BY_KEY[t.domain].color;
      const d = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
      parts.push(
        `<path d="${d}" class="trade-arc" style="stroke:${color};animation-delay:${i * 80}ms" />`,
        `<circle r="4" class="trade-dot" style="fill:${color};animation-delay:${i * 80}ms">
            <animateMotion dur="0.9s" begin="${i * 80}ms" fill="freeze" path="${d}" />
         </circle>`
      );
    });

    // Nodes.
    layout.forEach((n) => {
      const worth = sim.netWorth(n.a);
      const glow = 6 + (worth / maxNet) * 22;
      const isLeader = sim.leader().id === n.a.id;
      parts.push(`
        <g class="node ${isLeader ? 'leader' : ''}">
          <circle cx="${n.x}" cy="${n.y}" r="${22 + (worth / maxNet) * 10}"
                  fill="${n.a.color}22" stroke="${n.a.color}" stroke-width="2"
                  style="filter:drop-shadow(0 0 ${glow}px ${n.a.color}aa)" />
          <text x="${n.x}" y="${n.y - 2}" class="node-name" fill="#e2e8f0">${n.a.name}</text>
          <text x="${n.x}" y="${n.y + 13}" class="node-sub" fill="${n.a.color}">${worth}</text>
          ${isLeader ? `<text x="${n.x}" y="${n.y - 32}" class="node-crown">★</text>` : ''}
        </g>`);
    });

    svg.innerHTML = parts.join('');
  }

  // ---- metrics ------------------------------------------------------------
  function renderMetrics() {
    const avgSkill = Math.round(
      sim.agents.reduce((s, a) => s + sim.skillAvg(a), 0) / sim.agents.length
    );
    const knowledgeItems = sim.agents.reduce((s, a) => s + a.knowledge.length, 0);
    const cards = [
      { label: 'Value created', value: sim.totals.valueCreated, sub: `${sim.artifacts.length ? sim.artifacts.filter((a) => a.kind === 'shipped').length : 0} shipped`, hero: true },
      { label: 'Goals fulfilled', value: sim.totals.goalsMet, sub: `${sim.totals.goalsMissed} missed` },
      { label: 'Knowledge trades', value: sim.totals.trades, sub: `${sim.totals.creditsTraded}c moved` },
      { label: 'Tasks solved', value: sim.totals.tasksDone, sub: `${sim.totals.tasksFailed} failed` },
      { label: 'Knowledge items', value: knowledgeItems, sub: 'across all agents' },
      { label: 'Avg skill', value: avgSkill, sub: 'network mean' },
    ];
    el('metrics').innerHTML = cards
      .map(
        (c) => `<div class="metric${c.hero ? ' metric-hero' : ''}">
          <span class="metric-value">${c.value}</span>
          <span class="metric-label">${c.label}</span>
          <span class="metric-sub">${c.sub}</span>
        </div>`
      )
      .join('');
  }

  // ---- value portfolio ----------------------------------------------------
  function renderPortfolio() {
    el('value-total').textContent = `${sim.totals.valueCreated} total`;
    if (!sim.artifacts.length) {
      el('portfolio').innerHTML = '<span class="muted">Nothing shipped yet — fulfil a goal to create value.</span>';
      return;
    }
    el('portfolio').innerHTML = sim.artifacts
      .map((a) => {
        const col = DOMAIN_BY_KEY[a.domain].color;
        const dots = a.contributors
          .map((c) => `<span class="contrib" title="${c.name}"><i style="background:${c.color}"></i>${c.name}</span>`)
          .join('');
        return `<article class="artifact ${a.kind}" style="--c:${col}">
          <div class="artifact-top">
            <span class="artifact-value">${a.value}</span>
            <span class="artifact-kind kind-${a.kind}">${a.kind === 'shipped' ? 'Shipped' : 'Draft'}</span>
          </div>
          <h4 class="artifact-name">${a.name}</h4>
          <div class="artifact-meta">r${a.round} · ${a.bornFrom}</div>
          <div class="artifact-contribs">${dots}</div>
        </article>`;
      })
      .join('');
  }

  // ---- council ------------------------------------------------------------
  function renderCouncil() {
    const g = sim.currentGoal;
    const c = sim.council;
    const badge = el('council-badge');

    if (sim.awaitingUserTopic) {
      el('mission').innerHTML = `
        <div class="mission-label">Current mission</div>
        <h3 class="mission-title" style="color:#f59e0b">Awaiting your decision</h3>
        <p class="mission-goal">The council deadlocked — choose a topic to continue.</p>`;
    } else if (g) {
      const pct = Math.round(g.progress * 100);
      const domColor = DOMAIN_BY_KEY[g.domain].color;
      const roundsLeft = g.status === 'active' ? Math.max(0, g.deadline - sim.round) : 0;
      const cur =
        g.type === 'tasks' ? `${g.done}/${g.target} tasks`
        : g.type === 'knowledge' ? `${Math.round(g.current)}/${g.target} pts`
        : `${Math.round(g.current)}/${g.target} avg skill`;
      el('mission').innerHTML = `
        <div class="mission-label">Current mission</div>
        <h3 class="mission-title" style="color:${domColor}">${g.title}</h3>
        <p class="mission-goal">${g.goalText}</p>
        <div class="mission-bar"><i style="width:${pct}%;background:${domColor}"></i></div>
        <div class="mission-meta">
          <span class="status-pill status-${g.status}">${g.status}</span>
          <span>${cur} · ${pct}%</span>
          ${g.status === 'active' ? `<span>${roundsLeft} rounds left</span>` : ''}
        </div>`;
    } else {
      el('mission').innerHTML = '<div class="muted">No goal agreed yet.</div>';
    }

    if (!c) { el('deliberation').innerHTML = ''; badge.textContent = ''; return; }
    if (sim.awaitingUserTopic) {
      badge.textContent = 'Deadlock';
      badge.className = 'council-badge badge-deadlock';
    } else if (c.decidedBy === 'operator') {
      badge.textContent = 'Your choice';
      badge.className = 'council-badge badge-operator';
    } else {
      badge.textContent = c.consensus ? 'Consensus' : 'Majority';
      badge.className = 'council-badge ' + (c.consensus ? 'badge-consensus' : 'badge-majority');
    }

    const total = Object.values(c.tally).reduce((s, v) => s + v, 0) || 1;
    const bars = c.candidates
      .map((t) => {
        const share = (c.tally[t.id] || 0) / total;
        const win = !sim.awaitingUserTopic && t.id === c.agreedId;
        return `<div class="cand ${win ? 'cand-win' : ''}">
          <span class="cand-title">${win ? '✓ ' : ''}${t.title}</span>
          <span class="cand-track"><i style="width:${Math.round(share * 100)}%;background:${DOMAIN_BY_KEY[t.domain].color}"></i></span>
          <span class="cand-pct">${Math.round(share * 100)}%</span>
        </div>`;
      })
      .join('');

    const transcript = c.positions
      .map((p) => {
        const choice = c.candidates.find((t) => t.id === p.choiceId);
        const lines = p.transcript
          .map((l) => `<li class="role-${l.role.toLowerCase()}"><span class="role">${l.role}</span>${l.text}</li>`)
          .join('');
        return `<div class="pos">
          <div class="pos-head">
            <span class="pos-dot" style="background:${p.color}"></span>
            <b>${p.name}</b><span class="pos-strat">${p.strategy}</span>
            <span class="pos-vote">→ ${choice.title}${p.persuaded ? ' <em>(persuaded)</em>' : ''}</span>
          </div>
          <ul class="pos-args">${lines}</ul>
        </div>`;
      })
      .join('');

    el('deliberation').innerHTML = `
      <div class="delib-label">Round ${c.round} · ${c.deliberationRounds} debate round(s)</div>
      <div class="cands">${bars}</div>
      <div class="delib-label">Sub-agency arguments</div>
      <div class="transcript">${transcript}</div>`;
  }

  // ---- leaderboard --------------------------------------------------------
  function renderLeaderboard() {
    const ranked = [...sim.agents].sort((a, b) => sim.netWorth(b) - sim.netWorth(a));
    el('leaderboard').innerHTML = ranked
      .map((a, i) => {
        const rate = Math.round(sim.successRate(a) * 100);
        return `<li>
          <span class="rank">${i + 1}</span>
          <span class="lb-dot" style="background:${a.color}"></span>
          <span class="lb-name">${a.name}</span>
          <span class="lb-strategy">${a.strategy}</span>
          <span class="lb-net">${sim.netWorth(a)}</span>
          <span class="lb-rate">${rate}%</span>
        </li>`;
      })
      .join('');
  }

  // ---- activity ticker ----------------------------------------------------
  function renderTicker() {
    el('ticker').innerHTML = sim.events
      .slice(0, 12)
      .map(
        (e) => `<li class="ev ev-${e.type}">
          <span class="ev-round">r${e.round}</span>
          <span class="ev-dot" style="background:${e.color}"></span>
          <span class="ev-text">${e.text}</span>
        </li>`
      )
      .join('');
  }

  // ---- sparkline ----------------------------------------------------------
  function sparkline(values, color) {
    if (!values.length) return '';
    const w = 120, h = 26;
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    const pts = values
      .map((v, i) => {
        const x = (i / Math.max(1, values.length - 1)) * w;
        const y = h - ((v - min) / span) * (h - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" />
    </svg>`;
  }

  // ---- agent cards --------------------------------------------------------
  function renderAgents() {
    el('agents').innerHTML = sim.agents
      .map((a) => {
        const top = sim.topDomain(a);
        const bars = DOMAIN_KEYS.map((k) => {
          const d = DOMAIN_BY_KEY[k];
          const v = Math.round(a.skills[k]);
          return `<div class="skill">
            <span class="skill-label">${d.label}</span>
            <span class="skill-track"><i style="width:${v}%;background:${d.color}"></i></span>
            <span class="skill-val">${v}</span>
          </div>`;
        }).join('');

        const chips = a.knowledge
          .slice()
          .sort((x, y) => y.quality - x.quality)
          .map((k) => {
            const d = DOMAIN_BY_KEY[k.domain];
            return `<span class="chip" style="border-color:${d.color}66;color:${d.color}">
              ${d.label} <b>${k.quality}</b></span>`;
          })
          .join('');

        const logs = a.log
          .map((l) => `<li><span class="log-round">r${l.round}</span> ${l.text}</li>`)
          .join('');

        return `<article class="agent-card" style="--accent:${a.color}">
          <header class="agent-head">
            <span class="agent-dot" style="background:${a.color}"></span>
            <h3>${a.name}</h3>
            <span class="strategy-badge" title="${window.KTA.STRATEGIES[a.strategy]}">${a.strategy}</span>
          </header>
          <div class="agent-stats">
            <div><span class="stat-v">${Math.round(a.credits)}</span><span class="stat-l">credits</span></div>
            <div><span class="stat-v">${a.xp}</span><span class="stat-l">xp</span></div>
            <div class="stat-value"><span class="stat-v">${a.valueContributed}</span><span class="stat-l">value</span></div>
            <div><span class="stat-v">${a.tasksDone}/${a.tasksFailed}</span><span class="stat-l">win/loss</span></div>
            <div><span class="stat-v">${a.knowledge.length}</span><span class="stat-l">knowledge</span></div>
            <div><span class="stat-v">${sim.netWorth(a)}</span><span class="stat-l">net worth</span></div>
          </div>
          ${sparkline(a.history.net, a.color)}
          <div class="skills">${bars}</div>
          <div class="agent-section-label">Knowledge inventory</div>
          <div class="chips">${chips || '<span class="muted">none yet</span>'}</div>
          <div class="agent-section-label">Recent activity</div>
          <ul class="agent-log">${logs || '<li class="muted">—</li>'}</ul>
        </article>`;
      })
      .join('');
  }

  // ---- master render ------------------------------------------------------
  function render() {
    roundCounter.textContent = sim.round;
    renderMetrics();
    renderCouncil();
    renderPortfolio();
    renderNetwork();
    renderLeaderboard();
    renderTicker();
    renderAgents();
  }

  // ---- live topics mode -------------------------------------------------------
  window.liveTopics = new LiveTopics(sim);

  // Check if Live Topics UI elements exist
  const ltpPanel = el('live-topics-panel');
  if (ltpPanel) {
  const btnToggleLTP = el('btn-toggle-live-topics');
  const btnCloseLTP = el('btn-close-ltp');
  const btnCreateTopic = el('btn-create-topic');
  const ltpDifficultySlider = el('ltp-difficulty');

  // Toggle panel visibility
  btnToggleLTP.addEventListener('click', () => {
    ltpPanel.hidden = !ltpPanel.hidden;
    if (!ltpPanel.hidden) refreshLiveTopicsUI();
  });

  btnCloseLTP.addEventListener('click', () => {
    ltpPanel.hidden = true;
  });

  // Update difficulty display as user adjusts slider
  ltpDifficultySlider.addEventListener('input', (e) => {
    el('ltp-difficulty-display').textContent = e.target.value;
  });

  // Create topic button
  btnCreateTopic.addEventListener('click', () => {
    const title = el('ltp-title').value.trim();
    const description = el('ltp-description').value.trim();
    const domain = el('ltp-domain').value;
    const difficulty = parseFloat(el('ltp-difficulty').value);
    const reward = parseInt(el('ltp-reward').value);

    if (!title) {
      alert('Please enter a topic title');
      return;
    }

    const topic = window.liveTopics.createTopic({
      title, description, domain, difficulty, reward,
    });

    console.log(`✓ Created topic: "${topic.title}" (reward: ${topic.reward}c)`);

    // Clear form
    el('ltp-title').value = '';
    el('ltp-description').value = '';
    el('ltp-domain').value = 'General';
    el('ltp-difficulty').value = '0.5';
    el('ltp-difficulty-display').textContent = '0.5';
    el('ltp-reward').value = '100';

    refreshLiveTopicsUI();
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      refreshLiveTopicsUI();
    });
  });
  } else {
  console.warn('⚠ Live Topics UI elements not found - Live Topics mode disabled');
  }

  /**
   * Refresh the live topics UI
   */
  function refreshLiveTopicsUI() {
    const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
    let topics = window.liveTopics.topics;

    if (activeFilter !== 'all') {
      topics = window.liveTopics.getTopicsByStatus(activeFilter);
    }

    const topicsHTML = topics.map(t => {
      const agent = sim.agents.find(a => a.id === t.claimedBy);
      const completedAgent = sim.agents.find(a => a.id === t.completedBy);

      let statusLabel = t.status.toUpperCase().replace('_', ' ');
      if (agent) statusLabel += ` by ${agent.name}`;
      if (completedAgent) statusLabel = `✓ COMPLETED by ${completedAgent.name}`;

      const actionButtons = [];
      if (t.status === 'open') {
        actionButtons.push(`<button class="btn btn-secondary btn-claim" data-topic-id="${t.id}" title="Pick an agent to claim this">Assign</button>`);
      } else if (t.status === 'in_progress') {
        actionButtons.push(`<button class="btn-success" data-topic-id="${t.id}" data-success="true" title="Topic completed successfully">✓ Success</button>`);
        actionButtons.push(`<button class="btn-fail" data-topic-id="${t.id}" data-success="false" title="Topic failed, reset to open">✗ Failed</button>`);
      }

      return `<div class="topic-card">
        <div class="topic-info">
          <div class="topic-title">${t.title}</div>
          <div class="topic-meta">
            Domain: ${t.domain} | Difficulty: ${Math.round(t.difficulty * 100)}% | Reward: ${t.reward}c
          </div>
          ${t.description ? `<div class="topic-meta">${t.description}</div>` : ''}
          <span class="topic-status status-${t.status}">${statusLabel}</span>
        </div>
        <div class="topic-actions">
          ${actionButtons.join('')}
        </div>
      </div>`;
    }).join('');

    el('topics-container').innerHTML = topicsHTML || '<p style="color: var(--muted);">No topics yet. Create one above!</p>';

    // Attach claim/resolve handlers
    document.querySelectorAll('.btn-claim').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const topicId = parseInt(e.target.dataset.topicId);
        const topic = window.liveTopics.getTopicById(topicId);

        // Simple picker: let user choose an agent
        const agentNames = sim.agents.map(a => a.name).join(', ');
        const chosen = prompt(`Which agent claims "${topic.title}"?\nChoose from: ${agentNames}`);
        if (!chosen) return;

        const agent = sim.agents.find(a => a.name === chosen);
        if (!agent) {
          alert(`Agent "${chosen}" not found`);
          return;
        }

        window.liveTopics.claimTopic(topicId, agent);
        console.log(`${agent.name} claimed "${topic.title}"`);
        refreshLiveTopicsUI();
      });
    });

    document.querySelectorAll('[data-success]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const topicId = parseInt(e.target.dataset.topicId);
        const success = e.target.dataset.success === 'true';
        const topic = window.liveTopics.getTopicById(topicId);
        const agent = sim.agents.find(a => a.id === topic.claimedBy);

        window.liveTopics.resolveTopic(topicId, agent.id, success);
        const result = success ? '✓ Success' : '✗ Failed';
        console.log(`${agent.name} ${result} on "${topic.title}"`);

        if (success) {
          sim._emit('task', `${agent.name} completed "${topic.title}" (+${topic.reward}c)`, agent.color);
        } else {
          sim._emit('fail', `${agent.name} failed "${topic.title}"`, '#94a3b8');
        }

        refreshLiveTopicsUI();
        render(); // Refresh main dashboard
      });
    });

    // Update stats
    const stats = window.liveTopics.getStats();
    el('ltp-stats-display').innerHTML = `
      <div class="stat-item">
        <div class="stat-value">${stats.total}</div>
        <div class="stat-label">Total</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.open}</div>
        <div class="stat-label">Open</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.inProgress}</div>
        <div class="stat-label">In Progress</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.completed}</div>
        <div class="stat-label">Completed</div>
      </div>
    `;
  }

  buildLegend();
  render();
})();
