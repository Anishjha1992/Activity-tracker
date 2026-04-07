// ═══════════════════════════════════════════════════════════════
//  ActiveTrack — app.js
// ═══════════════════════════════════════════════════════════════

// ─── Activity catalogue ─────────────────────────────────────────
const ACTIVITIES = [
  { id: 'gym',        name: 'Gym',        icon: '🏋️',  color: '#EF5350' },
  { id: 'running',    name: 'Running',    icon: '🏃',  color: '#FF7043' },
  { id: 'swimming',   name: 'Swimming',   icon: '🏊',  color: '#29B6F6' },
  { id: 'cycling',    name: 'Cycling',    icon: '🚴',  color: '#66BB6A' },
  { id: 'basketball', name: 'Basketball', icon: '🏀',  color: '#FFA726' },
  { id: 'football',   name: 'Football',   icon: '⚽',  color: '#26A69A' },
  { id: 'tennis',     name: 'Tennis',     icon: '🎾',  color: '#D4E157' },
  { id: 'yoga',       name: 'Yoga',       icon: '🧘',  color: '#AB47BC' },
  { id: 'boxing',     name: 'Boxing',     icon: '🥊',  color: '#EC407A' },
  { id: 'cricket',    name: 'Cricket',    icon: '🏏',  color: '#8D6E63' },
  { id: 'badminton',  name: 'Badminton',  icon: '🏸',  color: '#26C6DA' },
  { id: 'volleyball', name: 'Volleyball', icon: '🏐',  color: '#FFCA28' },
  { id: 'hiking',     name: 'Hiking',     icon: '🥾',  color: '#A5D6A7' },
  { id: 'other',      name: 'Other',      icon: '🏅',  color: '#78909C' },
];

const ACT_MAP = Object.fromEntries(ACTIVITIES.map(a => [a.id, a]));

// ─── State ──────────────────────────────────────────────────────
let state = {
  selectedActivity: null,
  currentTab: 'log',
  summaryMonth: new Date(),           // month shown in Summary
  historyFilter: 'all',
  googleSignedIn: false,
  gapiReady: false,
  gisReady: false,
  tokenClient: null,
  accessToken: null,
  editingId: null,                    // activity being edited
};

// ─── Persistence ────────────────────────────────────────────────
function loadActivities() {
  return JSON.parse(localStorage.getItem('activities') || '[]');
}
function saveActivities(list) {
  localStorage.setItem('activities', JSON.stringify(list));
}
function loadSettings() {
  return JSON.parse(localStorage.getItem('settings') || '{}');
}
function saveSettings(s) {
  localStorage.setItem('settings', JSON.stringify(s));
}

