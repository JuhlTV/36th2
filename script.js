const AUTH_STORAGE_KEY = 'sc36.auth.session';
const AUTH_TTL_MS = 1000 * 60 * 60 * 12;
const AUTH_USERS = {
  texer: { password: 'republic36', role: 'Senior Commander' },
  arflead: { password: 'recon36', role: 'ARF Lead' },
  technical: { password: 'wrench36', role: 'Technical Lead' },
  medic: { password: 'medica36', role: 'Medic Lead' },
};

const currentPage = document.body.dataset.page || window.location.pathname.split('/').pop() || 'index.html';
const isLoginPage = currentPage === 'login.html';

const getAuthSession = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const session = JSON.parse(raw);
    if (!session?.user || !session?.issuedAt) {
      return null;
    }
    const expired = Date.now() - Number(session.issuedAt) > AUTH_TTL_MS;
    return expired ? null : session;
  } catch (_) {
    return null;
  }
};

const clearAuthSession = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};

const saveAuthSession = (user, role) => {
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      user,
      role,
      issuedAt: Date.now(),
    })
  );
};

const setupLoginPage = () => {
  const form = document.querySelector('#login-form');
  if (!form) {
    return;
  }

  const userInput = document.querySelector('#login-user');
  const passInput = document.querySelector('#login-pass');
  const errorEl = document.querySelector('#login-error');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const user = userInput?.value?.trim().toLowerCase() || '';
    const pass = passInput?.value || '';
    const account = AUTH_USERS[user];

    if (!account || account.password !== pass) {
      if (errorEl) {
        errorEl.classList.remove('hidden');
      }
      return;
    }

    saveAuthSession(user, account.role);
    const next = new URLSearchParams(window.location.search).get('next') || 'command-hub.html';
    window.location.replace(next);
  });
};

const mountAuthChip = (session) => {
  if (!session || isLoginPage || document.querySelector('.auth-chip')) {
    return;
  }

  const chip = document.createElement('div');
  chip.className = 'auth-chip';
  chip.innerHTML = `<span class="auth-chip-label">USER: ${session.user.toUpperCase()} | ${session.role}</span>`;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'LOGOUT';
  btn.addEventListener('click', () => {
    clearAuthSession();
    window.location.replace('login.html');
  });

  chip.appendChild(btn);
  document.body.appendChild(chip);
};

const enforceAuth = () => {
  const session = getAuthSession();

  if (isLoginPage) {
    if (session) {
      const next = new URLSearchParams(window.location.search).get('next') || 'command-hub.html';
      window.location.replace(next);
      return null;
    }
    setupLoginPage();
    return null;
  }

  if (!session) {
    clearAuthSession();
    const nextParam = encodeURIComponent(currentPage || 'index.html');
    window.location.replace(`login.html?next=${nextParam}`);
    return null;
  }

  mountAuthChip(session);
  return session;
};

enforceAuth();

const revealItems = document.querySelectorAll('.reveal');

if (revealItems.length > 0) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      root: null,
      rootMargin: '0px 0px -10% 0px',
      threshold: 0.15,
    }
  );

  revealItems.forEach((item, index) => {
    item.style.transitionDelay = `${Math.min(index * 70, 240)}ms`;
    observer.observe(item);
  });
}

if (currentPage) {
  document.querySelectorAll('.hud-nav a[data-page]').forEach((link) => {
    if (link.dataset.page === currentPage) {
      link.classList.add('is-active');
    }
  });
}

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (event) => {
    const targetId = anchor.getAttribute('href');
    if (!targetId || targetId === '#') {
      return;
    }

    const target = document.querySelector(targetId);
    if (!target) {
      return;
    }

    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

const meterFills = document.querySelectorAll('.meter-fill');
if (meterFills.length > 0) {
  const animateMeters = () => {
    meterFills.forEach((fill, index) => {
      const rawValue = Number(fill.dataset.value || 0);
      const clamped = Math.max(0, Math.min(rawValue, 100));

      setTimeout(() => {
        fill.style.width = `${clamped}%`;
      }, 110 + index * 90);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', animateMeters);
  } else {
    animateMeters();
  }
}

const deptControls = document.querySelectorAll('.dept-control[data-dept]');
const deptPanels = document.querySelectorAll('.dept-info-panel[data-dept]');
const deptNodeTargets = document.querySelectorAll('[data-dept-node]');

if ((deptControls.length > 0 || deptNodeTargets.length > 0) && deptPanels.length > 0) {
  const activateDept = (dept) => {
    deptControls.forEach((control) => {
      control.classList.toggle('is-active', control.dataset.dept === dept);
    });

    deptNodeTargets.forEach((nodeTarget) => {
      nodeTarget.classList.toggle('is-active-node', nodeTarget.dataset.deptNode === dept);
    });

    deptPanels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.dept === dept);
    });
  };

  deptControls.forEach((control) => {
    control.addEventListener('click', () => {
      activateDept(control.dataset.dept);
    });
  });

  deptNodeTargets.forEach((nodeTarget) => {
    nodeTarget.addEventListener('click', () => {
      activateDept(nodeTarget.dataset.deptNode);
    });
  });

  const initialActive = document.querySelector('.dept-control.is-active')?.dataset.dept || 'command';
  activateDept(initialActive);
}

