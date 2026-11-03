import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ReviewForm } from './review-form';

describe('ReviewForm', () => {
  let fixture: ComponentFixture<ReviewForm>;
  let form: ReviewForm;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReviewForm] }).compileComponents();
    fixture = TestBed.createComponent(ReviewForm);
    form = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('does not submit an invalid form and shows what is missing', () => {
    const emitted = jest.fn();
    form.submitted.subscribe(emitted);

    form.submit();
    fixture.detectChanges();

    expect(emitted).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Please choose a rating.');
    expect(fixture.nativeElement.textContent).toContain('Please enter 2–60 characters.');
  });

  it('rejects whitespace-only input', () => {
    form.form.setValue({ authorName: '   ', rating: 4, comment: '            ', website: '' });
    expect(form.form.invalid).toBe(true);
  });

  it('rejects names and comments without any letter or digit', () => {
    form.form.setValue({ authorName: '!!!', rating: 4, comment: '!!!!!!!!!!!!', website: '' });
    expect(form.form.controls.authorName.invalid).toBe(true);
    expect(form.form.controls.comment.invalid).toBe(true);
  });

  it('emits trimmed values when valid', () => {
    const emitted = jest.fn();
    form.submitted.subscribe(emitted);
    form.form.setValue({ authorName: '  Ana K. ', rating: 4, comment: '  Works well in our pilot.  ', website: '' });

    form.submit();

    expect(emitted).toHaveBeenCalledWith({
      authorName: 'Ana K.',
      rating: 4,
      comment: 'Works well in our pilot.',
      website: '',
    });
  });

  it('has a honeypot control that defaults to empty', () => {
    expect(form.form.controls.website.value).toBe('');
  });

  it('renders the honeypot as a hidden, non-focusable, non-autofilled input with a label', () => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[formControlName="website"]');
    expect(input.getAttribute('tabindex')).toBe('-1');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('aria-hidden')).toBe('true');
    expect(input.closest('.honeypot')).not.toBeNull();
    const label = fixture.nativeElement.querySelector(`.honeypot label[for="${input.id}"]`);
    expect(label.textContent).toContain('Leave this field empty');
  });

  it('submits whatever the honeypot holds so the server can reject bots', () => {
    const emitted = jest.fn();
    form.submitted.subscribe(emitted);
    form.form.setValue({ authorName: 'Ana K.', rating: 4, comment: 'Works well in our pilot.', website: 'http://spam.example' });

    form.submit();

    expect(emitted).toHaveBeenCalledWith(expect.objectContaining({ website: 'http://spam.example' }));
  });

  it('disables the submit button while submitting', () => {
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(button.disabled).toBe(true);
  });

  it('enforces the trimmed length bounds', () => {
    const { authorName, comment } = form.form.controls;
    const check = (control: typeof authorName, value: string) => {
      control.setValue(value);
      return control.errors?.['trimmedLength'];
    };
    expect(check(authorName, 'a')).toEqual({ min: 2, max: 60 });
    expect(check(authorName, ' a ')).toEqual({ min: 2, max: 60 });
    expect(check(authorName, 'ab')).toBeUndefined();
    expect(check(authorName, 'a'.repeat(60))).toBeUndefined();
    expect(check(authorName, 'a'.repeat(61))).toEqual({ min: 2, max: 60 });
    expect(check(comment, 'a'.repeat(9))).toEqual({ min: 10, max: 2000 });
    expect(check(comment, 'a'.repeat(10))).toBeUndefined();
    expect(check(comment, 'a'.repeat(2000))).toBeUndefined();
    expect(check(comment, 'a'.repeat(2001))).toEqual({ min: 10, max: 2000 });
  });

  it('reports a missing letter or digit with a specific error', () => {
    form.form.controls.authorName.setValue('!!');
    expect(form.form.controls.authorName.errors?.['letterOrDigit']).toBe(true);
    form.form.controls.authorName.setValue('Ab');
    expect(form.form.controls.authorName.errors?.['letterOrDigit']).toBeUndefined();
  });

  it('treats a null value as empty', () => {
    form.form.controls.authorName.setValue(null as unknown as string);
    expect(form.form.controls.authorName.errors?.['trimmedLength']).toEqual({ min: 2, max: 60 });
    expect(form.form.controls.authorName.errors?.['letterOrDigit']).toBe(true);
  });

  it('is not submitting by default', () => {
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(button.disabled).toBe(false);
  });

  it('shows errors only for touched or edited invalid fields', () => {
    expect(form.showError('authorName')).toBe(false);
    form.form.controls.authorName.markAsTouched();
    expect(form.showError('authorName')).toBe(true);
    form.form.controls.authorName.setValue('Ana');
    expect(form.showError('authorName')).toBe(false);
    form.form.controls.comment.markAsDirty();
    expect(form.showError('comment')).toBe(true);
  });
});
