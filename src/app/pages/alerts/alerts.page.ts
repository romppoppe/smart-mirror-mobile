import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController, NavController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { HealthService, AlertEvent } from '../../services/health.service';
import { AuthService } from '../../services/auth.service';

type FilterKey = 'pending' | 'all';

@Component({
  standalone: true,
  selector: 'app-alerts',
  imports: [CommonModule, IonicModule, FormsModule, RouterModule],
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
    private toast: ToastController,
    private navCtrl: NavController
  ) {}

  ngOnInit() {
    this.authSub = this.auth.user$.subscribe((user) => {
      const newUid = user?.uid ?? null;
      if (newUid === this.currentUid) return;
      this.currentUid = newUid;
      this.resetState();
      if (!newUid) {
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

  goBack() {
    this.navCtrl.back();
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
      },
    });
    this.sub.add(this.alertsSub);
  }

  get shownAlerts(): AlertEvent[] {
    if (this.filter === 'all') return this.alerts;
    return this.alerts.filter(a => a.handled !== true);
  }

  // ✅ Función auxiliar necesaria para el HTML
  getStatus(a: any): string {
    return a.status || a.type || 'normal';
  }

  statusLabel(status?: string) {
    const s = (status || '').toLowerCase();
    if (s === 'risk') return 'RIESGO';
    if (s === 'warning') return 'ALERTA';
    return 'NORMAL';
  }

  formatTs(ts: any): string {
    try {
      const ms = typeof ts?.toMillis === 'function' ? ts.toMillis() : typeof ts === 'number' ? ts : new Date(ts).getTime();
      return new Date(ms).toLocaleString('es-EC', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return ''; }
  }

  async markAsHandled(alert: AlertEvent) {
    try {
      await this.health.markAlertHandled(alert.id);
      this.alerts = this.alerts.map(a => a.id === alert.id ? { ...a, handled: true, handledAt: new Date() as any } : a);
      const t = await this.toast.create({ message: 'Alerta atendida ✅', duration: 1200, position: 'bottom', color: 'success' });
      await t.present();
    } catch (e) {
      console.error(e);
    }
  }
}