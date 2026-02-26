import { io } from "socket.io-client";
import { speak } from './voice.js';
import { getAuthHeaders } from './auth.js';

const API_URL = "http://localhost:5050/api";
const socket = io("http://localhost:5050");

// ── Caching Helpers ──────────────────────────────────────────────────────────
const saveToCache = (key, data) => {
    try {
        localStorage.setItem(`v2_cache_${key}`, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    } catch (e) { }
};

export const getFromCache = (key) => {
    try {
        const cached = localStorage.getItem(`v2_cache_${key}`);
        return cached ? JSON.parse(cached).data : null;
    } catch (e) {
        return null;
    }
};

let currentShipment = null;

// Helper to format backend data for UI
const formatShipment = (s) => ({
    id: s.shipmentId,
    status: s.status,
    origin: s.location.split(' - ')[0] || s.location || 'Unknown',
    destination: s.nextStop,
    eta: s.eta,
    location: s.location,
    customer: s.customer || 'N/A',
    consignee: s.consignee || 'N/A',
    consigneePhone: s.consigneePhone || '',
    deliveryWindow: s.deliveryWindow || 'N/A',
    specialInstructions: s.specialInstructions || 'None',
    coordinates: s.coordinates
});

export const getShipment = async (id) => {
    try {
        const res = await fetch(`${API_URL}/shipments/${id}`);
        if (!res.ok) return null;
        const data = await res.json();
        currentShipment = data;
        return formatShipment(data);
    } catch (err) {
        console.error("Error fetching shipment:", err);
        return null;
    }
};

export const updateShipmentStatus = async (id, newStatus) => {
    try {
        const res = await fetch(`${API_URL}/shipments/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status: newStatus, userId: 'voice-user' })
        });
        if (!res.ok) return null;
        const data = await res.json();
        return formatShipment(data.shipment);
    } catch (err) {
        console.error("Error updating status:", err);
        return null;
    }
};

export const getTasks = async () => {
    try {
        const res = await fetch(`${API_URL}/tasks`, { headers: getAuthHeaders() });
        if (!res.ok) return [];
        const data = await res.json();
        saveToCache('tasks', data);
        return data;
    } catch (err) {
        console.error("Error fetching tasks:", err);
        return getFromCache('tasks') || [];
    }
};

export const markTaskComplete = async (taskId) => {
    try {
        const res = await fetch(`${API_URL}/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { "Content-Type": "application/json", ...getAuthHeaders() }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.error("Error completing task:", err);
        return null;
    }
};

export const reportException = async (shipmentId, type, notes) => {
    try {
        const res = await fetch(`${API_URL}/exceptions`, {
            method: 'POST',
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({ shipmentId, type, notes })
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.error("Error logging exception:", err);
        return null;
    }
};

export const getExceptions = async () => {
    try {
        const res = await fetch(`${API_URL}/exceptions`, { headers: getAuthHeaders() });
        if (!res.ok) return [];
        const data = await res.json();
        saveToCache('exceptions', data);
        return data;
    } catch (err) {
        console.error("Error fetching exceptions:", err);
        return getFromCache('exceptions') || [];
    }
};

export const notifyConsignee = async (shipmentId) => {
    const id = shipmentId || (currentShipment ? currentShipment.shipmentId : null);
    if (!id) return null;
    try {
        const res = await fetch(`${API_URL}/notify-consignee`, {
            method: 'POST',
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({ shipmentId: id, message: 'Delay notification from driver' })
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.error("Error notifying consignee:", err);
        return null;
    }
};

export const getAuditLog = async () => {
    try {
        const res = await fetch(`${API_URL}/audit-log`, { headers: getAuthHeaders() });
        if (!res.ok) return [];
        return await res.json();
    } catch (err) {
        console.error("Error fetching audit log:", err);
        return [];
    }
};

export const logAudit = async (action, details) => {
    try {
        await fetch(`${API_URL}/audit`, {
            method: 'POST',
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({ action, details })
        });
    } catch (err) {
        console.error("Error logging audit:", err);
    }
};

export const getNextStop = () => {
    if (currentShipment) {
        return {
            address: currentShipment.nextStop,
            distance: "Calculating...",
            time: currentShipment.eta,
            consignee: currentShipment.consignee || 'N/A',
            deliveryWindow: currentShipment.deliveryWindow || 'N/A'
        };
    }
    return { address: "No active shipment", distance: "--", time: "--", consignee: "--", deliveryWindow: "--" };
};
