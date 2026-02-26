import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'firebase/auth';
import {
    doc,
    setDoc,
    getDoc,
    serverTimestamp
} from 'firebase/firestore';
import { auth, firestore } from './firebase.js';

// ── Internal state ────────────────────────────────────────────────────────────
let currentUser = null;      // Firebase auth user
let currentProfile = null;   // Firestore profile { username, name, role, ... }
let _profileFetchPromise = null;

const fetchProfile = async (uid) => {
    // 1. Check in-memory promise (ongoing request)
    if (_profileFetchPromise && _profileFetchPromise.uid === uid) {
        return _profileFetchPromise.promise;
    }

    // 2. Check LocalStorage Cache for instant access
    const cached = localStorage.getItem(`profile_${uid}`);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            console.log(`[Auth] Using cached profile for ${uid}`);
            // Return cached version immediately if requested
            _profileFetchPromise = { uid, promise: Promise.resolve(parsed) };
        } catch (e) {
            localStorage.removeItem(`profile_${uid}`);
        }
    }

    const promise = (async () => {
        try {
            console.log(`[Auth] Fetching fresh profile for ${uid}...`);
            let snap = await getDoc(doc(firestore, 'users', uid));
            let retries = 0;
            while (!snap.exists() && retries < 5) {
                await new Promise(r => setTimeout(r, 200));
                snap = await getDoc(doc(firestore, 'users', uid));
                retries++;
            }
            const data = snap.exists() ? snap.data() : null;
            if (data) {
                console.log(`[Auth] Fresh profile saved to cache for ${uid}`);
                localStorage.setItem(`profile_${uid}`, JSON.stringify(data));
            }
            return data;
        } catch (err) {
            console.error("fetchProfile error:", err);
            return null;
        }
    })();

    _profileFetchPromise = { uid, promise };
    return promise;
};

// ── Username → email helper ───────────────────────────────────────────────────
// Firebase Auth requires an email address; we append a domain to usernames.
const toEmail = (username) => `${username.toLowerCase().trim()}@logivoice.app`;

// ── Create/ensure admin account ───────────────────────────────────────────────
// This now uses a dedicated check or occurs without triggering a global sign-out
// to avoid breaking the active session detection in the UI.
export const ensureAdminAccount = async () => {
    const adminEmail = toEmail('admin');
    try {
        // We use getDoc directly to check if admin exists in Firestore
        // This is a proxy for "already seeded"
        const adminDoc = await getDoc(doc(firestore, 'users', 'admin_static_id'));
        if (!adminDoc.exists()) {
            // Note: In a real app we'd need auth to create the user, 
            // but for this demo/prototype we'll just ensure the Firestore doc exists
            // if we are authorized or skip if not.
            // For now, let's keep it simple: only seed if we can.
            console.log('Admin profile check...');
        }
    } catch (err) {
        console.warn('Admin check skipped:', err.message);
    }
};

// ── Auth state listener ────────────────────────────────────────────────────────
// Call this once in main.js; callback receives (user, profile) or (null, null)
export const onAuthChange = (callback) => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
            // Optimization: If we already have this user and profile in memory, return immediately
            if (currentUser && currentUser.uid === firebaseUser.uid && currentProfile) {
                callback(currentUser, currentProfile);
                return;
            }

            currentUser = firebaseUser;

            // 1. Try to get cached profile for "instant" boot
            const cached = localStorage.getItem(`profile_${firebaseUser.uid}`);
            if (cached) {
                try {
                    currentProfile = JSON.parse(cached);
                    console.log(`[Auth] Rapid-boot with cached profile for ${firebaseUser.uid}`);
                    callback(currentUser, currentProfile);
                } catch (e) {
                    currentProfile = null;
                }
            } else {
                // 2. If no cache, still call callback so UI can boot (even if profile is null initially)
                console.log(`[Auth] User detected, no cache. Booting with null profile.`);
                callback(currentUser, null);
            }

            // 3. Always fetch fresh profile in background to ensure data is up to date
            const freshProfile = await fetchProfile(firebaseUser.uid);
            if (freshProfile) {
                currentProfile = freshProfile;
                console.log(`[Auth] Background profile refresh complete.`);
                callback(currentUser, currentProfile);
            }
        } else {
            currentUser = null;
            currentProfile = null;
            callback(null, null);
        }
    });
};

// ── Login ─────────────────────────────────────────────────────────────────────
export const login = async (username, password) => {
    try {
        const cred = await signInWithEmailAndPassword(auth, toEmail(username), password);
        currentUser = cred.user;
        currentProfile = await fetchProfile(cred.user.uid);
        return { success: true, user: currentUser, profile: currentProfile };
    } catch (err) {
        console.error('Login error:', err);
        let msg = 'Invalid username or password';
        if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Please wait.';
        return { success: false, error: msg };
    }
};

// ── Register (driver self-signup) ─────────────────────────────────────────────
export const register = async (username, name, password) => {
    try {
        const cred = await createUserWithEmailAndPassword(auth, toEmail(username), password);
        const profile = {
            username: username.toLowerCase().trim(),
            name: name.trim(),
            role: 'driver',
            vehicleId: null,
            createdAt: serverTimestamp()
        };
        await setDoc(doc(firestore, 'users', cred.user.uid), profile);
        currentUser = cred.user;
        currentProfile = profile;
        _profileFetchPromise = { uid: cred.user.uid, promise: Promise.resolve(profile) };
        return { success: true, user: currentUser, profile };
    } catch (err) {
        console.error('Registration error:', err);
        let msg = 'Registration failed';
        if (err.code === 'auth/email-already-in-use') msg = 'Username already taken. Try another.';
        if (err.code === 'auth/weak-password') msg = 'Password must be at least 6 characters.';
        return { success: false, error: msg };
    }
};

// ── Logout ────────────────────────────────────────────────────────────────────
export const logout = async () => {
    if (currentUser) {
        localStorage.removeItem(`profile_${currentUser.uid}`);
    }
    await signOut(auth);
    currentUser = null;
    currentProfile = null;
    _profileFetchPromise = null;
};

// ── Getters ───────────────────────────────────────────────────────────────────
export const getCurrentUser = () => {
    if (!currentUser || !currentProfile) return null;
    return {
        id: currentUser.uid,
        username: currentProfile.username,
        name: currentProfile.name,
        role: currentProfile.role,
        vehicleId: currentProfile.vehicleId || null
    };
};

export const isAuthenticated = () => !!(currentUser && currentProfile);

export const getAuthToken = () => currentUser ? currentUser.uid : null;

export const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${currentUser ? currentUser.uid : ''}`
});

// Kept for backwards compatibility with voice.js / data.js
export const initAuth = () => { };
