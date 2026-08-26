/**
 * The one formatting primitive the dictionaries need.
 *
 * Messages that carry a runtime value keep it as a `{name}` placeholder rather
 * than a function, because the whole dictionary is handed to client components
 * through a React context and has to survive serialization.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
