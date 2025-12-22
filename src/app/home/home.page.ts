import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonContent, IonButton, IonInput, IonItem, IonLabel
} from '@ionic/angular/standalone';
import { AuthService } from '../services/auth.service';
import { PushNotifications } from '@capacitor/push-notifications';
import { getAuth } from "firebase/auth";

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  standalone: true,
  imports: [IonContent, IonButton, IonInput, IonItem, IonLabel, FormsModule],
})
export class HomePage {
  email = '';
  password = '';
  displayName = '';

  constructor(public authSvc: AuthService) {}

  async onRegister() {
    try {
      const user = await this.authSvc.register(this.email, this.password, this.displayName);
      alert('✅ Registrado: ' + user.uid);
    } catch (e: any) {
      alert('❌ Register error: ' + (e?.message ?? e));
      console.error(e);
    }
  }

  async onLogin() {
  try {
    const user = await this.authSvc.login(this.email, this.password);
    alert('✅ Login: ' + user.uid);

    // 🔥 AÑADE ESTO
    await this.printIdToken();

  } catch (e: any) {
    alert('❌ Login error: ' + (e?.message ?? e));
    console.error(e);
  }
  }

  async onLogout() {
    try {
      await this.authSvc.logout();
      alert('✅ Logout');
    } catch (e: any) {
      alert('❌ Logout error: ' + (e?.message ?? e));
      console.error(e);
    }
  }

  async testPushFromBackend() {
  const user = getAuth().currentUser;
  if (!user) return alert("Inicia sesión primero");

  const idToken = await user.getIdToken(true);

  const r = await fetch("https://api-ejhhbjdj7q-uc.a.run.app/notify/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`,
    },
    body: JSON.stringify({}),
  });

  const data = await r.json().catch(() => ({}));
  console.log("✅ testPushFromBackend status:", r.status);
  console.log("✅ testPushFromBackend data JSON:", JSON.stringify(data, null, 2));

  alert(
    "Status: " + r.status +
    "\n\n" + JSON.stringify(data, null, 2)
  );
}

  async printIdToken() {
  const user = getAuth().currentUser;
  if (!user) {
    console.log("🔥🔥🔥 NO USER LOGGED");
    return;
  }

  const idToken = await user.getIdToken(true);

  console.log("🔥🔥🔥 UID:", user.uid);
  console.log("🔥🔥🔥 ID_TOKEN:", idToken);
  }

  async setupPush() {
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') {
    alert('Permiso de notificaciones DENEGADO');
    return;
  }

  // ✅ listeners primero
  PushNotifications.addListener('registration', async (token) => {
    console.log('✅ FCM Token:', token.value);

    const uid = this.authSvc.currentUid();
    if (!uid) {
      alert('⚠️ Inicia sesión primero para guardar el token');
      return;
    }

    try {
      await this.authSvc.saveFcmToken(uid, token.value);
      alert('✅ Token guardado en Firestore');
    } catch (e: any) {
      console.error('❌ Guardando token', e);
      alert('❌ Error guardando token: ' + (e?.message ?? e));
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('❌ registrationError', err);
    alert('❌ Error registrando FCM (mira Logcat)');
  });

  PushNotifications.addListener('pushNotificationReceived', (notif) => {
    console.log('📩 pushNotificationReceived', notif);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('👉 actionPerformed', action);
  });

  // ✅ registrar al final
  await PushNotifications.register();
}

}
