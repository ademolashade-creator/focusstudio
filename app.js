// ---------- Storage with Incognito / Fallback Support ----------
const memoryStore = {};

function storageGet(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        // Fallback to in-memory storage if localStorage is blocked (e.g. Incognito)
        return memoryStore[key] !== undefined ? memoryStore[key] : fallback;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        // Fallback to in-memory storage if localStorage throws an error
        memoryStore[key] = value;
    }
}
const $ = (id) => document.getElementById(id);

// ---------- App settings ----------
let appSettings = storageGet('ff-app-settings', { 
    appName: 'Focus & Flow Studio', 
    darkMode: false,
    notificationsEnabled: true
});

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
let headerClockZones = storageGet('ff-header-clock-zones', ['Africa/Lagos', 'America/New_York', 'America/Denver']);

function populateHeaderClockSelects() {
    var zones;
    try { zones = Intl.supportedValuesOf('timeZone'); }
    catch (e) { zones = ['UTC', 'Africa/Lagos', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Australia/Sydney']; }
    zones.sort();

    ['clock-tz-1', 'clock-tz-2', 'clock-tz-3'].forEach(function(id, i) {
        var sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = zones.map(function(z) {
            return '<option value="' + z + '" ' + (z === headerClockZones[i] ? 'selected' : '') + '>' + z + '</option>';
        }).join('');
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

    function safeTimeString(tz) {
        try {
            const test = new Date().toLocaleString('en-US', { timeZone: tz });
            return now.toLocaleTimeString('en-US', { timeZone: tz, hour12: true });
        } catch (e) {
            return now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: true });
        }
    }

    if (watEl) watEl.textContent = safeTimeString(headerClockZones[0]);
    if (estEl) estEl.textContent = safeTimeString(headerClockZones[1]);
    if (mstEl) mstEl.textContent = safeTimeString(headerClockZones[2]);

    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (now.getDate() === lastDay) {
        const banner = $('monthly-alert');
        if (banner) banner.style.display = 'block';
        maybeAutoGenerateSummary();
    }
}

// ---------- Quote Banner ----------
const quotes = [
    "Focus is the art of knowing what to ignore. — James Clear",
    "The secret of getting ahead is getting started. — Mark Twain",
    "It's not about having time; it's about making time. — Unknown",
    "Your mind is the most powerful tool you have. Use it wisely. — Unknown",
    "Clarity precedes mastery. — Robin Sharma",
    "The best way to predict the future is to create it. — Peter Drucker",
    "Success is the sum of small efforts repeated day in and day out. — Robert Collier",
    "You don't have to be extreme, just consistent. — Unknown",
    "The quality of your work is a reflection of the quality of your focus. — Unknown",
    "Do not let what you cannot do interfere with what you can do. — John Wooden"
    "Write to be understood, clear, and concise. Don't try to impress. — William Zinsser",
    "The most valuable asset on a blank page is a single declarative sentence. — Joan Didion",
    "Marketing is no longer about the stuff that you make, but about the stories you tell. — Seth Godin",
    "Content is king, but context is God. — Gary Vaynerchuk",
    "An unsent message never caused a crisis. Think twice before pressing send.",
    "Simplicity is the ultimate sophistication. — Leonardo da Vinci",
    "Action is the foundational key to all success. — Pablo Picasso",
    "Good writing is essentially rewriting. — E.B. White",
    "Make your customer the hero of your stories. — Ann Handley",
    "Listen with the intent to understand, not the intent to reply. — Stephen Covey"
];
let quoteInterval = null;
function rotateQuote() {
    const banner = document.getElementById('quote-banner');
    if (!banner) return;
    const randomIndex = Math.floor(Math.random() * quotes.length);
    banner.textContent = '✨ “' + quotes[randomIndex] + '”';
}
function startQuoteRotation() {
    rotateQuote();
    if (quoteInterval) clearInterval(quoteInterval);
    quoteInterval = setInterval(rotateQuote, 60 * 60 * 1000);
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

// ---------- Timer engine ----------
let workDuration = 25 * 60;
let breakDuration = 5 * 60;
let timeLeft = workDuration;
let totalTime = workDuration;
let isRunning = false;
let isWorkTime = true;
let hasStartedOnce = false;
let timerInterval = null;
let timerMode = 'manual';
let flowSegments = [];
let flowSegIndex = 0;
let flowExtraSeconds = 0;
let flowBlocksCompleted = parseInt(localStorage.getItem('focus_daily_sessions')) || 0;
let breakTracker = { active: false, start: null, elapsedSeconds: 0, interval: null, isFlowBreak: false };

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

// ---------- Break Button ----------
function toggleBreak() {
    if (breakTracker.active) {
        resumeFromBreak();
    } else {
        clearInterval(timerInterval);
        isRunning = false;
        releaseWakeLock();
        startPauseBtn.textContent = 'Paused';
        breakTracker.active = true;
        breakTracker.start = Date.now();
        breakTracker.elapsedSeconds = 0;
        breakTracker.isFlowBreak = false;
        $('break-away-time').textContent = '00:00';
        $('break-overlay').style.display = 'flex';
        breakTracker.interval = setInterval(function() {
            breakTracker.elapsedSeconds = Math.floor((Date.now() - breakTracker.start) / 1000);
            $('break-away-time').textContent = formatMinSec(breakTracker.elapsedSeconds);
        }, 1000);
    }
}

function resumeFromBreak() {
    clearInterval(breakTracker.interval);
    $('break-overlay').style.display = 'none';
    const reason = $('break-reason-select').value;
    const durationMinutes = Math.max(1, Math.round(breakTracker.elapsedSeconds / 60));
    const breakLog = storageGet('ff-break-log', []);
    breakLog.unshift({
        date: new Date().toISOString(),
        durationMinutes: durationMinutes,
        reason: reason,
        type: breakTracker.isFlowBreak ? 'Flow Break' : 'Break'
    });
    if (breakLog.length > 100) breakLog.pop();
    storageSet('ff-break-log', breakLog);
    breakTracker.active = false;
    if (!isRunning) {
        hasStartedOnce = true;
        startPauseBtn.textContent = 'Pause';
        isRunning = true;
        requestWakeLock();
        timerInterval = setInterval(runTick, 1000);
    }
    updateDisplay();
    renderDailyRecap();
}

function initiateFlowBreakOverlay() {
    clearInterval(timerInterval);
    isRunning = false;
    releaseWakeLock();
    startPauseBtn.textContent = 'Paused';
    breakTracker.active = true;
    breakTracker.start = Date.now();
    breakTracker.elapsedSeconds = 0;
    breakTracker.isFlowBreak = true;
    $('flow-break-away-time').textContent = '00:00';
    $('flow-break-overlay').style.display = 'flex';
    breakTracker.interval = setInterval(function() {
        breakTracker.elapsedSeconds = Math.floor((Date.now() - breakTracker.start) / 1000);
        $('flow-break-away-time').textContent = formatMinSec(breakTracker.elapsedSeconds);
    }, 1000);
}

function resumeFromFlowBreak() {
    clearInterval(breakTracker.interval);
    $('flow-break-overlay').style.display = 'none';
    const reason = $('flow-break-reason-select').value;
    const durationMinutes = Math.max(1, Math.round(breakTracker.elapsedSeconds / 60));
    const seg = currentFlowSegment();
    if (seg && seg.type === 'work') {
        const task = seg.entry.task;
        task.breaks.push({
            reason: reason,
            durationMinutes: durationMinutes,
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

// ---------- Timer core ----------
function toggleTimer() {
    if (isRunning) {
        if (timerMode === 'flow' && currentFlowSegment() && currentFlowSegment().type === 'work') {
            initiateFlowBreakOverlay();
        } else {
            clearInterval(timerInterval);
            isRunning = false;
            releaseWakeLock();
            startPauseBtn.textContent = 'Resume';
            updateDisplay();
        }
    } else {
        hasStartedOnce = true;
        startPauseBtn.textContent = 'Pause';
        isRunning = true;
        requestWakeLock();
        timerInterval = setInterval(runTick, 1000);
        if (timerMode === 'flow' && currentFlowSegment() && currentFlowSegment().type === 'work') {
            let task = currentFlowSegment().entry.task;
            if (!task.startedAtIso) {
                task.startedAtIso = new Date().toISOString();
                saveBoardData();
            }
        }
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

// ---------- Auto Flow ----------
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
    return { chunks: chunks, bonusBreakMinutes: bonusBreakMinutes };
}

function getPrioritizedOpenTasks() {
    let openEntries = [];
    boardData.forEach(function(col, ci) {
        col.tasks.forEach(function(task, ti) {
            if (!task.completed) {
                openEntries.push({ col: col, task: task, ci: ci, ti: ti, actualSecondsSoFar: task.trackedSeconds || 0 });
            }
        });
    });

    openEntries.sort(function(a, b) {
        var idxA = customQueueOrder.indexOf(a.task.id);
        var idxB = customQueueOrder.indexOf(b.task.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;

        if (a.task.deadlineTime && !b.task.deadlineTime) return -1;
        if (!a.task.deadlineTime && b.task.deadlineTime) return 1;
        if (a.task.deadlineTime && b.task.deadlineTime) {
            return new Date(a.task.deadlineTime) - new Date(b.task.deadlineTime);
        }
        if (a.ci !== b.ci) return a.ci - b.ci;
        return a.ti - b.ti;
    });
    return openEntries;
}

var queueDragTaskId = null;
function queueDragStart(e, taskId) {
    queueDragTaskId = taskId;
    e.dataTransfer.effectAllowed = "move";
    setTimeout(function() { e.target.classList.add('dragging'); }, 0);
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
    document.querySelectorAll('.dragging').forEach(function(el) { el.classList.remove('dragging'); });

    if (!queueDragTaskId || queueDragTaskId === targetTaskId) return;

    var tasks = getPrioritizedOpenTasks();
    var currentOrder = tasks.map(function(t) { return t.task.id; });

    var fromIdx = currentOrder.indexOf(queueDragTaskId);
    var toIdx = currentOrder.indexOf(targetTaskId);

    if (fromIdx === -1 || toIdx === -1) return;

    currentOrder.splice(fromIdx, 1);
    currentOrder.splice(toIdx, 0, queueDragTaskId);

    customQueueOrder = currentOrder;
    storageSet('ff-custom-queue', customQueueOrder);

    renderInternalQueue();
}

function renderInternalQueue() {
    var q = $('internal-flow-queue');
    if (!q) return;
    var tasks = getPrioritizedOpenTasks();
    if (tasks.length === 0) {
        q.innerHTML = '<li style="color:#888;">No open tasks. Add some below.</li>';
        return;
    }
    q.innerHTML = tasks.map(function(entry, idx) {
        return '<li draggable="true" ' +
            'ondragstart="queueDragStart(event, \'' + entry.task.id + '\')" ' +
            'ondragover="queueDragOver(event)" ' +
            'ondragleave="queueDragLeave(event)" ' +
            'ondrop="queueDrop(event, \'' + entry.task.id + '\')">' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="color:var(--cherry-red);font-size:1.1rem;cursor:grab;padding-right:4px;" title="Drag to reorder sequence">≡</span>' +
            '<span style="color:#888;font-size:0.7rem;">' + (idx+1) + '.</span> ' +
            escapeHTML(entry.task.text) +
            '</div>' +
            getDeadlineBadge(entry.task) +
            '</li>';
    }).join('');
}

function buildFlowSegments() {
    var segments = [];
    var openEntries = getPrioritizedOpenTasks();
    var standardBreak = parseInt(breakInput.value) || 5;

    openEntries.forEach(function(entry, entryIdx) {
        var chunkData = buildChunks(Math.max(1, entry.task.estimateMinutes || 15));
        var chunks = chunkData.chunks;
        var bonusBreakMinutes = chunkData.bonusBreakMinutes;
        chunks.forEach(function(chunkMin, i) {
            var isLastChunk = (i === chunks.length - 1);
            segments.push({ type: 'work', entry: entry, minutes: chunkMin, isLastChunk: isLastChunk });
            var isVeryLastSegment = (entryIdx === openEntries.length - 1) && isLastChunk;
            if (!isVeryLastSegment) {
                var breakMin = isLastChunk ? standardBreak + bonusBreakMinutes : standardBreak;
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
    var seg = currentFlowSegment();
    if (!seg) { finishFlow(); return; }
    flowExtraSeconds = 0;
    totalTime = timeLeft = seg.minutes * 60;

    if (seg.type === 'work') {
        modeIndicator.textContent = 'Flow: ' + seg.entry.task.text;
        progressBar.style.backgroundColor = 'var(--cherry-red)';
        if (!seg.entry.task.startedAtIso) seg.entry.task.startedAtIso = new Date().toISOString();
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
    var seg = currentFlowSegment();
    if (seg && seg.type === 'work') {
        seg.entry.actualSecondsSoFar += seg.minutes * 60 + flowExtraSeconds;
        recordFlowBlockCompleted();
        if (seg.isLastChunk) {
            completeFlowTask(seg.entry, seg.entry.actualSecondsSoFar);
        } else {
            seg.entry.task.trackedSeconds = seg.entry.actualSecondsSoFar;
            saveBoardData();
        }
    }
    flowSegIndex++;
    beginFlowSegment();
}

function completeFlowTask(entry, actualSeconds) {
    var task = entry.task;
    task.completed = true;
    task.isTracking = false;
    task.trackedSeconds = actualSeconds;
    task.completedAt = Date.now();
    task.completedAtIso = new Date().toISOString();

    if (task.startedAtIso) {
        task.timeSegments.push({ start: task.startedAtIso, end: task.completedAtIso });
    }

    var historyId = 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    task._historyId = historyId;

    var totalBreaks = task.breaks.reduce(function(acc, b) { return acc + (b.durationMinutes || 0); }, 0);
    var breaksStr = task.breaks.length ? '[Breaks: ' + task.breaks.map(function(b) { return b.reason; }).join(', ') + '] ' : '';

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

function skipCurrentSegment() {
    if (timerMode === 'flow') {
        var seg = currentFlowSegment();
        if (!seg) return;
        if (seg.type === 'work') {
            var elapsed = (seg.minutes * 60 - timeLeft) + flowExtraSeconds;
            seg.entry.actualSecondsSoFar += elapsed;
            if (seg.isLastChunk) {
                completeFlowTask(seg.entry, seg.entry.actualSecondsSoFar);
            } else {
                seg.entry.task.trackedSeconds = seg.entry.actualSecondsSoFar;
                saveBoardData();
            }
        }
        flowSegIndex++;
        beginFlowSegment();
        return;
    }

    if (isWorkTime) {
        recordFlowBlockCompleted();
        playSound();
        isWorkTime = false;
        setupMode();
    } else {
        playSound();
        isWorkTime = true;
        setupMode();
    }
}

// ---------- Stop / End Session ----------
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
        var seg = currentFlowSegment();
        if (seg && seg.type === 'work') {
            var elapsed = (seg.minutes * 60 - timeLeft) + flowExtraSeconds;
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

// ---------- Clock In / Out (with Attendance System) ----------
var clockState = storageGet('ff-clock-state', { 
    clockedIn: false, 
    startedAt: null,
    scheduledIn: '09:00',
    scheduledOut: '17:00',
    attendanceLog: []
});

var clockLog = storageGet('ff-clock-log', []);

function toggleClock() {
    var btn = $('clock-btn');
    var now = new Date();
    var timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    var dateString = now.toLocaleDateString();

    if (clockState.clockedIn) {
        var durationMs = Date.now() - clockState.startedAt;
        var durationMinutes = Math.max(1, Math.round(durationMs / 60000));
        var hours = Math.floor(durationMinutes / 60);
        var mins = durationMinutes % 60;

        var scheduledIn = clockState.scheduledIn || '09:00';
        var scheduledOut = clockState.scheduledOut || '17:00';

        var nowMinutes = now.getHours() * 60 + now.getMinutes();
        var scheduledOutMinutes = parseInt(scheduledOut.split(':')[0]) * 60 + parseInt(scheduledOut.split(':')[1]);

        var isLate = nowMinutes > scheduledOutMinutes + 5;
        var isEarly = nowMinutes < scheduledOutMinutes - 5;

        var logEntry = {
            date: dateString,
            dateKey: getTodayKey(),
            clockIn: new Date(clockState.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            clockOut: timeString,
            durationMinutes: durationMinutes,
            scheduledIn: scheduledIn,
            scheduledOut: scheduledOut,
            status: isLate ? 'Late' : isEarly ? 'Early' : 'On Time',
            isLate: isLate,
            isEarly: isEarly
        };

        clockLog.unshift(logEntry);
        if (clockLog.length > 100) clockLog.pop();
        storageSet('ff-clock-log', clockLog);

        if (!clockState.attendanceLog) clockState.attendanceLog = [];
        clockState.attendanceLog.unshift(logEntry);
        if (clockState.attendanceLog.length > 365) clockState.attendanceLog.pop();

        clockState = { 
            clockedIn: false, 
            startedAt: null,
            scheduledIn: clockState.scheduledIn || '09:00',
            scheduledOut: clockState.scheduledOut || '17:00',
            attendanceLog: clockState.attendanceLog || []
        };
        storageSet('ff-clock-state', clockState);

        btn.textContent = 'Clock In';
        btn.classList.remove('active', 'clocking-out');

        updateAttendanceDisplay();
        renderDailyRecap();

        var statusMsg = isLate ? '⚠️ Clocked out LATE' : isEarly ? '✅ Clocked out EARLY' : '✅ Clocked out ON TIME';
        var durationMsg = hours + 'h ' + mins + 'm worked today.';
        var summaryBox = $('summary-content');
        if (summaryBox) {
            summaryBox.textContent = '⏰ ' + statusMsg + ' — ' + durationMsg;
        }

        if (confirm('Clocked Out at ' + timeString + '. ' + durationMsg + '\n\nGenerate a Daily Check-Out Brief?')) {
            generateDailyCheckOut();
        }

        sendNotification('Clocked Out', 'Worked ' + hours + 'h ' + mins + 'm. ' + statusMsg);

    } else {
        clockState = { 
            clockedIn: true, 
            startedAt: Date.now(),
            scheduledIn: clockState.scheduledIn || '09:00',
            scheduledOut: clockState.scheduledOut || '17:00',
            attendanceLog: clockState.attendanceLog || []
        };
        storageSet('ff-clock-state', clockState);

        btn.textContent = 'Clock Out';
        btn.classList.add('active');

        var scheduledIn2 = clockState.scheduledIn || '09:00';
        var scheduledInMinutes2 = parseInt(scheduledIn2.split(':')[0]) * 60 + parseInt(scheduledIn2.split(':')[1]);
        var nowMinutes2 = now.getHours() * 60 + now.getMinutes();
        var isLate2 = nowMinutes2 > scheduledInMinutes2 + 5;

        if (isLate2) {
            btn.classList.add('clocking-out');
            var lateMins = nowMinutes2 - scheduledInMinutes2;
            var summaryBox2 = $('summary-content');
            if (summaryBox2) {
                summaryBox2.textContent = '⏰ Clocked in ' + lateMins + ' minutes LATE at ' + timeString + '.';
            }
        } else {
            var summaryBox3 = $('summary-content');
            if (summaryBox3) {
                summaryBox3.textContent = '✅ Clocked in ON TIME at ' + timeString + '.';
            }
        }

        updateAttendanceDisplay();
        renderDailyRecap();
        sendNotification('Clocked In', 'Started work at ' + timeString);
    }

    updateAttendanceDisplay();
}

function saveAttendanceSettings() {
    var scheduledIn = document.getElementById('scheduled-in') ? document.getElementById('scheduled-in').value : '09:00';
    var scheduledOut = document.getElementById('scheduled-out') ? document.getElementById('scheduled-out').value : '17:00';

    clockState.scheduledIn = scheduledIn;
    clockState.scheduledOut = scheduledOut;
    storageSet('ff-clock-state', clockState);
    updateAttendanceDisplay();
}

function updateAttendanceDisplay() {
    var statusEl = document.getElementById('attendance-status');
    var actualInEl = document.getElementById('actual-in-display');
    var actualOutEl = document.getElementById('actual-out-display');
    var todayHoursEl = document.getElementById('today-hours');
    var summaryEl = document.getElementById('attendance-summary');

    if (!statusEl) return;

    var now = new Date();
    var todayKey = getTodayKey();
    var todayDateStr = now.toLocaleDateString();

    var todayLog = clockLog.filter(function(l) { return l.dateKey === todayKey || l.date === todayDateStr; });
    var todayEntry = todayLog.length > 0 ? todayLog[0] : null;

    if (clockState.clockedIn) {
        statusEl.textContent = 'On Duty';
        statusEl.className = 'attendance-status on-duty';

        if (actualInEl) {
            var clockInTime = todayEntry ? todayEntry.clockIn : new Date(clockState.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            actualInEl.textContent = clockInTime || '--:--';
        }
        if (actualOutEl) actualOutEl.textContent = 'In progress';

        var diffMs = Date.now() - clockState.startedAt;
        var minutes = Math.round(diffMs / 60000);
        var hours = Math.floor(minutes / 60);
        var mins = minutes % 60;
        if (todayHoursEl) todayHoursEl.textContent = hours + 'h ' + mins + 'm (in progress)';

        if (summaryEl) {
            var scheduledOut = clockState.scheduledOut || '17:00';
            var scheduledOutMinutes = parseInt(scheduledOut.split(':')[0]) * 60 + parseInt(scheduledOut.split(':')[1]);
            var nowMinutes = now.getHours() * 60 + now.getMinutes();
            var remainingMinutes = scheduledOutMinutes - nowMinutes;
            if (remainingMinutes > 0) {
                var remHours = Math.floor(remainingMinutes / 60);
                var remMins = remainingMinutes % 60;
                summaryEl.textContent = 'Clock out in ' + remHours + 'h ' + remMins + 'm';
                summaryEl.className = 'attendance-time-display';
            } else if (remainingMinutes === 0) {
                summaryEl.textContent = '⏰ Time to clock out!';
                summaryEl.className = 'attendance-time-display late-text';
            } else {
                var overdue = Math.abs(remainingMinutes);
                var overHours = Math.floor(overdue / 60);
                var overMins = overdue % 60;
                summaryEl.textContent = '⚠️ Overdue by ' + overHours + 'h ' + overMins + 'm';
                summaryEl.className = 'attendance-time-display late-text';
            }
        }

    } else if (todayEntry && todayEntry.clockOut) {
        statusEl.textContent = 'Clocked Out';
        statusEl.className = 'attendance-status off-duty';

        if (actualInEl) actualInEl.textContent = todayEntry.clockIn || '--:--';
        if (actualOutEl) actualOutEl.textContent = todayEntry.clockOut || '--:--';

        if (todayEntry.durationMinutes) {
            var hours = Math.floor(todayEntry.durationMinutes / 60);
            var mins = todayEntry.durationMinutes % 60;
            if (todayHoursEl) todayHoursEl.textContent = hours + 'h ' + mins + 'm';
        } else {
            if (todayHoursEl) todayHoursEl.textContent = '0h 0m';
        }

        if (summaryEl) {
            var scheduledOut2 = todayEntry.scheduledOut || '17:00';
            var scheduledOutMinutes2 = parseInt(scheduledOut2.split(':')[0]) * 60 + parseInt(scheduledOut2.split(':')[1]);
            var actualOutMinutes = parseInt(todayEntry.clockOut.split(':')[0]) * 60 + parseInt(todayEntry.clockOut.split(':')[1]);
            var diff = actualOutMinutes - scheduledOutMinutes2;

            if (todayEntry.isLate) {
                summaryEl.textContent = '⚠️ ' + Math.abs(diff) + ' min late';
                summaryEl.className = 'attendance-time-display late-text';
            } else if (todayEntry.isEarly) {
                summaryEl.textContent = '✅ ' + Math.abs(diff) + ' min early';
                summaryEl.className = 'attendance-time-display early-text';
            } else {
                summaryEl.textContent = '✅ On time';
                summaryEl.className = 'attendance-time-display';
            }
        }

    } else if (todayEntry && todayEntry.clockIn) {
        statusEl.textContent = 'Clocked In';
        statusEl.className = 'attendance-status on-duty';
        if (actualInEl) actualInEl.textContent = todayEntry.clockIn || '--:--';
        if (actualOutEl) actualOutEl.textContent = '--:--';
        if (todayHoursEl) todayHoursEl.textContent = '0h 0m';
        if (summaryEl) summaryEl.textContent = 'Not clocked out';
    } else {
        statusEl.textContent = 'Off Duty';
        statusEl.className = 'attendance-status off-duty';
        if (actualInEl) actualInEl.textContent = '--:--';
        if (actualOutEl) actualOutEl.textContent = '--:--';
        if (todayHoursEl) todayHoursEl.textContent = '0h 0m';
        if (summaryEl) summaryEl.textContent = 'Not clocked in today';
    }

    var btn = document.getElementById('clock-btn');
    if (btn) {
        if (clockState.clockedIn) {
            btn.textContent = 'Clock Out';
            btn.classList.add('active');
            btn.classList.remove('clocking-out');
        } else {
            btn.textContent = 'Clock In';
            btn.classList.remove('active', 'clocking-out');
        }
    }
}

function renderClockCard() {
    var btn = document.getElementById('clock-btn');
    if (!btn) return;
    if (clockState.clockedIn) {
        btn.textContent = 'Clock Out';
        btn.classList.add('active');
        btn.classList.remove('clocking-out');
    } else {
        btn.textContent = 'Clock In';
        btn.classList.remove('active', 'clocking-out');
    }
    renderDailyRecap();
}

// ---------- Task board ----------
var defaultColumns = [
    { id: 1, title: 'Client A / Priority 1', tasks: [], notesRequired: false },
    { id: 2, title: 'Client B / Priority 2', tasks: [], notesRequired: false },
    { id: 3, title: 'Admin & Content', tasks: [], notesRequired: false }
];

var boardData = storageGet('focus_board_data', defaultColumns);
var historyData = storageGet('focus_history_data', []);
var taskTimeMemory = storageGet('ff-task-time-memory', {});

function getTodayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function getYesterdayKey() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dateKeyFromISO(isoString) {
    var d = new Date(isoString);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function formatDateKey(dateKey) {
    if (dateKey === getTodayKey()) return 'Today';
    if (dateKey === getYesterdayKey()) return 'Yesterday';
    var d = new Date(dateKey + 'T00:00:00');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatHoursMinutes(totalMinutes) {
    if (totalMinutes < 60) return totalMinutes + 'm';
    var hours = Math.floor(totalMinutes / 60);
    var mins = totalMinutes % 60;
    return hours + 'h ' + mins + 'm';
}

function adjustTasksForMidnight() {
    var today = getTodayKey();
    var changed = false;
    boardData.forEach(function(col) {
        col.tasks.forEach(function(task) {
            if (!task.completed && task.dateAdded !== today) {
                task.dateAdded = today;
                task.carriedOver = true;
                task.originalDate = task.originalDate || task.dateAdded;
                changed = true;
            }
        });
    });
    if (changed) {
        saveBoardData();
        renderBoard();
    }
}

// Migration
boardData.forEach(function(col) {
    if (col.collapsed === undefined) col.collapsed = false;
    if (col.notesRequired === undefined) col.notesRequired = false;
    col.tasks.forEach(function(t) {
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
        if (t.parentId === undefined) t.parentId = null;
        if (t.subtasks === undefined) t.subtasks = [];
        if (t.isSubtask === undefined) t.isSubtask = false;
        if (t.hasSubtasks === undefined) t.hasSubtasks = false;
        if (t.collapsed === undefined) t.collapsed = false;
        if (t.recurrence === undefined) t.recurrence = null;
        if (t.lastRecurrenceDate === undefined) t.lastRecurrenceDate = null;
        
        if (t.collapsedControls === undefined) t.collapsedControls = true; 
        
        if (t.carriedOver === undefined) t.carriedOver = false;
        if (t.originalDate === undefined) t.originalDate = null;
    });
});
saveBoardData();

function saveBoardData() {
    storageSet('focus_board_data', boardData);
    storageSet('focus_history_data', historyData);
}

function urgencyClassFor(task) {
    if (!task.estimateMinutes || task.trackedSeconds === 0) return '';
    var ratio = (task.trackedSeconds / 60) / task.estimateMinutes;
    if (ratio < 0.8) return 'time-ok';
    if (ratio <= 1.0) return 'time-warn';
    return 'time-over';
}

function getDeadlineBadge(task) {
    if (!task.deadlineTime) return '';
    var ms = new Date(task.deadlineTime).getTime() - Date.now();
    var hrs = ms / 3600000;
    if (hrs < 0) return '<span class="deadline-badge red">Overdue</span>';
    if (hrs <= 1) return '<span class="deadline-badge red">< 1h</span>';
    if (hrs <= 3) return '<span class="deadline-badge amber">< 3h</span>';
    return '';
}

function formatMinSec(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return m + ':' + s.toString().padStart(2, '0');
}

var _toggledDateGroups = {};
function groupTasksByDate(tasks, colIndex) {
    var groups = {};
    tasks.forEach(function(task, originalIndex) {
        var key = task.dateAdded || getTodayKey();
        if (!groups[key]) groups[key] = { incomplete: [], completed: [] };
        if (task.completed) groups[key].completed.push({ task: task, originalIndex: originalIndex });
        else groups[key].incomplete.push({ task: task, originalIndex: originalIndex });
    });
    Object.values(groups).forEach(function(g) {
        g.completed.sort(function(a, b) { return (a.task.completedAt || 0) - (b.task.completedAt || 0); });
    });

    var today = getTodayKey();
    var yesterday = getYesterdayKey();

    return Object.keys(groups).sort(function(a, b) { return b.localeCompare(a); }).map(function(key) {
        var groupKey = colIndex + '-' + key;
        var isCollapsed = (key !== today && key !== yesterday);
        if (_toggledDateGroups[groupKey] !== undefined) isCollapsed = _toggledDateGroups[groupKey];
        return {
            dateKey: key,
            dateLabel: formatDateKey(key),
            isCollapsed: isCollapsed,
            items: groups[key].incomplete.concat(groups[key].completed)
        };
    });
}

function toggleDateGroup(colIndex, key) {
    var groupKey = colIndex + '-' + key;
    var today = getTodayKey();
    var yesterday = getYesterdayKey();
    var isCurrentlyCollapsed = (key !== today && key !== yesterday);
    if (_toggledDateGroups[groupKey] !== undefined) isCurrentlyCollapsed = _toggledDateGroups[groupKey];
    _toggledDateGroups[groupKey] = !isCurrentlyCollapsed;
    renderBoard();
}

function setupAutosuggest(inputElement) {
    if (!inputElement) return;
    var timeout;
    inputElement.addEventListener('input', function(e) {
        clearTimeout(timeout);
        var val = this.value.trim();
        if (val.length < 2) return;
        var allTaskNames = [];
        boardData.forEach(function(col) { col.tasks.forEach(function(t) { allTaskNames.push(t.text); }); });
        var matches = allTaskNames.filter(function(name) {
            return name.toLowerCase().startsWith(val.toLowerCase()) && name !== val;
        });
        if (matches.length > 0) {
            var datalist = document.getElementById('autosuggest-datalist');
            if (!datalist) {
                datalist = document.createElement('datalist');
                datalist.id = 'autosuggest-datalist';
                document.body.appendChild(datalist);
            }
            datalist.innerHTML = matches.map(function(m) { return '<option value="' + escapeHTML(m) + '">'; }).join('');
            inputElement.setAttribute('list', 'autosuggest-datalist');
        } else {
            inputElement.removeAttribute('list');
        }
    });
}

async function naturalLanguageAddTask(ci) {
    var input = document.getElementById('nl-task-input-' + ci);
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    var apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) {
        alert('Please add your Gemini API key for natural language parsing.');
        return;
    }

    var prompt = 'Parse this task into components: task name, time estimate (in minutes), deadline (if any). Return ONLY JSON: {"task":"name","minutes":number,"deadline":"YYYY-MM-DDTHH:mm" or null}. Input: "' + text + '"';

    try {
        var responseText = await callGemini(prompt);
        var cleaned = responseText.replace(/```json|```/g, '').trim();
        var parsed = JSON.parse(cleaned);

        var col = boardData[ci];
        var newTask = {
            id: 't_' + Math.random().toString(36).substr(2,9),
            text: parsed.task || text,
            estimateMinutes: parsed.minutes || 15,
            trackedSeconds: 0,
            isTracking: false,
            notes: '',
            completed: false,
            completedAt: null,
            dateAdded: getTodayKey(),
            breaks: [],
            timeSegments: [],
            deadlineTime: parsed.deadline || null,
            googleLink: '',
            startedAtIso: null,
            completedAtIso: null,
            parentId: null,
            subtasks: [],
            isSubtask: false,
            hasSubtasks: false,
            collapsed: false,
            collapsedControls: true,
            recurrence: null,
            lastRecurrenceDate: null,
            carriedOver: false,
            originalDate: null
        };
        col.tasks.push(newTask);
        input.value = '';
        saveBoardData();
        renderBoard();
        if (newTask.estimateMinutes <= 15) {
            estimateTask(newTask);
        }
    } catch(e) {
        alert('Could not parse natural language. Please try again.');
        console.error(e);
    }
}

function setupRecurringTasks() {
    var today = getTodayKey();
    boardData.forEach(function(col) {
        col.tasks.forEach(function(task) {
            if (!task.recurrence || task.completed) return;

            var shouldCreateNew = shouldRecurToday(task);
            if (shouldCreateNew) {
                var newTask = JSON.parse(JSON.stringify(task));
                newTask.id = 't_' + Math.random().toString(36).substr(2,9);
                newTask.completed = false;
                newTask.completedAt = null;
                newTask.completedAtIso = null;
                newTask.dateAdded = today;
                newTask.trackedSeconds = 0;
                newTask.isTracking = false;
                newTask.breaks = [];
                newTask.timeSegments = [];
                newTask.startedAtIso = null;
                newTask._historyId = null;
                newTask.lastRecurrenceDate = today;
                delete newTask._historyId;
                col.tasks.push(newTask);
                task.lastRecurrenceDate = today;
            }
        });
    });
    saveBoardData();
    renderBoard();
}

function shouldRecurToday(task) {
    if (!task.recurrence) return false;
    var today = getTodayKey();
    if (task.lastRecurrenceDate === today) return false;

    var now = new Date();
    var lastDate = task.lastRecurrenceDate ? new Date(task.lastRecurrenceDate) : null;
    var taskDate = task.dateAdded ? new Date(task.dateAdded) : null;

    switch(task.recurrence) {
        case 'daily':
            var diffDays = lastDate ? Math.floor((now - lastDate) / 86400000) : 1;
            return diffDays >= 1;
        case 'weekly':
            var diffWeeks = lastDate ? Math.floor((now - lastDate) / 604800000) : 1;
            return diffWeeks >= 1 && now.getDay() === (taskDate ? taskDate.getDay() : 1);
        case 'monthly':
            var diffMonths = lastDate ? (now.getMonth() - lastDate.getMonth()) + (now.getFullYear() - lastDate.getFullYear()) * 12 : 1;
            return diffMonths >= 1 && now.getDate() === (taskDate ? taskDate.getDate() : 1);
        default:
            return false;
    }
}

function startVoiceInput(ci) {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('Voice input is not supported in this browser.');
        return;
    }

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    var recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = function() {
        var btn = document.getElementById('voice-btn-' + ci);
        if (btn) btn.textContent = '🎙️...';
    };

    recognition.onerror = function(event) {
        var btn = document.getElementById('voice-btn-' + ci);
        if (btn) btn.textContent = '🎙️';
        alert('Voice input error: ' + event.error);
    };

    recognition.onresult = function(event) {
        var transcript = event.results[0][0].transcript;
        var input = document.getElementById('task-input-' + ci);
        if (input) {
            input.value = transcript;
            naturalLanguageAddTask(ci);
        }
        var btn = document.getElementById('voice-btn-' + ci);
        if (btn) btn.textContent = '🎙️';
    };

    recognition.start();
}

function generatePDFReport() {
    var summaryBox = $('summary-content');
    summaryBox.textContent = 'Generating PDF report...';

    var printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
        alert('Please allow pop-ups to generate PDF reports.');
        return;
    }

    var today = new Date().toLocaleDateString();
    var html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Focus & Flow Report - ${today}</title>
            <style>
                body { font-family: Georgia, serif; padding: 40px; max-width: 1000px; margin: 0 auto; }
                h1 { color: #ff3366; border-bottom: 2px solid #ff3366; padding-bottom: 10px; }
                h2 { color: #ff3366; margin-top: 25px; }
                .client-section { margin-bottom: 30px; }
                .task-item { padding: 8px 0; border-bottom: 1px solid #eee; }
                .task-done { text-decoration: line-through; color: #999; }
                .task-meta { font-size: 0.85rem; color: #666; margin-left: 10px; }
                .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
                .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
                .stat { text-align: center; }
                .stat-number { font-size: 2rem; font-weight: bold; color: #ff3366; }
                .stat-label { font-size: 0.85rem; color: #666; }
            </style>
        </head>
        <body>
            <h1>Focus & Flow Report</h1>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <div class="summary">
                <div class="summary-grid">
                    <div class="stat"><div class="stat-number">${historyData.length}</div><div class="stat-label">Total Tasks</div></div>
                    <div class="stat"><div class="stat-number">${getTodayCompleted()}</div><div class="stat-label">Completed Today</div></div>
                    <div class="stat"><div class="stat-number">${flowBlocksCompleted}</div><div class="stat-label">Flow Sessions</div></div>
                </div>
            </div>
    `;

    boardData.forEach(function(col) {
        var openTasks = col.tasks.filter(function(t) { return !t.completed && !t.parentId; });
        var doneTasks = col.tasks.filter(function(t) { return t.completed && !t.parentId; });
        if (openTasks.length === 0 && doneTasks.length === 0) return;
        html += '<div class="client-section"><h2>' + escapeHTML(col.title) + '</h2>';
        if (openTasks.length > 0) {
            html += '<h3>Open Tasks</h3>';
            openTasks.forEach(function(t) {
                html += '<div class="task-item">' + escapeHTML(t.text) + ' <span class="task-meta">' + t.estimateMinutes + 'm est</span></div>';
                var subtasks = col.tasks.filter(function(st) { return st.parentId === t.id; });
                subtasks.forEach(function(st) {
                    html += '<div class="task-item" style="margin-left:24px;">↳ ' + escapeHTML(st.text) + ' <span class="task-meta">' + st.estimateMinutes + 'm est</span></div>';
                });
            });
        }
        if (doneTasks.length > 0) {
            html += '<h3>Completed</h3>';
            doneTasks.forEach(function(t) {
                html += '<div class="task-item task-done">' + escapeHTML(t.text) + ' <span class="task-meta">' + (t.trackedSeconds ? Math.round(t.trackedSeconds/60) : t.estimateMinutes) + 'm</span></div>';
            });
        }
        html += '</div>';
    });

    html += `
        </body>
        </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

function getTodayCompleted() {
    var today = getTodayKey();
    return historyData.filter(function(h) { return dateKeyFromISO(h.completedAt) === today; }).length;
}

// Preserve scroll positions
var scrollPositions = {};

function renderBoard() {
    document.querySelectorAll('.task-list').forEach(function(list, idx) {
        scrollPositions['list-' + idx] = list.scrollTop;
    });

    var container = $('board-container');
    if (!container) return;
    container.querySelectorAll('.task-column').forEach(function(el) { el.remove(); });

    var colCountLabel = $('column-count-label');
    if (colCountLabel) colCountLabel.textContent = boardData.length + '/8 columns';

    boardData.forEach(function(col, colIndex) {
        var columnEl = document.createElement('div');
        columnEl.className = 'task-column';
        columnEl.dataset.colIndex = colIndex;

        var suggestionsHtml = '';
        if (col.aiSuggestions) {
            suggestionsHtml = col.aiSuggestions.map(function(s, idx) {
                return '<div class="ai-suggestion-banner">' +
                    '<div><strong>AI Suggests:</strong> ' + escapeHTML(s.task) + ' (' + s.minutes + 'm)</div>' +
                    '<div><button onclick="acceptAISuggestion(' + colIndex + ', ' + idx + ')">Add</button> ' +
                    '<button onclick="dismissAISuggestion(' + colIndex + ', ' + idx + ')">Dismiss</button></div>' +
                    '</div>';
            }).join('');
        }

        columnEl.innerHTML = `
    <div class="column-header-row">
        <button class="icon-btn" onclick="toggleColumnCollapse(${colIndex})" title="${col.collapsed ? 'Expand' : 'Collapse'}">${col.collapsed ? '▸' : '▾'}</button>
        <input type="text" class="column-header-input" value="${escapeHTML(col.title)}" oninput="updateColumnTitle(${colIndex}, this.value)" placeholder="Project / Client Name">
        <div class="column-header-actions" style="display:flex;align-items:center;gap:4px;">
            <label style="font-size:0.65rem;display:flex;align-items:center;gap:2px;color:#888;">
                <input type="checkbox" ${col.notesRequired ? 'checked' : ''} onchange="toggleNotesRequired(${colIndex}, this.checked)" title="Require notes for each task in this column">
                Notes
            </label>
            <button class="icon-btn" onclick="moveColumn(${colIndex}, -1)">◀</button>
            <button class="icon-btn" onclick="moveColumn(${colIndex}, 1)">▶</button>
            <button class="delete-btn" onclick="deleteColumn(${colIndex})">×</button>
        </div>
    </div>

    <div class="column-body" style="${col.collapsed ? 'display:none;' : ''}">

    <ul class="task-list" ondragover="allowDrop(event)" ondrop="dropTask(event, ${colIndex})">
        ${groupTasksByDate(col.tasks, colIndex).map((group) => `
            <li class="date-group-header" onclick="toggleDateGroup(${colIndex}, '${group.dateKey}')">${group.dateLabel} ${group.isCollapsed ? '▸' : '▾'}</li>
            ${group.isCollapsed ? '' : group.items.map(({ task, originalIndex: taskIndex }) => {
                if (task.parentId) return '';

                const hasSubtasks = col.tasks.some(t => t.parentId === task.id);
                const isSubtaskCollapsed = task.collapsedControls || false;
                const isParentCollapsed = task.collapsed || false;

                let deadlineHtml = '';
                if (task.deadlineTime) {
                    deadlineHtml = `<span class="deadline-label" onclick="promptDeadline(${colIndex}, ${taskIndex})">📅 ${new Date(task.deadlineTime).toLocaleString()}</span>`;
                } else {
                    deadlineHtml = `<button class="deadline-trigger-btn" onclick="promptDeadline(${colIndex}, ${taskIndex})">+ Deadline</button>`;
                }

                let carriedOverBadge = '';
                if (task.carriedOver) {
                    carriedOverBadge = `<span class="carried-over-badge" title="Carried over from ${task.originalDate || 'previous day'}">⏳ Carried</span>`;
                }

                return `
                    <li class="task-item ${task.completed ? 'completed' : ''} ${urgencyClassFor(task)}" id="task-${colIndex}-${taskIndex}" draggable="${!task.completed}" ondragstart="dragStart(event, ${colIndex}, ${taskIndex})">
                        <div class="task-top-row">
                            <div class="task-checkbox-name">
                                <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="toggleTask(${colIndex}, ${taskIndex})">
                                <textarea class="task-name-input" rows="1" oninput="this.style.height='';this.style.height=this.scrollHeight+'px'" onchange="updateTaskText(${colIndex}, ${taskIndex}, this.value)">${escapeHTML(task.text)}</textarea>
                                ${hasSubtasks ? `<span class="subtask-badge" title="Has subtasks">📋</span>` : ''}
                                ${task.recurrence ? `<span class="recurrence-badge">🔄 ${task.recurrence}</span>` : ''}
                                ${carriedOverBadge}
                            </div>
                            <div class="task-top-actions">
                                <button class="collapse-toggle-btn" style="background:none;border:none;cursor:pointer;color:#888;font-size:0.6rem;" onclick="toggleTaskCollapse(${colIndex}, ${taskIndex})" title="${isSubtaskCollapsed ? 'Expand' : 'Collapse'} controls">
                                    ${isSubtaskCollapsed ? '▼' : '▲'}
                                </button>
                                <button class="delete-btn" onclick="deleteTask(${colIndex}, ${taskIndex})">×</button>
                            </div>
                        </div>

                        <div class="task-controls-row" style="${isSubtaskCollapsed ? 'display:none;' : ''}">
                            ${deadlineHtml}
                            ${getDeadlineBadge(task)}
                            <input type="number" class="task-estimate-input" value="${task.estimateMinutes}" min="1" max="480" title="Estimated minutes" onchange="updateTaskEstimate(${colIndex}, ${taskIndex}, parseInt(this.value))">m
                            ${!task.completed ? `
                            <button class="icon-btn" onclick="moveTask(${colIndex}, ${taskIndex}, -1)">▲</button>
                            <button class="icon-btn" onclick="moveTask(${colIndex}, ${taskIndex}, 1)">▼</button>
                            ` : ''}
                            <button class="details-trigger-btn" onclick="openDetailsModal(${colIndex}, ${taskIndex})">Details${task.notes ? ' •' : ''}</button>
                            ${hasSubtasks ? `
                                <button class="details-trigger-btn" onclick="toggleSubtasksCollapse(${colIndex}, ${taskIndex})">${isParentCollapsed ? '▶ Show' : '▼ Hide'} Subtasks</button>
                                <button class="details-trigger-btn" onclick="removeAllSubtasks(${colIndex}, ${taskIndex})" style="color:var(--cherry-red);">🗑️ Remove All</button>
                            ` : ''}
                            ${!task.recurrence ? `
                                <select class="recurrence-select" onchange="setRecurrence(${colIndex}, ${taskIndex}, this.value)">
                                    <option value="">No Repeat</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                </select>
                            ` : `
                                <button class="details-trigger-btn" onclick="removeRecurrence(${colIndex}, ${taskIndex})" style="font-size:0.6rem;">✕ Repeat</button>
                            `}
                        </div>

                        ${task.stagedEstimate ? `
                        <div class="ai-suggestion-banner" style="margin-top:4px;">
                            <span>AI suggests: <strong>${task.stagedEstimate} min</strong></span>
                            <div><button onclick="applyTaskEstimate(${colIndex}, ${taskIndex})">Apply</button> <button onclick="dismissTaskEstimate(${colIndex}, ${taskIndex})">x</button></div>
                        </div>` : ''}

                        ${hasSubtasks && !isParentCollapsed ? `
                            <ul class="subtask-list" style="list-style:none;padding:0;margin:0;margin-top:4px;border-left:2px solid var(--amber);padding-left:12px;">
                                ${col.tasks.filter(t => t.parentId === task.id).map((subtask) => {
                                    const subIdx = col.tasks.indexOf(subtask);
                                    const isSubtaskCollapsed2 = subtask.collapsedControls || false;
                                    return `
                                        <li class="task-item subtask ${subtask.completed ? 'completed' : ''} ${urgencyClassFor(subtask)}" 
                                            id="task-${colIndex}-${subIdx}" 
                                            draggable="${!subtask.completed}" 
                                            ondragstart="dragStart(event, ${colIndex}, ${subIdx})"
                                            style="margin-left:0; border-left-color: var(--amber);">
                                            <div class="task-top-row">
                                                <div class="task-checkbox-name">
                                                    <input type="checkbox" ${subtask.completed ? 'checked' : ''} onclick="toggleTask(${colIndex}, ${subIdx})">
                                                    <span class="subtask-indent">↳</span>
                                                    <textarea class="task-name-input subtask-name" rows="1" oninput="this.style.height='';this.style.height=this.scrollHeight+'px'" onchange="updateTaskText(${colIndex}, ${subIdx}, this.value)">${escapeHTML(subtask.text)}</textarea>
                                                </div>
                                                <div class="task-top-actions">
                                                    <button class="collapse-toggle-btn" style="background:none;border:none;cursor:pointer;color:#888;font-size:0.6rem;" onclick="toggleTaskCollapse(${colIndex}, ${subIdx})" title="${isSubtaskCollapsed2 ? 'Expand' : 'Collapse'} controls">
                                                        ${isSubtaskCollapsed2 ? '▼' : '▲'}
                                                    </button>
                                                    <button class="delete-btn" onclick="deleteTask(${colIndex}, ${subIdx})">×</button>
                                                </div>
                                            </div>
                                            <div class="task-controls-row" style="${isSubtaskCollapsed2 ? 'display:none;' : ''}">
                                                ${subtask.deadlineTime ? `<span class="deadline-label" onclick="promptDeadline(${colIndex}, ${subIdx})">📅 ${new Date(subtask.deadlineTime).toLocaleString()}</span>` : `<button class="deadline-trigger-btn" onclick="promptDeadline(${colIndex}, ${subIdx})">+ Deadline</button>`}
                                                ${getDeadlineBadge(subtask)}
                                                <input type="number" class="task-estimate-input" value="${subtask.estimateMinutes}" min="1" max="480" title="Estimated minutes" onchange="updateTaskEstimate(${colIndex}, ${subIdx}, parseInt(this.value))">m
                                                ${!subtask.completed ? `
                                                <button class="icon-btn" onclick="moveTask(${colIndex}, ${subIdx}, -1)">▲</button>
                                                <button class="icon-btn" onclick="moveTask(${colIndex}, ${subIdx}, 1)">▼</button>
                                                ` : ''}
                                                <button class="details-trigger-btn" onclick="openDetailsModal(${colIndex}, ${subIdx})">Details${subtask.notes ? ' •' : ''}</button>
                                            </div>
                                        </li>
                                    `;
                                }).join('')}
                            </ul>
                        ` : ''}
                    </li>
                `;
            }).join('')}
        `).join('')}
    </ul>

    <div class="ai-batch-actions">
        <button onclick="suggestColumnTimesAI(${colIndex})">Suggest Times (AI)</button>
        <button onclick="optimizeColumnFlowAI(${colIndex})">Optimize Flow (AI)</button>
        <button onclick="generateColumnCheckIn(${colIndex})">Daily Check-In (AI)</button>
        <button onclick="generatePDFReport()">📄 PDF Report</button>
    </div>

    ${suggestionsHtml}

    <div class="task-input-group" style="display: flex; flex-direction: column; gap: 6px;">
        <input type="text" class="task-input" id="task-input-${colIndex}" placeholder="Add task..." onkeypress="handleKeyPress(event, ${colIndex})">
        <div style="display: flex; gap: 6px; align-items: center;">
            <div style="display: flex; align-items: center; gap: 2px; font-size: 0.75rem; color: #888; font-weight: 600;">
                <input type="number" class="task-estimate-new" id="task-est-${colIndex}" value="15" min="1" max="480">m
            </div>
            <button class="add-task-btn" onclick="addTask(${colIndex})" style="flex: 1;">Add</button>
            <button class="btn-secondary" onclick="startVoiceInput(${colIndex})" id="voice-btn-${colIndex}" title="Voice input">🎙️</button>
        </div>
    </div>

    <details style="margin-bottom:0.6rem; border:1px solid var(--border-color); border-radius:8px; padding:6px; background:var(--card-bg);">
        <summary style="font-size:0.75rem; font-weight:600; color:#888; cursor:pointer; outline:none; user-select:none;">
            ⚙️ Advanced Add (Bulk Paste & AI)
        </summary>
        <div style="margin-top:8px;">
            <div class="nl-task-input-group" style="display:flex;gap:6px;margin-bottom:8px;">
                <input type="text" class="task-input" id="nl-task-input-${colIndex}" placeholder="Natural language (e.g. 'Read 20 mins')..." onkeypress="if(event.key==='Enter') naturalLanguageAddTask(${colIndex})">
                <button class="btn-secondary" onclick="naturalLanguageAddTask(${colIndex})" style="padding:0; min-width:60px; font-size:0.7rem;">✨ Smart</button>
            </div>
            <textarea class="task-input paste-textarea" id="paste-box-${colIndex}" rows="2" placeholder="Paste bulk tasks here (separated by line)..."></textarea>
            <button class="add-task-btn" style="width:100%;margin-bottom:0.2rem;" onclick="addPastedTasks(${colIndex})">Add Pasted Tasks</button>
        </div>
    </details>

    </div>
`;
        container.appendChild(columnEl);
        var input = document.getElementById('task-input-' + colIndex);
        if (input) setupAutosuggest(input);
    });
    
    updateAdaptiveHacks();
    renderTimeCounter();
    renderInternalQueue();
    updateStreaksAndBadges();
    updateDailyProgress();
    updateFocusScore();

    document.querySelectorAll('.task-list').forEach(function(list, idx) {
        var key = 'list-' + idx;
        if (scrollPositions[key] !== undefined) {
            list.scrollTop = scrollPositions[key];
        }
    });

    setTimeout(function() {
        document.querySelectorAll('.task-name-input').forEach(function(el) {
            el.style.height = '';
            el.style.height = el.scrollHeight + 'px';
        });
    }, 0);
}

function toggleTaskCollapse(ci, ti) {
    var task = boardData[ci].tasks[ti];
    task.collapsedControls = !task.collapsedControls;
    saveBoardData();
    renderBoard();
}

function moveColumn(ci, dir) {
    var target = ci + dir;
    if (target < 0 || target >= boardData.length) return;
    var temp = boardData[ci];
    boardData[ci] = boardData[target];
    boardData[target] = temp;
    saveBoardData();
    renderBoard();
}

function updateColumnTitle(ci, v) { boardData[ci].title = v; saveBoardData(); }

function toggleColumnCollapse(ci) {
    boardData[ci].collapsed = !boardData[ci].collapsed;
    saveBoardData();
    renderBoard();
}

function toggleSubtasksCollapse(ci, ti) {
    var task = boardData[ci].tasks[ti];
    task.collapsed = !task.collapsed;
    saveBoardData();
    renderBoard();
}

function addColumn() {
    if (boardData.length >= 8) { alert('Maximum of 8 columns.'); return; }
    boardData.push({ id: Date.now(), title: 'New Project', collapsed: false, tasks: [], notesRequired: false });
    saveBoardData();
    renderBoard();
}

function deleteColumn(ci) {
    if (boardData.length <= 1) { alert('Keep at least one column.'); return; }
    if (!confirm('Delete "' + boardData[ci].title + '"?')) return;
    boardData.splice(ci, 1);
    saveBoardData();
    renderBoard();
}

function toggleNotesRequired(colIndex, checked) {
    boardData[colIndex].notesRequired = checked;
    saveBoardData();
    renderBoard();
}

var dragContext = null;
function dragStart(e, ci, ti) {
    dragContext = { ci: ci, ti: ti };
    e.dataTransfer.effectAllowed = "move";
    setTimeout(function() { e.target.classList.add('dragging'); }, 0);
}
function allowDrop(e) { e.preventDefault(); }
function dropTask(e, targetColIndex) {
    e.preventDefault();
    document.querySelectorAll('.dragging').forEach(function(el) { el.classList.remove('dragging'); });
    if (!dragContext) return;
    var ci = dragContext.ci;
    var ti = dragContext.ti;
    var task = boardData[ci].tasks[ti];

    var list = e.currentTarget;
    var y = e.clientY;
    var afterElement = null;
    var targetIndex = boardData[targetColIndex].tasks.length;

    var draggableElements = Array.from(list.querySelectorAll('.task-item:not(.dragging)'));
    draggableElements.forEach(function(child) {
        var box = child.getBoundingClientRect();
        if (y > box.top && y < box.bottom) afterElement = child;
    });

    if (afterElement) {
        var parts = afterElement.id.split('-');
        targetIndex = parseInt(parts[2]);
    }

    boardData[ci].tasks.splice(ti, 1);
    boardData[targetColIndex].tasks.splice(targetIndex, 0, task);
    dragContext = null;
    saveBoardData();
    renderBoard();
}

function promptDeadline(ci, ti) {
    var task = boardData[ci].tasks[ti];
    var input = document.createElement('input');
    input.type = 'datetime-local';
    input.value = task.deadlineTime || '';
    input.style.width = '100%';
    input.style.padding = '4px';
    input.style.marginTop = '4px';
    input.addEventListener('change', function() {
        task.deadlineTime = this.value || null;
        saveBoardData();
        renderBoard();
    });
    var btn = document.querySelector('[onclick="promptDeadline(' + ci + ', ' + ti + ')"]');
    if (btn) btn.replaceWith(input);
    input.focus();
}

function removeAllSubtasks(ci, ti) {
    var task = boardData[ci].tasks[ti];
    if (!task.hasSubtasks) return;
    if (!confirm('Remove all subtasks from "' + task.text + '"?')) return;
    boardData[ci].tasks = boardData[ci].tasks.filter(function(t) { return t.parentId !== task.id; });
    task.hasSubtasks = false;
    task.collapsed = false;
    saveBoardData();
    renderBoard();
}

function setRecurrence(ci, ti, value) {
    var task = boardData[ci].tasks[ti];
    task.recurrence = value || null;
    task.lastRecurrenceDate = value ? getTodayKey() : null;
    saveBoardData();
    renderBoard();
}

function removeRecurrence(ci, ti) {
    var task = boardData[ci].tasks[ti];
    task.recurrence = null;
    task.lastRecurrenceDate = null;
    saveBoardData();
    renderBoard();
}

function updateDailyProgress() {
    var progressEl = document.getElementById('daily-progress');
    if (!progressEl) return;

    var todayKey = getTodayKey();
    var totalEstimated = 0;
    var totalTracked = 0;

    boardData.forEach(function(col) {
        col.tasks.forEach(function(task) {
            if (task.dateAdded === todayKey && !task.completed) {
                totalEstimated += task.estimateMinutes;
                totalTracked += Math.round(task.trackedSeconds / 60);
            }
        });
    });

    var todayHistory = historyData.filter(function(h) { return dateKeyFromISO(h.completedAt) === todayKey; });
    var completedMinutes = todayHistory.reduce(function(a, h) { return a + (h.actualMinutes || 0); }, 0);
    totalTracked += completedMinutes;

    var percent = totalEstimated > 0 ? Math.min(100, Math.round((totalTracked / totalEstimated) * 100)) : 0;
    var remaining = Math.max(0, totalEstimated - totalTracked);

    progressEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:#888;">
            <span>Today's Progress</span>
            <span>${formatHoursMinutes(totalTracked)} / ${formatHoursMinutes(totalEstimated)}</span>
            <span>${percent}%</span>
        </div>
        <div style="width:100%;height:6px;background:var(--border-color);border-radius:3px;margin-top:2px;">
            <div style="width:${percent}%;height:100%;background:var(--cherry-red);border-radius:3px;transition:width 0.5s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:#888;margin-top:2px;">
            <span>${remaining > 0 ? formatHoursMinutes(remaining) + ' remaining' : '🎉 All done!'}</span>
            <span>${formatHoursMinutes(completedMinutes)} completed</span>
        </div>
    `;
}

function updateFocusScore() {
    var scoreEl = document.getElementById('focus-score');
    if (!scoreEl) return;

    var todayKey = getTodayKey();
    var todayHistory = historyData.filter(function(h) { return dateKeyFromISO(h.completedAt) === todayKey; });

    var totalEstimated = 0;
    var totalTracked = 0;
    boardData.forEach(function(col) {
        col.tasks.forEach(function(task) {
            if (task.dateAdded === todayKey && !task.completed) {
                totalEstimated += task.estimateMinutes;
                totalTracked += Math.round(task.trackedSeconds / 60);
            }
        });
    });
    var completedMinutes = todayHistory.reduce(function(a, h) { return a + (h.actualMinutes || 0); }, 0);
    totalTracked += completedMinutes;

    var flowScore = totalEstimated > 0 ? Math.min(100, Math.round((totalTracked / totalEstimated) * 100)) : 0;

    var todayTasks = [];
    boardData.forEach(function(col) {
        col.tasks.forEach(function(task) {
            if (task.dateAdded === todayKey) todayTasks.push(task);
        });
    });
    var totalToday = todayTasks.length;
    var completedToday = todayTasks.filter(function(t) { return t.completed; }).length;
    var completionScore = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

    var breakLog = storageGet('ff-break-log', []);
    var todayBreaks = breakLog.filter(function(b) { return new Date(b.date).toLocaleDateString() === new Date().toLocaleDateString(); });
    var breakScore = todayBreaks.length > 0 ? Math.min(100, Math.round(100 / (todayBreaks.length))) : 100;

    var overall = Math.round((flowScore * 0.5) + (completionScore * 0.3) + (breakScore * 0.2));

    var grade = '💪 Excellent';
    var color = 'var(--green)';
    if (overall < 30) { grade = '🌱 Starting'; color = '#888'; }
    else if (overall < 50) { grade = '📈 Building'; color = 'var(--amber)'; }
    else if (overall < 70) { grade = '🔥 Good'; color = 'var(--cherry-red)'; }
    else if (overall < 90) { grade = '🌟 Great'; color = 'var(--cherry-red)'; }

    scoreEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:50px;height:50px;border-radius:50%;background:var(--input-bg);border:3px solid ${color};display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700;color:${color};">
                ${overall}
            </div>
            <div>
                <div style="font-weight:700;color:${color};">${grade}</div>
                <div style="font-size:0.65rem;color:#888;">${completedToday}/${totalToday} tasks · ${flowScore}% flow</div>
            </div>
        </div>
    `;
}

function normalizeTaskName(text) {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
}
function getTaskEstimateFromMemory(taskText) {
    var key = normalizeTaskName(taskText);
    var entry = taskTimeMemory[key];
    return entry ? Math.round(entry.total / entry.count) : null;
}
async function getTaskEstimateFromAI(taskText, notes) {
    var apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) return null;
    var prompt = 'Estimate realistic minutes for this task: "' + taskText + '" Notes: "' + (notes || 'none') + '" Respond with ONLY a number.';
    try {
        var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (!res.ok) return null;
        var data = await res.json();
        var raw = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : '';
        var num = parseInt(raw.match(/\d+/));
        return num ? Math.max(1, num) : null;
    } catch(e) { return null; }
}
async function estimateTask(task) {
    var est = getTaskEstimateFromMemory(task.text);
    if (est) {
        task.estimateMinutes = est;
        saveBoardData();
        renderBoard();
        return;
    }
    est = await getTaskEstimateFromAI(task.text, task.notes);
    if (est) {
        task.estimateMinutes = est;
        saveBoardData();
        renderBoard();
    }
}

function addTask(ci) {
    var input = document.getElementById('task-input-' + ci);
    var estInput = document.getElementById('task-est-' + ci);
    var text = input.value.trim();
    if (!text) return;

    var col = boardData[ci];
    if (col.notesRequired) {
        alert("This column requires notes. Please add notes via Details after creating the task.");
    }

    var estimate = parseInt(estInput.value) || 15;
    var task = {
        id: 't_' + Math.random().toString(36).substr(2,9),
        text: text,
        estimateMinutes: estimate,
        trackedSeconds: 0,
        isTracking: false,
        notes: '',
        completed: false,
        completedAt: null,
        dateAdded: getTodayKey(),
        breaks: [],
        timeSegments: [],
        deadlineTime: null,
        googleLink: '',
        startedAtIso: null,
        completedAtIso: null,
        parentId: null,
        subtasks: [],
        isSubtask: false,
        hasSubtasks: false,
        collapsed: false,
        collapsedControls: true,
        recurrence: null,
        lastRecurrenceDate: null,
        carriedOver: false,
        originalDate: null
    };
    col.tasks.push(task);
    input.value = '';
    saveBoardData();
    renderBoard();

    if (estimate <= 15) {
        estimateTask(task);
    }
}

function parseTimeFromLine(line) {
    var re = /(\d+(?:\.\d+)?)\s*(hours|hour|hrs|hr|minutes|minute|mins|min|seconds|second|secs|sec)\b/i;
    var match = line.match(re);
    if (!match) return { text: line.trim(), minutes: null };

    var value = parseFloat(match[1]);
    var unit = match[2].toLowerCase();
    var minutes;
    if (unit.startsWith('h')) minutes = Math.round(value * 60);
    else if (unit.startsWith('s')) minutes = Math.max(1, Math.round(value / 60));
    else minutes = Math.round(value);

    var cleanText = (line.slice(0, match.index) + line.slice(match.index + match[0].length))
        .replace(/[\s,.:-]+$/, '')
        .trim();
    return { text: cleanText || line.trim(), minutes: minutes };
}
function addPastedTasks(ci) {
    var textarea = document.getElementById('paste-box-' + ci);
    var lines = textarea.value.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
    if (lines.length === 0) return;

    var col = boardData[ci];
    if (col.notesRequired) {
        alert("This column requires notes. Please add notes via Details after pasting.");
    }

    var newTasks = lines.map(function(line) {
        var parsed = parseTimeFromLine(line);
        var finalMins = parsed.minutes || 15;
        return {
            id: 't_' + Math.random().toString(36).substr(2,9),
            text: parsed.text,
            estimateMinutes: finalMins,
            trackedSeconds: 0,
            isTracking: false,
            notes: '',
            completed: false,
            completedAt: null,
            dateAdded: getTodayKey(),
            breaks: [],
            timeSegments: [],
            deadlineTime: null,
            googleLink: '',
            startedAtIso: null,
            completedAtIso: null,
            parentId: null,
            subtasks: [],
            isSubtask: false,
            hasSubtasks: false,
            collapsed: false,
            collapsedControls: true,
            recurrence: null,
            lastRecurrenceDate: null,
            carriedOver: false,
            originalDate: null
        };
    });

    col.tasks.push.apply(col.tasks, newTasks);
    textarea.value = '';
    saveBoardData();
    renderBoard();

    newTasks.forEach(function(task) {
        if (task.estimateMinutes <= 15) {
            estimateTask(task);
        }
    });
}

function updateTaskText(ci, ti, v) { boardData[ci].tasks[ti].text = v.trim() || 'Untitled task'; saveBoardData(); }
function updateTaskEstimate(ci, ti, v) {
    if (isNaN(v) || v < 1) v = 1;
    boardData[ci].tasks[ti].estimateMinutes = v;
    saveBoardData();
    var listEl = document.getElementById('task-' + ci + '-' + ti);
    if (listEl) {
        var list = listEl.closest('.task-list');
        if (list) {
            var scrollPos = list.scrollTop;
            renderBoard();
            list.scrollTop = scrollPos;
            return;
        }
    }
    renderBoard();
}
function moveTask(ci, ti, dir) {
    var tasks = boardData[ci].tasks;
    var task = tasks[ti];
    if (task.completed) return;
    var listEl = document.getElementById('task-' + ci + '-' + ti);
    var scrollPos = listEl ? listEl.closest('.task-list').scrollTop : 0;

    var target = ti + dir;
    while (target >= 0 && target < tasks.length) {
        if (tasks[target].dateAdded === task.dateAdded && !tasks[target].completed) {
            var temp = tasks[ti];
            tasks[ti] = tasks[target];
            tasks[target] = temp;
            saveBoardData();
            renderBoard();
            setTimeout(function() {
                var newList = document.getElementById('task-' + ci + '-' + target);
                if (newList) newList.closest('.task-list').scrollTop = scrollPos;
            }, 0);
            return;
        }
        target += dir;
    }
}

function cleanEmDashes(text) {
    return text.replace(/[\u2014\u2013]|--/g, ', ');
}
async function callGemini(promptText) {
    var apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) throw new Error('API key missing');
    var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });
    if (!res.ok) throw new Error('API error ' + res.status);
    var data = await res.json();
    var text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : '';
    return cleanEmDashes(text);
}

async function suggestColumnTimesAI(ci) {
    var apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) { alert('Add Gemini API key in settings.'); return; }

    var openTasks = boardData[ci].tasks.filter(function(t) { return !t.completed; });
    if (openTasks.length === 0) return;

    var prompt = 'Estimate realistic minutes for these tasks as JSON array: [{"id":"<task.id>","minutes":<num>}]. Tasks: ' +
        openTasks.map(function(t) { return '[id:' + t.id + '] ' + t.text; }).join('; ');

    try {
        var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        var data = await res.json();
        var raw = data.candidates[0].content.parts[0].text;
        var cleaned = raw.replace(/```json|```/g, '').trim();
        var estimates = JSON.parse(cleaned);
        estimates.forEach(function(e) {
            var task = openTasks.find(function(t) { return t.id === e.id; });
            if (task) task.stagedEstimate = Math.max(1, e.minutes);
        });
        saveBoardData();
        renderBoard();
    } catch(e) { alert('AI error: ' + e.message); }
}

function applyTaskEstimate(ci, ti) {
    var task = boardData[ci].tasks[ti];
    if (task.stagedEstimate) { task.estimateMinutes = task.stagedEstimate; task.stagedEstimate = null; }
    saveBoardData();
    renderBoard();
}
function dismissTaskEstimate(ci, ti) { boardData[ci].tasks[ti].stagedEstimate = null; saveBoardData(); renderBoard(); }
function applyAllEstimates(ci) {
    boardData[ci].tasks.forEach(function(t) { if (t.stagedEstimate) { t.estimateMinutes = t.stagedEstimate; t.stagedEstimate = null; } });
    saveBoardData();
    renderBoard();
}
function dismissAllEstimates(ci) {
    boardData[ci].tasks.forEach(function(t) { t.stagedEstimate = null; });
    saveBoardData();
    renderBoard();
}

async function optimizeColumnFlowAI(ci) {
    var apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) { alert('Add Gemini API key.'); return; }

    var openTasks = boardData[ci].tasks.filter(function(t) { return !t.completed; });
    if (openTasks.length === 0) return;

    var prompt = 'Review these tasks for a project. \n1. Reorder them into the most logical execution sequence.\n2. If critical intermediate steps are missing based on standard project workflows, suggest them.\nReturn ONLY JSON format: {"orderedIds": ["id1", "id2"], "missingTasks": [{"task":"Name", "minutes": 15}]}\nTasks: ' + openTasks.map(function(t) { return '[id:' + t.id + '] ' + t.text; }).join('; ');

    try {
        var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        var data = await res.json();
        var cleaned = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
        var result = JSON.parse(cleaned);

        if (result.orderedIds && result.orderedIds.length === openTasks.length) {
            var sortedOpen = [];
            result.orderedIds.forEach(function(id) {
                var found = openTasks.find(function(t) { return t.id === id; });
                if (found) sortedOpen.push(found);
            });
            var comp = boardData[ci].tasks.filter(function(t) { return t.completed; });
            boardData[ci].tasks = sortedOpen.concat(comp);
        }

        if (result.missingTasks && result.missingTasks.length > 0) {
            boardData[ci].aiSuggestions = result.missingTasks;
        }

        saveBoardData();
        renderBoard();
    } catch(e) { alert('AI optimization error: ' + e.message); }
}

function acceptAISuggestion(ci, sIdx) {
    var s = boardData[ci].aiSuggestions[sIdx];
    boardData[ci].tasks.unshift({
        id: 't_' + Math.random().toString(36).substr(2,9),
        text: s.task,
        estimateMinutes: s.minutes,
        trackedSeconds: 0,
        isTracking: false,
        notes: 'Suggested by AI',
        completed: false,
        completedAt: null,
        dateAdded: getTodayKey(),
        breaks: [],
        timeSegments: [],
        deadlineTime: null,
        googleLink: '',
        startedAtIso: null,
        completedAtIso: null,
        parentId: null,
        subtasks: [],
        isSubtask: false,
        hasSubtasks: false,
        collapsed: false,
        collapsedControls: true,
        recurrence: null,
        lastRecurrenceDate: null
    });
    boardData[ci].aiSuggestions.splice(sIdx, 1);
    if (boardData[ci].aiSuggestions.length === 0) delete boardData[ci].aiSuggestions;
    saveBoardData();
    renderBoard();
}
function dismissAISuggestion(ci, sIdx) {
    boardData[ci].aiSuggestions.splice(sIdx, 1);
    if (boardData[ci].aiSuggestions.length === 0) delete boardData[ci].aiSuggestions;
    saveBoardData();
    renderBoard();
}

async function generateColumnCheckIn(ci) {
    var summaryBox = $('summary-content');
    summaryBox.textContent = 'Generating daily check-in for ' + boardData[ci].title + '...';
    var openTasks = boardData[ci].tasks.filter(function(t) { return !t.completed; }).map(function(t) { return t.text; });
    if (openTasks.length === 0) {
        summaryBox.textContent = 'No open tasks for ' + boardData[ci].title + ' today.';
        return;
    }
    var prompt = 'Act as a world-class formal assistant. Write a short, warm, encouraging daily check-in brief summarizing what is on the agenda today for the project/client "' + boardData[ci].title + '" based on this task list: ' + JSON.stringify(openTasks) + '. Use formal language. Do not use em-dashes.';
    try {
        var result = await callGemini(prompt);
        summaryBox.textContent = result;
    } catch(e) {
        summaryBox.textContent = 'Error: ' + e.message;
    }
}

async function generateDailyCheckOut() {
    var summaryBox = $('summary-content');
    summaryBox.textContent = 'Generating check-out brief...';
    var todayKey = getTodayKey();
    var todaysHistory = historyData.filter(function(h) { return dateKeyFromISO(h.completedAt) === todayKey; });
    var prompt = 'Act as a world-class formal assistant. Write a short, warm, professional daily check-out brief summarizing accomplishments today based on this data: ' + JSON.stringify(todaysHistory) + '. Use formal language. End on an encouraging note for tomorrow. Do not use em-dashes.';
    try {
        var result = await callGemini(prompt);
        summaryBox.textContent = result;
    } catch(e) {
        summaryBox.textContent = 'Error: ' + e.message;
    }
}

async function generateAISummary(silent) {
    var summaryBox = $('summary-content');
    if (!silent) summaryBox.textContent = 'Generating monthly report...';
    var thisMonthData = historyData.filter(function(h) { return new Date(h.completedAt).getMonth() === new Date().getMonth(); });
    var prompt = 'Write a polished, professional monthly client report grouping accomplishments by client based on: ' + JSON.stringify(thisMonthData) + '. Do not use em-dashes.';
    try {
        var result = await callGemini(prompt);
        if (!silent) summaryBox.textContent = result;
    } catch(e) {
        if (!silent) summaryBox.textContent = 'Error: ' + e.message;
    }
}
function maybeAutoGenerateSummary() {
    var now = new Date();
    var marker = now.getFullYear() + '-' + now.getMonth();
    if (storageGet('ff-last-summary-month', null) === marker) return;
    var apiKey = storageGet('gemini_api_key', null);
    if (apiKey) generateAISummary(true);
}

var openDetailsRef = null;
function openDetailsModal(ci, ti) {
    openDetailsRef = { ci: ci, ti: ti };
    var task = boardData[ci].tasks[ti];
    document.getElementById('details-task-name').textContent = task.text;
    document.getElementById('details-notes-textarea').value = task.notes || '';
    document.getElementById('details-link-input').value = task.googleLink || '';
    document.getElementById('details-deadline-input').value = task.deadlineTime || '';
    document.getElementById('details-estimate-label').textContent = 'Est: ' + task.estimateMinutes + ' min';
    document.getElementById('details-overlay').style.display = 'flex';
}
function closeDetailsModal() {
    if (openDetailsRef) {
        var ci = openDetailsRef.ci;
        var ti = openDetailsRef.ti;
        var task = boardData[ci].tasks[ti];
        task.notes = document.getElementById('details-notes-textarea').value;
        task.googleLink = document.getElementById('details-link-input').value;
        task.deadlineTime = document.getElementById('details-deadline-input').value || null;
        saveBoardData();
        renderBoard();
    }
    openDetailsRef = null;
    document.getElementById('details-overlay').style.display = 'none';
}
async function suggestTimeFromDetails() {
    if (!openDetailsRef) return;
    var ci = openDetailsRef.ci;
    var ti = openDetailsRef.ti;
    var task = boardData[ci].tasks[ti];
    var apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) { alert('Add Gemini API key.'); return; }
    var prompt = 'Estimate realistic minutes for this task: "' + task.text + '" Notes: "' + (task.notes || 'none') + '" Respond with ONLY a number.';
    try {
        var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        var data = await res.json();
        var raw = data.candidates[0].content.parts[0].text;
        var num = parseInt(raw.match(/\d+/)[0]);
        if (num) { task.estimateMinutes = Math.max(1, num); saveBoardData(); renderBoard(); document.getElementById('details-estimate-label').textContent = 'Est: ' + task.estimateMinutes + ' min'; }
    } catch(e) { alert('AI error'); }
}

async function breakdownTask() {
    if (!openDetailsRef) {
        alert('No task selected.');
        return;
    }

    var ci = openDetailsRef.ci;
    var ti = openDetailsRef.ti;
    var task = boardData[ci].tasks[ti];

    var existingSubtasks = boardData[ci].tasks.filter(function(t) { return t.parentId === task.id; });
    if (existingSubtasks.length > 0) {
        if (!confirm('This task already has ' + existingSubtasks.length + ' subtask(s). Generate new ones? This will replace them.')) {
            return;
        }
        boardData[ci].tasks = boardData[ci].tasks.filter(function(t) { return t.parentId !== task.id; });
        task.hasSubtasks = false;
        task.collapsed = false;
        saveBoardData();
        renderBoard();
    }

    var apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) {
        alert('Please add your Gemini API key in the AI settings (gear icon or footer).');
        return;
    }

    var prompt = 'You are a project management expert. Analyze this task and determine if it should be broken down into subtasks.\n\nTask: "' + task.text + '"\nAdditional notes: "' + (task.notes || 'none') + '"\n\nRULES:\n1. ONLY break down if the task is large enough to warrant subtasks (15+ minutes estimated, or clearly has multiple steps).\n2. If the task is simple and doesn\'t need breaking down, return: {"subtasks": []}\n3. If breaking down, provide 2-8 specific, actionable subtasks with realistic time estimates.\n4. Each subtask should be a discrete, completable action.\n5. Subtasks should flow logically from start to finish.\n\nReturn ONLY JSON with this structure:\n{\n  "subtasks": [\n    {"text": "Subtask description", "minutes": 15, "notes": "optional context"},\n    {"text": "Another subtask", "minutes": 30, "notes": "optional"}\n  ]\n}';

    try {
        var summaryBox = $('summary-content');
        summaryBox.textContent = '🧠 AI is analyzing and breaking down your task...';

        var responseText = await callGemini(prompt);
        var cleaned = responseText.replace(/```json|```/g, '').trim();
        var result = JSON.parse(cleaned);

        var subtasks = [];
        if (Array.isArray(result)) {
            subtasks = result;
        } else if (result.subtasks && Array.isArray(result.subtasks)) {
            subtasks = result.subtasks;
        } else if (result.tasks && Array.isArray(result.tasks)) {
            subtasks = result.tasks;
        } else {
            var keys = Object.keys(result);
            for (var i = 0; i < keys.length; i++) {
                if (Array.isArray(result[keys[i]])) {
                    subtasks = result[keys[i]];
                    break;
                }
            }
        }

        if (!subtasks || subtasks.length === 0) {
            var summaryBox2 = $('summary-content');
            summaryBox2.textContent = '💡 "' + task.text + '" doesn\'t need breaking down – it\'s simple enough as a single task.';
            alert('💡 "' + task.text + '" doesn\'t need breaking down – it\'s simple enough as a single task.');
            closeDetailsModal();
            return;
        }

        if (subtasks.length > 8) {
            subtasks = subtasks.slice(0, 8);
        }

        subtasks = subtasks.filter(function(st) { return st.text && st.text.trim().length > 0; });

        if (subtasks.length === 0) {
            throw new Error('AI didn\'t return valid subtasks.');
        }

        var createdCount = 0;
        subtasks.forEach(function(st) {
            if (st.text && st.text.trim()) {
                boardData[ci].tasks.push({
                    id: 't_' + Math.random().toString(36).substr(2,9),
                    text: st.text.trim(),
                    estimateMinutes: Math.max(1, st.minutes || 15),
                    trackedSeconds: 0,
                    isTracking: false,
                    notes: st.notes || 'Subtask of "' + task.text + '"',
                    completed: false,
                    completedAt: null,
                    dateAdded: getTodayKey(),
                    breaks: [],
                    timeSegments: [],
                    deadlineTime: null,
                    googleLink: '',
                    startedAtIso: null,
                    completedAtIso: null,
                    parentId: task.id,
                    subtasks: [],
                    isSubtask: true,
                    hasSubtasks: false,
                    collapsed: false,
                    collapsedControls: true,
                    recurrence: null,
                    lastRecurrenceDate: null
                });
                createdCount++;
            }
        });

        task.hasSubtasks = true;
        task.collapsed = false;

        saveBoardData();
        renderBoard();
        renderInternalQueue();
        closeDetailsModal();

        var summaryBox3 = $('summary-content');
        summaryBox3.textContent = '✅ Task broken down into ' + createdCount + ' subtask(s). They\'ve been added to the same column and will appear in your flow sequence.';

        alert('✨ ' + createdCount + ' subtask(s) created! They will appear indented under the parent task and in your flow sequence.');

    } catch (e) {
        alert('AI breakdown error: ' + e.message);
        console.error('Breakdown error details:', e);
        var summaryBox4 = $('summary-content');
        summaryBox4.textContent = '❌ Error breaking down task: ' + e.message;
    }
}

function updateStreaksAndBadges() {
    var streakEl = document.getElementById('streak-display');
    var badgesEl = document.getElementById('badges-display');
    if (!streakEl || !badgesEl) return;

    var streak = 0;
    var today = new Date();
    var checkDate = new Date(today);
    var completionDays = new Set();
    historyData.forEach(function(h) {
        var d = new Date(h.completedAt);
        var key = d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
        completionDays.add(key);
    });
    while (true) {
        var year = checkDate.getFullYear();
        var month = checkDate.getMonth() + 1;
        var day = checkDate.getDate();
        var key = year + '-' + month + '-' + day;
        var dow = checkDate.getDay();
        if (dow === 0 || dow === 6) {
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
        }
        if (completionDays.has(key)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }
    }

    var totalCompleted = historyData.length;
    var badges = [];
    var badgeDefinitions = [
        { id: 'first', label: 'First Task', icon: '🌟', condition: totalCompleted >= 1, desc: 'Completed your first task.' },
        { id: 'ten', label: '10 Tasks', icon: '🚀', condition: totalCompleted >= 10, desc: 'Finished 10 tasks total.' },
        { id: 'fifty', label: '50 Tasks', icon: '💪', condition: totalCompleted >= 50, desc: 'Reached 50 completed tasks.' },
        { id: 'hundred', label: '100 Tasks', icon: '🏆', condition: totalCompleted >= 100, desc: 'A century of tasks – outstanding!' },
        { id: 'accuracy', label: 'Accuracy Pro', icon: '🎯', condition: (function() {
            var withBoth = historyData.filter(function(h) { return h.estimateMinutes && h.actualMinutes; });
            if (withBoth.length < 10) return false;
            var totalDiff = withBoth.reduce(function(a, h) { return a + (h.actualMinutes - h.estimateMinutes); }, 0);
            var avgDiff = totalDiff / withBoth.length;
            return Math.abs(avgDiff) < 2;
        })(), desc: 'Average estimate error under 2 minutes across 10+ tasks.' },
        { id: 'flowmaster', label: 'Flow Master', icon: '⚡', condition: flowBlocksCompleted >= 5, desc: 'Completed 5 flow sessions.' },
        { id: 'streak7', label: '7-Day Streak', icon: '🔥', condition: streak >= 7, desc: 'Worked 7 days in a row (weekends skipped).' },
        { id: 'streak30', label: '30-Day Streak', icon: '🌟', condition: streak >= 30, desc: 'A whole month of consistent work!' }
    ];

    var earned = badgeDefinitions.filter(function(b) { return b.condition; });
    var nextBadge = badgeDefinitions.find(function(b) { return !b.condition; });
    var progress = 0;
    var progressMax = 0;
    if (nextBadge) {
        if (nextBadge.id === 'ten') { progress = totalCompleted; progressMax = 10; }
        else if (nextBadge.id === 'fifty') { progress = totalCompleted; progressMax = 50; }
        else if (nextBadge.id === 'hundred') { progress = totalCompleted; progressMax = 100; }
        else if (nextBadge.id === 'accuracy') {
            var withBoth2 = historyData.filter(function(h) { return h.estimateMinutes && h.actualMinutes; });
            progress = withBoth2.length;
            progressMax = 10;
        }
        else if (nextBadge.id === 'flowmaster') { progress = flowBlocksCompleted; progressMax = 5; }
        else if (nextBadge.id === 'streak7') { progress = streak; progressMax = 7; }
        else if (nextBadge.id === 'streak30') { progress = streak; progressMax = 30; }
        else if (nextBadge.id === 'first') { progress = totalCompleted; progressMax = 1; }
        progress = Math.min(progress, progressMax);
    }

    streakEl.textContent = '🔥 Streak: ' + streak + ' day' + (streak !== 1 ? 's' : '');

    if (earned.length === 0) {
        badgesEl.innerHTML = '<span style="color:#888;font-size:0.75rem;">No badges yet – complete your first task to get started.</span>';
    } else {
        badgesEl.innerHTML = earned.map(function(b) {
            return '<span class="badge-pill" title="' + b.desc + '">' + b.icon + ' ' + b.label + '</span>';
        }).join(' ');
    }

    if (nextBadge && progressMax > 0) {
        var pct = Math.round((progress / progressMax) * 100);
        var progressHtml = `
            <div style="margin-top:6px;font-size:0.7rem;color:#888;">
                <span>Next: ${nextBadge.icon} ${nextBadge.label}</span>
                <div style="width:100%;height:4px;background:var(--border-color);border-radius:2px;margin-top:2px;">
                    <div style="width:${pct}%;height:100%;background:var(--cherry-red);border-radius:2px;transition:width 0.3s;"></div>
                </div>
                <span style="font-size:0.65rem;">${progress}/${progressMax}</span>
            </div>
        `;
        var existingProgress = badgesEl.querySelector('.badge-progress');
        if (existingProgress) existingProgress.remove();
        var progressDiv = document.createElement('div');
        progressDiv.className = 'badge-progress';
        progressDiv.innerHTML = progressHtml;
        badgesEl.appendChild(progressDiv);
    }
}

document.addEventListener('keydown', function(e) {
    if (e.altKey && e.shiftKey) {
        switch(e.key.toLowerCase()) {
            case 's': toggleTimer(); e.preventDefault(); break;
            case 'r': resetTimer(); e.preventDefault(); break;
            case 'f': startFlow(); e.preventDefault(); break;
            case 'a': {
                var firstInput = document.querySelector('.task-input');
                if (firstInput) firstInput.focus();
                e.preventDefault();
                break;
            }
            case 'c': toggleClock(); e.preventDefault(); break;
            case 'b': toggleBreak(); e.preventDefault(); break;
            case 'q': toggleDarkMode(); e.preventDefault(); break;
            case 'x': skipCurrentSegment(); e.preventDefault(); break;
            case 'v': {
                var firstVoiceBtn = document.querySelector('[id^="voice-btn-"]');
                if (firstVoiceBtn) {
                    var ci = parseInt(firstVoiceBtn.id.split('-')[2]);
                    startVoiceInput(ci);
                }
                e.preventDefault();
                break;
            }
        }
    }
});

async function startAIFlow() {
    var apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) {
        alert('Please add your Gemini API key in the AI settings (gear icon or footer).');
        return;
    }

    var openTasks = [];
    boardData.forEach(function(col) {
        col.tasks.forEach(function(task) {
            if (!task.completed) {
                openTasks.push({
                    id: task.id,
                    text: task.text,
                    estimate: task.estimateMinutes,
                    deadline: task.deadlineTime,
                    column: col.title,
                    notes: task.notes || ''
                });
            }
        });
    });

    if (openTasks.length === 0) {
        alert('No open tasks to order.');
        return;
    }

    for (var t of openTasks) {
        if (t.estimate <= 5) {
            var found = boardData.flatMap(function(col) { return col.tasks; }).find(function(task) { return task.id === t.id; });
            if (found) await estimateTask(found);
        }
    }

    var updatedOpen = [];
    boardData.forEach(function(col) {
        col.tasks.forEach(function(task) {
            if (!task.completed) {
                updatedOpen.push({
                    id: task.id,
                    text: task.text,
                    estimate: task.estimateMinutes,
                    deadline: task.deadlineTime,
                    column: col.title
                });
            }
        });
    });

    var prompt = 'You are a productivity expert. Given these tasks, suggest the most efficient order to work on them. Consider deadlines (if any), task type, logical dependencies, and typical energy patterns. Return ONLY a JSON array of task IDs in the order they should be done. Tasks: ' + JSON.stringify(updatedOpen);

    try {
        var responseText = await callGemini(prompt);
        var cleaned = responseText.replace(/```json|```/g, '').trim();
        var orderedIds = JSON.parse(cleaned);

        if (typeof orderedIds === 'object' && !Array.isArray(orderedIds)) {
            var keys = Object.keys(orderedIds);
            if (keys.length === 1 && Array.isArray(orderedIds[keys[0]])) {
                orderedIds = orderedIds[keys[0]];
            } else {
                throw new Error('AI response is not a JSON array.');
            }
        }

        if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
            throw new Error('AI returned an empty or invalid order.');
        }

        customQueueOrder = orderedIds;
        storageSet('ff-custom-queue', customQueueOrder);

        startFlow();
    } catch (e) {
        alert('AI Flow error: ' + e.message);
        console.error('AI Flow error details:', e);
    }
}

async function reEstimateAllTasks() {
    var apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) { alert('Add Gemini API key.'); return; }
    var allOpenTasks = [];
    boardData.forEach(function(col) { col.tasks.forEach(function(t) { if (!t.completed) allOpenTasks.push(t); }); });
    if (allOpenTasks.length === 0) return;
    if (!confirm('Re-estimate ' + allOpenTasks.length + ' task(s)?')) return;
    var prompt = 'Estimate realistic minutes for these tasks as JSON array: [{"task":"<task text>","minutes":<num>}]. Tasks: ' + allOpenTasks.map(function(t) { return '"' + t.text + '"'; }).join('; ');
    try {
        var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        var data = await res.json();
        var raw = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
        var estimates = JSON.parse(raw);
        estimates.forEach(function(e) {
            var task = allOpenTasks.find(function(t) { return t.text === e.task; });
            if (task) task.estimateMinutes = Math.max(1, e.minutes);
        });
        saveBoardData();
        renderBoard();
    } catch(e) { alert('AI error'); }
}

function renderEstimateLog() {
    var logBox = $('estimate-log');
    if (!logBox) return;
    var recent = historyData.slice(0, 40);
    if (recent.length === 0) { logBox.innerHTML = '<p style="font-size:0.85rem;color:#888;">Complete a tracked task to start your log.</p>'; return; }
    var groups = {};
    recent.forEach(function(h) { var key = dateKeyFromISO(h.completedAt); if (!groups[key]) groups[key] = []; groups[key].push(h); });
    var orderedKeys = Object.keys(groups).sort(function(a, b) { return b.localeCompare(a); });
    logBox.innerHTML = '<ul class="log-list">' + orderedKeys.map(function(key) {
        return '<li class="date-group-header">' + formatDateKey(key) + '</li>' +
            groups[key].map(function(h) {
                var diff = (h.actualMinutes || 0) - (h.estimateMinutes || 0);
                var cls = 'under';
                var label = (diff <= 0 ? diff : '+' + diff) + 'm';
                if (diff > (h.estimateMinutes * 0.2)) cls = 'over';
                else if (diff > 0) cls = 'near';
                return '<li class="log-item"><span>' + escapeHTML(h.task) + '</span><span class="log-variance ' + cls + '">Est ' + h.estimateMinutes + 'm / Act ' + h.actualMinutes + 'm (' + label + ')</span></li>';
            }).join('');
    }).join('') + '</ul>';
}

function renderDailyRecap() {
    var box = $('daily-recap-box');
    if (!box) return;
    var todayKey = getTodayKey();
    var todayDateStr = new Date().toLocaleDateString();
    var todaysHistory = historyData.filter(function(h) { return dateKeyFromISO(h.completedAt) === todayKey; });
    var totalActual = todaysHistory.reduce(function(a, h) { return a + (h.actualMinutes || 0); }, 0);
    var openFromToday = 0;
    boardData.forEach(function(col) { col.tasks.forEach(function(t) { if (t.dateAdded === todayKey && !t.completed) openFromToday++; }); });
    var clockedMinutesToday = clockLog.filter(function(c) { return c.date === todayDateStr; }).reduce(function(a, c) { return a + c.durationMinutes; }, 0);
    if (clockState.clockedIn) clockedMinutesToday += Math.max(0, Math.round((Date.now() - clockState.startedAt) / 60000));
    var breakMinutesToday = todaysHistory.reduce(function(a, h) { return a + (h.breakMinutes || 0); }, 0);
    var breakLog = storageGet('ff-break-log', []);
    var todayBreaks = breakLog.filter(function(b) { return new Date(b.date).toLocaleDateString() === todayDateStr; });
    breakMinutesToday += todayBreaks.reduce(function(a, b) { return a + b.durationMinutes; }, 0);

    box.innerHTML = `
        <div id="daily-progress" style="margin-bottom:8px;"></div>
        <div id="focus-score" style="margin-bottom:8px;"></div>
        <ul style="list-style:none;padding:0;margin:0;font-size:0.85rem;line-height:1.7;">
            <li><strong>${todaysHistory.length}</strong> task(s) finished</li>
            <li><strong>${openFromToday}</strong> still open</li>
            <li><strong>${formatHoursMinutes(totalActual)}</strong> logged work</li>
            <li><strong>${formatHoursMinutes(breakMinutesToday)}</strong> breaks/away</li>
            <li><strong>${formatHoursMinutes(clockedMinutesToday)}</strong> clocked in</li>
        </ul>
    `;
    updateDailyProgress();
    updateFocusScore();
}

function computeColumnTimeline(standardBreakMinutes) {
    var grandWork = 0;
    var perColumn = boardData.map(function(col) {
        var colWork = 0, colTotalWithBreaks = 0;
        var openTasks = col.tasks.filter(function(t) { return !t.completed && !t.parentId; });
        openTasks.forEach(function(task, i) {
            var chunkData = buildChunks(Math.max(1, task.estimateMinutes || 15));
            var chunks = chunkData.chunks;
            var bonusBreakMinutes = chunkData.bonusBreakMinutes;
            var taskWork = chunks.reduce(function(a, b) { return a + b; }, 0);
            colWork += taskWork;
            colTotalWithBreaks += taskWork + (chunks.length - 1) * standardBreakMinutes;
            if (i < openTasks.length - 1) colTotalWithBreaks += standardBreakMinutes + bonusBreakMinutes;
        });
        grandWork += colWork;
        return { title: col.title, workMinutes: colWork, totalWithBreaksMinutes: colTotalWithBreaks, taskCount: openTasks.length };
    });
    var grandTotal = 0;
    perColumn.forEach(function(c, idx) {
        grandTotal += c.totalWithBreaksMinutes;
        if (idx < perColumn.length - 1 && c.taskCount > 0) grandTotal += standardBreakMinutes;
    });
    return { perColumn: perColumn, grandWorkMinutes: grandWork, grandTotalMinutes: grandTotal };
}

function getSelectedTimezone() { return storageGet('ff-timezone', Intl.DateTimeFormat().resolvedOptions().timeZone); }
function updateTimezone(tz) {
    if (!tz || tz.trim() === '') return;
    storageSet('ff-timezone', tz);
    renderTimeCounter();
}
function formatTimeInZone(date, tz) { return date.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' }); }

function populateTimezoneSelect() {
    var sel = document.getElementById('timezone-select');
    if (!sel) return;
    var zones;
    try { zones = Intl.supportedValuesOf('timeZone'); }
    catch (e) { zones = ['UTC','Africa/Lagos','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Dubai','Asia/Kolkata','Asia/Shanghai','Australia/Sydney']; }
    var current = getSelectedTimezone();
    sel.innerHTML = zones.map(function(z) {
        return '<option value="' + z + '" ' + (z === current ? 'selected' : '') + '>' + z + '</option>';
    }).join('');
}

function renderTimeCounter() {
    var box = $('time-counter-box');
    if (!box) return;
    var breakMin = parseInt(breakInput.value) || 5;
    var result = computeColumnTimeline(breakMin);
    var perColumn = result.perColumn;
    var grandWorkMinutes = result.grandWorkMinutes;
    var grandTotalMinutes = result.grandTotalMinutes;
    var tz = getSelectedTimezone();
    var now = new Date();
    var cursor = new Date(now);
    var rows = '';
    perColumn.forEach(function(c, idx) {
        if (c.taskCount === 0) { rows += '<div class="log-item"><span>' + escapeHTML(c.title) + '</span><span style="color:#999;">No open tasks</span></div>'; return; }
        cursor = new Date(cursor.getTime() + c.totalWithBreaksMinutes * 60000);
        rows += '<div class="log-item"><span>' + escapeHTML(c.title) + ' (' + c.workMinutes + ' min work)</span><span class="log-variance under">Done by ' + formatTimeInZone(cursor, tz) + '</span></div>';
        if (idx < perColumn.length - 1 && c.taskCount > 0) cursor = new Date(cursor.getTime() + breakMin * 60000);
    });
    var grandDone = new Date(now.getTime() + grandTotalMinutes * 60000);
    box.innerHTML = '<ul class="log-list">' + rows + '</ul>' +
        '<p style="margin-top:8px;font-size:0.85rem;"><strong>' + formatHoursMinutes(grandWorkMinutes) + '</strong> total work.</p>' +
        '<p style="font-weight:700;">All done by ' + formatTimeInZone(grandDone, tz) + ' (' + tz + ')</p>';
}

function updateAdaptiveHacks() {
    var box = $('adaptive-hacks');
    if (!box) return;
    var totalEstimate = 0, openTasks = 0;
    boardData.forEach(function(col) { col.tasks.forEach(function(t) { if (!t.completed && !t.parentId) { totalEstimate += (t.estimateMinutes || 0); openTasks++; } }); });
    var workMin = Math.round((workDuration || 1500) / 60);
    var sessions = openTasks > 0 ? Math.ceil(totalEstimate / workMin) : 0;
    box.innerHTML = '<ul><li><strong>Active Load:</strong> ' + formatHoursMinutes(totalEstimate) + ' across ' + openTasks + ' task(s)' + (sessions ? ' — roughly ' + sessions + ' focus session(s).' : '.') + '</li><li><strong>Timer Flash:</strong> 3 min left warning.</li></ul>';
}

function exportAllDataJSON() {
    var data = {
        appSettings: appSettings,
        boardData: boardData,
        historyData: historyData,
        clockLog: clockLog,
        clockState: clockState,
        flowBlocksCompleted: flowBlocksCompleted,
        taskTimeMemory: taskTimeMemory,
        customQueueOrder: customQueueOrder,
        headerClockZones: headerClockZones
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'focus-flow-backup-' + getTodayKey() + '.json';
    a.click();
}
function exportHistoryCSV() {
    var rows = [['Date','Client','Task','Estimate (min)','Actual (min)','Breaks (min)','Notes']];
    historyData.forEach(function(h) { rows.push([dateKeyFromISO(h.completedAt), h.client, h.task, h.estimateMinutes, h.actualMinutes, (h.breakMinutes||0), (h.notes||'').replace(/"/g,'""')]); });
    var csv = rows.map(function(r) { return r.map(function(v) { return '"' + String(v).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'focus-flow-history-' + getTodayKey() + '.csv';
    a.click();
}
function importAllDataJSON(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            if (data.boardData) { boardData = data.boardData; storageSet('focus_board_data', boardData); }
            if (data.historyData) { historyData = data.historyData; storageSet('focus_history_data', historyData); }
            if (data.clockLog) { clockLog = data.clockLog; storageSet('ff-clock-log', clockLog); }
            if (data.clockState) { clockState = data.clockState; storageSet('ff-clock-state', clockState); }
            if (data.customQueueOrder) { customQueueOrder = data.customQueueOrder; storageSet('ff-custom-queue', customQueueOrder); }
            if (data.headerClockZones) { headerClockZones = data.headerClockZones; storageSet('ff-header-clock-zones', headerClockZones); populateHeaderClockSelects(); }
            if (data.flowBlocksCompleted !== undefined) { flowBlocksCompleted = data.flowBlocksCompleted; localStorage.setItem('focus_daily_sessions', flowBlocksCompleted); }
            if (data.appSettings) { appSettings = data.appSettings; storageSet('ff-app-settings', appSettings); applySettings(); }
            if (data.taskTimeMemory) { taskTimeMemory = data.taskTimeMemory; storageSet('ff-task-time-memory', taskTimeMemory); }
            renderBoard();
            renderDailyRecap();
            renderEstimateLog();
            renderClockCard();
            alert('Import successful!');
        } catch(err) {
            alert('Invalid JSON: ' + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function sendNotification(title, body) {
    if (!appSettings.notificationsEnabled) return;
    if (!('Notification' in window) || Notification.permission === 'denied') return;
    if (Notification.permission === 'default') {
        await Notification.requestPermission();
    }
    if (Notification.permission === 'granted') {
        new Notification(title, { body: body, icon: 'icon-192.png' });
    }
}

function checkForNotifications() {
    var now = new Date();
    boardData.forEach(function(col) {
        col.tasks.forEach(function(task) {
            if (task.deadlineTime && !task.completed) {
                var deadline = new Date(task.deadlineTime);
                var diff = (deadline - now) / 3600000;
                if (diff < 1 && diff > 0) {
                    sendNotification('⏰ Deadline Approaching', '"' + task.text + '" is due within 1 hour.');
                }
            }
        });
    });
}

function generateICS() {
    var events = [];
    boardData.forEach(function(col) {
        col.tasks.forEach(function(task) {
            if (task.deadlineTime && !task.completed) {
                events.push({
                    title: task.text,
                    start: new Date(task.deadlineTime),
                    notes: task.notes || ''
                });
            }
        });
    });
    if (events.length === 0) {
        alert('No tasks with deadlines to export.');
        return;
    }
    var icsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Focus Flow//EN\n';
    events.forEach(function(e) {
        var startStr = e.start.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        var endStr = new Date(e.start.getTime() + 60*60*1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        icsContent += 'BEGIN:VEVENT\n';
        icsContent += 'SUMMARY:' + e.title + '\n';
        icsContent += 'DTSTART:' + startStr + '\n';
        icsContent += 'DTEND:' + endStr + '\n';
        icsContent += 'DESCRIPTION:' + (e.notes || '') + '\n';
        icsContent += 'END:VEVENT\n';
    });
    icsContent += 'END:VCALENDAR';
    var blob = new Blob([icsContent], { type: 'text/calendar' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'focus-flow-calendar.ics';
    a.click();
    URL.revokeObjectURL(a.href);
}

function initApp() {
    applySettings();
    updateClocks();
    setInterval(updateClocks, 1000);
    adjustTasksForMidnight();

    setInterval(function() {
        var anyTracking = false;
        boardData.forEach(function(col, ci) {
            col.tasks.forEach(function(task, ti) {
                if (task.isTracking && !task.completed) {
                    anyTracking = true;
                    task.trackedSeconds++;
                    var btn = document.getElementById('track-btn-' + ci + '-' + ti);
                    if (btn) btn.textContent = '⏸ ' + formatMinSec(task.trackedSeconds);
                }
            });
        });
        if (anyTracking) {
            if (Math.random() < 0.1) saveBoardData();
        }
    }, 1000);

    setInterval(function() {
        var now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            adjustTasksForMidnight();
            setupRecurringTasks();
        }
    }, 60000);

    setInterval(checkForNotifications, 300000);

    var key = storageGet('gemini_api_key', '');
    var keyInput = document.getElementById('gemini-api-key');
    if (keyInput) keyInput.value = key;
    var keyInputModal = document.getElementById('gemini-api-key-modal');
    if (keyInputModal) keyInputModal.value = key;

    setFlowControlsVisible(false);
    renderClockCard();
    populateHeaderClockSelects();
    populateTimezoneSelect();
    renderBoard();
    renderEstimateLog();
    updateDisplay();
    startQuoteRotation();
    renderDailyRecap();

    setupRecurringTasks();

    var scheduledIn = clockState.scheduledIn || '09:00';
    var scheduledOut = clockState.scheduledOut || '17:00';
    var inEl = document.getElementById('scheduled-in');
    var outEl = document.getElementById('scheduled-out');
    if (inEl) inEl.value = scheduledIn;
    if (outEl) outEl.value = scheduledOut;
    updateAttendanceDisplay();
    setInterval(updateAttendanceDisplay, 30000);

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function saveApiKey(key) { storageSet('gemini_api_key', key); }
function handleKeyPress(e, ci) { if (e.key === 'Enter') addTask(ci); }
function escapeHTML(str) { return String(str).replace(/[&<>'"]/g, function(tag) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[tag] || tag; }); }

var pendingCompletion = null;
function toggleTask(ci, ti) {
    var task = boardData[ci].tasks[ti];
    if (task.completed) {
        task.completed = false;
        task.completedAt = null;
        task.completedAtIso = null;
        if (task._historyId) {
            var idx = historyData.findIndex(function(h) { return h._id === task._historyId; });
            if (idx !== -1) historyData.splice(idx, 1);
            task._historyId = null;
        }
        saveBoardData();
        renderBoard();
        renderEstimateLog();
        return;
    }
    if (boardData[ci].notesRequired && (!task.notes || task.notes.trim() === '')) {
        alert("This column requires notes! Please add notes via Details before completing.");
        renderBoard();
        return;
    }
    if (task.trackedSeconds === 0) {
        pendingCompletion = { colIndex: ci, taskIndex: ti };
        document.getElementById('completion-task-name').textContent = task.text;
        document.getElementById('completion-actual-input').value = task.estimateMinutes;
        document.getElementById('completion-overlay').style.display = 'flex';
        return;
    }
    finalizeTaskCompletion(ci, ti, task.trackedSeconds);
}
function confirmCompletion() {
    if (!pendingCompletion) return;
    var colIndex = pendingCompletion.colIndex;
    var taskIndex = pendingCompletion.taskIndex;
    var task = boardData[colIndex].tasks[taskIndex];
    var minutes = Math.max(1, parseInt(document.getElementById('completion-actual-input').value) || task.estimateMinutes);
    finalizeTaskCompletion(colIndex, taskIndex, minutes * 60);
    pendingCompletion = null;
    document.getElementById('completion-overlay').style.display = 'none';
}
function cancelCompletion() {
    pendingCompletion = null;
    document.getElementById('completion-overlay').style.display = 'none';
    renderBoard();
}
function finalizeTaskCompletion(ci, ti, actualSeconds) {
    var task = boardData[ci].tasks[ti];
    task.completed = true;
    task.isTracking = false;
    task.trackedSeconds = actualSeconds;
    task.completedAt = Date.now();
    task.completedAtIso = new Date().toISOString();
    if (task.startedAtIso) task.timeSegments.push({ start: task.startedAtIso, end: task.completedAtIso });

    var historyId = 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    task._historyId = historyId;
    var totalBreaks = task.breaks.reduce(function(acc, b) { return acc + (b.durationMinutes || 0); }, 0);
    var breaksStr = task.breaks.length ? '[Breaks: ' + task.breaks.map(function(b) { return b.reason; }).join(', ') + '] ' : '';
    historyData.unshift({
        _id: historyId,
        client: boardData[ci].title,
        task: task.text,
        estimateMinutes: task.estimateMinutes,
        actualMinutes: Math.round(actualSeconds / 60),
        breakMinutes: totalBreaks,
        notes: breaksStr + (task.notes || 'No notes'),
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
function deleteTask(ci, ti) {
    var task = boardData[ci].tasks[ti];
    boardData[ci].tasks = boardData[ci].tasks.filter(function(t) { return t.parentId !== task.id; });
    boardData[ci].tasks.splice(ti, 1);
    saveBoardData();
    renderBoard();
    renderInternalQueue();
}

function rememberTaskTime(text, minutes) {
    var key = normalizeTaskName(text);
    if (!key) return;
    var entry = taskTimeMemory[key] || { total: 0, count: 0 };
    entry.total += minutes;
    entry.count += 1;
    taskTimeMemory[key] = entry;
    storageSet('ff-task-time-memory', taskTimeMemory);
}

document.addEventListener('DOMContentLoaded', initApp);