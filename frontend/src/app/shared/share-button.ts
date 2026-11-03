import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';

/** Shares the current URL. The URL already encodes the full view (query, filters, sort, page or product). */
@Component({
  selector: 'app-share-button',
  imports: [ButtonModule],
  template: `<p-button icon="pi pi-share-alt" label="Share" severity="secondary" [outlined]="true" (onClick)="share()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareButton {
  private readonly document = inject(DOCUMENT);
  private readonly messages = inject(MessageService);

  async share(): Promise<void> {
    const url = this.document.location.href;
    const navigator = this.document.defaultView?.navigator;

    if (navigator?.share && navigator.maxTouchPoints > 0) {
      try {
        await navigator.share({ title: this.document.title, url });
      } catch {
        // The user closed the share sheet.
      }
      return;
    }

    try {
      await navigator?.clipboard.writeText(url);
      this.messages.add({ severity: 'success', summary: 'Link copied', detail: 'Send it to a colleague to show exactly this view.' });
    } catch {
      this.messages.add({ severity: 'info', summary: 'Copy this link', detail: url, sticky: true });
    }
  }
}
