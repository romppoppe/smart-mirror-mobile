import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

// ✅ 1. IMPORTAR LIBRERÍAS DE FIREBASE
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { environment } from './environments/environment'; // ⚠️ Asegúrate de tener tus keys aquí

// ✅ 2. IMPORTAR GRÁFICOS
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

// ✅ 3. IMPORTAR TODOS LOS ICONOS DEL NUEVO DISEÑO
import { addIcons } from 'ionicons';
import { 
  homeOutline, 
  alertCircleOutline, 
  settingsOutline,
  bluetoothOutline,      // Nuevo
  textOutline,           // Nuevo
  scanOutline,           // Nuevo
  chevronForwardOutline, // Nuevo
  notificationsOutline,  // Nuevo
  documentTextOutline    // Nuevo
} from 'ionicons/icons';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideCharts(withDefaultRegisterables()),

    // 🔥 INICIALIZACIÓN DE FIREBASE (CRÍTICO)
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
  ],
});

// Registrar los iconos para que aparezcan en el diseño Glass
addIcons({
  'home-outline': homeOutline,
  'alert-circle-outline': alertCircleOutline,
  'settings-outline': settingsOutline,
  'bluetooth-outline': bluetoothOutline,
  'text-outline': textOutline,
  'scan-outline': scanOutline,
  'chevron-forward-outline': chevronForwardOutline,
  'notifications-outline': notificationsOutline,
  'document-text-outline': documentTextOutline,
});