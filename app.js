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
let appSettings = storageGet('ff-app-settings', { appName: 'Focus & Flow Studio', darkMode: false, focusMode: false });

function applySettings() {
    const titleEl = $('app-title');
    if (titleEl) titleEl.textContent = appSettings.appName;
    document.body.classList.toggle('dark-mode', !!appSettings.darkMode);
    const fm = $('focus-mode-toggle');
    if (fm) fm.checked = !!appSettings.focusMode;
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
function toggleFocusMode() {
    appSettings.focusMode = !appSettings.focusMode;
    storageSet('ff-app-settings', appSettings);
    if (appSettings.focusMode) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
        if ('wakeLock' in navigator) {
            navigator.wakeLock.request('screen').then(lock => { window.wakeLockRef = lock; }).catch(() => {});
        }
    } else {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        if (window.wakeLockRef) { window.wakeLockRef.release(); window.wakeLockRef = null; }
    }
}

// ---------- Clocks & date ----------
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

    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (now.getDate() === lastDay) {
        const banner = $('monthly-alert');
        if (banner) banner.style.display = 'block';
        maybeAutoGenerateSummary();
    }
}

// ---------- Quote Banner ----------
const quotes = [
    "The secret of getting ahead is getting started. — Mark Twain",
    "Your work is a reflection of your attention. Protect it like gold. — Unknown",
    "In marketing, clarity is more persuasive than cleverness. — Unknown",
    "Writing is an act of discovery. You cannot know what you think until you write it. — Joan Didion",
    "For ADHD: Forget motivation. Build systems and rely on small wins. — Unknown",
    "Start messy, refine later. Perfection is the enemy of done. — Unknown",
    "Marketing is not about the product, but about the customer's transformation. — Seth Godin",
    "You cannot edit a blank page. Write the worst draft you can. — Unknown",
    "For ADHD: Consistency beats intensity. Five minutes today beats zero. — Unknown",
    "Rest is the reset button for your cognitive engine. Guard it fiercely. — Unknown",
    "Simplicity in marketing is the ultimate sophistication. One clear message wins. — Unknown",
    "The only way to do great work is to give it your full presence. — Unknown",
    "For ADHD: Break the task into the next five minutes. Nothing else exists. — Unknown",
    "Marketing is a conversation, not a broadcast. Listen twice as much. — Unknown",
    "Writing is rewriting. The magic lives in the revision. — Unknown",
    "The energy you bring to your work is contagious. Choose intention. — Unknown",
    "For ADHD: Progress is rarely linear. A step back is still valuable data. — Unknown",
    "To sell something, make the customer the hero of the story. — Unknown",
    "A writer's greatest tool is not talent, but a willingness to be imperfect. — Unknown",
    "Work expands to fill the time given. Set strict boundaries to protect your focus. — Parkinson's Law",
    "For ADHD: Externalize your thinking. Write it down, always. — Unknown",
    "Marketing without testing is just guessing. Experiment without attachment. — Unknown",
    "Writing is thinking on paper. Clear writing demands clear thinking. — Unknown",
    "The greatest gift to your work is your undivided presence. — Unknown",
    "For ADHD: Action precedes motivation. Start before you feel ready. — Unknown",
    "Build a brand built on trust, not just recognition. — Unknown",
    "Nobody sees your first drafts but you. Write freely. — Unknown",
    "Your most productive hour is the one protected from interruption. — Unknown",
    "For ADHD: Turn every large task into a micro-step. Eat the elephant bite by bite. — Unknown",
    "Marketing is about attention. Give value first, and attention follows. — Unknown",
    "Writing is a daily discipline, not a sudden burst of inspiration. — Unknown",
    "The quality of your work reflects the quality of your input. Read widely. — Unknown",
    "For ADHD: Guide your hyperfocus with intention. It is your superpower. — Unknown",
    "In marketing, speak to the pain before you offer the cure. — Unknown",
    "The first draft is just you telling yourself the story. — Terry Pratchett",
    "Work is about progress, not perfection. — Unknown",
    "For ADHD: Your brain is not broken. It is wired for curiosity. Use it. — Unknown",
    "Marketing is about saying 'yes' to the right people at the right time. — Unknown",
    "The words you leave out are as important as the ones you write. — Unknown",
    "Your work is the signature you leave on the world. Make it intentional. — Unknown"
    "Focus is the art of knowing what to ignore. — James Clear",
    "The secret of getting ahead is getting started. — Mark Twain",
    "It's not about having time; it's about making time. — Unknown",
    "Your mind is the most powerful tool you have. Use it wisely. — Unknown",
    "Clarity precedes mastery. — Robin Sharma",
    "The best way to predict the future is to create it. — Peter Drucker",
    "Success is the sum of small efforts repeated day in and day out. — Robert Collier",
    "You don't have to be extreme, just consistent. — Unknown",
    "The quality of your work is a reflection of the quality of your focus. — Unknown",
    "Do not let what you cannot do interfere with what you can do. — John Wooden",
    "The only way to do great work is to love what you do. — Steve Jobs",
    "The beginning is the most important part of the work. — Plato",
    "The secret of change is to focus all of your energy not on fighting the old, but on building the new. — Socrates",
    "Your energy is your currency. Spend it wisely. — Unknown",
    "The quieter you become, the more you can hear. — Ram Dass",
    "It does not matter how slowly you go as long as you do not stop. — Confucius",
    "The more you know yourself, the more you can focus. — Unknown",
    "The key is not to prioritize what's on your schedule, but to schedule your priorities. — Stephen Covey",
    "The best time to start was yesterday. The next best time is now. — Unknown",
    "Discipline is choosing between what you want now and what you want most. — Abraham Lincoln",
    "The only limit to our realization of tomorrow is our doubts of today. — FDR",
    "Success is not final, failure is not fatal: it is the courage to continue that counts. — Churchill",
    "The purpose of life is not to be happy. It is to be useful, to be honorable, to be compassionate. — Emerson",
    "The future depends on what you do today. — Mahatma Gandhi",
    "In the middle of difficulty lies opportunity. — Einstein",
    "It always seems impossible until it is done. — Nelson Mandela",
    "The journey of a thousand miles begins with one step. — Lao Tzu",
    "Your time is limited, so don't waste it living someone else's life. — Steve Jobs",
    "The only thing we have to fear is fear itself. — FDR",
    "I have not failed. I've just found 10,000 ways that won't work. — Edison",
    "The best revenge is massive success. — Frank Sinatra",
    "The only source of knowledge is experience. — Einstein",
    "The greatest glory in living lies not in never falling, but in rising every time we fall. — Mandela",
    "The future belongs to those who believe in the beauty of their dreams. — Eleanor Roosevelt",
    "The only way to achieve the impossible is to believe it is possible. — Charles Kingsleigh",
    "The mind is everything. What you think you become. — Buddha",
    "To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment. — Emerson",
    "Success is not how high you have climbed, but how you make a positive difference to the world. — Roy Bennett",
    "The only person you are destined to become is the person you decide to be. — Emerson",
    "The best way to find yourself is to lose yourself in the service of others. — Gandhi"
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

// ---------- Actual Break Button ----------
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
        breakTracker.interval = setInterval(() => {
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
        durationMinutes,
        reason,
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
    breakTracker.interval = setInterval(() => {
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

// ---------- Auto Flow: Internal Queue ----------
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

    openEntries.sort((a, b) => {
        const idxA = customQueueOrder.indexOf(a.task.id);
        const idxB = customQueueOrder.indexOf(b.task.id);
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
    if (!q) return;
    const tasks = getPrioritizedOpenTasks();
    if (tasks.length === 0) {
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
    if (appSettings.focusMode) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
        if ('wakeLock' in navigator) {
            navigator.wakeLock.request('screen').then(lock => { window.wakeLockRef = lock; }).catch(() => {});
        }
    }
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

    if (task.startedAtIso) {
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
    } else if (seg && seg.type === 'break') {
        // just skip
    }
    flowSegIndex++;
    beginFlowSegment();
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
        if (confirm("Clocked Out. Generate a Daily Check-Out Brief based on today's logs?")) {
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

// ---------- Task board & Schema ----------
let mandatoryNotes = storageGet('focus_mandatory_notes', false);
const defaultColumns = [
    { id: 1, title: 'Client A / Priority 1', tasks: [] },
    { id: 2, title: 'Client B / Priority 2', tasks: [] },
    { id: 3, title: 'Admin & Content', tasks: [] }
];

let boardData = storageGet('focus_board_data', defaultColumns);
let historyData = storageGet('focus_history_data', []);
let taskTimeMemory = storageGet('ff-task-time-memory', {});

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

function adjustTasksForMidnight() {
    const today = getTodayKey();
    let changed = false;
    boardData.forEach(col => {
        col.tasks.forEach(task => {
            if (!task.completed && task.dateAdded !== today) {
                task.dateAdded = today;
                changed = true;
            }
        });
    });
    if (changed) {
        saveBoardData();
        renderBoard();
    }
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
        if (t.parentId === undefined) t.parentId = null;
        if (t.subtasks === undefined) t.subtasks = [];
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
    if (!task.deadlineTime) return '';
    const ms = new Date(task.deadlineTime).getTime() - Date.now();
    const hrs = ms / 3600000;
    if (hrs < 0) return `<span class="deadline-badge red">Overdue</span>`;
    if (hrs <= 1) return `<span class="deadline-badge red">< 1h</span>`;
    if (hrs <= 3) return `<span class="deadline-badge amber">< 3h</span>`;
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
        if (_toggledDateGroups[key] !== undefined) isCollapsed = _toggledDateGroups[key];
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
    if (_toggledDateGroups[key] !== undefined) isCurrentlyCollapsed = _toggledDateGroups[key];
    _toggledDateGroups[key] = !isCurrentlyCollapsed;
    renderBoard();
}

// Autosuggest
function setupAutosuggest(inputElement) {
    if (!inputElement) return;
    inputElement.addEventListener('input', function(e) {
        clearTimeout(autosuggestTimeout);
        const val = this.value.trim();
        if (val.length < 2) return;
        const allTaskNames = [];
        boardData.forEach(col => col.tasks.forEach(t => allTaskNames.push(t.text)));
        const matches = allTaskNames.filter(name => name.toLowerCase().startsWith(val.toLowerCase()) && name !== val);
        if (matches.length > 0) {
            let datalist = document.getElementById('autosuggest-datalist');
            if (!datalist) {
                datalist = document.createElement('datalist');
                datalist.id = 'autosuggest-datalist';
                document.body.appendChild(datalist);
            }
            datalist.innerHTML = matches.map(m => `<option value="${escapeHTML(m)}">`).join('');
            inputElement.setAttribute('list', 'autosuggest-datalist');
        } else {
            inputElement.removeAttribute('list');
        }
    });
}
let autosuggestTimeout;

// ---------- Render Board ----------
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
        if (col.aiSuggestions) {
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
                <button onclick="generateColumnCheckIn(${colIndex})">Generate Daily Check-In (AI)</button>
            </div>

            ${suggestionsHtml}

            <ul class="task-list" ondragover="allowDrop(event)" ondrop="dropTask(event, ${colIndex})">
                ${groupTasksByDate(col.tasks).map((group) => `
                    <li class="date-group-header" onclick="toggleDateGroup('${group.dateKey}')">${group.dateLabel} ${group.isCollapsed ? '▸' : '▾'}</li>
                    ${group.isCollapsed ? '' : group.items.map(({ task, originalIndex: taskIndex }) => `
                        <li class="task-item ${task.completed ? 'completed' : ''} ${urgencyClassFor(task)} ${task.parentId ? 'subtask' : ''}" id="task-${colIndex}-${taskIndex}" draggable="${!task.completed}" ondragstart="dragStart(event, ${colIndex}, ${taskIndex})">
                            <div class="task-main-row">
                                <div class="task-left">
                                    <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="toggleTask(${colIndex}, ${taskIndex})">
                                    <input type="text" class="task-name-input" value="${escapeHTML(task.text)}" onchange="updateTaskText(${colIndex}, ${taskIndex}, this.value)">
                                    ${task.parentId ? `<span class="subtask-badge">↳</span>` : ''}
                                </div>
                                <div class="task-actions">
                                    ${task.deadlineTime ? 
                                        `<span class="deadline-label" onclick="promptDeadline(${colIndex}, ${taskIndex})">📅 ${new Date(task.deadlineTime).toLocaleString()}</span>` 
                                        : 
                                        `<button class="deadline-trigger-btn" onclick="promptDeadline(${colIndex}, ${taskIndex})">+ Deadline</button>`
                                    }
                                    ${getDeadlineBadge(task)}
                                    <input type="number" class="task-estimate-input" value="${task.estimateMinutes}" min="1" max="480" title="Estimated minutes" onchange="updateTaskEstimate(${colIndex}, ${taskIndex}, parseInt(this.value))">m
                                    <button class="track-btn ${task.isTracking ? 'tracking' : ''}" id="track-btn-${colIndex}-${taskIndex}" onclick="toggleTrack(${colIndex}, ${taskIndex})">${task.isTracking ? '⏸' : '▶'} ${formatMinSec(task.trackedSeconds)}</button>
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
        const input = $(`task-input-${colIndex}`);
        if (input) setupAutosuggest(input);
    });
    updateAdaptiveHacks();
    renderTimeCounter();
    renderInternalQueue();
    updateStreaksAndBadges();
}

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

function promptDeadline(ci, ti) {
    const task = boardData[ci].tasks[ti];
    const input = document.createElement('input');
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
    const btn = document.querySelector(`[onclick="promptDeadline(${ci}, ${ti})"]`);
    if (btn) btn.replaceWith(input);
    input.focus();
}

// ---------- Estimate helpers (memory + AI) ----------
function normalizeTaskName(text) {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
}
function getTaskEstimateFromMemory(taskText) {
    const key = normalizeTaskName(taskText);
    const entry = taskTimeMemory[key];
    return entry ? Math.round(entry.total / entry.count) : null;
}
async function getTaskEstimateFromAI(taskText, notes) {
    const apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) return null;
    const prompt = `Estimate realistic minutes for this task: "${taskText}" Notes: "${notes || 'none'}" Respond with ONLY a number.`;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (!res.ok) return null;
        const data = await res.json();
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const num = parseInt(raw.match(/\d+/)?.[0]);
        return num ? Math.max(1, num) : null;
    } catch(e) { return null; }
}
async function estimateTask(task) {
    let est = getTaskEstimateFromMemory(task.text);
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

// ---------- Add task (single) ----------
function addTask(ci) {
    const input = $(`task-input-${ci}`);
    const estInput = $(`task-est-${ci}`);
    const text = input.value.trim();
    if (!text) return;
    if (mandatoryNotes) alert("Mandatory Extra Info is enabled. Please add notes via Details.");

    const estimate = parseInt(estInput.value) || 15;
    const task = {
        id: 't_' + Math.random().toString(36).substr(2,9),
        text: text,
        estimateMinutes: estimate,
        trackedSeconds: 0, isTracking: false, notes: '',
        completed: false, completedAt: null, dateAdded: getTodayKey(),
        breaks: [], timeSegments: [], deadlineTime: null, googleLink: '',
        startedAtIso: null, completedAtIso: null,
        parentId: null, subtasks: []
    };
    boardData[ci].tasks.push(task);
    input.value = '';
    saveBoardData();
    renderBoard();

    if (estimate <= 15) {
        estimateTask(task);
    }
}

// ---------- Bulk paste ----------
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
            dateAdded: getTodayKey(), breaks: [], timeSegments: [], deadlineTime: null, googleLink: '',
            startedAtIso: null, completedAtIso: null,
            parentId: null, subtasks: []
        };
    });

    boardData[ci].tasks.push(...newTasks);
    textarea.value = '';
    saveBoardData();
    renderBoard();

    newTasks.forEach(task => {
        if (task.estimateMinutes <= 15) {
            estimateTask(task);
        }
    });
}

function updateTaskText(ci, ti, v) { boardData[ci].tasks[ti].text = v.trim() || 'Untitled task'; saveBoardData(); }
function updateTaskEstimate(ci, ti, v) {
    if(isNaN(v) || v<1) v=1;
    boardData[ci].tasks[ti].estimateMinutes = v;
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

// ---------- AI Functions (with em-dash cleanup) ----------
function cleanEmDashes(text) {
    return text.replace(/[\u2014\u2013]|--/g, ', ');
}
async function callGemini(promptText) {
    const apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) throw new Error('API key missing');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return cleanEmDashes(text);
}

async function suggestColumnTimesAI(ci) {
    const apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) { alert('Add Gemini API key in settings.'); return; }

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
        const raw = data.candidates[0].content.parts[0].text;
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const estimates = JSON.parse(cleaned);
        estimates.forEach(e => {
            const task = openTasks.find(t => t.id === e.id);
            if(task) task.stagedEstimate = Math.max(1, e.minutes);
        });
        saveBoardData();
        renderBoard();
    } catch(e) { alert('AI error: '+e.message); }
}

function applyTaskEstimate(ci, ti) {
    const task = boardData[ci].tasks[ti];
    if (task.stagedEstimate) { task.estimateMinutes = task.stagedEstimate; task.stagedEstimate = null; }
    saveBoardData(); renderBoard();
}
function dismissTaskEstimate(ci, ti) { boardData[ci].tasks[ti].stagedEstimate = null; saveBoardData(); renderBoard(); }
function applyAllEstimates(ci) {
    boardData[ci].tasks.forEach(t => { if(t.stagedEstimate) { t.estimateMinutes = t.stagedEstimate; t.stagedEstimate = null; } });
    saveBoardData(); renderBoard();
}
function dismissAllEstimates(ci) {
    boardData[ci].tasks.forEach(t => t.stagedEstimate = null);
    saveBoardData(); renderBoard();
}

async function optimizeColumnFlowAI(ci) {
    const apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) { alert('Add Gemini API key.'); return; }

    let openTasks = boardData[ci].tasks.filter(t=>!t.completed);
    if(openTasks.length===0) return;

    const prompt = `Review these tasks for a project. 
1. Reorder them into the most logical execution sequence.
2. If critical intermediate steps are missing based on standard project workflows, suggest them.
Return ONLY JSON format: {"orderedIds": ["id1", "id2"], "missingTasks": [{"task":"Name", "minutes": 15}]}
Tasks: ` + openTasks.map(t=>`[id:${t.id}] ${t.text}`).join('; ');

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        const cleaned = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
        const result = JSON.parse(cleaned);

        if(result.orderedIds && result.orderedIds.length === openTasks.length) {
            let sortedOpen = [];
            result.orderedIds.forEach(id => {
                const found = openTasks.find(t=>t.id === id);
                if(found) sortedOpen.push(found);
            });
            let comp = boardData[ci].tasks.filter(t=>t.completed);
            boardData[ci].tasks = [...sortedOpen, ...comp];
        }

        if(result.missingTasks && result.missingTasks.length > 0) {
            boardData[ci].aiSuggestions = result.missingTasks;
        }

        saveBoardData(); renderBoard();
    } catch(e) { alert('AI optimization error: '+e.message); }
}