const missionStatus = document.querySelector('#mission-status');
const missionDifficulty = document.querySelector('#mission-difficulty');
const missionDepartment = document.querySelector('#mission-department');
const missionCards = document.querySelectorAll('.mission-card');
const missionEmpty = document.querySelector('#mission-empty');

if (missionCards.length > 0 && missionStatus && missionDifficulty && missionDepartment) {
  const applyMissionFilters = () => {
    const fStatus = missionStatus.value;
    const fDifficulty = missionDifficulty.value;
    const fDepartment = missionDepartment.value;
    let visible = 0;

    missionCards.forEach((card) => {
      const okStatus = fStatus === 'all' || card.dataset.status === fStatus;
      const okDifficulty = fDifficulty === 'all' || card.dataset.difficulty === fDifficulty;
      const okDepartment = fDepartment === 'all' || card.dataset.department === fDepartment;
      const show = okStatus && okDifficulty && okDepartment;
      card.classList.toggle('hidden', !show);
      if (show) {
        visible += 1;
      }
    });

    if (missionEmpty) {
      missionEmpty.classList.toggle('hidden', visible !== 0);
    }
  };

  [missionStatus, missionDifficulty, missionDepartment].forEach((el) => {
    el.addEventListener('change', applyMissionFilters);
  });

  applyMissionFilters();
}

const recruitForm = document.querySelector('#recruit-form');
if (recruitForm) {
  const recruitOutput = document.querySelector('#recruit-output');
  recruitForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.querySelector('#rec-name')?.value?.trim() || '-';
    const experience = document.querySelector('#rec-experience')?.value || '-';
    const role = document.querySelector('#rec-role')?.value || '-';
    const availability = document.querySelector('#rec-availability')?.value?.trim() || '-';
    const story = document.querySelector('#rec-story')?.value?.trim() || '-';

    const output = [
      '[36th Storm Corps | Rekrutenantrag]',
      `Name/Callsign: ${name}`,
      `RP-Erfahrung: ${experience}`,
      `Gewuenschte Rolle: ${role}`,
      `Verfuegbarkeit: ${availability}`,
      'Charaktervorstellung:',
      story,
      '',
      'Erklaerung: Ich akzeptiere das Einheitsregelwerk und die Corps-Disziplin.',
    ].join('\n');

    if (recruitOutput) {
      recruitOutput.value = output;
      recruitOutput.focus();
      recruitOutput.select();
    }
  });
}

const rankTrainingSelect = document.querySelector('#rank-training-select');
if (rankTrainingSelect) {
  const missingTrainings = document.querySelector('#missing-trainings');
  const rankMissingMap = {
    private: ['Urban Combat', 'Defensive Operations'],
    pfc: ['Thermal Granaten', 'Combat Survival'],
    specialist: ['Tactical Recon', 'Heavy Weapons'],
    corporal: ['Tactical Leadership'],
    sergeant: ['RSTGB'],
  };

  const renderMissing = () => {
    if (!missingTrainings) {
      return;
    }
    const rank = rankTrainingSelect.value;
    const entries = rankMissingMap[rank] || [];
    missingTrainings.innerHTML = entries.map((item) => `<li>${item}</li>`).join('');
  };

  rankTrainingSelect.addEventListener('change', renderMissing);
  renderMissing();
}

