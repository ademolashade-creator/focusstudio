// ---------- Storage ----------
function storageGet(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
}
function storageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.error('Could not save', key, e); }
}
const $ = (id) => document.getElementById(id);

// ---------- App settings ----------
let appSettings = storageGet('ff-app-settings', { appName: 'Focus & Flow Studio', darkMode: false });

function applySettings() {
    const titleEl = $('app-title');
    if (titleEl) titleEl.textContent = appSettings.appName;
    document.body.classList.toggle('dark-mode', !!appSettings.darkMode);
}
function toggleDarkMode() {
    appSettings.darkMode = !appSettings.darkMode;
    document.body.classList.toggle('dark-mode', appSettings.darkMode);
    storageSet('ff-app-settings', appSettings);
}

// ---------- Clocks ----------
let headerClockZones = storageGet('ff-header-clock-zones', ['Africa/Lagos', 'America/New_York', 'America/Denver']);

function populateHeaderClockSelects() {
    let zones;
    try { zones = Intl.supportedValuesOf('timeZone'); }
    catch (e) { zones = ['UTC', 'Africa/Lagos', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Australia/Sydney']; }

    const datalist = document.getElementById('tz-datalist');
    if (datalist) {
        datalist.innerHTML = zones.map(z => `<option value="${z}">`).join('');
    }

    ['clock-tz-search-1', 'clock-tz-search-2', 'clock-tz-search-3'].forEach((id, i) => {
        const input = $(id);
        if (input) {
            input.value = headerClockZones[i] || '';
            input.setAttribute('list', 'tz-datalist');
        }
    });
}

function updateHeaderClockZone(slot, tz) {
    if (!tz || tz.trim() === '') return;
    headerClockZones[slot - 1] = tz;
    storageSet('ff-header-clock-zones', headerClockZones);
    updateClocks();
}

function updateClocks() {
    const now = new Date();
    const dateEl = $('date-display'), watEl = $('clock-wat'), estEl = $('clock-est'), mstEl = $('clock-mst');
    if (dateEl) {
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        dateEl.textContent = `${dd}/${mm}/${now.getFullYear()}`;
    }
    if (watEl) watEl.textContent = now.toLocaleTimeString('en-US', { timeZone: headerClockZones[0], hour12: true });
    if (estEl) estEl.textContent = now.toLocaleTimeString('en-US', { timeZone: headerClockZones[1], hour12: true });
    if (mstEl) mstEl.textContent = now.toLocaleTimeString('en-US', { timeZone: headerClockZones[2], hour12: true });
}

// ---------- Task board ----------
const defaultColumns = [
    { id: 1, title: 'Client A / Priority 1', tasks: [] },
    { id: 2, title: 'Client B / Priority 2', tasks: [] },
    { id: 3, title: 'Admin & Content', tasks: [] }
];

let boardData = storageGet('focus_board_data', defaultColumns);
let historyData = storageGet('focus_history_data', []);

function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Migration to ensure all tasks have required fields
boardData.forEach(col => {
    if (col.collapsed === undefined) col.collapsed = false;
    col.tasks.forEach(t => {
        if (t.estimateMinutes === undefined) t.estimateMinutes = 15;
        if (t.trackedSeconds === undefined) t.trackedSeconds = 0;
        if (t.isTracking === undefined) t.isTracking = false;
        if (t.dateAdded === undefined) t.dateAdded = getTodayKey();
        if (t.completedAt === undefined) t.completedAt = t.completed ? Date.now() : null;
        if (!t.id) t.id = 't_' + Math.random().toString(36).substr(2,9);
        if (!t.breaks) t.breaks = [];
        if (!t.timeSegments) t.timeSegments = [];
        if (t.deadlineTime === undefined) t.deadlineTime = null;
        if (t.googleLink === undefined) t.googleLink = '';
    });
});

function saveBoardData() {
    storageSet('focus_board_data', boardData);
    storageSet('focus_history_data', historyData);
}

function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, tag => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[tag]||tag));
}

