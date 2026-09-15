/**
 * The hero's figure: isometric knowledge modules, stacked and linked.
 *
 * Flat geometry, no gradient and no perspective tricks -- the depth is carried
 * by the projection and by flat tonal steps, which is the only way this system
 * expresses it anywhere. The stack is a value ladder rather than a set of hues:
 * the whole chromatic budget here is one blue, so the layers separate by
 * lightness and the second accent colour the old figure leaned on is gone.
 *
 * Every value has to clear both grounds, because the figure is fixed while the
 * page behind it is not. That rules Midnight Ink out of the bottom layer -- it
 * is the dark theme's own canvas, and the stack lost its base there -- so the
 * base is a deepened Electric Blue instead, which sits below the paper canvas
 * and above the navy one.
 *
 * It is deliberately wordless. Labelling the layers would put English strings
 * into a figure that every locale shares, and the stack reads as layered,
 * linked knowledge without them.
 *
 * A note for whoever revisits this: the reference this site is styled from
 * calls for product screenshots here rather than an illustration. This figure
 * is a deliberate exception to that, chosen over a data mockup.
 */
export function HeroFigure({ className = '' }: { className?: string }) {
  /* One layer of the stack: a rhombus top with two shaded sides, placed by its
     left corner in isometric space. */
  const layer = (y: number, top: string, side: string, front: string) => (
    <g key={y}>
      <path d={`M60 ${y} l110 -63 l110 63 l-110 63 Z`} fill={top} />
      <path d={`M60 ${y} l110 63 l0 22 l-110 -63 Z`} fill={side} />
      <path d={`M170 ${y + 63} l110 -63 l0 22 l-110 63 Z`} fill={front} />
    </g>
  );

  return (
    <svg
      viewBox="0 0 460 420"
      role="presentation"
      aria-hidden
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Connectors, drawn first so the stack sits over them. */}
      <g stroke="#0f77ff" strokeOpacity="0.55" strokeWidth="1.5">
        <path d="M70 150 L70 96 L150 50" />
        <path d="M390 214 L424 194 L424 130" />
        <path d="M70 278 L70 330 L150 376" />
      </g>
      <g fill="#0f77ff">
        <circle cx="150" cy="50" r="4" />
        <circle cx="424" cy="130" r="4" />
        <circle cx="150" cy="376" r="4" />
      </g>

      {/* The stack, back to front. */}
      {layer(214, '#0a4ea8', '#083f88', '#07356f')}
      {layer(174, '#b1bbcd', '#8e98aa', '#7b8596')}
      {layer(134, '#f5f3ff', '#d5d1ec', '#c2bddc')}
      {layer(94, '#0f77ff', '#0b5cc4', '#0950ab')}

      {/* A module lifted clear of the stack. */}
      <g>
        <path d="M286 300 l70 -40 l70 40 l-70 40 Z" fill="#ffffff" />
        <path d="M286 300 l70 40 l0 16 l-70 -40 Z" fill="#e1e9f0" />
        <path d="M356 340 l70 -40 l0 16 l-70 40 Z" fill="#d3dbe4" />
        <path d="M326 300 l30 -17 l30 17 l-30 17 Z" fill="#0f77ff" />
      </g>
    </svg>
  );
}
