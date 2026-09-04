// ---------- Storage & Fallback ----------
const memoryStore = {};
function storageGet(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return memoryStore[key] !== undefined ? memoryStore[key] : fallback; }
}
function storageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { memoryStore[key] = value; }
}
const $ = (id) => document.getElementById(id);
function escapeHTML(str) { return String(str).replace(/[&<>'"]/g, tag => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[tag] || tag); }

document.addEventListener('wheel', (e) => {
    if (document.activeElement && document.activeElement.type === 'number') document.activeElement.blur();
}, { passive: true });

let scrollPositions = {};
function saveScrollPositions() { document.querySelectorAll('.task-list').forEach((l, i) => scrollPositions['list-'+i] = l.scrollTop); }
function restoreScrollPositions() { requestAnimationFrame(() => document.querySelectorAll('.task-list').forEach((l, i) => { if(scrollPositions['list-'+i] !== undefined) l.scrollTop = scrollPositions['list-'+i]; })); }

// ---------- Global Data & State ----------
let appSettings = storageGet('ff-app-settings', { appName: 'Focus & Flow Studio', darkMode: false, notificationsEnabled: true });
let attendanceSettings = storageGet('ff-attendance-settings', { scheduledIn: '09:00', scheduledOut: '17:00' });
let clockState = storageGet('ff-clock-state', { clockedIn: false, startedAt: null, latenessReason: null, isOvertime: false, overtimeStartedAt: null });
let clockLog = storageGet('ff-clock-log', []);
let breakTracker = { active: false, start: null, elapsedSeconds: 0, interval: null, isFlowBreak: false };

const defaultColumns = [
    { id: 1, title: 'Client A / Priority 1', tasks: [], notesRequired: false, collapsed: false },
    { id: 2, title: 'Client B / Priority 2', tasks: [], notesRequired: false, collapsed: false }
];
let boardData = storageGet('focus_board_data', defaultColumns);
let historyData = storageGet('focus_history_data', []);
let taskTimeMemory = storageGet('ff-task-time-memory', {});
let customQueueOrder = storageGet('ff-custom-queue', []);
let headerClockZones = storageGet('ff-header-clock-zones', ['Africa/Lagos', 'America/New_York']);

// Migrations
boardData.forEach(col => {
    if (col.collapsed === undefined) col.collapsed = false;
    col.tasks.forEach(t => {
        if (!t.id) t.id = 't_' + Math.random().toString(36).substr(2,9);
        if (t.estimateMinutes === undefined) t.estimateMinutes = 15;
        if (t.trackedSeconds === undefined) t.trackedSeconds = 0;
        if (t.dateAdded === undefined) t.dateAdded = getTodayKey();
        if (t.breaks === undefined) t.breaks = [];
        if (t.timeSegments === undefined) t.timeSegments = [];
        if (t.collapsedControls === undefined) t.collapsedControls = true;
        if (t.carriedOver === undefined) t.carriedOver = false;
    });
});
saveBoardData();

function getTodayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function getYesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function dateKeyFromISO(iso) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function formatHoursMinutes(totalMins) { if (totalMins < 60) return totalMins + 'm'; return Math.floor(totalMins/60) + 'h ' + (totalMins%60) + 'm'; }
function saveBoardData() { storageSet('focus_board_data', boardData); storageSet('focus_history_data', historyData); }

// ---------- View Router & UI Handling ----------
function switchView(viewId) {
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    const targetView = $('view-' + viewId);
    const targetNav = $('nav-' + viewId);
    if(targetView) targetView.classList.add('active');
    if(targetNav) targetNav.classList.add('active');
    
    if (viewId === 'tasks') {
        restoreScrollPositions();
        setTimeout(() => {
            document.querySelectorAll('.task-name-input').forEach(el => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; });
        }, 50);
    }
    if (viewId === 'activity') renderDailyRecap();
    window.scrollTo(0, 0);
}

function showToast(message) {
    const container = $('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function applySettings() {
    const titleEl = $('app-title');
    if (titleEl) titleEl.textContent = appSettings.appName;
    document.body.classList.toggle('dark-mode', !!appSettings.darkMode);
}
function saveAppName(name) { appSettings.appName = name.trim() || 'Focus & Flow Studio'; storageSet('ff-app-settings', appSettings); }
function toggleDarkMode() { appSettings.darkMode = !appSettings.darkMode; document.body.classList.toggle('dark-mode', appSettings.darkMode); storageSet('ff-app-settings', appSettings); }
function saveApiKey(key) { storageSet('gemini_api_key', key); }

function populateHeaderClockSelects() {
    let zones = ['UTC', 'Africa/Lagos', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Dubai'];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch(e){}
    zones.sort();
    ['clock-tz-1', 'clock-tz-2'].forEach((id, i) => {
        const sel = $(id);
        if (sel) sel.innerHTML = zones.map(z => `<option value="${z}" ${z === headerClockZones[i] ? 'selected' : ''}>${z}</option>`).join('');
    });
}
function updateHeaderClockZone(slot, tz) {
    if (!tz) return;
    headerClockZones[slot-1] = tz;
    storageSet('ff-header-clock-zones', headerClockZones);
    updateClocks();
}
function updateClocks() {
    const now = new Date();
    const dateEl = $('date-display');
    if (dateEl) dateEl.textContent = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
    const safeTime = (tz) => { try { return now.toLocaleTimeString('en-US', { timeZone: tz, hour12: true }); } catch(e) { return '--:--'; } };
    if ($('clock-wat')) $('clock-wat').textContent = safeTime(headerClockZones[0]);
    if ($('clock-est')) $('clock-est').textContent = safeTime(headerClockZones[1]);
}

// ---------- Wake Lock & Audio ----------
async function requestWakeLock() { if ('wakeLock' in navigator) { try { window.wakeLockRef = await navigator.wakeLock.request('screen'); } catch(e){} } }
function releaseWakeLock() { if (window.wakeLockRef) { try { window.wakeLockRef.release(); window.wakeLockRef = null; } catch(e){} } }

function playMidpointChime() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    } catch(e) {}
}
function playCompletionSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.5);
    } catch(e){}
}
function announce(msg) {
    playCompletionSound();
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(msg);
        u.rate = 1; u.volume = 0.8;
        speechSynthesis.speak(u);
    }
}

// ---------- Timer Core ----------
let workDuration = 25 * 60;
let breakDuration = 5 * 60;
let timeLeft = workDuration;
let totalTime = workDuration;
let isRunning = false;
let isWorkTime = true;
let hasStartedOnce = false;
let timerInterval = null;
let timerMode = 'manual';
let halfwayPoint = 0;
let midpointFired = false;

