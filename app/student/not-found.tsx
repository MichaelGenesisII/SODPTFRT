import { PortalNotFoundView } from "@/components/ui/portal-status-screen";

export default function StudentNotFound() {
  return (
    <div className="flex min-h-[min(70vh,36rem)] flex-col">
      <PortalNotFoundView
        homeHref="/student"
        homeLabel="Back to overview"
      />
    </div>
  );
}
