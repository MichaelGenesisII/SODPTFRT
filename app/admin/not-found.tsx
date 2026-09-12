import { PortalNotFoundView } from "@/components/ui/portal-status-screen";

export default function AdminNotFound() {
  return (
    <div className="flex min-h-[min(70vh,36rem)] flex-col">
      <PortalNotFoundView
        homeHref="/admin"
        homeLabel="Back to overview"
        secondaryHref="/admin/students"
        secondaryLabel="Students"
      />
    </div>
  );
}