let flowSegments = [];
let flowSegIndex = 0;
let flowExtraSeconds = 0;
let flowBlocksCompleted = parseInt(localStorage.getItem('focus_daily_sessions')) || 0;

function updateDisplay() {
    const min = Math.floor(timeLeft / 60).toString().padStart(2,'0');
    const sec = (timeLeft % 60).toString().padStart(2,'0');
    if ($('time-display')) $('time-display').textContent = `${min}:${sec}`;
    const pct = (timeLeft / totalTime) * 100;
    if ($('progress-bar')) $('progress-bar').style.width = `${pct}%`;
    document.title = `(${min}:${sec}) Focus`;
    
    const urgent = (timerMode === 'flow' ? (currentFlowSegment()?.type === 'work') : isWorkTime) && isRunning && timeLeft > 0 && timeLeft <= 180;
    if ($('time-display')) $('time-display').classList.toggle('urgent', urgent);
    if ($('progress-bar')) $('progress-bar').classList.toggle('urgent', urgent);
}

function setupMode() {
    clearInterval(timerInterval); isRunning = false; releaseWakeLock();
    $('start-pause-btn').textContent = hasStartedOnce ? 'Resume' : 'Start';
    if (isWorkTime) {
        workDuration = (parseInt($('work-input')?.value) || 25) * 60;
        totalTime = timeLeft = workDuration;
        $('mode-indicator').textContent = 'Work Time';
        $('progress-bar').style.backgroundColor = 'var(--text-color)';
    } else {
        breakDuration = (parseInt($('break-input')?.value) || 5) * 60;
        totalTime = timeLeft = breakDuration;
        $('mode-indicator').textContent = 'Break Time';
        $('progress-bar').style.backgroundColor = 'var(--green)';
    }
    halfwayPoint = Math.floor(totalTime / 2);
    midpointFired = false;
    updateDisplay();
}

function runTick() {
    if (timeLeft > 0) {
        timeLeft--;
        updateDisplay();
        if (timeLeft === halfwayPoint && !midpointFired && totalTime > 120) {
            playMidpointChime();
            showToast("Midpoint reached.");
            midpointFired = true;
        }
        const inWork = timerMode === 'flow' ? (currentFlowSegment()?.type === 'work') : isWorkTime;
        if (inWork && timeLeft === 180) announce("Three minutes remaining");
    } else if (timerMode === 'flow') {
        advanceFlow();
    } else {
        announce(isWorkTime ? "Work segment complete. Take a break." : "Break complete. Back to work.");
        if (isWorkTime) { flowBlocksCompleted++; localStorage.setItem('focus_daily_sessions', flowBlocksCompleted); }
        isWorkTime = !isWorkTime;
        setupMode();
    }
}

function toggleTimer() {
    if (isRunning) {
        clearInterval(timerInterval); isRunning = false; releaseWakeLock();
        $('start-pause-btn').textContent = 'Resume';
    } else {
        if (!hasStartedOnce) {
            halfwayPoint = Math.floor(totalTime / 2);
            midpointFired = false;
        }
        hasStartedOnce = true;
        $('start-pause-btn').textContent = 'Pause';
        isRunning = true; requestWakeLock();
        timerInterval = setInterval(runTick, 1000);
        if (timerMode === 'flow' && currentFlowSegment()?.type === 'work') {
            let t = currentFlowSegment().entry.task;
            if (!t.startedAtIso) { t.startedAtIso = new Date().toISOString(); saveBoardData(); }
        }
    }
}
function resetTimer() { hasStartedOnce = false; timerMode = 'manual'; isWorkTime = true; setupMode(); setFlowControlsVisible(false); }
function updateSettings() { if (!isRunning) setupMode(); }
function skipCurrentSegment() {
    if (timerMode === 'flow') {
        let seg = currentFlowSegment();
        if (!seg) return;
        if (seg.type === 'work') {
            seg.entry.actualSecondsSoFar += (seg.minutes*60 - timeLeft) + flowExtraSeconds;
            if (seg.isLastChunk) completeFlowTask(seg.entry, seg.entry.actualSecondsSoFar);
            else { seg.entry.task.trackedSeconds = seg.entry.actualSecondsSoFar; saveBoardData(); }
        }
        flowSegIndex++; beginFlowSegment();
    } else {
        if (isWorkTime) { flowBlocksCompleted++; localStorage.setItem('focus_daily_sessions', flowBlocksCompleted); }
        playCompletionSound();
        isWorkTime = !isWorkTime; setupMode();
    }
}
function setFlowControlsVisible(active) {
    if ($('start-flow-btn')) $('start-flow-btn').style.display = active ? 'none' : 'block';
    if ($('start-ai-flow-btn')) $('start-ai-flow-btn').style.display = active ? 'none' : 'block';
}

// ---------- Overtime & Attendance Logic ----------
function saveAttendanceSettings() {
    attendanceSettings.scheduledIn = $('scheduled-in')?.value || '09:00';
    attendanceSettings.scheduledOut = $('scheduled-out')?.value || '17:00';
    storageSet('ff-attendance-settings', attendanceSettings);
    renderAttendanceCard();
}

function toggleClock() {
    const now = new Date();
    const [outH, outM] = attendanceSettings.scheduledOut.split(':').map(Number);
    const targetOut = new Date(now);
    targetOut.setHours(outH, outM, 0, 0);
    const todayStr = now.toLocaleDateString();
    
    // Check if there's a completed Standard shift today
    const hasCompletedShiftToday = clockLog.some(c => c.date === todayStr && c.type === 'Standard');

    if (clockState.isOvertime) {
        $('overtime-wrapup-overlay').style.display = 'flex';
        $('overtime-content').value = '';
    } else if (clockState.clockedIn) {
        openDailyWrapUp();
    } else if (hasCompletedShiftToday && now >= targetOut) {
        clockState.isOvertime = true;
        clockState.overtimeStartedAt = Date.now();
        storageSet('ff-clock-state', clockState);
        showToast("Overtime session initiated.");
        renderAttendanceCard();
    } else {
        clockState.clockedIn = true;
        clockState.startedAt = Date.now();
        clockState.latenessReason = 'On Time';
        storageSet('ff-clock-state', clockState);
        showToast("Clocked in successfully.");
        renderAttendanceCard();
    }
}

