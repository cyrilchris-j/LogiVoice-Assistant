import { renderLanding, renderDashboard, renderLogin, renderRegister, updateOrderCount, updateDriverCount, renderDemoGuide, renderExceptions, renderAuditLog } from './ui.js';
import { initVoice } from './voice.js';
import { onAuthChange, login, register, logout, getCurrentUser, ensureAdminAccount } from './auth.js';
import { initMap, updateShipmentMarkers } from './map.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Ensure admin account exists (seeding)
    ensureAdminAccount();

    let isBooted = false;

    // 2. Listen for Auth Changes
    onAuthChange((user, profile) => {
        console.log('Auth Change:', { user: !!user, profile: !!profile, isBooted });

        if (!user) {
            isBooted = false;
            hideAppChrome();
            showLoginPage();
            return;
        }

        // Start background tracking as soon as user is authenticated
        import('./map.js').then(({ initMap, startOwnLocationWatch }) => {
            startOwnLocationWatch();
            // Check if map container exists in DOM (it's hidden but usually there in index.html)
            const mapEl = document.getElementById('map');
            if (mapEl) initMap('map');
        });

        // We have a user! 
        if (!profile) {
            // If we don't have a profile yet and haven't booted, show loading briefly
            if (!isBooted) {
                const content = document.getElementById('page-content');
                if (content && !content.querySelector('.loading-container')) {
                    content.innerHTML = `
                        <div class="loading-container" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:80vh; text-align:center;">
                            <div class="premium-spinner"></div>
                            <h2 style="margin-top:2rem; font-weight:600; color:var(--text-primary);">Opening LogiVoice Portal...</h2>
                            <p style="color:var(--text-secondary); margin-top:0.5rem;">Setting up your workspace</p>
                        </div>
                    `;
                }
            }
            // Even without a profile, we don't 'return' here anymore. 
            // We allow the logic to fall through to bootApp.
        }

        // If already booted, just update profile info (don't re-render entire dashboard)
        if (isBooted) {
            updateUserProfile();
            return;
        }

        // Boot the app if we have a user (even if profile is null - UI will handle "Driver" default)
        isBooted = true;
        bootApp();
    });
});

function showLoginPage() {
    const content = document.getElementById('page-content');
    content.innerHTML = renderLogin();
    document.querySelector('main.content').style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:100vh;';

    // Handle Switch to Register
    document.getElementById('show-register')?.addEventListener('click', (e) => {
        e.preventDefault();
        showRegisterPage();
    });

    // Handle Login Submit
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('login-error');
        const btn = e.target.querySelector('button[type="submit"]');

        btn.disabled = true;
        const result = await login(username, password);
        if (result.success) {
            // Trigger GPS permission early while dashboard is loading
            import('./map.js').then(({ requestGPSPermission }) => requestGPSPermission());
            // onAuthChange will trigger bootApp
        } else {
            btn.disabled = false;
            errorDiv.textContent = result.error;
            errorDiv.classList.remove('hidden');
        }
    });
}

function showRegisterPage() {
    const content = document.getElementById('page-content');
    content.innerHTML = renderRegister();

    // Handle Switch to Login
    document.getElementById('show-login')?.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginPage();
    });

    // Handle Register Submit
    document.getElementById('register-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value;
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        const errorDiv = document.getElementById('register-error');
        const btn = e.target.querySelector('button[type="submit"]');

        btn.disabled = true;
        const result = await register(username, name, password);
        if (result.success) {
            // Trigger GPS permission early
            import('./map.js').then(({ requestGPSPermission }) => requestGPSPermission());
            // onAuthChange will trigger bootApp
        } else {
            btn.disabled = false;
            errorDiv.textContent = result.error;
            errorDiv.classList.remove('hidden');
        }
    });
}

function bootApp() {
    const startTime = performance.now();
    const contentArea = document.querySelector('main.content');
    contentArea.style.cssText = '';

    showAppChrome();
    updateUserProfile();
    renderDashboard();

    // ── Parallel Boot ──────────────────────────────────
    initVoice();

    // Launch these together
    const mapPromise = Promise.resolve().then(() => initMap('map'));
    const shipmentsPromise = fetchShipments();

    Promise.all([mapPromise, shipmentsPromise]).then(() => {
        const endTime = performance.now();
        console.log(`[Performance] Dashboard ready in ${Math.round(endTime - startTime)}ms`);
    });

    // ── Navigation ──────────────────────────────────────
    setupNavigation();

    // ── Theme Toggle ────────────────────────────────────
    setupThemeToggle();

    // ── Mode Buttons ────────────────────────────────────
    setupModeButtons();
}

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-links li');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const page = link.getAttribute('data-page');
            if (page === 'logout') {
                logout();
                return;
            }
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            handleNavigation(page);
        });
    });
}

function setupThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;
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
}

function setupModeButtons() {
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.getAttribute('data-mode');
            import('./ui.js').then(({ setOperationMode }) => setOperationMode(mode));
        });
    });
}

function hideAppChrome() {
    const sidebar = document.querySelector('.sidebar');
    const micBtn = document.getElementById('mic-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const transcript = document.getElementById('transcript-container');
    if (sidebar) sidebar.style.display = 'none';
    if (micBtn) micBtn.style.display = 'none';
    if (themeToggle) themeToggle.style.display = 'none';
    if (transcript) transcript.classList.add('hidden');
}

function showAppChrome() {
    const sidebar = document.querySelector('.sidebar');
    const micBtn = document.getElementById('mic-btn');
    const themeToggle = document.getElementById('theme-toggle');
    if (sidebar) sidebar.style.display = 'flex';
    if (micBtn) micBtn.style.display = 'flex';
    if (themeToggle) themeToggle.style.display = 'flex';
}

function updateUserProfile() {
    const user = getCurrentUser();
    if (!user) return;
    const logo = document.querySelector('.logo h1');
    if (logo) {
        logo.innerHTML = `LogiVoice <span style="font-size:0.6rem;opacity:0.75;display:block;font-weight:400">${user.name} (${user.role})</span>`;
    }
}

async function fetchShipments() {
    try {
        const response = await fetch('http://localhost:5050/api/active-shipments');
        const shipments = await response.json();
        updateShipmentMarkers(shipments);
        const remaining = shipments.filter(s => s.assignedDriver === null).length;
        updateOrderCount(remaining);

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
                    <div class="about-hero">
                        <div class="about-brand">
                            <span class="material-icons-round">local_shipping</span>
                            <h1>LogiVoice</h1>
                            <p>The Intelligent Voice Layer for Modern Logistics</p>
                        </div>
                    </div>
                    
                    <div class="about-grid">
                        <div class="about-card main-vision">
                            <h2><span class="material-icons-round">visibility</span> Our Vision</h2>
                            <p>To redefine the logistics industry by creating a completely hands-free operational environment. We believe that technology should empower workers, not distract them. LogiVoice is built to keep eyes on the road and hands on the wheel.</p>
                        </div>

                        <div class="about-card">
                            <h2><span class="material-icons-round">psychology</span> AI-Driven Efficiency</h2>
                            <p>Leveraging domain-specific Natural Language Understanding (NLU), LogiVoice parses complex logistics intents in real-time, reducing manual data entry by up to 80%.</p>
                        </div>

                        <div class="about-card">
                            <h2><span class="material-icons-round">security</span> Safety First</h2>
                            <p>By eliminating the need to interact with screens during transit, we dramatically improve driver safety and compliance. Natural voice commands allow for focus where it matters most.</p>
                        </div>

                        <div class="about-card explorer-mode" style="grid-column: span 2">
                            <h2><span class="material-icons-round">hub</span> Ecosystem Integration</h2>
                            <div class="ecosystem-stats">
                                <div class="e-stat"><strong>99.9%</strong><span>Uptime</span></div>
                                <div class="e-stat"><strong>< 200ms</strong><span>Latencey</span></div>
                                <div class="e-stat"><strong>100%</strong><span>Secure SSL</span></div>
                            </div>
                            <p>LogiVoice integrates seamlessly with Warehouse Management Systems (WMS) and ERPs to provide a unified voice interface for the entire supply chain, from the first mile to the last.</p>
                        </div>
                    </div>

                    <div class="about-footer">
                        <p>© 2026 LogiVoice Systems. Built for the future of transportation.</p>
                        <div class="about-version">Enterprise Edition v2.0.4</div>
                    </div>
                </div>
            `;
            break;
        case 'demo':
            renderDemoGuide();
            break;
        default:
            renderLanding();
    }
}
