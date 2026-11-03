/** A business-level refusal to import (bad file, safety guard). Nothing is written to the catalogue. */
export class ImportAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportAbortedError';
  }
}
