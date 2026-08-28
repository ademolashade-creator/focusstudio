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
    const exitBtn = $('exit-flow-btn');
    const startBtn = $('start-flow-btn');
    if (exitBtn) exitBtn.style.display = active ? 'inline-block' : 'none';
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
    historyData.unshift({
        client: entry.col.title,
        task: task.text,
        estimateMinutes: task.estimateMinutes,
        actualMinutes: Math.round(actualSeconds / 60),
        notes: task.notes || 'Completed via Flow',
        completedAt: new Date().toISOString()
    });
    if (historyData.length > 500) historyData.pop();
    saveBoardData();
    renderBoard();
    renderEstimateLog();
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

function exitFlow() {
    clearInterval(timerInterval);
    isRunning = false;
    releaseWakeLock();
    timerMode = 'manual';
    isWorkTime = true;
    setFlowControlsVisible(false);
    setupMode();
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

// Migrate older saved tasks that don't yet have time-tracking fields
boardData.forEach(col => col.tasks.forEach(t => {
    if (t.estimateMinutes === undefined) t.estimateMinutes = 15;
    if (t.trackedSeconds === undefined) t.trackedSeconds = 0;
    if (t.isTracking === undefined) t.isTracking = false;
}));

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

    boardData.forEach((col, colIndex) => {
        const columnEl = document.createElement('div');
        columnEl.className = 'task-column';

        columnEl.innerHTML = `
            <input type="text" class="column-header-input" value="${escapeHTML(col.title)}" oninput="updateColumnTitle(${colIndex}, this.value)" placeholder="Project / Client Name">

            <div class="google-link-container">
                <input type="url" class="google-link-input" value="${escapeHTML(col.googleLink || '')}" oninput="updateGoogleLink(${colIndex}, this.value)" placeholder="Paste Google Doc/Sheet Link...">
                <a href="${col.googleLink || '#'}" target="_blank" class="google-link-btn" title="Open Link">Open</a>
            </div>

            <div class="task-input-group">
                <input type="text" class="task-input" id="task-input-${colIndex}" placeholder="Add a new task..." onkeypress="handleKeyPress(event, ${colIndex})">
                <input type="number" class="task-estimate-new" id="task-est-${colIndex}" value="15" min="1" max="480" title="Estimated minutes">
                <button class="add-task-btn" onclick="addTask(${colIndex})">Add</button>
            </div>

            <textarea class="task-input paste-textarea" id="paste-box-${colIndex}" rows="3" placeholder="Or paste several tasks, one per line — e.g. 'design post 30 mins'. Leave off the time and AI will suggest one."></textarea>
            <button class="add-task-btn" style="width:100%;margin-bottom:1rem;" onclick="addPastedTasks(${colIndex})">Add Pasted Tasks</button>

            <ul class="task-list">
                ${col.tasks.map((task, taskIndex) => `
                    <li class="task-item ${task.completed ? 'completed' : ''} ${urgencyClassFor(task)}" id="task-${colIndex}-${taskIndex}">
                        <div class="task-main-row">
                            <div class="task-left">
                                <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="toggleTask(${colIndex}, ${taskIndex})">
                                <input type="text" class="task-name-input" value="${escapeHTML(task.text)}" onchange="updateTaskText(${colIndex}, ${taskIndex}, this.value)">
                            </div>
                            <div class="task-actions">
                                <input type="number" class="task-estimate-input" value="${task.estimateMinutes}" min="1" max="480" title="Estimated minutes" onchange="updateTaskEstimate(${colIndex}, ${taskIndex}, parseInt(this.value))">m
                                <button class="track-btn ${task.isTracking ? 'tracking' : ''}" id="track-btn-${colIndex}-${taskIndex}" onclick="toggleTrack(${colIndex}, ${taskIndex})" title="Track actual time spent">${task.isTracking ? '⏸' : '▶'} ${formatMinSec(task.trackedSeconds)}</button>
                                <button class="icon-btn" onclick="moveTask(${colIndex}, ${taskIndex}, -1)" title="Move Up">▲</button>
                                <button class="icon-btn" onclick="moveTask(${colIndex}, ${taskIndex}, 1)" title="Move Down">▼</button>
                                <button class="notes-toggle-btn" onclick="toggleNotes(${colIndex}, ${taskIndex})" title="Notes">📝</button>
                                <button class="delete-btn" onclick="deleteTask(${colIndex}, ${taskIndex})">×</button>
                            </div>
                        </div>
                        <div class="task-notes-dropdown ${task.showNotes ? 'open' : ''}">
                            <textarea class="task-notes-textarea" placeholder="Add extra task information/notes..." oninput="updateTaskNotes(${colIndex}, ${taskIndex}, this.value)">${escapeHTML(task.notes || '')}</textarea>
                            <button class="btn-secondary" style="margin-top:6px;width:100%;" onclick="suggestTimeForTask(${colIndex}, ${taskIndex})">Suggest Time (AI)</button>
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;
        container.appendChild(columnEl);
    });
    updateAdaptiveHacks();
}

