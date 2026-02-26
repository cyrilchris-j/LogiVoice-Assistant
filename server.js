const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Shipment = require("./models/Shipment");
const User = require("./models/User");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST", "PATCH"] }
});

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const MONGO_URI = "mongodb://localhost:27017/logistics-assistant";

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.error(err));

// In-memory stores for prototype (exceptions, audit log, tasks)
let exceptions = [];
let auditLog = [];
let tasks = [
    { id: 1, text: 'Inspect vehicle #402', status: 'pending', assignedMode: 'driver', type: 'inspection' },
    { id: 2, text: 'Load shipment #102 – Bay 4', status: 'pending', assignedMode: 'warehouse', type: 'loading' },
    { id: 3, text: 'Putaway SKU-8842 – Rack C3', status: 'pending', assignedMode: 'warehouse', type: 'putaway' },
    { id: 4, text: 'Deliver shipment #101 to Egmore', status: 'pending', assignedMode: 'driver', type: 'delivery' },
    { id: 5, text: 'Submit daily trip log', status: 'completed', assignedMode: 'driver', type: 'admin' },
    { id: 6, text: 'Verify loading sequence – Truck VH-001', status: 'pending', assignedMode: 'warehouse', type: 'loading' },
    { id: 7, text: 'Confirm consignee contact – Shipment #103', status: 'pending', assignedMode: 'dispatcher', type: 'coordination' }
];

// JWT Middleware (Simplified for demo to accept Firebase UIDs)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "No token provided" });
    }

    // For the demo, we'll assume any token provided is a valid UID from Firebase
    // In a real app, you would verify the Firebase ID Token here.
    req.user = { id: token, username: "firebase-user", role: "driver" };

    // special check for admin username if sent as token from our mock logic
    if (token.includes('admin')) {
        req.user.role = 'admin';
    }

    next();
};

// Audit helper
const addAudit = (action, details, userId = 'system') => {
    const entry = {
        id: auditLog.length + 1,
        action,
        details,
        userId,
        timestamp: new Date().toISOString()
    };
    auditLog.unshift(entry);
    if (auditLog.length > 50) auditLog.pop();
    return entry;
};

// Seed Database
const seedDatabase = async () => {
    const shipmentCount = await Shipment.countDocuments();
    if (shipmentCount === 0) {
        const shipments = [
            {
                shipmentId: '101',
                status: 'In Transit',
                location: 'Chennai Central',
                coordinates: { lat: 13.0827, lng: 80.2707 },
                eta: '20 mins',
                nextStop: 'Egmore',
                customer: 'Rajan Textiles Pvt Ltd',
                consignee: 'Mr. Rajan Kumar',
                consigneePhone: '+91-98401-12345',
                deliveryWindow: '10:00 AM – 12:00 PM',
                specialInstructions: 'Fragile – Handle with care',
                assignedDriver: null
            },
            {
                shipmentId: '102',
                status: 'Pending',
                location: 'T Nagar',
                coordinates: { lat: 13.0418, lng: 80.2341 },
                eta: '45 mins',
                nextStop: 'Guindy',
                customer: 'Priya Electronics',
                consignee: 'Ms. Priya Nair',
                consigneePhone: '+91-98765-54321',
                deliveryWindow: '2:00 PM – 4:00 PM',
                specialInstructions: 'Requires signature on delivery',
                assignedDriver: null
            },
            {
                shipmentId: '103',
                status: 'Pending',
                location: 'Adyar',
                coordinates: { lat: 13.0012, lng: 80.2565 },
                eta: '1 hr',
                nextStop: 'Velachery',
                customer: 'Global Pharma Ltd',
                consignee: 'Dr. Suresh Babu',
                consigneePhone: '+91-98400-65432',
                deliveryWindow: '9:00 AM – 11:00 AM',
                specialInstructions: 'Temperature sensitive – keep cool',
                assignedDriver: null
            },
            {
                shipmentId: '104',
                status: 'Pending',
                location: 'Anna Nagar',
                coordinates: { lat: 13.0850, lng: 80.2117 },
                eta: '30 mins',
                nextStop: 'Koyambedu',
                customer: 'Chennai Traders Co.',
                consignee: 'Mr. Venkat Rao',
                consigneePhone: '+91-94445-78901',
                deliveryWindow: '11:00 AM – 1:00 PM',
                specialInstructions: 'Leave at reception if unavailable',
                assignedDriver: null
            }
        ];
        await Shipment.insertMany(shipments);
        console.log("Database seeded with shipments");
    }

    // Always re-seed users so passwords stay in sync
    await User.deleteMany({});
    const users = [
        { username: 'admin', password: 'admin12345', name: 'System Admin', role: 'admin', vehicleId: null },
        { username: 'driver1', password: 'driver1', name: 'Venkatesh', role: 'driver', vehicleId: 'VH-001' },
        { username: 'driver2', password: 'driver2', name: 'Suresh', role: 'driver', vehicleId: 'VH-002' },
        { username: 'driver3', password: 'driver3', name: 'Karthik', role: 'driver', vehicleId: 'VH-003' },
        { username: 'driver4', password: 'driver4', name: 'Anand', role: 'driver', vehicleId: 'VH-004' },
        { username: 'driver5', password: 'driver5', name: 'Rajesh', role: 'driver', vehicleId: 'VH-005' }
    ];
    // Save individually so the pre-save bcrypt hook runs per document
    for (const u of users) {
        const doc = new User(u);
        await doc.save();
    }
    console.log("Users seeded:", users.map(u => u.username).join(', '));
};
seedDatabase();

