import { getCurrentUser } from './auth.js';

let map;
let markers = {
    drivers: {},
    shipments: {}
};

export const initMap = (containerId) => {
    if (map) return map;

    // Default center (Chennai)
    map = L.map(containerId).setView([13.0827, 80.2707], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Watch location
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                updateOwnLocation(latitude, longitude);
            },
            (error) => console.error("Error getting location:", error),
            { enableHighAccuracy: true, maximumAge: 30000, timeout: 27000 }
        );
    }

    return map;
};

const updateOwnLocation = async (lat, lng) => {
    const user = getCurrentUser();
    if (!user) return;

    // Send to server via API
    try {
        await fetch('http://localhost:5050/api/location/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ lat, lng })
        });
    } catch (err) {
        console.error("Location update failed", err);
    }
};

export const updateDriverMarker = (data) => {
    const { userId, username, name, location } = data;
    const { lat, lng } = location;

    if (markers.drivers[userId]) {
        markers.drivers[userId].setLatLng([lat, lng]);
    } else {
        const icon = L.divIcon({
            className: 'driver-marker',
            html: `<span class="material-icons-round">local_shipping</span>`,
            iconSize: [30, 30]
        });

        markers.drivers[userId] = L.marker([lat, lng], { icon })
            .addTo(map)
            .bindPopup(`<strong>${name}</strong> (${username})`);
    }
};

export const updateShipmentMarkers = (shipments) => {
    // Clear old markers
    Object.values(markers.shipments).forEach(m => map.removeLayer(m));
    markers.shipments = {};

    shipments.forEach(shipment => {
        const { shipmentId, coordinates, status, assignedDriver } = shipment;
        if (!coordinates) return;

        const isAssigned = assignedDriver !== null;
        const color = isAssigned ? '#6366f1' : '#10b981';

        const icon = L.divIcon({
            className: 'shipment-marker',
            html: `<span class="material-icons-round" style="color: ${color}">inventory_2</span>`,
            iconSize: [30, 30]
        });

        const popupContent = `
            <div class="map-popup">
                <h3>Shipment #${shipmentId}</h3>
                <p>Status: <strong>${status}</strong></p>
                <p>Location: ${shipment.location}</p>
                ${!isAssigned ? `<button class="take-btn" onclick="assignShipment('${shipmentId}')">Take Order</button>` : `<p>Assigned to: ${assignedDriver.name}</p>`}
            </div>
        `;

        markers.shipments[shipmentId] = L.marker([coordinates.lat, coordinates.lng], { icon })
            .addTo(map)
            .bindPopup(popupContent);
    });
};

// Global function for onclick in popups
window.assignShipment = async (id) => {
    try {
        const response = await fetch(`http://localhost:5050/api/shipments/${id}/assign`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        const data = await response.json();
        if (response.ok) {
            alert("Order taken successfully!");
        } else {
            alert(data.message || "Failed to take order");
        }
    } catch (err) {
        console.error("Assignment failed", err);
    }
};
