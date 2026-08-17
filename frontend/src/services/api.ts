import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// In-memory CSRF token cache.
// The XSRF-TOKEN cookie is JS-readable (not httpOnly), so we can seed this directly
// from the cookie on the very first request rather than waiting for a GET response.
let csrfToken: string | null = null;

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Methods that require a CSRF token
const CSRF_PROTECTED_METHODS = new Set(['post', 'put', 'patch', 'delete']);

// ---------- Concurrent-refresh lock ----------
// Only one refresh request runs at a time. Others queue behind the same promise.
let refreshPromise: Promise<void> | null = null;

function doRefresh(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = axios
    .post(
      `${API_URL}/auth/refresh-token`,
      {}, // Token comes from HttpOnly cookie
      { withCredentials: true }
    )
    .then(() => {
      // New access token is now in cookie — nothing to store
    })
    .catch((err) => {
      // Refresh failed — force logout
      cancelProactiveRefresh();
      cancelIdleLogout();
      sessionStorage.setItem('explicit_logout', 'true');
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
      throw err;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

// ---------- Proactive token refresh ----------
// Refresh every 50 minutes so the 1-hour access token never expires while the user
// is actively using the app. The interval resets on any user activity.
const PROACTIVE_REFRESH_MS = 25 * 60 * 1000; // 25 minutes
let proactiveTimer: ReturnType<typeof setTimeout> | null = null;

export function cancelProactiveRefresh() {
  if (proactiveTimer) {
    clearTimeout(proactiveTimer);
    proactiveTimer = null;
  }
}

function scheduleProactiveRefresh() {
  if (proactiveTimer) clearTimeout(proactiveTimer);
  proactiveTimer = setTimeout(() => {
    // Only refresh if the user is still authenticated
    if (useAuthStore.getState().isAuthenticated) {
      doRefresh().catch(() => {
        // Error already handled inside doRefresh
      });
    }
  }, PROACTIVE_REFRESH_MS);
}

// ---------- Idle timeout ----------
// Sign the user out after 60 minutes with no tracked activity, independent of the
// proactive refresh above. Unlike the refresh timer, this ends the session — it
// calls the real logout endpoint so the server-side refresh token is revoked too.
//
// This deliberately does NOT use a single long setTimeout. JS timers do not advance
// while the machine is suspended (behaviour across sleep is unspecified and varies by
// platform), so a 60-minute countdown armed before a laptop is closed overnight still
// believes it has ~55 minutes left on wake — the user's first click resets it and the
// session never expires. Instead we persist a wall-clock timestamp and poll it, so the
// first tick after wake sees the true elapsed gap. localStorage (not module state) also
// makes this survive page reloads and stay consistent across tabs.
//
// The authoritative check is server-side (IDLE_SESSION_MAX on /auth/refresh-token);
// this layer provides the precise 60-minute cutoff and a clean redirect.
const IDLE_LOGOUT_MS = 60 * 60 * 1000; // 60 minutes of no activity
const IDLE_CHECK_MS = 30 * 1000; // how often we compare wall-clock timestamps
const LAST_ACTIVITY_KEY = 'last_activity_at';
let idleInterval: ReturnType<typeof setInterval> | null = null;

// localStorage can throw (hardened privacy modes, storage disabled). Degrade to a
// no-op client-side check — the server-side idle timeout still ends the session.
function readLastActivity(): number | null {
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeLastActivity(ts: number) {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(ts));
  } catch {
    // Ignore — server-side enforcement is the backstop
  }
}

export function cancelIdleLogout() {
  if (idleInterval) {
    clearInterval(idleInterval);
    idleInterval = null;
  }
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // Ignore
  }
}

function performIdleLogout() {
  cancelProactiveRefresh();
  cancelIdleLogout();
  axios
    // 8s timeout so a network hang (e.g. the machine sleeping mid-request) can't leave
    // this promise pending forever — without it, .finally() below would never run and
    // the "logged out" state would never take effect (SP-idle-1).
    .post(`${API_URL}/auth/logout`, {}, { withCredentials: true, timeout: 8000 })
    .catch(() => {
      // Best-effort — cookies may already be invalid; proceed to clear local state regardless
    })
    .finally(() => {
      sessionStorage.setItem('explicit_logout', 'true');
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
    });
}

function checkIdle() {
  // Not authenticated: leave the stored timestamp untouched. authStore is not
  // persisted, so isAuthenticated is briefly false on every page load while
  // /auth/me resolves — re-seeding here would silently reset accumulated idle
  // time on each reload and defeat the whole mechanism.
  if (!useAuthStore.getState().isAuthenticated) return;

  const now = Date.now();
  const last = readLastActivity();

  // No baseline yet (fresh login, or storage unavailable) — start the clock now.
  if (last === null) {
    writeLastActivity(now);
    return;
  }

  // Clock moved backwards (NTP correction, manual change) — re-baseline rather
  // than waiting out a bogus negative interval.
  if (last > now) {
    writeLastActivity(now);
    return;
  }

  if (now - last >= IDLE_LOGOUT_MS) {
    performIdleLogout();
  }
}

function startIdleWatch() {
  if (idleInterval) return;
  idleInterval = setInterval(checkIdle, IDLE_CHECK_MS);
}

// Seed the idle baseline at the moment of a successful sign-in. Without this, a stale
// last_activity_at orphaned by a previous session (e.g. the browser was closed without
// logging out) would trip the idle check immediately on the next login.
export function markSessionStart() {
  writeLastActivity(Date.now());
  startIdleWatch();
}

// Reset the proactive-refresh timer and stamp activity on meaningful user interaction
function onUserActivity() {
  if (useAuthStore.getState().isAuthenticated) {
    scheduleProactiveRefresh();
    writeLastActivity(Date.now());
    startIdleWatch();
  }
}

// Attach activity listeners once
if (typeof window !== 'undefined') {
  const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
  // Throttle: at most once per 60 seconds to avoid excessive timer resets
  let lastActivity = 0;
  const throttledActivity = () => {
    const now = Date.now();
    if (now - lastActivity > 60_000) {
      lastActivity = now;
      onUserActivity();
    }
  };
  events.forEach((evt) => window.addEventListener(evt, throttledActivity, { passive: true }));

  // Check immediately when the tab is brought back to the foreground, so returning
  // to a long-idle tab logs out at once instead of waiting for the next poll tick.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkIdle();
  });
  window.addEventListener('focus', checkIdle);

  // Start the first timers
  scheduleProactiveRefresh();
  startIdleWatch();
}

