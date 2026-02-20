import { renderLanding, renderDashboard, renderLogin, updateOrderCount, updateDriverCount, renderDemoGuide, renderExceptions, renderAuditLog } from './ui.js';
import { initVoice, currentMode } from './voice.js';
import { initAuth, isAuthenticated, login, logout, getCurrentUser } from './auth.js';
import { initMap, updateDriverMarker, updateShipmentMarkers } from './map.js';
import { io } from "socket.io-client";

const socket = io('http://localhost:5050');

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    renderDashboard();
    initVoice();
    showAuthenticatedElements();
    updateUserProfile();

    // Initialize Map
    setTimeout(() => {
        initMap('map');
        fetchShipments();
    }, 100);

    // ── Socket Listeners ────────────────────────────────
    socket.on('locationUpdated', (data) => updateDriverMarker(data));
    socket.on('shipmentAssigned', () => fetchShipments());
    socket.on('shipmentUpdated', () => fetchShipments());

    socket.on('exceptionLogged', (exception) => {
        renderExceptions();
        console.log('New exception:', exception);
    });

    socket.on('auditAdded', (entry) => {
        console.log('Audit entry:', entry);
    });

    socket.on('consigneeNotified', (data) => {
        console.log('Consignee notified:', data);
    });

    // ── Theme Toggle ────────────────────────────────────
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle.querySelector('.material-icons-round');
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    themeIcon.textContent = currentTheme === 'dark' ? 'dark_mode' : 'light_mode';

    themeToggle.addEventListener('click', () => {
        const theme = document.documentElement.getAttribute('data-theme');
        const newTheme = theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeIcon.textContent = newTheme === 'dark' ? 'dark_mode' : 'light_mode';
    });

    // ── Navigation ──────────────────────────────────────
    const navLinks = document.querySelectorAll('.nav-links li');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            handleNavigation(link.getAttribute('data-page'));
        });
    });

    // ── Mode Buttons ────────────────────────────────────
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.getAttribute('data-mode');
            // Trigger mode switch via synthetic voice simulation
            import('./voice.js').then(({ currentMode }) => { });
            import('./ui.js').then(({ setOperationMode }) => setOperationMode(mode));
        });
    });
});

function setupLoginHandler() {
    document.addEventListener('submit', async (e) => {
        if (e.target.id === 'login-form') {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('login-error');
            const result = await login(username, password);
            if (result.success) {
                window.location.reload();
            } else {
                errorDiv.textContent = result.error;
                errorDiv.classList.remove('hidden');
            }
        }
    });
}

function hideAuthenticatedElements() {
    const sidebar = document.querySelector('.sidebar');
    const micBtn = document.getElementById('mic-btn');
    if (sidebar) sidebar.style.display = 'none';
    if (micBtn) micBtn.style.display = 'none';
}

function showAuthenticatedElements() {
    const sidebar = document.querySelector('.sidebar');
    const micBtn = document.getElementById('mic-btn');
    if (sidebar) sidebar.style.display = 'flex';
    if (micBtn) micBtn.style.display = 'flex';
}

function updateUserProfile() {
    const user = getCurrentUser();
    if (user) {
        const logo = document.querySelector('.logo h1');
        if (logo) {
            logo.innerHTML = `LogiVoice <span style="font-size:0.6rem;opacity:0.75;display:block;font-weight:400">${user.name}</span>`;
        }
    }
}

async function fetchShipments() {
    try {
        const response = await fetch('http://localhost:5050/api/active-shipments');
        const shipments = await response.json();
        updateShipmentMarkers(shipments);
        const remaining = shipments.filter(s => s.assignedDriver === null).length;
        updateOrderCount(remaining);

        // Update delivered count
        const deliveredEl = document.getElementById('delivered-today-count');
        if (deliveredEl) {
            const delivered = shipments.filter(s => s.status === 'Delivered').length;
            deliveredEl.textContent = delivered;
        }

        const user = getCurrentUser();
        if (user && user.role === 'admin') fetchAdminStats();
    } catch (err) {
        console.error("Failed to fetch shipments", err);
        updateOrderCount('—');
    }
}

