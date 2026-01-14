import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { FirestoreService } from '../services/firestore.service';

export const profileCompleteGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const firestore = inject(FirestoreService);
  const router = inject(Router);

  const user = auth.currentUser;
  if (!user) {
    return router.parseUrl('/login');
  }

  try {
    const profile = await firestore.getUserProfile(user.uid);

    // ✅ Acepta profileComplete en raíz o dentro de data (por si tu doc lo tiene nested)
    const nested: any = (profile as any)?.data ?? {};
    const complete = Boolean((profile as any)?.profileComplete ?? nested.profileComplete);

    if (!complete) {
      return router.parseUrl('/app/profile-setup');
    }

    return true;
  } catch (e) {
    // Si hay error leyendo perfil, mejor obligarlo a completar
    return router.parseUrl('/app/profile-setup');
  }
};
