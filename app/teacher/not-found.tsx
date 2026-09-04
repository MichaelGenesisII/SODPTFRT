import { PortalNotFoundView } from "@/components/ui/portal-status-screen";

export default function TeacherNotFound() {
  return (
    <div className="flex min-h-[min(70vh,36rem)] flex-col">
      <PortalNotFoundView homeHref="/teacher" homeLabel="Teacher home" />
    </div>
  );
}
