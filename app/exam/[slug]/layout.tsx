import type { ReactNode } from "react";

/** Immersive exam surface — no site header/footer. */
export default function ExamTakeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-pine text-mist antialiased">{children}</div>
  );
}
