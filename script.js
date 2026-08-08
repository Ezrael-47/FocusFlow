// ============================================================
//  FocusFlow – Full JavaScript Logic
// ============================================================

(function() {
    'use strict';

    // ---- DOM Elements ----
    const timerDisplay = document.getElementById('timerDisplay');
    const timerModeBadge = document.getElementById('timerModeBadge');
    const timerStatusLabel = document.getElementById('timerStatusLabel');
    const timerStartBtn = document.getElementById('timerStartBtn');
    const timerPauseBtn = document.getElementById('timerPauseBtn');
    const timerResetBtn = document.getElementById('timerResetBtn');
    const workDurationInput = document.getElementById('workDuration');
    const breakDurationInput = document.getElementById('breakDuration');

    const taskInput = document.getElementById('taskInput');
    const addTaskBtn = document.getElementById('addTaskBtn');
    const taskList = document.getElementById('taskList');
    const taskCountBadge = document.getElementById('taskCountBadge');
    const taskStats = document.getElementById('taskStats');

    const notesArea = document.getElementById('notesArea');
    const noteStatus = document.getElementById('noteStatus');

    const statPomodoros = document.getElementById('statPomodoros');
    const statTasksDone = document.getElementById('statTasksDone');
    const statsChartCanvas = document.getElementById('statsChart');

    const ambientBtns = document.querySelectorAll('.ambient-btn');
    const ambientStatus = document.getElementById('ambientStatus');

    const darkModeToggle = document.getElementById('darkModeToggle');
    const resetDataBtn = document.getElementById('resetDataBtn');

    // ---- State ----
    let timerState = {
        workDuration: 25,
        breakDuration: 5,
        timeLeft: 25 * 60,
        mode: 'work', // 'work' | 'break'
        isRunning: false,
        intervalId: null,
        completedPomodoros: 0,
    };

    let tasks = [];
    let notes = '';

    // ---- Chart instance ----
    let statsChart = null;

    // ---- Audio Context & Nodes ----
    let audioCtx = null;
    let noiseBuffer = null;
    let currentSound = 'off';
    let gainNode = null;
    let filterNode = null;
    let noiseSource = null;
    let isAudioPlaying = false;

    // ============================================================
    //  LOCAL STORAGE
    // ============================================================
    function loadFromStorage() {
        try {
            const savedTasks = localStorage.getItem('focus_tasks');
            if (savedTasks) tasks = JSON.parse(savedTasks);

            const savedNotes = localStorage.getItem('focus_notes');
            if (savedNotes !== null) notes = savedNotes;

            const savedTimer = localStorage.getItem('focus_timer');
            if (savedTimer) {
                const t = JSON.parse(savedTimer);
                timerState.workDuration = t.workDuration || 25;
                timerState.breakDuration = t.breakDuration || 5;
                timerState.completedPomodoros = t.completedPomodoros || 0;
                timerState.timeLeft = timerState.workDuration * 60;
                timerState.mode = 'work';
                timerState.isRunning = false;
                if (timerState.intervalId) {
                    clearInterval(timerState.intervalId);
                    timerState.intervalId = null;
                }
                workDurationInput.value = timerState.workDuration;
                breakDurationInput.value = timerState.breakDuration;
            }
        } catch (e) { console.warn('Storage load error', e); }
    }

    function saveToStorage() {
        try {
            localStorage.setItem('focus_tasks', JSON.stringify(tasks));
            localStorage.setItem('focus_notes', notes);
            localStorage.setItem('focus_timer', JSON.stringify({
                workDuration: timerState.workDuration,
                breakDuration: timerState.breakDuration,
                completedPomodoros: timerState.completedPomodoros,
            }));
            updateDailyStats();
        } catch (e) { console.warn('Storage save error', e); }
    }

    // ---- Daily Stats ----
    function getTodayKey() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function updateDailyStats() {
        const key = 'focus_daily_' + getTodayKey();
        let daily = JSON.parse(localStorage.getItem(key) || 'null');
        if (!daily) {
            daily = { date: getTodayKey(), pomodoros: 0, tasksDone: 0 };
        }
        daily.pomodoros = timerState.completedPomodoros;
        const todayTasks = tasks.filter(t => t.done);
        daily.tasksDone = todayTasks.length;
        localStorage.setItem(key, JSON.stringify(daily));
        updateStatsUI();
    }

    function getDailyStats() {
        const key = 'focus_daily_' + getTodayKey();
        const data = JSON.parse(localStorage.getItem(key) || 'null');
        if (data) return data;
        return { date: getTodayKey(), pomodoros: 0, tasksDone: 0 };
    }

    // ============================================================
    //  TIMER
    // ============================================================
    function updateTimerDisplay() {
        const mins = Math.floor(timerState.timeLeft / 60);
        const secs = timerState.timeLeft % 60;
        timerDisplay.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        timerModeBadge.textContent = timerState.mode === 'work' ? 'Focus' : 'Break';
        timerStatusLabel.textContent = timerState.isRunning ?
            (timerState.mode === 'work' ? '⚡ Focusing...' : '☕ On break') :
            '⏸ Paused';
    }

    function timerTick() {
        if (timerState.timeLeft <= 0) {
            if (timerState.mode === 'work') {
                timerState.completedPomodoros++;
                timerState.mode = 'break';
                timerState.timeLeft = timerState.breakDuration * 60;
                if (Notification.permission === 'granted') {
                    new Notification('⏰ Break time!', { body: 'Focus session complete, take a break.' });
                }
            } else {
                timerState.mode = 'work';
                timerState.timeLeft = timerState.workDuration * 60;
                if (Notification.permission === 'granted') {
                    new Notification('🔁 Focus time!', { body: 'Break is over, get back to work.' });
                }
            }
            updateTimerDisplay();
            saveToStorage();
            updateStatsUI();
            return;
        }
        timerState.timeLeft--;
        updateTimerDisplay();
    }

    function startTimer() {
        if (timerState.isRunning) return;
        if (timerState.timeLeft <= 0) {
            timerState.timeLeft = timerState.workDuration * 60;
            timerState.mode = 'work';
        }
        timerState.isRunning = true;
        timerState.intervalId = setInterval(timerTick, 1000);
        updateTimerDisplay();
        if (Notification.permission === 'default') Notification.requestPermission();
    }

    function pauseTimer() {
        if (!timerState.isRunning) return;
        timerState.isRunning = false;
        clearInterval(timerState.intervalId);
        timerState.intervalId = null;
        updateTimerDisplay();
    }

    function resetTimer() {
        pauseTimer();
        timerState.mode = 'work';
        timerState.timeLeft = timerState.workDuration * 60;
        timerState.isRunning = false;
        updateTimerDisplay();
        saveToStorage();
    }

    function applyTimerSettings() {
        let w = parseInt(workDurationInput.value) || 25;
        let b = parseInt(breakDurationInput.value) || 5;
        w = Math.max(1, Math.min(90, w));
        b = Math.max(1, Math.min(30, b));
        workDurationInput.value = w;
        breakDurationInput.value = b;
        timerState.workDuration = w;
        timerState.breakDuration = b;
        if (!timerState.isRunning && timerState.mode === 'work') {
            timerState.timeLeft = w * 60;
        } else if (!timerState.isRunning && timerState.mode === 'break') {
            timerState.timeLeft = b * 60;
        }
        updateTimerDisplay();
        saveToStorage();
    }

    // ============================================================
    //  TASKS (with drag & drop)
    // ============================================================
    function renderTasks() {
        taskList.innerHTML = '';
        tasks.forEach((task, index) => {
            const li = document.createElement('li');
            li.draggable = true;
            li.dataset.index = index;
            if (task.done) li.classList.add('done');

            li.innerHTML = `
                <span class="drag-handle"><i class="fas fa-grip-lines"></i></span>
                <span class="task-text">${escapeHtml(task.text)}</span>
                <div class="task-actions">
                    <button class="done-btn" title="Toggle status"><i class="fas ${task.done ? 'fa-undo' : 'fa-check'}"></i></button>
                    <button class="delete-btn" title="Delete"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;

            li.querySelector('.done-btn').addEventListener('click', () => toggleTaskDone(index));
            li.querySelector('.delete-btn').addEventListener('click', () => deleteTask(index));

            li.addEventListener('dragstart', handleDragStart);
            li.addEventListener('dragend', handleDragEnd);
            li.addEventListener('dragover', handleDragOver);
            li.addEventListener('drop', handleDrop);

            taskList.appendChild(li);
        });
        updateTaskStats();
        saveToStorage();
    }

    let dragIndex = null;

    function handleDragStart(e) {
        dragIndex = parseInt(this.dataset.index);
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragIndex);
    }

    function handleDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.task-list li').forEach(el => el.classList.remove('drag-over'));
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.task-list li').forEach(el => el.classList.remove('drag-over'));
        this.classList.add('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const toIndex = parseInt(this.dataset.index);
        if (fromIndex === toIndex || isNaN(fromIndex) || isNaN(toIndex)) return;
        const [moved] = tasks.splice(fromIndex, 1);
        tasks.splice(toIndex, 0, moved);
        renderTasks();
    }

    function addTask(text) {
        text = text.trim();
        if (!text) return;
        tasks.push({ text, done: false });
        taskInput.value = '';
        renderTasks();
        taskInput.focus();
    }

    function toggleTaskDone(index) {
        tasks[index].done = !tasks[index].done;
        renderTasks();
        updateDailyStats();
    }

    function deleteTask(index) {
        tasks.splice(index, 1);
        renderTasks();
        updateDailyStats();
    }

    function updateTaskStats() {
        const total = tasks.length;
        const done = tasks.filter(t => t.done).length;
        taskCountBadge.textContent = total;
        taskStats.textContent = `${done} done out of ${total}`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================================
    //  NOTES (auto-save with debounce)
    // ============================================================
    let noteSaveTimeout = null;

    function saveNotes() {
        notes = notesArea.value;
        localStorage.setItem('focus_notes', notes);
        noteStatus.textContent = '✓ Saved';
        noteStatus.style.color = '#2e7d32';
        setTimeout(() => {
            noteStatus.textContent = 'Saved';
            noteStatus.style.color = '';
        }, 1200);
    }

    function handleNoteChange() {
        clearTimeout(noteSaveTimeout);
        noteStatus.textContent = '⏳ Saving...';
        noteSaveTimeout = setTimeout(saveNotes, 600);
    }

    // ============================================================
    //  STATS & CHART
    // ============================================================
    function updateStatsUI() {
        const daily = getDailyStats();
        statPomodoros.textContent = daily.pomodoros || 0;
        const doneToday = tasks.filter(t => t.done).length;
        statTasksDone.textContent = doneToday;
        updateChart();
    }

    function updateChart() {
        const daily = getDailyStats();
        const doneToday = tasks.filter(t => t.done).length;
        const remaining = tasks.length - doneToday;

        if (statsChart) {
            statsChart.data.datasets[0].data = [doneToday, remaining];
            statsChart.update();
        } else {
            statsChart = new Chart(statsChartCanvas, {
                type: 'doughnut',
                data: {
                    labels: ['Done', 'Remaining'],
                    datasets: [{
                        data: [doneToday, remaining || 1],
                        backgroundColor: ['#00bcd4', 'rgba(0,188,212,0.2)'],
                        borderColor: ['#00838f', 'rgba(255,255,255,0.1)'],
                        borderWidth: 2,
                        borderRadius: 8,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 10,
                                padding: 8,
                                font: { size: 10 },
                                color: '#0b2b3b'
                            }
                        }
                    }
                }
            });
        }
        updateChartColors();
    }

    function updateChartColors() {
        if (!statsChart) return;
        const isDark = document.body.classList.contains('dark-mode');
        const textColor = isDark ? '#e0f0f5' : '#0b2b3b';
        statsChart.options.plugins.legend.labels.color = textColor;
        statsChart.update();
    }

    // ============================================================
    //  AMBIENT SOUNDS (Web Audio API)
    // ============================================================
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new(window.AudioContext || window.webkitAudioContext)();
            const sampleRate = audioCtx.sampleRate;
            const bufferSize = sampleRate * 2;
            const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * 0.3;
            }
            noiseBuffer = buffer;
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playSound(type) {
        stopSound();
        if (type === 'off') {
            currentSound = 'off';
            ambientStatus.textContent = 'Off';
            updateAmbientBtns('off');
            return;
        }

        initAudio();
        if (!audioCtx || !noiseBuffer) return;

        gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.08;
        gainNode.connect(audioCtx.destination);

        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 800;
        filterNode.Q.value = 0.5;

        noiseSource = audioCtx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;

        noiseSource.connect(filterNode);
        filterNode.connect(gainNode);

        if (type === 'rain') {
            filterNode.frequency.value = 1200;
            gainNode.gain.value = 0.12;
        } else if (type === 'waves') {
            filterNode.frequency.value = 400;
            filterNode.type = 'bandpass';
            gainNode.gain.value = 0.1;
            const lfo = audioCtx.createOscillator();
            lfo.frequency.value = 0.2;
            const lfoGain = audioCtx.createGain();
            lfoGain.gain.value = 200;
            lfo.connect(lfoGain);
            lfoGain.connect(filterNode.frequency);
            lfo.start();
            noiseSource._lfo = lfo;
            noiseSource._lfoGain = lfoGain;
        } else if (type === 'forest') {
            filterNode.frequency.value = 600;
            filterNode.type = 'lowpass';
            gainNode.gain.value = 0.06;
        }

        noiseSource.start();
        isAudioPlaying = true;
        currentSound = type;
        ambientStatus.textContent = type === 'rain' ? 'Rain' :
            type === 'waves' ? 'Waves' :
            type === 'forest' ? 'Forest' : 'Off';
        updateAmbientBtns(type);
    }

    function stopSound() {
        if (noiseSource) {
            try {
                noiseSource.stop();
                if (noiseSource._lfo) {
                    noiseSource._lfo.stop();
                    noiseSource._lfo.disconnect();
                }
                if (noiseSource._lfoGain) noiseSource._lfoGain.disconnect();
            } catch (e) {}
            noiseSource.disconnect();
            noiseSource = null;
        }
        if (filterNode) {
            filterNode.disconnect();
            filterNode = null;
        }
        if (gainNode) {
            gainNode.disconnect();
            gainNode = null;
        }
        isAudioPlaying = false;
        if (currentSound !== 'off') {
            currentSound = 'off';
            ambientStatus.textContent = 'Off';
            updateAmbientBtns('off');
        }
    }

    function updateAmbientBtns(active) {
        ambientBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sound === active);
        });
    }

    // ============================================================
    //  DARK MODE
    // ============================================================
    function toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        darkModeToggle.innerHTML = isDark ?
            '<i class="fas fa-sun"></i> <span>Light</span>' :
            '<i class="fas fa-moon"></i> <span>Dark</span>';
        localStorage.setItem('focus_darkmode', isDark ? 'dark' : 'light');
        updateChartColors();
    }

    function loadDarkMode() {
        const saved = localStorage.getItem('focus_darkmode');
        if (saved === 'dark') {
            document.body.classList.add('dark-mode');
            darkModeToggle.innerHTML = '<i class="fas fa-sun"></i> <span>Light</span>';
        } else {
            document.body.classList.remove('dark-mode');
            darkModeToggle.innerHTML = '<i class="fas fa-moon"></i> <span>Dark</span>';
        }
        updateChartColors();
    }

    // ============================================================
    //  RESET DATA
    // ============================================================
    function resetAllData() {
        if (!confirm('All data (tasks, notes, stats) will be reset. Continue?')) return;
        localStorage.removeItem('focus_tasks');
        localStorage.removeItem('focus_notes');
        localStorage.removeItem('focus_timer');
        localStorage.removeItem('focus_daily_' + getTodayKey());
        tasks = [];
        notes = '';
        timerState.completedPomodoros = 0;
        timerState.workDuration = 25;
        timerState.breakDuration = 5;
        timerState.timeLeft = 25 * 60;
        timerState.mode = 'work';
        timerState.isRunning = false;
        if (timerState.intervalId) {
            clearInterval(timerState.intervalId);
            timerState.intervalId = null;
        }
        workDurationInput.value = 25;
        breakDurationInput.value = 5;
        notesArea.value = '';
        renderTasks();
        updateTimerDisplay();
        updateStatsUI();
        saveToStorage();
        if (statsChart) {
            statsChart.destroy();
            statsChart = null;
        }
        updateChart();
        stopSound();
        ambientStatus.textContent = 'Off';
        updateAmbientBtns('off');
        noteStatus.textContent = 'Saved';
    }

    // ============================================================
    //  INIT
    // ============================================================
    function init() {
        loadFromStorage();
        loadDarkMode();

        renderTasks();

        notesArea.value = notes || '';
        notesArea.addEventListener('input', handleNoteChange);

        timerState.timeLeft = timerState.workDuration * 60;
        updateTimerDisplay();
        workDurationInput.addEventListener('change', applyTimerSettings);
        breakDurationInput.addEventListener('change', applyTimerSettings);

        timerStartBtn.addEventListener('click', startTimer);
        timerPauseBtn.addEventListener('click', pauseTimer);
        timerResetBtn.addEventListener('click', resetTimer);

        addTaskBtn.addEventListener('click', () => addTask(taskInput.value));
        taskInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addTask(taskInput.value);
            }
        });

        ambientBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const sound = btn.dataset.sound;
                if (sound === 'off') {
                    stopSound();
                } else {
                    playSound(sound);
                }
            });
        });

        darkModeToggle.addEventListener('click', toggleDarkMode);
        resetDataBtn.addEventListener('click', resetAllData);

        updateStatsUI();

        if (Notification.permission === 'default') Notification.requestPermission();

        setInterval(() => {
            if (notesArea.value !== notes) {
                notes = notesArea.value;
                localStorage.setItem('focus_notes', notes);
            }
            saveToStorage();
        }, 30000);

        window.addEventListener('beforeunload', () => {
            if (audioCtx) audioCtx.close();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();