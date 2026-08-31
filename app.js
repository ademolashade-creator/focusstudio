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

// ---------- App settings & Init ----------
let appSettings = storageGet('ff-app-settings', { appName: 'Focus & Flow Studio', darkMode: false });

function applySettings() {
    const titleEl = $('app-title');
    if (titleEl) titleEl.textContent = appSettings.appName;
    document.body.classList.toggle('dark-mode', !!appSettings.darkMode);
}
function saveAppName(name) {
    appSettings.appName = name.trim() || 'Focus & Flow Studio';
    storageSet('ff-app-settings', appSettings);
}
function toggleDarkMode() {
    appSettings.darkMode = !appSettings.darkMode;
    document.body.classList.toggle('dark-mode', appSettings.darkMode);
    storageSet('ff-app-settings', appSettings);
}

// ---------- Clocks & Date ----------
let headerClockZones = storageGet('ff-header-clock-zones', ['Africa/Lagos', 'America/New_York', 'America/Denver']);

function populateHeaderClockSelects() {
    let zones;
    try { zones = Intl.supportedValuesOf('timeZone'); }
    catch (e) { zones = ['UTC', 'Africa/Lagos', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Australia/Sydney']; }
    ['clock-tz-1', 'clock-tz-2', 'clock-tz-3'].forEach((id, i) => {
        const sel = $(id);
        if (!sel) return;
        sel.innerHTML = zones.map((z) => `<option value="${z}" ${z === headerClockZones[i] ? 'selected' : ''}>${z}</option>`).join('');
    });
}

function updateHeaderClockZone(slot, tz) {
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

    if (now.getDate() === 30) {
        const banner = $('monthly-alert');
        if (banner) banner.style.display = 'block';
    }
}

// ---------- Wake Lock ----------
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try { window.wakeLockRef = await navigator.wakeLock.request('screen'); } catch (e) {}
    }
}
function releaseWakeLock() {
    if (window.wakeLockRef) { try { window.wakeLockRef.release(); } catch (e) {} window.wakeLockRef = null; }
}

// ---------- Timer engine (Manual + Auto Flow + Break Tagging) ----------
let workDuration = 25 * 60;
let breakDuration = 5 * 60;
let timeLeft = workDuration;
let totalTime = workDuration;
let isRunning = false;
let isWorkTime = true;
let hasStartedOnce = false;
let timerInterval = null;

let timerMode = 'manual'; // 'manual' | 'flow'
let flowSegments = [];
let flowSegIndex = 0;
let flowExtraSeconds = 0;

let flowBlocksCompleted = parseInt(localStorage.getItem('focus_daily_sessions')) || 0;
let breakTracker = { active: false, start: null, elapsedSeconds: 0, interval: null };

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
    document.title = `(${timeDisplay.textContent}) ${appSettings.appName}`;

    const inWorkSegment = timerMode === 'flow' ? (currentFlowSegment() && currentFlowSegment().type === 'work') : isWorkTime;
    const urgent = inWorkSegment && isRunning && timeLeft > 0 && timeLeft <= 180;
    timeDisplay.classList.toggle('urgent', urgent);
    if (progressBar) progressBar.classList.toggle('urgent', urgent);
}

function playSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {}
}

function announce(word) {
    try {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(word);
            u.rate = 0.95;
            u.volume = 0.85;
            speechSynthesis.speak(u);
            return;
        }
    } catch (e) {}
    playSound();
}

function addFiveMinutes() {
    timeLeft += 300;
    totalTime += 300;
    if (timerMode === 'flow' && currentFlowSegment() && currentFlowSegment().type === 'work') flowExtraSeconds += 300;
    updateDisplay();
}

function toggleTimer() {
    if (isRunning) {
        clearInterval(timerInterval);
        isRunning = false;
        releaseWakeLock();
        updateDisplay();
        
        // If in flow mode and tracking work, pausing implies a break.
        if (timerMode === 'flow' && currentFlowSegment() && currentFlowSegment().type === 'work') {
            startPauseBtn.textContent = 'Pause'; 
            initiateBreakOverlay();
        } else {
            startPauseBtn.textContent = 'Resume';
        }
    } else {
        hasStartedOnce = true;
        startPauseBtn.textContent = 'Pause';
        isRunning = true;
        requestWakeLock();
        timerInterval = setInterval(runTick, 1000);
        
        // Log start for flow segment task
        if (timerMode === 'flow' && currentFlowSegment() && currentFlowSegment().type === 'work') {
            let task = currentFlowSegment().entry.task;
            if(!task.startedAtIso) {
                task.startedAtIso = new Date().toISOString();
                saveBoardData();
            }
        }
    }
}

