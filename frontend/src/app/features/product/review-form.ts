import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { outputFromObservable } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, type ValidationErrors, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { RatingModule } from 'primeng/rating';
import { TextareaModule } from 'primeng/textarea';
import { map } from 'rxjs';
import type { NewReview } from '../../core/api/api.models';

/** Mirrors the API rules (lengths are measured after trimming). */
function trimmedLength(min: number, max: number) {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const length = (control.value ?? '').trim().length;
    return length < min || length > max ? { trimmedLength: { min, max } } : null;
  };
}

/** The API rejects text without at least one letter or digit. */
function hasLetterOrDigit(control: AbstractControl<string>): ValidationErrors | null {
  return /[\p{L}\p{N}]/u.test(control.value ?? '') ? null : { letterOrDigit: true };
}

@Component({
  selector: 'app-review-form',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, MessageModule, RatingModule, TextareaModule],
  template: `
    <form class="review-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <h3>Write a review</h3>

      <div class="field">
        <span id="review-rating-label" class="field__label">Your rating</span>
        <div role="group" aria-labelledby="review-rating-label">
          <p-rating formControlName="rating" />
        </div>
        @if (showError('rating')) {
          <small class="field__error">Please choose a rating.</small>
        }
      </div>

      <div class="field">
        <label for="review-author" class="field__label">Name</label>
        <input id="review-author" pInputText formControlName="authorName" autocomplete="name" maxlength="60" />
        @if (showError('authorName')) {
          <small class="field__error">Please enter 2–60 characters.</small>
        }
      </div>

      <div class="field">
        <label for="review-comment" class="field__label">Your experience</label>
        <textarea id="review-comment" pTextarea formControlName="comment" rows="4" maxlength="2000"></textarea>
        @if (showError('comment')) {
          <small class="field__error">Please write 10–2000 characters.</small>
        }
      </div>

      <div class="honeypot" aria-hidden="true">
        <label for="review-website">Leave this field empty</label>
        <input id="review-website" formControlName="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
      </div>

      @if (serverError()) {
        <p-message severity="error">{{ serverError() }}</p-message>
      }

      <p-button type="submit" label="Publish review" icon="pi pi-send" [loading]="submitting()" [disabled]="submitting()" />
      <p class="hint muted">Reviews are public and visible to all customers.</p>
    </form>
  `,
  styles: `
    .review-form { display: grid; gap: 1rem; padding: 1rem; border-radius: 0.75rem; background: var(--p-surface-0); border: 1px solid var(--p-surface-200); }
    h3 { margin: 0; }
    .field { display: grid; gap: 0.35rem; }
    .field__label { font-weight: 600; }
    .field__error { color: var(--p-red-600); }
    input, textarea { width: 100%; }
    .honeypot { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
    .hint { margin: 0; font-size: 0.8rem; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewForm {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly submitting = input(false);
  readonly serverError = input<string | null>(null);
  readonly submitted = output<NewReview>();

  readonly form = this.fb.group({
    authorName: ['', [Validators.required, trimmedLength(2, 60), hasLetterOrDigit]],
    rating: [0, [Validators.min(1), Validators.max(5)]],
    comment: ['', [Validators.required, trimmedLength(10, 2000), hasLetterOrDigit]],
    website: [''],
  });

  /** Fires when the user edits the form, so the parent can clear a stale server error. */
  readonly edited = outputFromObservable(this.form.valueChanges.pipe(map(() => undefined)));

  showError(control: 'authorName' | 'rating' | 'comment'): boolean {
    const field = this.form.controls[control];
    return field.invalid && (field.touched || field.dirty);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.submitted.emit({ authorName: value.authorName.trim(), rating: value.rating, comment: value.comment.trim(), website: value.website });
  }

  reset(): void {
    this.form.reset();
  }
}
