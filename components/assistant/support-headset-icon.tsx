export function SupportHeadsetIcon({
  className = "h-6 w-6",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M4 13.5v-1.75a8 8 0 0 1 16 0V13.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M4 13.5a2.25 2.25 0 0 0 2.25 2.25H7.5V11H6.25A2.25 2.25 0 0 0 4 13.25V13.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M20 13.5a2.25 2.25 0 0 1-2.25 2.25H16.5V11h1.25A2.25 2.25 0 0 1 20 13.25V13.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M8 18.5h2.25a1.75 1.75 0 0 0 3.5 0H16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
