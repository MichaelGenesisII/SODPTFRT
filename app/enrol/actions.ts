"use server";

import {
  ENROL_STEPS,
  isEnrolParishOther,
  validateStep,
  type EnrolFormData,
} from "@/lib/enrol/schema";
import { isAddressLookupReady } from "@/lib/address/lookup";
import {
  enrolmentConfirmationSubject,
  programmeLabelForMode,
} from "@/lib/enrol/payment";
import {
  createApplicationReference,
  createTemporaryPassword,
  type ApplicationReference,
} from "@/lib/enrol/reference";
import {
  portalBaseUrl,
  sendEnrolmentAccessRecoveryEmail,
  sendEnrolmentEmail,
} from "@/lib/email/backend";
import { withSaturdayBalance } from "@/lib/cohorts/saturday";
import {
  publicActionMessage,
} from "@/lib/safe-action-message";
import { SOD_SITE } from "@/lib/site-nav";
import { findAuthUserIdByEmail } from "@/lib/supabase/auth-admin";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { ensureParishYearBatch, getEnrolIntakeContext } from "@/app/enrol/saturday-actions";
import { resolveIntakeForEnrolment } from "@/lib/cohorts/intake";

export type SubmitEnrolmentResult =
  | {
      ok: true;
      reference: ApplicationReference;
      temporaryPassword: string;
      emailSubject: string;
      emailSent: boolean;
    }
  | {
      ok: false;
      message: string;
      code?: "already_enrolled";
      email?: string;
      firstName?: string;
    };

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function emptyToNullDate(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function validateAllSteps(data: EnrolFormData): Promise<string | null> {
  const addressLookupReady = await isAddressLookupReady();
  const payload = addressLookupReady
    ? data
    : { ...data, addressPlaceId: "" };
  for (const step of ENROL_STEPS) {
    const errors = validateStep(step.id, payload, { addressLookupReady });
    const first = Object.values(errors)[0];
    if (first) return first;
  }
  return null;
}

function enrolFail(message: string): SubmitEnrolmentResult {
  return { ok: false, message };
}

function enrolFailSafe(
  error: unknown,
  fallback: string,
): SubmitEnrolmentResult {
  console.error("[enrol]", error);
  return {
    ok: false,
    message: publicActionMessage(error, fallback),
  };
}

export async function submitEnrolment(
  data: EnrolFormData,
): Promise<SubmitEnrolmentResult> {
  try {
    const addressLookupReady = await isAddressLookupReady();
    const validationError = await validateAllSteps(data);
    if (validationError) {
      return enrolFail(validationError);
    }

    const email = data.email.trim().toLowerCase();
    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    const temporaryPassword = createTemporaryPassword();
    const parishIdRaw = data.parishId.trim();
    const parishOther = data.parishOther.trim();
    const parishIsOther = isEnrolParishOther(parishIdRaw);
    const parishId = parishIsOther ? null : parishIdRaw;
    const saturdayCohortId = data.saturdayCohortId.trim();
    let batchId: string | null = null;
    let cohortId: string | null = null;

    const service = createServiceSupabaseClient();

    const intakeAssignment = resolveIntakeForEnrolment(new Date());
    if (!intakeAssignment.enrolOpen) {
      return enrolFail(
        "Enrolment is not open for this intake right now. Please try again when the next intake opens, or contact Support.",
      );
    }

    if (!saturdayCohortId) {
      return enrolFail("Please choose which Saturday cohort you will attend.");
    }

    const { data: saturdayRow, error: saturdayError } = await service
      .from("saturday_cohorts")
      .select("id, programme_cohort_id, saturday_slot, label, is_active")
      .eq("id", saturdayCohortId)
      .maybeSingle();

    if (saturdayError || !saturdayRow?.is_active) {
      if (saturdayError) console.error("[enrol] saturday cohort", saturdayError);
      return enrolFail("Selected Saturday cohort is not available.");
    }

    const slot = saturdayRow.saturday_slot as number;
    if (
      !intakeAssignment.year1SaturdaySlots.includes(
        slot as 1 | 2 | 3 | 4,
      )
    ) {
      return enrolFail("That Saturday is not available for your intake.");
    }

    const { data: programme, error: programmeError } = await service
      .from("cohorts")
      .select("id, name, year_start, year_end, is_active, intake_key, is_fixed_intake")
      .eq("id", saturdayRow.programme_cohort_id)
      .maybeSingle();

    if (programmeError || !programme?.is_active) {
      if (programmeError) console.error("[enrol] programme year", programmeError);
      return enrolFail("That programme year is not open for enrolment.");
    }
    if (
      programme.is_fixed_intake &&
      programme.intake_key &&
      programme.intake_key !== intakeAssignment.intakeKey
    ) {
      return enrolFail("Your intake assignment does not match this Saturday.");
    }
    cohortId = programme.id;
    const intakeKey = intakeAssignment.intakeKey;

    const { data: siblingSlots } = await service
      .from("saturday_cohorts")
      .select("id, programme_cohort_id, saturday_slot, label, is_active")
      .eq("programme_cohort_id", cohortId)
      .eq("is_active", true);

    const counted = [];
    for (const slot of siblingSlots ?? []) {
      const { count } = await service
        .from("enrolments")
        .select("id", { count: "exact", head: true })
        .eq("saturday_cohort_id", slot.id)
        .neq("status", "rejected");
      counted.push({
        id: slot.id,
        programme_cohort_id: slot.programme_cohort_id,
        saturday_slot: slot.saturday_slot as 1 | 2 | 3 | 4,
        label: slot.label,
        is_active: slot.is_active,
        enrolment_count: count ?? 0,
      });
    }
    const balanced = withSaturdayBalance(counted);
    const chosen = balanced.find((c) => c.id === saturdayCohortId);
    if (!chosen?.selectable) {
      return enrolFail(
        "That Saturday cohort is currently full. Please choose another Saturday.",
      );
    }

    if (!parishIsOther) {
      if (!parishId) {
        return enrolFail("Please select your parish, or add it manually.");
      }

      const { data: parishRow } = await service
        .from("parishes")
        .select("id, name, is_active")
        .eq("id", parishId)
        .maybeSingle();

      if (!parishRow?.is_active) {
        return enrolFail("Selected parish is not available.");
      }

      const yearLabel =
        programme.year_start === programme.year_end
          ? String(programme.year_start)
          : `${programme.year_start}/${String(programme.year_end).slice(-2)}`;
      const batchResult = await ensureParishYearBatch({
        parishId,
        programmeCohortId: programme.id,
        year: programme.year_start,
        yearLabel: `${programme.name} ${yearLabel}`.trim(),
      });
      if ("error" in batchResult) {
        return enrolFail(batchResult.error);
      }
      batchId = batchResult.id;
    } else if (!parishOther) {
      return enrolFail("Please enter your parish or church name.");
    }

    const localChurchStored = parishIsOther ? parishOther : "";

    const { data: existingProfile } = await service
      .from("student_profiles")
      .select("id, email, first_name")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      return {
        ok: false,
        code: "already_enrolled",
        email,
        firstName: existingProfile.first_name?.trim() || firstName || undefined,
        message:
          "An application with this email already exists. Check your confirmation email, sign in to the student portal, or reset your password.",
      };
    }

    const { data: existingAdmin } = await service
      .from("admin_profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingAdmin) {
      return enrolFail(
        "This email is already used for staff access. Use a different email to enrol.",
      );
    }

    let reference = createApplicationReference();
    let createdUserId: string | null = null;
    /** True when we reused an orphan Auth user (do not delete Auth on rollback). */
    let reclaimedAuth = false;

    const studentMeta = {
      first_name: firstName,
      last_name: lastName,
      role: "student" as const,
    };

    const existingAuthId = await findAuthUserIdByEmail(service, email);

    if (existingAuthId) {
      const { data: studentById } = await service
        .from("student_profiles")
        .select("id")
        .eq("id", existingAuthId)
        .maybeSingle();
      if (studentById) {
        return {
          ok: false,
          code: "already_enrolled",
          email,
          firstName: firstName || undefined,
          message:
            "An application with this email already exists. Check your confirmation email, sign in to the student portal, or reset your password.",
        };
      }

      const { data: adminById } = await service
        .from("admin_profiles")
        .select("id")
        .eq("id", existingAuthId)
        .maybeSingle();
      if (adminById) {
        return enrolFail(
          "This email is already used for staff access. Use a different email to enrol.",
        );
      }

      const { error: updateError } = await service.auth.admin.updateUserById(
        existingAuthId,
        {
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: studentMeta,
        },
      );
      if (updateError) {
        console.error("[enrol] reclaim auth user", updateError);
        return enrolFailSafe(
          updateError,
          "Could not restore this email for enrolment. Please try again.",
        );
      }
      createdUserId = existingAuthId;
      reclaimedAuth = true;
    } else {
      const { data: created, error: createError } =
        await service.auth.admin.createUser({
          email,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: studentMeta,
        });

      if (createError || !created.user) {
        if (/already|registered|exists/i.test(createError?.message ?? "")) {
          const racedId = await findAuthUserIdByEmail(service, email);
          if (racedId) {
            const { error: updateError } =
              await service.auth.admin.updateUserById(racedId, {
                password: temporaryPassword,
                email_confirm: true,
                user_metadata: studentMeta,
              });
            if (!updateError) {
              createdUserId = racedId;
              reclaimedAuth = true;
            }
          }
        }
        if (!createdUserId) {
          if (/already|registered|exists/i.test(createError?.message ?? "")) {
            return {
              ok: false,
              code: "already_enrolled",
              email,
              firstName: firstName || undefined,
              message:
                "An application with this email already exists. Check your confirmation email, sign in to the student portal, or reset your password.",
            };
          }
          console.error("[enrol] createUser", createError);
          return enrolFailSafe(
            createError,
            "Could not create your account. Please try again.",
          );
        }
      } else {
        createdUserId = created.user.id;
      }
    }

    const { error: profileError } = await service.from("student_profiles").insert({
      id: createdUserId,
      email,
      first_name: firstName,
      middle_name: emptyToNull(data.middleName),
      last_name: lastName,
      gender: emptyToNull(data.gender),
      is_active: true,
    });

    if (profileError) {
      if (!reclaimedAuth) {
        await service.auth.admin.deleteUser(createdUserId);
      }
      console.error("[enrol] profile insert", profileError);
      return enrolFailSafe(
        profileError,
        "Enrolment is temporarily unavailable. Please try again later.",
      );
    }

    let lastEnrolError: string | null = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { error: enrolError } = await service.from("enrolments").insert({
        user_id: createdUserId,
        reference: reference.display,
        reference_compact: reference.compact,
        status: "submitted",
        payment_status: "unpaid",
        attendance_mode: data.attendanceMode,
        first_name: firstName,
        middle_name: emptyToNull(data.middleName),
        last_name: lastName,
        address_line1: data.addressLine1.trim(),
        address_line2: emptyToNull(data.addressLine2),
        town_city: data.townCity.trim(),
        county: emptyToNull(data.county),
        postcode: data.postcode.trim(),
        country: data.country,
        address_place_id: addressLookupReady
          ? emptyToNull(data.addressPlaceId)
          : null,
        mobile_number: data.mobileNumber.trim(),
        home_telephone: emptyToNull(data.homeTelephone),
        email,
        nationality: data.nationality,
        date_of_birth: data.dateOfBirth,
        marital_status: data.maritalStatus,
        born_again: data.bornAgain,
        born_again_date: emptyToNullDate(data.bornAgainDate),
        born_again_where: emptyToNull(data.bornAgainWhere),
        baptised_holy_spirit: data.baptisedHolySpirit,
        holy_spirit_date: emptyToNullDate(data.holySpiritDate),
        holy_spirit_where: emptyToNull(data.holySpiritWhere),
        baptised_water: null,
        water_baptism_date: null,
        water_baptism_where: null,
        schools_attended: emptyToNull(data.biblicalCourses),
        biblical_courses: emptyToNull(data.biblicalCourses),
        gender: emptyToNull(data.gender),
        occupations: data.occupations,
        occupation_other: emptyToNull(data.occupationOther),
        parish_id: parishId,
        batch_id: batchId,
        cohort_id: cohortId,
        intake_key: intakeKey,
        saturday_cohort_id: saturdayCohortId,
        local_church: emptyToNull(localChurchStored) ?? "",
        church_leader: "—",
        church_activities: null,
        declaration_accepted: data.declarationAccepted,
        declared_at: new Date().toISOString(),
      });

      if (!enrolError) {
        try {
          const { requireStudentFeeRows } = await import(
            "@/lib/payments/service"
          );
          await requireStudentFeeRows(service, createdUserId!);
        } catch (feeError) {
          console.error("[enrolment fees]", feeError);
          await service.from("enrolments").delete().eq("user_id", createdUserId);
          await service.from("student_profiles").delete().eq("id", createdUserId);
          if (!reclaimedAuth) {
            await service.auth.admin.deleteUser(createdUserId);
          }
          return enrolFail(
            "Enrolment is temporarily unavailable. Please try again later.",
          );
        }

        const fallbackSubject = enrolmentConfirmationSubject(
          firstName,
          reference.display,
        );

        const mailResult = await sendEnrolmentEmail({
          to: email,
          firstName,
          reference: reference.display,
          temporaryPassword,
          programmeLabel: programmeLabelForMode(data.attendanceMode),
          portalLoginUrl: `${portalBaseUrl()}/login/student`,
          portalSupportUrl: `${portalBaseUrl()}/student/support`,
          siteUrl: SOD_SITE,
        });

        if (!mailResult.ok) {
          console.error("[enrolment email]", mailResult.message);
        }

        return {
          ok: true,
          reference,
          temporaryPassword,
          emailSubject: mailResult.subject || fallbackSubject,
          emailSent: mailResult.ok,
        };
      }

      lastEnrolError = enrolError.message;
      if (
        enrolError.code === "23505" ||
        /duplicate|unique/i.test(enrolError.message)
      ) {
        reference = createApplicationReference();
        continue;
      }
      break;
    }

    await service.from("student_profiles").delete().eq("id", createdUserId);
    if (!reclaimedAuth) {
      await service.auth.admin.deleteUser(createdUserId);
    }
    console.error("[enrol] enrolment insert failed", lastEnrolError);

    return enrolFailSafe(
      lastEnrolError,
      "Could not save your application. Please try again.",
    );
  } catch (error) {
    return enrolFailSafe(
      error,
      "Could not submit your application. Please try again.",
    );
  }
}

