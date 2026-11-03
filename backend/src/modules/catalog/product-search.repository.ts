import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { CatalogSearchCriteria, CatalogSearchFacet } from './domain/product-search';

/** Same expression as the trigram index in migration 20261103120000_search_fallback_trgm. */
const SEARCH_TEXT = Prisma.sql`lower(coalesce(name, '') || ' ' || chemical_name || ' ' || sku || ' ' || "function" || ' ' || application_area)`;

type ColumnFacet = Exclude<CatalogSearchFacet, 'certification'>;
const COLUMN: Record<ColumnFacet, Prisma.Sql> = {
  function: Prisma.sql`"function"`,
  applicationArea: Prisma.sql`application_area`,
  region: Prisma.sql`region`,
  status: Prisma.sql`status::text`,
};
const COLUMN_FACETS = Object.keys(COLUMN) as ColumnFacet[];

const NAME_ORDER = Prisma.sql`coalesce(name, sku), sku`;

function tokens(q: string): string[] {
  // Postgres text cannot hold NUL: it would make the query throw (and surface as a 503).
  return q.replaceAll('\u0000', '').trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function contains(token: string): string {
  return `%${escapeLike(token)}%`;
}

@Injectable()
export class ProductSearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  where(criteria: CatalogSearchCriteria, omit?: CatalogSearchFacet): Prisma.Sql {
    const conditions = [Prisma.sql`listed`];
    for (const token of tokens(criteria.q)) {
      conditions.push(Prisma.sql`${SEARCH_TEXT} LIKE ${contains(token)}`);
    }
    for (const facet of COLUMN_FACETS) {
      const values = criteria.filters[facet];
      if (facet !== omit && values.length > 0) {
        conditions.push(Prisma.sql`${COLUMN[facet]} IN (${Prisma.join(values)})`);
      }
    }
    if (criteria.filters.certification.length > 0) {
      conditions.push(Prisma.sql`certifications @> ${criteria.filters.certification}::text[]`);
    }
    return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  }

  orderBy(criteria: CatalogSearchCriteria): Prisma.Sql {
    if (criteria.sort === '-launchYear') {
      return Prisma.sql`launch_year DESC NULLS LAST, ${NAME_ORDER}`;
    }
    const q = tokens(criteria.q).join(' ');
    if (criteria.sort === 'relevance' && q !== '') {
      return Prisma.sql`CASE WHEN lower(sku) = ${q} THEN 0 WHEN lower(coalesce(name, sku)) LIKE ${`${escapeLike(q)}%`} THEN 1 ELSE 2 END, ${NAME_ORDER}`;
    }
    return NAME_ORDER;
  }

  /** SKUs of the requested page, in display order. */
  async pageSkus(criteria: CatalogSearchCriteria): Promise<string[]> {
    const offset = (criteria.page - 1) * criteria.pageSize;
    const rows = await this.prisma.$queryRaw<{ sku: string }[]>(
      Prisma.sql`SELECT sku FROM product ${this.where(criteria)} ORDER BY ${this.orderBy(criteria)} LIMIT ${criteria.pageSize} OFFSET ${offset}`,
    );
    return rows.map((row) => row.sku);
  }

  async count(criteria: CatalogSearchCriteria): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ total: number }[]>(
      Prisma.sql`SELECT count(*)::int AS total FROM product ${this.where(criteria)}`,
    );
    return row.total;
  }

  async facetCounts(criteria: CatalogSearchCriteria): Promise<Record<CatalogSearchFacet, Record<string, number>>> {
    const [columnCounts, certificationCounts] = await Promise.all([
      Promise.all(
        COLUMN_FACETS.map((facet) =>
          this.prisma.$queryRaw<{ value: string; count: number }[]>(
            Prisma.sql`SELECT ${COLUMN[facet]} AS value, count(*)::int AS count FROM product ${this.where(criteria, facet)} GROUP BY 1`,
          ),
        ),
      ),
      this.prisma.$queryRaw<{ value: string; count: number }[]>(
        Prisma.sql`SELECT c AS value, count(*)::int AS count FROM product CROSS JOIN LATERAL unnest(certifications) AS c ${this.where(criteria)} GROUP BY c`,
      ),
    ]);
    const toRecord = (rows: { value: string; count: number }[]) =>
      Object.fromEntries(rows.map((row) => [row.value, row.count]));
    const result = { certification: toRecord(certificationCounts) } as Record<
      CatalogSearchFacet,
      Record<string, number>
    >;
    COLUMN_FACETS.forEach((facet, index) => {
      result[facet] = toRecord(columnCounts[index]);
    });
    return result;
  }
}
