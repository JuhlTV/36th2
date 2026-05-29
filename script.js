const AUTH_STORAGE_KEY = 'sc36.auth.session';
const AUTH_LOCK_KEY = 'sc36.auth.lock';
const AUTH_CONFIG_OVERRIDE_KEY = 'sc36.auth.config.override';
const currentPage = document.body.dataset.page || window.location.pathname.split('/').pop() || 'index.html';
const isLoginPage = currentPage === 'login.html';
const isAdminPage = currentPage === 'admin-auth.html';

const DEFAULT_AUTH_CONFIG = {
  logo: '90b2f19b-4dfd-48df-9bec-dfad5390eb02.png',
  authApiBase: '',
  authApiEnabled: false,
  sessionTtlMs: 1000 * 60 * 60 * 12,
  lockout: {
    maxAttempts: 5,
    durationMs: 1000 * 60 * 5,
  },
  defaultRedirect: 'index.html',
  roles: {
    command: 'Command',
    arf: 'ARF Lead',
    technical: 'Technical Lead',
    medic: 'Medic Lead',
  },
  users: [],
  pageAccess: {
    'admin-auth.html': ['command'],
    'command-hub.html': ['command'],
    'auszeichnungen.html': ['command'],
    'rangfreischaltung.html': ['command'],
    'nachberichte.html': ['command', 'arf', 'technical', 'medic'],
    '*': ['command', 'arf', 'technical', 'medic'],
  },
};

let AUTH_CONFIG = DEFAULT_AUTH_CONFIG;

const normalizeApiBase = (base) => String(base || '').trim().replace(/\/+$/, '');

const getAuthApiBase = () => normalizeApiBase(AUTH_CONFIG.authApiBase || '');

const isAuthApiEnabled = () => {
  if (!AUTH_CONFIG.authApiEnabled) {
    return false;
  }
  const base = getAuthApiBase();
  return /^https?:\/\//.test(base);
};

const authApiFetch = async (path, init = {}) => {
  const base = getAuthApiBase();
  if (!base) {
    throw new Error('AUTH_API_BASE_MISSING');
  }

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }

  return { response, payload };
};

const normalizeConfig = (rawConfig = {}) => {
  const config = {
    ...DEFAULT_AUTH_CONFIG,
    ...rawConfig,
    lockout: { ...DEFAULT_AUTH_CONFIG.lockout, ...(rawConfig.lockout || {}) },
    roles: { ...DEFAULT_AUTH_CONFIG.roles, ...(rawConfig.roles || {}) },
    pageAccess: { ...DEFAULT_AUTH_CONFIG.pageAccess, ...(rawConfig.pageAccess || {}) },
    users: Array.isArray(rawConfig.users) && rawConfig.users.length > 0 ? rawConfig.users : DEFAULT_AUTH_CONFIG.users,
  };

  const sanitizedUsers = config.users
    .map((user) => ({
      username: String(user.username || '').trim().toLowerCase(),
      password: String(user.password || ''),
      role: String(user.role || '').trim(),
    }))
    .filter((user) => user.username && user.password && user.role);

  const roles = Object.keys(config.roles || {});
  config.users = sanitizedUsers.filter((user) => roles.includes(user.role));

  const normalizeAccess = (value) => {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((role) => roles.includes(role));
  };

  config.pageAccess = Object.entries(config.pageAccess || {}).reduce((acc, [page, allowedRoles]) => {
    acc[page] = normalizeAccess(allowedRoles);
    return acc;
  }, {});

  if (!config.pageAccess['*'] || config.pageAccess['*'].length === 0) {
    config.pageAccess['*'] = roles;
  }

  if (!isPageAllowedForConfig(config, 'command', 'admin-auth.html')) {
    config.pageAccess['admin-auth.html'] = ['command'];
  }

  if (!roles.includes('command')) {
    config.roles.command = 'Command';
    config.pageAccess['*'] = Array.from(new Set([...config.pageAccess['*'], 'command']));
  }

  if (!roles.includes(config.defaultRedirectRole)) {
    delete config.defaultRedirectRole;
  }

  return config;
};

