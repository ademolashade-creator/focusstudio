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

// ---------- App settings (name + dark mode) ----------
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

// ---------- Clocks & date ----------
function updateClocks() {
    const now = new Date();
    const dateEl = $('date-display'), watEl = $('clock-wat'), estEl = $('clock-est'), mstEl = $('clock-mst');
    if (dateEl) {
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        dateEl.textContent = `${dd}/${mm}/${now.getFullYear()}`;
    }
    if (watEl) watEl.textContent = now.toLocaleTimeString('en-US', { timeZone: 'Africa/Lagos', hour12: true });
    if (estEl) estEl.textContent = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: true });
    if (mstEl) mstEl.textContent = now.toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour12: true });

    if (now.getDate() === 30) {
        const banner = $('monthly-alert');
        if (banner) banner.style.display = 'block';
        maybeAutoGenerateSummary();
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

// ---------- Timer engine (manual Pomodoro mode + auto Flow mode) ----------
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
let flowExtraSeconds = 0; // +5-min additions during the current flow segment

let flowBlocksCompleted = parseInt(localStorage.getItem('focus_daily_sessions')) || 0;

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

// Short spoken announcement — falls back to the tone above if speech isn't available
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
        startPauseBtn.textContent = 'Resume';
        isRunning = false;
        releaseWakeLock();
        updateDisplay();
    } else {
        hasStartedOnce = true;
        startPauseBtn.textContent = 'Pause';
        isRunning = true;
        requestWakeLock();
        timerInterval = setInterval(runTick, 1000);
    }
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
    const counterEl = $('daily-counter');
    if (counterEl) counterEl.textContent = `${flowBlocksCompleted} Flow Blocks Completed`;
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

// ---------- Auto Flow: sequences through your open tasks, chunking long ones intelligently ----------
function setFlowControlsVisible(active) {
    const startBtn = $('start-flow-btn');
    if (startBtn) startBtn.style.display = active ? 'none' : 'inline-block';
}

// Splits a task's total minutes into work chunks of up to ~25 min each.
// A small leftover (10 min or less) gets folded into the last chunk instead of
// becoming its own tiny segment, and the break after that task gets extended
// by at least 5 minutes to compensate.
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
            } else {
                chunks.push(remaining);
            }
            remaining = 0;
        } else {
            chunks.push(CHUNK);
            remaining -= CHUNK;
        }
    }
    return { chunks, bonusBreakMinutes };
}

