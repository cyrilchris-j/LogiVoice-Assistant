import { updateShipmentStatus, getShipment, getNextStop, getTasks, reportException, notifyConsignee, markTaskComplete, getAuditLog, logAudit } from './data.js';
import { updateShipmentCard, showRoute, renderTasks, updateTranscript, toggleMicVisual, renderExceptions, renderAuditLog, setOperationMode, appendVoiceActivity } from './ui.js';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

// Operation modes
export let currentMode = 'driver'; // driver | warehouse | dispatcher

// Text-to-Speech
export const speak = (text) => {
    window.speechSynthesis.cancel(); // Stop any current speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 1;
    utterance.rate = 0.95;
    utterance.pitch = 1;
    // Pick a clear, natural voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) ||
        voices.find(v => v.lang === 'en-US') || voices[0];
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
};

// Intent Parsing & Command Execution
const processCommand = async (transcript) => {
    const t = transcript.toLowerCase().trim();
    appendVoiceActivity(transcript);

    // ── MODE SWITCHING ──────────────────────────────────
    if (t.includes('warehouse mode') || t.includes('switch to warehouse')) {
        currentMode = 'warehouse';
        setOperationMode('warehouse');
        speak("Switched to Warehouse mode. You can now manage pick and putaway tasks.");
        return;
    }
    if (t.includes('driver mode') || t.includes('switch to driver')) {
        currentMode = 'driver';
        setOperationMode('driver');
        speak("Switched to Driver mode. Ready for delivery commands.");
        return;
    }
    if (t.includes('dispatcher mode') || t.includes('switch to dispatcher')) {
        currentMode = 'dispatcher';
        setOperationMode('dispatcher');
        speak("Switched to Dispatcher mode. You can now manage assignments and notifications.");
        return;
    }

    // ── TRACK SHIPMENT ──────────────────────────────────
    if (t.includes('track shipment') || t.includes('track order') || t.includes('shipment status')) {
        const idMatch = t.match(/(?:shipment|order)\s*(\d+)/);
        if (idMatch) {
            const id = idMatch[1];
            speak(`Tracking shipment ${id}...`);
            const shipment = await getShipment(id);
            if (shipment) {
                updateShipmentCard(shipment);
                speak(`Shipment ${id} is currently ${shipment.status}. ETA is ${shipment.eta}. Consignee is ${shipment.consignee}. Delivery window: ${shipment.deliveryWindow}. Say "call consignee" or "send delay notification" for more actions.`);
                logAudit('VOICE_TRACK', `Tracked shipment ${id}`);
            } else {
                speak(`Sorry, shipment ${id} not found.`);
            }
        } else {
            speak("Please specify a shipment ID. For example, say: track shipment 101.");
        }
        return;
    }

    // ── UPDATE STATUS / MARK ORDER ──────────────────────
    if (t.includes('update status') || t.includes('set status') || t.includes('mark order') || t.includes('mark shipment')) {
        let newStatus = 'In Transit';
        if (t.includes('delivered') || t.includes('delivery complete')) newStatus = 'Delivered';
        else if (t.includes('picked') || t.includes('pick up')) newStatus = 'Processing';
        else if (t.includes('transit')) newStatus = 'In Transit';
        else if (t.includes('pending')) newStatus = 'Pending';

        const idMatch = t.match(/(?:order|shipment)\s*(\d+)/);
        const id = idMatch ? idMatch[1] : '101';

        speak(`Updating shipment ${id} to ${newStatus}...`);
        const updated = await updateShipmentStatus(id, newStatus);
        if (updated) {
            updateShipmentCard(updated);
            speak(`Done. Shipment ${id} is now marked as ${newStatus}.`);
        } else {
            speak(`Could not update shipment status. Please try again.`);
        }
        return;
    }

    // ── EXCEPTION LOGGING ───────────────────────────────
    if (t.includes('package damaged') || t.includes('item damaged') || t.includes('damaged')) {
        const idMatch = t.match(/(?:shipment|order)\s*(\d+)/);
        const id = idMatch ? idMatch[1] : (window._lastShipmentId || '101');
        speak(`Logging damage exception for shipment ${id}.`);
        const result = await reportException(id, 'Package Damaged', 'Reported via voice command');
        if (result) {
            renderExceptions();
            speak(`Exception logged. Dispatcher has been notified about damage to shipment ${id}.`);
        } else {
            speak("Could not log the exception. Please try again.");
        }
        return;
    }

    if (t.includes('customer not available') || t.includes('no one home') || t.includes('nobody home')) {
        const idMatch = t.match(/(?:shipment|order)\s*(\d+)/);
        const id = idMatch ? idMatch[1] : (window._lastShipmentId || '101');
        speak(`Logging customer unavailable exception for shipment ${id}.`);
        const result = await reportException(id, 'Customer Not Available', 'Reported via voice command');
        if (result) {
            renderExceptions();
            speak(`Noted. Exception logged for shipment ${id}. Consider sending a delay notification.`);
        } else {
            speak("Could not log the exception. Please try again.");
        }
        return;
    }

    if (t.includes('log exception') || t.includes('report exception')) {
        const idMatch = t.match(/(?:shipment|order)\s*(\d+)/);
        const id = idMatch ? idMatch[1] : (window._lastShipmentId || '101');
        speak(`Logging a general exception for shipment ${id}.`);
        const result = await reportException(id, 'General Exception', 'Logged via voice command');
        if (result) {
            renderExceptions();
            speak(`Exception logged for shipment ${id}.`);
        } else {
            speak("Could not log the exception.");
        }
        return;
    }

    // ── CONSIGNEE NOTIFICATION ──────────────────────────
    if (t.includes('call consignee') || t.includes('contact consignee') || t.includes('send delay') || t.includes('delay notification') || t.includes('notify consignee')) {
        const idMatch = t.match(/(?:shipment|order)\s*(\d+)/);
        const id = idMatch ? idMatch[1] : null;
        speak("Sending delay notification to consignee...");
        const result = await notifyConsignee(id);
        if (result) {
            speak(`Delay notification sent to ${result.consignee}. They have been informed of the delay.`);
            logAudit('VOICE_NOTIFY', `Notified consignee for shipment ${id || 'current'}`);
        } else {
            speak("Could not send notification. No active shipment found.");
        }
        return;
    }

    // ── TASK MANAGEMENT ─────────────────────────────────
    if (t.includes('show tasks') || t.includes('my tasks') || t.includes('todo') || t.includes('task list')) {
        await renderTasks();
        const tasks = await getTasks();
        const pending = tasks.filter(tk => tk.status === 'pending');
        speak(`You have ${pending.length} pending task${pending.length !== 1 ? 's' : ''}. ${pending.length > 0 ? `First task: ${pending[0].text}.` : ''}`);
        return;
    }

    if (t.includes('mark task') || t.includes('complete task') || t.includes('finish task') || t.includes('done task')) {
        const idMatch = t.match(/task\s*(\d+)/);
        if (idMatch) {
            const id = parseInt(idMatch[1]);
            speak(`Marking task ${id} as complete...`);
            const result = await markTaskComplete(id);
            if (result) {
                renderTasks();
                speak(`Task ${id} marked as complete. Well done!`);
            } else {
                speak(`Could not complete task ${id}.`);
            }
        } else {
            speak("Please specify a task number. For example: mark task 1 done.");
        }
        return;
    }

    // ── NEXT STOP / ROUTE ───────────────────────────────
    if (t.includes('next stop') || t.includes('route') || t.includes('navigate') || t.includes('directions')) {
        showRoute();
        const route = getNextStop();
        speak(`Next stop is ${route.address}. Distance is ${route.distance}. Estimated arrival in ${route.time}. Consignee: ${route.consignee}.`);
        logAudit('VOICE_NAVIGATION', `Requested navigation to ${route.address}`);
        return;
    }

    // ── AUDIT LOG ────────────────────────────────────────
    if (t.includes('audit log') || t.includes('show log') || t.includes('activity log')) {
        speak("Fetching audit log...");
        const logs = await getAuditLog();
        renderAuditLog(logs);
        speak(`Showing the last ${Math.min(logs.length, 10)} audit entries.`);
        return;
    }

    // ── GREETING ─────────────────────────────────────────
    if (t.includes('hello') || t.includes('hi') || t.includes('hey logivoice')) {
        speak(`Hello! I'm LogiVoice, your hands-free logistics assistant. Currently in ${currentMode} mode. What can I do for you?`);
        return;
    }

    // ── HELP ─────────────────────────────────────────────
    if (t.includes('help') || t.includes('what can you do') || t.includes('commands')) {
        speak("You can say: track shipment followed by an ID, mark order delivered, next stop, show tasks, log exception, send delay notification, show audit log, or switch to warehouse mode.");
        return;
    }

    speak("I didn't catch that. Say 'help' to hear available commands.");
};

// ── VOICE INIT ──────────────────────────────────────────
export const initVoice = () => {
    if (!SpeechRecognition) {
        console.warn("Speech Recognition not supported in this browser.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = true;

    const micBtn = document.getElementById('mic-btn');

    micBtn.addEventListener('click', () => {
        try {
            recognition.start();
            toggleMicVisual(true);
            updateTranscript("Listening...");
        } catch (e) {
            console.error("Mic error:", e);
        }
    });

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) {
                finalTranscript += res[0].transcript;
            } else {
                interimTranscript += res[0].transcript;
            }
        }

        if (interimTranscript) {
            updateTranscript(`"${interimTranscript}"`);
        }

        if (finalTranscript) {
            updateTranscript(`"${finalTranscript}"`, true);
            processCommand(finalTranscript);
            toggleMicVisual(false);
        }
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        toggleMicVisual(false);
        updateTranscript(`Error: ${event.error}. Click mic to try again.`, true);
    };

    recognition.onend = () => {
        toggleMicVisual(false);
    };

    // Load voices asynchronously
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
};