function isPageAllowedForConfig(config, role, page) {
  const acl = config.pageAccess || {};
  const allow = acl[page] || acl['*'] || [];
  return allow.includes(role);
}

const getLocalConfigOverride = () => {
  try {
    const raw = localStorage.getItem(AUTH_CONFIG_OVERRIDE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

const loadAuthConfig = async () => {
  const localOverride = getLocalConfigOverride();
  if (localOverride) {
    return normalizeConfig(localOverride);
  }

  try {
    const response = await fetch('auth-config.json', { cache: 'no-store' });
    if (!response.ok) {
      return DEFAULT_AUTH_CONFIG;
    }
    const config = await response.json();
    return normalizeConfig(config);
  } catch (_) {
    return DEFAULT_AUTH_CONFIG;
  }
};

const getUserMap = () => {
  return AUTH_CONFIG.users.reduce((acc, user) => {
    const key = String(user.username || '').toLowerCase();
    if (key) {
      acc[key] = user;
    }
    return acc;
  }, {});
};

const getAuthSession = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const session = JSON.parse(raw);
    if (!session?.user || !session?.issuedAt || !session?.role) {
      return null;
    }

    if (isAuthApiEnabled() && !session?.token) {
      return null;
    }

    const expired = Date.now() - Number(session.issuedAt) > Number(AUTH_CONFIG.sessionTtlMs || DEFAULT_AUTH_CONFIG.sessionTtlMs);
    return expired ? null : session;
  } catch (_) {
    return null;
  }
};

const clearAuthSession = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};

const saveAuthSession = (user, role, token = null, issuedAt = Date.now()) => {
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      user,
      role,
      token,
      issuedAt,
    })
  );
};

const getLockState = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_LOCK_KEY) || '{}');
  } catch (_) {
    return {};
  }
};

const setLockState = (state) => {
  localStorage.setItem(AUTH_LOCK_KEY, JSON.stringify(state));
};

const clearLockState = () => {
  localStorage.removeItem(AUTH_LOCK_KEY);
};

const isPageAllowed = (role, page) => {
  return isPageAllowedForConfig(AUTH_CONFIG, role, page);
};

const ensureAdminNavLink = () => {
  const nav = document.querySelector('.hud-nav');
  if (!nav || nav.querySelector('a[data-page="admin-auth.html"]')) {
    return;
  }
  const link = document.createElement('a');
  link.href = 'admin-auth.html';
  link.dataset.page = 'admin-auth.html';
  link.textContent = 'Admin-Konsole';
  nav.appendChild(link);
};

const getRoleHome = (role) => {
  const preferred = AUTH_CONFIG.defaultRedirect || 'index.html';
  if (isPageAllowed(role, preferred)) {
    return preferred;
  }

  const pageAccess = AUTH_CONFIG.pageAccess || {};
  const pages = Object.keys(pageAccess).filter((page) => page !== '*');
  const firstAllowed = pages.find((page) => isPageAllowed(role, page));
  if (firstAllowed) {
    return firstAllowed;
  }

  return 'index.html';
};

const mountLogo = () => {
  const logoPath = AUTH_CONFIG.logo || DEFAULT_AUTH_CONFIG.logo;
  if (!logoPath) {
    return;
  }

  const loginPanel = document.querySelector('.login-panel');
  if (loginPanel && !loginPanel.querySelector('.site-logo-wrap')) {
    const wrap = document.createElement('div');
    wrap.className = 'site-logo-wrap';
    wrap.innerHTML = `<img class="site-logo" src="${logoPath}" alt="36th Storm Corps Logo" />`;
    loginPanel.prepend(wrap);
  }

  const headerShell = document.querySelector('.hud-header .hud-shell');
  if (headerShell && !headerShell.querySelector('.site-logo-inline')) {
    const emblem = document.createElement('div');
    emblem.className = 'site-logo-inline';
    emblem.innerHTML = `<img class="site-logo-mini" src="${logoPath}" alt="36th Storm Corps Logo" />`;
    headerShell.prepend(emblem);
  }
};