function buildFlowSegments() {
    const segments = [];
    const openEntries = [];
    boardData.forEach((col) => {
        col.tasks.forEach((task) => { if (!task.completed) openEntries.push({ col, task, actualSecondsSoFar: 0 }); });
    });
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
        alert("No open tasks to flow through — add a task with a time estimate first.");
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

    const historyId = `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    task._historyId = historyId;
    historyData.unshift({
        _id: historyId,
        client: entry.col.title,
        task: task.text,
        estimateMinutes: task.estimateMinutes,
        actualMinutes: Math.round(actualSeconds / 60),
        notes: task.notes || 'Completed via Flow',
        completedAt: new Date().toISOString()
    });
    if (historyData.length > 500) historyData.pop();
    rememberTaskTime(task.text, Math.round(actualSeconds / 60));
    saveBoardData();
    renderBoard();
    renderEstimateLog();
    renderDailyRecap();
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

// ---------- Stop / End Session (log progress, or abandon with no credit) ----------
function openEndSessionModal() {
    if (!hasStartedOnce && !isRunning) return; // nothing running to end
    $('end-session-overlay').style.display = 'flex';
}

function closeEndSessionModal() {
    $('end-session-overlay').style.display = 'none';
}

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
    } else if (isWorkTime) {
        recordFlowBlockCompleted();
    }
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

function skipFlowSegment() {
    if (timerMode !== 'flow') return;
    const seg = currentFlowSegment();
    if (seg && seg.type === 'work') {
        const elapsed = (seg.minutes * 60 - timeLeft) + flowExtraSeconds;
        seg.entry.actualSecondsSoFar += elapsed;
        if (seg.isLastChunk) completeFlowTask(seg.entry, seg.entry.actualSecondsSoFar);
    }
    flowSegIndex++;
    beginFlowSegment();
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
    } else {
        clockState = { clockedIn: true, startedAt: Date.now() };
    }
    storageSet('ff-clock-state', clockState);
    renderClockCard();
}

function renderClockCard() {
    const btn = $('clock-btn');
    const status = $('clock-status');
    if (!btn || !status) return;

    if (clockState.clockedIn) {
        btn.textContent = 'Clock Out';
        btn.classList.add('active');
        const elapsedMin = Math.max(0, Math.round((Date.now() - clockState.startedAt) / 60000));
        const h = Math.floor(elapsedMin / 60), m = elapsedMin % 60;
        status.textContent = `Clocked in since ${new Date(clockState.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${h}h ${m}m so far)`;
    } else {
        btn.textContent = 'Clock In';
        btn.classList.remove('active');
        status.textContent = clockLog.length ? `Last session: ${clockLog[0].durationMinutes} min on ${clockLog[0].date}` : 'Not clocked in.';
    }
    renderDailyRecap();

    const logBox = $('clock-log');
    if (logBox) {
        if (clockLog.length === 0) {
            logBox.innerHTML = '<p style="font-size:0.8rem;color:#888;">No sessions logged yet.</p>';
        } else {
            logBox.innerHTML = `<ul class="log-list">${clockLog.slice(0, 8).map(c =>
                `<li class="log-item"><span>${c.date}: ${c.clockIn} – ${c.clockOut}</span><span class="log-variance under">${c.durationMinutes} min</span></li>`
            ).join('')}</ul>`;
        }
    }
}

// ---------- Task board ----------
let mandatoryNotes = storageGet('focus_mandatory_notes', false);

const defaultColumns = [
    { id: 1, title: 'Client A / Priority 1', googleLink: '', tasks: [] },
    { id: 2, title: 'Client B / Priority 2', googleLink: '', tasks: [] },
    { id: 3, title: 'Admin & Content', googleLink: '', tasks: [] }
];

let boardData = storageGet('focus_board_data', defaultColumns);
let historyData = storageGet('focus_history_data', []);

// ---------- Date grouping helpers ----------
function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateKey(dateKey) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const d = new Date(dateKey + 'T00:00:00');
    if (d.getTime() === today.getTime()) return 'Today';
    if (d.getTime() === yesterday.getTime()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function dateKeyFromISO(isoString) {
    const d = new Date(isoString);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Groups a column's tasks by the day they were added. Within each day: open
// tasks first (in your manual order), then completed tasks below them,
// ordered by when you actually checked each one off.
function groupTasksByDate(tasks) {
    const groups = {};
    tasks.forEach((task, originalIndex) => {
        const key = task.dateAdded || getTodayKey();
        if (!groups[key]) groups[key] = { incomplete: [], completed: [] };
        if (task.completed) groups[key].completed.push({ task, originalIndex });
        else groups[key].incomplete.push({ task, originalIndex });
    });
    Object.values(groups).forEach((g) => g.completed.sort((a, b) => (a.task.completedAt || 0) - (b.task.completedAt || 0)));
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map((key) => ({
        dateKey: key,
        dateLabel: formatDateKey(key),
        items: [...groups[key].incomplete, ...groups[key].completed]
    }));
}

// Migrate older saved tasks that don't yet have time-tracking or date fields
boardData.forEach(col => {
    if (col.collapsed === undefined) col.collapsed = false;
    col.tasks.forEach(t => {
        if (t.estimateMinutes === undefined) t.estimateMinutes = 15;
        if (t.trackedSeconds === undefined) t.trackedSeconds = 0;
        if (t.isTracking === undefined) t.isTracking = false;
        if (t.dateAdded === undefined) t.dateAdded = getTodayKey();
        if (t.completedAt === undefined) t.completedAt = t.completed ? Date.now() : null;
    });
});

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

function formatMinSec(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderBoard() {
    const container = $('board-container');
    if (!container) return;
    container.innerHTML = '';

    const colCountLabel = $('column-count-label');
    if (colCountLabel) colCountLabel.textContent = `${boardData.length}/9 columns`;

    boardData.forEach((col, colIndex) => {
        const columnEl = document.createElement('div');
        columnEl.className = 'task-column';
        const openCount = col.tasks.filter((t) => !t.completed).length;

        columnEl.innerHTML = `
            <div class="column-header-row">
                <button class="icon-btn" onclick="toggleColumnCollapse(${colIndex})" title="${col.collapsed ? 'Expand' : 'Collapse'}">${col.collapsed ? '▸' : '▾'}</button>
                <input type="text" class="column-header-input" value="${escapeHTML(col.title)}" oninput="updateColumnTitle(${colIndex}, this.value)" placeholder="Project / Client Name">
                ${col.collapsed ? `<span style="font-size:0.75rem;color:#888;white-space:nowrap;">${openCount} open</span>` : ''}
                <div class="column-header-actions">
                    <button class="icon-btn" onclick="moveColumn(${colIndex}, -1)" title="Move Left">◀</button>
                    <button class="icon-btn" onclick="moveColumn(${colIndex}, 1)" title="Move Right">▶</button>
                    <button class="delete-btn" onclick="deleteColumn(${colIndex})" title="Delete Column">×</button>
                </div>
            </div>

            <div class="column-body" style="${col.collapsed ? 'display:none;' : ''}">
            <ul class="task-list">
                ${groupTasksByDate(col.tasks).map((group) => `
                    <li class="date-group-header">${group.dateLabel}</li>
                    ${group.items.map(({ task, originalIndex: taskIndex }) => `
                        <li class="task-item ${task.completed ? 'completed' : ''} ${urgencyClassFor(task)}" id="task-${colIndex}-${taskIndex}">
                            <div class="task-main-row">
                                <div class="task-left">
                                    <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="toggleTask(${colIndex}, ${taskIndex})">
                                    <input type="text" class="task-name-input" value="${escapeHTML(task.text)}" onchange="updateTaskText(${colIndex}, ${taskIndex}, this.value)">
                                </div>
                                <div class="task-actions">
                                    <input type="number" class="task-estimate-input" value="${task.estimateMinutes}" min="1" max="480" title="Estimated minutes" onchange="updateTaskEstimate(${colIndex}, ${taskIndex}, parseInt(this.value))">m
                                    <button class="track-btn ${task.isTracking ? 'tracking' : ''}" id="track-btn-${colIndex}-${taskIndex}" onclick="toggleTrack(${colIndex}, ${taskIndex})" title="Start or pause a stopwatch for this task">${task.isTracking ? '⏸ Tracking' : '▶ Track Time'} ${formatMinSec(task.trackedSeconds)}</button>
                                    ${!task.completed ? `
                                    <button class="icon-btn" onclick="moveTask(${colIndex}, ${taskIndex}, -1)" title="Move Up">▲</button>
                                    <button class="icon-btn" onclick="moveTask(${colIndex}, ${taskIndex}, 1)" title="Move Down">▼</button>
                                    ` : ''}
                                    <button class="delete-btn" onclick="deleteTask(${colIndex}, ${taskIndex})">×</button>
                                </div>
                            </div>
                            <button class="details-trigger-btn" onclick="openDetailsModal(${colIndex}, ${taskIndex})">Details${task.notes ? ' •' : ''}</button>
                        </li>
                    `).join('')}
                `).join('')}
            </ul>

            <div class="task-input-group">
                <input type="text" class="task-input" id="task-input-${colIndex}" placeholder="Add a new task..." onkeypress="handleKeyPress(event, ${colIndex})">
                <input type="number" class="task-estimate-new" id="task-est-${colIndex}" value="15" min="1" max="480" title="Estimated minutes">
                <button class="add-task-btn" onclick="addTask(${colIndex})">Add</button>
            </div>

            <textarea class="task-input paste-textarea" id="paste-box-${colIndex}" rows="2" placeholder="Or paste several tasks, one per line — e.g. 'design post 30 mins'."></textarea>
            <button class="add-task-btn" style="width:100%;margin-bottom:0.6rem;" onclick="addPastedTasks(${colIndex})">Add Pasted Tasks</button>

            <div class="google-link-container">
                <input type="url" class="google-link-input" value="${escapeHTML(col.googleLink || '')}" oninput="updateGoogleLink(${colIndex}, this.value)" placeholder="Paste Google Doc/Sheet Link...">
                <a href="${col.googleLink || '#'}" target="_blank" class="google-link-btn" title="Open Link">Open</a>
            </div>
            </div>
        `;
        container.appendChild(columnEl);
    });
    updateAdaptiveHacks();
    renderTimeCounter();
}

function updateColumnTitle(colIndex, newTitle) { boardData[colIndex].title = newTitle; saveBoardData(); }
function updateGoogleLink(colIndex, newLink) { boardData[colIndex].googleLink = newLink; saveBoardData(); }

function toggleColumnCollapse(colIndex) {
    boardData[colIndex].collapsed = !boardData[colIndex].collapsed;
    saveBoardData();
    renderBoard();
}

function moveColumn(colIndex, direction) {
    const target = colIndex + direction;
    if (target < 0 || target >= boardData.length) return;
    [boardData[colIndex], boardData[target]] = [boardData[target], boardData[colIndex]];
    saveBoardData();
    renderBoard();
}

function addColumn() {
    if (boardData.length >= 9) { alert('Maximum of 9 columns.'); return; }
    boardData.push({ id: Date.now(), title: `New Column ${boardData.length + 1}`, googleLink: '', collapsed: false, tasks: [] });
    saveBoardData();
    renderBoard();
}

function deleteColumn(colIndex) {
    if (boardData.length <= 1) { alert('Keep at least one column.'); return; }
    if (!confirm(`Delete "${boardData[colIndex].title}" and all its tasks? This can't be undone.`)) return;
    boardData.splice(colIndex, 1);
    saveBoardData();
    renderBoard();
}

// ---------- Time Counter: total minutes and projected completion clock times ----------
function computeColumnTimeline(standardBreakMinutes) {
    let grandWork = 0;
    const perColumn = boardData.map((col) => {
        let colWork = 0, colTotalWithBreaks = 0;
        const openTasks = col.tasks.filter((t) => !t.completed);
        openTasks.forEach((task, i) => {
            const { chunks, bonusBreakMinutes } = buildChunks(Math.max(1, task.estimateMinutes || 15));
            const taskWork = chunks.reduce((a, b) => a + b, 0);
            colWork += taskWork;
            colTotalWithBreaks += taskWork + (chunks.length - 1) * standardBreakMinutes;
            const isLastTaskInCol = i === openTasks.length - 1;
            if (!isLastTaskInCol) colTotalWithBreaks += standardBreakMinutes + bonusBreakMinutes;
        });
        grandWork += colWork;
        return { title: col.title, workMinutes: colWork, totalWithBreaksMinutes: colTotalWithBreaks, taskCount: openTasks.length };
    });

    let grandTotal = 0;
    perColumn.forEach((c, idx) => {
        grandTotal += c.totalWithBreaksMinutes;
        if (idx < perColumn.length - 1 && c.taskCount > 0) grandTotal += standardBreakMinutes;
    });

    return { perColumn, grandWorkMinutes: grandWork, grandTotalMinutes: grandTotal };
}

function getSelectedTimezone() {
    return storageGet('ff-timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function updateTimezone(tz) {
    storageSet('ff-timezone', tz);
    renderTimeCounter();
}

function populateTimezoneSelect() {
    const sel = $('timezone-select');
    if (!sel) return;
    let zones;
    try { zones = Intl.supportedValuesOf('timeZone'); }
    catch (e) { zones = ['UTC', 'Africa/Lagos', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Australia/Sydney']; }
    const current = getSelectedTimezone();
    sel.innerHTML = zones.map((z) => `<option value="${z}" ${z === current ? 'selected' : ''}>${z}</option>`).join('');
}

function formatTimeInZone(date, tz) {
    return date.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
}

function renderTimeCounter() {
    const box = $('time-counter-box');
    if (!box) return;
    const breakMin = parseInt(breakInput.value) || 5;
    const { perColumn, grandWorkMinutes, grandTotalMinutes } = computeColumnTimeline(breakMin);
    const tz = getSelectedTimezone();
    const now = new Date();
    let cursor = new Date(now);
    let rows = '';

    perColumn.forEach((c, idx) => {
        if (c.taskCount === 0) {
            rows += `<div class="log-item"><span>${escapeHTML(c.title)}</span><span style="color:#999;">No open tasks</span></div>`;
            return;
        }
        cursor = new Date(cursor.getTime() + c.totalWithBreaksMinutes * 60000);
        rows += `<div class="log-item"><span>${escapeHTML(c.title)} (${c.workMinutes} min work)</span><span class="log-variance under">Done by ${formatTimeInZone(cursor, tz)}</span></div>`;
        if (idx < perColumn.length - 1 && c.taskCount > 0) cursor = new Date(cursor.getTime() + breakMin * 60000);
    });

    const grandDone = new Date(now.getTime() + grandTotalMinutes * 60000);
    box.innerHTML = `<ul class="log-list">${rows}</ul>
        <p style="margin-top:8px;font-size:0.85rem;"><strong>${grandWorkMinutes} min</strong> total work across all open tasks.</p>
        <p style="font-weight:700;">All columns done by ${formatTimeInZone(grandDone, tz)} (${tz})</p>`;
}

function addTask(colIndex) {
    const input = $(`task-input-${colIndex}`);
    const estInput = $(`task-est-${colIndex}`);
    const text = input.value.trim();
    if (!text) return;

    if (mandatoryNotes) {
        alert("Mandatory Extra Info is enabled! Please add notes via the notes dropdown after creating the task.");
    }

    boardData[colIndex].tasks.push({
        text: text,
        estimateMinutes: parseInt(estInput.value) || 15,
        trackedSeconds: 0,
        isTracking: false,
        notes: '',
        completed: false,
        completedAt: null,
        dateAdded: getTodayKey(),
        showNotes: false
    });
    input.value = '';
    saveBoardData();
    renderBoard();
}

// Recognizes a trailing time phrase like "30 mins", "1.5 hrs", "90 secs" and converts it to minutes.
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

// ---------- Remembered task times (learns from your own history) ----------
let taskTimeMemory = storageGet('ff-task-time-memory', {});

function normalizeTaskName(text) {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function rememberTaskTime(text, minutes) {
    const key = normalizeTaskName(text);
    if (!key) return;
    const entry = taskTimeMemory[key] || { total: 0, count: 0 };
    entry.total += minutes;
    entry.count += 1;
    taskTimeMemory[key] = entry;
    storageSet('ff-task-time-memory', taskTimeMemory);
}

function getRememberedMinutes(text) {
    const entry = taskTimeMemory[normalizeTaskName(text)];
    return entry ? Math.round(entry.total / entry.count) : null;
}

function addPastedTasks(colIndex) {
    const textarea = $(`paste-box-${colIndex}`);
    const lines = textarea.value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const newTasks = lines.map((line) => {
        const { text, minutes } = parseTimeFromLine(line);
        let finalMinutes = minutes;
        let needsAi = false;
        if (finalMinutes === null) {
            const remembered = getRememberedMinutes(text);
            if (remembered) finalMinutes = remembered;
            else needsAi = true;
        }
        return {
            text,
            estimateMinutes: finalMinutes || 15,
            needsAiEstimate: needsAi,
            trackedSeconds: 0,
            isTracking: false,
            notes: '',
            completed: false,
            completedAt: null,
            dateAdded: getTodayKey(),
            showNotes: false
        };
    });

    boardData[colIndex].tasks.push(...newTasks);
    textarea.value = '';
    saveBoardData();
    renderBoard();

    const needingAi = newTasks.filter((t) => t.needsAiEstimate);
    if (needingAi.length > 0) suggestAiEstimatesBatch(needingAi);
}

function handleKeyPress(event, colIndex) { if (event.key === 'Enter') addTask(colIndex); }

// ---------- AI time estimate suggestions (Gemini) ----------
async function suggestAiEstimatesBatch(tasks) {
    const apiKey = storageGet('gemini_api_key', null);
    if (tasks.length === 0) return;
    if (!apiKey) {
        alert('Added with a default 15-minute estimate. Save your Gemini API key in the Monthly Summary section to get AI-suggested times instead.');
        return;
    }

    const promptText = `You are helping estimate realistic, feasible time in minutes for short work tasks. For each task below, give your best realistic estimate in minutes as a whole number. Respond with ONLY a JSON array, no other text, in exactly this form: [{"task":"<exact task text given>","minutes": <number>}]. Tasks:\n` +
        tasks.map((t) => `- "${t.text}"`).join('\n');

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });
        if (!res.ok) {
            console.error('Gemini estimate request failed', res.status, await res.text());
            return;
        }
        const data = await res.json();
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const suggestions = JSON.parse(cleaned);

        suggestions.forEach((s) => {
            const match = tasks.find((t) => t.text === s.task);
            if (match && s.minutes) {
                match.estimateMinutes = Math.max(1, Math.round(s.minutes));
                delete match.needsAiEstimate;
            }
        });
        saveBoardData();
        renderBoard();
    } catch (e) { console.error('Gemini estimate parsing failed', e); }
}

async function suggestTimeForTask(colIndex, taskIndex) {
    const apiKey = storageGet('gemini_api_key', null);
    const task = boardData[colIndex].tasks[taskIndex];
    if (!apiKey) { alert('Add your Gemini API key in the Monthly Summary section first.'); return; }

    const promptText = `Estimate a realistic, feasible time in minutes for this work task, using all the detail given. Respond with ONLY a number, no words or units.\nTask: "${task.text}"\nNotes: "${task.notes || 'none'}"`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });
        if (!res.ok) return;
        const data = await res.json();
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const num = parseInt((raw.match(/\d+/) || [])[0]);
        if (num) {
            task.estimateMinutes = Math.max(1, num);
            saveBoardData();
            renderBoard();
        }
    } catch (e) { /* leave estimate unchanged */ }
}

