import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { FirestoreService, UserProfileDB } from '../../services/firestore.service';

@Component({
  standalone: true,
  selector: 'app-profile-setup',
  imports: [CommonModule, IonicModule, FormsModule],
  templateUrl: './profile-setup.page.html',
  styleUrls: ['./profile-setup.page.scss'],
})
export class ProfileSetupPage implements OnInit, OnDestroy {
  private sub?: Subscription;

  loading = true;
  saving = false;

  // Datos Firestore solo para mostrar arriba
  profileEmail = '';

  // Form (mismo shape que settings)
  profileData = {
    displayName: '',
    age: null as number | null,
    sex: 'male',
    weight: null as number | null,
    height: null as number | null,
    activityLevel: 'moderate',
  };

  constructor(
    private auth: AuthService,
    private firestore: FirestoreService,
    private router: Router,
    private toast: ToastController
  ) {}

  ngOnInit() {
    // ✅ En esta pantalla, siempre trabajamos con el usuario logueado
    this.sub = this.auth.user$.subscribe(async (user) => {
      // Evita re-entradas raras si justo estás guardando
      if (this.saving) return;

      if (!user) {
        await this.router.navigateByUrl('/login', { replaceUrl: true });
        return;
      }

      // Fallback inicial (Auth)
      this.profileEmail = user.email ?? '';
      this.profileData.displayName = user.displayName ?? '';

      await this.loadFromFirestore(user.uid);
      this.loading = false;
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  private async loadFromFirestore(uid: string) {
    try {
      const profile = await this.firestore.getUserProfile(uid);
      if (!profile) return;

      // Tu doc puede tener campos en raíz o dentro de data
      const nested: any = (profile as any).data ?? {};

      const displayName =
        (profile as any).displayName ??
        nested.displayName ??
        '';

      const email =
        (profile as any).email ??
        nested.email ??
        '';

      const age = (profile as any).age ?? nested.age ?? null;
      const sex = (profile as any).sex ?? nested.sex ?? 'male';
      const weightKg = (profile as any).weightKg ?? nested.weightKg ?? null;
      const heightCm = (profile as any).heightCm ?? nested.heightCm ?? null;
      const activityLevel =
        (profile as any).activityLevel ?? nested.activityLevel ?? 'moderate';

      if (displayName) this.profileData.displayName = displayName;
      if (email) this.profileEmail = email;

      this.profileData.age = typeof age === 'number' ? age : null;
      this.profileData.sex = sex || 'male';
      this.profileData.weight = typeof weightKg === 'number' ? weightKg : null;
      this.profileData.height = typeof heightCm === 'number' ? heightCm : null;
      this.profileData.activityLevel = activityLevel || 'moderate';
    } catch (e) {
      console.warn('[profile-setup] loadFromFirestore error', e);
    }
  }

  // ✅ Validación mínima
  get formValid(): boolean {
    const nameOk = (this.profileData.displayName || '').trim().length >= 2;
    const ageOk =
      typeof this.profileData.age === 'number' &&
      this.profileData.age > 0 &&
      this.profileData.age < 120;

    const weightOk =
      this.profileData.weight == null ||
      (this.profileData.weight > 0 && this.profileData.weight < 400);

    const heightOk =
      this.profileData.height == null ||
      (this.profileData.height > 30 && this.profileData.height < 260);

    return nameOk && ageOk && weightOk && heightOk;
  }

  async saveProfile() {
    if (this.saving) return;

    const user = this.auth.currentUser;
    if (!user) {
      await this.router.navigateByUrl('/login', { replaceUrl: true });
      return;
    }

    if (!this.formValid) {
      await this.presentToast('Completa al menos nombre y edad (válidos).', 'warning');
      return;
    }

    this.saving = true;

    try {
      const cleanName = (this.profileData.displayName || '').trim();

      const dataToSave: Partial<UserProfileDB> = {
        displayName: cleanName,
        email: this.profileEmail || (user.email ?? ''),
        age: this.profileData.age ?? undefined,
        sex: this.profileData.sex,
        weightKg: this.profileData.weight ?? undefined,
        heightCm: this.profileData.height ?? undefined,
        activityLevel: this.profileData.activityLevel,

        // ✅ CLAVE: habilita el acceso a la app principal
        profileComplete: true,
      };

      await this.firestore.updateUserProfile(user.uid, dataToSave);

      // ✅ opcional: si tienes setAuthDisplayName, sincroniza también Auth
      try {
        const anyAuth: any = this.auth as any;
        if (typeof anyAuth.setAuthDisplayName === 'function') {
          await anyAuth.setAuthDisplayName(cleanName);
        }
      } catch {}

      await this.presentToast('Perfil completado ✅', 'success');

      // ✅ Ya puede entrar a /app (guard lo deja pasar)
      await this.router.navigateByUrl('/app/dashboard', { replaceUrl: true });
    } catch (e) {
      console.error('[profile-setup] saveProfile error', e);
      await this.presentToast('No se pudo guardar. Revisa tu conexión.', 'danger');
    } finally {
      this.saving = false;
    }
  }

  async logout() {
    await this.auth.logout();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  private async presentToast(message: string, color: string) {
    const t = await this.toast.create({
      message,
      duration: 1800,
      color,
      position: 'bottom',
    });
    await t.present();
  }
}