const filterNavigationByRole = (role) => {
  ensureAdminNavLink();
  document.querySelectorAll('.hud-nav a[data-page]').forEach((link) => {
    const page = link.dataset.page;
    const allowed = isPageAllowed(role, page);
    link.classList.toggle('hidden', !allowed);
  });
};

const setupSmartNav = () => {
  const nav = document.querySelector('.hud-nav');
  if (!nav) {
    return;
  }

  const existingMore = nav.querySelector('.hud-nav-more');
  if (existingMore) {
    const panel = existingMore.querySelector('.hud-nav-more-panel');
    if (panel) {
      Array.from(panel.querySelectorAll('a[data-page]')).forEach((link) => {
        nav.insertBefore(link, existingMore);
      });
    }
    existingMore.remove();
  }

  const links = Array.from(nav.querySelectorAll('a[data-page]'));
  const visibleLinks = links.filter((link) => !link.classList.contains('hidden'));
  const maxVisible = window.innerWidth < 760 ? 4 : 8;

  if (visibleLinks.length <= maxVisible) {
    return;
  }

  const overflow = visibleLinks.slice(maxVisible);
  const more = document.createElement('div');
  more.className = 'hud-nav-more';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'hud-nav-more-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = `MEHR +${overflow.length}`;

  const panel = document.createElement('div');
  panel.className = 'hud-nav-more-panel';

  overflow.forEach((link) => panel.appendChild(link));

  if (panel.querySelector('a.is-active')) {
    toggle.classList.add('is-active');
  }

  toggle.addEventListener('click', () => {
    const nextState = !more.classList.contains('is-open');
    more.classList.toggle('is-open', nextState);
    toggle.setAttribute('aria-expanded', nextState ? 'true' : 'false');
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Node) || !more.classList.contains('is-open')) {
      return;
    }
    if (!more.contains(event.target)) {
      more.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && more.classList.contains('is-open')) {
      more.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  more.appendChild(toggle);
  more.appendChild(panel);
  nav.appendChild(more);

  if (!window.__sc36NavResizeBound) {
    window.__sc36NavResizeBound = true;
    window.addEventListener('resize', () => {
      clearTimeout(window.__sc36NavResizeTimer);
      window.__sc36NavResizeTimer = setTimeout(() => {
        setupSmartNav();
      }, 120);
    });
  }
};

const setupLoginPage = () => {
  const form = document.querySelector('#login-form');
  if (!form) {
    return;
  }

  const userMap = getUserMap();
  const userInput = document.querySelector('#login-user');
  const passInput = document.querySelector('#login-pass');
  const errorEl = document.querySelector('#login-error');

  const storedUser = localStorage.getItem('sc36.auth.lastUser') || '';
  if (userInput && storedUser) {
    userInput.value = storedUser;
  }

  const showError = (code, message) => {
    if (!errorEl) {
      return;
    }
    errorEl.textContent = `${code}: ${message}`;
    errorEl.classList.remove('hidden');
    errorEl.dataset.state = 'error';
  };

  const clearError = () => {
    if (!errorEl) {
      return;
    }
    errorEl.classList.add('hidden');
    errorEl.dataset.state = '';
  };

  const renderLockState = () => {
    const lock = getLockState();
    if (lock.lockedUntil && Date.now() < Number(lock.lockedUntil)) {
      const remain = Math.ceil((Number(lock.lockedUntil) - Date.now()) / 1000);
      showError('E-423', `Zugang gesperrt. Erneut in ${remain}s.`);
      return true;
    }
    return false;
  };

  const lockTimer = setInterval(() => {
    if (!renderLockState()) {
      clearInterval(lockTimer);
      if ((errorEl?.dataset.state || '') !== 'error') {
        clearError();
      }
    }
  }, 1000);

  renderLockState();
  window.addEventListener('beforeunload', () => clearInterval(lockTimer), { once: true });

  [userInput, passInput].forEach((input) => {
    input?.addEventListener('input', () => {
      clearError();
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = userInput?.value?.trim().toLowerCase() || '';
    const password = passInput?.value || '';
    const lock = getLockState();

    if (lock.lockedUntil && Date.now() < Number(lock.lockedUntil)) {
      const remain = Math.ceil((Number(lock.lockedUntil) - Date.now()) / 1000);
      showError('E-423', `Zugang gesperrt. Erneut in ${remain}s.`);
      return;
    }

    const failAuth = () => {
      const attempts = Number(lock.attempts || 0) + 1;
      const maxAttempts = Number(AUTH_CONFIG.lockout.maxAttempts || 5);

      if (attempts >= maxAttempts) {
        const lockedUntil = Date.now() + Number(AUTH_CONFIG.lockout.durationMs || DEFAULT_AUTH_CONFIG.lockout.durationMs);
        setLockState({ attempts: 0, lockedUntil });
        const remain = Math.ceil((lockedUntil - Date.now()) / 1000);
        showError('E-423', `Zu viele Fehlversuche. Lockout aktiv (${remain}s).`);
      } else {
        setLockState({ attempts, lockedUntil: 0 });
        showError('E-401', `Ungueltige Zugangsdaten. Verbleibend: ${maxAttempts - attempts}`);
      }
    };

    if (isAuthApiEnabled()) {
      try {
        const { response, payload } = await authApiFetch('/api/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });

        if (!response.ok || !payload?.token || payload?.role !== 'command') {
          if (response.status === 423) {
            showError('E-423', 'Remote-Lockout aktiv. Bitte spaeter erneut pruefen.');
            return;
          }
          failAuth();
          return;
        }

        clearLockState();
        localStorage.setItem('sc36.auth.lastUser', username);
        saveAuthSession(
          String(payload.user || username).toLowerCase(),
          String(payload.role || 'command'),
          String(payload.token),
          payload.issuedAt ? Number(payload.issuedAt) : Date.now()
        );

        const next = new URLSearchParams(window.location.search).get('next') || 'admin-auth.html';
        window.location.replace(next);
        return;
      } catch (_) {
        showError('E-503', 'Auth-API nicht erreichbar.');
        return;
      }
    }

    const account = userMap[username];
    if (!account || account.password !== password) {
      failAuth();
      return;
    }

    if (account.role !== 'command') {
      showError('E-403', 'Login nur fuer Admin-Accounts freigegeben.');
      return;
    }

    clearLockState();
    localStorage.setItem('sc36.auth.lastUser', username);
    saveAuthSession(username, account.role, null, Date.now());
    const next = new URLSearchParams(window.location.search).get('next') || getRoleHome(account.role);
    if (!isPageAllowed(account.role, next)) {
      window.location.replace(getRoleHome(account.role));
      return;
    }
    window.location.replace(next);
  });
};

const mountAuthChip = (session) => {
  if (!session || isLoginPage || document.querySelector('.auth-chip')) {
    return;
  }

  const roleLabel = AUTH_CONFIG.roles?.[session.role] || session.role;
  const expiresInMs = Number(AUTH_CONFIG.sessionTtlMs || DEFAULT_AUTH_CONFIG.sessionTtlMs) - (Date.now() - Number(session.issuedAt || 0));
  const expiresHours = Math.max(0, Math.ceil(expiresInMs / (1000 * 60 * 60)));
  const chip = document.createElement('div');
  chip.className = 'auth-chip';
  chip.innerHTML = `<span class="auth-chip-label">USER: ${session.user.toUpperCase()} | ${roleLabel} | TTL ~${expiresHours}H</span>`;

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

const verifyApiSession = async (session) => {
  if (!isAuthApiEnabled()) {
    return { valid: true, role: session?.role || 'command', user: session?.user || '' };
  }

  if (!session?.token) {
    return { valid: false };
  }

  try {
    const { response, payload } = await authApiFetch('/api/session', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok || !payload?.valid) {
      return { valid: false };
    }

    return {
      valid: true,
      role: String(payload.role || session.role || 'command'),
      user: String(payload.user || session.user || '').toLowerCase(),
    };
  } catch (_) {
    return { valid: false };
  }
};

const setupAdminConsole = (session) => {
  const app = document.querySelector('#auth-admin-app');
  if (!app || !session) {
    return;
  }

  const roleContainer = app.querySelector('#admin-roles');
  const usersContainer = app.querySelector('#admin-users');
  const usersSection = app.querySelector('#admin-users-section');
  const pagesContainer = app.querySelector('#admin-pages');
  const statusEl = app.querySelector('#admin-status');
  const outputEl = app.querySelector('#admin-config-output');
  const addRoleBtn = app.querySelector('#admin-add-role');
  const addUserBtn = app.querySelector('#admin-add-user');
  const saveBtn = app.querySelector('#admin-save');
  const resetBtn = app.querySelector('#admin-reset');
  const downloadBtn = app.querySelector('#admin-download');
  const lockAttemptsInput = app.querySelector('#admin-lock-attempts');
  const lockDurationInput = app.querySelector('#admin-lock-duration');
  const ttlInput = app.querySelector('#admin-session-ttl');
  const redirectInput = app.querySelector('#admin-default-redirect');

  if (!roleContainer || !usersContainer || !pagesContainer || !statusEl || !outputEl) {
    return;
  }

  const state = JSON.parse(JSON.stringify(AUTH_CONFIG));
  const apiMode = isAuthApiEnabled();

  const setStatus = (type, text) => {
    statusEl.textContent = text;
    statusEl.className = `admin-status ${type}`;
  };

  const getRoleOptions = (selected = '') => {
    return Object.keys(state.roles)
      .map((role) => `<option value="${role}" ${selected === role ? 'selected' : ''}>${state.roles[role]} (${role})</option>`)
      .join('');
  };

  const allKnownPages = () => {
    const navPages = Array.from(document.querySelectorAll('.hud-nav a[data-page]')).map((link) => link.dataset.page);
    const configPages = Object.keys(state.pageAccess || {});
    const merged = Array.from(new Set([...navPages, ...configPages, 'admin-auth.html', 'command-hub.html', 'index.html', '*']))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return merged;
  };

  const syncOutput = () => {
    outputEl.value = JSON.stringify(state, null, 2);
  };

  const renderRoles = () => {
    const entries = Object.entries(state.roles || {});
    roleContainer.innerHTML = entries
      .map(
        ([key, label]) => `
          <article class="admin-item">
            <label>Rollen-Key
              <input data-role-key="${key}" value="${key}" />
            </label>
            <label>Rollen-Label
              <input data-role-label="${key}" value="${label}" />
            </label>
            ${key === 'command' ? '<p class="note">Command-Rolle ist geschuetzt.</p>' : `<button type="button" class="admin-remove" data-remove-role="${key}">Rolle entfernen</button>`}
          </article>
        `
      )
      .join('');
  };

  const renderUsers = () => {
    usersContainer.innerHTML = state.users
      .map(
        (user, idx) => `
          <article class="admin-item">
            <label>Username
              <input data-user-name="${idx}" value="${user.username}" />
            </label>
            <label>Passwort
              <input data-user-pass="${idx}" value="${user.password}" />
            </label>
            <label>Rolle
              <select data-user-role="${idx}">
                ${getRoleOptions(user.role)}
              </select>
            </label>
            <button type="button" class="admin-remove" data-remove-user="${idx}">User entfernen</button>
          </article>
        `
      )
      .join('');
  };

  const renderPages = () => {
    const roles = Object.keys(state.roles);
    pagesContainer.innerHTML = allKnownPages()
      .map((page) => {
        const allowed = state.pageAccess[page] || [];
        const checks = roles
          .map(
            (role) => `
              <label class="admin-check">
                <input type="checkbox" data-page="${page}" data-role="${role}" ${allowed.includes(role) ? 'checked' : ''} />
                <span>${state.roles[role]}</span>
              </label>
            `
          )
          .join('');

        return `
          <article class="admin-page-row">
            <p class="admin-page-name">${page}</p>
            <div class="admin-check-grid">${checks}</div>
          </article>
        `;
      })
      .join('');
  };

  const renderAll = () => {
    ttlInput.value = String(Math.round(Number(state.sessionTtlMs || 0) / 60000));
    lockAttemptsInput.value = String(state.lockout.maxAttempts || 5);
    lockDurationInput.value = String(Math.round(Number(state.lockout.durationMs || 0) / 1000));
    redirectInput.value = state.defaultRedirect || 'index.html';
    renderRoles();
    if (!apiMode) {
      renderUsers();
    }
    renderPages();
    syncOutput();
  };

  const collectStateFromUI = () => {
    const roleInputs = Array.from(roleContainer.querySelectorAll('[data-role-key]'));
    const labelInputs = Array.from(roleContainer.querySelectorAll('[data-role-label]'));
    const roleMap = {};

    roleInputs.forEach((input, idx) => {
      const key = input.value.trim().toLowerCase();
      const label = (labelInputs[idx]?.value || '').trim();
      if (key && label) {
        roleMap[key] = label;
      }
    });

    if (!roleMap.command) {
      roleMap.command = 'Command';
    }

    state.roles = roleMap;

    if (!apiMode) {
      state.users = Array.from(usersContainer.querySelectorAll('.admin-item'))
        .map((item) => {
          const username = String(item.querySelector('[data-user-name]')?.value || '').trim().toLowerCase();
          const password = String(item.querySelector('[data-user-pass]')?.value || '').trim();
          const role = String(item.querySelector('[data-user-role]')?.value || '').trim();
          return { username, password, role };
        })
        .filter((entry) => entry.username && entry.password && state.roles[entry.role]);
    } else {
      state.users = [];
    }

    const pages = allKnownPages();
    state.pageAccess = {};
    pages.forEach((page) => {
      const checkedRoles = Array.from(pagesContainer.querySelectorAll(`input[data-page="${page}"]:checked`)).map(
        (checkbox) => checkbox.dataset.role
      );
      state.pageAccess[page] = checkedRoles;
    });

    if (!state.pageAccess['*'] || state.pageAccess['*'].length === 0) {
      state.pageAccess['*'] = Object.keys(state.roles);
    }

    if (!state.pageAccess['admin-auth.html'] || !state.pageAccess['admin-auth.html'].includes('command')) {
      state.pageAccess['admin-auth.html'] = ['command'];
    }

    state.sessionTtlMs = Math.max(15, Number(ttlInput.value || 720)) * 60 * 1000;
    state.lockout.maxAttempts = Math.max(2, Number(lockAttemptsInput.value || 5));
    state.lockout.durationMs = Math.max(30, Number(lockDurationInput.value || 300)) * 1000;
    state.defaultRedirect = redirectInput.value.trim() || 'index.html';
  };

  addRoleBtn?.addEventListener('click', () => {
    collectStateFromUI();
    let i = 1;
    let key = `role${i}`;
    while (state.roles[key]) {
      i += 1;
      key = `role${i}`;
    }
    state.roles[key] = `Neue Rolle ${i}`;
    renderAll();
    setStatus('neutral', 'Neue Rolle hinzugefuegt.');
  });

  if (!apiMode) {
    addUserBtn?.addEventListener('click', () => {
      collectStateFromUI();
      state.users.push({ username: `user${state.users.length + 1}`, password: 'changeme', role: Object.keys(state.roles)[0] });
      renderAll();
      setStatus('neutral', 'Neuer User hinzugefuegt.');
    });
  }

  roleContainer.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const role = target.dataset.removeRole;
    if (!role) {
      return;
    }
    collectStateFromUI();
    delete state.roles[role];
    state.users = state.users.filter((user) => user.role !== role);
    Object.keys(state.pageAccess).forEach((page) => {
      state.pageAccess[page] = (state.pageAccess[page] || []).filter((entry) => entry !== role);
    });
    renderAll();
    setStatus('neutral', `Rolle ${role} entfernt.`);
  });

  if (!apiMode) {
    usersContainer.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const idx = target.dataset.removeUser;
      if (typeof idx === 'undefined') {
        return;
      }
      collectStateFromUI();
      state.users.splice(Number(idx), 1);
      renderAll();
      setStatus('neutral', 'User entfernt.');
    });
  }

  saveBtn?.addEventListener('click', () => {
    collectStateFromUI();
    const usernames = state.users.map((user) => user.username);
    const uniqueUsernames = new Set(usernames);
    if (uniqueUsernames.size !== usernames.length) {
      setStatus('error', 'Doppelte Usernamen erkannt. Bitte korrigieren.');
      return;
    }
    if (!apiMode && !state.users.some((user) => user.role === 'command')) {
      setStatus('error', 'Mindestens ein Command-User ist erforderlich.');
      return;
    }

    const normalized = normalizeConfig(state);
    localStorage.setItem(AUTH_CONFIG_OVERRIDE_KEY, JSON.stringify(normalized));
    AUTH_CONFIG = normalized;
    Object.assign(state, JSON.parse(JSON.stringify(normalized)));
    renderAll();
    setStatus('success', 'Konfiguration lokal gespeichert und sofort aktiv.');
  });

  resetBtn?.addEventListener('click', async () => {
    localStorage.removeItem(AUTH_CONFIG_OVERRIDE_KEY);
    AUTH_CONFIG = await loadAuthConfig();
    Object.assign(state, JSON.parse(JSON.stringify(AUTH_CONFIG)));
    renderAll();
    setStatus('neutral', 'Lokaler Override zurueckgesetzt. Datei-Konfiguration aktiv.');
  });

  downloadBtn?.addEventListener('click', () => {
    collectStateFromUI();
    const normalized = normalizeConfig(state);
    const blob = new Blob([JSON.stringify(normalized, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auth-config.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('success', 'auth-config.json exportiert.');
  });

  if (apiMode && usersSection) {
    usersSection.classList.add('hidden');
  }

  renderAll();
  setStatus(
    'neutral',
    apiMode
      ? 'Admin-Konsole bereit. Account-Verwaltung laeuft serverseitig ueber die Auth-API.'
      : 'Admin-Konsole bereit. Speichern aktiviert die Konfiguration lokal.'
  );
};

const enforceAuth = async () => {
  AUTH_CONFIG = await loadAuthConfig();
  ensureAdminNavLink();
  mountLogo();

  const session = getAuthSession();

  if (isLoginPage) {
    if (session) {
      if (isAuthApiEnabled()) {
        const apiSession = await verifyApiSession(session);
        if (!apiSession.valid) {
          clearAuthSession();
          setupLoginPage();
          return null;
        }
      }

      const next = new URLSearchParams(window.location.search).get('next') || 'admin-auth.html';
      if (isPageAllowed(session.role, next) && session.role === 'command') {
        window.location.replace(next);
      } else {
        window.location.replace('index.html');
      }
      return null;
    }
    setupLoginPage();
    return null;
  }

  if (isAdminPage) {
    if (!session) {
      clearAuthSession();
      const nextParam = encodeURIComponent(currentPage || 'admin-auth.html');
      window.location.replace(`login.html?next=${nextParam}`);
      return null;
    }

    const apiSession = await verifyApiSession(session);
    if (!apiSession.valid) {
      clearAuthSession();
      window.location.replace('login.html?next=admin-auth.html');
      return null;
    }

    session.role = apiSession.role;
    session.user = apiSession.user;

    if (session.role !== 'command' || !isPageAllowed(session.role, currentPage)) {
      window.location.replace('index.html');
      return null;
    }
  }

  if (session) {
    filterNavigationByRole(session.role);
    mountAuthChip(session);
    setupAdminConsole(session);
  }

  setupSmartNav();

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
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(output).catch(() => {
          // Clipboard access can fail on restrictive browsers; selection remains available.
        });
      }
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
  setInterval(loadHubMetrics, 45000);
};

initCommandHubLive();

const setupFooterBranding = () => {
  const footerLabel = document.querySelector('.hud-footer p');
  if (!footerLabel) {
    return;
  }

  const year = new Date().getFullYear();
  const stamp = ` | Copyright ${year} 36th Storm Corps`;
  if (!footerLabel.textContent.includes('36th Storm Corps')) {
    footerLabel.textContent = `${footerLabel.textContent}${stamp}`;
  }
};

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

setupFooterBranding();
setupAmbientMode();