// ---------- Details popup (notes + AI time suggestion) ----------
let openDetailsRef = null; // { colIndex, taskIndex }

function openDetailsModal(colIndex, taskIndex) {
    openDetailsRef = { colIndex, taskIndex };
    const task = boardData[colIndex].tasks[taskIndex];
    $('details-task-name').textContent = task.text;
    $('details-notes-textarea').value = task.notes || '';
    $('details-estimate-label').textContent = `Current estimate: ${task.estimateMinutes} min`;
    $('details-overlay').style.display = 'flex';
}

function closeDetailsModal() {
    if (openDetailsRef) saveDetailsNotes();
    openDetailsRef = null;
    $('details-overlay').style.display = 'none';
}

function saveDetailsNotes() {
    if (!openDetailsRef) return;
    const { colIndex, taskIndex } = openDetailsRef;
    updateTaskNotes(colIndex, taskIndex, $('details-notes-textarea').value);
}

async function suggestTimeFromDetails() {
    if (!openDetailsRef) return;
    const { colIndex, taskIndex } = openDetailsRef;
    saveDetailsNotes();
    await suggestTimeForTask(colIndex, taskIndex);
    const task = boardData[colIndex].tasks[taskIndex];
    $('details-estimate-label').textContent = `Current estimate: ${task.estimateMinutes} min`;
}