const rankControls = document.querySelectorAll('#rank-controls [data-rank]');
if (rankControls.length > 0) {
  const rankData = {
    private: {
      title: 'Private',
      trainings: 'Advanced Blaster Handling, Urban Combat, Defensive Operations',
      reqs: 'Grundausbildung, Regelwerk-Einweisung',
      next: 'Private First Class',
    },
    pfc: {
      title: 'Private First Class',
      trainings: 'Thermal Granaten, Combat Survival, Field Communication',
      reqs: 'Aktivitaet, 2 absolvierte Basismodule',
      next: 'Specialist',
    },
    specialist: {
      title: 'Specialist',
      trainings: 'BARC Speeder, Tactical Recon, Heavy Weapons',
      reqs: 'Spezialisierungsempfehlung durch NCO',
      next: 'Corporal',
    },
    corporal: {
      title: 'Corporal',
      trainings: 'Tactical Leadership, Squad Coordination',
      reqs: 'Fuehrungsassessment, stabile Einsatzquote',
      next: 'Sergeant',
    },
    sergeant: {
      title: 'Sergeant',
      trainings: 'RSTGB, Advanced Tactical Command',
      reqs: 'Disziplinarfreigabe, Command-Empfehlung',
      next: 'Master Sergeant',
    },
  };

  const titleEl = document.querySelector('#rank-title');
  const trainingsEl = document.querySelector('#rank-trainings');
  const reqsEl = document.querySelector('#rank-reqs');
  const nextEl = document.querySelector('#rank-next');

  const activateRank = (rank) => {
    rankControls.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.rank === rank);
    });
    const data = rankData[rank];
    if (!data || !titleEl || !trainingsEl || !reqsEl || !nextEl) {
      return;
    }
    titleEl.textContent = data.title;
    trainingsEl.textContent = data.trainings;
    reqsEl.textContent = data.reqs;
    nextEl.textContent = data.next;
  };

  rankControls.forEach((btn) => {
    btn.addEventListener('click', () => activateRank(btn.dataset.rank));
  });

  activateRank(document.querySelector('#rank-controls .is-active')?.dataset.rank || 'private');
}

const debriefCards = document.querySelectorAll('.debrief-card');
if (debriefCards.length > 0) {
  const dateInput = document.querySelector('#debrief-date');
  const locationInput = document.querySelector('#debrief-location');
  const deptInput = document.querySelector('#debrief-department');
  const emptyDebrief = document.querySelector('#debrief-empty');

  const filterDebriefs = () => {
    const fDate = (dateInput?.value || '').trim();
    const fLocation = (locationInput?.value || '').trim().toLowerCase();
    const fDept = deptInput?.value || 'all';
    let visible = 0;

    debriefCards.forEach((card) => {
      const okDate = !fDate || card.dataset.date === fDate;
      const okLocation = !fLocation || (card.dataset.location || '').includes(fLocation);
      const okDept = fDept === 'all' || card.dataset.department === fDept;
      const show = okDate && okLocation && okDept;
      card.classList.toggle('hidden', !show);
      if (show) {
        visible += 1;
      }
    });

    if (emptyDebrief) {
      emptyDebrief.classList.toggle('hidden', visible !== 0);
    }
  };

  [dateInput, locationInput, deptInput].forEach((el) => {
    if (!el) {
      return;
    }
    el.addEventListener('input', filterDebriefs);
    el.addEventListener('change', filterDebriefs);
  });

  filterDebriefs();
}

const characterFilter = document.querySelector('#char-filter-specialization');
if (characterFilter) {
  const characterCards = document.querySelectorAll('.character-card');
  const applyCharacterFilter = () => {
    const selected = characterFilter.value;
    characterCards.forEach((card) => {
      const dim = selected !== 'all' && card.dataset.specialization !== selected;
      card.classList.toggle('is-dim', dim);
    });
  };

  characterFilter.addEventListener('change', applyCharacterFilter);
  applyCharacterFilter();
}

