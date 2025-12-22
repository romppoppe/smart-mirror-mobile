import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import { VitalReading, VitalStatus, AlertEvent } from '../services/health.service'; // ajusta ruta real
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

export type MedicalReportInput = {
  patient: {
    uid: string;
    displayName?: string;
    email?: string;
    age?: number;
    gender?: string;
  };
  rangeLabel: string;              // "Últimas 30", "24h", "7d", etc.
  generatedAt: Date;
  currentStatus?: VitalStatus;     // normal|warning|risk
  currentReasons?: string[];
  lastReading?: VitalReading | null;
  readings: VitalReading[];
  alerts?: AlertEvent[];           // opcional
  chartCanvas: HTMLCanvasElement;  // canvas del chart existente
};

@Injectable({ providedIn: 'root' })
export class ReportService {
  async exportMedicalReportPDF(input: MedicalReportInput): Promise<void> {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const margin = 12;
    let y = 14;

    // ===== Header =====
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('REPORTE MÉDICO - ESPEJO INTELIGENTE', margin, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Generado: ${this.formatDateTime(input.generatedAt)}`, margin, y);
    doc.text(`Rango: ${input.rangeLabel}`, pageW - margin, y, { align: 'right' });
    y += 6;

    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageW - margin, y);
    y += 6;

    // ===== Patient block =====
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Datos del paciente', margin, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    const p = input.patient;
    const patientLines = [
      `Nombre: ${p.displayName ?? 'N/D'}`,
      `Email: ${p.email ?? 'N/D'}`,
      `UID: ${p.uid}`,
      `Edad: ${p.age ?? 'N/D'}`,
      `Género: ${p.gender ?? 'N/D'}`,
    ];
    patientLines.forEach(line => {
      doc.text(line, margin, y);
      y += 4.5;
    });
    y += 2;

    // ===== Current status =====
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Estado actual', margin, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    const statusLabel = input.currentStatus ? input.currentStatus.toUpperCase() : 'N/D';
    doc.text(`Estado: ${statusLabel}`, margin, y);
    y += 4.5;

    if (input.currentReasons?.length) {
      doc.text(`Motivos: ${input.currentReasons.join(' | ')}`, margin, y);
      y += 4.5;
    }

    if (input.lastReading) {
      doc.text(
        `Última lectura: HR ${input.lastReading.hr ?? '-'} | SpO₂ ${input.lastReading.spo2 ?? '-'} | Temp ${input.lastReading.temp ?? '-'} °C`,
        margin,
        y
      );
      y += 4.5;

      const ts = this.readingDate(input.lastReading);
      doc.text(`Fecha lectura: ${ts ? this.formatDateTime(ts) : 'N/D'}`, margin, y);
      y += 6;
    } else {
      doc.text('Última lectura: N/D', margin, y);
      y += 6;
    }

    // ===== Chart (canvas -> image) =====
    // Capturamos el canvas tal cual se ve
    const chartImg = this.canvasToImageForPDF(input.chartCanvas);
    const chartW = pageW - margin * 2;
    const chartH = (chartW * 9) / 16; // ratio agradable

    if (y + chartH > pageH - margin) {
      doc.addPage();
      y = 14;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Gráfico de signos vitales', margin, y);
    y += 4;

    doc.addImage(chartImg, 'PNG', margin, y, chartW, chartH);
    y += chartH + 6;

    // 🧠 Texto explicativo (valor académico)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);

    doc.text(
    'Nota: Las líneas discontinuas representan umbrales clínicos de referencia. ' +
    'Los tramos del gráfico cambian de color automáticamente para indicar ' +
    'estados normales (verde), advertencia (amarillo) o riesgo (rojo).',
    margin,
    y
    );

    y += 8;

    // restaurar color por si acaso
    doc.setTextColor(0);

    // ===== Readings table (simple) =====
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    if (y + 20 > pageH - margin) {
      doc.addPage();
      y = 14;
    }
    doc.text('Lecturas (muestra)', margin, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Fecha', margin, y);
    doc.text('HR', margin + 75, y);
    doc.text('SpO₂', margin + 95, y);
    doc.text('Temp', margin + 120, y);
    doc.text('Estado', margin + 145, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    const maxRows = 22; // para no saturar el PDF
    const rows = (input.readings ?? []).slice(0, maxRows);

    for (const r of rows) {
      if (y > pageH - margin) {
        doc.addPage();
        y = 14;
      }
      const d = this.readingDate(r);
      doc.text(d ? this.formatDateTime(d) : 'N/D', margin, y);
      doc.text(String(r.hr ?? '-'), margin + 75, y);
      doc.text(String(r.spo2 ?? '-'), margin + 95, y);
      doc.text(String(r.temp ?? '-'), margin + 120, y);
      doc.text(String(r.status ?? '-'), margin + 145, y);
      y += 4.5;
    }

    if ((input.readings?.length ?? 0) > maxRows) {
      y += 4;
      doc.text(`(Mostrando ${maxRows} de ${input.readings.length} lecturas)`, margin, y);
      y += 5;
    }

    // ===== Alerts (optional) =====
    if (input.alerts?.length) {
      if (y + 18 > pageH - margin) {
        doc.addPage();
        y = 14;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Alertas recientes', margin, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      const alerts = input.alerts.slice(0, 10);
      for (const a of alerts) {
        if (y > pageH - margin) {
          doc.addPage();
          y = 14;
        }
        const ad = a.createdAt?.toDate?.() ?? null;
        const line = `• ${ad ? this.formatDateTime(ad) : 'N/D'} | ${String(a.status ?? '-')} | ${(a.reasons ?? []).join(', ')}`;
        doc.text(this.trim(line, 110), margin, y);
        y += 4.5;
      }
    }

    // ===== Footer =====
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('Generado automáticamente por el sistema de monitoreo. No reemplaza diagnóstico médico.', margin, pageH - 10);

    // ===== Guardar / Compartir =====
    const fileName = `reporte_medico_${input.patient.uid}_${this.fileStamp(input.generatedAt)}.pdf`;

    if (!Capacitor.isNativePlatform()) {
      // 🌐 WEB (PC / navegador)
      doc.save(fileName);
      return;
    }

    // 📱 ANDROID / IOS
    const pdfArrayBuffer = doc.output('arraybuffer');
    const base64 = this.arrayBufferToBase64(pdfArrayBuffer);

    await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache, // 👈 IMPORTANTE
    });

    const uri = await Filesystem.getUri({
      directory: Directory.Cache,
      path: fileName,
    });

    await Share.share({
      title: 'Reporte médico PDF',
      text: 'Adjunto reporte médico generado desde el Espejo Inteligente.',
      url: uri.uri,
      dialogTitle: 'Compartir reporte',
    });
  }

    // ✅ BACKEND: genera el PDF en Cloud Functions, lo guarda en Storage/Firestore y devuelve URL
  async generateMedicalReportFromBackend(params: { from: number; to: number }) {
    const fn = httpsCallable(getFunctions(), 'generateMedicalReport');
    const res: any = await fn(params);

    return res.data as {
      reportId: string;
      storagePath: string;
      downloadUrl: string;
      createdAt: number;
    };
  }

  // ✅ APP: descarga el PDF (desde downloadUrl), lo guarda local y lo comparte (WhatsApp, etc.)
  async saveAndShareBase64Pdf(fileName: string, base64: string) {
  const path = `reports/${fileName}`;

  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });

  const uri = await Filesystem.getUri({
    path,
    directory: Directory.Documents,
  });

  await Share.share({
    title: 'Reporte médico',
    text: 'Adjunto reporte médico en PDF',
    url: uri.uri,
    dialogTitle: 'Compartir PDF',
  });

  return uri.uri;
}

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }


  private readingDate(r: VitalReading): Date | null {
    // soporta ts o evaluatedAt
    const anyTs = (r.evaluatedAt ?? r.ts) as any;
    if (!anyTs) return null;
    if (anyTs.toDate) return anyTs.toDate();
    if (typeof anyTs === 'number') return new Date(anyTs);
    if (anyTs.seconds) return new Date(anyTs.seconds * 1000);
    return null;
  }

  private canvasToImage(canvas: HTMLCanvasElement, scale = 2): string {
    // Offscreen canvas para mejorar resolución en el PDF
    const out = document.createElement('canvas');
    out.width = canvas.width * scale;
    out.height = canvas.height * scale;

    const ctx = out.getContext('2d');
    if (!ctx) return canvas.toDataURL('image/png');

    // Fondo blanco para evitar transparencias raras
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);

    // Dibujar el canvas real escalado
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(canvas, 0, 0);

    return out.toDataURL('image/png');
  }

  private canvasToImageForPDF(canvas: HTMLCanvasElement): string {
    // Canvas temporal solo para PDF
    const out = document.createElement('canvas');

    const scale = 2;
    const pdfHeightFactor = 1.6; // 🔑 más alto que el original

    out.width = canvas.width * scale;
    out.height = canvas.height * scale * pdfHeightFactor;

    const ctx = out.getContext('2d');
    if (!ctx) return canvas.toDataURL('image/png');

    // Fondo blanco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);

    // Centramos verticalmente el gráfico
    const offsetY = (out.height - canvas.height * scale) / 2;

    ctx.setTransform(scale, 0, 0, scale, 0, offsetY / scale);
    ctx.drawImage(canvas, 0, 0);

    return out.toDataURL('image/png');
  }

  private formatDateTime(d: Date): string {
    // Ecuador: -05:00, pero usamos local del dispositivo
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  private fileStamp(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  private trim(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }
}
