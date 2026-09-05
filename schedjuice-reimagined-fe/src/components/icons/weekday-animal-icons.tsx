/**
 * Myanmar day-animal icons for weekday selectors.
 *
 * Traditional mapping: Sun = Garuda, Mon = Tiger, Tue = Lion, Wed = Elephant,
 * Thu = Rat, Fri = Guinea pig, Sat = Naga. Colors are fixed saturated tones
 * (not currentColor) so the animals stay playful on both selected and
 * unselected chips.
 */

type IconProps = {
  className?: string;
};

function svgProps(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true,
    focusable: false,
    className,
  } as const;
}

/** Sunday — Garuda (red-and-gold bird). */
export function GarudaIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M5.5 9 q-2.5 4.5 1 8.5 q0.6 -3.5 3 -5.5 Z" fill="#F59E0B" />
      <path d="M18.5 9 q2.5 4.5 -1 8.5 q-0.6 -3.5 -3 -5.5 Z" fill="#F59E0B" />
      <circle cx="12" cy="12.5" r="6" fill="#EF4444" />
      <path
        d="M9.6 6.9 L8.6 4.3 L11 5.9 M12 6.4 V3.4 M14.4 6.9 L15.4 4.3 L13 5.9"
        stroke="#F59E0B"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.8" cy="11.4" r="1" fill="#450A0A" />
      <circle cx="14.2" cy="11.4" r="1" fill="#450A0A" />
      <path d="M10.7 13.6 h2.6 L12 16 Z" fill="#FBBF24" />
    </svg>
  );
}

/** Monday — Tiger. */
export function TigerIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="6.5" cy="7" r="2.6" fill="#EA580C" />
      <circle cx="17.5" cy="7" r="2.6" fill="#EA580C" />
      <circle cx="6.5" cy="7" r="1.2" fill="#FDBA74" />
      <circle cx="17.5" cy="7" r="1.2" fill="#FDBA74" />
      <circle cx="12" cy="13" r="7.5" fill="#F97316" />
      <path
        d="M12 6 v2.4 M8.4 7 l1.3 2.2 M15.6 7 l-1.3 2.2"
        stroke="#7C2D12"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <ellipse cx="12" cy="15.8" rx="3.6" ry="2.7" fill="#FFEDD5" />
      <circle cx="9.2" cy="11.8" r="1" fill="#431407" />
      <circle cx="14.8" cy="11.8" r="1" fill="#431407" />
      <path d="M10.9 14.4 h2.2 L12 15.9 Z" fill="#431407" />
    </svg>
  );
}

/** Tuesday — Lion. */
export function LionIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="18.2" cy="12.5" r="3.2" fill="#B45309" />
      <circle cx="16.4" cy="16.9" r="3.2" fill="#B45309" />
      <circle cx="12" cy="18.7" r="3.2" fill="#B45309" />
      <circle cx="7.6" cy="16.9" r="3.2" fill="#B45309" />
      <circle cx="5.8" cy="12.5" r="3.2" fill="#B45309" />
      <circle cx="7.6" cy="8.1" r="3.2" fill="#B45309" />
      <circle cx="12" cy="6.3" r="3.2" fill="#B45309" />
      <circle cx="16.4" cy="8.1" r="3.2" fill="#B45309" />
      <circle cx="12" cy="12.5" r="6.8" fill="#B45309" />
      <circle cx="12" cy="12.5" r="5.8" fill="#FBBF24" />
      <ellipse cx="12" cy="14.9" rx="2.9" ry="2.1" fill="#FEF3C7" />
      <circle cx="9.6" cy="11.2" r="0.95" fill="#451A03" />
      <circle cx="14.4" cy="11.2" r="0.95" fill="#451A03" />
      <path d="M11 13.9 h2 L12 15.2 Z" fill="#78350F" />
      <path
        d="M12 15.2 v0.9"
        stroke="#78350F"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Wednesday — Elephant. */
