import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subscription, Observable } from 'rxjs';

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

  @ViewChild(BaseChartDirective) combinedChart?: BaseChartDirective;

  // ✅ Lecturas del rango (para PDF y rango backend)
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

      drawHLine('yHRV', this.THRESHOLDS.hrv.warningLow, 'HRV warn');
      drawHLine('yHRV', this.THRESHOLDS.hrv.riskLow, 'HRV risk');
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
      yHRV: {
  type: 'linear',
  position: 'right',
  ticks: { font: { size: 14 } },
  title: { display: true, text: 'HRV (ms)' },
  grid: { drawOnChartArea: false },
  min: 0,
  max: 150,
},

    },
  };

  constructor(
    private health: HealthService,
    private router: Router,
    private accessibility: AccessibilityService,
    private report: ReportService,
    private auth: AuthService
  ) {}

  ngOnInit() {
    console.log('[WEB] location:', window.location.href);
    this.largeText = this.accessibility.isEnabled();

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

    this.subscribeCombinedRange();
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    this.rangeSub?.unsubscribe();
  }

  goAlerts() {
    this.router.navigateByUrl('/app/alerts');
  }

  // ✅ Botón local: WEB genera jsPDF, MOBILE fuerza backend
  async exportPDF() {
    console.log('[dashboard] exportPDF click');
    const platform = Capacitor.getPlatform();
    console.log('[dashboard] exportPDF platform', platform);

    const user = this.auth.currentUser;
    if (!user) {
      console.warn('[dashboard] exportPDF: no user');
      return;
    }

    // ✅ MOBILE: no uses doc.save(), fuerza backend (estable para producto)
    if (platform !== 'web') {
      console.log('[dashboard] exportPDF mobile => usando backend');
      await this.exportPDFBackend();
      return;
    }

    const chart = this.combinedChart?.chart;
    const canvas = chart?.canvas as HTMLCanvasElement | undefined;

    if (!canvas || !chart) {
      console.warn('[dashboard] exportPDF: no canvas/chart');
      return;
    }

    // (opcional) suaviza puntos para PDF
    try {
      (chart.options as any).elements = { point: { radius: 2 } };
      chart.update();
    } catch {}

    const reasons =
      this.reading?.reasons?.length ? this.reading.reasons :
      this.statusReason ? [this.statusReason] : [];

    try {
      await this.report.exportMedicalReportPDF({
        patient: {
          uid: user.uid,
          displayName: user.displayName ?? undefined,
          email: user.email ?? undefined,
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
      console.log('[dashboard] exportPDF web OK');
    } catch (e) {
      console.error('[dashboard] exportPDF web ERROR', e);
    }
  }

  // ✅ Botón backend: APK final (base64 -> Filesystem -> Share)
  async exportPDFBackend() {
    console.log('[dashboard] exportPDFBackend click');

    const user = this.auth.currentUser;
    if (!user) {
      console.warn('[dashboard] exportPDFBackend: no user');
      return;
    }

    try {
      const { from, to } = this.getBackendRangeMs();
      console.log('[dashboard] backend range(ms)', { from, to });

      // Debe devolver { reportId, fileName, base64 } (después de tu cambio en Cloud Function)
      const res: any = await this.report.generateMedicalReportFromBackend({ from, to });

      console.log('[dashboard] backend OK', {
        reportId: res?.reportId,
        fileName: res?.fileName,
        base64len: res?.base64?.length,
      });

      await this.report.saveAndShareBase64Pdf(res.fileName, res.base64);
      console.log('[dashboard] share OK');
    } catch (e) {
      console.error('[dashboard] exportPDFBackend ERROR', e);
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
    const sorted = [...(readings ?? [])].sort((a, b) => this.toMillis(a.ts) - this.toMillis(b.ts));

    const labels: string[] = [];
    const hr: (number | null)[] = [];
    const spo2: (number | null)[] = [];
    const hrv: (number | null)[] = [];

    for (const r of sorted) {
      labels.push(this.formatTime(this.toMillis(r.ts)));
      hr.push(typeof r.hr === 'number' ? r.hr : null);
      spo2.push(typeof r.spo2 === 'number' ? r.spo2 : null);
      hrv.push(typeof r.hrv === 'number' ? r.hrv : null);
    }

    return { labels, hr, spo2, hrv };
  }

  private toMillis(ts: any): number {
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

    // risk
    if (hr != null && (hr >= this.THRESHOLDS.hr.riskHigh || hr <= this.THRESHOLDS.hr.riskLow)) return 'risk';
    if (spo2 != null && spo2 <= this.THRESHOLDS.spo2.riskLow) return 'risk';

    // warning
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

    if (r.reasons?.length) {
      this.statusReason = r.reasons.join(' • ');
      return;
    }

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

  // ✅ Calcula from/to para backend sin variables extra
  private getBackendRangeMs(): { from: number; to: number } {
    const to = Date.now();

    if (this.range === '24h') return { from: to - 24 * 60 * 60 * 1000, to };
    if (this.range === '7d') return { from: to - 7 * 24 * 60 * 60 * 1000, to };

    // Para 30/100: usa lecturas ya cargadas (mejor precisión)
    const rows = this.currentRangeReadings ?? [];
    if (rows.length >= 2) {
      const sorted = [...rows].sort((a, b) => this.toMillis(a.ts) - this.toMillis(b.ts));
      return {
        from: this.toMillis(sorted[0].ts),
        to: this.toMillis(sorted[sorted.length - 1].ts) + 1,
      };
    }

    // fallback
    return { from: to - 24 * 60 * 60 * 1000, to };
  }
}
