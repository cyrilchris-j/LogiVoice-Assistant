// Authentication state management
let currentUser = null;
let authToken = null;

// Initialize auth state from localStorage
export const initAuth = () => {
    authToken = localStorage.getItem('authToken') || 'mock-token';
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
        currentUser = JSON.parse(userStr);
    } else {
        // Provide a default mock user if none exists
        currentUser = {
            id: 'mock-id',
            username: 'admin',
            name: 'Admin User',
            role: 'admin'
        };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        localStorage.setItem('authToken', authToken);
    }
    return { user: currentUser, token: authToken };
};

// Login function
export const login = async (username, password) => {
    try {
        const response = await fetch('http://localhost:5050/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Login failed');
        }

        const data = await response.json();

        // Store auth data
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        return { success: true, user: currentUser };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// Logout function
export const logout = () => {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
};

// Get current user
export const getCurrentUser = () => currentUser;

// Get auth token
export const getAuthToken = () => authToken;

// Check if user is authenticated
export const isAuthenticated = () => true; // Always return true for prototype bypass

// Get auth headers for API calls
export const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
});