function acceptAISuggestion(ci, sIdx) {
    const s = boardData[ci].aiSuggestions[sIdx];
    boardData[ci].tasks.unshift({
        id: 't_' + Math.random().toString(36).substr(2,9),
        text: s.task, estimateMinutes: s.minutes, trackedSeconds: 0,
        isTracking: false, notes: 'Suggested by AI', completed: false, completedAt: null,
        dateAdded: getTodayKey(), breaks: [], timeSegments: [], deadlineTime: null, googleLink: '',
        startedAtIso: null, completedAtIso: null,
        parentId: null, subtasks: []
    });
    boardData[ci].aiSuggestions.splice(sIdx, 1);
    if(boardData[ci].aiSuggestions.length === 0) delete boardData[ci].aiSuggestions;
    saveBoardData(); renderBoard();
}
function dismissAISuggestion(ci, sIdx) {
    boardData[ci].aiSuggestions.splice(sIdx, 1);
    if(boardData[ci].aiSuggestions.length === 0) delete boardData[ci].aiSuggestions;
    saveBoardData(); renderBoard();
}

async function generateColumnCheckIn(ci) {
    const summaryBox = $('summary-content');
    summaryBox.textContent = `Generating daily check-in for ${boardData[ci].title}...`;
    let openTasks = boardData[ci].tasks.filter(t => !t.completed).map(t => t.text);
    if(openTasks.length === 0) {
        summaryBox.textContent = `No open tasks for ${boardData[ci].title} today.`;
        return;
    }
    const prompt = `Act as a world-class formal assistant. Write a short, warm, encouraging daily check-in brief summarizing what is on the agenda today for the project/client "${boardData[ci].title}" based on this task list: ${JSON.stringify(openTasks)}. Use formal language. Do not use em-dashes.`;
    try {
        const result = await callGemini(prompt);
        summaryBox.textContent = result;
    } catch(e) {
        summaryBox.textContent = 'Error: ' + e.message;
    }
}

