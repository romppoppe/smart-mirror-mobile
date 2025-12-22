import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../services/auth.service';

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

  // campos
  displayName = '';
  email = '';
  password = '';

  loading = false;
  error = '';

  constructor(private auth: AuthService, private router: Router) {}

  setMode(value: unknown) {
    if (value === 'login' || value === 'register') {
      this.mode = value;
      this.error = '';
    }
  }

  async submit() {
    this.error = '';

    if (!this.email || !this.password) {
      this.error = 'Ingrese correo y contraseña.';
      return;
    }

    if (this.mode === 'register' && !this.displayName.trim()) {
      this.error = 'Ingrese su nombre.';
      return;
    }

    this.loading = true;

    try {
      if (this.mode === 'login') {
        await this.auth.login(this.email.trim(), this.password);
      } else {
        await this.auth.register(this.email.trim(), this.password, this.displayName.trim());
      }

      // ✅ ir al dashboard dentro del shell
      await this.router.navigateByUrl('/app/dashboard', { replaceUrl: true });
    } catch (e: any) {
      console.error('[login] submit error', e);

      const code = e?.code as string | undefined;

      // mensajes más amigables
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        this.error = 'Credenciales incorrectas.';
      } else if (code === 'auth/email-already-in-use') {
        this.error = 'Ese correo ya está registrado.';
      } else if (code === 'auth/weak-password') {
        this.error = 'La contraseña es muy débil (mínimo 6 caracteres).';
      } else if (code === 'auth/invalid-email') {
        this.error = 'Correo inválido.';
      } else {
        this.error = 'No se pudo completar la acción. Intente nuevamente.';
      }
    } finally {
      this.loading = false;
    }
  }
}