async function fetchAdminStats() {
    try {
        const response = await fetch('http://localhost:5050/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const stats = await response.json();
        updateDriverCount(stats.onlineDrivers);
    } catch (err) {
        console.error("Failed to fetch admin stats", err);
    }
}

function handleNavigation(page) {
    const content = document.getElementById('page-content');
    switch (page) {
        case 'landing':
            renderLanding();
            break;
        case 'dashboard':
            renderDashboard();
            setTimeout(() => {
                initMap('map');
                fetchShipments();
            }, 100);
            break;
        case 'about':
            content.innerHTML = `
                <div class="about-page">

                    <!-- Brand Banner -->
                    <div class="about-brand-banner">
                        <div class="about-brand-icon">
                            <span class="material-icons-round">local_shipping</span>
                        </div>
                        <div class="about-brand-text">
                            <h1>LogiVoice</h1>
                            <p>The intelligent voice layer for modern logistics operations.</p>
                        </div>
                        <div class="about-version-badge">v2.0</div>
                    </div>

                    <!-- Mission -->
                    <div class="about-mission">
                        <span class="material-icons-round about-quote-icon">format_quote</span>
                        <p>We believe every logistics worker deserves a co-pilot that listens, understands, and acts — so they can keep their eyes on the road and hands on the goods.</p>
                    </div>

                    <!-- Product Stats -->
                    <div class="about-stats-grid">
                        <div class="about-stat">
                            <span class="about-stat-value">10+</span>
                            <span class="about-stat-label">Voice Commands</span>
                        </div>
                        <div class="about-stat">
                            <span class="about-stat-value">3</span>
                            <span class="about-stat-label">Operation Modes</span>
                        </div>
                        <div class="about-stat">
                            <span class="about-stat-value">&lt; 1s</span>
                            <span class="about-stat-label">Command Response</span>
                        </div>
                        <div class="about-stat">
                            <span class="about-stat-value">0</span>
                            <span class="about-stat-label">Manual Taps Needed</span>
                        </div>
                    </div>

                    <!-- Two-column: Stack + Values -->
                    <div class="about-two-col">

                        <!-- Technology Stack -->
                        <div class="about-section-card">
                            <div class="about-section-header">
                                <span class="material-icons-round">layers</span>
                                <h3>Technology Stack</h3>
                            </div>
                            <div class="about-stack-list">
                                <div class="about-stack-item">
                                    <div class="stack-dot" style="background:#6366f1"></div>
                                    <div>
                                        <span class="stack-name">Voice Engine</span>
                                        <span class="stack-desc">Web Speech API — STT + TTS</span>
                                    </div>
                                </div>
                                <div class="about-stack-item">
                                    <div class="stack-dot" style="background:#06b6d4"></div>
                                    <div>
                                        <span class="stack-name">Frontend</span>
                                        <span class="stack-desc">Vanilla JS + Vite + Leaflet Maps</span>
                                    </div>
                                </div>
                                <div class="about-stack-item">
                                    <div class="stack-dot" style="background:#10b981"></div>
                                    <div>
                                        <span class="stack-name">Backend</span>
                                        <span class="stack-desc">Node.js + Express + MongoDB</span>
                                    </div>
                                </div>
                                <div class="about-stack-item">
                                    <div class="stack-dot" style="background:#f59e0b"></div>
                                    <div>
                                        <span class="stack-name">Real-time Sync</span>
                                        <span class="stack-desc">Socket.io WebSockets</span>
                                    </div>
                                </div>
                                <div class="about-stack-item">
                                    <div class="stack-dot" style="background:#ec4899"></div>
                                    <div>
                                        <span class="stack-name">Security</span>
                                        <span class="stack-desc">JWT Auth + Role-based Access</span>
                                    </div>
                                </div>
                                <div class="about-stack-item">
                                    <div class="stack-dot" style="background:#8b5cf6"></div>
                                    <div>
                                        <span class="stack-name">Audit Trail</span>
                                        <span class="stack-desc">Full voice-action logging</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Values -->
                        <div class="about-section-card">
                            <div class="about-section-header">
                                <span class="material-icons-round">verified</span>
                                <h3>We Believe In</h3>
                            </div>
                            <div class="about-values-list">
                                <div class="about-value-item">
                                    <span class="material-icons-round value-icon" style="color:#6366f1">accessibility_new</span>
                                    <div>
                                        <span class="value-title">Zero-Touch Access</span>
                                        <span class="value-desc">Full operational control without ever touching a screen.</span>
                                    </div>
                                </div>
                                <div class="about-value-item">
                                    <span class="material-icons-round value-icon" style="color:#10b981">bolt</span>
                                    <div>
                                        <span class="value-title">Real-Time Truth</span>
                                        <span class="value-desc">Every voice action syncs instantly across all connected clients.</span>
                                    </div>
                                </div>
                                <div class="about-value-item">
                                    <span class="material-icons-round value-icon" style="color:#f59e0b">shield</span>
                                    <div>
                                        <span class="value-title">Accountability</span>
                                        <span class="value-desc">Every spoken command is logged with user, action, and timestamp.</span>
                                    </div>
                                </div>
                                <div class="about-value-item">
                                    <span class="material-icons-round value-icon" style="color:#ec4899">groups</span>
                                    <div>
                                        <span class="value-title">Role-First Design</span>
                                        <span class="value-desc">Tailored modes for drivers, warehouse teams, and dispatchers.</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Capabilities Footer Row -->
                    <div class="about-caps-row">
                        <div class="about-cap"><span class="material-icons-round">gps_fixed</span><span>Shipment Tracking</span></div>
                        <div class="about-cap"><span class="material-icons-round">task_alt</span><span>Task Management</span></div>
                        <div class="about-cap"><span class="material-icons-round">report_problem</span><span>Exception Logging</span></div>
                        <div class="about-cap"><span class="material-icons-round">notifications_active</span><span>Consignee Alerts</span></div>
                        <div class="about-cap"><span class="material-icons-round">explore</span><span>Smart Navigation</span></div>
                        <div class="about-cap"><span class="material-icons-round">manage_accounts</span><span>Multi-Role Modes</span></div>
                    </div>

                </div>
            `;
            break;
        case 'demo':
            renderDemoGuide();
            break;
        case 'logout':
            logout();
            window.location.reload();
            break;
        default:
            renderLanding();
    }
}
