import type { FinancePayoutStatus } from "@/lib/finance/payouts";

export function payoutStatusLabel(status: FinancePayoutStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "pending_authorisation":
      return "Waiting for authorisation";
    case "authorised":
      return "Authorised";
    case "sending":
      return "Sending";
    case "paid":
      return "Paid";
    case "declined":
      return "Declined";
    case "failed":
      return "Failed";
    case "returned":
      return "Returned";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "frozen":
      return "Frozen";
    default:
      return status;
  }
}
