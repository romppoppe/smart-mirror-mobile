import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';

type Mode = 'login' | 'register';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [CommonModule, IonicModule, FormsModule],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {
  mode: Mode = 'login';

  displayName = '';
  email = '';
  password = '';

  loading = false;
  error = '';

  constructor(
    private auth: AuthService,
    private firestore: FirestoreService,
    private router: Router
  ) {}

  setMode(value: unknown) {
    if (value === 'login' || value === 'register') {
      this.mode = value;
      this.error = '';
    }
  }

  async submit() {
    if (this.loading) return;

    this.error = '';

    const email = this.email.trim();
    const password = this.password; // (no trim por si usan espacios intencionalmente)
    const displayName = this.displayName.trim();

    if (!email || !password) {
      this.error = 'Ingrese correo y contraseña.';
      return;
    }

    if (this.mode === 'register' && !displayName) {
      this.error = 'Ingrese su nombre.';
      return;
    }

    this.loading = true;

    try {
      if (this.mode === 'login') {
        await this.auth.login(email, password);

        // ✅ Deja que el guard decida si va a profile-setup o dashboard
        await this.router.navigateByUrl('/app/dashboard', { replaceUrl: true });
        return;
      }

      // ✅ REGISTER
      const user = await this.auth.register(email, password, displayName);

      // ✅ Muy recomendado: marcar explícitamente que el perfil NO está completo
      // (así tu guard profileCompleteGuard funciona 100% aunque exista un doc viejo)
      try {
        await this.firestore.updateUserProfile(user.uid, {
          profileComplete: false,
          // guardamos también displayName en Firestore por consistencia
          displayName: displayName,
          email: email,
        } as any);
      } catch (e) {
        console.warn('[login] could not set profileComplete=false', e);
      }

      // ✅ Obligatorio: enviar a completar perfil (pantalla completa)
      await this.router.navigateByUrl('/app/profile-setup', { replaceUrl: true });
    } catch (e: any) {
      console.error('[login] submit error', e);

      const code = e?.code as string | undefined;

      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        this.error = 'Credenciales incorrectas.';
      } else if (code === 'auth/email-already-in-use') {
        this.error = 'Ese correo ya está registrado.';
      } else if (code === 'auth/weak-password') {
        this.error = 'La contraseña es muy débil (mínimo 6 caracteres).';
      } else if (code === 'auth/invalid-email') {
        this.error = 'Correo inválido.';
      } else if (code === 'auth/too-many-requests') {
        this.error = 'Demasiados intentos. Intenta más tarde.';
      } else if (code === 'auth/network-request-failed') {
        this.error = 'Error de red. Revisa tu conexión.';
      } else {
        this.error = 'No se pudo completar la acción. Intente nuevamente.';
      }

      this.password = '';
    } finally {
      this.loading = false;
    }
  }
}
