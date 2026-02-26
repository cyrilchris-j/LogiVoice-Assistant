import { getShipment, getTasks, getNextStop, getExceptions, getAuditLog, getFromCache } from './data.js';
import { getCurrentUser } from './auth.js';

// Current operation mode
let _currentMode = 'driver';
let _voiceHistory = [];

// ─── OPERATION MODE ──────────────────────────────────────────────────────────
export const setOperationMode = (mode) => {
    _currentMode = mode;
    const badge = document.getElementById('mode-badge');
    if (!badge) return;
    const icons = { driver: '🚗', warehouse: '📦', dispatcher: '📡' };
    const colors = { driver: '#6366f1', warehouse: '#f59e0b', dispatcher: '#10b981' };
    badge.textContent = `${icons[mode]} ${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode`;
    badge.style.background = colors[mode];
};

// ─── VOICE ACTIVITY FEED ─────────────────────────────────────────────────────
export const appendVoiceActivity = (command) => {
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    _voiceHistory.unshift({ command, time });
    if (_voiceHistory.length > 10) _voiceHistory.pop();

    const feed = document.getElementById('voice-activity-feed');
    if (!feed) return;
    renderActivityFeed(feed);
};

const renderActivityFeed = (feed) => {
    if (!feed) return;
    feed.innerHTML = _voiceHistory.length === 0
        ? '<p class="placeholder-text">No commands yet. Click the mic to start.</p>'
        : _voiceHistory.map(entry => `
            <div class="activity-entry">
                <span class="material-icons-round activity-icon">record_voice_over</span>
                <div class="activity-body">
                    <span class="activity-cmd">"${entry.command}"</span>
                    <span class="activity-time">${entry.time}</span>
                </div>
            </div>
        `).join('');
};

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
export const renderDashboard = () => {
    const content = document.getElementById('page-content');
    const user = getCurrentUser();
    const userName = user ? user.name : 'Driver';

    // Start with last known stats if available
    const cachedExceptions = getFromCache('exceptions') || [];
    const cachedTasks = getFromCache('tasks') || [];

    content.innerHTML = `
        <div class="dashboard-header">
            <div>
                <h2>Operations Dashboard</h2>
                <p>Welcome back, ${userName}. Speak a command to get started.</p>
            </div>
            <div class="header-right">
                <span id="mode-badge" class="mode-badge">🚗 Driver Mode</span>
                <div class="status-card mini">
                    <span class="material-icons-round">shopping_basket</span>
                    <div>
                        <h3 id="remaining-orders-count">—</h3>
                        <p>Orders</p>
                    </div>
                </div>
                <div class="status-card mini kpi-green">
                    <span class="material-icons-round">check_circle</span>
                    <div>
                        <h3 id="delivered-today-count">—</h3>
                        <p>Delivered</p>
                    </div>
                </div>
                <div class="status-card mini kpi-red">
                    <span class="material-icons-round">warning</span>
                    <div>
                        <h3 id="exceptions-count">${cachedExceptions.length}</h3>
                        <p>Exceptions</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="dashboard-grid">
            <div class="card" id="shipment-card">
                <h2>Current Shipment <span class="material-icons-round">local_shipping</span></h2>
                <div id="shipment-details">
                    <p class="placeholder-text">Say "Track shipment 101" to view details.</p>
                </div>
            </div>

            <div class="card voice-activity-card" id="voice-activity-card">
                <h2>Voice Activity <span class="material-icons-round">graphic_eq</span></h2>
                <div id="voice-activity-feed" class="voice-activity-feed">
                    <p class="placeholder-text">No commands yet. Click the mic to start.</p>
                </div>
                <div class="wakeword-hint">
                    <span class="material-icons-round">info</span>
                    <span>Say "Hey LogiVoice" or click the mic button</span>
                </div>
            </div>

            <div class="card" id="map-card" style="grid-column: span 2;">
                <h2>Live Fleet Map <span class="material-icons-round">map</span></h2>
                <div id="map"></div>
            </div>

            <div class="card" id="task-card">
                <h2>Task Board <span class="material-icons-round">assignment</span></h2>
                <ul id="task-list" class="task-list">
                    ${cachedTasks.length > 0 ? cachedTasks.map(t => `<li class="task-item"><span class="material-icons-round check-icon">radio_button_unchecked</span><div class="task-body"><span class="task-text">${t.text}</span></div></li>`).join('') : '<li class="task-item">Loading fresh tasks...</li>'}
                </ul>
            </div>

            <div class="card" id="exception-card">
                <h2>Exceptions <span class="material-icons-round">report_problem</span></h2>
                <div id="exception-list">
                    ${cachedExceptions.length > 0 ? `<p class="placeholder-text">Loading fresh exceptions...</p>` : `<p class="placeholder-text">No exceptions logged.</p>`}
                </div>
            </div>
        </div>
    `;

    // Background render fresh data
    renderTasks();
    renderExceptions();
};

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
export const renderLanding = () => {
    const content = document.getElementById('page-content');
    content.innerHTML = `
        <div class="landing-page">
            <!-- Hero -->
            <div class="hero-section">
                <div class="hero-badge">
                    <span class="material-icons-round">mic</span>
                    <span>AI-Powered • Hands-Free • Real-Time</span>
                </div>
                <h1>Voice-Enabled<br>Logistics Assistant</h1>
                <p>Hands-free shipment tracking, task management, and operations control for drivers, warehouse workers, and dispatchers.</p>
                <div class="hero-actions">
                    <button id="start-demo-btn" class="cta-btn">
                        <span class="material-icons-round">dashboard</span>
                        Open Dashboard
                    </button>
                    <button id="open-demo-guide-btn" class="cta-btn cta-outline">
                        <span class="material-icons-round">help_outline</span>
                        Voice Commands
                    </button>
                </div>

                <!-- Animated Truck -->
                <div class="hero-visual">
                    <div class="truck-container">
                        <div class="road-line"></div>
                        <div class="truck-icon">
                            <span class="material-icons-round">local_shipping</span>
                        </div>
                        <div class="signal-ring r1"></div>
                        <div class="signal-ring r2"></div>
                        <div class="signal-ring r3"></div>
                    </div>
                </div>
            </div>

            <!-- Stats Row -->
            <div class="stats-row">
                <div class="stat-item">
                    <span class="stat-value">10+</span>
                    <span class="stat-label">Voice Commands</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">3</span>
                    <span class="stat-label">Operation Modes</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">Real-time</span>
                    <span class="stat-label">Status Updates</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">0</span>
                    <span class="stat-label">Manual Taps Needed</span>
                </div>
            </div>

            <!-- Features -->
            <div class="section-title">
                <h2>Key Capabilities</h2>
                <p>Everything logistics teams need, accessible entirely by voice.</p>
            </div>
            <div class="features-grid">
                <div class="feature-card">
                    <div class="feature-icon-wrap" style="background: rgba(99,102,241,0.15)">
                        <span class="material-icons-round" style="color:#6366f1">gps_fixed</span>
                    </div>
                    <h3>Shipment Tracking</h3>
                    <p>Query any shipment by ID. Get real‑time status, ETA, consignee, and delivery window — all read aloud.</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon-wrap" style="background: rgba(16,185,129,0.15)">
                        <span class="material-icons-round" style="color:#10b981">task_alt</span>
                    </div>
                    <h3>Task Management</h3>
                    <p>Browse and complete pick, putaway, delivery, and admin tasks hands-free using natural language.</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon-wrap" style="background: rgba(245,158,11,0.15)">
                        <span class="material-icons-round" style="color:#f59e0b">report_problem</span>
                    </div>
                    <h3>Exception Logging</h3>
                    <p>Instantly log damage events or customer unavailability by voice. Dispatchers are notified in real-time.</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon-wrap" style="background: rgba(6,182,212,0.15)">
                        <span class="material-icons-round" style="color:#06b6d4">notifications_active</span>
                    </div>
                    <h3>Consignee Alerts</h3>
                    <p>Trigger delay notifications to consignees with a single voice command — no manual app interaction needed.</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon-wrap" style="background: rgba(236,72,153,0.15)">
                        <span class="material-icons-round" style="color:#ec4899">explore</span>
                    </div>
                    <h3>Smart Navigation</h3>
                    <p>Request your next stop and get address, distance, and ETA spoken back without looking at the screen.</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon-wrap" style="background: rgba(99,102,241,0.15)">
                        <span class="material-icons-round" style="color:#6366f1">manage_accounts</span>
                    </div>
                    <h3>Multi-Role Modes</h3>
                    <p>Switch between Driver, Warehouse, and Dispatcher modes — optimised commands for each operational context.</p>
                </div>
            </div>

            <!-- How it Works -->
            <div class="section-title">
                <h2>How It Works</h2>
                <p>Three steps from spoken word to completed action.</p>
            </div>
            <div class="how-it-works">
                <div class="step-card">
                    <div class="step-number">1</div>
                    <div class="step-icon"><span class="material-icons-round">mic</span></div>
                    <h4>Speak</h4>
                    <p>Click the mic or say "Hey LogiVoice". Speak naturally in logistics language.</p>
                </div>
                <div class="step-connector"></div>
                <div class="step-card">
                    <div class="step-number">2</div>
                    <div class="step-icon"><span class="material-icons-round">psychology</span></div>
                    <h4>Understand</h4>
                    <p>Domain-tuned NLU parses the intent — tracking, update, exception, navigation, or notification.</p>
                </div>
                <div class="step-connector"></div>
                <div class="step-card">
                    <div class="step-number">3</div>
                    <div class="step-icon"><span class="material-icons-round">sync</span></div>
                    <h4>Act & Confirm</h4>
                    <p>The backend is updated via secure API, the dashboard refreshes, and a spoken confirmation is read back.</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('start-demo-btn')?.addEventListener('click', () => {
        renderDashboard();
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        document.querySelector('[data-page="dashboard"]')?.classList.add('active');
    });

    document.getElementById('open-demo-guide-btn')?.addEventListener('click', () => {
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        document.querySelector('[data-page="demo"]')?.classList.add('active');
        renderDemoGuide();
    });
};

// ─── SHIPMENT CARD ────────────────────────────────────────────────────────────
export const updateShipmentCard = (shipment) => {
    const container = document.getElementById('shipment-details');
    if (!container) return;
    if (!shipment) {
        container.innerHTML = `<p class="error-text">Shipment not found.</p>`;
        return;
    }

    window._lastShipmentId = shipment.id;
    const statusClass = `status-${shipment.status.toLowerCase().replace(' ', '-')}`;
    const progress = getProgress(shipment.status);

    container.innerHTML = `
        <div class="shipment-info">
            <div class="shipment-header">
                <h3>ID: #${shipment.id}</h3>
                <span class="status-badge ${statusClass}">${shipment.status}</span>
            </div>
            <div class="shipment-grid">
                <div class="shipment-detail"><span class="detail-label">Customer</span><span>${shipment.customer}</span></div>
                <div class="shipment-detail"><span class="detail-label">Consignee</span><span>${shipment.consignee}</span></div>
                <div class="shipment-detail"><span class="detail-label">From</span><span>${shipment.origin}</span></div>
                <div class="shipment-detail"><span class="detail-label">To</span><span>${shipment.destination}</span></div>
                <div class="shipment-detail"><span class="detail-label">ETA</span><span>${shipment.eta}</span></div>
                <div class="shipment-detail"><span class="detail-label">Delivery Window</span><span>${shipment.deliveryWindow}</span></div>
            </div>
            ${shipment.specialInstructions && shipment.specialInstructions !== 'None' ? `
                <div class="special-note">
                    <span class="material-icons-round">info</span>
                    <span>${shipment.specialInstructions}</span>
                </div>
            ` : ''}
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <p class="progress-label">${progress}% complete</p>
        </div>
    `;
};

const getProgress = (status) => {
    switch (status.toLowerCase()) {
        case 'pending': return 10;
        case 'processing': return 35;
        case 'in transit': return 65;
        case 'delivered': return 100;
        default: return 0;
    }
};

// ─── TASKS ───────────────────────────────────────────────────────────────────
export const renderTasks = async () => {
    const list = document.getElementById('task-list');
    if (!list) return;
    list.innerHTML = '<li class="task-item">Loading...</li>';
    const tasks = await getTasks();
    if (tasks.length === 0) {
        list.innerHTML = '<li class="task-item">No tasks available.</li>';
        return;
    }
    list.innerHTML = tasks.map(task => {
        const typeIcon = { inspection: 'search', loading: 'inventory_2', putaway: 'shelves', delivery: 'local_shipping', admin: 'description', coordination: 'groups' }[task.type] || 'task_alt';
        const modeColor = { driver: '#6366f1', warehouse: '#f59e0b', dispatcher: '#10b981' }[task.assignedMode] || '#6366f1';
        return `
            <li class="task-item ${task.status === 'completed' ? 'completed' : ''}">
                <span class="material-icons-round check-icon">${task.status === 'completed' ? 'check_circle' : 'radio_button_unchecked'}</span>
                <div class="task-body">
                    <span class="task-text">${task.text}</span>
                    <div class="task-meta">
                        <span class="task-type-badge" style="background: ${modeColor}22; color: ${modeColor}">
                            <span class="material-icons-round" style="font-size:12px">${typeIcon}</span>
                            ${task.assignedMode}
                        </span>
                        ${task.status !== 'completed' ? `<span class="task-hint">Say "mark task ${task.id} done"</span>` : ''}
                    </div>
                </div>
            </li>
        `;
    }).join('');

    // Update exceptions count
    const excEl = document.getElementById('exceptions-count');
    if (excEl) {
        const exps = await getExceptions();
        excEl.textContent = exps.length;
    }
};

// ─── ROUTE ────────────────────────────────────────────────────────────────────
export const showRoute = () => {
    const container = document.getElementById('shipment-details');
    if (!container) return;
    const route = getNextStop();
    container.innerHTML = `
        <div class="route-info">
            <div class="route-step">
                <span class="material-icons-round">place</span>
                <div>
                    <h4>${route.address}</h4>
                    <p>${route.distance} • ETA: ${route.time}</p>
                    <p>Consignee: ${route.consignee} • Window: ${route.deliveryWindow}</p>
                </div>
            </div>
        </div>
    `;
};

// ─── EXCEPTIONS ───────────────────────────────────────────────────────────────
export const renderExceptions = async () => {
    const container = document.getElementById('exception-list');
    if (!container) return;
    const list = await getExceptions();
    if (list.length === 0) {
        container.innerHTML = `<p class="placeholder-text">No exceptions logged.</p>`;
        return;
    }
    const exTypeStyle = {
        'Package Damaged': { icon: 'broken_image', color: '#ef4444' },
        'Customer Not Available': { icon: 'person_off', color: '#f59e0b' },
        'General Exception': { icon: 'warning', color: '#8b5cf6' }
    };
    container.innerHTML = list.map(ex => {
        const style = exTypeStyle[ex.type] || { icon: 'warning', color: '#64748b' };
        const time = new Date(ex.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="exception-entry">
                <span class="material-icons-round" style="color:${style.color};font-size:20px">${style.icon}</span>
                <div class="exception-body">
                    <span class="exception-type" style="color:${style.color}">${ex.type}</span>
                    <span class="exception-meta">Shipment #${ex.shipmentId} • ${time}</span>
                </div>
            </div>
        `;
    }).join('');

    const countEl = document.getElementById('exceptions-count');
    if (countEl) countEl.textContent = list.length;
};

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────
export const renderAuditLog = (logs) => {
    const container = document.getElementById('exception-list');
    if (!container) return;
    if (!logs || logs.length === 0) {
        container.innerHTML = `<p class="placeholder-text">No audit entries found.</p>`;
        return;
    }
    const actionColors = {
        STATUS_UPDATE: '#6366f1', EXCEPTION_LOGGED: '#ef4444',
        CONSIGNEE_NOTIFIED: '#10b981', TASK_COMPLETE: '#f59e0b',
        VOICE_TRACK: '#06b6d4', VOICE_NAVIGATION: '#8b5cf6',
        VOICE_NOTIFY: '#10b981', VOICE_AUDIT: '#64748b'
    };
    container.innerHTML = logs.slice(0, 10).map(entry => {
        const color = actionColors[entry.action] || '#64748b';
        const time = new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="exception-entry">
                <span class="audit-dot" style="background:${color}"></span>
                <div class="exception-body">
                    <span class="exception-type" style="color:${color}">${entry.action.replace(/_/g, ' ')}</span>
                    <span class="exception-meta">${entry.details} • ${time}</span>
                </div>
            </div>
        `;
    }).join('');
};

// ─── TRANSCRIPT ──────────────────────────────────────────────────────────────
export const updateTranscript = (text, isFinal = false) => {
    const container = document.getElementById('transcript-container');
    const p = document.getElementById('transcript-text');
    if (!container || !p) return;
    container.classList.remove('hidden');
    p.textContent = text;
    if (isFinal) {
        setTimeout(() => container.classList.add('hidden'), 3500);
    }
};

export const toggleMicVisual = (isListening) => {
    const btn = document.getElementById('mic-btn');
    const waveform = document.getElementById('mic-waveform');
    if (isListening) {
        btn?.classList.add('listening');
        waveform?.classList.add('active');
    } else {
        btn?.classList.remove('listening');
        waveform?.classList.remove('active');
    }
};

// ─── DEMO GUIDE ──────────────────────────────────────────────────────────────
export const renderDemoGuide = () => {
    const content = document.getElementById('page-content');
    content.innerHTML = `
        <div class="card demo-guide-card">
            <h2>Demo Voice Commands <span class="material-icons-round">record_voice_over</span></h2>
            <p style="color:var(--text-secondary);margin-bottom:24px;">Click the mic button (bottom right) or use the sidebar, then speak any of the commands below.</p>

            <div class="cmd-group">
                <div class="cmd-group-header"><span class="material-icons-round">gps_fixed</span> Shipment Tracking</div>
                <div class="cmd-table">
                    <div class="cmd-row"><code>"Track shipment 101"</code><span>Shows full shipment details including consignee, ETA, and delivery window.</span></div>
                    <div class="cmd-row"><code>"Shipment status 102"</code><span>Quick status check for shipment #102.</span></div>
                </div>
            </div>

            <div class="cmd-group">
                <div class="cmd-group-header"><span class="material-icons-round">edit_note</span> Status Updates</div>
                <div class="cmd-table">
                    <div class="cmd-row"><code>"Mark order 101 delivered"</code><span>Sets shipment status to Delivered and syncs with backend.</span></div>
                    <div class="cmd-row"><code>"Mark order 102 picked"</code><span>Sets status to Processing (order picked).</span></div>
                    <div class="cmd-row"><code>"Update status shipment 103 pending"</code><span>Sets any status by name.</span></div>
                </div>
            </div>

            <div class="cmd-group">
                <div class="cmd-group-header"><span class="material-icons-round">report_problem</span> Exception Logging</div>
                <div class="cmd-table">
                    <div class="cmd-row"><code>"Package damaged"</code><span>Logs a damage exception for the current shipment.</span></div>
                    <div class="cmd-row"><code>"Customer not available"</code><span>Logs unavailability exception and prompts delay notification.</span></div>
                    <div class="cmd-row"><code>"Log exception shipment 104"</code><span>Logs a general exception for any specified shipment.</span></div>
                </div>
            </div>

            <div class="cmd-group">
                <div class="cmd-group-header"><span class="material-icons-round">notifications_active</span> Consignee Notifications</div>
                <div class="cmd-table">
                    <div class="cmd-row"><code>"Send delay notification"</code><span>Sends a delay SMS/email to the consignee of the current shipment.</span></div>
                    <div class="cmd-row"><code>"Call consignee"</code><span>Triggers a consignee contact notification.</span></div>
                    <div class="cmd-row"><code>"Notify consignee shipment 102"</code><span>Notifies a specific shipment's consignee.</span></div>
                </div>
            </div>

            <div class="cmd-group">
                <div class="cmd-group-header"><span class="material-icons-round">assignment</span> Task Management</div>
                <div class="cmd-table">
                    <div class="cmd-row"><code>"Show my tasks"</code><span>Displays all pending tasks for the current role.</span></div>
                    <div class="cmd-row"><code>"Mark task 1 done"</code><span>Marks task #1 as completed and updates the backend.</span></div>
                    <div class="cmd-row"><code>"Complete task 3"</code><span>Alternative phrasing to complete a task.</span></div>
                </div>
            </div>

            <div class="cmd-group">
                <div class="cmd-group-header"><span class="material-icons-round">navigation</span> Navigation</div>
                <div class="cmd-table">
                    <div class="cmd-row"><code>"Next stop"</code><span>Shows your next delivery stop with address and ETA.</span></div>
                    <div class="cmd-row"><code>"Show my route"</code><span>Displays route information for the current delivery.</span></div>
                </div>
            </div>

            <div class="cmd-group">
                <div class="cmd-group-header"><span class="material-icons-round">manage_accounts</span> Mode Switching</div>
                <div class="cmd-table">
                    <div class="cmd-row"><code>"Switch to warehouse mode"</code><span>Optimises for pick, putaway, and loading tasks.</span></div>
                    <div class="cmd-row"><code>"Switch to driver mode"</code><span>Optimises for delivery and navigation commands.</span></div>
                    <div class="cmd-row"><code>"Switch to dispatcher mode"</code><span>Optimises for coordination and notification commands.</span></div>
                </div>
            </div>

            <div class="cmd-group">
                <div class="cmd-group-header"><span class="material-icons-round">history</span> Audit & Help</div>
                <div class="cmd-table">
                    <div class="cmd-row"><code>"Show audit log"</code><span>Displays the last 10 voice-initiated actions with timestamps.</span></div>
                    <div class="cmd-row"><code>"Help"</code><span>Lists available commands via speech.</span></div>
                    <div class="cmd-row"><code>"Hey LogiVoice"</code><span>Wake word greeting — assistant responds with current mode.</span></div>
                </div>
            </div>
        </div>
    `;
};

// ─── LOGIN PAGE ──────────────────────────────────────────────────────────────
export const renderLogin = () => {
    return `
        <div class="login-container">
            <div class="login-card">
                <div class="login-header">
                    <span class="material-icons-round login-icon">local_shipping</span>
                    <h1>LogiVoice</h1>
                    <p>Logistics Assistant</p>
                </div>
                <form id="login-form" class="login-form">
                    <div class="form-group">
                        <label for="username"><span class="material-icons-round">person</span> Username</label>
                        <input type="text" id="username" name="username" placeholder="e.g. driver1" required>
                    </div>
                    <div class="form-group">
                        <label for="password"><span class="material-icons-round">lock</span> Password</label>
                        <input type="password" id="password" name="password" placeholder="••••••••" required>
                    </div>
                    <div id="login-error" class="login-error hidden"></div>
                    <button type="submit" class="login-btn">
                        <span class="material-icons-round">login</span> Sign In
                    </button>
                </form>
                <div class="auth-switch">
                    Don't have an account? <a href="#" id="show-register">Register as Driver</a>
                </div>
            </div>
        </div>
    `;
};

// ─── REGISTER PAGE ───────────────────────────────────────────────────────────
export const renderRegister = () => {
    return `
        <div class="login-container">
            <div class="login-card">
                <div class="login-header">
                    <span class="material-icons-round login-icon">group_add</span>
                    <h1>Driver Sign Up</h1>
                    <p>Join the LogiVoice fleet</p>
                </div>
                <form id="register-form" class="login-form">
                    <div class="form-group">
                        <label for="reg-name"><span class="material-icons-round">badge</span> Full Name</label>
                        <input type="text" id="reg-name" name="name" placeholder="John Doe" required>
                    </div>
                    <div class="form-group">
                        <label for="reg-username"><span class="material-icons-round">person</span> Username</label>
                        <input type="text" id="reg-username" name="username" placeholder="e.g. johndoe" required>
                    </div>
                    <div class="form-group">
                        <label for="reg-password"><span class="material-icons-round">lock</span> Password</label>
                        <input type="password" id="reg-password" name="password" placeholder="Min 6 characters" required minlength="6">
                    </div>
                    <div id="register-error" class="login-error hidden"></div>
                    <button type="submit" class="login-btn">
                        <span class="material-icons-round">how_to_reg</span> Register
                    </button>
                </form>
                <div class="auth-switch">
                    Already have an account? <a href="#" id="show-login">Sign In</a>
                </div>
            </div>
        </div>
    `;
};

// ─── KPI COUNTERS ─────────────────────────────────────────────────────────────
export const updateOrderCount = (count) => {
    const el = document.getElementById('remaining-orders-count');
    if (el) el.textContent = count;
};

export const updateDriverCount = (count) => {
    const el = document.getElementById('online-drivers-count');
    if (el) el.textContent = count;
};