// Create axios instance with cookie support
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable sending cookies with requests
});

// Request interceptor — attach CSRF token to all state-changing requests
api.interceptors.request.use(
  (config) => {
    // Tokens automatically sent via cookies — no Authorization header needed.
    // Inject the cached CSRF token for POST / PUT / PATCH / DELETE.
    if (config.method && CSRF_PROTECTED_METHODS.has(config.method.toLowerCase())) {
      // Fall back to reading the cookie directly when the in-memory cache is empty
      // (e.g. first mutation after a hard refresh before any GET response arrives).
      const token = csrfToken ?? readCsrfCookie();
      if (token) {
        if (!csrfToken) csrfToken = token; // prime the cache
        config.headers['x-xsrf-token'] = token;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor — cache CSRF token + handle token refresh
api.interceptors.response.use(
  (response) => {
    // The backend sends the CSRF token in every response header so we can always
    // keep the in-memory cache fresh without a dedicated /csrf-token round-trip.
    const tokenFromHeader = response.headers['x-csrf-token'];
    if (tokenFromHeader) {
      csrfToken = tokenFromHeader;
    }
    return response;
  },
  async (error: AxiosError) => {
    // Surface the backend's actual error text instead of Axios's generic
    // "Request failed with status code NNN". Controllers send { message } for
    // structured errors and rate limiters send { error } — prefer whichever is
    // present. Leave `.message` untouched when there's no parseable body
    // (network failures, CORS rejections) since there's nothing better to show.
    const data = error.response?.data as Record<string, unknown> | undefined;
    if (data && typeof data === 'object') {
      if (typeof data.message === 'string' && data.message.length > 0) {
        error.message = data.message;
      } else if (typeof data.error === 'string' && data.error.length > 0) {
        error.message = data.error;
      }
    }

    const originalRequest = error.config as any;

    // If error is 401, we haven't retried yet, and the user was already authenticated
    // (skip refresh on the initial auth probe — if there's no session, just reject)
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      useAuthStore.getState().isAuthenticated
    ) {
      originalRequest._retry = true;

      try {
        // Use the shared refresh lock so concurrent 401s don't race
        await doRefresh();
        // New access token is now in cookie — retry original request
        return api(originalRequest);
      } catch (refreshError) {
        // doRefresh already handles logout
        return Promise.reject(refreshError);
      }
    }

    // Maintenance mode: server returns 503 with { maintenance: true }.
    // Redirect non-admin users to the /maintenance page so they see a
    // friendly message instead of an opaque network error.
    if (
      error.response?.status === 503 &&
      (error.response.data as Record<string, unknown>)?.maintenance === true
    ) {
      if (window.location.pathname !== '/maintenance') {
        window.location.replace('/maintenance');
      }
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api;