function toggleBreak() {
    if (breakTracker.active) resumeFromBreak();
    else {
        clearInterval(timerInterval); isRunning = false; releaseWakeLock();
        $('start-pause-btn').textContent = 'Paused';
        breakTracker.active = true; breakTracker.start = Date.now(); breakTracker.elapsedSeconds = 0;
        $('break-away-time').textContent = '00:00';
        $('break-overlay').style.display = 'flex';
        breakTracker.interval = setInterval(() => {
            breakTracker.elapsedSeconds = Math.floor((Date.now() - breakTracker.start)/1000);
            const m = Math.floor(breakTracker.elapsedSeconds/60);
            const s = (breakTracker.elapsedSeconds%60).toString().padStart(2,'0');
            $('break-away-time').textContent = `${m}:${s}`;
        }, 1000);
    }
}
function resumeFromBreak() {
    clearInterval(breakTracker.interval);
    $('break-overlay').style.display = 'none';
    const reason = $('break-reason-select').value;
    const durMins = Math.max(1, Math.round(breakTracker.elapsedSeconds/60));
    const log = storageGet('ff-break-log', []);
    log.unshift({ date: new Date().toISOString(), durationMinutes: durMins, reason: reason, type: 'Break' });
    storageSet('ff-break-log', log);
    breakTracker.active = false;
    if (!isRunning) {
        hasStartedOnce = true; $('start-pause-btn').textContent = 'Pause';
        isRunning = true; requestWakeLock(); timerInterval = setInterval(runTick, 1000);
    }
}

