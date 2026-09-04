"use client";

type StaffAvatarProps = {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  active?: boolean;
  className?: string;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0]![0] ?? "?").toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

const sizeClass = {
  sm: "h-8 w-8 text-[0.65rem]",
  md: "h-9 w-9 text-[0.65rem]",
  lg: "h-11 w-11 text-sm",
} as const;

/** Circle portrait — photo when available, otherwise initials. */
export function StaffAvatar({
  name,
  imageUrl,
  size = "md",
  active = true,
  className = "",
}: StaffAvatarProps) {
  const initials = initialsFromName(name);

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={`shrink-0 rounded-full object-cover ring-1 ring-pine/15 ${sizeClass[size]} ${
          active ? "" : "opacity-55"
        } ${className}`}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-medium uppercase tracking-wide ${sizeClass[size]} ${
        active ? "bg-pine text-mist" : "bg-stone text-ink/50"
      } ${className}`}
      aria-hidden
    >
      {initials}
    </span>
  );
}
