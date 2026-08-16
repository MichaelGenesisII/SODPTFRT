import { redirect } from "next/navigation";

/** Evaluation merged into Exams → Queue. */
export default function AdminEvaluationRedirect() {
  redirect("/admin/exams?tab=queue");
}