function openDailyWrapUp() { $('daily-wrapup-overlay').style.display = 'flex'; $('wrapup-content').value = ''; }
function closeDailyWrapUp() { $('daily-wrapup-overlay').style.display = 'none'; }
async function generateWrapUpBrief() {
    const box = $('wrapup-content'); box.value = 'Generating...';
    const todaysHistory = historyData.filter(h => dateKeyFromISO(h.completedAt) === getTodayKey());
    const apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) { box.value = "Please configure Gemini API Key in Reports settings."; return; }
    try {
        const res = await callGemini(`Write a formal, brief end-of-shift check-out summarizing these accomplishments: ${JSON.stringify(todaysHistory)}. Do not use em-dashes.`);
        box.value = res;
    } catch(e) { box.value = 'Error: ' + e.message; }
}
function finalizeClockOut() {
    const durMins = Math.max(1, Math.round((Date.now() - clockState.startedAt)/60000));
    clockLog.unshift({
        date: new Date().toLocaleDateString(),
        clockIn: new Date(clockState.startedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
        clockOut: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
        durationMinutes: durMins,
        type: 'Standard',
        brief: $('wrapup-content').value
    });
    clockState.clockedIn = false; clockState.startedAt = null;
    storageSet('ff-clock-state', clockState); storageSet('ff-clock-log', clockLog);
    closeDailyWrapUp(); renderAttendanceCard(); showToast("Clocked out successfully.");
}

async function generateOvertimeBrief() {
    const box = $('overtime-content'); box.value = 'Generating overtime analysis...';
    const otHistory = historyData.filter(h => new Date(h.completedAt).getTime() >= clockState.overtimeStartedAt);
    const apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) { box.value = "API Key missing."; return; }
    try {
        const res = await callGemini(`Write a professional, concise memo outlining extra overtime work completed tonight based on this data: ${JSON.stringify(otHistory)}. State that incomplete tasks are rolled over.`);
        box.value = res;
    } catch(e) { box.value = 'Error: ' + e.message; }
}
function finalizeOvertime() {
    const durMins = Math.max(1, Math.round((Date.now() - clockState.overtimeStartedAt)/60000));
    clockLog.unshift({
        date: new Date().toLocaleDateString(),
        clockIn: new Date(clockState.overtimeStartedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
        clockOut: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
        durationMinutes: durMins,
        type: 'Overtime',
        brief: $('overtime-content').value
    });
    
    clockState.isOvertime = false; clockState.overtimeStartedAt = null;
    storageSet('ff-clock-state', clockState); storageSet('ff-clock-log', clockLog);
    
    // Rollover Incomplete Tasks automatically
    const todayKey = getTodayKey();
    const nextDay = new Date(); nextDay.setDate(nextDay.getDate() + 1);
    const nextDayKey = dateKeyFromISO(nextDay.toISOString());
    let rolledOver = 0;
    
    boardData.forEach(col => {
        col.tasks.forEach(t => {
            if (!t.completed && t.dateAdded === todayKey) {
                t.dateAdded = nextDayKey;
                t.carriedOver = true;
                rolledOver++;
            }
        });
    });
    if (rolledOver > 0) showToast(`${rolledOver} uncompleted tasks rolled to tomorrow.`);
    
    saveBoardData();
    $('overtime-wrapup-overlay').style.display = 'none';
    renderAttendanceCard(); renderBoard();
}

function renderAttendanceCard() {
    const btn = $('clock-btn'); const status = $('attendance-status');
    const now = new Date();
    const [outH, outM] = attendanceSettings.scheduledOut.split(':').map(Number);
    const targetOut = new Date(now); targetOut.setHours(outH, outM, 0, 0);
    const hasCompletedShift = clockLog.some(c => c.date === now.toLocaleDateString() && c.type === 'Standard');

    let totalMins = clockLog.filter(c => c.date === now.toLocaleDateString()).reduce((a,c) => a + c.durationMinutes, 0);
    let firstIn = clockLog.length ? clockLog[clockLog.length-1].clockIn : '--:--';
    let lastOut = clockLog.length && !clockState.clockedIn && !clockState.isOvertime ? clockLog[0].clockOut : '--:--';

    if (clockState.isOvertime) {
        if(btn) { btn.textContent = 'End Overtime'; btn.style.background = 'var(--amber)'; }
        if(status) { status.textContent = 'Overtime Active'; status.className = 'status-pill status-over'; }
        totalMins += Math.round((Date.now() - clockState.overtimeStartedAt)/60000);
        lastOut = 'Running...';
    } else if (clockState.clockedIn) {
        if(btn) { btn.textContent = 'Clock Out'; btn.style.background = 'var(--text-color)'; }
        if(status) { status.textContent = 'On Duty'; status.className = 'status-pill status-on'; }
        firstIn = new Date(clockState.startedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        totalMins += Math.round((Date.now() - clockState.startedAt)/60000);
        lastOut = 'Running...';
    } else if (hasCompletedShift && now >= targetOut) {
        if(btn) { btn.textContent = 'Start Overtime'; btn.style.background = 'var(--cherry-red)'; }
        if(status) { status.textContent = 'Shift Ended'; status.className = 'status-pill status-off'; }
    } else {
        if(btn) { btn.textContent = 'Clock In'; btn.style.background = 'var(--cherry-red)'; }
        if(status) { status.textContent = 'Off Duty'; status.className = 'status-pill status-off'; }
    }

    if ($('actual-in-display')) $('actual-in-display').textContent = firstIn;
    if ($('actual-out-display')) $('actual-out-display').textContent = lastOut;
    if ($('today-hours')) $('today-hours').textContent = formatHoursMinutes(totalMins);
    renderDailyRecap();
}

// ---------- Board & DOM Handling ----------
function toggleColumnCollapse(ci) {
    saveScrollPositions();
    boardData[ci].collapsed = !boardData[ci].collapsed;
    saveBoardData();
    const body = $(`col-body-${ci}`);
    const btn = document.querySelector(`[onclick="toggleColumnCollapse(${ci})"]`);
    if (body) body.style.display = boardData[ci].collapsed ? 'none' : 'flex';
    if (btn) btn.textContent = boardData[ci].collapsed ? '▸' : '▾';
}
function toggleTaskCollapse(ci, ti) {
    boardData[ci].tasks[ti].collapsedControls = !boardData[ci].tasks[ti].collapsedControls;
    saveBoardData();
    const ctrl = $(`task-ctrl-${ci}-${ti}`);
    const btn = $(`task-tog-${ci}-${ti}`);
    if (ctrl) ctrl.style.display = boardData[ci].tasks[ti].collapsedControls ? 'none' : 'flex';
    if (btn) btn.textContent = boardData[ci].tasks[ti].collapsedControls ? '▼' : '▲';
}
function toggleSubtasksCollapse(ci, ti) {
    boardData[ci].tasks[ti].collapsed = !boardData[ci].tasks[ti].collapsed;
    saveBoardData();
    const sub = $(`sublist-${ci}-${ti}`);
    if (sub) sub.style.display = boardData[ci].tasks[ti].collapsed ? 'none' : 'flex';
}

function urgencyClassFor(t) {
    if (!t.estimateMinutes || t.trackedSeconds === 0) return '';
    const ratio = (t.trackedSeconds/60)/t.estimateMinutes;
    if (ratio < 0.8) return 'time-ok';
    if (ratio <= 1.0) return 'time-warn';
    return 'time-over';
}
function getDeadlineBadge(t) {
    if (!t.deadlineTime) return '';
    const hrs = (new Date(t.deadlineTime) - Date.now()) / 3600000;
    if (hrs < 0) return '<span class="deadline-badge red">Overdue</span>';
    if (hrs <= 3) return `<span class="deadline-badge ${hrs<=1?'red':'amber'}">< ${Math.ceil(hrs)}h</span>`;
    return '';
}

function renderBoard() {
    const container = $('board-container');
    if (!container) return;
    container.innerHTML = '';
    if ($('column-count-label')) $('column-count-label').textContent = `${boardData.length} Active Projects`;

    boardData.forEach((col, ci) => {
        const colEl = document.createElement('div');
        colEl.className = 'task-column';
        
        let tasksHtml = '';
        col.tasks.forEach((t, ti) => {
            if (t.parentId) return;
            const hasSubs = col.tasks.some(st => st.parentId === t.id);
            const isSubC = t.collapsedControls;
            let dlHtml = t.deadlineTime ? `<span class="deadline-label" onclick="promptDeadline(${ci},${ti})" style="font-size:0.7rem; cursor:pointer;">📅 ${new Date(t.deadlineTime).toLocaleString()}</span>` 
                                        : `<button class="details-trigger-btn" onclick="promptDeadline(${ci},${ti})">+ Deadline</button>`;
            let badgeHtml = t.carriedOver ? `<span class="carried-over-badge">⏳ Carried</span>` : '';
            
            tasksHtml += `
            <li class="task-item ${t.completed?'completed':''} ${urgencyClassFor(t)}" draggable="${!t.completed}" ondragstart="dragStart(event,${ci},${ti})">
                <div class="task-top-row">
                    <div class="task-checkbox-name">
                        <input type="checkbox" ${t.completed?'checked':''} onclick="toggleTask(${ci},${ti})">
                        <textarea class="task-name-input" rows="1" onchange="boardData[${ci}].tasks[${ti}].text=this.value;saveBoardData()">${escapeHTML(t.text)}</textarea>
                        ${badgeHtml}
                    </div>
                    <div>
                        <button class="icon-btn" id="task-tog-${ci}-${ti}" style="font-size:0.6rem; height:24px; width:24px;" onclick="toggleTaskCollapse(${ci},${ti})">${isSubC?'▼':'▲'}</button>
                        <button class="delete-btn" style="height:24px; width:24px; font-size:1.1rem; line-height:1;" onclick="deleteTask(${ci},${ti})">×</button>
                    </div>
                </div>
                <div class="task-controls-row" id="task-ctrl-${ci}-${ti}" style="display:${isSubC?'none':'flex'};">
                    ${dlHtml} ${getDeadlineBadge(t)}
                    <input type="number" class="task-estimate-input" value="${t.estimateMinutes}" onchange="updateTaskEstimate(${ci},${ti},this.value)">
                    <button class="details-trigger-btn" onclick="openDetailsModal(${ci},${ti})">Details${t.notes?' •':''}</button>
                    ${hasSubs ? `<button class="details-trigger-btn" onclick="toggleSubtasksCollapse(${ci},${ti})">Subs</button>` : ''}
                </div>
                ${hasSubs ? `
                <ul class="subtask-list" id="sublist-${ci}-${ti}" style="display:${t.collapsed?'none':'flex'};">
                    ${col.tasks.filter(st=>st.parentId===t.id).map(st => {
                        const si = col.tasks.indexOf(st);
                        return `<li class="subtask ${st.completed?'completed':''}">
                            <div style="display:flex; gap:6px; align-items:flex-start;">
                                <input type="checkbox" ${st.completed?'checked':''} onclick="toggleTask(${ci},${si})">
                                <span class="subtask-indent">↳</span>
                                <textarea class="task-name-input" rows="1" onchange="boardData[${ci}].tasks[${si}].text=this.value;saveBoardData()">${escapeHTML(st.text)}</textarea>
                                <button class="delete-btn" style="height:24px; width:24px;" onclick="deleteTask(${ci},${si})">×</button>
                            </div>
                        </li>`;
                    }).join('')}
                </ul>` : ''}
            </li>`;
        });

        colEl.innerHTML = `
            <div class="column-header-row">
                <button class="icon-btn" onclick="toggleColumnCollapse(${ci})">${col.collapsed ? '▸' : '▾'}</button>
                <input type="text" class="column-header-input" value="${escapeHTML(col.title)}" onchange="boardData[${ci}].title=this.value;saveBoardData()">
                <button class="delete-btn" onclick="deleteColumn(${ci})">×</button>
            </div>
            <div class="column-body" id="col-body-${ci}" style="display:${col.collapsed ? 'none' : 'flex'};">
                <ul class="task-list" ondragover="allowDrop(event)" ondrop="dropTask(event,${ci})">${tasksHtml}</ul>
                <div style="display:flex; gap:6px; margin-top:10px; align-items:center;">
                    <input type="text" id="task-in-${ci}" placeholder="Add task..." style="flex:1; min-height:36px;" onkeypress="if(event.key==='Enter') addTask(${ci})">
                    <input type="number" id="task-est-${ci}" value="15" style="width:50px; min-height:36px;" title="Minutes">
                    <button class="btn-primary" style="min-height:36px; min-width:44px;" onclick="addTask(${ci})">+</button>
                </div>
            </div>
        `;
        container.appendChild(colEl);
    });
    
    renderInternalQueue(); renderTimeCounter();
}

function updateTaskEstimate(ci, ti, v) { boardData[ci].tasks[ti].estimateMinutes = Math.max(1, parseInt(v)||15); saveBoardData(); renderBoard(); }
function addColumn() { boardData.push({ id: Date.now(), title: 'New Project', tasks: [], collapsed: false }); saveBoardData(); renderBoard(); }
function deleteColumn(ci) { if(confirm(`Delete "${boardData[ci].title}"?`)){ boardData.splice(ci,1); saveBoardData(); renderBoard(); } }
function addTask(ci) {
    const text = $(`task-in-${ci}`).value.trim();
    if (!text) return;
    const est = parseInt($(`task-est-${ci}`).value) || 15;
    boardData[ci].tasks.push({
        id: 't_'+Math.random().toString(36).substr(2,9), text: text, estimateMinutes: est,
        trackedSeconds: 0, isTracking: false, notes: '', completed: false, dateAdded: getTodayKey(),
        breaks: [], timeSegments: [], deadlineTime: null, parentId: null, collapsedControls: true
    });
    $(`task-in-${ci}`).value = ''; saveBoardData(); saveScrollPositions(); renderBoard();
}
function promptDeadline(ci, ti) {
    const v = prompt("Enter deadline (YYYY-MM-DDTHH:MM)", boardData[ci].tasks[ti].deadlineTime || "");
    if (v !== null) { boardData[ci].tasks[ti].deadlineTime = v || null; saveBoardData(); renderBoard(); }
}
function deleteTask(ci, ti) {
    saveScrollPositions();
    const task = boardData[ci].tasks[ti];
    boardData[ci].tasks = boardData[ci].tasks.filter(t => t.parentId !== task.id);
    boardData[ci].tasks.splice(ti, 1);
    saveBoardData(); renderBoard();
}

// Drag & Drop
let dragCtx = null;
function dragStart(e, ci, ti) { dragCtx = { ci, ti }; setTimeout(()=>e.target.classList.add('dragging'), 0); }
function allowDrop(e) { e.preventDefault(); }
function dropTask(e, tgtCi) {
    e.preventDefault(); document.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));
    if (!dragCtx) return;
    const task = boardData[dragCtx.ci].tasks.splice(dragCtx.ti, 1)[0];
    boardData[tgtCi].tasks.push(task);
    dragCtx = null; saveBoardData(); renderBoard();
}