// BREAK OVERLAY LOGIC
function initiateBreakOverlay() {
    $('break-overlay').style.display = 'flex';
    breakTracker.active = true;
    breakTracker.start = Date.now();
    breakTracker.elapsedSeconds = 0;
    breakTracker.interval = setInterval(() => {
        breakTracker.elapsedSeconds = Math.floor((Date.now() - breakTracker.start) / 1000);
        $('break-away-time').textContent = formatMinSec(breakTracker.elapsedSeconds);
    }, 1000);
}

function resumeFromBreak() {
    clearInterval(breakTracker.interval);
    $('break-overlay').style.display = 'none';
    const reason = $('break-reason-select').value;
    
    const seg = currentFlowSegment();
    if(seg && seg.type === 'work') {
        const task = seg.entry.task;
        task.breaks.push({
            reason: reason,
            durationMinutes: Math.max(1, Math.round(breakTracker.elapsedSeconds / 60)),
            pausedAt: new Date(breakTracker.start).toISOString(),
            resumedAt: new Date().toISOString()
        });
        saveBoardData();
        renderDailyRecap();
    }
    breakTracker.active = false;
    
    hasStartedOnce = true;
    startPauseBtn.textContent = 'Pause';
    isRunning = true;
    requestWakeLock();
    timerInterval = setInterval(runTick, 1000);
}

function runTick() {
    if (timeLeft > 0) {
        timeLeft--;
        updateDisplay();
        const inWorkSegment = timerMode === 'flow' ? (currentFlowSegment() && currentFlowSegment().type === 'work') : isWorkTime;
        if (inWorkSegment && timeLeft === 180) playSound();
    } else if (timerMode === 'flow') {
        advanceFlow();
    } else {
        playSound();
        if (isWorkTime) recordFlowBlockCompleted();
        isWorkTime = !isWorkTime;
        setupMode();
    }
}

function recordFlowBlockCompleted() {
    flowBlocksCompleted++;
    localStorage.setItem('focus_daily_sessions', flowBlocksCompleted);
}

function setupMode() {
    clearInterval(timerInterval);
    isRunning = false;
    releaseWakeLock();
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
    updateAdaptiveHacks();
}

function resetTimer() { hasStartedOnce = false; timerMode = 'manual'; setFlowControlsVisible(false); isWorkTime = true; setupMode(); }
function updateSettings() { if (!isRunning) { setupMode(); updateAdaptiveHacks(); } }

// ---------- Auto Flow: Engine & Internal Queue ----------
let customQueueOrder = storageGet('ff-custom-queue', []);

function setFlowControlsVisible(active) {
    const startBtn = $('start-flow-btn');
    if (startBtn) startBtn.style.display = active ? 'none' : 'inline-block';
}

function buildChunks(totalMinutes) {
    const CHUNK = 25;
    if (totalMinutes <= CHUNK) return { chunks: [totalMinutes], bonusBreakMinutes: 0 };
    const chunks = [];
    let remaining = totalMinutes;
    let bonusBreakMinutes = 0;
    while (remaining > 0) {
        if (remaining <= CHUNK) {
            if (remaining <= 10 && chunks.length > 0) {
                chunks[chunks.length - 1] += remaining;
                bonusBreakMinutes = Math.max(5, remaining);
            } else chunks.push(remaining);
            remaining = 0;
        } else {
            chunks.push(CHUNK);
            remaining -= CHUNK;
        }
    }
    return { chunks, bonusBreakMinutes };
}

function getPrioritizedOpenTasks() {
    let openEntries = [];
    boardData.forEach((col, ci) => {
        col.tasks.forEach((task, ti) => {
            if (!task.completed) openEntries.push({ col, task, ci, ti, actualSecondsSoFar: task.trackedSeconds || 0 });
        });
    });
    
    // Sort logic overriding with manual drag-and-drop order
    openEntries.sort((a, b) => {
        const idxA = customQueueOrder.indexOf(a.task.id);
        const idxB = customQueueOrder.indexOf(b.task.id);

        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;

        if(a.task.deadlineTime && !b.task.deadlineTime) return -1;
        if(!a.task.deadlineTime && b.task.deadlineTime) return 1;
        if(a.task.deadlineTime && b.task.deadlineTime) {
            return new Date(a.task.deadlineTime) - new Date(b.task.deadlineTime);
        }
        if(a.ci !== b.ci) return a.ci - b.ci;
        return a.ti - b.ti;
    });
    return openEntries;
}

