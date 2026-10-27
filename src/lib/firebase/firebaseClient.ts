import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId
);

let authInstance: Auth | null = null;

if (isFirebaseConfigured && typeof window !== 'undefined') {
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    authInstance = getAuth(app);
  } catch (err) {
    console.warn('Firebase initialization note:', err);
  }
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
