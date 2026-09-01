"use server";

import { revalidatePath } from "next/cache";
import {
  generateTicketReference,
  isSupportTopic,
  MESSAGE_MAX,
  NAME_MAX,
} from "@/lib/tickets";
import { publicActionMessage } from "@/lib/safe-action-message";
import { getSessionStudent } from "@/lib/student/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type CreateTicketResult = {
  ok: boolean;
  message: string;
  reference?: string;
  /** True when the note was linked into the signed-in student's inbox. */
  linked?: boolean;
};

const PUBLIC_TICKET_HOURLY_LIMIT = 5;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function recentPublicTicketCount(email: string): Promise<number> {
  try {
    const service = createServiceSupabaseClient();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await service
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .ilike("email", email)
      .gte("created_at", since);
    if (error) {
      console.error("recentPublicTicketCount:", error.message);
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    console.error("recentPublicTicketCount:", error);
    return 0;
  }
}

export async function createSupportTicket(
  formData: FormData,
): Promise<CreateTicketResult> {
  try {
    const topic = String(formData.get("topic") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const message = String(formData.get("message") ?? "").trim();
    const intakeSourceRaw = String(formData.get("intake_source") ?? "public");
    const intakeSource =
      intakeSourceRaw === "portal" ? ("portal" as const) : ("public" as const);

    if (!isSupportTopic(topic)) {
      return { ok: false, message: "Please choose a valid topic." };
    }
    if (name.length < 2 || name.length > NAME_MAX) {
      return {
        ok: false,
        message: `Name must be between 2 and ${NAME_MAX} characters.`,
      };
    }
    if (!isValidEmail(email) || email.length > 160) {
      return { ok: false, message: "Please enter a valid email address." };
    }
    if (message.length < 10) {
      return {
        ok: false,
        message: "Please share a little more detail (at least 10 characters).",
      };
    }
    if (message.length > MESSAGE_MAX) {
      return {
        ok: false,
        message: `Message must be ${MESSAGE_MAX} characters or fewer.`,
      };
    }

    const recent = await recentPublicTicketCount(email);
    if (recent >= PUBLIC_TICKET_HOURLY_LIMIT) {
      return {
        ok: false,
        message:
          "Too many notes from this email just now. Please try again later.",
      };
    }

    // Signed-in students keep public /support usable; matching email links the
    // ticket into their portal inbox immediately.
    const student = await getSessionStudent();
    const linkedUserId =
      student && student.email.trim().toLowerCase() === email
        ? student.id
        : null;

    const supabase = await createServerSupabaseClient();
    const now = new Date().toISOString();

    let reference = generateTicketReference();
    let lastError: string | null = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const payload: Record<string, unknown> = {
        reference,
        topic,
        name,
        email,
        message,
        status: "open",
        priority: "normal",
        user_id: linkedUserId,
        intake_source: intakeSource,
        created_at: now,
        updated_at: now,
      };

      const { error } = await supabase.from("support_tickets").insert(payload);

      if (!error) {
        revalidatePath("/admin/tickets");
        revalidatePath("/admin");
        if (linkedUserId) revalidatePath("/student/support");
        return {
          ok: true,
          message: linkedUserId
            ? "Your note reached the Listening Desk and is in your student Support inbox."
            : "Your note reached the Listening Desk.",
          reference,
          linked: Boolean(linkedUserId),
        };
      }

      lastError = error.message;

      // Schema without intake_source — retry without the column.
      if (/column .*intake_source.* does not exist/i.test(error.message)) {
        delete payload.intake_source;
        const retry = await supabase.from("support_tickets").insert(payload);
        if (!retry.error) {
          revalidatePath("/admin/tickets");
          revalidatePath("/admin");
          if (linkedUserId) revalidatePath("/student/support");
          return {
            ok: true,
            message: linkedUserId
              ? "Your note reached the Listening Desk and is in your student Support inbox."
              : "Your note reached the Listening Desk.",
            reference,
            linked: Boolean(linkedUserId),
          };
        }
        lastError = retry.error.message;
      }

      // Older schema without user_id — retry once without the column.
      if (
        linkedUserId &&
        /column .*user_id.* does not exist/i.test(error.message)
      ) {
        const retry = await supabase.from("support_tickets").insert({
          reference,
          topic,
          name,
          email,
          message,
          status: "open",
          priority: "normal",
          created_at: now,
          updated_at: now,
        });
        if (!retry.error) {
          revalidatePath("/admin/tickets");
          revalidatePath("/admin");
          return {
            ok: true,
            message: "Your note reached the Listening Desk.",
            reference,
            linked: false,
          };
        }
        lastError = retry.error.message;
        break;
      }
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        reference = generateTicketReference();
        continue;
      }
      break;
    }

    if (lastError) {
      console.error("createSupportTicket:", lastError);
    }

    if (
      lastError &&
      /relation .* does not exist|Could not find the table/i.test(lastError)
    ) {
      return {
        ok: false,
        message:
          "Support is temporarily unavailable. Please try again later.",
      };
    }

    return {
      ok: false,
      message: publicActionMessage(
        lastError,
        "Could not send your message. Please try again.",
      ),
    };
  } catch (error) {
    console.error("createSupportTicket:", error);
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}