async function generateDailyCheckOut() {
    const summaryBox = $('summary-content');
    summaryBox.textContent = 'Generating check-out brief...';
    const todayKey = getTodayKey();
    const todaysHistory = historyData.filter(h => dateKeyFromISO(h.completedAt) === todayKey);
    const prompt = `Act as a world-class formal assistant. Write a short, warm, professional daily check-out brief summarizing accomplishments today based on this data: ${JSON.stringify(todaysHistory)}. Use formal language. End on an encouraging note for tomorrow. Do not use em-dashes.`;
    try {
        const result = await callGemini(prompt);
        summaryBox.textContent = result;
    } catch(e) {
        summaryBox.textContent = 'Error: ' + e.message;
    }
}

async function generateAISummary(silent) {
    const summaryBox = $('summary-content');
    if (!silent) summaryBox.textContent = 'Generating monthly report...';
    const thisMonthData = historyData.filter(h => new Date(h.completedAt).getMonth() === new Date().getMonth());
    const prompt = `Write a polished, professional monthly client report grouping accomplishments by client based on: ${JSON.stringify(thisMonthData)}. Do not use em-dashes.`;
    try {
        const result = await callGemini(prompt);
        if (!silent) summaryBox.textContent = result;
    } catch(e) {
        if (!silent) summaryBox.textContent = 'Error: ' + e.message;
    }
}
function maybeAutoGenerateSummary() {
    const now = new Date();
    const marker = `${now.getFullYear()}-${now.getMonth()}`;
    if (storageGet('ff-last-summary-month', null) === marker) return;
    const apiKey = storageGet('gemini_api_key', null);
    if (apiKey) generateAISummary(true);
}