function updateColumnTitle(colIndex, newTitle) { boardData[colIndex].title = newTitle; saveBoardData(); }
function updateGoogleLink(colIndex, newLink) { boardData[colIndex].googleLink = newLink; saveBoardData(); }

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

function addPastedTasks(colIndex) {
    const textarea = $(`paste-box-${colIndex}`);
    const lines = textarea.value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const newTasks = lines.map((line) => {
        const { text, minutes } = parseTimeFromLine(line);
        return {
            text,
            estimateMinutes: minutes || 15,
            needsAiEstimate: minutes === null,
            trackedSeconds: 0,
            isTracking: false,
            notes: '',
            completed: false,
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
    if (!apiKey || tasks.length === 0) return;

    const promptText = `You are helping estimate realistic, feasible time in minutes for short work tasks. For each task below, give your best realistic estimate in minutes as a whole number. Respond with ONLY a JSON array, no other text, in exactly this form: [{"task":"<exact task text given>","minutes": <number>}]. Tasks:\n` +
        tasks.map((t) => `- "${t.text}"`).join('\n');

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });
        if (!res.ok) return;
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
    } catch (e) { /* keep the fallback estimate silently */ }
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

function toggleNotes(colIndex, taskIndex) {
    boardData[colIndex].tasks[taskIndex].showNotes = !boardData[colIndex].tasks[taskIndex].showNotes;
    renderBoard();
}
function updateTaskNotes(colIndex, taskIndex, newNotes) { boardData[colIndex].tasks[taskIndex].notes = newNotes; saveBoardData(); }
function updateTaskText(colIndex, taskIndex, newText) { boardData[colIndex].tasks[taskIndex].text = newText.trim() || 'Untitled task'; saveBoardData(); }
function updateTaskEstimate(colIndex, taskIndex, newVal) {
    if (isNaN(newVal) || newVal < 1) newVal = 1;
    boardData[colIndex].tasks[taskIndex].estimateMinutes = newVal;
    saveBoardData();
    renderBoard();
}

function moveTask(colIndex, taskIndex, direction) {
    const tasks = boardData[colIndex].tasks;
    const target = taskIndex + direction;
    if (target >= 0 && target < tasks.length) {
        [tasks[taskIndex], tasks[target]] = [tasks[target], tasks[taskIndex]];
        saveBoardData();
        renderBoard();
    }
}

function toggleTrack(colIndex, taskIndex) {
    boardData[colIndex].tasks[taskIndex].isTracking = !boardData[colIndex].tasks[taskIndex].isTracking;
    saveBoardData();
    renderBoard();
}

function toggleTask(colIndex, taskIndex) {
    const task = boardData[colIndex].tasks[taskIndex];

    if (mandatoryNotes && !task.completed && (!task.notes || task.notes.trim() === '')) {
        alert("Mandatory Extra Info is turned ON! Please fill out task details before completing this task.");
        renderBoard();
        return;
    }

    task.completed = !task.completed;

    if (task.completed) {
        task.isTracking = false;
        const actualMinutes = Math.round(task.trackedSeconds / 60);
        historyData.unshift({
            client: boardData[colIndex].title,
            task: task.text,
            estimateMinutes: task.estimateMinutes,
            actualMinutes: actualMinutes,
            notes: task.notes || 'No extra notes provided',
            completedAt: new Date().toISOString()
        });
        if (historyData.length > 500) historyData.pop();
    }

    saveBoardData();
    renderBoard();
    renderEstimateLog();
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

// ---------- Estimate vs Actual rolling log ----------
function renderEstimateLog() {
    const logBox = $('estimate-log');
    if (!logBox) return;
    const recent = historyData.slice(0, 20);
    if (recent.length === 0) {
        logBox.innerHTML = '<p style="font-size:0.85rem;color:#888;">Complete a tracked task to start your log.</p>';
        return;
    }
    logBox.innerHTML = `<ul class="log-list">${recent.map(h => {
        const diff = (h.actualMinutes || 0) - (h.estimateMinutes || 0);
        let cls = 'under', label = `${diff <= 0 ? diff : '+' + diff}m`;
        if (diff > (h.estimateMinutes * 0.2)) cls = 'over';
        else if (diff > 0) cls = 'near';
        const d = new Date(h.completedAt);
        const dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
        return `<li class="log-item"><span>${escapeHTML(h.task)} <em style="color:#999;">(${dateStr})</em></span><span class="log-variance ${cls}">Est ${h.estimateMinutes}m / Act ${h.actualMinutes}m (${label})</span></li>`;
    }).join('')}</ul>`;
}

// ---------- Focus Lock ----------
let focusLockEnabled = false;
let hiddenAt = null;

async function toggleFocusLock() {
    focusLockEnabled = !focusLockEnabled;
    const btn = $('focus-lock-btn');
    if (focusLockEnabled) {
        btn.textContent = 'Disable Focus Lock';
        btn.classList.add('active');
        try { await document.documentElement.requestFullscreen(); } catch (e) {}
    } else {
        btn.textContent = 'Enable Focus Lock';
        btn.classList.remove('active');
        if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (e) {} }
    }
}

function showLockWarning(msg) {
    const overlay = $('lock-overlay');
    const msgEl = $('lock-overlay-msg');
    if (!overlay) return;
    msgEl.textContent = msg;
    overlay.style.display = 'flex';
}
function confirmLeaveLock() {
    focusLockEnabled = false;
    const btn = $('focus-lock-btn');
    if (btn) { btn.textContent = 'Enable Focus Lock'; btn.classList.remove('active'); }
    $('lock-overlay').style.display = 'none';
}
async function reLock() {
    $('lock-overlay').style.display = 'none';
    if (focusLockEnabled) { try { await document.documentElement.requestFullscreen(); } catch (e) {} }
}

window.addEventListener('beforeunload', (e) => {
    if (focusLockEnabled && isRunning) { e.preventDefault(); e.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => {
    if (!focusLockEnabled) return;
    if (document.hidden) {
        hiddenAt = Date.now();
    } else if (hiddenAt) {
        const awaySec = Math.round((Date.now() - hiddenAt) / 1000);
        hiddenAt = null;
        if (awaySec > 2) showLockWarning(`You stepped away for ${awaySec}s while Focus Lock was on. Staying on track?`);
    }
});
document.addEventListener('fullscreenchange', () => {
    if (focusLockEnabled && !document.fullscreenElement) {
        showLockWarning('You exited fullscreen focus mode. Re-lock to keep going, or confirm you want to leave.');
    }
});

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

    renderBoard();
    renderEstimateLog();
    updateDisplay();
}

function toggleMandatorySetting() {
    mandatoryNotes = $('mandatory-notes-toggle').checked;
    storageSet('focus_mandatory_notes', mandatoryNotes);
}

document.addEventListener('DOMContentLoaded', initApp);