export function ElephantIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="5.2" cy="11.5" r="4.4" fill="#2563EB" />
      <circle cx="18.8" cy="11.5" r="4.4" fill="#2563EB" />
      <circle cx="5.2" cy="11.5" r="2.4" fill="#93C5FD" />
      <circle cx="18.8" cy="11.5" r="2.4" fill="#93C5FD" />
      <circle cx="12" cy="11.5" r="6.3" fill="#3B82F6" />
      <path
        d="M9.7 15 q-0.2 2 -1.6 3 M14.3 15 q0.2 2 1.6 3"
        stroke="#FEF3C7"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 14 v4.6 q0 1.9 2.3 1.9"
        stroke="#3B82F6"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="9.6" cy="10.6" r="0.95" fill="#1E3A8A" />
      <circle cx="14.4" cy="10.6" r="0.95" fill="#1E3A8A" />
    </svg>
  );
}

/** Thursday — Rat. */
export function RatIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="6.8" cy="7.2" r="3.4" fill="#8B5CF6" />
      <circle cx="17.2" cy="7.2" r="3.4" fill="#8B5CF6" />
      <circle cx="6.8" cy="7.2" r="1.7" fill="#F9A8D4" />
      <circle cx="17.2" cy="7.2" r="1.7" fill="#F9A8D4" />
      <path
        d="M12 20.5 C8.8 19.6 5.8 16.9 5.8 13.2 a6.2 6.2 0 0 1 12.4 0 c0 3.7 -3 6.4 -6.2 7.3 Z"
        fill="#A78BFA"
      />
      <circle cx="9.4" cy="12" r="1" fill="#3B0764" />
      <circle cx="14.6" cy="12" r="1" fill="#3B0764" />
      <circle cx="12" cy="17.6" r="1.1" fill="#F472B6" />
      <path
        d="M10.7 16.9 L8 16.3 M10.7 18 L8.1 18.5 M13.3 16.9 L16 16.3 M13.3 18 L15.9 18.5"
        stroke="#7C3AED"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Friday — Guinea pig. */
export function GuineaPigIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="8.6" cy="7.8" r="2.1" fill="#92400E" />
      <circle cx="15.4" cy="7.8" r="2.1" fill="#92400E" />
      <ellipse cx="12" cy="13.6" rx="7.8" ry="6.2" fill="#D97706" />
      <ellipse cx="12" cy="9.4" rx="3" ry="1.8" fill="#FDE68A" />
      <circle cx="9.4" cy="12.4" r="1" fill="#451A03" />
      <circle cx="14.6" cy="12.4" r="1" fill="#451A03" />
      <path d="M11 15 h2 L12 16.2 Z" fill="#F472B6" />
      <path
        d="M12 16.2 q-1.2 1.3 -2.4 0.6 M12 16.2 q1.2 1.3 2.4 0.6"
        stroke="#92400E"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Saturday — Naga (crested serpent). */
export function NagaIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path
        d="M18.5 18.3 q1.7 -0.4 2 -1.9"
        stroke="#047857"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M5.5 18.3 h13"
        stroke="#047857"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <path
        d="M7 14.4 h10"
        stroke="#059669"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M12 12.5 v-2.5"
        stroke="#10B981"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="12" cy="8.4" r="3.7" fill="#10B981" />
      <path
        d="M9.9 5.4 L8.9 3 L11.2 4.1 M12 4.6 V2 M14.1 5.4 L15.1 3 L12.8 4.1"
        stroke="#F59E0B"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10.7" cy="8.2" r="0.95" fill="#022C22" />
      <circle cx="13.3" cy="8.2" r="0.95" fill="#022C22" />
    </svg>
  );
}

const WEEKDAY_ANIMAL_ICONS: Record<
  string,
  (props: IconProps) => React.ReactElement
> = {
  Sun: GarudaIcon,
  Mon: TigerIcon,
  Tue: LionIcon,
  Wed: ElephantIcon,
  Thu: RatIcon,
  Fri: GuineaPigIcon,
  Sat: NagaIcon,
};

/**
 * Renders the day-animal icon for a `weekdayNames` label ("Sun" … "Sat").
 * Renders nothing for unknown labels.
 */
export function WeekdayAnimalIcon({
  day,
  className,
}: {
  day: string;
  className?: string;
}) {
  const Icon = WEEKDAY_ANIMAL_ICONS[day];
  if (!Icon) return null;
  return <Icon className={className} />;
}