// ---------- Task Completion & Rollover ----------
let pendingCompletion = null;
function toggleTask(ci, ti) {
    saveScrollPositions();
    const task = boardData[ci].tasks[ti];
    if (task.completed) {
        task.completed = false; task.completedAt = null;
        if (task._historyId) {
            const idx = historyData.findIndex(h => h._id === task._historyId);
            if (idx !== -1) historyData.splice(idx, 1);
        }
        if (!task.parentId) {
            boardData[ci].tasks.forEach(t => {
                if (t.parentId === task.id && t.completed) { t.completed = false; t.completedAt = null; }
            });
        }
        saveBoardData(); renderBoard(); renderEstimateLog();
        return;
    }
    if (task.trackedSeconds === 0) {
        pendingCompletion = { ci, ti };
        $('completion-task-name').textContent = task.text;
        $('completion-actual-input').value = task.estimateMinutes;
        $('completion-overlay').style.display = 'flex';
        return;
    }
    finalizeTaskCompletion(ci, ti, task.trackedSeconds);
}
function confirmCompletion() {
    if (!pendingCompletion) return;
    const mins = Math.max(1, parseInt($('completion-actual-input').value) || 15);
    finalizeTaskCompletion(pendingCompletion.ci, pendingCompletion.ti, mins * 60);
    $('completion-overlay').style.display = 'none'; pendingCompletion = null;
}
function cancelCompletion() { $('completion-overlay').style.display = 'none'; pendingCompletion = null; renderBoard(); }

function finalizeTaskCompletion(ci, ti, actualSeconds) {
    const task = boardData[ci].tasks[ti];
    task.completed = true; task.trackedSeconds = actualSeconds; task.completedAt = Date.now();
    task._historyId = 'h_' + Date.now();
    
    // Evaluate Rollover status explicitly during completion
    let isPostShift = false;
    if (!clockState.clockedIn && !clockState.isOvertime) {
        const now = new Date();
        const [outH, outM] = attendanceSettings.scheduledOut.split(':').map(Number);
        const targetOut = new Date(now); targetOut.setHours(outH, outM, 0, 0);
        if (now > targetOut) isPostShift = true; // Completed after hours while off duty
    }
    
    historyData.unshift({
        _id: task._historyId, client: boardData[ci].title, task: task.text,
        estimateMinutes: task.estimateMinutes, actualMinutes: Math.round(actualSeconds/60),
        completedAt: new Date().toISOString(), isPostShift: isPostShift
    });
    if (historyData.length > 500) historyData.pop();

    if (!task.parentId) {
        boardData[ci].tasks.forEach(t => {
            if (t.parentId === task.id && !t.completed) {
                t.completed = true; t.completedAt = task.completedAt;
                historyData.unshift({ _id:'h_'+Date.now()+Math.random(), client: boardData[ci].title, task: t.text, estimateMinutes: t.estimateMinutes, actualMinutes: t.estimateMinutes, completedAt: new Date().toISOString() });
            }
        });
    }

    saveBoardData(); renderBoard(); renderEstimateLog(); renderDailyRecap();
}

