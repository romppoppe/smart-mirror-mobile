import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
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
  
  // Usaremos Toasts para errores
  error = '';

  constructor(
    private auth: AuthService,
    private firestore: FirestoreService,
    private router: Router,
    private toastController: ToastController
  ) {}

  // ✅ ESTA ES LA FUNCIÓN QUE FALTABA
  setMode(value: 'login' | 'register') {
    this.mode = value;
    this.error = ''; // Limpiamos errores al cambiar de pestaña
  }

  // ✅ Lógica para Ingresar / Registrar con Email
  async submit() {
    if (this.loading) return;
    this.error = '';

    const email = this.email.trim();
    const password = this.password;
    const displayName = this.displayName.trim();

    // Validaciones básicas
    if (!email || !password) {
      this.showToast('Por favor ingresa correo y contraseña', 'warning');
      return;
    }

    if (this.mode === 'register' && !displayName) {
      this.showToast('Necesitamos tu nombre para registrarte', 'warning');
      return;
    }

    this.loading = true;

    try {
      if (this.mode === 'login') {
        // --- LOGIN ---
        await this.auth.login(email, password);
        await this.router.navigateByUrl('/app/dashboard', { replaceUrl: true });
        
      } else {
        // --- REGISTER ---
        const user = await this.auth.register(email, password, displayName);

        // Guardar datos iniciales en Firestore
        try {
          await this.firestore.updateUserProfile(user.uid, {
            profileComplete: false,
            displayName: displayName,
            email: email,
          } as any);
        } catch (e) {
          console.warn('[login] error updating profile', e);
        }

        // Redirigir a completar perfil
        await this.router.navigateByUrl('/app/profile-setup', { replaceUrl: true });
      }

    } catch (e: any) {
      console.error('[login] submit error', e);
      this.handleAuthError(e);
    } finally {
      this.loading = false;
    }
  }

  // ✅ Lógica para Google
  async loginGoogle() {
    try {
      this.loading = true;
      await this.auth.loginWithGoogle();
      await this.router.navigateByUrl('/app/dashboard', { replaceUrl: true });
    } catch (e: any) {
      console.error('Error Google:', e);
      this.showToast('No se pudo iniciar con Google. Intenta más tarde.', 'danger');
    } finally {
      this.loading = false;
    }
  }

  // ✅ Lógica para Recuperar Contraseña
  async recoverPassword() {
    if (!this.email) {
      this.showToast('Escribe tu correo primero para enviarte el enlace.', 'warning');
      return;
    }

    try {
      this.loading = true;
      await this.auth.recoverPassword(this.email);
      this.showToast('Correo de recuperación enviado. Revisa tu bandeja.', 'success');
    } catch (e) {
      console.error(e);
      this.showToast('No pudimos enviar el correo. Verifica que esté bien escrito.', 'danger');
    } finally {
      this.loading = false;
    }
  }

  // --- Helpers ---

  async showToast(msg: string, color: 'danger' | 'success' | 'warning' = 'danger') {
    const toast = await this.toastController.create({
      message: msg,
      duration: 2500,
      color: color,
      position: 'bottom'
    });
    await toast.present();
  }

  handleAuthError(e: any) {
    const code = e?.code;
    let msg = 'Ocurrió un error inesperado.';

    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      msg = 'Correo o contraseña incorrectos.';
    } else if (code === 'auth/email-already-in-use') {
      msg = 'Este correo ya está registrado. Intenta iniciar sesión.';
    } else if (code === 'auth/weak-password') {
      msg = 'La contraseña es muy débil (usa al menos 6 caracteres).';
    } else if (code === 'auth/invalid-email') {
      msg = 'El formato del correo no es válido.';
    } else if (code === 'auth/too-many-requests') {
      msg = 'Demasiados intentos. Espera unos minutos.';
    }

    this.showToast(msg, 'danger');
    this.password = '';
  }
}