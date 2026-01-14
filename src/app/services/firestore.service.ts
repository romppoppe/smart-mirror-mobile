// src/app/services/firestore.service.ts

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { db } from '../firebase';
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  updateDoc,
  deleteField,
} from 'firebase/firestore';

export interface UserProfileDB {
  uid: string;
  email?: string;
  displayName?: string;
  linkedDeviceId?: string;

  age?: number;
  sex?: string;
  weightKg?: number;
  heightCm?: number;
  activityLevel?: string;

  // ✅ NUEVO: bandera de perfil completo
  profileComplete?: boolean;

  platform?: string;
  fcmToken?: string;
  createdAt?: any;
  updatedAt?: any;

  // legacy
  data?: any;
}

/**
 * Normaliza el documento:
 * - Mantiene identidad en ROOT (displayName/email/linkedDeviceId)
 * - Trae SOLO campos médicos desde data.*
 * - Soporta el caso legacy donde existan campos con '.' literal (ej: "data.age")
 */
function normalizeProfile(raw: any): UserProfileDB {
  const r = raw || {};
  const nested = r?.data && typeof r.data === 'object' ? r.data : {};

  const profile: UserProfileDB = {
    ...(r as any),
  };

  // ✅ Campos médicos desde data.*
  if (nested.age !== undefined) profile.age = nested.age;
  if (nested.sex !== undefined) profile.sex = nested.sex;
  if (nested.weightKg !== undefined) profile.weightKg = nested.weightKg;
  if (nested.heightCm !== undefined) profile.heightCm = nested.heightCm;
  if (nested.activityLevel !== undefined) profile.activityLevel = nested.activityLevel;

  // ✅ Legacy: si alguien creó campos literal "data.age" en el root
  // (esto pasa cuando se guardó mal usando claves con punto)
  if (r['data.age'] !== undefined) profile.age = r['data.age'];
  if (r['data.sex'] !== undefined) profile.sex = r['data.sex'];
  if (r['data.weightKg'] !== undefined) profile.weightKg = r['data.weightKg'];
  if (r['data.heightCm'] !== undefined) profile.heightCm = r['data.heightCm'];
  if (r['data.activityLevel'] !== undefined) profile.activityLevel = r['data.activityLevel'];

  return profile;
}

@Injectable({ providedIn: 'root' })
export class FirestoreService {
  async getUserProfile(uid: string): Promise<UserProfileDB | null> {
    try {
      const ref = doc(db, 'users', uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;

      return normalizeProfile(snap.data());
    } catch (e) {
      console.error('[FirestoreService] getUserProfile error:', e);
      return null;
    }
  }

  /** ✅ Perfil en tiempo real (para dashboard/settings) */
  userProfile$(uid: string): Observable<UserProfileDB | null> {
    return new Observable((sub) => {
      const ref = doc(db, 'users', uid);

      return onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            sub.next(null);
            return;
          }
          sub.next(normalizeProfile(snap.data()));
        },
        (err) => sub.error(err)
      );
    });
  }

  /**
   * ✅ Actualiza perfil:
   * - ROOT: displayName / email / linkedDeviceId
   * - data: age / sex / weightKg / heightCm / activityLevel
   */
  async updateUserProfile(uid: string, data: Partial<UserProfileDB>) {
    const ref = doc(db, 'users', uid);

    // --- 1) Separar identidad (root) vs salud (data)
    const rootUpdates: any = {
      updatedAt: serverTimestamp(),
    };

    if (data.email !== undefined) rootUpdates.email = data.email;
    if (data.displayName !== undefined) rootUpdates.displayName = data.displayName;
    if (data.linkedDeviceId !== undefined) rootUpdates.linkedDeviceId = data.linkedDeviceId;

    if (data.profileComplete != undefined) rootUpdates.profileComplete = data.profileComplete;

    // si en algún momento mandas platform/fcmToken también:
    if (data.platform !== undefined) rootUpdates.platform = data.platform;
    if (data.fcmToken !== undefined) rootUpdates.fcmToken = data.fcmToken;

    const healthData: any = {};
    if (data.age !== undefined) healthData.age = data.age;
    if (data.sex !== undefined) healthData.sex = data.sex;
    if (data.weightKg !== undefined) healthData.weightKg = data.weightKg;
    if (data.heightCm !== undefined) healthData.heightCm = data.heightCm;
    if (data.activityLevel !== undefined) healthData.activityLevel = data.activityLevel;

    // Solo setear "data" si realmente viene algo médico
    if (Object.keys(healthData).length) {
      rootUpdates.data = healthData;
    }

    // --- 2) Guardar
    await setDoc(ref, rootUpdates, { merge: true });

    // --- 3) Limpieza (opcional pero MUY útil):
    // Si antes guardaste identidad dentro de data, la removemos para evitar confusiones.
    // (Esto NO borra el displayName raíz, solo el data.displayName)
    await updateDoc(ref, {
      'data.displayName': deleteField(),
      'data.email': deleteField(),
      'data.linkedDeviceId': deleteField(),
    });
  }

  async linkDeviceToUser(uid: string, linkedDeviceId: string) {
    return this.updateUserProfile(uid, { linkedDeviceId });
  }
}
