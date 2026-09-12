import { redirect } from "next/navigation";

export default function AdminAdminsRedirect() {
  redirect("/admin/access");
}
