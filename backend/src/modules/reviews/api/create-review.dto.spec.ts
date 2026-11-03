import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReviewDto } from './create-review.dto';

async function parse(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateReviewDto, body);
  const errors = await validate(dto);
  return { dto, errors, props: errors.map((error) => error.property) };
}

const valid = { authorName: 'Ana K.', rating: 4, comment: 'Stable emulsions at low dosage.' };

describe('CreateReviewDto', () => {
  it('accepts a valid review', async () => {
    const { dto, errors } = await parse(valid);
    expect(errors).toEqual([]);
    expect(dto).toMatchObject(valid);
  });

  it('trims and collapses whitespace in the author name', async () => {
    const { dto, errors } = await parse({ ...valid, authorName: '  Ana \t  K.  ' });
    expect(errors).toEqual([]);
    expect(dto.authorName).toBe('Ana K.');
  });

  it('strips control and bidi characters but keeps tab, LF, CR and ZWJ', async () => {
    const { dto } = await parse({
      ...valid,
      authorName: 'A\u0000n\u0008a\u000B\u000C\u000E\u001F\u007F\u009F‪‮⁦⁩ K',
      comment: 'Line one\tx\r\nLine‍ two\u0001\u0007 ok',
    });
    expect(dto.authorName).toBe('Ana K');
    expect(dto.comment).toBe('Line one\tx\r\nLine‍ two ok');
  });

  it('keeps characters adjacent to the stripped ranges', async () => {
    const { dto } = await parse({ ...valid, comment: 'a\u0009b\u000Ac\u000Dd e f ⁥g‪h' });
    expect(dto.comment).toBe('a\tb\nc\rd e f ⁥gh');
  });

  it('normalizes to NFC', async () => {
    const { dto } = await parse({ ...valid, authorName: 'José K' });
    expect(dto.authorName).toBe('José K');
  });

  it('collapses three or more line breaks in comments to one blank line', async () => {
    const { dto } = await parse({
      ...valid,
      comment: 'First paragraph.\n\n\n\nSecond paragraph.\r\n\r\n\r\nThird.\n\nKept.',
    });
    expect(dto.comment).toBe('First paragraph.\n\nSecond paragraph.\n\nThird.\n\nKept.');
  });

  it('does not collapse a single blank line or touch line breaks in names', async () => {
    const { dto } = await parse({ ...valid, comment: 'First paragraph.\n\nSecond paragraph.' });
    expect(dto.comment).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('trims comments', async () => {
    const { dto } = await parse({ ...valid, comment: '   padded comment here   ' });
    expect(dto.comment).toBe('padded comment here');
  });

  it('leaves non-string values alone and rejects them', async () => {
    const { props } = await parse({ authorName: 42, rating: 4, comment: ['x'] });
    expect(props).toEqual(expect.arrayContaining(['authorName', 'comment']));
  });

  it('enforces author name length 2..60', async () => {
    expect((await parse({ ...valid, authorName: 'A' })).props).toContain('authorName');
    expect((await parse({ ...valid, authorName: 'AB' })).props).not.toContain('authorName');
    expect((await parse({ ...valid, authorName: 'A'.repeat(60) })).props).not.toContain('authorName');
    expect((await parse({ ...valid, authorName: 'A'.repeat(61) })).props).toContain('authorName');
  });

  it('enforces comment length 10..2000', async () => {
    expect((await parse({ ...valid, comment: 'x'.repeat(9) })).props).toContain('comment');
    expect((await parse({ ...valid, comment: 'x'.repeat(10) })).props).not.toContain('comment');
    expect((await parse({ ...valid, comment: 'x'.repeat(2000) })).props).not.toContain('comment');
    expect((await parse({ ...valid, comment: 'x'.repeat(2001) })).props).toContain('comment');
  });

  it('requires a letter or digit in name and comment, with a helpful message', async () => {
    const { errors } = await parse({ ...valid, authorName: '--', comment: '!!!!!!!!!!!!' });
    const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
    expect(messages).toContain('authorName must contain at least one letter or digit');
    expect(messages).toContain('comment must contain at least one letter or digit');
    expect((await parse({ ...valid, authorName: '日本', comment: '1234567890' })).errors).toEqual([]);
  });

  it('accepts only integer ratings between 1 and 5', async () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect((await parse({ ...valid, rating })).props).not.toContain('rating');
    }
    for (const rating of [0, 6, 3.5, '4', null]) {
      expect((await parse({ ...valid, rating })).props).toContain('rating');
    }
  });

  it.each(['authorName', 'comment'])('rejects a link in %s', async (field) => {
    const { errors } = await parse({ ...valid, [field]: 'Visit www.cheap-pills.ru now' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe(field);
    expect(errors[0].constraints).toEqual({ noLinks: 'Links are not allowed in reviews.' });
  });

  it('leaves non-string values to the type check instead of the link rule', async () => {
    const { errors } = await parse({ ...valid, comment: ['www.cheap-pills.ru'] });
    expect(Object.keys(errors[0].constraints ?? {})).not.toContain('noLinks');
  });

  it('rejects a filled honeypot', async () => {
    const { errors } = await parse({ ...valid, website: 'x' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('website');
    expect(Object.values(errors[0].constraints ?? {})).toContain('Review could not be accepted.');
  });

  it('accepts an empty or missing honeypot', async () => {
    expect((await parse({ ...valid, website: '' })).errors).toEqual([]);
    expect((await parse(valid)).errors).toEqual([]);
  });
});
