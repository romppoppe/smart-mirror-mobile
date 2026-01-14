import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

// Asegúrate de que esta ruta sea correcta según tu estructura
import { auth, db } from '../firebase'; 

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
  onAuthStateChanged,
  // ✅ NUEVO: Importaciones para Google y Reset Password
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from 'firebase/auth';

import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';

export type UserProfile = {
  uid: string;
  email: string;
  displayName?: string;
  createdAt?: any;
  updatedAt?: any;
  age?: number;
  gender?: 'M' | 'F' | 'O';
  fcmToken?: string;
  platform?: string;
  tokenUpdatedAt?: any;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user$ = new BehaviorSubject<User | null>(auth.currentUser ?? null);

  readonly user$: Observable<User | null> = this._user$.asObservable();

  readonly uid$: Observable<string | null> = new Observable((sub) => {
    const unsub = onAuthStateChanged(auth, (user) => sub.next(user?.uid ?? null));
    return () => unsub();
  });

  constructor() {
    onAuthStateChanged(auth, (user) => {
      this._user$.next(user ?? null);
    });
  }

  get currentUser(): User | null {
    return this._user$.value;
  }

  currentUid(): string | null {
    return this._user$.value?.uid ?? null;
  }

  requireUid(): string {
    const uid = this.currentUid();
    if (!uid) throw new Error('No hay sesión activa (uid es null).');
    return uid;
  }

  // -------------------------------------------------------------------
  // ✅ NUEVO: INICIAR SESIÓN CON GOOGLE
  // -------------------------------------------------------------------
  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    
    // Abre la ventana emergente de Google
    const cred = await signInWithPopup(auth, provider);

    // Una vez logueado, aseguramos que exista en Firestore
    await this.ensureUserProfile(
      cred.user.uid,
      cred.user.email || '',
      cred.user.displayName || 'Usuario Google'
    );

    return cred.user;
  }

  // -------------------------------------------------------------------
  // ✅ NUEVO: RECUPERAR CONTRASEÑA
  // -------------------------------------------------------------------
  async recoverPassword(email: string) {
    // Firebase envía un correo con un link mágico para resetear
    await sendPasswordResetEmail(auth, email);
  }

  // -------------------------------------------------------------------
  // MÉTODOS EXISTENTES (Mantienen tu lógica original)
  // -------------------------------------------------------------------

  private async ensureUserProfile(uid: string, email: string, displayName?: string) {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);

    const existing = snap.exists() ? (snap.data() as any) : null;
    const existingName = (existing?.data?.displayName ?? existing?.displayName ?? '').toString().trim();
    const incomingName = (displayName ?? '').toString().trim();

    const shouldWriteName = !existingName && incomingName.length > 0;

    const payload: any = {
      uid,
      email,
      updatedAt: serverTimestamp(),
      data: { // Manteniendo tu estructura de "data" interna si así la usas
        uid,
        email,
        ...(shouldWriteName ? { displayName: incomingName } : {}),
      },
    };

    if (!snap.exists()) {
      payload.createdAt = serverTimestamp();
    }

    if (shouldWriteName) {
      payload.displayName = incomingName;
    }

    await setDoc(ref, payload, { merge: true });
  }

  async setAuthDisplayName(displayName: string) {
    const user = auth.currentUser;
    if (!user) return;

    const clean = (displayName || '').trim();
    if (!clean) return;
    if ((user.displayName || '').trim() === clean) return;

    await updateProfile(user, { displayName: clean });
    this._user$.next(auth.currentUser ?? null);
  }

  async saveFcmToken(uid: string, token: string) {
    await setDoc(
      doc(db, 'users', uid),
      {
        fcmToken: token,
        platform: 'android', // Ojo: si luego lo haces para iOS o Web, esto debería ser dinámico
        tokenUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async register(email: string, password: string, displayName?: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }

    await this.ensureUserProfile(
      cred.user.uid,
      cred.user.email ?? email,
      displayName ?? cred.user.displayName ?? ''
    );

    return cred.user;
  }

  async login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password);

    await this.ensureUserProfile(
      cred.user.uid,
      cred.user.email ?? email,
      cred.user.displayName ?? ''
    );

    return cred.user;
  }

  async logout() {
    await signOut(auth);
  }
}