function renderBoard() {
    const container = $('board-container');
    if (!container) return;
    container.querySelectorAll('.task-column').forEach((el) => el.remove());

    boardData.forEach((col, colIndex) => {
        const columnEl = document.createElement('div');
        columnEl.className = 'task-column';
        columnEl.dataset.colIndex = colIndex;

        columnEl.innerHTML = `
            <div class="column-header-row">
                <input type="text" class="column-header-input" value="${escapeHTML(col.title)}" oninput="updateColumnTitle(${colIndex}, this.value)" placeholder="Project / Client Name">
                <button class="delete-btn" onclick="deleteColumn(${colIndex})">×</button>
            </div>
            <div class="column-body">
                <ul class="task-list">
                    ${col.tasks.map((task, taskIndex) => `
                        <li class="task-item ${task.completed ? 'completed' : ''}" id="task-${colIndex}-${taskIndex}">
                            <div class="task-main-row">
                                <div class="task-left">
                                    <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="toggleTask(${colIndex}, ${taskIndex})">
                                    <input type="text" class="task-name-input" value="${escapeHTML(task.text)}" onchange="updateTaskText(${colIndex}, ${taskIndex}, this.value)">
                                </div>
                                <div class="task-actions">
                                    <input type="number" class="task-estimate-input" value="${task.estimateMinutes}" min="1" max="480" onchange="updateTaskEstimate(${colIndex}, ${taskIndex}, parseInt(this.value))">m
                                    <button class="delete-btn" onclick="deleteTask(${colIndex}, ${taskIndex})">×</button>
                                </div>
                            </div>
                        </li>
                    `).join('')}
                </ul>
                <div class="task-input-group">
                    <input type="text" class="task-input" id="task-input-${colIndex}" placeholder="Add a new task..." onkeypress="handleKeyPress(event, ${colIndex})">
                    <input type="number" class="task-estimate-new" id="task-est-${colIndex}" value="15" min="1" max="480">
                    <button class="add-task-btn" onclick="addTask(${colIndex})">Add</button>
                </div>
            </div>
        `;
        container.appendChild(columnEl);
    });
}

function updateColumnTitle(ci, v) { boardData[ci].title = v; saveBoardData(); }
function deleteColumn(ci) {
    if (boardData.length <= 1) { alert('Keep at least one column.'); return; }
    if (!confirm(`Delete "${boardData[ci].title}"?`)) return;
    boardData.splice(ci, 1);
    saveBoardData();
    renderBoard();
}

function addTask(ci) {
    const input = $(`task-input-${ci}`);
    const estInput = $(`task-est-${ci}`);
    const text = input.value.trim();
    if (!text) return;

    boardData[ci].tasks.push({
        id: 't_' + Math.random().toString(36).substr(2,9),
        text: text,
        estimateMinutes: parseInt(estInput.value) || 15,
        trackedSeconds: 0,
        isTracking: false,
        notes: '',
        completed: false,
        completedAt: null,
        dateAdded: getTodayKey(),
        breaks: [],
        timeSegments: [],
        deadlineTime: null,
        googleLink: ''
    });
    input.value = '';
    saveBoardData();
    renderBoard();
}

function updateTaskText(ci, ti, v) { boardData[ci].tasks[ti].text = v.trim() || 'Untitled task'; saveBoardData(); }
function updateTaskEstimate(ci, ti, v) {
    if(isNaN(v) || v<1) v=1;
    boardData[ci].tasks[ti].estimateMinutes = v;
    saveBoardData();
    renderBoard();
}

function toggleTask(ci, ti) {
    const task = boardData[ci].tasks[ti];
    task.completed = !task.completed;
    task.completedAt = task.completed ? Date.now() : null;
    saveBoardData();
    renderBoard();
}

function deleteTask(ci, ti) {
    boardData[ci].tasks.splice(ti, 1);
    saveBoardData();
    renderBoard();
}

function handleKeyPress(e, ci) { if (e.key === 'Enter') addTask(ci); }

// ---------- Clock In/Out ----------
let clockState = storageGet('ff-clock-state', { clockedIn: false, startedAt: null });
let clockLog = storageGet('ff-clock-log', []);