// ---------- Flow Sequence & Queues ----------
function getOpenTasks() {
    let open = [];
    boardData.forEach((c, ci) => c.tasks.forEach((t, ti) => { if (!t.completed && !t.parentId) open.push({col:c, task:t, ci, ti, actualSecondsSoFar: t.trackedSeconds||0}); }));
    open.sort((a,b) => {
        const iA = customQueueOrder.indexOf(a.task.id);
        const iB = customQueueOrder.indexOf(b.task.id);
        if (iA !== -1 && iB !== -1) return iA - iB;
        if (iA !== -1) return -1; if (iB !== -1) return 1;
        return a.ci - b.ci;
    });
    return open;
}
function renderInternalQueue() {
    const q = $('internal-flow-queue'); if(!q) return;
    const tasks = getOpenTasks();
    if(tasks.length===0) { q.innerHTML='<li style="color:#888; border:none; background:transparent;">No open tasks.</li>'; return; }
    q.innerHTML = tasks.map((e,i) => `<li><span style="color:#888; margin-right:8px;">${i+1}.</span> ${escapeHTML(e.task.text)} <span style="font-size:0.7rem; color:#666; float:right;">${e.task.estimateMinutes}m</span></li>`).join('');
}
function buildFlowSegments() {
    let segs = []; const brk = parseInt($('break-input')?.value)||5; let cWork = 0;
    getOpenTasks().forEach((e, idx, arr) => {
        let rm = e.task.estimateMinutes;
        while(rm > 0) {
            const ch = Math.min(rm, 25);
            segs.push({ type:'work', entry: e, minutes: ch, isLastChunk: (rm - ch <= 0) });
            rm -= ch; cWork += ch;
            if (idx !== arr.length-1 && cWork >= 25) { segs.push({ type:'break', minutes: brk }); cWork = 0; }
        }
    });
    return segs;
}
function startFlow() {
    flowSegments = buildFlowSegments();
    if(flowSegments.length===0) { showToast("No tasks available for flow."); return; }
    timerMode = 'flow'; flowSegIndex = 0; setFlowControlsVisible(true);
    hasStartedOnce = true; beginFlowSegment();
    $('start-pause-btn').textContent = 'Pause'; isRunning = true; requestWakeLock();
    clearInterval(timerInterval); timerInterval = setInterval(runTick, 1000);
}
function currentFlowSegment() { return flowSegments[flowSegIndex]; }
function beginFlowSegment() {
    const seg = currentFlowSegment();
    if(!seg) { finishFlow(); return; }
    flowExtraSeconds = 0; totalTime = timeLeft = seg.minutes * 60;
    halfwayPoint = Math.floor(totalTime / 2); midpointFired = false;
    if(seg.type === 'work') {
        $('mode-indicator').textContent = 'Flow: ' + seg.entry.task.text;
        $('progress-bar').style.backgroundColor = 'var(--text-color)';
        if(!seg.entry.task.startedAtIso) seg.entry.task.startedAtIso = new Date().toISOString();
        announce('Work time.');
    } else {
        $('mode-indicator').textContent = 'Flow: Break';
        $('progress-bar').style.backgroundColor = 'var(--green)';
        announce('Take a break.');
    }
    updateDisplay();
}
function advanceFlow() {
    const seg = currentFlowSegment();
    if(seg && seg.type === 'work') {
        seg.entry.actualSecondsSoFar += seg.minutes*60 + flowExtraSeconds;
        flowBlocksCompleted++; localStorage.setItem('focus_daily_sessions', flowBlocksCompleted);
        if(seg.isLastChunk) finalizeTaskCompletion(seg.entry.ci, seg.entry.ti, seg.entry.actualSecondsSoFar);
        else { seg.entry.task.trackedSeconds = seg.entry.actualSecondsSoFar; saveBoardData(); }
    }
    flowSegIndex++; beginFlowSegment();
}
function finishFlow() {
    clearInterval(timerInterval); isRunning = false; timerMode = 'manual'; isWorkTime = true;
    setFlowControlsVisible(false); setupMode(); showToast("Flow Complete."); announce("Flow complete.");
}

// End Session Modals
function openEndSessionModal() { if(isRunning || hasStartedOnce) $('end-session-overlay').style.display='flex'; }
function closeEndSessionModal() { $('end-session-overlay').style.display='none'; }
function endSessionLogProgress() {
    if(timerMode === 'flow') {
        const seg = currentFlowSegment();
        if(seg && seg.type === 'work') {
            seg.entry.actualSecondsSoFar += (seg.minutes*60 - timeLeft) + flowExtraSeconds;
            if(seg.isLastChunk) finalizeTaskCompletion(seg.entry.ci, seg.entry.ti, seg.entry.actualSecondsSoFar);
        }
    }
    resetTimer(); closeEndSessionModal();
}
function endSessionAbandon() { resetTimer(); closeEndSessionModal(); }