// Queue Drag and Drop Methods
let queueDragTaskId = null;
function queueDragStart(e, taskId) {
    queueDragTaskId = taskId;
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => e.target.classList.add('dragging'), 0);
}
function queueDragOver(e) {
    e.preventDefault();
    e.currentTarget.style.backgroundColor = 'var(--border-color)';
}
function queueDragLeave(e) {
    e.currentTarget.style.backgroundColor = '';
}
function queueDrop(e, targetTaskId) {
    e.preventDefault();
    e.currentTarget.style.backgroundColor = '';
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    
    if (!queueDragTaskId || queueDragTaskId === targetTaskId) return;

    const tasks = getPrioritizedOpenTasks();
    const currentOrder = tasks.map(t => t.task.id);

    const fromIdx = currentOrder.indexOf(queueDragTaskId);
    const toIdx = currentOrder.indexOf(targetTaskId);

    if (fromIdx === -1 || toIdx === -1) return;

    currentOrder.splice(fromIdx, 1);
    currentOrder.splice(toIdx, 0, queueDragTaskId);

    customQueueOrder = currentOrder;
    storageSet('ff-custom-queue', customQueueOrder);

    renderInternalQueue();
}

function renderInternalQueue() {
    const q = $('internal-flow-queue');
    if(!q) return;
    const tasks = getPrioritizedOpenTasks();
    if(tasks.length === 0) {
        q.innerHTML = '<li style="color:#888;">No open tasks. Add some below.</li>';
        return;
    }
    q.innerHTML = tasks.map((entry, idx) => `
        <li draggable="true" 
            ondragstart="queueDragStart(event, '${entry.task.id}')" 
            ondragover="queueDragOver(event)" 
            ondragleave="queueDragLeave(event)" 
            ondrop="queueDrop(event, '${entry.task.id}')">
            <div style="display:flex;align-items:center;gap:6px;">
                <span style="color:var(--cherry-red);font-size:1.1rem;cursor:grab;padding-right:4px;" title="Drag to reorder sequence">≡</span>
                <span style="color:#888;font-size:0.7rem;">${idx+1}.</span> 
                ${escapeHTML(entry.task.text)}
            </div>
            ${getDeadlineBadge(entry.task)}
        </li>
    `).join('');
}

function buildFlowSegments() {
    const segments = [];
    const openEntries = getPrioritizedOpenTasks();
    const standardBreak = parseInt(breakInput.value) || 5;

    openEntries.forEach((entry, entryIdx) => {
        const { chunks, bonusBreakMinutes } = buildChunks(Math.max(1, entry.task.estimateMinutes || 15));
        chunks.forEach((chunkMin, i) => {
            const isLastChunk = i === chunks.length - 1;
            segments.push({ type: 'work', entry, minutes: chunkMin, isLastChunk });
            const isVeryLastSegment = (entryIdx === openEntries.length - 1) && isLastChunk;
            if (!isVeryLastSegment) {
                const breakMin = isLastChunk ? standardBreak + bonusBreakMinutes : standardBreak;
                segments.push({ type: 'break', minutes: breakMin });
            }
        });
    });
    return segments;
}

function startFlow() {
    flowSegments = buildFlowSegments();
    if (flowSegments.length === 0) {
        alert("No open tasks to flow through.");
        return;
    }

    timerMode = 'flow';
    flowSegIndex = 0;
    hasStartedOnce = true;
    setFlowControlsVisible(true);
    beginFlowSegment();

    startPauseBtn.textContent = 'Pause';
    isRunning = true;
    requestWakeLock();
    clearInterval(timerInterval);
    timerInterval = setInterval(runTick, 1000);
}

function currentFlowSegment() { return flowSegments[flowSegIndex]; }

function beginFlowSegment() {
    const seg = currentFlowSegment();
    if (!seg) { finishFlow(); return; }
    flowExtraSeconds = 0;
    totalTime = timeLeft = seg.minutes * 60;

    if (seg.type === 'work') {
        modeIndicator.textContent = `Flow: ${seg.entry.task.text}`;
        progressBar.style.backgroundColor = 'var(--cherry-red)';
        if(!seg.entry.task.startedAtIso) seg.entry.task.startedAtIso = new Date().toISOString();
        announce('Work');
    } else {
        modeIndicator.textContent = 'Flow: Break';
        progressBar.style.backgroundColor = 'var(--green)';
        announce('Break');
    }
    updateDisplay();
}

