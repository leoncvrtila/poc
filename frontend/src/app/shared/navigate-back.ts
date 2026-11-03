import { Location } from '@angular/common';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * A "back" action: history back when the page was reached from inside the app, otherwise the product list
 * (for example after opening a shared link). Call it in an injection context, when the page is created.
 * Known limit: Angular gives a page a new navigationId when it is revisited with the browser's back/forward
 * buttons, so a shared-link page revisited that way counts as "inside the app" and "Back" follows browser history.
 */
export function injectNavigateBack(): () => void {
  const location = inject(Location);
  const router = inject(Router);
  // Read on entry. Angular stores a navigationId in history.state; > 1 means the page was reached from inside
  // the app. Later in-page URL changes (removing a compared product) must not change the answer.
  const cameFromApp = ((location.getState() as { navigationId?: number } | null)?.navigationId ?? 1) > 1;
  return () => {
    if (cameFromApp) {
      location.back();
    } else {
      void router.navigate(['/products']);
    }
  };
}
