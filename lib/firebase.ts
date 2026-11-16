import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAAZ-OUDT8KW-oJ7TwDjxaiNb-HOlF4P28',
  authDomain: 'short-exporter.firebaseapp.com',
  projectId: 'short-exporter',
  storageBucket: 'short-exporter.firebasestorage.app',
  messagingSenderId: '665790215066',
  appId: '1:665790215066:web:22e52a6b458cafed810023',
  measurementId: 'G-4FC914SEM1',
};

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null;
  if (!cachedApp) {
    cachedApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return cachedApp;
}

export function getDb(): Firestore | null {
  if (typeof window === 'undefined') return null;
  const app = getFirebaseApp();
  if (!app) return null;
  if (!cachedDb) {
    cachedDb = getFirestore(app);
  }
  return cachedDb;
}
