import { ref, set, onValue, serverTimestamp } from 'firebase/database';
import { db } from './firebase.js';
import { getCurrentUser } from './auth.js';

let map;
let markers = {};          // { uid: L.marker }
let shipmentMarkers = {};  // { shipmentId: L.marker }
let locationWatchId = null;
let unsubscribeLocations = null;
let lastKnownCoords = null;

// ── Init map ──────────────────────────────────────────────────────────────────
export const initMap = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return null;

    // If map already exists, check if it's still healthy
    if (map) {
        const mapContainer = map.getContainer();
        if (document.body.contains(mapContainer) && mapContainer.id === containerId) {
            map.invalidateSize();
            subscribeToLocations();
            return map;
        } else {
            // Container was removed from DOM (e.g. by ui.js re-render). 
            // We MUST remove the old instance and markers to start fresh.
            map.remove();
            map = null;
            markers = {};
            shipmentMarkers = {};
            if (unsubscribeLocations) {
                unsubscribeLocations();
                unsubscribeLocations = null;
            }
        }
    }

    const cachedCenter = localStorage.getItem('last_map_center');
    const defaultCenter = [13.0827, 80.2707];
    const initialCenter = lastKnownCoords || (cachedCenter ? JSON.parse(cachedCenter) : defaultCenter);

    map = L.map(containerId).setView(initialCenter, (lastKnownCoords || cachedCenter) ? 14 : 12);

    // Add "Locate Me" control manually for custom styling
    const locateBtn = document.createElement('button');
    locateBtn.id = 'locate-me-btn';
    locateBtn.className = 'locate-me-btn';
    locateBtn.innerHTML = '<span class="material-icons-round">my_location</span>';
    locateBtn.title = 'Center on my location';
    document.getElementById(containerId).appendChild(locateBtn);

    locateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        requestGPSPermission().then(coords => {
            if (coords) map.flyTo(coords, 15);
        }).catch(() => {
            const me = getCurrentUser();
            if (markers[me.id]) {
                map.flyTo(markers[me.id].getLatLng(), 15);
            }
        });
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Force redraw to prevent grey boxes
    setTimeout(() => map.invalidateSize(), 50);

    // Start background tracking
    startOwnLocationWatch();

    // Subscribe to ALL drivers' locations from Firebase Realtime DB
    subscribeToLocations();

    return map;
};

// ── Request GPS Permission Early ──────────────────────────────────────────
export const requestGPSPermission = () => {
    return new Promise((resolve) => {
        if (!("geolocation" in navigator)) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                lastKnownCoords = [pos.coords.latitude, pos.coords.longitude];
                console.log("[Map] Permission granted, coords:", lastKnownCoords);
                resolve(lastKnownCoords);
            },
            (err) => {
                console.warn("[Map] GPS access denied:", err.message);
                resolve(null);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
};

// ── Watch own GPS and push to Firebase ───────────────────────────────────────
export const startOwnLocationWatch = () => {
    if (!("geolocation" in navigator)) return;
    if (locationWatchId !== null) return;

    console.log("[Map] Starting background location watch...");
    locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude: lat, longitude: lng } = position.coords;
            lastKnownCoords = [lat, lng];
            pushOwnLocation(lat, lng);
        },
        (err) => console.warn("GPS error:", err.message),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
};

const pushOwnLocation = (lat, lng) => {
    const user = getCurrentUser();
    if (!user) return;

    // Write to Firebase Realtime Database — everyone subscribes to this
    set(ref(db, `locations/${user.id}`), {
        uid: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        lat,
        lng,
        updatedAt: Date.now()
    }).catch(() => { });

    // Cache center for next load
    localStorage.setItem('last_map_center', JSON.stringify([lat, lng]));
};

// ── Subscribe to ALL locations (admin + all drivers see everyone) ─────────────
const subscribeToLocations = () => {
    if (unsubscribeLocations) {
        unsubscribeLocations();
        unsubscribeLocations = null;
    }

    const locRef = ref(db, 'locations');
    unsubscribeLocations = onValue(locRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        const now = Date.now();
        const activeUids = new Set();

        Object.values(data).forEach((entry) => {
            // Only show users active in the last 10 minutes
            if (entry.lat && entry.lng && (now - entry.updatedAt < 600000)) {
                placeOrMoveMarker(entry);
                activeUids.add(entry.uid);
            }
        });

        // Remove markers for users who went offline
        Object.keys(markers).forEach(uid => {
            if (!activeUids.has(uid)) {
                if (markers[uid]) map.removeLayer(markers[uid]);
                delete markers[uid];
            }
        });

        // Fit bounds if markers exist and it's a fresh load or first marker
        if (activeUids.size > 0 && map) {
            const group = new L.featureGroup(Object.values(markers));
            if (!map._hasFitted) {
                map.fitBounds(group.getBounds().pad(0.1));
                map._hasFitted = true;
            }
        }
    });
};

