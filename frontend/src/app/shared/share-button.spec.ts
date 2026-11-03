import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { ShareButton } from './share-button';

describe('ShareButton', () => {
  let add: jest.Mock;
  let fixture: ComponentFixture<ShareButton>;
  const saved: Record<string, PropertyDescriptor | undefined> = {};
  const keys = ['share', 'maxTouchPoints', 'clipboard'];

  function stub(values: Record<string, unknown>) {
    for (const key of keys) {
      Object.defineProperty(window.navigator, key, { configurable: true, value: values[key] });
    }
  }

  beforeEach(() => {
    for (const key of keys) {
      saved[key] = Object.getOwnPropertyDescriptor(window.navigator, key);
    }
    add = jest.fn();
    TestBed.configureTestingModule({ imports: [ShareButton], providers: [{ provide: MessageService, useValue: { add } }] });
    fixture = TestBed.createComponent(ShareButton);
  });

  afterEach(() => {
    for (const key of keys) {
      const descriptor = saved[key];
      if (descriptor) {
        Object.defineProperty(window.navigator, key, descriptor);
      } else {
        delete (window.navigator as unknown as Record<string, unknown>)[key];
      }
    }
  });

  it('uses Web Share on touch devices', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    stub({ share, maxTouchPoints: 1, clipboard: { writeText: jest.fn() } });
    await fixture.componentInstance.share();
    expect(share).toHaveBeenCalledWith({ title: document.title, url: location.href });
    expect(add).not.toHaveBeenCalled();
  });

  it('stays silent when the user cancels the share sheet', async () => {
    const writeText = jest.fn();
    const share = jest.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    stub({ share, maxTouchPoints: 1, clipboard: { writeText } });
    await fixture.componentInstance.share();
    expect(share).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the link on desktop', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const share = jest.fn();
    stub({ share, maxTouchPoints: 0, clipboard: { writeText } });
    await fixture.componentInstance.share();
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(location.href);
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('falls back to a sticky toast when the clipboard is blocked', async () => {
    stub({ maxTouchPoints: 0, clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } });
    await fixture.componentInstance.share();
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'info', sticky: true, detail: location.href }));
  });
});