function updateTaskNotes(colIndex, taskIndex, newNotes) { boardData[colIndex].tasks[taskIndex].notes = newNotes; saveBoardData(); }
function updateTaskText(colIndex, taskIndex, newText) { boardData[colIndex].tasks[taskIndex].text = newText.trim() || 'Untitled task'; saveBoardData(); }

// Updates just this task's dependent visuals instead of rebuilding the whole
// board, which is what was causing the value to snap back on edit.
function updateTaskEstimate(colIndex, taskIndex, newVal) {
    if (isNaN(newVal) || newVal < 1) newVal = 1;
    boardData[colIndex].tasks[taskIndex].estimateMinutes = newVal;
    saveBoardData();

    const task = boardData[colIndex].tasks[taskIndex];
    const li = $(`task-${colIndex}-${taskIndex}`);
    if (li) {
        li.classList.remove('time-ok', 'time-warn', 'time-over');
        const cls = urgencyClassFor(task);
        if (cls) li.classList.add(cls);
    }
    updateAdaptiveHacks();
    renderTimeCounter();
}

function moveTask(colIndex, taskIndex, direction) {
    const tasks = boardData[colIndex].tasks;
    const task = tasks[taskIndex];
    if (task.completed) return; // completed tasks order themselves by when you checked them off

    let target = taskIndex + direction;
    while (target >= 0 && target < tasks.length) {
        const candidate = tasks[target];
        if (candidate.dateAdded === task.dateAdded && !candidate.completed) {
            [tasks[taskIndex], tasks[target]] = [tasks[target], tasks[taskIndex]];
            saveBoardData();
            renderBoard();
            return;
        }
        target += direction;
    }
}

