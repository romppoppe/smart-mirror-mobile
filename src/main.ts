import { enableProdMode, importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

// 1. FIREBASE
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth } from '@angular/fire/auth';

// 2. GRÁFICOS
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

// 3. ICONOS (Correctamente importados)
import { addIcons } from 'ionicons';
import { 
  // Iconos Dashboard
  homeOutline, 
  alertCircleOutline, 
  settingsOutline,
  bluetoothOutline,
  textOutline,
  scanOutline,
  chevronForwardOutline,
  notificationsOutline,
  documentTextOutline,
  shareSocialOutline, // Para el botón compartir

  // Iconos Login y Alertas (CORREGIDOS)
  mailOutline,
  lockClosedOutline,
  personOutline,
  arrowForwardOutline,
  checkmarkCircleOutline,
  informationCircleOutline,
  warningOutline,        // ✅ Reemplaza a 'alertTriangleOutline' que no existe
  shieldCheckmarkOutline,
  powerOutline
} from 'ionicons/icons';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideCharts(withDefaultRegisterables()),

    // FIREBASE
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
  ],
});

// 4. REGISTRO DE ICONOS
addIcons({
  // Dashboard
  'home-outline': homeOutline,
  'alert-circle-outline': alertCircleOutline,
  'settings-outline': settingsOutline,
  'bluetooth-outline': bluetoothOutline,
  'text-outline': textOutline,
  'scan-outline': scanOutline,
  'chevron-forward-outline': chevronForwardOutline,
  'notifications-outline': notificationsOutline,
  'document-text-outline': documentTextOutline,
  'share-social-outline': shareSocialOutline,

  // Login & Alertas
  'mail-outline': mailOutline,
  'lock-closed-outline': lockClosedOutline,
  'person-outline': personOutline,
  'arrow-forward-outline': arrowForwardOutline,
  'checkmark-circle-outline': checkmarkCircleOutline,
  'information-circle-outline': informationCircleOutline,
  'alert-triangle-outline': warningOutline, // ✅ Mapeamos warning a este nombre si lo usaste, o usa warning-outline
  'warning-outline': warningOutline,
  'shield-checkmark-outline': shieldCheckmarkOutline,
  'power-outline': powerOutline
});