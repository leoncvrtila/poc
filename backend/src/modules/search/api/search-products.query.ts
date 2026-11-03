import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PRODUCT_STATUSES } from '../../catalog';
import { DEFAULT_STATUSES, type ProductSearchQuery, SORT_OPTIONS, type SortOption } from '../domain/search-query';

const toArray = ({ value }: TransformFnParams): string[] => {
  if (value === undefined || value === null) {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).map((item) => String(item).trim()).filter((item) => item.length > 0);
};

const trim = ({ value }: TransformFnParams): unknown => (typeof value === 'string' ? value.trim() : value);

export class SearchProductsQueryDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ type: [String], description: 'OR within the facet' })
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  function: string[] = [];

  @ApiPropertyOptional({ type: [String], description: 'OR within the facet' })
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  applicationArea: string[] = [];

  @ApiPropertyOptional({ type: [String], description: 'OR within the facet' })
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  region: string[] = [];

  @ApiPropertyOptional({ type: [String], description: 'AND: products must have every selected certification' })
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  certification: string[] = [];

  @ApiPropertyOptional({ enum: PRODUCT_STATUSES, isArray: true, description: 'Defaults to ACTIVE and PHASE_OUT' })
  @Transform(toArray)
  @IsArray()
  @IsIn(PRODUCT_STATUSES, { each: true })
  status: string[] = [];

  @ApiPropertyOptional({ enum: SORT_OPTIONS, description: 'Defaults to relevance with q, otherwise name' })
  @IsOptional()
  @IsIn(SORT_OPTIONS)
  sort?: SortOption;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;
}

export function toSearchQuery(dto: SearchProductsQueryDto): ProductSearchQuery {
  const q = dto.q ?? '';
  return {
    q,
    filters: {
      function: dto.function,
      applicationArea: dto.applicationArea,
      region: dto.region,
      certification: dto.certification,
      status: dto.status.length > 0 ? dto.status : [...DEFAULT_STATUSES],
    },
    sort: dto.sort ?? (q ? 'relevance' : 'name'),
    page: dto.page,
    pageSize: dto.pageSize,
  };
}