// ---------- Task Details Modal ----------
let openDetailsRef = null;
function openDetailsModal(ci, ti) {
    openDetailsRef = { ci, ti };
    const task = boardData[ci].tasks[ti];
    $('details-task-name').textContent = task.text;
    $('details-notes-textarea').value = task.notes || '';
    $('details-link-input').value = task.googleLink || '';
    $('details-deadline-input').value = task.deadlineTime || '';
    $('details-estimate-label').textContent = `Est: ${task.estimateMinutes} min`;
    $('details-overlay').style.display = 'flex';
}
function closeDetailsModal() {
    if (openDetailsRef) {
        const { ci, ti } = openDetailsRef;
        const task = boardData[ci].tasks[ti];
        task.notes = $('details-notes-textarea').value;
        task.googleLink = $('details-link-input').value;
        task.deadlineTime = $('details-deadline-input').value || null;
        saveBoardData();
        renderBoard();
    }
    openDetailsRef = null;
    $('details-overlay').style.display = 'none';
}
async function suggestTimeFromDetails() {
    if (!openDetailsRef) return;
    const { ci, ti } = openDetailsRef;
    const task = boardData[ci].tasks[ti];
    const apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) { alert('Add Gemini API key.'); return; }
    const prompt = `Estimate realistic minutes for this task: "${task.text}" Notes: "${task.notes || 'none'}" Respond with ONLY a number.`;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        const raw = data.candidates[0].content.parts[0].text;
        const num = parseInt(raw.match(/\d+/)[0]);
        if (num) { task.estimateMinutes = Math.max(1, num); saveBoardData(); renderBoard(); $('details-estimate-label').textContent = `Est: ${task.estimateMinutes} min`; }
    } catch(e) { alert('AI error'); }
}

