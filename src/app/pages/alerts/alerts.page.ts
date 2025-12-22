import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { HealthService, AlertEvent } from '../../services/health.service';
import { FormsModule } from '@angular/forms';

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

  alerts: AlertEvent[] = [];
  loading = true;

  filter: FilterKey = 'pending'; // por defecto: pendientes

  constructor(
    private health: HealthService,
    private toast: ToastController
  ) {}

  ngOnInit() {
    this.sub.add(
      this.health.latestAlerts$(50).subscribe({
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
          });
          await t.present();
        },
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  get shownAlerts(): AlertEvent[] {
    if (this.filter === 'all') return this.alerts;
    return this.alerts.filter(a => a.handled !== true);
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

      // ✅ actualiza local sin “desaparecer” la alerta de golpe
      this.alerts = this.alerts.map(a =>
        a.id === alert.id
          ? { ...a, handled: true, handledAt: new Date() as any }
          : a
      );

      const t = await this.toast.create({
        message: 'Alerta marcada como atendida ✅',
        duration: 1200,
        position: 'bottom',
      });
      await t.present();
    } catch (e) {
      console.error('[alerts] markAlertHandled error', e);
      const t = await this.toast.create({
        message: 'No se pudo marcar la alerta. Revisa tu conexión o permisos.',
        duration: 1800,
        position: 'bottom',
      });
      await t.present();
    }
  }
}
