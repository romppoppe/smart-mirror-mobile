import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { auth, db } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
  onAuthStateChanged,
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

  // Campos “tesis” (puedes ampliar)
  age?: number;
  gender?: 'M' | 'F' | 'O';

  // Notificaciones
  fcmToken?: string;
  platform?: string;
  tokenUpdatedAt?: any;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user$ = new BehaviorSubject<User | null>(auth.currentUser ?? null);

  /** Observable del usuario autenticado (se actualiza en tiempo real) */
  readonly user$: Observable<User | null> = this._user$.asObservable();

  /** Observable del UID (null si no hay sesión) */
  readonly uid$: Observable<string | null> = new Observable((sub) => {
    const unsub = onAuthStateChanged(auth, (user) => sub.next(user?.uid ?? null));
    return () => unsub();
  });

  constructor() {
    // Mantener user$ sincronizado con Firebase Auth
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

  /** Útil para servicios que NECESITAN uid sí o sí */
  requireUid(): string {
    const uid = this.currentUid();
    if (!uid) throw new Error('No hay sesión activa (uid es null).');
    return uid;
  }

  /** Crea o asegura el documento users/{uid} */
  // ... tus imports se quedan igual

private async ensureUserProfile(uid: string, email: string, displayName?: string) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);

  const existing = snap.exists() ? (snap.data() as any) : null;
  const existingName = (existing?.data?.displayName ?? existing?.displayName ?? '').toString().trim();
  const incomingName = (displayName ?? '').toString().trim();

  // ✅ solo ponemos nombre si todavía no existe uno en Firestore
  const shouldWriteName = !existingName && incomingName.length > 0;

  const payload: any = {
    uid,
    email,
    updatedAt: serverTimestamp(),
    data: {
      uid,
      email,
      ...(shouldWriteName ? { displayName: incomingName } : {}),
    },
  };

  if (!snap.exists()) {
    payload.createdAt = serverTimestamp();
  }

  if (shouldWriteName) {
    payload.displayName = incomingName; // opcional mantener root
  }

  await setDoc(ref, payload, { merge: true });
}

/** ✅ Para que Auth también tenga el nombre actualizado */
async setAuthDisplayName(displayName: string) {
  const user = auth.currentUser;
  if (!user) return;

  const clean = (displayName || '').trim();
  if (!clean) return;
  if ((user.displayName || '').trim() === clean) return;

  await updateProfile(user, { displayName: clean });

  // fuerza a tu app a ver el cambio en el BehaviorSubject
  this._user$.next(auth.currentUser ?? null);
}

  async saveFcmToken(uid: string, token: string) {
    await setDoc(
      doc(db, 'users', uid),
      {
        fcmToken: token,
        platform: 'android',
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

    // Asegura perfil y refresca updatedAt
    await this.ensureUserProfile(
      cred.user.uid,
      cred.user.email ?? email,
      cred.user.displayName ?? ''
    );

    return cred.user;
  }

  async logout() {
    // Importante: aquí solo cerramos sesión.
    // El resto de la app debe escuchar uid$ / user$ y limpiar datos en UI al quedar null.
    await signOut(auth);
  }
}