async function breakdownTask() {
    if (!openDetailsRef) return;
    const { ci, ti } = openDetailsRef;
    const task = boardData[ci].tasks[ti];
    const apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) { alert('Add Gemini API key.'); return; }
    const prompt = `Break this task into 2-5 subtasks with time estimates and brief notes. Return JSON array: [{"text":"subtask name","minutes":15,"notes":"optional"}]. Task: "${task.text}" Notes: "${task.notes || 'none'}"`;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        const raw = data.candidates[0].content.parts[0].text;
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const subtasks = JSON.parse(cleaned);
        subtasks.forEach(st => {
            boardData[ci].tasks.push({
                id: 't_' + Math.random().toString(36).substr(2,9),
                text: st.text,
                estimateMinutes: st.minutes || 15,
                trackedSeconds: 0, isTracking: false,
                notes: st.notes || 'Subtasks of "' + task.text + '"',
                completed: false, completedAt: null, dateAdded: getTodayKey(),
                breaks: [], timeSegments: [], deadlineTime: null, googleLink: '',
                startedAtIso: null, completedAtIso: null,
                parentId: task.id, subtasks: []
            });
        });
        saveBoardData();
        renderBoard();
        closeDetailsModal();
        alert('Subtask(s) created in the same column.');
    } catch(e) { alert('AI breakdown error: '+e.message); }
}

// ---------- Streaks & Badges ----------
function updateStreaksAndBadges() {
    const streakEl = document.getElementById('streak-display');
    const badgesEl = document.getElementById('badges-display');
    if (!streakEl || !badgesEl) return;

    let streak = 0;
    const today = new Date();
    let checkDate = new Date(today);
    const completionDays = new Set();
    historyData.forEach(h => {
        const d = new Date(h.completedAt);
        const key = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
        completionDays.add(key);
    });
    while (true) {
        const year = checkDate.getFullYear();
        const month = checkDate.getMonth() + 1;
        const day = checkDate.getDate();
        const key = `${year}-${month}-${day}`;
        const dow = checkDate.getDay();
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

    const totalCompleted = historyData.length;
    let badges = [];
    if (totalCompleted >= 1) badges.push('🌟 First Task');
    if (totalCompleted >= 10) badges.push('🚀 10 Tasks');
    if (totalCompleted >= 50) badges.push('💪 50 Tasks');
    if (totalCompleted >= 100) badges.push('🏆 100 Tasks');
    const withBoth = historyData.filter(h => h.estimateMinutes && h.actualMinutes);
    if (withBoth.length >= 10) {
        const totalDiff = withBoth.reduce((a, h) => a + (h.actualMinutes - h.estimateMinutes), 0);
        const avgDiff = totalDiff / withBoth.length;
        if (Math.abs(avgDiff) < 2) badges.push('🎯 Accuracy Pro');
    }
    if (flowBlocksCompleted >= 5) badges.push('⚡ Flow Master');
    if (streak >= 7) badges.push('🔥 Streak 7+');
    if (streak >= 30) badges.push('🌟 Streak 30+');

    streakEl.textContent = `🔥 Streak: ${streak} day${streak!==1?'s':''}`;
    badgesEl.textContent = `🏆 Badges: ${badges.length ? badges.join(' ') : 'none'}`;
}

// ---------- Ambient Sound ----------
let ambientContext = null;
let ambientGain = null;
let ambientSource = null;
let ambientType = 'off';

function createAmbientSound(type) {
    if (ambientContext) {
        ambientContext.close();
        ambientContext = null;
    }
    if (type === 'off' || !type) return;
    ambientContext = new (window.AudioContext || window.webkitAudioContext)();
    ambientGain = ambientContext.createGain();
    ambientGain.gain.setValueAtTime(0.2, ambientContext.currentTime);
    ambientGain.connect(ambientContext.destination);

    let bufferSize = 2 * ambientContext.sampleRate;
    let buffer = ambientContext.createBuffer(1, bufferSize, ambientContext.sampleRate);
    let data = buffer.getChannelData(0);
    if (type === 'rain') {
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }
    } else if (type === 'coffee') {
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.2;
        }
    } else if (type === 'waves') {
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.sin(i * 0.05) * 0.3 + (Math.random() * 2 - 1) * 0.1;
        }
    } else if (type === 'forest') {
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.15;
        }
    }
    ambientSource = ambientContext.createBufferSource();
    ambientSource.buffer = buffer;
    ambientSource.loop = true;
    ambientSource.connect(ambientGain);
    ambientSource.start();
}

