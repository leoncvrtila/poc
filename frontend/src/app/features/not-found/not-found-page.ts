import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, ButtonModule],
  template: `
    <section class="not-found">
      <h1>Page not found</h1>
      <p class="muted">The page you are looking for does not exist.</p>
      <p-button label="Browse products" routerLink="/products" />
    </section>
  `,
  styles: `.not-found { text-align: center; padding: 3rem 1rem; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
