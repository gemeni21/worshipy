import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBQvQyMxSSZteL5-15IPGk0YEC6Lw7mQTA',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'worshipy-6a94f.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'worshipy-6a94f',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'worshipy-6a94f.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '802566602164',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:802566602164:web:d0d0ebf6f1a93af7a706e1',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-R3SNZ1NLJV',
};

export const isFirebaseConfigured = Boolean(
  DEFAULT_FIREBASE_CONFIG.apiKey &&
  DEFAULT_FIREBASE_CONFIG.authDomain &&
  DEFAULT_FIREBASE_CONFIG.projectId
);

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;

if (isFirebaseConfigured && typeof window !== 'undefined') {
  try {
    appInstance = getApps().length > 0 ? getApp() : initializeApp(DEFAULT_FIREBASE_CONFIG);
    authInstance = getAuth(appInstance);
    firestoreInstance = getFirestore(appInstance);
  } catch (err) {
    console.warn('Firebase initialization note:', err);
  }
}

export function getFirebaseApp(): FirebaseApp | null {
  return appInstance;
}

export function getFirebaseAuth(): Auth | null {
  return authInstance;
}

export function getFirebaseFirestore(): Firestore | null {
  return firestoreInstance;
}

export async function promptGoogleSignInPopup(): Promise<{
  email: string;
  displayName?: string;
  photoURL?: string;
} | null> {
  if (!authInstance) {
    return null;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(authInstance, provider);
  const user = result.user;

  if (!user.email) {
    throw new Error('Google account did not return a valid email address.');
  }

  return {
    email: user.email,
    displayName: user.displayName || undefined,
    photoURL: user.photoURL || undefined,
  };
}

export async function promptFirebaseSignOut(): Promise<void> {
  if (authInstance) {
    try {
      await firebaseSignOut(authInstance);
    } catch {
      // ignore
    }
  }
}
