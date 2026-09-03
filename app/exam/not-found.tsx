import { PortalNotFoundView } from "@/components/ui/portal-status-screen";

export default function ExamNotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PortalNotFoundView homeHref="/" homeLabel="Back home" />
    </div>
  );
}