const initCommandHubLive = () => {
  const hubClock = document.querySelector('#hub-clock');
  const hubAlert = document.querySelector('#hub-alert');
  const metricActive = document.querySelector('#hub-metric-active');
  const metricPlanned = document.querySelector('#hub-metric-planned');
  const metricComplete = document.querySelector('#hub-metric-complete');
  const metricDebriefs = document.querySelector('#hub-metric-debriefs');
  const noteCritical = document.querySelector('#hub-note-critical');
  const noteLocation = document.querySelector('#hub-note-location');
  const noteLastDate = document.querySelector('#hub-note-lastdate');

  if (
    !hubClock &&
    !hubAlert &&
    !metricActive &&
    !metricPlanned &&
    !metricComplete &&
    !metricDebriefs
  ) {
    return;
  }

  const animateNumber = (element, target, suffix = '') => {
    if (!element) {
      return;
    }
    let current = 0;
    const steps = 28;
    const increment = target / steps;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      element.textContent = `${Math.round(current)}${suffix}`;
    }, 22);
  };

  if (hubClock) {
    const tickClock = () => {
      const now = new Date();
      hubClock.textContent = now.toLocaleTimeString('de-DE', { hour12: false });
    };
    tickClock();
    setInterval(tickClock, 1000);
  }

  if (hubAlert) {
    const alerts = [
      'ALERT: MONITORING',
      'ALERT: PATROL SHIFT',
      'ALERT: COMMS UPDATE',
      'ALERT: MISSION SYNC',
    ];
    let idx = 0;
    setInterval(() => {
      idx = (idx + 1) % alerts.length;
      hubAlert.textContent = alerts[idx];
    }, 4200);
  }

  const applyFallback = () => {
    animateNumber(metricActive, 0);
    animateNumber(metricPlanned, 0);
    animateNumber(metricComplete, 0);
    animateNumber(metricDebriefs, 0);
    if (noteCritical) {
      noteCritical.textContent = 'Kritische Lagen: --';
    }
    if (noteLocation) {
      noteLocation.textContent = 'Letzter Debrief-Ort: --';
    }
    if (noteLastDate) {
      noteLastDate.textContent = 'Letzter Eintrag: --';
    }
  };

  const fetchDoc = async (page) => {
    const response = await fetch(page, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Fetch failed: ${page}`);
    }
    const text = await response.text();
    return new DOMParser().parseFromString(text, 'text/html');
  };

  const loadHubMetrics = async () => {
    try {
      const [missionDoc, debriefDoc] = await Promise.all([
        fetchDoc('missionsboard.html'),
        fetchDoc('nachberichte.html'),
      ]);

      const missions = Array.from(missionDoc.querySelectorAll('.mission-card'));
      const debriefs = Array.from(debriefDoc.querySelectorAll('.debrief-card'));

      const activeCount = missions.filter((m) => m.dataset.status === 'aktiv').length;
      const plannedCount = missions.filter((m) => m.dataset.status === 'geplant').length;
      const completedCount = missions.filter((m) => m.dataset.status === 'abgeschlossen').length;
      const criticalCount = missions.filter((m) => m.dataset.difficulty === 'kritisch').length;

      const lastDebrief = debriefs
        .slice()
        .sort((a, b) => String(b.dataset.date || '').localeCompare(String(a.dataset.date || '')))[0];

      const lastLocation = lastDebrief?.dataset.location || '--';
      const lastDate = lastDebrief?.dataset.date || '--';

      animateNumber(metricActive, activeCount);
      animateNumber(metricPlanned, plannedCount);
      animateNumber(metricComplete, completedCount);
      animateNumber(metricDebriefs, debriefs.length);

      if (noteCritical) {
        noteCritical.textContent = `Kritische Lagen: ${criticalCount}`;
      }
      if (noteLocation) {
        noteLocation.textContent = `Letzter Debrief-Ort: ${lastLocation}`;
      }
      if (noteLastDate) {
        noteLastDate.textContent = `Letzter Eintrag: ${lastDate}`;
      }
    } catch (_) {
      applyFallback();
    }
  };

  loadHubMetrics();
};

initCommandHubLive();

const setupAmbientMode = () => {
  if (document.querySelector('.ambient-toggle')) {
    return;
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ambient-toggle';
  toggle.textContent = 'AMBIENCE: OFF';
  document.body.appendChild(toggle);

  let enabled = localStorage.getItem('hudAmbientEnabled') === '1';
  let ctx = null;
  let ambientGain = null;
  let oscillators = [];

  const renderState = () => {
    toggle.classList.toggle('is-on', enabled);
    toggle.textContent = `AMBIENCE: ${enabled ? 'ON' : 'OFF'}`;
  };

  const stopAmbient = () => {
    oscillators.forEach((osc) => {
      try {
        osc.stop();
      } catch (_) {
        // ignore already stopped nodes
      }
    });
    oscillators = [];
    if (ambientGain) {
      ambientGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    }
  };

  const startAmbient = async () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.02;
    ambientGain.connect(ctx.destination);

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 54;
    const gainA = ctx.createGain();
    gainA.gain.value = 0.22;
    oscA.connect(gainA).connect(ambientGain);

    const oscB = ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.value = 82;
    const gainB = ctx.createGain();
    gainB.gain.value = 0.12;
    oscB.connect(gainB).connect(ambientGain);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(ambientGain.gain);

    [oscA, oscB, lfo].forEach((osc) => osc.start());
    oscillators = [oscA, oscB, lfo];
  };

  const beep = async () => {
    if (!enabled) {
      return;
    }
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 820;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.13);
  };

  toggle.addEventListener('click', async () => {
    enabled = !enabled;
    localStorage.setItem('hudAmbientEnabled', enabled ? '1' : '0');
    if (enabled) {
      await startAmbient();
      await beep();
    } else {
      stopAmbient();
    }
    renderState();
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }
    if (event.target.closest('a, button, select, input, textarea')) {
      beep();
    }
  });

  renderState();
};

setupAmbientMode();
