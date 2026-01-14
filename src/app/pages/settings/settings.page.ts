// src/app/pages/settings/settings.page.ts

import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { FirestoreService, UserProfileDB } from '../../services/firestore.service';
import { AccessibilityService } from '../../services/accessibility.service';

// ✅ Firebase Auth (para updateProfile)
import { updateProfile } from 'firebase/auth';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class SettingsPage implements OnInit, OnDestroy {
  // UI
  linkedDeviceId: string = '';
  largeText: boolean = false;
  highContrast: boolean = false;

  // ✅ Datos del perfil (Firestore) para mostrar en UI
  profileEmail: string = '';

  // control usuario
  currentUserUid: string | null = null;
  isProfileOpen = false;

  private authSub?: Subscription;

  // Form local
  profileData = {
    displayName: '',
    age: null as number | null,
    sex: 'male',
    weight: null as number | null,
    height: null as number | null,
    activityLevel: 'moderate',
  };

  constructor(
    public auth: AuthService,
    private firestoreService: FirestoreService,
    private accessibility: AccessibilityService,
    private toastController: ToastController,
    private router: Router
  ) {}

  ngOnInit() {
    // ✅ Estado inicial desde el servicio (ya gestiona localStorage interno)
    this.largeText = this.accessibility.isEnabled();
    this.highContrast = this.accessibility.isHighContrastEnabled();

    // ✅ escuchar cambios reales de sesión/usuario
    this.authSub = this.auth.user$.subscribe(async (user) => {
      const newUid = user?.uid ?? null;
      if (newUid === this.currentUserUid) return;

      this.currentUserUid = newUid;

      // limpiar UI al cambiar usuario
      this.resetForm();

      if (!user) return;

      // fallback inicial (luego Firestore manda la verdad)
      this.profileData.displayName = user.displayName || '';
      this.profileEmail = user.email || '';

      await this.cargarDatosDesdeBD(user.uid);
    });
  }

  // ✅ Ionic: se llama cada vez que vuelves a entrar a la pantalla
  ionViewWillEnter() {
    // Re-lee estado por si cambió fuera o al volver de otra pantalla
    this.largeText = this.accessibility.isEnabled();
    this.highContrast = this.accessibility.isHighContrastEnabled();
  }

  ngOnDestroy() {
    this.authSub?.unsubscribe();
  }

  private resetForm() {
    this.linkedDeviceId = '';
    this.profileEmail = '';
    this.isProfileOpen = false;

    this.profileData = {
      displayName: '',
      age: null,
      sex: 'male',
      weight: null,
      height: null,
      activityLevel: 'moderate',
    };
  }

  async cargarDatosDesdeBD(uid: string) {
    const profile = await this.firestoreService.getUserProfile(uid);
    if (!profile) return;

    // ✅ Con tu normalizeProfile ya debería venir listo,
    // pero lo dejamos tolerante por si hay docs viejos.
    const nested: any = (profile as any).data ?? {};

    // 1) Vinculación
    this.linkedDeviceId = (profile as any).linkedDeviceId ?? nested.linkedDeviceId ?? '';

    // 2) Nombre / Email
    const displayNameFromDb = (profile as any).displayName ?? nested.displayName ?? '';
    const emailFromDb = (profile as any).email ?? nested.email ?? '';

    if (displayNameFromDb) this.profileData.displayName = displayNameFromDb;
    if (emailFromDb) this.profileEmail = emailFromDb;

    // 3) Datos médicos
    const age = (profile as any).age ?? nested.age ?? null;
    const sex = (profile as any).sex ?? nested.sex ?? 'male';
    const weightKg = (profile as any).weightKg ?? nested.weightKg ?? null;
    const heightCm = (profile as any).heightCm ?? nested.heightCm ?? null;
    const activityLevel = (profile as any).activityLevel ?? nested.activityLevel ?? 'moderate';

    this.profileData.age = typeof age === 'number' ? age : null;
    this.profileData.sex = sex || 'male';
    this.profileData.weight = typeof weightKg === 'number' ? weightKg : null;
    this.profileData.height = typeof heightCm === 'number' ? heightCm : null;
    this.profileData.activityLevel = activityLevel || 'moderate';
  }

  // --- GUARDAR DATOS ---
  async saveProfile() {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      const cleanName = (this.profileData.displayName || '').trim();
      if (!cleanName) {
        this.presentToast('Ingresa un nombre válido', 'warning');
        return;
      }

      // ✅ 1) Guardar en Firestore
      const dataToSave: Partial<UserProfileDB> = {
        displayName: cleanName,
        age: this.profileData.age ?? undefined,
        sex: this.profileData.sex,
        weightKg: this.profileData.weight ?? undefined,
        heightCm: this.profileData.height ?? undefined,
        activityLevel: this.profileData.activityLevel,
      };

      await this.firestoreService.updateUserProfile(user.uid, dataToSave);

      // ✅ 2) Actualizar Firebase Auth displayName
      await updateProfile(user, { displayName: cleanName });

      // ✅ 3) Reflejar en UI inmediato
      this.profileData.displayName = cleanName;
      this.profileEmail = this.profileEmail || (user.email ?? '');

      this.presentToast('Perfil actualizado correctamente', 'success');
      this.isProfileOpen = false;
    } catch (e) {
      console.error('[Settings] saveProfile error', e);
      this.presentToast('Error al guardar', 'danger');
    }
  }

  // --- VINCULAR ESPEJO ---
  async linkMirror() {
    const user = this.auth.currentUser;
    if (!user) return;

    const cleanId = (this.linkedDeviceId || '').trim();
    if (!cleanId) {
      this.presentToast('Ingresa un ID válido', 'warning');
      return;
    }

    try {
      await this.firestoreService.updateUserProfile(user.uid, {
        linkedDeviceId: cleanId,
      });

      this.linkedDeviceId = cleanId;
      this.presentToast('Dispositivo vinculado', 'success');
    } catch (e) {
      console.error('[Settings] linkMirror error', e);
      this.presentToast('No se pudo vincular el dispositivo', 'danger');
    }
  }

  // --- UI HELPERS ---
  goProfileSetup() {
    this.router.navigateByUrl('/app/profile-setup');
  }

  toggleLargeText(ev: any) {
    const enabled = ev?.detail?.checked === true;
    this.largeText = enabled;
    this.accessibility.toggle(enabled);
  }

  toggleHighContrast(ev: any) {
    const enabled = ev?.detail?.checked === true;
    this.highContrast = enabled;
    this.accessibility.setHighContrast(enabled);
  }

  async logout() {
    await this.auth.logout();
    this.currentUserUid = null;
    this.resetForm();
    await this.router.navigateByUrl('/home', { replaceUrl: true });
  }

  async presentToast(msg: string, color: string) {
    const toast = await this.toastController.create({
      message: msg,
      duration: 2000,
      color,
      position: 'bottom',
    });
    toast.present();
  }
}
