import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { addIcons } from 'ionicons';
import { homeOutline, alertCircleOutline, settingsOutline } from 'ionicons/icons';

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular(),
    provideRouter(routes),
    provideCharts(withDefaultRegisterables()),
  ],
});

addIcons({
  'home-outline': homeOutline,
  'alert-circle-outline': alertCircleOutline,
  'settings-outline': settingsOutline,
});