export type EnrolAccessResult = {
  ok: boolean;
  message: string;
};

/** Self-serve recovery: issue a fresh temporary password and email it. */
export async function requestEnrolmentPasswordReset(
  emailRaw: string,
): Promise<EnrolAccessResult> {
  try {
    const email = emailRaw.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, message: "Enter a valid email address." };
    }

    const service = createServiceSupabaseClient();
    const { data: profile } = await service
      .from("student_profiles")
      .select("id, first_name, is_active")
      .eq("email", email)
      .maybeSingle();

    if (!profile) {
      return {
        ok: false,
        message:
          "We could not find an enrolment for that email. If you believe this is wrong, contact support.",
      };
    }

    if (!profile.is_active) {
      return {
        ok: false,
        message:
          "This student account is not active. Please contact support for help.",
      };
    }

    const { data: enrolment } = await service
      .from("enrolments")
      .select("reference, attendance_mode")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const temporaryPassword = createTemporaryPassword();
    const { error: updateError } = await service.auth.admin.updateUserById(
      profile.id,
      { password: temporaryPassword },
    );

    if (updateError) {
      console.error("[enrol] password update failed", updateError);
      return {
        ok: false,
        message: publicActionMessage(
          updateError.message,
          "Could not refresh your portal password. Please contact support.",
        ),
      };
    }

    const firstName = profile.first_name?.trim() || "friend";
    const reference =
      enrolment?.reference?.trim() || "Your existing application";
    const programmeLabel = programmeLabelForMode(
      enrolment?.attendance_mode || "standard",
    );

    const mailResult = await sendEnrolmentAccessRecoveryEmail({
      to: email,
      firstName,
      reference,
      temporaryPassword,
      programmeLabel,
      portalLoginUrl: `${portalBaseUrl()}/login/student`,
      portalSupportUrl: `${portalBaseUrl()}/student/support`,
      siteUrl: SOD_SITE,
    });

    if (!mailResult.ok) {
      console.error("[enrol] recovery email failed", mailResult.message);
      return {
        ok: false,
        message:
          "Your password was refreshed, but the email could not be sent. Please try Forgot password again in a moment — each try issues a fresh password.",
      };
    }

    return {
      ok: true,
      message: `A fresh temporary password has been emailed to ${email}.`,
    };
  } catch (error) {
    console.error("[enrol] password reset failed", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not refresh access. Please contact support.",
      ),
    };
  }
}
