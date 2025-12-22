import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  // 🔐 LOGIN
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.page').then(m => m.LoginPage),
  },

  // 📱 APP PRINCIPAL (layout con tabs)
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/app-shell/app-shell.page').then(m => m.AppShellPage),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.page').then(m => m.DashboardPage),
      },
      {
        path: 'alerts',
        loadComponent: () =>
          import('./pages/alerts/alerts.page').then(m => m.AlertsPage),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings/settings.page').then(m => m.SettingsPage),
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
    ],
  },

  // 🔁 REDIRECCIONES
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
