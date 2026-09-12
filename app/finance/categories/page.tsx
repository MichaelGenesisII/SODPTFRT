import { redirect } from "next/navigation";

export default function FinanceCategoriesRedirect() {
  redirect("/finance/books?panel=categories");
}