function toggleAmbientSound() {
    const sel = document.getElementById('ambient-sound-select');
    if (!sel) return;
    const type = sel.value;
    if (type === 'off') {
        if (ambientContext) ambientContext.close();
        ambientContext = null;
        return;
    }
    createAmbientSound(type);
}
function changeAmbientSound(value) {
    ambientType = value;
    if (value === 'off') {
        if (ambientContext) ambientContext.close();
        ambientContext = null;
    } else {
        createAmbientSound(value);
    }
    storageSet('ff-ambient-sound', value);
}

// ---------- Keyboard Shortcuts ----------
document.addEventListener('keydown', function(e) {
    if (e.altKey && e.shiftKey) {
        switch(e.key.toLowerCase()) {
            case 's': toggleTimer(); e.preventDefault(); break;
            case 'r': resetTimer(); e.preventDefault(); break;
            case 'f': startFlow(); e.preventDefault(); break;
            case 'a': {
                const firstInput = document.querySelector('.task-input');
                if (firstInput) firstInput.focus();
                e.preventDefault();
                break;
            }
            case 'c': toggleClock(); e.preventDefault(); break;
            case 'b': toggleBreak(); e.preventDefault(); break;
            case 'q': toggleDarkMode(); e.preventDefault(); break;
        }
    }
});

