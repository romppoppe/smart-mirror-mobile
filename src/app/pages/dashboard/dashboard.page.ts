import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';

import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions, Plugin } from 'chart.js';

import {
  HealthService,
  VitalReading,
  AlertEvent,
  VitalStatus,
} from '../../services/health.service';

import { AccessibilityService } from '../../services/accessibility.service';
import { ReportService } from '../../services/report.service';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { Capacitor } from '@capacitor/core';

type RangeKey = '30' | '100' | '24h' | '7d';

@Component({
  standalone: true,
  selector: 'app-dashboard',
  imports: [CommonModule, IonicModule, BaseChartDirective],
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
})
export class DashboardPage implements OnInit, OnDestroy {
  private sub = new Subscription();
  private rangeSub?: Subscription;
  private authSub?: Subscription;
  private profileSub?: Subscription;

  @ViewChild(BaseChartDirective) combinedChart?: BaseChartDirective;

  // Usuario actual
  currentUserUid: string | null = null;

  // ✅ Perfil del usuario (FUENTE: Firestore en tiempo real)
  userDisplayName = 'Usuario';
  userEmail = '';

  // Perfil / dispositivo vinculado
  linkedDeviceId: string = '—';

  // Datos
  private currentRangeReadings: VitalReading[] = [];
  largeText = false;
  loading = true;
  reading: VitalReading | null = null;

  status: VitalStatus = 'normal';
  statusText = 'NORMAL';
  statusReason = '';

  alerts: AlertEvent[] = [];
  unreadAlerts = 0;
  loadingAlerts = true;

  range: RangeKey = '30';
  loadingCombined = true;

