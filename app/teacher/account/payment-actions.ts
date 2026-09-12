"use server";

import { revalidatePath } from "next/cache";
import { portalBaseUrl } from "@/lib/email/config";
import { publicActionMessage } from "@/lib/safe-action-message";
import { requireSessionTeacher } from "@/lib/teacher/auth";
import {
  methodLabel,
  payeeMaskLabel,
  upsertTeacherPaymentDetails,
  type TeacherPaymentMethod,
} from "@/lib/teacher/payment-details";
import { teacherDisplayName } from "@/lib/teacher/types";
import { isPaymentEncryptionConfigured } from "@/lib/crypto/field-encryption";

export type TeacherPaymentActionResult = {
  ok: boolean;
  message: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function saveTeacherPaymentDetails(
  formData: FormData,
): Promise<TeacherPaymentActionResult> {
  try {
    const teacher = await requireSessionTeacher();
    if (!isPaymentEncryptionConfigured()) {
      return {
        ok: false,
        message: "Payment details are temporarily unavailable. Please try again later.",
      };
    }

    const methodRaw = String(formData.get("method") ?? "").trim();
    const method: TeacherPaymentMethod | null =
      methodRaw === "paypal" || methodRaw === "bank_transfer"
        ? methodRaw
        : null;
    if (!method) {
      return { ok: false, message: "Choose PayPal or bank transfer." };
    }

    let saveInput:
      | { method: "paypal"; paypalEmail: string }
      | {
          method: "bank_transfer";
          bankAccountName: string;
          bankSortCode: string;
          bankAccountNumber: string;
        };

    if (method === "paypal") {
      const paypalEmail = String(formData.get("paypalEmail") ?? "")
        .trim()
        .toLowerCase();
      if (!paypalEmail || !isValidEmail(paypalEmail)) {
        return { ok: false, message: "Enter a valid PayPal email." };
      }
      saveInput = { method: "paypal", paypalEmail };
    } else {
      const bankAccountName = String(
        formData.get("bankAccountName") ?? "",
      ).trim();
      const bankSortCode = String(formData.get("bankSortCode") ?? "").trim();
      const bankAccountNumber = String(
        formData.get("bankAccountNumber") ?? "",
      ).replace(/\s+/g, "");
      if (!bankAccountName) {
        return { ok: false, message: "Enter the account name." };
      }
      if (!/^\d{2}-?\d{2}-?\d{2}$/.test(bankSortCode.replace(/\s/g, ""))) {
        return { ok: false, message: "Enter a 6-digit sort code." };
      }
      if (!/^\d{6,10}$/.test(bankAccountNumber)) {
        return {
          ok: false,
          message: "Enter a valid account number (digits only).",
        };
      }
      saveInput = {
        method: "bank_transfer",
        bankAccountName,
        bankSortCode,
        bankAccountNumber,
      };
    }

    const { before, after } = await upsertTeacherPaymentDetails(
      teacher.id,
      saveInput,
    );

    const mask = payeeMaskLabel({
      preferredMethod: after.preferredMethod,
      paypalEmailMask: after.paypalEmailMask,
      bankAccountLast4: after.bankAccountLast4,
    });

    const recipients = new Set<string>();
    recipients.add(teacher.email.trim().toLowerCase());
    if (before?.paypalEmail) {
      recipients.add(before.paypalEmail.trim().toLowerCase());
    }
    if (saveInput.method === "paypal") {
      recipients.add(saveInput.paypalEmail);
    }

    const {
      sendTeacherPaymentDetailsChangedEmail,
    } = await import("@/lib/email/backend");
    const template = {
      teacherName: teacherDisplayName(teacher),
      methodLabel: methodLabel(after.preferredMethod),
      payeeMask: mask,
      portalAccountUrl: `${portalBaseUrl()}/teacher/payments`,
      siteUrl: portalBaseUrl(),
    };

    await Promise.all(
      [...recipients].map(async (to) => {
        const result = await sendTeacherPaymentDetailsChangedEmail({
          to,
          ...template,
        });
        if (!result.ok) {
          console.error("[teacher/payment-details/notify]", to, result.message);
        }
      }),
    );

    revalidatePath("/teacher/payments");
    revalidatePath("/finance/teachers");
    revalidatePath("/finance/payments");
    return {
      ok: true,
      message: "Payment details saved. A confirmation email was sent.",
    };
  } catch (error) {
    console.error("[teacher/payment-details/save]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not save payment details. Please try again.",
      ),
    };
  }
}