// --- AUTH ROUTES ---
app.post("/api/auth/register", async (req, res) => {
    try {
        const { username, password, name, role, vehicleId } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ message: "Username already exists" });
        const user = new User({ username, password, name, role, vehicleId });
        await user.save();
        res.status(201).json({ message: "User registered successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({ message: "Invalid credentials" });
        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });
        const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user._id, username: user.username, name: user.name, role: user.role, vehicleId: user.vehicleId } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SHIPMENT ROUTES ---
app.get("/api/shipments/:id", async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ shipmentId: req.params.id });
        if (!shipment) return res.status(404).json({ message: "Shipment not found" });
        res.json(shipment);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/shipments/update", async (req, res) => {
    const { id, status, userId } = req.body;
    try {
        const shipment = await Shipment.findOneAndUpdate(
            { shipmentId: id },
            { status },
            { new: true }
        ).populate('assignedDriver', 'name username');
        if (!shipment) return res.status(404).json({ message: "Shipment not found" });

        const audit = addAudit('STATUS_UPDATE', `Shipment ${id} → ${status}`, userId || 'voice-user');
        io.emit("shipmentUpdated", shipment);
        io.emit("auditAdded", audit);

        res.json({ message: "Updated successfully", shipment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/shipments/:id/assign", authenticateToken, async (req, res) => {
    try {
        const shipment = await Shipment.findOneAndUpdate(
            { shipmentId: req.params.id, assignedDriver: null },
            { assignedDriver: req.user.id, status: 'Processing' },
            { new: true }
        ).populate('assignedDriver', 'name username');
        if (!shipment) return res.status(400).json({ message: "Shipment already assigned or not found" });
        io.emit("shipmentAssigned", shipment);
        res.json({ message: "Shipment assigned", shipment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/active-shipments", async (req, res) => {
    try {
        const shipments = await Shipment.find({ status: { $ne: 'Delivered' } }).populate('assignedDriver', 'name username');
        res.json(shipments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- TASKS API ---
app.get("/api/tasks", authenticateToken, (req, res) => {
    res.json(tasks);
});

app.patch("/api/tasks/:id", authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const task = tasks.find(t => t.id === id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    task.status = 'completed';
    const audit = addAudit('TASK_COMPLETE', `Task #${id}: ${task.text}`, req.user.username || 'voice-user');
    io.emit("taskUpdated", task);
    io.emit("auditAdded", audit);
    res.json({ message: "Task completed", task });
});

// --- EXCEPTIONS API ---
app.post("/api/exceptions", authenticateToken, (req, res) => {
    const { shipmentId, type, notes } = req.body;
    const exception = {
        id: exceptions.length + 1,
        shipmentId,
        type: type || 'general',
        notes: notes || '',
        reportedBy: req.user.username || 'voice-user',
        timestamp: new Date().toISOString()
    };
    exceptions.unshift(exception);
    if (exceptions.length > 20) exceptions.pop();

    const audit = addAudit('EXCEPTION_LOGGED', `${type} for shipment ${shipmentId}: ${notes}`, req.user.username || 'voice-user');
    io.emit("exceptionLogged", exception);
    io.emit("auditAdded", audit);

    res.status(201).json({ message: "Exception logged", exception });
});

app.get("/api/exceptions", authenticateToken, (req, res) => {
    res.json(exceptions);
});

// --- NOTIFY CONSIGNEE ---
app.post("/api/notify-consignee", authenticateToken, async (req, res) => {
    const { shipmentId, message } = req.body;
    try {
        const shipment = await Shipment.findOne({ shipmentId });
        const consignee = shipment ? shipment.consignee : 'Consignee';
        const audit = addAudit('CONSIGNEE_NOTIFIED', `Delay notification sent to ${consignee} for shipment ${shipmentId}`, req.user.username || 'voice-user');
        io.emit("consigneeNotified", { shipmentId, consignee, message });
        io.emit("auditAdded", audit);
        res.json({ message: `Delay notification sent to ${consignee}`, consignee });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AUDIT LOG ---
app.get("/api/audit-log", authenticateToken, (req, res) => {
    res.json(auditLog);
});

app.post("/api/audit", authenticateToken, (req, res) => {
    const { action, details } = req.body;
    const entry = addAudit(action, details, req.user.username || 'voice-user');
    io.emit("auditAdded", entry);
    res.status(201).json(entry);
});

// --- ADMIN STATS ---
app.get("/api/admin/stats", authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin access required" });
    try {
        const totalShipments = await Shipment.countDocuments({ status: { $ne: 'Delivered' } });
        const driverCount = await User.countDocuments({ role: 'driver' });
        const deliveredToday = await Shipment.countDocuments({ status: 'Delivered' });
        res.json({
            remainingOrders: totalShipments,
            onlineDrivers: driverCount,
            deliveredToday,
            activeExceptions: exceptions.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- LOCATION TRACKING ---
app.post("/api/location/update", authenticateToken, async (req, res) => {
    try {
        const { lat, lng } = req.body;
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { currentLocation: { lat, lng, timestamp: new Date() } },
            { new: true }
        ).select('-password');
        io.emit("locationUpdated", { userId: user._id, username: user.username, name: user.name, location: user.currentLocation });
        res.json({ message: "Location updated", location: user.currentLocation });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Socket.io
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    socket.on("disconnect", () => console.log("User disconnected:", socket.id));
});

const PORT = process.env.PORT || 5050;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