// ─── Helpers ────────────────────────────────────────────────────
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function formatDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  const today = todayISO();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  if (iso === today)     return 'Today';
  if (iso === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
}
function formatDuration(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

// ─── Render: Log Tab ─────────────────────────────────────────────
function renderActivityGrid() {
  const grid = document.getElementById('activity-grid');
  grid.innerHTML = ACTIVITIES.map(a => `
    <button class="activity-chip${state.selectedActivity === a.id ? ' selected' : ''}"
            style="--act-color:${a.color}"
            onclick="selectActivity('${a.id}')">
      <span class="chip-icon">${a.icon}</span>
      <span class="chip-label">${a.name}</span>
    </button>`).join('');
}

function selectActivity(id) {
  state.selectedActivity = id;
  renderActivityGrid();
  const ts = document.getElementById('time-section');
  ts.style.display = 'block';
  // Pre-fill defaults only if not editing
  if (!state.editingId) {
    const dateEl = document.getElementById('activity-date');
    if (!dateEl.value) dateEl.value = todayISO();
    const timeEl = document.getElementById('activity-start');
    if (!timeEl.value) timeEl.value = nowTime();
  }
  ts.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Render: History Tab ─────────────────────────────────────────
function renderHistory() {
  const activities = loadActivities();
  const [year, month] = document.getElementById('history-month').value.split('-').map(Number);
  const filtered = activities.filter(a => {
    const d = new Date(a.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth()+1 === month
      && (state.historyFilter === 'all' || a.activityId === state.historyFilter);
  });

  // Render sport filter chips
  renderHistoryFilters(activities, year, month);

  const container = document.getElementById('history-list');
  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-text">No activities logged</div>
        <div class="empty-hint">Start tracking by tapping the Log tab</div>
      </div>`;
    return;
  }

  // Group by date
  const groups = {};
  filtered.sort((a,b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
  filtered.forEach(a => { (groups[a.date] = groups[a.date] || []).push(a); });

  container.innerHTML = Object.entries(groups).map(([date, items]) => `
    <div class="day-group">
      <div class="day-label">${formatDate(date)}</div>
      ${items.map(entryHTML).join('')}
    </div>`).join('');
}

function renderHistoryFilters(activities, year, month) {
  const used = [...new Set(
    activities.filter(a => {
      const d = new Date(a.date + 'T12:00:00');
      return d.getFullYear() === year && d.getMonth()+1 === month;
    }).map(a => a.activityId)
  )];
  const container = document.getElementById('filter-chips');
  container.innerHTML = used.map(id => {
    const act = ACT_MAP[id];
    return `<button class="filter-btn${state.historyFilter===id?' active':''}"
              onclick="filterHistory('${id}')">${act ? act.icon+' '+act.name : id}</button>`;
  }).join('');
}

function entryHTML(a) {
  const act = ACT_MAP[a.activityId] || ACT_MAP['other'];
  const calBadge = a.calendarEventId
    ? `<div class="cal-badge">📅 Synced to Google Calendar</div>` : '';
  const notes = a.notes ? `<div class="detail-notes">"${a.notes}"</div>` : '';
  return `
    <div class="activity-entry" style="--act-color:${act.color}" onclick="toggleDetail('${a.id}')">
      <span class="entry-icon">${act.icon}</span>
      <div class="entry-info">
        <div class="entry-name">${act.name}</div>
        <div class="entry-time">${a.startTime} · ${formatDuration(a.duration)}</div>
        <div class="entry-detail" id="detail-${a.id}">
          ${calBadge}${notes}
          <div class="entry-actions">
            <button class="edit-btn"   onclick="startEdit('${a.id}',event)">Edit</button>
            <button class="delete-btn" onclick="deleteActivity('${a.id}',event)">Delete</button>
          </div>
        </div>
      </div>
      <span class="entry-badge">${formatDuration(a.duration)}</span>
    </div>`;
}

function toggleDetail(id) {
  const el = document.getElementById('detail-' + id);
  if (el) el.classList.toggle('open');
}

function filterHistory(filter) {
  state.historyFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  renderHistory();
  // Re-mark the correct "all" button if filter is all
  if (filter === 'all') {
    document.getElementById('filter-all').classList.add('active');
  }
}

// ─── Render: Summary Tab ─────────────────────────────────────────
function renderSummary() {
  const d = state.summaryMonth;
  const mk = monthKey(d);
  document.getElementById('summary-month-label').textContent =
    d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const all = loadActivities();
  const mActivities = all.filter(a => a.date.startsWith(mk));

  // Stat cards
  const totalSessions = mActivities.length;
  const totalMins = mActivities.reduce((s,a) => s + a.duration, 0);
  const sportCounts = {};
  mActivities.forEach(a => { sportCounts[a.activityId] = (sportCounts[a.activityId]||0) + 1; });
  const topSport = Object.entries(sportCounts).sort((a,b) => b[1]-a[1])[0];
  const topAct = topSport ? ACT_MAP[topSport[0]] : null;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${totalSessions}</div>
      <div class="stat-label">Sessions</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${Math.round(totalMins/60)}<span class="stat-unit">h</span></div>
      <div class="stat-label">Total Time</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${topAct ? topAct.icon : '—'}</div>
      <div class="stat-label">${topAct ? topAct.name : 'No data'}</div>
    </div>`;

  // Sport breakdown
  const maxCount = Math.max(...Object.values(sportCounts), 1);
  const breakdown = Object.entries(sportCounts)
    .sort((a,b) => b[1]-a[1])
    .map(([id, count]) => {
      const act = ACT_MAP[id] || ACT_MAP['other'];
      const mins = mActivities.filter(a=>a.activityId===id).reduce((s,a)=>s+a.duration,0);
      const pct = Math.round((count/maxCount)*100);
      return `
        <div class="sport-row">
          <span class="sport-icon-sm">${act.icon}</span>
          <div class="sport-info">
            <div class="sport-name">${act.name}</div>
            <div class="sport-bar"><div class="sport-fill" style="width:${pct}%;--act-color:${act.color}"></div></div>
          </div>
          <div class="sport-count">${count}× · ${formatDuration(mins)}</div>
        </div>`;
    }).join('');

  document.getElementById('sport-breakdown').innerHTML =
    breakdown || '<p class="text-muted" style="padding:8px 0">No activities this month</p>';

  // Calendar heatmap
  renderHeatmap(d, mActivities);
}

function renderHeatmap(monthDate, mActivities) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const todayISO_ = todayISO();

  // Build day→count map
  const dayCounts = {};
  mActivities.forEach(a => {
    const day = parseInt(a.date.slice(8));
    dayCounts[day] = (dayCounts[day]||0) + 1;
  });

  const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  let cells = DOW.map(d => `<div class="heatmap-day-label">${d}</div>`).join('');

  // Empty cells before day 1
  for (let i = 0; i < firstDow; i++) cells += `<div class="heatmap-cell empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const count = dayCounts[day] || 0;
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const cls = count === 0 ? '' : count === 1 ? 'has-1' : count === 2 ? 'has-2' : 'has-3+';
    const todayCls = iso === todayISO_ ? ' today' : '';
    cells += `<div class="heatmap-cell ${cls}${todayCls}" title="${count} session${count!==1?'s':''}">${day}</div>`;
  }

  document.getElementById('calendar-heatmap').innerHTML = `
    <div class="heatmap-grid">${cells}</div>
    <div style="display:flex;gap:12px;margin-top:10px;font-size:.72rem;color:var(--text-soft);align-items:center">
      <span>🔲 None</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:14px;height:14px;background:#B2DFDB;border-radius:3px;display:inline-block"></span>1</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:14px;height:14px;background:#80CBC4;border-radius:3px;display:inline-block"></span>2</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:14px;height:14px;background:var(--primary);border-radius:3px;display:inline-block"></span>3+</span>
    </div>`;
}

function changeMonth(delta) {
  const d = state.summaryMonth;
  state.summaryMonth = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  renderSummary();
}

// ─── Tab switching ───────────────────────────────────────────────
function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add('active');

  const titles = { log: 'Log Activity', history: 'History', summary: 'Summary' };
  document.getElementById('page-title').textContent = titles[tab];

  if (tab === 'history') {
    if (!document.getElementById('history-month').value) {
      document.getElementById('history-month').value = monthKey(new Date());
    }
    renderHistory();
  }
  if (tab === 'summary') renderSummary();
}

// ─── Save / Edit / Delete ────────────────────────────────────────
async function saveActivity() {
  const actId = state.selectedActivity;
  if (!actId) { showToast('Please select an activity'); return; }

  const date  = document.getElementById('activity-date').value;
  const start = document.getElementById('activity-start').value;
  let durSel  = document.getElementById('activity-duration').value;
  let duration = durSel === 'custom'
    ? parseInt(document.getElementById('custom-duration').value) || 0
    : parseInt(durSel);
  const notes  = document.getElementById('activity-notes').value.trim();
  const doSync = document.getElementById('sync-toggle').checked;

  if (!date)    { showToast('Please set a date'); return; }
  if (!start)   { showToast('Please set a start time'); return; }
  if (!duration || duration < 1) { showToast('Please set a valid duration'); return; }

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Saving…';

  const activities = loadActivities();

  let calendarEventId = null;

  if (state.editingId) {
    // Update existing
    const idx = activities.findIndex(a => a.id === state.editingId);
    if (idx >= 0) {
      calendarEventId = activities[idx].calendarEventId || null;
      if (doSync && state.googleSignedIn) {
        calendarEventId = await upsertCalendarEvent(
          { activityId: actId, date, startTime: start, duration, notes },
          calendarEventId
        );
      }
      activities[idx] = { ...activities[idx], activityId: actId, date, startTime: start, duration, notes, calendarEventId };
    }
    state.editingId = null;
    document.getElementById('save-btn').querySelector('span').textContent = 'Save Activity';
  } else {
    // New entry
    if (doSync && state.googleSignedIn) {
      calendarEventId = await upsertCalendarEvent({ activityId: actId, date, startTime: start, duration, notes }, null);
    }
    const entry = { id: uuid(), activityId: actId, date, startTime: start, duration, notes, calendarEventId, createdAt: Date.now() };
    activities.push(entry);
  }

  saveActivities(activities);
  resetForm();
  btn.disabled = false;
  btn.querySelector('span').textContent = 'Save Activity';

  const act = ACT_MAP[actId];
  showToast(`${act.icon} ${act.name} logged!${calendarEventId ? ' 📅' : ''}`);
}

function resetForm() {
  state.selectedActivity = null;
  state.editingId = null;
  renderActivityGrid();
  document.getElementById('time-section').style.display = 'none';
  document.getElementById('activity-date').value = '';
  document.getElementById('activity-start').value = '';
  document.getElementById('activity-duration').value = '60';
  document.getElementById('activity-notes').value = '';
  document.getElementById('custom-duration-group').style.display = 'none';
  document.getElementById('save-btn').querySelector('span').textContent = 'Save Activity';
}

function startEdit(id, event) {
  event.stopPropagation();
  const activities = loadActivities();
  const a = activities.find(x => x.id === id);
  if (!a) return;

  state.editingId = id;
  switchTab('log');

  state.selectedActivity = a.activityId;
  renderActivityGrid();

  document.getElementById('activity-date').value  = a.date;
  document.getElementById('activity-start').value = a.startTime;
  document.getElementById('activity-duration').value = String(a.duration);
  document.getElementById('activity-notes').value = a.notes || '';
  document.getElementById('save-btn').querySelector('span').textContent = 'Update Activity';

  const ts = document.getElementById('time-section');
  ts.style.display = 'block';

  // If custom duration
  const stdDurations = [15,30,45,60,90,120,150,180];
  if (!stdDurations.includes(a.duration)) {
    document.getElementById('activity-duration').value = 'custom';
    document.getElementById('custom-duration-group').style.display = 'block';
    document.getElementById('custom-duration').value = a.duration;
  }
}

function deleteActivity(id, event) {
  event.stopPropagation();
  if (!confirm('Delete this activity?')) return;
  const activities = loadActivities();
  const a = activities.find(x => x.id === id);
  // Optionally delete calendar event
  if (a && a.calendarEventId && state.googleSignedIn) {
    deleteCalendarEvent(a.calendarEventId).catch(() => {});
  }
  saveActivities(activities.filter(x => x.id !== id));
  renderHistory();
  showToast('Activity deleted');
}

// ─── Duration custom input ───────────────────────────────────────
function onDurationChange() {
  const sel = document.getElementById('activity-duration').value;
  document.getElementById('custom-duration-group').style.display = sel === 'custom' ? 'block' : 'none';
}

// ─── Toast ───────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── Settings modal ──────────────────────────────────────────────
function showSettings() {
  const s = loadSettings();
  document.getElementById('google-client-id').value = s.googleClientId || '';
  document.getElementById('settings-modal').style.display = 'flex';
}
function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}
function persistSettings() {
  const clientId = document.getElementById('google-client-id').value.trim();
  const s = loadSettings();
  s.googleClientId = clientId;
  saveSettings(s);
  closeSettings();
  showToast('Settings saved');
  if (clientId) initGoogleAuth(clientId);
}
function showSetupGuide() {
  document.getElementById('setup-guide').style.display = 'block';
  return false;
}

// ─── Google Calendar API ─────────────────────────────────────────
function loadGoogleScripts(clientId) {
  return new Promise((resolve) => {
    // Load gapi
    if (window.gapi) { resolve(); return; }
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.onload = () => {
      gapi.load('client', async () => {
        await gapi.client.init({});
        await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest');
        state.gapiReady = true;
        checkGoogleReady();
        resolve();
      });
    };
    document.head.appendChild(gapiScript);

    // Load GIS
    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.onload = () => {
      state.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/calendar.events',
        callback: (resp) => {
          if (resp.error) { showToast('Google sign-in failed'); return; }
          state.accessToken = resp.access_token;
          state.googleSignedIn = true;
          gapi.client.setToken({ access_token: resp.access_token });
          updateGoogleUI(true);
          showToast('Connected to Google Calendar 📅');
        },
      });
      state.gisReady = true;
      checkGoogleReady();
    };
    document.head.appendChild(gisScript);
  });
}

function checkGoogleReady() {
  if (state.gapiReady && state.gisReady) {
    document.getElementById('google-btn').title = 'Connect Google Calendar';
  }
}

async function initGoogleAuth(clientId) {
  if (!clientId) return;
  await loadGoogleScripts(clientId);
}

function toggleGoogleAuth() {
  const s = loadSettings();
  if (!s.googleClientId) {
    showSettings();
    showToast('Enter your Google Client ID first');
    return;
  }
  if (!state.gapiReady || !state.gisReady) {
    showToast('Loading Google API…');
    initGoogleAuth(s.googleClientId);
    return;
  }
  if (state.googleSignedIn) {
    // Sign out
    google.accounts.oauth2.revoke(state.accessToken, () => {});
    state.googleSignedIn = false;
    state.accessToken = null;
    gapi.client.setToken(null);
    updateGoogleUI(false);
    showToast('Disconnected from Google Calendar');
  } else {
    state.tokenClient.requestAccessToken({ prompt: '' });
  }
}

function updateGoogleUI(connected) {
  const btn = document.getElementById('google-btn');
  btn.innerHTML = connected ? '📅' : '🔗';
  btn.title = connected ? 'Disconnect Google Calendar' : 'Connect Google Calendar';
  btn.classList.toggle('google-connected', connected);
  // Show/hide sync toggle based on connection
  document.getElementById('calendar-sync-row').style.display = connected ? 'flex' : 'none';
}

async function upsertCalendarEvent(entry, existingEventId) {
  if (!state.googleSignedIn || !state.gapiReady) return null;
  try {
    const act = ACT_MAP[entry.activityId] || ACT_MAP['other'];
    const [h, m] = entry.startTime.split(':').map(Number);
    const startDate = new Date(entry.date + 'T' + entry.startTime + ':00');
    const endDate   = new Date(startDate.getTime() + entry.duration * 60000);

    const toISO = (d) => d.toISOString().replace(/\.\d{3}Z$/, '+00:00');

    const resource = {
      summary: `${act.icon} ${act.name}`,
      description: entry.notes || `Logged via ActiveTrack`,
      start: { dateTime: toISO(startDate) },
      end:   { dateTime: toISO(endDate) },
      colorId: calColorId(entry.activityId),
      source: { title: 'ActiveTrack', url: location.href },
    };

    if (existingEventId) {
      const resp = await gapi.client.calendar.events.update({
        calendarId: 'primary', eventId: existingEventId, resource,
      });
      return resp.result.id;
    } else {
      const resp = await gapi.client.calendar.events.insert({
        calendarId: 'primary', resource,
      });
      return resp.result.id;
    }
  } catch (e) {
    console.error('Calendar error:', e);
    showToast('Calendar sync failed — saved locally');
    return null;
  }
}

async function deleteCalendarEvent(eventId) {
  if (!state.googleSignedIn || !state.gapiReady) return;
  await gapi.client.calendar.events.delete({ calendarId: 'primary', eventId });
}

function calColorId(actId) {
  const map = {
    gym:'11', running:'6', swimming:'7', cycling:'2',
    basketball:'6', football:'2', tennis:'5', yoga:'3',
    boxing:'11', cricket:'8', badminton:'7', volleyball:'5', hiking:'10'
  };
  return map[actId] || '1';
}

// ─── Init ────────────────────────────────────────────────────────
function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Set today's date display
  document.getElementById('today-date').textContent =
    new Date().toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });

  // Build activity grid
  renderActivityGrid();

  // Wire up nav buttons
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Wire duration change
  document.getElementById('activity-duration').addEventListener('change', onDurationChange);

  // Default history month
  document.getElementById('history-month').value = monthKey(new Date());

  // Google auth (if client ID already saved)
  const s = loadSettings();
  if (s.googleClientId) initGoogleAuth(s.googleClientId);

  // Hide sync row until Google is connected
  document.getElementById('calendar-sync-row').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', init);