function advanceFlow() {
    playSound();
    const seg = currentFlowSegment();
    if (seg && seg.type === 'work') {
        seg.entry.actualSecondsSoFar += seg.minutes * 60 + flowExtraSeconds;
        recordFlowBlockCompleted();
        if (seg.isLastChunk) completeFlowTask(seg.entry, seg.entry.actualSecondsSoFar);
        else {
            seg.entry.task.trackedSeconds = seg.entry.actualSecondsSoFar;
            saveBoardData();
        }
    }
    flowSegIndex++;
    beginFlowSegment();
}

function completeFlowTask(entry, actualSeconds) {
    const task = entry.task;
    task.completed = true;
    task.isTracking = false;
    task.trackedSeconds = actualSeconds;
    task.completedAt = Date.now();
    task.completedAtIso = new Date().toISOString();
    
    if(task.startedAtIso) {
        task.timeSegments.push({ start: task.startedAtIso, end: task.completedAtIso });
    }

    const historyId = `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    task._historyId = historyId;
    
    const totalBreaks = task.breaks.reduce((acc, b) => acc + (b.durationMinutes || 0), 0);
    let breaksStr = task.breaks.length ? `[Breaks: ${task.breaks.map(b=>b.reason).join(', ')}] ` : '';
    
    historyData.unshift({
        _id: historyId,
        client: entry.col.title,
        task: task.text,
        estimateMinutes: task.estimateMinutes,
        actualMinutes: Math.round(actualSeconds / 60),
        breakMinutes: totalBreaks,
        notes: breaksStr + (task.notes || 'Completed via Flow'),
        completedAt: task.completedAtIso
    });
    if (historyData.length > 500) historyData.pop();
    rememberTaskTime(task.text, Math.round(actualSeconds / 60));
    saveBoardData();
    renderBoard();
    renderEstimateLog();
    renderDailyRecap();
    renderInternalQueue();
}

function finishFlow() {
    clearInterval(timerInterval);
    isRunning = false;
    releaseWakeLock();
    timerMode = 'manual';
    isWorkTime = true;
    setFlowControlsVisible(false);
    startPauseBtn.textContent = hasStartedOnce ? 'Resume' : 'Start';
    modeIndicator.textContent = 'Flow Complete!';
    timeLeft = 0;
    updateDisplay();
    announce('Flow complete. Nice work.');
}

function skipFlowSegment() {
    if (timerMode !== 'flow') return;
    const seg = currentFlowSegment();
    if (seg && seg.type === 'work') {
        const elapsed = (seg.minutes * 60 - timeLeft) + flowExtraSeconds;
        seg.entry.actualSecondsSoFar += elapsed;
        completeFlowTask(seg.entry, seg.entry.actualSecondsSoFar);
    }
    flowSegIndex++;
    beginFlowSegment();
}

// ---------- Stop / End Session (Modal) ----------
function openEndSessionModal() {
    if (!hasStartedOnce && !isRunning) return;
    $('end-session-overlay').style.display = 'flex';
}
function closeEndSessionModal() { $('end-session-overlay').style.display = 'none'; }
function endSessionLogProgress() {
    creditCurrentSegment();
    finishSessionCleanup('Session Ended (Logged)');
    closeEndSessionModal();
}
function endSessionAbandon() {
    finishSessionCleanup('Session Ended');
    closeEndSessionModal();
}
function creditCurrentSegment() {
    if (timerMode === 'flow') {
        const seg = currentFlowSegment();
        if (seg && seg.type === 'work') {
            const elapsed = (seg.minutes * 60 - timeLeft) + flowExtraSeconds;
            seg.entry.actualSecondsSoFar += elapsed;
            recordFlowBlockCompleted();
            if (seg.isLastChunk) completeFlowTask(seg.entry, seg.entry.actualSecondsSoFar);
        }
    } else if (isWorkTime) recordFlowBlockCompleted();
}
function finishSessionCleanup(label) {
    clearInterval(timerInterval);
    isRunning = false;
    releaseWakeLock();
    timerMode = 'manual';
    isWorkTime = true;
    hasStartedOnce = false;
    setFlowControlsVisible(false);
    startPauseBtn.textContent = 'Start';
    modeIndicator.textContent = label;
    timeLeft = 0;
    updateDisplay();
    updateAdaptiveHacks();
}

// ---------- Clock In / Clock Out ----------
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
        
        if(confirm("Clocked Out. Generate a Daily Check-Out Brief based on today's logs?")) {
            generateDailyCheckOut();
        }
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
    renderDailyRecap();
}

// ---------- Task board & Schema Migration ----------
let mandatoryNotes = storageGet('focus_mandatory_notes', false);

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
function getYesterdayKey() {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dateKeyFromISO(isoString) {
    const d = new Date(isoString);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatDateKey(dateKey) {
    if (dateKey === getTodayKey()) return 'Today';
    if (dateKey === getYesterdayKey()) return 'Yesterday';
    const d = new Date(dateKey + 'T00:00:00');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

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
        if (t.startedAtIso === undefined) t.startedAtIso = null;
        if (t.completedAtIso === undefined) t.completedAtIso = null;
        if (t.googleLink === undefined) t.googleLink = '';
    });
});
saveBoardData();

function saveBoardData() {
    storageSet('focus_board_data', boardData);
    storageSet('focus_history_data', historyData);
}

function urgencyClassFor(task) {
    if (!task.estimateMinutes || task.trackedSeconds === 0) return '';
    const ratio = (task.trackedSeconds / 60) / task.estimateMinutes;
    if (ratio < 0.8) return 'time-ok';
    if (ratio <= 1.0) return 'time-warn';
    return 'time-over';
}

function getDeadlineBadge(task) {
    if(!task.deadlineTime) return '';
    const ms = new Date(task.deadlineTime).getTime() - Date.now();
    const hrs = ms / 3600000;
    if(hrs < 0) return `<span class="deadline-badge red">Overdue</span>`;
    if(hrs <= 1) return `<span class="deadline-badge red">< 1h</span>`;
    if(hrs <= 3) return `<span class="deadline-badge amber">< 3h</span>`;
    return '';
}

function formatMinSec(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

let _toggledDateGroups = {}; 

function groupTasksByDate(tasks) {
    const groups = {};
    tasks.forEach((task, originalIndex) => {
        const key = task.dateAdded || getTodayKey();
        if (!groups[key]) groups[key] = { incomplete: [], completed: [] };
        if (task.completed) groups[key].completed.push({ task, originalIndex });
        else groups[key].incomplete.push({ task, originalIndex });
    });
    
    Object.values(groups).forEach((g) => g.completed.sort((a, b) => (a.task.completedAt || 0) - (b.task.completedAt || 0)));
    
    const today = getTodayKey();
    const yesterday = getYesterdayKey();

    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map((key) => {
        let isCollapsed = (key !== today && key !== yesterday);
        if(_toggledDateGroups[key] !== undefined) isCollapsed = _toggledDateGroups[key];

        return {
            dateKey: key,
            dateLabel: formatDateKey(key),
            isCollapsed,
            items: [...groups[key].incomplete, ...groups[key].completed]
        };
    });
}

function toggleDateGroup(key) {
    const today = getTodayKey();
    const yesterday = getYesterdayKey();
    let isCurrentlyCollapsed = (key !== today && key !== yesterday);
    if(_toggledDateGroups[key] !== undefined) isCurrentlyCollapsed = _toggledDateGroups[key];
    
    _toggledDateGroups[key] = !isCurrentlyCollapsed;
    renderBoard();
}

function promptDeadline(ci, ti) {
    const input = $(`deadline-input-${ci}-${ti}`);
    const btn = $(`deadline-btn-${ci}-${ti}`);
    if(input && btn) {
        btn.style.display = 'none';
        input.style.display = 'inline-block';
        input.focus();
        if(typeof input.showPicker === 'function') {
            try { input.showPicker(); } catch(e){}
        }
    }
}

function renderBoard() {
    const container = $('board-container');
    if (!container) return;
    container.querySelectorAll('.task-column').forEach((el) => el.remove());

    const colCountLabel = $('column-count-label');
    if (colCountLabel) colCountLabel.textContent = `${boardData.length}/8 columns`;

    boardData.forEach((col, colIndex) => {
        const columnEl = document.createElement('div');
        columnEl.className = 'task-column';
        columnEl.dataset.colIndex = colIndex;
        const openCount = col.tasks.filter((t) => !t.completed).length;

        let suggestionsHtml = '';
        if(col.aiSuggestions) {
            suggestionsHtml = col.aiSuggestions.map((s, idx) => `
                <div class="ai-suggestion-banner">
                    <div><strong>AI Suggests:</strong> ${escapeHTML(s.task)} (${s.minutes}m)</div>
                    <div>
                        <button onclick="acceptAISuggestion(${colIndex}, ${idx})">Add</button>
                        <button onclick="dismissAISuggestion(${colIndex}, ${idx})">Dismiss</button>
                    </div>
                </div>
            `).join('');
        }

        columnEl.innerHTML = `
            <div class="column-header-row">
                <button class="icon-btn" onclick="toggleColumnCollapse(${colIndex})" title="${col.collapsed ? 'Expand' : 'Collapse'}">${col.collapsed ? '▸' : '▾'}</button>
                <input type="text" class="column-header-input" value="${escapeHTML(col.title)}" oninput="updateColumnTitle(${colIndex}, this.value)" placeholder="Project / Client Name">
                ${col.collapsed ? `<span style="font-size:0.75rem;color:#888;white-space:nowrap;">${openCount} open</span>` : ''}
                <div class="column-header-actions">
                    <button class="icon-btn" onclick="moveColumn(${colIndex}, -1)">◀</button>
                    <button class="icon-btn" onclick="moveColumn(${colIndex}, 1)">▶</button>
                    <button class="delete-btn" onclick="deleteColumn(${colIndex})">×</button>
                </div>
            </div>

            <div class="column-body" style="${col.collapsed ? 'display:none;' : ''}">
            
            <div class="ai-batch-actions">
                <button onclick="suggestColumnTimesAI(${colIndex})">Suggest Times (AI)</button>
                <button onclick="optimizeColumnFlowAI(${colIndex})">Optimize Flow & Gaps (AI)</button>
                <button onclick="generateColumnCheckIn(${colIndex})">Client Check-In (AI)</button>
            </div>

            ${suggestionsHtml}

            <ul class="task-list" ondragover="allowDrop(event)" ondrop="dropTask(event, ${colIndex})">
                ${groupTasksByDate(col.tasks).map((group) => `
                    <li class="date-group-header" onclick="toggleDateGroup('${group.dateKey}')">${group.dateLabel} ${group.isCollapsed ? '▸' : '▾'}</li>
                    ${group.isCollapsed ? '' : group.items.map(({ task, originalIndex: taskIndex }) => `
                        <li class="task-item ${task.completed ? 'completed' : ''} ${urgencyClassFor(task)}" id="task-${colIndex}-${taskIndex}" draggable="${!task.completed}" ondragstart="dragStart(event, ${colIndex}, ${taskIndex})">
                            <div class="task-main-row">
                                <div class="task-left">
                                    <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="toggleTask(${colIndex}, ${taskIndex})">
                                    <input type="text" class="task-name-input" value="${escapeHTML(task.text)}" onchange="updateTaskText(${colIndex}, ${taskIndex}, this.value)">
                                </div>
                                <div class="task-actions">
                                    ${task.deadlineTime ? 
                                        `<input type="datetime-local" class="task-deadline-input" value="${task.deadlineTime}" onchange="updateTaskDeadline(${colIndex}, ${taskIndex}, this.value)">` 
                                        : 
                                        `<button id="deadline-btn-${colIndex}-${taskIndex}" class="deadline-trigger-btn" onclick="promptDeadline(${colIndex}, ${taskIndex})">+ Deadline</button>
                                         <input type="datetime-local" id="deadline-input-${colIndex}-${taskIndex}" class="task-deadline-input" style="display:none;" onchange="updateTaskDeadline(${colIndex}, ${taskIndex}, this.value)">`
                                    }
                                    ${getDeadlineBadge(task)}
                                    <input type="number" class="task-estimate-input" value="${task.estimateMinutes}" min="1" max="480" title="Estimated minutes" onchange="updateTaskEstimate(${colIndex}, ${taskIndex}, parseInt(this.value))">m
                                    <button class="track-btn ${task.isTracking ? 'tracking' : ''}" id="track-btn-${colIndex}-${taskIndex}" onclick="toggleTrack(${colIndex}, ${taskIndex})">${task.isTracking ? '⏸' : '▶'} ${formatMinSec(task.trackedSeconds)}</button>
                                    ${task.googleLink ? `<a href="${task.googleLink}" target="_blank" class="icon-btn" title="Open Link">🔗</a>` : ''}
                                    ${!task.completed ? `
                                    <button class="icon-btn" onclick="moveTask(${colIndex}, ${taskIndex}, -1)">▲</button>
                                    <button class="icon-btn" onclick="moveTask(${colIndex}, ${taskIndex}, 1)">▼</button>
                                    ` : ''}
                                    <button class="delete-btn" onclick="deleteTask(${colIndex}, ${taskIndex})">×</button>
                                </div>
                            </div>
                            <button class="details-trigger-btn" onclick="openDetailsModal(${colIndex}, ${taskIndex})">Details${task.notes ? ' •' : ''}</button>
                            ${task.stagedEstimate ? `
                            <div class="ai-suggestion-banner" style="margin-top:4px;">
                                <span>AI suggests: <strong>${task.stagedEstimate} min</strong></span>
                                <div><button onclick="applyTaskEstimate(${colIndex}, ${taskIndex})">Apply</button> <button onclick="dismissTaskEstimate(${colIndex}, ${taskIndex})">x</button></div>
                            </div>` : ''}
                        </li>
                    `).join('')}
                `).join('')}
            </ul>

            <div class="task-input-group">
                <input type="text" class="task-input" id="task-input-${colIndex}" placeholder="Add a new task..." onkeypress="handleKeyPress(event, ${colIndex})">
                <input type="number" class="task-estimate-new" id="task-est-${colIndex}" value="15" min="1" max="480">
                <button class="add-task-btn" onclick="addTask(${colIndex})">Add</button>
            </div>

            <textarea class="task-input paste-textarea" id="paste-box-${colIndex}" rows="2" placeholder="Paste bulk tasks here (e.g. 'write script 25 mins')..."></textarea>
            <button class="add-task-btn" style="width:100%;margin-bottom:0.6rem;" onclick="addPastedTasks(${colIndex})">Add Pasted Tasks</button>
            
            ${col.tasks.some(t=>t.stagedEstimate) ? `
            <div class="ai-batch-actions" style="margin-top:10px;">
                <button onclick="applyAllEstimates(${colIndex})" style="background:var(--cherry-red);color:white;">Apply All Times</button>
                <button onclick="dismissAllEstimates(${colIndex})">Dismiss All</button>
            </div>` : ''}

            </div>
        `;
        container.appendChild(columnEl);
    });
    updateAdaptiveHacks();
    renderTimeCounter();
    renderInternalQueue();
}

// Column Task Drag & Drop
let dragContext = null;
function dragStart(e, ci, ti) {
    dragContext = { ci, ti };
    e.dataTransfer.effectAllowed = "move";
    setTimeout(()=> e.target.classList.add('dragging'), 0);
}
function allowDrop(e) { e.preventDefault(); }
function dropTask(e, targetColIndex) {
    e.preventDefault();
    document.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));
    if(!dragContext) return;
    const { ci, ti } = dragContext;
    const task = boardData[ci].tasks[ti];
    
    const list = e.currentTarget;
    const y = e.clientY;
    let afterElement = null;
    let targetIndex = boardData[targetColIndex].tasks.length;
    
    const draggableElements = [...list.querySelectorAll('.task-item:not(.dragging)')];
    draggableElements.forEach(child => {
        const box = child.getBoundingClientRect();
        if(y > box.top && y < box.bottom) afterElement = child;
    });

    if(afterElement) {
        const parts = afterElement.id.split('-');
        targetIndex = parseInt(parts[2]);
    }

    boardData[ci].tasks.splice(ti, 1);
    boardData[targetColIndex].tasks.splice(targetIndex, 0, task);
    dragContext = null;
    saveBoardData();
    renderBoard();
}

function updateColumnTitle(ci, v) { boardData[ci].title = v; saveBoardData(); }
function toggleColumnCollapse(ci) { boardData[ci].collapsed = !boardData[ci].collapsed; saveBoardData(); renderBoard(); }
function moveColumn(ci, dir) {
    const target = ci + dir;
    if (target < 0 || target >= boardData.length) return;
    [boardData[ci], boardData[target]] = [boardData[target], boardData[ci]];
    saveBoardData(); renderBoard();
}
function addColumn() {
    if (boardData.length >= 8) { alert('Maximum of 8 columns.'); return; }
    boardData.push({ id: Date.now(), title: `New Project`, collapsed: false, tasks: [] });
    saveBoardData(); renderBoard();
}
function deleteColumn(ci) {
    if (boardData.length <= 1) { alert('Keep at least one column.'); return; }
    if (!confirm(`Delete "${boardData[ci].title}"?`)) return;
    boardData.splice(ci, 1); saveBoardData(); renderBoard();
}

function addTask(ci) {
    const input = $(`task-input-${ci}`);
    const estInput = $(`task-est-${ci}`);
    const text = input.value.trim();
    if (!text) return;
    if (mandatoryNotes) alert("Mandatory Extra Info is enabled. Please add notes via Details.");

    boardData[ci].tasks.push({
        id: 't_' + Math.random().toString(36).substr(2,9),
        text: text,
        estimateMinutes: parseInt(estInput.value) || 15,
        trackedSeconds: 0, isTracking: false, notes: '',
        completed: false, completedAt: null, dateAdded: getTodayKey(),
        breaks: [], timeSegments: [], deadlineTime: null, googleLink: ''
    });
    input.value = '';
    saveBoardData(); renderBoard();
}

function parseTimeFromLine(line) {
    const re = /(\d+(?:\.\d+)?)\s*(hours|hour|hrs|hr|minutes|minute|mins|min|seconds|second|secs|sec)\b/i;
    const match = line.match(re);
    if (!match) return { text: line.trim(), minutes: null };
    
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    let minutes;
    if (unit.startsWith('h')) minutes = Math.round(value * 60);
    else if (unit.startsWith('s')) minutes = Math.max(1, Math.round(value / 60));
    else minutes = Math.round(value);

    const cleanText = (line.slice(0, match.index) + line.slice(match.index + match[0].length))
        .replace(/[\s,.:-]+$/, '')
        .trim();
    return { text: cleanText || line.trim(), minutes };
}

function addPastedTasks(ci) {
    const textarea = $(`paste-box-${ci}`);
    const lines = textarea.value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    
    const newTasks = lines.map((line) => {
        const { text, minutes } = parseTimeFromLine(line);
        let finalMins = minutes || 15;
        return {
            id: 't_' + Math.random().toString(36).substr(2,9),
            text: text, estimateMinutes: finalMins, trackedSeconds: 0,
            isTracking: false, notes: '', completed: false, completedAt: null,
            dateAdded: getTodayKey(), breaks: [], timeSegments: [], deadlineTime: null, googleLink: ''
        };
    });
    
    boardData[ci].tasks.push(...newTasks);
    textarea.value = ''; saveBoardData(); renderBoard();
}

function updateTaskText(ci, ti, v) { boardData[ci].tasks[ti].text = v.trim() || 'Untitled task'; saveBoardData(); }
function updateTaskEstimate(ci, ti, v) { 
    if(isNaN(v) || v<1) v=1; 
    boardData[ci].tasks[ti].estimateMinutes = v; 
    saveBoardData(); renderBoard(); 
}
function updateTaskDeadline(ci, ti, v) {
    boardData[ci].tasks[ti].deadlineTime = v || null;
    saveBoardData(); renderBoard();
}
function moveTask(ci, ti, dir) {
    const tasks = boardData[ci].tasks;
    const task = tasks[ti];
    if (task.completed) return;
    const listEl = $(`task-${ci}-${ti}`).closest('.task-list');
    const scrollPos = listEl ? listEl.scrollTop : 0; 

    let target = ti + dir;
    while (target >= 0 && target < tasks.length) {
        if (tasks[target].dateAdded === task.dateAdded && !tasks[target].completed) {
            [tasks[ti], tasks[target]] = [tasks[target], tasks[ti]];
            saveBoardData(); 
            renderBoard();
            setTimeout(() => {
                const newList = $(`task-${ci}-${target}`).closest('.task-list');
                if(newList) newList.scrollTop = scrollPos;
            }, 0);
            return;
        }
        target += dir;
    }
}

// AI Batch Estimates & Optimizations
async function suggestColumnTimesAI(ci) {
    const apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) { alert('Add API Key in settings footer first.'); return; }
    
    let openTasks = boardData[ci].tasks.filter(t=>!t.completed);
    if(openTasks.length===0) return;

    const prompt = `Estimate realistic minutes for these tasks as JSON array: [{"id":"<task.id>","minutes":<num>}]. Tasks: ` + 
        openTasks.map(t=>`[id:${t.id}] ${t.text}`).join('; ');

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        const cleaned = data.candidates[0].content.parts[0].text.replace(/```json|