import { PortalNotFoundView } from "@/components/ui/portal-status-screen";

export default function AlumniNotFound() {
  return (
    <div className="flex min-h-[min(70vh,36rem)] flex-col">
      <PortalNotFoundView
        homeHref="/alumni"
        homeLabel="Back to alumni home"
      />
    </div>
  );
}
