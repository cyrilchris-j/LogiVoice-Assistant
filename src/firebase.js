import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyD4nTbvNzlI9UL3FJLW4HbbjL18XtJPVKE",
    authDomain: "tnimpact-60157.firebaseapp.com",
    projectId: "tnimpact-60157",
    storageBucket: "tnimpact-60157.firebasestorage.app",
    messagingSenderId: "19530753020",
    appId: "1:19530753020:web:88cfa4a03c681cbf830879",
    measurementId: "G-QWLD727ZYB",
    databaseURL: "https://tnimpact-60157-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);     // Realtime Database (live locations)
export const firestore = getFirestore(app);   // Firestore (user profiles + roles)