// ---------- Details & AI Tools ----------
let openDetailsRef = null;
function openDetailsModal(ci, ti) {
    openDetailsRef = {ci, ti};
    const t = boardData[ci].tasks[ti];
    $('details-task-name').textContent = t.text;
    $('details-notes-textarea').value = t.notes || '';
    $('details-deadline-input').value = t.deadlineTime || '';
    $('details-estimate-label').textContent = 'Est: ' + t.estimateMinutes + 'm';
    $('details-overlay').style.display = 'flex';
}
function closeDetailsModal() {
    if(openDetailsRef) {
        boardData[openDetailsRef.ci].tasks[openDetailsRef.ti].notes = $('details-notes-textarea').value;
        boardData[openDetailsRef.ci].tasks[openDetailsRef.ti].deadlineTime = $('details-deadline-input').value || null;
        saveBoardData(); renderBoard();
    }
    $('details-overlay').style.display = 'none'; openDetailsRef = null;
}
function cleanEmDashes(text) { return text.replace(/[\u2014\u2013]|--/g, ', '); }
async function callGemini(prompt) {
    const key = storageGet('gemini_api_key'); if(!key) throw new Error("API Key missing");
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', {
        method: 'POST', headers: {'Content-Type':'application/json', 'x-goog-api-key':key},
        body: JSON.stringify({contents:[{parts:[{text:prompt}]}]})
    });
    if(!res.ok) throw new Error("API Error: " + res.status);
    const data = await res.json();
    return cleanEmDashes(data.candidates[0].content.parts[0].text);
}
async function suggestTimeFromDetails() {
    if(!openDetailsRef) return;
    const t = boardData[openDetailsRef.ci].tasks[openDetailsRef.ti];
    try {
        const res = await callGemini(`Estimate realistic minutes for this task: "${t.text}". Notes: "${t.notes}". Respond with ONLY a number.`);
        const num = parseInt(res.match(/\d+/));
        if(num) { t.estimateMinutes = Math.max(1, num); $('details-estimate-label').textContent = 'Est: '+t.estimateMinutes+'m'; saveBoardData(); renderBoard(); showToast("Time updated."); }
    } catch(e) { showToast(e.message); }
}
async function breakdownTask() {
    if(!openDetailsRef) return;
    const ci = openDetailsRef.ci; const t = boardData[ci].tasks[openDetailsRef.ti];
    try {
        showToast("AI is breaking down task...");
        const res = await callGemini(`Break down this task into 2-5 actionable subtasks. Return ONLY JSON array of objects: [{"text":"subtask name", "minutes":15}]. Task: "${t.text}"`);
        const subtasks = JSON.parse(res.replace(/```json|```/g, '').trim());
        subtasks.forEach(st => {
            boardData[ci].tasks.push({ id:'t_'+Math.random().toString(36).substr(2,9), text:st.text, estimateMinutes:st.minutes||15, parentId:t.id, completed:false, dateAdded:getTodayKey() });
        });
        saveBoardData(); renderBoard(); closeDetailsModal(); showToast("Task broken down.");
    } catch(e) { showToast("Error: " + e.message); }
}
async function startAIFlow() {
    const open = getOpenTasks().map(e => ({ id: e.task.id, text: e.task.text, est: e.task.estimateMinutes }));
    if(!open.length) return;
    try {
        showToast("AI optimizing flow...");
        const res = await callGemini(`Reorder these tasks for maximum productivity based on logical progression and energy. Return ONLY a JSON array of task IDs. Tasks: ${JSON.stringify(open)}`);
        customQueueOrder = JSON.parse(res.replace(/```json|```/g, '').trim());
        storageSet('ff-custom-queue', customQueueOrder);
        renderInternalQueue(); startFlow();
    } catch(e) { showToast("Optimization failed."); }
}

async function generateAISummary(silent) {
    const box = $('summary-content'); if(!silent) box.textContent = 'Generating client report...';
    const thisMonth = historyData.filter(h => new Date(h.completedAt).getMonth() === new Date().getMonth());
    try {
        const res = await callGemini(`Write a polished monthly client report grouping accomplishments by client: ${JSON.stringify(thisMonth)}`);
        box.textContent = res;
    } catch(e) { if(!silent) box.textContent = 'Error: ' + e.message; }
}

// ---------- Recap & Analytics ----------
function renderDailyRecap() {
    if (!$('daily-recap-content')) return;
    const todaysLog = historyData.filter(h => dateKeyFromISO(h.completedAt) === getTodayKey());
    const totActual = todaysLog.reduce((a,h) => a + (h.actualMinutes||0), 0);
    
    let activeClockMins = 0;
    if (clockState.clockedIn) activeClockMins = Math.max(0, Math.round((Date.now()-clockState.startedAt)/60000));
    if (clockState.isOvertime) activeClockMins = Math.max(0, Math.round((Date.now()-clockState.overtimeStartedAt)/60000));
    
    const clockedMins = clockLog.filter(c => c.date === new Date().toLocaleDateString()).reduce((a,c)=>a+c.durationMinutes, 0) + activeClockMins;
    
    $('daily-recap-content').innerHTML = `
        <ul style="list-style:none;padding:0;margin:0;font-size:0.85rem;line-height:2;">
            <li>✅ <strong>${todaysLog.length}</strong> tasks completed today</li>
            <li>⏳ <strong>${formatHoursMinutes(totActual)}</strong> tracked work time</li>
            <li>🏢 <strong>${formatHoursMinutes(clockedMins)}</strong> total shift/clocked time</li>
        </ul>
    `;
    updateProgressAndScore(todaysLog, totActual);
    renderEstimateLog();
    renderActivityTimeline();
}