// ── Place / animate marker on map ─────────────────────────────────────────────
const placeOrMoveMarker = (entry) => {
    if (!map) return;
    const { uid, name, username, role, lat, lng } = entry;
    const me = getCurrentUser();
    const isMe = me && uid === me.id;

    if (markers[uid]) {
        // Smooth animate marker to new position
        markers[uid].setLatLng([lat, lng]);
        markers[uid].getPopup().setContent(buildPopupHtml(entry, isMe));
    } else {
        const icon = buildIcon(role, isMe);
        markers[uid] = L.marker([lat, lng], { icon })
            .addTo(map)
            .bindPopup(buildPopupHtml(entry, isMe));
    }
};

const buildIcon = (role, isMe) => {
    const color = isMe ? '#6366f1' : (role === 'admin' ? '#f59e0b' : '#10b981');
    const iconName = isMe ? 'person' : (role === 'admin' ? 'admin_panel_settings' : 'local_shipping');

    return L.divIcon({
        className: '',
        html: `
            <div class="pin-marker" style="--pin-color: ${color}">
                <div class="pulse"></div>
                <div class="pin-svg">
                    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16 0C10.5 0 6 4.5 6 10C6 17.5 16 32 16 32C16 32 26 17.5 26 10C26 4.5 21.5 0 16 0Z" fill="${color}"/>
                        <circle cx="16" cy="10" r="8" fill="white"/>
                    </svg>
                    <span class="material-icons-round pin-icon">${iconName}</span>
                </div>
                ${isMe ? '<div class="me-label">YOU</div>' : ''}
            </div>`,
        iconSize: [32, 42],
        iconAnchor: [16, 42]
    });
};

const buildPopupHtml = (entry, isMe) => {
    const time = new Date(entry.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const isAdmin = entry.role === 'admin';
    return `
        <div class="map-popup-v2">
            <div class="popup-header">
                <strong>${entry.name}</strong>
                <span class="role-tag" style="background:${isAdmin ? '#fef3c7;color:#92400e' : '#dcfce7;color:#166534'}">${entry.role}</span>
            </div>
            <div class="popup-body">
                <p><span class="material-icons-round">account_circle</span> @${entry.username}</p>
                <p><span class="material-icons-round">access_time</span> Active at ${time}</p>
                <div class="live-indicator">
                    <span class="blink-dot"></span>
                    <span>LIVE TRACKING</span>
                </div>
            </div>
        </div>
    `;
};

// ── Shipment markers (unchanged from before) ──────────────────────────────────
export const updateShipmentMarkers = (shipments) => {
    if (!map) return;
    Object.values(shipmentMarkers).forEach(m => map.removeLayer(m));
    shipmentMarkers = {};

    shipments.forEach(shipment => {
        const { shipmentId, coordinates, status, assignedDriver } = shipment;
        if (!coordinates) return;
        const isAssigned = assignedDriver !== null;
        const color = isAssigned ? '#6366f1' : '#10b981';
        const icon = L.divIcon({
            className: '',
            html: `<div style="background:#fff;border:2px solid ${color};border-radius:6px;padding:2px;min-width:28px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,0.2)">
                     <span class="material-icons-round" style="color:${color};font-size:16px">inventory_2</span>
                   </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        const popup = `<div class="map-popup">
            <h3>Shipment #${shipmentId}</h3>
            <p>Status: <strong>${status}</strong></p>
            <p>Location: ${shipment.location}</p>
            ${!isAssigned
                ? `<button class="take-btn" onclick="assignShipment('${shipmentId}')">Take Order</button>`
                : `<p>Driver: ${assignedDriver.name || assignedDriver}</p>`}
        </div>`;
        shipmentMarkers[shipmentId] = L.marker([coordinates.lat, coordinates.lng], { icon })
            .addTo(map)
            .bindPopup(popup);
    });
};

// ── Called by legacy socket listener (no-op now, Firebase handles it) ─────────
export const updateDriverMarker = (data) => {
    // kept for backward compat; Firebase Realtime DB subscription replaces this
};

// ── Assign shipment popup handler ────────────────────────────────────────────
window.assignShipment = async (id) => {
    try {
        const res = await fetch(`http://localhost:5050/api/shipments/${id}/assign`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const data = await res.json();
        alert(res.ok ? "Order taken!" : data.message || "Failed");
    } catch {
        console.error("Assignment failed");
    }
};
