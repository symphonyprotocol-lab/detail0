'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, FilterIcon } from '@/components/ui/icons';

/**
 * The filter control on a console list.
 *
 * A plain `<select>` inside the list's GET form, submitting on change so the
 * filter takes one action rather than two. It degrades to the form's own submit
 * button without JavaScript, which is why it is a real form control rather than
 * a menu that writes to the URL itself.
 *
 * Controlled, not `defaultValue`: after browser back/forward the URL's value
 * changes while the mounted select keeps its old choice, which would silently
 * re-submit the stale filter alongside the next search. The effect re-seeds the
 * state whenever navigation moves the prop.
 */
export function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: { id: string; label: string }[];
}) {
  const ref = useRef<HTMLSelectElement>(null);
  const [current, setCurrent] = useState(value);

  useEffect(() => {
    setCurrent(value);
  }, [value]);

  return (
    <span className="relative inline-flex h-[37px] shrink-0 items-center gap-1.5 rounded-[7px] border-2 border-line bg-card pl-2.5 text-[12px] tracking-[-0.023em] text-steel">
      <FilterIcon size={14} className="text-muted" />
      <select
        ref={ref}
        name={name}
        value={current}
        aria-label={label}
        onChange={(event) => {
          setCurrent(event.currentTarget.value);
          ref.current?.form?.requestSubmit();
        }}
        className="h-full appearance-none bg-transparent py-0 pr-6 pl-0 text-[12px] text-steel focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={13} className="pointer-events-none absolute right-2 text-muted" />
    </span>
  );
}
