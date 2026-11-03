import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { catchError, of } from 'rxjs';
import { ProductsApi } from './core/api/products-api';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, ToastModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly api = inject(ProductsApi);
  protected readonly status = toSignal(this.api.getCatalogStatus().pipe(catchError(() => of(null))), { initialValue: null });
}
