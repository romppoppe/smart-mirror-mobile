import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  constructor() { }

  // 1. Pedir permiso (Necesario en Android 13+)
  async requestPermissions() {
    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch (e) {
      console.warn('No se pudo pedir permisos de notificación', e);
      return false;
    }
  }

  // 2. Enviar la notificación local
  async sendAlert(title: string, body: string) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: title,
            body: body,
            id: new Date().getTime(), // ID único
            schedule: { at: new Date(Date.now() + 100) }, // Inmediato
            sound: 'res://platform_default',
            actionTypeId: '',
            extra: null
          }
        ]
      });
    } catch (e) {
      console.error('Error enviando notificación local:', e);
    }
  }
}