function toggleTrack(colIndex, taskIndex) {
    boardData[colIndex].tasks[taskIndex].isTracking = !boardData[colIndex].tasks[taskIndex].isTracking;
    saveBoardData();
    renderBoard();
}

// ---------- Completing / un-completing a task ----------
let pendingCompletion = null; // { colIndex, taskIndex }

function toggleTask(colIndex, taskIndex) {
    const task = boardData[colIndex].tasks[taskIndex];

    // Un-checking: remove its history entry so re-checking later doesn't duplicate it.
    if (task.completed) {
        task.completed = false;
        task.completedAt = null;
        if (task._historyId) {
            const idx = historyData.findIndex((h) => h._id === task._historyId);
            if (idx !== -1) historyData.splice(idx, 1);
            task._historyId = null;
        }
        saveBoardData();
        renderBoard();
        renderEstimateLog();
        return;
    }

    if (mandatoryNotes && (!task.notes || task.notes.trim() === '')) {
        alert("Mandatory Extra Info is turned ON! Please fill out task details before completing this task.");
        renderBoard();
        return;
    }

    // Never tracked (no stopwatch use, not finished via Flow) — ask what it actually took.
    if (task.trackedSeconds === 0) {
        pendingCompletion = { colIndex, taskIndex };
        $('completion-task-name').textContent = task.text;
        $('completion-actual-input').value = task.estimateMinutes;
        $('completion-overlay').style.display = 'flex';
        return;
    }

    finalizeTaskCompletion(colIndex, taskIndex, task.trackedSeconds);
}

