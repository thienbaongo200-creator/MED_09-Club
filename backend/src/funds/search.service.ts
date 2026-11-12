import { Injectable } from '@nestjs/common';

/**
 * PostgreSQL-backed statement search. PII is redacted inside SQL before the
 * content is searched, so an email/phone embedded in a description cannot be
 * used as a probe that reveals matching statement rows.
 */
@Injectable()
export class SearchService {
  buildStatementPredicate(keyword: string, firstParameter: number) {
    const description = `regexp_replace(regexp_replace(COALESCE(g.noi_dung, ''), '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}', '***', 'gi'), '[+]?[0-9][0-9 .()-]{7,}[0-9]', '***', 'g')`;
    return {
      sql: `(${description} ILIKE $${firstParameter} OR m.ho_ten ILIKE $${firstParameter + 1})`,
      values: [`%${keyword}%`, `%${keyword}%`],
    };
  }
}