  // Configuración de Gráfica
  combinedChartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: [
      { data: [], label: 'HR (bpm)', tension: 0.35, pointRadius: 3, yAxisID: 'yHR' },
      { data: [], label: 'SpO₂ (%)', tension: 0.35, pointRadius: 3, yAxisID: 'ySpO2' },
      { data: [], label: 'HRV (ms)', tension: 0.35, pointRadius: 3, yAxisID: 'yHRV' },
    ],
  };

  private readonly THRESHOLDS = {
    hr: { warningHigh: 100, riskHigh: 120, warningLow: 50, riskLow: 40 },
    spo2: { warningLow: 94, riskLow: 90 },
    hrv: { warningLow: 20, riskLow: 10 },
  };

  // --- COLORES GRÁFICA ---
  private hrColor(v: number | null): string {
    if (v == null) return '#9ca3af';
    if (v >= this.THRESHOLDS.hr.riskHigh || v <= this.THRESHOLDS.hr.riskLow) return '#dc2626';
    if (v >= this.THRESHOLDS.hr.warningHigh || v <= this.THRESHOLDS.hr.warningLow) return '#f59e0b';
    return '#16a34a';
  }
  private spo2Color(v: number | null): string {
    if (v == null) return '#9ca3af';
    if (v <= this.THRESHOLDS.spo2.riskLow) return '#dc2626';
    if (v <= this.THRESHOLDS.spo2.warningLow) return '#f59e0b';
    return '#16a34a';
  }
  private hrvColor(v: number | null): string {
    if (v == null) return '#9ca3af';
    if (v <= this.THRESHOLDS.hrv.riskLow) return '#dc2626';
    if (v <= this.THRESHOLDS.hrv.warningLow) return '#f59e0b';
    return '#16a34a';
  }

  // --- PLUGIN UMBRALES ---
  private thresholdPlugin: Plugin<'line'> = {
    id: 'thresholdLines',
    afterDraw: (chart) => {
      const ctx = chart.ctx;
      if (!ctx) return;

      const drawHLine = (axisId: string, value: number, label: string) => {
        const scale = (chart.scales as any)?.[axisId];
        if (!scale) return;

        const y = scale.getPixelForValue(value);
        const left = chart.chartArea.left;
        const right = chart.chartArea.right;

        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#6b7280';
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();

        const text = `${label}: ${value}`;
        ctx.setLineDash([]);
        ctx.font = '12px sans-serif';
        const padding = 4;
        const textW = ctx.measureText(text).width;
        const boxX = right - textW - 10;
        const boxY = y - 14;

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(boxX - padding, boxY, textW + padding * 2, 16);
        ctx.fillStyle = '#111827';
        ctx.fillText(text, boxX, boxY + 12);
        ctx.restore();
      };

      drawHLine('yHR', this.THRESHOLDS.hr.warningHigh, 'HR warn');
      drawHLine('yHR', this.THRESHOLDS.hr.riskHigh, 'HR risk');
      drawHLine('yHR', this.THRESHOLDS.hr.warningLow, 'HR warn');
      drawHLine('yHR', this.THRESHOLDS.hr.riskLow, 'HR risk');
      drawHLine('ySpO2', this.THRESHOLDS.spo2.warningLow, 'SpO₂ warn');
      drawHLine('ySpO2', this.THRESHOLDS.spo2.riskLow, 'SpO₂ risk');
    },
  };

  combinedPlugins: Plugin<'line'>[] = [this.thresholdPlugin];

  combinedOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { labels: { font: { size: 16 }, boxWidth: 16 } },
      tooltip: { enabled: true },
    },
    scales: {
      x: { ticks: { font: { size: 14 }, autoSkip: true, maxRotation: 0 } },
      yHR: { type: 'linear', position: 'left', ticks: { font: { size: 14 } }, title: { display: true, text: 'HR (bpm)' } },
      ySpO2: { type: 'linear', position: 'right', ticks: { font: { size: 14 } }, title: { display: true, text: 'SpO₂ (%)' }, grid: { drawOnChartArea: false }, min: 80, max: 100 },
      yHRV: { type: 'linear', position: 'right', ticks: { font: { size: 14 } }, title: { display: true, text: 'HRV (ms)' }, grid: { drawOnChartArea: false }, min: 0, max: 150 },
    },
  };

  constructor(
    private health: HealthService,
    private router: Router,
    private accessibility: AccessibilityService,
    private report: ReportService,
    public auth: AuthService,
    private db: Firestore,
    private toastController: ToastController,
    private firestore: FirestoreService
  ) {}

  ngOnInit() {
    this.largeText = this.accessibility.isEnabled();

    // ✅ detectar cambios de usuario confiable
    this.authSub = this.auth.user$.subscribe(async (user) => {
      const newUid = user?.uid ?? null;

      if (newUid === this.currentUserUid) return;

      console.log('[Dashboard] Auth user changed:', newUid);

      this.currentUserUid = newUid;
      await this.handleUserChange();
    });
  }

  ngOnDestroy() {
    this.cleanupSubscriptions();
    this.authSub?.unsubscribe();
  }

  /** Limpia TODA suscripción activa (incluye perfil) */
  private cleanupSubscriptions() {
    this.sub.unsubscribe();
    this.sub = new Subscription();

    this.rangeSub?.unsubscribe();
    this.rangeSub = undefined;

    this.profileSub?.unsubscribe();
    this.profileSub = undefined;
  }

  /** Limpia UI y deja dashboard listo para el siguiente usuario */
  private resetStateVisual() {
    this.linkedDeviceId = '—';
    this.reading = null;
    this.alerts = [];
    this.unreadAlerts = 0;
    this.currentRangeReadings = [];

    // ✅ perfil visible
    this.userDisplayName = 'Usuario';
    this.userEmail = '';

    // ✅ reset chart
    this.combinedChartData = {
      ...this.combinedChartData,
      labels: [],
      datasets: [
        { ...this.combinedChartData.datasets[0], data: [] },
        { ...this.combinedChartData.datasets[1], data: [] },
        { ...this.combinedChartData.datasets[2], data: [] },
      ],
    };

    this.loading = true;
    this.loadingAlerts = true;
    this.loadingCombined = true;

    this.status = 'normal';
    this.statusText = 'CARGANDO';
    this.statusReason = '';
  }

  /** Se ejecuta cuando cambia el usuario (login/logout/cambio real) */
  private async handleUserChange() {
    this.cleanupSubscriptions();
    this.resetStateVisual();

    // 1) si no hay usuario, enviar a login
    if (!this.currentUserUid) {
      console.warn('[Dashboard] No user session, redirecting...');
      await this.router.navigateByUrl('/home', { replaceUrl: true });
      return;
    }

    // 2) ✅ PERFIL EN TIEMPO REAL (aquí está la clave para que Dashboard cambie al editar Settings)
    this.subscribeUserProfile(this.currentUserUid);

    // 3) iniciar streams del usuario actual (lecturas/alertas/gráficas)
    this.iniciarSuscripciones();
  }

  /** ✅ Mantiene nombre/email/linkedDeviceId SIEMPRE sincronizados con Firestore */
  private subscribeUserProfile(uid: string) {
    this.profileSub?.unsubscribe();

    this.profileSub = this.firestore.userProfile$(uid).subscribe({
      next: (profile) => {
        // Nombre y correo (Firestore first, luego Auth fallback)
        this.userDisplayName =
          profile?.displayName?.trim() ||
          this.auth.currentUser?.displayName ||
          'Usuario';

        this.userEmail =
          profile?.email?.trim() ||
          this.auth.currentUser?.email ||
          '';

        // Dispositivo vinculado
        this.linkedDeviceId = profile?.linkedDeviceId?.trim() || 'Sin vincular';
      },
      error: (e) => {
        console.warn('[Dashboard] userProfile$ error', e);
        // Fallbacks
        this.userDisplayName = this.auth.currentUser?.displayName || 'Usuario';
        this.userEmail = this.auth.currentUser?.email || '';
        this.linkedDeviceId = 'Sin vincular';
      },
    });

    this.sub.add(this.profileSub);
  }

  private iniciarSuscripciones() {
    this.loading = true;

    // 1) Lectura actual
    this.sub.add(
      this.health.latestReading$().subscribe({
        next: (r) => {
          this.reading = r;
          this.applyStatusFromReading(r);
          this.loading = false;
        },
        error: (e) => {
          console.error('[dashboard] latestReading$ error', e);
          this.loading = false;
        },
      })
    );

    // 2) Alertas
    this.sub.add(
      this.health.latestAlerts$(20).subscribe({
        next: (rows) => {
          this.alerts = rows;
          this.unreadAlerts = rows.filter((a) => a.handled !== true).length;
          this.loadingAlerts = false;
        },
        error: (e) => {
          console.error('[dashboard] latestAlerts$ error', e);
          this.loadingAlerts = false;
        },
      })
    );

    // 3) Gráficas
    this.subscribeCombinedRange();
  }

  goAlerts() {
    this.router.navigateByUrl('/app/alerts');
  }

  async activarEspejo() {
    const user = this.auth.currentUser;
    if (!user) {
      this.mostrarToast('⚠️ No hay usuario logueado', 'danger');
      return;
    }

    // ✅ nombre correcto (Firestore first, luego auth)
    const nameToSend =
      this.userDisplayName?.trim() ||
      user.displayName ||
      'Usuario';

    try {
      const sessionRef = doc(this.db, 'system', 'mirror_access');
      await setDoc(sessionRef, {
        active_uid: user.uid,
        timestamp: new Date(),
        user_name: nameToSend,
      });

      this.mostrarToast('🚀 ¡Espejo Activado! Ponte frente a él.', 'success');
    } catch (error) {
      console.error('Error en sync:', error);
      this.mostrarToast('❌ Error de conexión', 'danger');
    }
  }

  async exportPDF() {
    const platform = Capacitor.getPlatform();
    const user = this.auth.currentUser;
    if (!user) return;

    if (platform !== 'web') {
      await this.exportPDFBackend();
      return;
    }

    const chart = this.combinedChart?.chart;
    const canvas = chart?.canvas as HTMLCanvasElement | undefined;
    if (!canvas || !chart) return;

    try {
      (chart.options as any).elements = { point: { radius: 2 } };
      chart.update();
    } catch {}

    const reasons = this.reading?.reasons?.length ? this.reading.reasons :
      this.statusReason ? [this.statusReason] : [];

    try {
      await this.report.exportMedicalReportPDF({
        patient: {
          uid: user.uid,
          displayName: this.userDisplayName ?? user.displayName ?? undefined,
          email: this.userEmail ?? user.email ?? undefined
        },
        rangeLabel: this.rangeLabel(),
        generatedAt: new Date(),
        currentStatus: this.status,
        currentReasons: reasons,
        lastReading: this.reading,
        readings: this.currentRangeReadings,
        alerts: this.alerts,
        chartCanvas: canvas,
      });
    } catch (e) {
      console.error(e);
    }
  }

  async exportPDFBackend() {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      this.mostrarToast('📄 Generando reporte en la nube...', 'primary');
      const { from, to } = this.getBackendRangeMs();
      const res: any = await this.report.generateMedicalReportFromBackend({ from, to });
      await this.report.saveAndShareBase64Pdf(res.fileName, res.base64);
    } catch (e) {
      console.error(e);
      this.mostrarToast('Error al generar PDF', 'danger');
    }
  }

  toggleLargeText(ev: any) {
    const value = ev?.detail?.checked === true;
    this.largeText = value;
    this.accessibility.toggle(value);
  }

  onRangeChange(value: any) {
    if (value === '30' || value === '100' || value === '24h' || value === '7d') {
      this.setRange(value);
    }
  }

  private setRange(r: RangeKey) {
    if (this.range === r) return;
    this.range = r;
    this.subscribeCombinedRange();
  }

  private subscribeCombinedRange() {
    this.loadingCombined = true;
    this.rangeSub?.unsubscribe();

    let obs$: Observable<VitalReading[]>;
    if (this.range === '30') obs$ = this.health.lastReadings$(30);
    else if (this.range === '100') obs$ = this.health.lastReadings$(100);
    else if (this.range === '24h') obs$ = this.health.lastReadingsByRange$(24);
    else obs$ = this.health.lastReadingsByRange$(24 * 7);

    this.rangeSub = obs$.subscribe({
      next: (rows) => {
        this.currentRangeReadings = rows ?? [];
        const { labels, hr, spo2, hrv } = this.normalizeReadings(this.currentRangeReadings);

        this.combinedChartData = {
          labels,
          datasets: [
            {
              ...this.combinedChartData.datasets[0],
              data: hr,
              yAxisID: 'yHR',
              segment: { borderColor: (ctx) => this.hrColor(ctx.p0.parsed?.y) },
              pointBackgroundColor: hr.map((v) => this.hrColor(v)),
            },
            {
              ...this.combinedChartData.datasets[1],
              data: spo2,
              yAxisID: 'ySpO2',
              segment: { borderColor: (ctx) => this.spo2Color(ctx.p0.parsed?.y) },
              pointBackgroundColor: spo2.map((v) => this.spo2Color(v)),
            },
            {
              ...this.combinedChartData.datasets[2],
              data: hrv,
              yAxisID: 'yHRV',
              segment: { borderColor: (ctx) => this.hrvColor(ctx.p0.parsed?.y) },
              pointBackgroundColor: hrv.map((v) => this.hrvColor(v)),
            },
          ],
        };

        this.loadingCombined = false;
      },
      error: (e) => {
        console.error('[dashboard] combined chart error', e);
        this.loadingCombined = false;
      },
    });

    this.sub.add(this.rangeSub);
  }

  private normalizeReadings(readings: VitalReading[]) {
    // ✅ si existe deviceTs, úsalo (es tu campo real estable)
    const sorted = [...(readings ?? [])].sort((a, b) => {
      const ams = this.toMillis(a);
      const bms = this.toMillis(b);
      return ams - bms;
    });

    const labels: string[] = [];
    const hr: (number | null)[] = [];
    const spo2: (number | null)[] = [];
    const hrv: (number | null)[] = [];

    for (const r of sorted) {
      labels.push(this.formatTime(this.toMillis(r)));
      hr.push(typeof r.hr === 'number' ? r.hr : null);
      spo2.push(typeof r.spo2 === 'number' ? r.spo2 : null);
      hrv.push(typeof r.hrv === 'number' ? r.hrv : null);
    }

    return { labels, hr, spo2, hrv };
  }

  private toMillis(rOrTs: any): number {
    // ✅ Si recibimos un VitalReading, preferimos deviceTs
    if (rOrTs && typeof rOrTs === 'object' && (rOrTs.deviceTs || rOrTs.ts)) {
      const deviceTs = Number(rOrTs.deviceTs);
      if (Number.isFinite(deviceTs) && deviceTs > 0) return deviceTs * 1000;

      const ts = rOrTs.ts;
      if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
      const d = new Date(ts);
      const ms = d.getTime();
      return isNaN(ms) ? Date.now() : ms;
    }

    // ✅ Si recibimos solo ts
    const ts = rOrTs;
    if (!ts) return Date.now();
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    const d = new Date(ts);
    const ms = d.getTime();
    return isNaN(ms) ? Date.now() : ms;
  }

  private formatTime(ms: number): string {
    const d = new Date(ms);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  private computeStatusLocal(r: VitalReading): VitalStatus {
    const hr = typeof r.hr === 'number' ? r.hr : null;
    const spo2 = typeof r.spo2 === 'number' ? r.spo2 : null;

    if (hr != null && (hr >= this.THRESHOLDS.hr.riskHigh || hr <= this.THRESHOLDS.hr.riskLow)) return 'risk';
    if (spo2 != null && spo2 <= this.THRESHOLDS.spo2.riskLow) return 'risk';
    if (hr != null && (hr >= this.THRESHOLDS.hr.warningHigh || hr <= this.THRESHOLDS.hr.warningLow)) return 'warning';
    if (spo2 != null && spo2 <= this.THRESHOLDS.spo2.warningLow) return 'warning';
    return 'normal';
  }

  private applyStatusFromReading(r: VitalReading | null) {
    if (!r) {
      this.status = 'normal';
      this.statusText = 'SIN DATOS';
      this.statusReason = 'Aún no hay lecturas.';
      return;
    }

    const s = r.status ?? this.computeStatusLocal(r);
    this.status = s;
    this.statusText = s.toUpperCase();

    if (r.reasons?.length) { this.statusReason = r.reasons.join(' • '); return; }
    if (s === 'risk') this.statusReason = 'Valores críticos detectados.';
    else if (s === 'warning') this.statusReason = 'Valores fuera de rango.';
    else this.statusReason = 'Lectura dentro de parámetros normales.';
  }

  statusColor(): string {
    if (this.status === 'risk') return 'danger';
    if (this.status === 'warning') return 'warning';
    if (this.statusText === 'SIN DATOS') return 'medium';
    return 'success';
  }

  private rangeLabel(): string {
    if (this.range === '30') return 'Últimas 30 lecturas';
    if (this.range === '100') return 'Últimas 100 lecturas';
    if (this.range === '24h') return 'Últimas 24 horas';
    return 'Últimos 7 días';
  }

  private getBackendRangeMs(): { from: number; to: number } {
    const to = Date.now();
    if (this.range === '24h') return { from: to - 24 * 60 * 60 * 1000, to };
    if (this.range === '7d') return { from: to - 7 * 24 * 60 * 60 * 1000, to };

    const rows = this.currentRangeReadings ?? [];
    if (rows.length >= 2) {
      const sorted = [...rows].sort((a, b) => this.toMillis(a) - this.toMillis(b));
      return {
        from: this.toMillis(sorted[0]),
        to: this.toMillis(sorted[sorted.length - 1]) + 1,
      };
    }
    return { from: to - 24 * 60 * 60 * 1000, to };
  }

  async mostrarToast(mensaje: string, color: string) {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 3000,
      position: 'bottom',
      color: color,
      icon: 'information-circle'
    });
    toast.present();
  }
}