function confirmCompletion() {
    if (!pendingCompletion) return;
    const { colIndex, taskIndex } = pendingCompletion;
    const task = boardData[colIndex].tasks[taskIndex];
    const minutes = Math.max(1, parseInt($('completion-actual-input').value) || task.estimateMinutes);
    finalizeTaskCompletion(colIndex, taskIndex, minutes * 60);
    pendingCompletion = null;
    $('completion-overlay').style.display = 'none';
}

function cancelCompletion() {
    pendingCompletion = null;
    $('completion-overlay').style.display = 'none';
    renderBoard(); // reverts the checkbox's visual state
}

function finalizeTaskCompletion(colIndex, taskIndex, actualSeconds) {
    const task = boardData[colIndex].tasks[taskIndex];
    task.completed = true;
    task.isTracking = false;
    task.trackedSeconds = actualSeconds;
    task.completedAt = Date.now();

    const historyId = `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    task._historyId = historyId;
    historyData.unshift({
        _id: historyId,
        client: boardData[colIndex].title,
        task: task.text,
        estimateMinutes: task.estimateMinutes,
        actualMinutes: Math.round(actualSeconds / 60),
        notes: task.notes || 'No extra notes provided',
        completedAt: new Date().toISOString()
    });
    if (historyData.length > 500) historyData.pop();
    rememberTaskTime(task.text, Math.round(actualSeconds / 60));

    saveBoardData();
    renderBoard();
    renderEstimateLog();
    renderDailyRecap();
}

function deleteTask(colIndex, taskIndex) {
    boardData[colIndex].tasks.splice(taskIndex, 1);
    saveBoardData();
    renderBoard();
}

function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// ---------- Per-second tracking tick (updates without a full re-render) ----------
let trackTickCount = 0;
function tickTracking() {
    let anyTracking = false;
    boardData.forEach((col, ci) => {
        col.tasks.forEach((task, ti) => {
            if (task.isTracking && !task.completed) {
                anyTracking = true;
                task.trackedSeconds++;
                const btn = $(`track-btn-${ci}-${ti}`);
                if (btn) btn.textContent = `⏸ ${formatMinSec(task.trackedSeconds)}`;
                const li = $(`task-${ci}-${ti}`);
                if (li) {
                    li.classList.remove('time-ok', 'time-warn', 'time-over');
                    const cls = urgencyClassFor(task);
                    if (cls) li.classList.add(cls);
                }
            }
        });
    });
    if (anyTracking) {
        trackTickCount++;
        if (trackTickCount % 10 === 0) saveBoardData();
    }
}

// ---------- Adaptive Brain Engine ----------
function updateAdaptiveHacks() {
    const box = $('adaptive-hacks');
    if (!box) return;
    let totalEstimate = 0, openTasks = 0;
    boardData.forEach(col => col.tasks.forEach(t => { if (!t.completed) { totalEstimate += (t.estimateMinutes || 0); openTasks++; } }));
    const workMin = Math.round((workDuration || 1500) / 60);
    const sessions = openTasks > 0 ? Math.ceil(totalEstimate / workMin) : 0;

    const withBoth = historyData.filter(h => h.estimateMinutes && h.actualMinutes);
    let accuracyLine = "Complete a few tracked tasks to see how your time estimates compare to reality.";
    if (withBoth.length > 0) {
        const avgDiff = withBoth.reduce((a, h) => a + (h.actualMinutes - h.estimateMinutes), 0) / withBoth.length;
        if (Math.abs(avgDiff) < 2) accuracyLine = "Your estimates are tracking closely to actual time — nice calibration.";
        else if (avgDiff > 0) accuracyLine = `You're averaging ${Math.round(avgDiff)} min longer than estimated — pad future estimates a bit.`;
        else accuracyLine = `You're averaging ${Math.round(Math.abs(avgDiff))} min faster than estimated — you can tighten future estimates.`;
    }

    box.innerHTML = `<ul>
        <li><strong>Active Task Load:</strong> ${totalEstimate} minutes estimated across ${openTasks} open task(s)${sessions ? ` — roughly ${sessions} focus session(s) at your current ${workMin}-minute setting.` : '.'}</li>
        <li><strong>Time-Blindness Guard:</strong> Your timer flashes red at 3 minutes left in any work session.</li>
        <li><strong>Planning Accuracy:</strong> ${accuracyLine}</li>
    </ul>`;
}

