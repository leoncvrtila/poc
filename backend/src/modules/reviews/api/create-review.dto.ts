import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEmpty, IsInt, IsString, Length, Matches, Max, Min, ValidateBy } from 'class-validator';
import { containsLink } from '../domain/review';

/**
 * C0/C1 control characters (except tab, LF, CR) and bidi overrides/isolates. NUL would make Postgres fail with a 500;
 * bidi controls enable visual spoofing. Other format characters (e.g. ZWJ in emoji sequences) are deliberately kept.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the whole point
const UNSAFE_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;

function cleaner(refine: (text: string) => string) {
  return ({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? refine(value.replace(UNSAFE_CHARACTERS, '').normalize('NFC').trim()) : value;
}

const cleanName = cleaner((text) => text.replace(/\s+/g, ' '));
const cleanComment = cleaner((text) => text.replace(/(?:\r?\n){3,}/g, '\n\n'));

const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** Reviews are plain text; links are the main spam payload and the page has no authentication to deter them. */
function NoLinks() {
  return ValidateBy({
    name: 'noLinks',
    validator: {
      validate: (value: unknown) => typeof value !== 'string' || !containsLink(value),
      defaultMessage: () => 'Links are not allowed in reviews.',
    },
  });
}

export class CreateReviewDto {
  @ApiProperty({ minLength: 2, maxLength: 60, example: 'Ana K.' })
  @Transform(cleanName)
  @IsString()
  @Length(2, 60)
  @Matches(HAS_LETTER_OR_DIGIT, { message: 'authorName must contain at least one letter or digit' })
  @NoLinks()
  authorName!: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 4 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({ minLength: 10, maxLength: 2000, example: 'Stable emulsions at low dosage in our pilot.' })
  @Transform(cleanComment)
  @IsString()
  @Length(10, 2000)
  @Matches(HAS_LETTER_OR_DIGIT, { message: 'comment must contain at least one letter or digit' })
  @NoLinks()
  comment!: string;

  /** Honeypot: hidden in the form, so only bots fill it in. */
  @ApiHideProperty()
  @IsEmpty({ message: 'Review could not be accepted.' })
  website?: string;
}