// ---------- Start AI Flow (robust) ----------
async function startAIFlow() {
    const apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) {
        alert('Please add your Gemini API key in the AI settings (gear icon or footer).');
        return;
    }

    // Gather all open tasks
    const openTasks = [];
    boardData.forEach((col) => {
        col.tasks.forEach((task) => {
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

    // First, estimate any tasks that have a default or very low estimate
    for (let t of openTasks) {
        if (t.estimate <= 5) {
            const found = boardData.flatMap(col => col.tasks).find(task => task.id === t.id);
            if (found) await estimateTask(found);
        }
    }

    // Re-fresh open tasks with updated estimates
    const updatedOpen = [];
    boardData.forEach(col => {
        col.tasks.forEach(task => {
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

    const prompt = `You are a productivity expert. Given these tasks, suggest the most efficient order to work on them. Consider deadlines (if any), task type, logical dependencies, and typical energy patterns. Return ONLY a JSON array of task IDs in the order they should be done. Tasks: ${JSON.stringify(updatedOpen)}`;

    try {
        const responseText = await callGemini(prompt);
        // Clean and parse
        const cleaned = responseText.replace(/```json|```/g, '').trim();
        let orderedIds = JSON.parse(cleaned);

        // If the response is an object with an array property, extract it
        if (typeof orderedIds === 'object' && !Array.isArray(orderedIds)) {
            const keys = Object.keys(orderedIds);
            if (keys.length === 1 && Array.isArray(orderedIds[keys[0]])) {
                orderedIds = orderedIds[keys[0]];
            } else {
                throw new Error('AI response is not a JSON array.');
            }
        }

        if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
            throw new Error('AI returned an empty or invalid order.');
        }

        // Update the custom queue order
        customQueueOrder = orderedIds;
        storageSet('ff-custom-queue', customQueueOrder);

        // Start the flow
        startFlow();
    } catch (e) {
        alert('AI Flow error: ' + e.message);
        console.error('AI Flow error details:', e);
    }
}

// ---------- Re-estimate all tasks (AI) ----------
async function reEstimateAllTasks() {
    const apiKey = storageGet('gemini_api_key', null);
    if (!apiKey) { alert('Add Gemini API key.'); return; }
    const allOpenTasks = [];
    boardData.forEach(col => col.tasks.forEach(t => { if (!t.completed) allOpenTasks.push(t); }));
    if (allOpenTasks.length === 0) return;
    if (!confirm(`Re-estimate ${allOpenTasks.length} task(s)?`)) return;
    const prompt = `Estimate realistic minutes for these tasks as JSON array: [{"task":"<task text>","minutes":<num>}]. Tasks: ` + allOpenTasks.map(t=>`"${t.text}"`).join('; ');
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        const raw = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
        const estimates = JSON.parse(raw);
        estimates.forEach(e => {
            const task = allOpenTasks.find(t => t.text === e.task);
            if (task) task.estimateMinutes = Math.max(1, e.minutes);
        });
        saveBoardData(); renderBoard();
    } catch(e) { alert('AI error'); }
}

// ---------- Other render functions ----------
function renderEstimateLog() {
    const logBox = $('estimate-log');
    if (!logBox) return;
    const recent = historyData.slice(0, 40);
    if (recent.length === 0) { logBox.innerHTML = '<p style="font-size:0.85rem;color:#888;">Complete a tracked task to start your log.</p>'; return; }
    const groups = {};
    recent.forEach((h) => { const key = dateKeyFromISO(h.completedAt); if (!groups[key]) groups[key] = []; groups[key].push(h); });
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

function renderDailyRecap() {
    const box = $('daily-recap-box');
    if (!box) return;
    const todayKey = getTodayKey();
    const todayDateStr = new Date().toLocaleDateString();
    const todaysHistory = historyData.filter((h) => dateKeyFromISO(h.completedAt) === todayKey);
    const totalActual = todaysHistory.reduce((a, h) => a + (h.actualMinutes || 0), 0);
    let openFromToday = 0;
    boardData.forEach((col) => col.tasks.forEach((t) => { if (t.dateAdded === todayKey && !t.completed) openFromToday++; }));
    let clockedMinutesToday = clockLog.filter((c) => c.date === todayDateStr).reduce((a, c) => a + c.durationMinutes, 0);
    if (clockState.clockedIn) clockedMinutesToday += Math.max(0, Math.round((Date.now() - clockState.startedAt) / 60000));
    let breakMinutesToday = todaysHistory.reduce((a, h) => a + (h.breakMinutes || 0), 0);
    const breakLog = storageGet('ff-break-log', []);
    const todayBreaks = breakLog.filter(b => new Date(b.date).toLocaleDateString() === todayDateStr);
    breakMinutesToday += todayBreaks.reduce((a, b) => a + b.durationMinutes, 0);

    box.innerHTML = `<ul style="list-style:none;padding:0;margin:0;font-size:0.85rem;line-height:1.7;">
        <li><strong>${todaysHistory.length}</strong> task(s) finished</li>
        <li><strong>${openFromToday}</strong> still open</li>
        <li><strong>${totalActual} min</strong> logged work</li>
        <li><strong>${breakMinutesToday} min</strong> breaks/away</li>
        <li><strong>${clockedMinutesToday} min</strong> clocked in</li>
    </ul>`;
}

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
            if (i < openTasks.length - 1) colTotalWithBreaks += standardBreakMinutes + bonusBreakMinutes;
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

function getSelectedTimezone() { return storageGet('ff-timezone', Intl.DateTimeFormat().resolvedOptions().timeZone); }
function updateTimezone(tz) { storageSet('ff-timezone', tz); renderTimeCounter(); }
function populateTimezoneSelect() {
    const sel = $('timezone-select');
    if (!sel) return;
    let zones; try { zones = Intl.supportedValuesOf('timeZone'); } catch(e){ zones = ['UTC','Africa/Lagos','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Dubai','Asia/Kolkata','Asia/Shanghai','Australia/Sydney']; }
    const current = getSelectedTimezone();
    sel.innerHTML = zones.map((z) => `<option value="${z}" ${z === current ? 'selected' : ''}>${z}</option>`).join('');
}
function formatTimeInZone(date, tz) { return date.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' }); }
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
        if (c.taskCount === 0) { rows += `<div class="log-item"><span>${escapeHTML(c.title)}</span><span style="color:#999;">No open tasks</span></div>`; return; }
        cursor = new Date(cursor.getTime() + c.totalWithBreaksMinutes * 60000);
        rows += `<div class="log-item"><span>${escapeHTML(c.title)} (${c.workMinutes} min work)</span><span class="log-variance under">Done by ${formatTimeInZone(cursor, tz)}</span></div>`;
        if (idx < perColumn.length - 1 && c.taskCount > 0) cursor = new Date(cursor.getTime() + breakMin * 60000);
    });
    const grandDone = new Date(now.getTime() + grandTotalMinutes * 60000);
    box.innerHTML = `<ul class="log-list">${rows}</ul>
        <p style="margin-top:8px;font-size:0.85rem;"><strong>${grandWorkMinutes} min</strong> total work.</p>
        <p style="font-weight:700;">All done by ${formatTimeInZone(grandDone, tz)} (${tz})</p>`;
}

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

function updateAdaptiveHacks() {
    const box = $('adaptive-hacks');
    if (!box) return;
    let totalEstimate = 0, openTasks = 0;
    boardData.forEach(col => col.tasks.forEach(t => { if (!t.completed) { totalEstimate += (t.estimateMinutes || 0); openTasks++; } }));
    const workMin = Math.round((workDuration || 1500) / 60);
    const sessions = openTasks > 0 ? Math.ceil(totalEstimate / workMin) : 0;
    box.innerHTML = `<ul>
        <li><strong>Active Load:</strong> ${totalEstimate} min across ${openTasks} task(s)${sessions ? ` — roughly ${sessions} focus session(s).` : '.'}</li>
        <li><strong>Timer Flash:</strong> 3 min left warning.</li>
    </ul>`;
}

// ---------- Export/Import ----------
function exportAllDataJSON() {
    const data = {
        appSettings, boardData, historyData, clockLog, clockState,
        flowBlocksCompleted, taskTimeMemory, customQueueOrder, headerClockZones
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `focus-flow-backup-${getTodayKey()}.json`; a.click();
}
function exportHistoryCSV() {
    const rows = [['Date','Client','Task','Estimate (min)','Actual (min)','Breaks (min)','Notes']];
    historyData.forEach(h => rows.push([dateKeyFromISO(h.completedAt), h.client, h.task, h.estimateMinutes, h.actualMinutes, (h.breakMinutes||0), (h.notes||'').replace(/"/g,'""')]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `focus-flow-history-${getTodayKey()}.csv`; a.click();
}
function importAllDataJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.boardData) { boardData = data.boardData; storageSet('focus_board_data', boardData); }
            if (data.historyData) { historyData = data.historyData; storageSet('focus_history_data', historyData); }
            if (data.clockLog) { clockLog = data.clockLog; storageSet('ff-clock-log', clockLog); }
            if (data.clockState) { clockState = data.clockState; storageSet('ff-clock-state', clockState); }
            if (data.customQueueOrder) { customQueueOrder = data.customQueueOrder; storageSet('ff-custom-queue', customQueueOrder); }
            if (data.headerClockZones) { headerClockZones = data.headerClockZones; storageSet('ff-header-clock-zones', headerClockZones); populateHeaderClockSelects(); }
            if (data.flowBlocksCompleted !== undefined) { flowBlocksCompleted = data.flowBlocksCompleted; localStorage.setItem('focus_daily_sessions', flowBlocksCompleted); }
            if (data.appSettings) { appSettings = data.appSettings; storageSet('ff-app-settings', appSettings); applySettings(); }
            if (data.taskTimeMemory) { taskTimeMemory = data.taskTimeMemory; storageSet('ff-task-time-memory', taskTimeMemory); }
            renderBoard(); renderDailyRecap(); renderEstimateLog(); renderClockCard();
            alert('Import successful!');
        } catch(err) { alert('Invalid JSON: '+err.message); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ---------- Init ----------
function initApp() {
    applySettings();
    updateClocks();
    setInterval(updateClocks, 1000);
    setInterval(tickTracking, 1000);
    setInterval(() => {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            adjustTasksForMidnight();
        }
    }, 60000);

    $('mandatory-notes-toggle').checked = mandatoryNotes;
    const key = storageGet('gemini_api_key', '');
    if ($('gemini-api-key')) $('gemini-api-key').value = key;
    if ($('gemini-api-key-modal')) $('gemini-api-key-modal').value = key;
    const fm = $('focus-mode-toggle');
    if (fm) fm.checked = !!appSettings.focusMode;

    setFlowControlsVisible(false);
    renderClockCard();
    populateHeaderClockSelects();
    populateTimezoneSelect();
    renderBoard();
    renderEstimateLog();
    updateDisplay();
    startQuoteRotation();

    const soundSel = $('ambient-sound-select');
    if (soundSel) {
        const saved = storageGet('ff-ambient-sound', 'off');
        soundSel.value = saved;
        if (saved !== 'off') createAmbientSound(saved);
    }
    renderDailyRecap();
}

function toggleMandatorySetting() { mandatoryNotes = $('mandatory-notes-toggle').checked; storageSet('focus_mandatory_notes', mandatoryNotes); }
function saveApiKey(key) { storageSet('gemini_api_key', key); }
function handleKeyPress(e, ci) { if (e.key === 'Enter') addTask(ci); }
function escapeHTML(str) { return String(str).replace(/[&<>'"]/g, tag => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[tag]||tag)); }

// ---------- Task callbacks ----------
function toggleTrack(ci, ti) {
    boardData[ci].tasks[ti].isTracking = !boardData[ci].tasks[ti].isTracking;
    if (boardData[ci].tasks[ti].isTracking && !boardData[ci].tasks[ti].startedAtIso) {
        boardData[ci].tasks[ti].startedAtIso = new Date().toISOString();
    }
    saveBoardData(); renderBoard();
}

let pendingCompletion = null;
function toggleTask(ci, ti) {
    const task = boardData[ci].tasks[ti];
    if (task.completed) {
        task.completed = false; task.completedAt = null; task.completedAtIso = null;
        if (task._historyId) {
            const idx = historyData.findIndex((h) => h._id === task._historyId);
            if (idx !== -1) historyData.splice(idx, 1);
            task._historyId = null;
        }
        saveBoardData(); renderBoard(); renderEstimateLog();
        return;
    }
    if (mandatoryNotes && (!task.notes || task.notes.trim() === '')) {
        alert("Mandatory Extra Info is ON! Add notes via Details first.");
        renderBoard(); return;
    }
    if (task.trackedSeconds === 0) {
        pendingCompletion = { colIndex: ci, taskIndex: ti };
        $('completion-task-name').textContent = task.text;
        $('completion-actual-input').value = task.estimateMinutes;
        $('completion-overlay').style.display = 'flex';
        return;
    }
    finalizeTaskCompletion(ci, ti, task.trackedSeconds);
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
function cancelCompletion() { pendingCompletion = null; $('completion-overlay').style.display = 'none'; renderBoard(); }
function finalizeTaskCompletion(ci, ti, actualSeconds) {
    const task = boardData[ci].tasks[ti];
    task.completed = true; task.isTracking = false; task.trackedSeconds = actualSeconds;
    task.completedAt = Date.now(); task.completedAtIso = new Date().toISOString();
    if(task.startedAtIso) task.timeSegments.push({start: task.startedAtIso, end: task.completedAtIso});

    const historyId = `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    task._historyId = historyId;
    const totalBreaks = task.breaks.reduce((acc, b) => acc + (b.durationMinutes || 0), 0);
    let breaksStr = task.breaks.length ? `[Breaks: ${task.breaks.map(b=>b.reason).join(', ')}] ` : '';
    historyData.unshift({
        _id: historyId, client: boardData[ci].title, task: task.text,
        estimateMinutes: task.estimateMinutes, actualMinutes: Math.round(actualSeconds / 60),
        breakMinutes: totalBreaks,
        notes: breaksStr + (task.notes || 'No notes'), completedAt: task.completedAtIso
    });
    if (historyData.length > 500) historyData.pop();
    rememberTaskTime(task.text, Math.round(actualSeconds / 60));
    saveBoardData(); renderBoard(); renderEstimateLog(); renderDailyRecap(); renderInternalQueue();
}
function deleteTask(ci, ti) { boardData[ci].tasks.splice(ti, 1); saveBoardData(); renderBoard(); renderInternalQueue(); }

function rememberTaskTime(text, minutes) {
    const key = normalizeTaskName(text);
    if (!key) return;
    const entry = taskTimeMemory[key] || { total: 0, count: 0 };
    entry.total += minutes;
    entry.count += 1;
    taskTimeMemory[key] = entry;
    storageSet('ff-task-time-memory', taskTimeMemory);
}

document.addEventListener('DOMContentLoaded', initApp);