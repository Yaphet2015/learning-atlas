/** The 「我能解释」 seal: the round-cap A from the app icon on a vermilion rounded square. */
export const Seal = ({ size = 26 }: { size?: number }) => (
  <svg
    className="seal"
    width={size}
    height={size}
    viewBox="-50 -50 100 100"
    role="img"
    aria-label="我能解释"
  >
    <rect x="-46" y="-46" width="92" height="92" rx="24" fill="var(--accent)" />
    <rect
      x="-46"
      y="-46"
      width="92"
      height="92"
      rx="24"
      fill="none"
      stroke="rgba(255,255,255,.28)"
      strokeWidth="3"
    />
    <path
      d="M-20 26 L0 -26 L20 26"
      fill="none"
      stroke="#FFF8F0"
      strokeWidth="9.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M-24 9 H24" stroke="#FFF8F0" strokeWidth="7.5" strokeLinecap="round" />
  </svg>
);