function toggleClock() {
    const btn = $('clock-btn');
    if (clockState.clockedIn) {
        const durationMs = Date.now() - clockState.startedAt;
        const durationMinutes = Math.max(1, Math.round(durationMs / 60000));
        clockLog.unshift({
            date: new Date(clockState.startedAt).toLocaleDateString(),
            clockIn: new Date(clockState.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            clockOut: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            durationMinutes
        });
        if (clockLog.length > 30) clockLog.pop();
        clockState = { clockedIn: false, startedAt: null };
        storageSet('ff-clock-log', clockLog);
    } else {
        clockState = { clockedIn: true, startedAt: Date.now() };
    }
    storageSet('ff-clock-state', clockState);
    renderClockCard();
}

function renderClockCard() {
    const btn = $('clock-btn');
    if (!btn) return;
    if (clockState.clockedIn) {
        btn.textContent = 'Clock Out';
        btn.classList.add('active');
    } else {
        btn.textContent = 'Clock In';
        btn.classList.remove('active');
    }
}

// ---------- Timer ----------
let workDuration = 25 * 60;
let breakDuration = 5 * 60;
let timeLeft = workDuration;
let totalTime = workDuration;
let isRunning = false;
let isWorkTime = true;
let hasStartedOnce = false;
let timerInterval = null;

const timeDisplay = $('time-display');
const startPauseBtn = $('start-pause-btn');
const progressBar = $('progress-bar');
const modeIndicator = $('mode-indicator');
const workInput = $('work-input');
const breakInput = $('break-input');

function updateDisplay() {
    if (!timeDisplay) return;
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const progressPercent = (timeLeft / totalTime) * 100;
    if (progressBar) progressBar.style.width = `${progressPercent}%`;
}

function setupMode() {
    clearInterval(timerInterval);
    isRunning = false;
    startPauseBtn.textContent = hasStartedOnce ? 'Resume' : 'Start';

    if (isWorkTime) {
        workDuration = parseInt(workInput.value) * 60 || 25 * 60;
        totalTime = workDuration;
        timeLeft = workDuration;
        modeIndicator.textContent = 'Work Time';
        progressBar.style.backgroundColor = 'var(--cherry-red)';
    } else {
        breakDuration = parseInt(breakInput.value) * 60 || 5 * 60;
        totalTime = breakDuration;
        timeLeft = breakDuration;
        modeIndicator.textContent = 'Break Time';
        progressBar.style.backgroundColor = 'var(--green)';
    }
    updateDisplay();
}

function toggleTimer() {
    if (isRunning) {
        clearInterval(timerInterval);
        isRunning = false;
        startPauseBtn.textContent = 'Resume';
        updateDisplay();
    } else {
        hasStartedOnce = true;
        startPauseBtn.textContent = 'Pause';
        isRunning = true;
        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                updateDisplay();
            } else {
                clearInterval(timerInterval);
                isRunning = false;
                if (isWorkTime) {
                    isWorkTime = false;
                    setupMode();
                } else {
                    isWorkTime = true;
                    setupMode();
                }
            }
        }, 1000);
    }
}

function resetTimer() { hasStartedOnce = false; isWorkTime = true; setupMode(); }
function updateSettings() { if (!isRunning) { setupMode(); } }

function addFiveMinutes() {
    timeLeft += 300;
    totalTime += 300;
    updateDisplay();
}

function skipCurrentSegment() {
    if (isWorkTime) {
        isWorkTime = false;
        setupMode();
    } else {
        isWorkTime = true;
        setupMode();
    }
}

// ---------- Init ----------
function initApp() {
    applySettings();
    updateClocks();
    setInterval(updateClocks, 1000);
    
    populateHeaderClockSelects();
    renderBoard();
    renderClockCard();
    setupMode();
    
    console.log('App initialized successfully!');
    console.log('Board data loaded:', boardData);
    console.log('History data loaded:', historyData);
    console.log('Clock log loaded:', clockLog);
}

document.addEventListener('DOMContentLoaded', initApp);