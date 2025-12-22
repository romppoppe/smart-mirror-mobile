import { Injectable } from '@angular/core';
import { auth, db } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export type UserProfile = {
  uid: string;
  email: string;
  displayName?: string;
  createdAt?: any;
  updatedAt?: any;

  // campos “tesis” para salud (puedes ampliar luego)
  age?: number;
  gender?: 'M' | 'F' | 'O';
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  get currentUser(): User | null {
    return auth.currentUser;
  }

    currentUid(): string | null {
    return auth.currentUser?.uid ?? null;
  }

  async saveFcmToken(uid: string, token: string) {
    await setDoc(
      doc(db, 'users', uid),
      {
        fcmToken: token,
        platform: 'android',
        tokenUpdatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }


  async register(email: string, password: string, displayName?: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }

    // Crear perfil en Firestore
    const profile: UserProfile = {
      uid: cred.user.uid,
      email: cred.user.email ?? email,
      displayName: displayName ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'users', cred.user.uid), profile, { merge: true });

    return cred.user;
  }

  async login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }

  async logout() {
    await signOut(auth);
  }
}
