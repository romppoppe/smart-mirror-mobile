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
  addDoc,
  serverTimestamp,
  QuerySnapshot,
  DocumentData,
  where,
  Timestamp,
} from 'firebase/firestore';

export type VitalStatus = 'normal' | 'warning' | 'risk';

export type VitalReading = {
  id: string;

  hr?: number;
  spo2?: number;
  hrv?: number;
  temp?: number;

  status?: VitalStatus;
  reasons?: string[];

  ts?: any;          // Timestamp (ideal) o ms
  deviceTs?: number; // epoch seconds (del dispositivo)

  evaluatedAt?: any;
  source?: string;

  present?: boolean;
  day?: string;

  // opcionales que ya tienes en tu BD
  samples?: any;
  meta?: any;
  quality?: any;
  norm?: any;
};

export type AlertEvent = {
  id: string;

  type?: string;
  status?: VitalStatus;
  message?: string;

  reasons?: string[];
  createdAt?: any;
  ts?: any;

  handled?: boolean;
  handledAt?: any;

  vitalsRefPath?: string;
  readingRef?: string;
  vitals?: any;

  // legacy backend
  level?: string;
};

// ✅ EN MÓVIL: usar "ts" para ordenar (coincide con tu monitor y evita desfases de deviceTs)
const ORDER_FIELD_TS: 'ts' = 'ts';

// (lo dejamos declarado por si lo necesitas en el futuro sin romper nada)
const ORDER_FIELD_DEVICE: 'deviceTs' = 'deviceTs';

@Injectable({ providedIn: 'root' })
export class HealthService {
  private vitalsCol(uid: string) {
    return collection(db, 'readings', uid, 'vitals');
  }

  private alertsCol(uid: string) {
    return collection(db, 'alerts', uid, 'events');
  }

  /** ✅ Última lectura REAL: orderBy(ts desc)
   *  - Evita el bug de deviceTs desfasado.
   *  - Documentos sin ts quedan al final (no rompen).
   */
  latestReading$(): Observable<VitalReading | null> {
    return new Observable<VitalReading | null>((sub) => {
      let unsubSnap: (() => void) | null = null;

      const stopAuth = onAuthStateChanged(auth, (user) => {
        if (unsubSnap) { unsubSnap(); unsubSnap = null; }

        if (!user) {
          sub.next(null);
          return;
        }

        const colRef = this.vitalsCol(user.uid);
        const q = query(colRef, orderBy(ORDER_FIELD_TS, 'desc'), limit(1));

        unsubSnap = onSnapshot(
          q,
          (snap: QuerySnapshot<DocumentData>) => {
            if (snap.empty) {
              sub.next(null);
              return;
            }

            const d = snap.docs[0];
            sub.next({ id: d.id, ...(d.data() as any) } as VitalReading);
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

  /** ✅ Historial por cantidad (ordenado por ts desc) */
  lastReadings$(take = 50): Observable<VitalReading[]> {
    return new Observable<VitalReading[]>((sub) => {
      let unsubSnap: (() => void) | null = null;

      const stopAuth = onAuthStateChanged(auth, (user) => {
        if (unsubSnap) { unsubSnap(); unsubSnap = null; }

        if (!user) {
          sub.next([]);
          return;
        }

        const colRef = this.vitalsCol(user.uid);
        const q = query(colRef, orderBy(ORDER_FIELD_TS, 'desc'), limit(take));

        unsubSnap = onSnapshot(
          q,
          (snap) => {
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

  /** ✅ Historial por rango (horas atrás) usando ts (Timestamp) */
  lastReadingsByRange$(hoursBack: number): Observable<VitalReading[]> {
    return new Observable<VitalReading[]>((sub) => {
      let unsubSnap: (() => void) | null = null;

      const stopAuth = onAuthStateChanged(auth, (user) => {
        if (unsubSnap) { unsubSnap(); unsubSnap = null; }

        if (!user) {
          sub.next([]);
          return;
        }

        const sinceMs = Date.now() - hoursBack * 60 * 60 * 1000;
        const sinceTs = Timestamp.fromMillis(sinceMs);

        const colRef = this.vitalsCol(user.uid);

        // ✅ where + orderBy en el MISMO campo (ts) => estable y sin líos de deviceTs
        const q = query(
          colRef,
          where(ORDER_FIELD_TS, '>=', sinceTs),
          orderBy(ORDER_FIELD_TS, 'desc')
        );

        unsubSnap = onSnapshot(
          q,
          (snap: QuerySnapshot<DocumentData>) => {
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

  /** ✅ Alertas (tu BD puede tener createdAt; si no, lo cambiamos luego) */
  latestAlerts$(take = 20): Observable<AlertEvent[]> {
    return new Observable<AlertEvent[]>((sub) => {
      let unsubSnap: (() => void) | null = null;

      const stopAuth = onAuthStateChanged(auth, (user) => {
        if (unsubSnap) { unsubSnap(); unsubSnap = null; }

        if (!user) {
          sub.next([]);
          return;
        }

        const colRef = this.alertsCol(user.uid);

        // Si tus alerts sí tienen createdAt, esto está perfecto.
        // Si no, me dices y lo cambiamos a ts.
        const q = query(colRef, orderBy('createdAt', 'desc'), limit(take));

        unsubSnap = onSnapshot(
          q,
          (snap: QuerySnapshot<DocumentData>) => {
            const rows: AlertEvent[] = snap.docs.map((d) => {
              const data = d.data() as any;
              const level = (data.level || data.type || data.status || 'normal') as VitalStatus;
              const reasons: string[] = Array.isArray(data.reasons) ? data.reasons : [];

              return {
                id: d.id,
                ...data,
                type: data.type ?? level,
                status: data.status ?? level,
                message: data.message ?? (reasons.length ? reasons.join(' • ') : undefined),
              };
            });

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

  async markAlertHandled(alertId: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Usuario no autenticado');

    const ref = doc(db, 'alerts', uid, 'events', alertId);
    await updateDoc(ref, {
      handled: true,
      handledAt: serverTimestamp(),
    });
  }

  async createAutomaticAlert(uid: string, message: string, type: 'risk' | 'warning', vitals: any) {
    const colRef = this.alertsCol(uid);

    await addDoc(colRef, {
      type,
      message,
      vitals,
      createdAt: serverTimestamp(),
      handled: false,
      reasons: [message],
    });
  }
}
