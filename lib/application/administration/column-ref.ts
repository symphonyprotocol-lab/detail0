import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * A column reference that keeps its table name inside a `sql` template.
 *
 * Drizzle strips the table off any column chunk it finds in the select list of
 * a query with no joins (`isSingleTable`, pg-core/dialect), on the reasoning
 * that there is only one table to qualify against. A correlated subquery in
 * that select list breaks the assumption: it has its own FROM, so a bare
 * `"id"` resolves there instead of against the outer row, and the statement
 * fails to plan. Only column chunks are rewritten, so wrapping the column in
 * its own fragment -- which arrives as a nested SQL chunk -- keeps the
 * qualification the subquery depends on.
 */
export function ref(column: AnyPgColumn): SQL {
  return sql`${column}`;
}
