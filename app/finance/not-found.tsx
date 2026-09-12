import { PortalNotFoundView } from "@/components/ui/portal-status-screen";

export default function FinanceNotFound() {
  return (
    <div className="flex min-h-[min(70vh,36rem)] flex-col">
      <PortalNotFoundView homeHref="/finance" homeLabel="Finance home" />
    </div>
  );
}