async function reEstimateAllTasks() {
    const apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) { alert('Add your Gemini API key in the Monthly Summary section first.'); return; }

    const allOpenTasks = [];
    boardData.forEach((col) => col.tasks.forEach((t) => { if (!t.completed) allOpenTasks.push(t); }));
    if (allOpenTasks.length === 0) { alert('No open tasks to re-estimate.'); return; }
    if (!confirm(`Re-estimate all ${allOpenTasks.length} open task(s) with AI? This overwrites their current time estimates.`)) return;

    const promptText = `You are helping estimate realistic, feasible time in minutes for short work tasks. For each task below, give your best realistic estimate in minutes as a whole number. Respond with ONLY a JSON array, no other text, in exactly this form: [{"task":"<exact task text given>","minutes": <number>}]. Tasks:\n` +
        allOpenTasks.map((t) => `- "${t.text}"`).join('\n');

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });
        if (!res.ok) { alert(`Couldn't reach Gemini (${res.status}).`); return; }
        const data = await res.json();
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const suggestions = JSON.parse(cleaned);
        suggestions.forEach((s) => {
            const match = allOpenTasks.find((t) => t.text === s.task);
            if (match && s.minutes) match.estimateMinutes = Math.max(1, Math.round(s.minutes));
        });
        saveBoardData();
        renderBoard();
    } catch (e) {
        alert('Something went wrong re-estimating. Try again.');
    }
}

// ---------- Daily Recap ----------
function renderDailyRecap() {
    const box = $('daily-recap-box');
    if (!box) return;
    const todayKey = getTodayKey();
    const todayDateStr = new Date().toLocaleDateString();

    const todaysHistory = historyData.filter((h) => dateKeyFromISO(h.completedAt) === todayKey);
    const totalActualMinutes = todaysHistory.reduce((a, h) => a + (h.actualMinutes || 0), 0);

    let openFromToday = 0;
    boardData.forEach((col) => col.tasks.forEach((t) => { if (t.dateAdded === todayKey && !t.completed) openFromToday++; }));

    let clockedMinutesToday = clockLog.filter((c) => c.date === todayDateStr).reduce((a, c) => a + c.durationMinutes, 0);
    if (clockState.clockedIn) clockedMinutesToday += Math.max(0, Math.round((Date.now() - clockState.startedAt) / 60000));

    box.innerHTML = `<ul style="list-style:none;padding:0;margin:0;font-size:0.85rem;line-height:1.7;">
        <li><strong>${todaysHistory.length}</strong> task(s) finished today</li>
        <li><strong>${openFromToday}</strong> task(s) from today still open (carrying to tomorrow if not finished)</li>
        <li><strong>${totalActualMinutes} min</strong> of logged task time today</li>
        <li><strong>${clockedMinutesToday} min</strong> clocked in today${clockState.clockedIn ? ' (still running)' : ''}</li>
    </ul>`;
}

// ---------- Export data ----------
function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportAllDataJSON() {
    const data = {
        exportedAt: new Date().toISOString(),
        appSettings, boardData, historyData, clockLog, clockState, flowBlocksCompleted, taskTimeMemory
    };
    downloadBlob(JSON.stringify(data, null, 2), `focus-flow-export-${getTodayKey()}.json`, 'application/json');
}

