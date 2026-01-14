import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

export const authGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);

  try {
    const user = await new Promise<any>((resolve) => {
      const unsub = onAuthStateChanged(auth, (u) => {
        unsub();
        resolve(u);
      });
    });

    if (!user) {
      // ✅ tu HomePage es el login (según tu app)
      router.navigate(['/home'], {
        queryParams: { returnUrl: state.url }
      });
      return false;
    }

    return true;
  } catch (e) {
    console.error('[authGuard] error', e);
    router.navigate(['/home']);
    return false;
  }
};