function updateProgressAndScore(todaysLog, totActual) {
    let totEst = 0; let totTrack = totActual;
    boardData.forEach(c => c.tasks.forEach(t => { if(t.dateAdded === getTodayKey() && !t.completed) { totEst+=t.estimateMinutes; totTrack+=Math.round(t.trackedSeconds/60); } }));
    const pct = totEst > 0 ? Math.min(100, Math.round((totTrack/totEst)*100)) : 0;
    if($('daily-progress')) $('daily-progress').innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#888;"><span>Progress</span><span>${formatHoursMinutes(totTrack)} / ${formatHoursMinutes(totEst)}</span></div>
        <div style="width:100%;height:8px;background:var(--border-color);border-radius:4px;margin-top:4px;"><div style="width:${pct}%;height:100%;background:var(--text-color);border-radius:4px;"></div></div>
    `;
    
    const overall = Math.min(100, Math.round((pct*0.6) + (flowBlocksCompleted > 0 ? 40 : 10)));
    let grade = '🔥 Good'; let col = 'var(--cherry-red)';
    if (overall > 80) grade = '🌟 Great'; else if (overall < 50) grade = '📈 Building';
    
    if($('focus-score')) $('focus-score').innerHTML = `
        <div style="display:flex;align-items:center;gap:15px; margin-top: 15px;">
            <div style="width:55px;height:55px;border-radius:50%;border:4px solid ${col};display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;color:${col};">${overall}</div>
            <div><div style="font-weight:700;color:${col}; font-size:1.1rem;">${grade}</div><div style="font-size:0.75rem;color:#888;">Focus index metric</div></div>
        </div>
    `;
}

function renderEstimateLog() {
    const box = $('estimate-log'); if(!box) return;
    const recent = historyData.slice(0, 30);
    box.innerHTML = recent.map(h => {
        const d = (h.actualMinutes||0) - (h.estimateMinutes||0);
        const cls = d > (h.estimateMinutes*0.2) ? 'over' : (d <= 0 ? 'under' : 'near');
        const badge = h.isPostShift ? `<span class="carried-over-badge" style="margin-left: 0; margin-right: 6px; color: var(--amber);">🌙 Post-Shift</span>` : '';
        return `<li style="padding:10px 0; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between;">
            <span style="max-width: 65%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${badge}${escapeHTML(h.task)}</span>
            <span class="log-variance ${cls}" style="font-size:0.75rem; font-weight:600;">Est ${h.estimateMinutes} / Act ${h.actualMinutes}</span>
        </li>`;
    }).join('');
}

function renderActivityTimeline() {
    const box = $('activity-timeline-content'); if(!box) return;
    const events = [];
    historyData.forEach(h => events.push({ t: new Date(h.completedAt), str: `Completed: ${h.task}` }));
    clockLog.forEach(c => {
        if (c.clockIn) events.push({ t: new Date(c.date+' '+c.clockIn), str: `${c.type === 'Overtime' ? '🌙 Started Overtime' : 'Clocked In'}` });
        if (c.clockOut && c.clockOut!=='--:--') events.push({ t: new Date(c.date+' '+c.clockOut), str: `${c.type === 'Overtime' ? 'Ended Overtime' : 'Clocked Out'}` });
    });
    if (clockState.clockedIn) events.push({ t: new Date(clockState.startedAt), str: 'Clocked In' });
    if (clockState.isOvertime) events.push({ t: new Date(clockState.overtimeStartedAt), str: '🌙 Started Overtime' });
    
    events.sort((a,b) => b.t - a.t);
    box.innerHTML = events.slice(0, 40).map(e => `
        <li style="padding:8px 0; border-bottom:1px solid var(--border-color); display:flex; gap:10px;">
            <span style="color:#888; font-size:0.75rem; width:65px;">${e.t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
            <span>${escapeHTML(e.str)}</span>
        </li>
    `).join('');
}

function renderTimeCounter() {
    const box = $('time-counter-box'); if(!box) return;
    let grandTot = 0; const brk = parseInt($('break-input')?.value)||5;
    boardData.forEach(col => {
        col.tasks.forEach(t => { if(!t.completed && !t.parentId) grandTot += t.estimateMinutes + brk; });
    });
    if (grandTot === 0) { box.textContent = 'No open tasks.'; return; }
    const done = new Date(Date.now() + grandTot*60000);
    box.innerHTML = `<span style="color:var(--text-color); font-weight:600;">Completion Est: ${done.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span> <span style="font-size:0.75rem;">(Incl. breaks)</span>`;
}

// ---------- Restore Missing Exports & Data Management ----------
function importAllDataJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.boardData) { boardData = data.boardData; storageSet('focus_board_data', boardData); }
            if (data.historyData) { historyData = data.historyData; storageSet('focus_history_data', historyData); }
            if (data.clockLog) { clockLog = data.clockLog; storageSet('ff-clock-log', clockLog); }
            if (data.clockState) { clockState = data.clockState; storageSet('ff-clock-state', clockState); }
            if (data.customQueueOrder) { customQueueOrder = data.customQueueOrder; storageSet('ff-custom-queue', customQueueOrder); }
            if (data.headerClockZones) { headerClockZones = data.headerClockZones; storageSet('ff-header-clock-zones', headerClockZones); populateHeaderClockSelects(); }
            if (data.appSettings) { appSettings = data.appSettings; storageSet('ff-app-settings', appSettings); applySettings(); }
            saveScrollPositions(); renderBoard(); renderDailyRecap(); renderAttendanceCard(); showToast('Import successful!');
        } catch(err) { showToast('Invalid JSON: ' + err.message); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function exportAllDataJSON() {
    const d = { appSettings, boardData, historyData, clockLog, clockState, customQueueOrder, headerClockZones };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], {type:'application/json'}));
    a.download = 'focus-backup.json'; a.click();
}

function exportHistoryCSV() {
    const csv = ['Date,Task,Est,Act'].concat(historyData.map(h => `${dateKeyFromISO(h.completedAt)},"${h.task.replace(/"/g,'""')}",${h.estimateMinutes},${h.actualMinutes}`)).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
    a.download = 'focus-history.csv'; a.click();
}

function generatePDFReport() {
    showToast('Generating PDF report...');
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) { showToast('Please allow pop-ups for PDF reports.'); return; }
    
    let html = `<style>body{font-family:sans-serif;padding:20px;} h1,h2{color:#ff3366;} .task{margin-bottom:8px;}</style>`;
    html += `<h1>Focus & Flow Report - ${new Date().toLocaleDateString()}</h1>`;
    
    boardData.forEach(col => {
        const done = col.tasks.filter(t => t.completed && !t.parentId);
        const open = col.tasks.filter(t => !t.completed && !t.parentId);
        if(done.length || open.length) {
            html += `<h2>${escapeHTML(col.title)}</h2>`;
            if(open.length) {
                html += `<h3>Open</h3>`;
                open.forEach(t => html += `<div class="task">${escapeHTML(t.text)} (${t.estimateMinutes}m)</div>`);
            }
            if(done.length) {
                html += `<h3>Completed</h3>`;
                done.forEach(t => html += `<div class="task"><strike>${escapeHTML(t.text)}</strike></div>`);
            }
        }
    });
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
}

function generateICS() {
    let events = [];
    boardData.forEach(col => {
        col.tasks.forEach(t => {
            if (t.deadlineTime && !t.completed) events.push({ title: t.text, start: new Date(t.deadlineTime), notes: t.notes || '' });
        });
    });
    if (!events.length) { showToast('No tasks with deadlines to export.'); return; }
    
    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Focus Flow//EN\n';
    events.forEach(e => {
        const startStr = e.start.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const endStr = new Date(e.start.getTime() + 3600000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        ics += `BEGIN:VEVENT\nSUMMARY:${e.title}\nDTSTART:${startStr}\nDTEND:${endStr}\nDESCRIPTION:${e.notes}\nEND:VEVENT\n`;
    });
    ics += 'END:VCALENDAR';
    
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'focus-flow-calendar.ics'; a.click();
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    applySettings();
    updateClocks(); setInterval(updateClocks, 1000);
    populateHeaderClockSelects();
    
    // Auto-reset daily flags if day changed
    if (clockState.clockedIn && new Date(clockState.startedAt).toDateString() !== new Date().toDateString()) {
        clockState.clockedIn = false; clockState.startedAt = null; storageSet('ff-clock-state', clockState);
    }
    
    $('gemini-api-key').value = storageGet('gemini_api_key', '');
    renderAttendanceCard(); renderBoard(); switchView('timer');
});