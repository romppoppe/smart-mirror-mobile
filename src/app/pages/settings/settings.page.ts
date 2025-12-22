import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';

import { AccessibilityService } from '../../services/accessibility.service';
import { AuthService } from '../../services/auth.service';

@Component({
  standalone: true,
  selector: 'app-settings',
  imports: [CommonModule, IonicModule],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage implements OnInit {
  largeText = false;
  highContrast = false;

  displayName = 'Usuario';
  email = '';

  constructor(
    private accessibility: AccessibilityService,
    private auth: AuthService,
    private router: Router,
    private alertCtrl: AlertController
  ) {}

  ngOnInit() {
    this.largeText = this.accessibility.isEnabled();
    this.highContrast = this.accessibility.isHighContrastEnabled();

    const user = this.auth.currentUser;
    this.displayName = user?.displayName ?? 'Usuario';
    this.email = user?.email ?? '';
  }

  toggleLargeText(ev: any) {
    const value = ev.detail.checked === true;
    this.largeText = value;
    this.accessibility.toggle(value);
  }

  toggleHighContrast(ev: any) {
    const value = ev.detail.checked === true;
    this.highContrast = value;
    this.accessibility.setHighContrast(value);
  }

  async logout() {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar sesión',
      message: '¿Desea cerrar sesión en el dispositivo?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Cerrar sesión',
          role: 'destructive',
          handler: async () => {
            await this.auth.logout();
            await this.router.navigateByUrl('/login', { replaceUrl: true });
          },
        },
      ],
    });

    await alert.present();
  }
}
