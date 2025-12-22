import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
  QuerySnapshot,
  DocumentData,
  where,
} from 'firebase/firestore';

console.log('[FIRESTORE] projectId:', (db as any)?._databaseId?.projectId);

export type VitalStatus = 'normal' | 'warning' | 'risk';

export type VitalReading = {
  id: string;
  hr?: number;
  spo2?: number;
  hrv?: number;

  // legacy (no viene del anillo por ahora)
  temp?: number;

  status?: VitalStatus;
  reasons?: string[];

  // ring-bridge usa ambos en tus docs:
  ts?: any;        // Timestamp Firestore (si existe)
  deviceTs?: number; // epoch seconds (confiable)

  evaluatedAt?: any;
  source?: string;

  // opcional: samples (si luego quieres graficar micro-series)
  samples?: {
    hr?: number[];
    spo2?: number[];
    hrv?: number[];
  };

  present?: boolean;
  day?: string;
};

export type AlertEvent = {
  id: string;
  status?: VitalStatus;
  reasons?: string[];
  createdAt?: any;

  handled?: boolean;
  handledAt?: any;

  readingId?: string;
  readingRef?: string;

  vitals?: {
    hr?: number;
    spo2?: number;
    hrv?: number;
    temp?: number;
    ts?: any;
    source?: string;
  };
};

// ✅ MODO DISPOSITIVO ÚNICO (UID fijo del dueño del espejo)
const FIXED_RING_UID = 'bBwtTlXgcmaLkjkCZjwvBg4Ju2J2';
const RING_VITALS_PATH = ['readings', FIXED_RING_UID, 'vitals'] as const;

// Para ordenar/filtrar (mucho más estable que ts)
const ORDER_FIELD: 'deviceTs' = 'deviceTs';

@Injectable({ providedIn: 'root' })
export class HealthService {
  /**
   * ✅ Última lectura REAL (anillo): readings/{FIXED_RING_UID}/vitals ordenado por deviceTs desc
   */
  latestReading$(): Observable<VitalReading | null> {
    return new Observable<VitalReading | null>((sub) => {
      let unsubSnap: (() => void) | null = null;

      const stopAuth = onAuthStateChanged(auth, (user) => {
        console.log('[latestReading$] user:', user?.uid);

        if (unsubSnap) {
          unsubSnap();
          unsubSnap = null;
        }

        if (!user) {
          sub.next(null);
          return;
        }

        const colRef = collection(db, ...RING_VITALS_PATH);
        const q = query(colRef, orderBy(ORDER_FIELD, 'desc'), limit(1));

        unsubSnap = onSnapshot(
          q,
          (snap: QuerySnapshot<DocumentData>) => {
            console.log('[RING latest] snap.size:', snap.size);

            if (snap.empty) {
              sub.next(null);
              return;
            }

            const d = snap.docs[0];
            const data = d.data() as any;

            sub.next({ id: d.id, ...(data as any) } as VitalReading);
          },
          (err: Error) => {
            console.error('[latestReading$] ERROR:', err);
            sub.error(err);
          }
        );
      });

      return () => {
        stopAuth();
        if (unsubSnap) unsubSnap();
      };
    });
  }

  /**
   * ✅ Historial REAL: últimas N lecturas (por cantidad)
   */
  lastReadings$(take = 50): Observable<VitalReading[]> {
    return new Observable<VitalReading[]>((sub) => {
      let unsubSnap: (() => void) | null = null;

      const stopAuth = onAuthStateChanged(auth, (user) => {
        console.log('[lastReadings$] user:', user?.uid);

        if (unsubSnap) {
          unsubSnap();
          unsubSnap = null;
        }

        if (!user) {
          sub.next([]);
          return;
        }

        const colRef = collection(db, ...RING_VITALS_PATH);

        // ✅ orden robusto (deviceTs)
        const q = query(colRef, orderBy(ORDER_FIELD, 'desc'), limit(take));

        unsubSnap = onSnapshot(
          q,
          (snap) => {
            console.log('[RING lastReadings] snap.size:', snap.size);
            if (!snap.empty) {
              console.log('[RING lastReadings] first doc:', snap.docs[0].id, snap.docs[0].data());
            }

            const rows = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as any),
            })) as VitalReading[];

            sub.next(rows);
          },
          (err) => {
            console.error('[lastReadings$] ERROR:', err);
            sub.error(err);
          }
        );
      });

      return () => {
        stopAuth();
        if (unsubSnap) unsubSnap();
      };
    });
  }

  /**
   * ✅ Historial REAL por rango de tiempo (ej: 24h, 7d)
   * hoursBack: horas hacia atrás desde "ahora".
   *
   * - Con ring-bridge es más estable filtrar por deviceTs (epoch seconds)
   * - sinceSec = ahora - hoursBack
   */
  lastReadingsByRange$(hoursBack: number): Observable<VitalReading[]> {
    return new Observable<VitalReading[]>((sub) => {
      let unsubSnap: (() => void) | null = null;

      const stopAuth = onAuthStateChanged(auth, (user) => {
        console.log('[lastReadingsByRange$] user:', user?.uid, 'hoursBack:', hoursBack);

        if (unsubSnap) {
          unsubSnap();
          unsubSnap = null;
        }

        if (!user) {
          sub.next([]);
          return;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const sinceSec = nowSec - hoursBack * 60 * 60;

        const colRef = collection(db, ...RING_VITALS_PATH);

        const q = query(
          colRef,
          where(ORDER_FIELD, '>=', sinceSec),
          orderBy(ORDER_FIELD, 'desc')
        );

        unsubSnap = onSnapshot(
          q,
          (snap: QuerySnapshot<DocumentData>) => {
            console.log('[RING range] snap.size:', snap.size);

            const rows = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as any),
            })) as VitalReading[];

            sub.next(rows);
          },
          (err: Error) => {
            console.error('[lastReadingsByRange$] ERROR:', err);
            sub.error(err);
          }
        );
      });

      return () => {
        stopAuth();
        if (unsubSnap) unsubSnap();
      };
    });
  }

  /**
   * ✅ Alertas: alerts/{uid}/events ordenado por createdAt desc
   * (NO se toca; sigue igual)
   */
  latestAlerts$(take = 20): Observable<AlertEvent[]> {
    return new Observable<AlertEvent[]>((sub) => {
      let unsubSnap: (() => void) | null = null;

      const stopAuth = onAuthStateChanged(auth, (user) => {
        console.log('[latestAlerts$] user:', user?.uid);

        if (unsubSnap) {
          unsubSnap();
          unsubSnap = null;
        }

        if (!user) {
          sub.next([]);
          return;
        }

        const colRef = collection(db, 'alerts', user.uid, 'events');
        const q = query(colRef, orderBy('createdAt', 'desc'), limit(take));

        unsubSnap = onSnapshot(
          q,
          (snap: QuerySnapshot<DocumentData>) => {
            console.log('[latestAlerts$] snap.size:', snap.size);

            const rows: AlertEvent[] = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as any),
            }));

            sub.next(rows);
          },
          (err: Error) => {
            console.error('[latestAlerts$] ERROR:', err);
            sub.error(err);
          }
        );
      });

      return () => {
        stopAuth();
        if (unsubSnap) unsubSnap();
      };
    });
  }

  /**
   * ✅ Marcar alerta como vista (handled)
   */
  async markAlertHandled(alertId: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Usuario no autenticado');

    const ref = doc(db, 'alerts', uid, 'events', alertId);

    await updateDoc(ref, {
      handled: true,
      handledAt: serverTimestamp(),
    });
  }
}
