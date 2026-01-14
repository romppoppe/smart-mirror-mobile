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
  userDisplayName = 'Usuario';
  userEmail = '';
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

  // ---------------------------------------------------------
  // 🎨 CONFIGURACIÓN DE GRÁFICA PIXEL PERFECT (LOVABLE STYLE)
  // ---------------------------------------------------------

  // Datos iniciales vacíos
  combinedChartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: [],
  };

  // Opciones visuales limpias (Sin grids, curvas suaves, sin puntos)
  combinedOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1000,
      easing: 'easeOutQuart'
    },
    elements: {
      line: {
        tension: 0.4, // ✅ Curvas suaves (Spline) - Clave para el look Lovable
        borderWidth: 2
      },
      point: {
        radius: 0,    // ✅ Ocultar puntos para limpieza visual (se ven al pasar el mouse)
        hitRadius: 20,
        hoverRadius: 6
      }
    },
    scales: {
      x: {
        // ✅ CORRECCIÓN ERROR ROJO: En Chart.js v4 se usa 'border' en lugar de 'drawBorder'
        border: { display: false },
        grid: { display: false },
        ticks: {
          color: 'rgba(255, 255, 255, 0.4)',
          font: { size: 10, family: "'Inter', sans-serif" },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 6
        }
      },
      // Ejes Y ocultos (Clean HUD Look)
      yHR: {
        type: 'linear', display: false, min: 40, max: 140
      },
      ySpO2: {
        type: 'linear', display: false, min: 85, max: 100
      },
      yHRV: {
        type: 'linear', display: false, min: 0, max: 120
      }
    },
    plugins: {
      legend: { display: false }, // Usamos nuestra propia leyenda HTML
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        cornerRadius: 12,
        padding: 12,
        usePointStyle: true,
        mode: 'index',
        intersect: false
      }
    }
  };

  // Umbrales (Thresholds)
  private readonly THRESHOLDS = {
    hr: { warningHigh: 100, riskHigh: 120, warningLow: 50, riskLow: 40 },
    spo2: { warningLow: 94, riskLow: 90 },
    hrv: { warningLow: 20, riskLow: 10 },
  };

  // Plugin para dibujar líneas de umbral sutiles (Warning/Risk)
  private thresholdPlugin: Plugin<'line'> = {
    id: 'thresholdLines',
    afterDraw: (chart) => {
      const ctx = chart.ctx;
      const yAxis = chart.scales['yHR'];
      if (!ctx || !yAxis) return;

      const drawLine = (value: number, color: string) => {
        const y = yAxis.getPixelForValue(value);
        if (y < chart.chartArea.top || y > chart.chartArea.bottom) return;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(chart.chartArea.left, y);
        ctx.lineTo(chart.chartArea.right, y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = color;
        ctx.setLineDash([4, 4]); // Línea punteada
        ctx.stroke();
        ctx.restore();
      };

      // Líneas de referencia sutiles para HR (Warning/Risk)
      drawLine(100, 'rgba(234, 179, 8, 0.3)'); // Warning Yellow
      drawLine(120, 'rgba(239, 68, 68, 0.3)'); // Risk Red
    },
  };

  combinedPlugins: Plugin<'line'>[] = [this.thresholdPlugin];

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
    this.authSub = this.auth.user$.subscribe(async (user) => {
      const newUid = user?.uid ?? null;
      if (newUid === this.currentUserUid) return;
      this.currentUserUid = newUid;
      await this.handleUserChange();
    });
  }

  ngOnDestroy() {
    this.cleanupSubscriptions();
    this.authSub?.unsubscribe();
  }

  private cleanupSubscriptions() {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    this.rangeSub?.unsubscribe();
    this.rangeSub = undefined;
    this.profileSub?.unsubscribe();
    this.profileSub = undefined;
  }

  private resetStateVisual() {
    this.linkedDeviceId = '—';
    this.reading = null;
    this.alerts = [];
    this.unreadAlerts = 0;
    this.currentRangeReadings = [];
    this.userDisplayName = 'Usuario';
    this.userEmail = '';

    // Reset Data
    this.combinedChartData = { labels: [], datasets: [] };

    this.loading = true;
    this.loadingAlerts = true;
    this.loadingCombined = true;
    this.status = 'normal';
    this.statusText = 'CARGANDO';
    this.statusReason = '';
  }

  private async handleUserChange() {
    this.cleanupSubscriptions();
    this.resetStateVisual();

    if (!this.currentUserUid) {
      await this.router.navigateByUrl('/login', { replaceUrl: true });
      return;
    }

    this.subscribeUserProfile(this.currentUserUid);
    this.iniciarSuscripciones();
  }

  private subscribeUserProfile(uid: string) {
    this.profileSub?.unsubscribe();
    this.profileSub = this.firestore.userProfile$(uid).subscribe({
      next: (profile) => {
        this.userDisplayName = profile?.displayName?.trim() || this.auth.currentUser?.displayName || 'Usuario';
        this.userEmail = profile?.email?.trim() || this.auth.currentUser?.email || '';
        this.linkedDeviceId = profile?.linkedDeviceId?.trim() || 'Sin vincular';
      },
      error: () => {
        this.userDisplayName = this.auth.currentUser?.displayName || 'Usuario';
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
        error: () => { this.loading = false; },
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
        error: () => { this.loadingAlerts = false; },
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
    const nameToSend = this.userDisplayName?.trim() || user.displayName || 'Usuario';

    try {
      const sessionRef = doc(this.db, 'system', 'mirror_access');
      await setDoc(sessionRef, {
        active_uid: user.uid,
        timestamp: new Date(),
        user_name: nameToSend,
      });
      this.mostrarToast('🚀 ¡Espejo Activado! Ponte frente a él.', 'success');
    } catch (error) {
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
      // Ajuste temporal para la captura: mostramos puntos pequeños
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

      // Restaurar estilo clean (sin puntos)
      (chart.options as any).elements = { point: { radius: 0 } };
      chart.update();

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

  // ---------------------------------------------------------
  // 📈 LÓGICA DE DATOS DE LA GRÁFICA (AREA CHARTS)
  // ---------------------------------------------------------
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

        // ✅ FIX MOBILE: si solo hay 0-1 puntos en 24h, no hay "curva"
        // Con pointRadius=0 se ve vacío. Entonces mostramos un punto visible.
        const points = labels?.length ?? 0;
        const showSinglePoint = points <= 1;

        const pointRadius = showSinglePoint ? 4 : 0;
        const pointHoverRadius = showSinglePoint ? 6 : 6;

        this.combinedChartData = {
          labels,
          datasets: [
            {
              data: hr,
              label: 'HR (bpm)',
              borderColor: '#f43f5e',
              backgroundColor: 'rgba(244, 63, 94, 0.15)',
              fill: 'origin',
              yAxisID: 'yHR',
              tension: 0.4,
              pointRadius,
              pointHoverRadius,
            },
            {
              data: spo2,
              label: 'SpO₂ (%)',
              borderColor: '#06b6d4',
              backgroundColor: 'rgba(6, 182, 212, 0.15)',
              fill: 'origin',
              yAxisID: 'ySpO2',
              tension: 0.4,
              pointRadius,
              pointHoverRadius,
            },
            {
              data: hrv,
              label: 'HRV (ms)',
              borderColor: '#8b5cf6',
              backgroundColor: 'rgba(139, 92, 246, 0.15)',
              fill: 'origin',
              yAxisID: 'yHRV',
              tension: 0.4,
              pointRadius,
              pointHoverRadius,
            },
          ],
        };

        // Forzar repaint en móvil cuando cambias de rango
        try {
          setTimeout(() => this.combinedChart?.update(), 0);
        } catch {}

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
    if (rOrTs && typeof rOrTs === 'object' && (rOrTs.deviceTs || rOrTs.ts)) {
      const deviceTs = Number(rOrTs.deviceTs);
      if (Number.isFinite(deviceTs) && deviceTs > 0) return deviceTs * 1000;
      const ts = rOrTs.ts;
      if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
      const d = new Date(ts);
      const ms = d.getTime();
      return isNaN(ms) ? Date.now() : ms;
    }
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

    const titles: Record<string, string> = {
      normal: 'Todo en Orden',
      warning: 'Precaución',
      risk: 'Atención Requerida'
    };
    this.statusText = titles[s] || 'Desconocido';

    if (r.reasons?.length) {
      this.statusReason = r.reasons.join(' • ');
      return;
    }

    if (s === 'risk') this.statusReason = 'Tus signos vitales requieren atención inmediata.';
    else if (s === 'warning') this.statusReason = 'Algunos valores están fuera del rango ideal.';
    else this.statusReason = 'Tus signos vitales están dentro de rangos saludables.';
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
