import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { HealthService, AlertEvent } from '../../services/health.service';
import { AuthService } from '../../services/auth.service';

type FilterKey = 'pending' | 'all';

@Component({
  standalone: true,
  selector: 'app-alerts',
  imports: [CommonModule, IonicModule, FormsModule],
  templateUrl: './alerts.page.html',
  styleUrls: ['./alerts.page.scss'],
})
export class AlertsPage implements OnInit, OnDestroy {
  private sub = new Subscription();
  private alertsSub?: Subscription;
  private authSub?: Subscription;

  alerts: AlertEvent[] = [];
  loading = true;

  filter: FilterKey = 'pending';

  private currentUid: string | null = null;

  constructor(
    private health: HealthService,
    private auth: AuthService,
    private router: Router,
    private toast: ToastController
  ) {}

  ngOnInit() {
    // ✅ Reaccionar a cambios de usuario / logout
    this.authSub = this.auth.user$.subscribe((user) => {
      const newUid = user?.uid ?? null;
      if (newUid === this.currentUid) return;

      this.currentUid = newUid;
      this.resetState();

      if (!newUid) {
        // sin sesión
        this.router.navigateByUrl('/home', { replaceUrl: true });
        return;
      }

      this.subscribeAlerts();
    });
  }

  ngOnDestroy() {
    this.alertsSub?.unsubscribe();
    this.authSub?.unsubscribe();
    this.sub.unsubscribe();
  }

  private resetState() {
    this.alertsSub?.unsubscribe();
    this.alertsSub = undefined;

    this.alerts = [];
    this.loading = true;
  }

  private subscribeAlerts() {
    this.loading = true;

    this.alertsSub = this.health.latestAlerts$(50).subscribe({
      next: (rows) => {
        this.alerts = rows ?? [];
        this.loading = false;
      },
      error: async (e) => {
        console.error('[alerts] latestAlerts$ error', e);
        this.loading = false;
        const t = await this.toast.create({
          message: 'No se pudieron cargar las alertas.',
          duration: 1800,
          position: 'bottom',
          color: 'danger',
        });
        await t.present();
      },
    });

    this.sub.add(this.alertsSub);
  }

  get shownAlerts(): AlertEvent[] {
    if (this.filter === 'all') return this.alerts;
    return this.alerts.filter(a => a.handled !== true);
  }

  private getStatusKey(a: AlertEvent): string | undefined {
    // Algunos docs usan "status", otros "type"
    return (a.status as any) || a.type;
  }

  statusColor(status?: string) {
    if (status === 'risk') return 'danger';
    if (status === 'warning') return 'warning';
    return 'success';
  }

  statusLabel(status?: string) {
    if (status === 'risk') return 'RIESGO';
    if (status === 'warning') return 'ADVERTENCIA';
    return 'NORMAL';
  }

  formatTs(ts: any): string {
    try {
      const ms =
        typeof ts?.toMillis === 'function' ? ts.toMillis() :
        typeof ts === 'number' ? ts :
        new Date(ts).getTime();

      const d = new Date(ms);
      return d.toLocaleString('es-EC', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  async markAsHandled(alert: AlertEvent) {
    try {
      await this.health.markAlertHandled(alert.id);

      // ✅ update local para UI inmediata
      this.alerts = this.alerts.map(a =>
        a.id === alert.id
          ? { ...a, handled: true, handledAt: new Date() as any }
          : a
      );

      const t = await this.toast.create({
        message: 'Alerta marcada como atendida ✅',
        duration: 1200,
        position: 'bottom',
        color: 'success',
      });
      await t.present();
    } catch (e) {
      console.error('[alerts] markAlertHandled error', e);
      const t = await this.toast.create({
        message: 'No se pudo marcar la alerta. Revisa tu conexión o permisos.',
        duration: 1800,
        position: 'bottom',
        color: 'danger',
      });
      await t.present();
    }
  }

  // Helpers para template si quieres mostrar color/label directo desde alerta
  colorFromAlert(a: AlertEvent) {
    return this.statusColor(this.getStatusKey(a));
  }

  labelFromAlert(a: AlertEvent) {
    return this.statusLabel(this.getStatusKey(a));
  }
}