function exportHistoryCSV() {
    const rows = [['Date', 'Client', 'Task', 'Estimate (min)', 'Actual (min)', 'Notes']];
    historyData.forEach((h) => rows.push([dateKeyFromISO(h.completedAt), h.client, h.task, h.estimateMinutes, h.actualMinutes, (h.notes || '').replace(/"/g, '""')]));
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob(csv, `focus-flow-history-${getTodayKey()}.csv`, 'text/csv');
}

// ---------- Estimate vs Actual rolling log ----------
function renderEstimateLog() {
    const logBox = $('estimate-log');
    if (!logBox) return;
    const recent = historyData.slice(0, 40);
    if (recent.length === 0) {
        logBox.innerHTML = '<p style="font-size:0.85rem;color:#888;">Complete a tracked task to start your log.</p>';
        return;
    }

    const groups = {};
    recent.forEach((h) => {
        const key = dateKeyFromISO(h.completedAt);
        if (!groups[key]) groups[key] = [];
        groups[key].push(h);
    });
    const orderedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    logBox.innerHTML = `<ul class="log-list">${orderedKeys.map((key) => `
        <li class="date-group-header">${formatDateKey(key)}</li>
        ${groups[key].map((h) => {
            const diff = (h.actualMinutes || 0) - (h.estimateMinutes || 0);
            let cls = 'under', label = `${diff <= 0 ? diff : '+' + diff}m`;
            if (diff > (h.estimateMinutes * 0.2)) cls = 'over';
            else if (diff > 0) cls = 'near';
            return `<li class="log-item"><span>${escapeHTML(h.task)}</span><span class="log-variance ${cls}">Est ${h.estimateMinutes}m / Act ${h.actualMinutes}m (${label})</span></li>`;
        }).join('')}
    `).join('')}</ul>`;
}

// ---------- Gemini AI: monthly client report ----------
function saveApiKey(key) { storageSet('gemini_api_key', key); }

async function generateAISummary(silent) {
    const apiKey = storageGet('gemini_api_key', null);
    const summaryBox = $('summary-content');
    if (!apiKey) {
        if (!silent) summaryBox.textContent = "Enter your Gemini API key above to generate a report.";
        return;
    }
    if (historyData.length === 0) {
        if (!silent) summaryBox.textContent = "No completed tasks logged yet — complete some tasks first.";
        return;
    }

    if (!silent) summaryBox.textContent = "Analyzing your tasks and drafting your client report...";

    const now = new Date();
    const thisMonthData = historyData.filter(h => {
        const d = new Date(h.completedAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const dataForPrompt = thisMonthData.length > 0 ? thisMonthData : historyData.slice(0, 100);

    const promptText = `Act as a professional project manager writing a polished monthly client report. Using the completed-task data below (each with client/column, task, estimated minutes, actual minutes spent, and notes), write a comprehensive report that:
1. Groups accomplishments by client/column with clear headers.
2. Summarizes what was delivered for each, referencing the notes where useful.
3. Includes a short section on time-estimate accuracy (where estimates ran over vs under, and by how much on average).
4. Closes with a brief, encouraging overall summary suitable for sending directly to a client or stakeholder.
Keep it well-organized and professional, not overly casual.

DATA:
${JSON.stringify(dataForPrompt, null, 2)}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });
        if (!response.ok) {
            const errText = await response.text();
            summaryBox.textContent = `Couldn't reach Gemini (${response.status}). ${errText.slice(0, 200)}`;
            return;
        }
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        summaryBox.textContent = text || "No summary returned — try again.";
        storageSet('ff-last-summary-month', `${now.getFullYear()}-${now.getMonth()}`);
    } catch (error) {
        summaryBox.textContent = "Network error while connecting to Gemini API. Check your connection and try again.";
    }
}

function maybeAutoGenerateSummary() {
    const now = new Date();
    const marker = `${now.getFullYear()}-${now.getMonth()}`;
    if (storageGet('ff-last-summary-month', null) === marker) return;
    const apiKey = storageGet('gemini_api_key', null);
    if (apiKey) generateAISummary(true);
}

// ---------- Init ----------
function initApp() {
    applySettings();
    updateClocks();
    setInterval(updateClocks, 1000);
    setInterval(tickTracking, 1000);

    $('mandatory-notes-toggle').checked = mandatoryNotes;
    $('gemini-api-key').value = storageGet('gemini_api_key', '');
    $('daily-counter').textContent = `${flowBlocksCompleted} Flow Blocks Completed`;
    setFlowControlsVisible(false);
    renderClockCard();
    setInterval(() => { if (clockState.clockedIn) renderClockCard(); }, 30000);

    populateTimezoneSelect();
    renderBoard();
    renderEstimateLog();
    updateDisplay();
}

function toggleMandatorySetting() {
    mandatoryNotes = $('mandatory-notes-toggle').checked;
    storageSet('focus_mandatory_notes', mandatoryNotes);
}

document.addEventListener('DOMContentLoaded', initApp);
