"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { submitEnrolment } from "@/app/enrol/actions";
import { AddressSearchField } from "@/components/enrol/address-lookup";
import { isAddressLookupReady } from "@/lib/address/lookup";
import {
  ATTENDANCE_MODES,
  COUNTRIES,
  ENROL_PARISH_OTHER_VALUE,
  ENROL_STEPS,
  GENDERS,
  enrolFieldDomId,
  firstEnrolErrorField,
  initialEnrolFormData,
  isEnrolParishOther,
  MARITAL_STATUSES,
  OCCUPATIONS,
  validateStep,
  type EnrolFormData,
  type EnrolStepId,
} from "@/lib/enrol/schema";
import type { ApplicationReference } from "@/lib/enrol/reference";
import {
  SATURDAY_COHORT_HINT,
  type SaturdayCohortOption,
} from "@/lib/cohorts/saturday";
import type { EnrolIntakeContext } from "@/lib/enrol/intake-context";
import { EnrolAlreadyApplied } from "@/components/enrol/already-enrolled";
import { EnrolPostSubmit } from "@/components/enrol/post-submit";
import {
  ChipGroup,
  ChoiceCards,
  DateField,
  FieldError,
  FieldLabel,
  Reveal,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/enrol/fields";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import { publicActionMessage } from "@/lib/safe-action-message";

type EnrolParishOption = { id: string; name: string; region: string | null };

function updateField<K extends keyof EnrolFormData>(
  setData: Dispatch<SetStateAction<EnrolFormData>>,
  key: K,
  value: EnrolFormData[K],
) {
  setData((prev) => ({ ...prev, [key]: value }));
}

function focusEnrolError(
  errors: Partial<Record<keyof EnrolFormData, string>>,
) {
  const field = firstEnrolErrorField(errors);
  if (!field) return;
  const id = enrolFieldDomId(field);
  window.requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof (el as HTMLElement).focus === "function") {
      (el as HTMLElement).focus({ preventScroll: true });
    }
  });
}

function cohortFillHint(cohort: SaturdayCohortOption): string {
  if (!cohort.selectable) {
    return "Temporarily at capacity — please choose another Saturday.";
  }
  if (cohort.recommended) {
    return "Best availability right now.";
  }
  if (cohort.relativeToFair > 0) {
    return "Filling a little faster than others.";
  }
  return "Open for enrolment.";
}

function StepProgress({ currentIndex }: { currentIndex: number }) {
  const total = ENROL_STEPS.length;
  const percent = Math.round((currentIndex / total) * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 text-sm">
        <p className="font-medium tracking-wide text-pine">
          Step {currentIndex + 1} of {total}
        </p>
        <p className="tabular-nums text-ink/55">{percent}% complete</p>
      </div>

      <div
        className="h-1.5 overflow-hidden bg-stone md:hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full bg-pine transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="hidden gap-2 md:flex" aria-label="Enrolment progress">
        {ENROL_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li key={step.id} className="min-w-0 flex-1">
              <div className="relative h-1.5 overflow-hidden bg-stone">
                <div
                  className={`absolute inset-y-0 left-0 bg-pine transition-[width] duration-500 ease-out ${
                    done ? "w-full" : active ? "w-1/3" : "w-0"
                  }`}
                />
              </div>
              <p
                className={`mt-2 truncate text-[0.65rem] font-medium uppercase tracking-[0.12em] ${
                  active
                    ? "text-pine"
                    : done
                      ? "text-celadon"
                      : "text-ink/35"
                }`}
              >
                {step.label}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="grid gap-1 border-t border-stone/70 py-3.5 first:border-t-0 first:pt-0 sm:grid-cols-[10rem_1fr] sm:gap-6">
      <dt className="text-xs font-medium uppercase tracking-[0.12em] text-ink/45">
        {label}
      </dt>
      <dd className="text-sm leading-relaxed text-ink">{value}</dd>
    </div>
  );
}

function SaturdayCohortPicker({
  cohorts,
  value,
  onChange,
  error,
  forced,
}: {
  cohorts: SaturdayCohortOption[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
  forced?: boolean;
}) {
  const fieldId = enrolFieldDomId("saturdayCohortId");

  if (cohorts.length === 0) {
    return (
      <div id={fieldId} tabIndex={-1}>
        <p className="text-sm text-ink/60">
          Saturday cohorts are not available yet. Please try again later.
        </p>
        <FieldError message={error} />
      </div>
    );
  }

  if (forced && cohorts.length === 1) {
    const only = cohorts[0]!;
    return (
      <div id={fieldId} tabIndex={-1}>
        <input type="hidden" name="saturdayCohortId" value={only.id} />
        <div className="border border-pine/25 bg-mist/60 px-4 py-4">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Your Saturday
          </p>
          <p className="mt-1 font-display text-xl text-pine">
            {only.label}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Earlier Saturdays for this intake have already passed. You are
            joining the class that is still available.
          </p>
        </div>
        <FieldError message={error} />
      </div>
    );
  }

  return (
    <div id={fieldId} tabIndex={-1}>
      <div className="grid gap-3 sm:grid-cols-2">
        {cohorts.map((cohort) => {
          const selected = value === cohort.id;
          const disabled = !cohort.selectable;
          return (
            <button
              key={cohort.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => {
                if (!disabled) onChange(cohort.id);
              }}
              className={`relative border px-5 py-4 text-left transition-[border-color,background-color,opacity] duration-300 ${
                disabled
                  ? "cursor-not-allowed border-stone/70 bg-stone/30 text-ink/40 opacity-70"
                  : selected
                    ? "border-pine bg-pine text-mist"
                    : "border-stone bg-mist/50 text-ink hover:border-pine/40 hover:bg-mist"
              }`}
            >
              {cohort.recommended && !disabled ? (
                <span
                  className={`absolute right-3 top-3 text-[0.65rem] font-medium uppercase tracking-[0.12em] ${
                    selected ? "text-mist/80" : "text-celadon"
                  }`}
                >
                  Recommended
                </span>
              ) : null}
              <span className="block pr-20 font-medium tracking-wide">
                {cohort.label}
              </span>
              <span
                className={`mt-1 block text-sm ${
                  selected && !disabled ? "text-mist/75" : "text-ink/55"
                }`}
              >
                {cohortFillHint(cohort)}
              </span>
            </button>
          );
        })}
      </div>
      <FieldError message={error} />
    </div>
  );
}

export function EnrolWizard({
  parishes,
  saturdayCohorts: initialSaturdayCohorts,
  intakeContext,
}: {
  parishes: EnrolParishOption[];
  saturdayCohorts: SaturdayCohortOption[];
  intakeContext: EnrolIntakeContext;
}) {
  const { success, error: toastError } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<EnrolFormData>(initialEnrolFormData);
  const [errors, setErrors] = useState<
    Partial<Record<keyof EnrolFormData, string>>
  >({});
  const [submission, setSubmission] = useState<{
    reference: ApplicationReference;
    temporaryPassword: string;
    emailSubject: string;
    emailSent: boolean;
  } | null>(null);
  const [alreadyEnrolled, setAlreadyEnrolled] = useState<{
    email: string;
    firstName?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [saturdayCohorts] = useState(initialSaturdayCohorts);
  const [addressLookupReady, setAddressLookupReady] = useState<boolean | null>(
    null,
  );

  const saturdayForced =
    intakeContext.saturdayForced || saturdayCohorts.length === 1;

  useEffect(() => {
    if (!saturdayForced || saturdayCohorts.length !== 1) return;
    const onlyId = saturdayCohorts[0]!.id;
    setData((prev) =>
      prev.saturdayCohortId === onlyId
        ? prev
        : { ...prev, saturdayCohortId: onlyId },
    );
  }, [saturdayForced, saturdayCohorts]);

  const step = ENROL_STEPS[stepIndex];

  const attendanceLabel = useMemo(
    () =>
      ATTENDANCE_MODES.find((mode) => mode.value === data.attendanceMode)
        ?.label ?? "",
    [data.attendanceMode],
  );

  const genderLabel = useMemo(
    () => GENDERS.find((g) => g.value === data.gender)?.label ?? "",
    [data.gender],
  );

  const parishLabel = useMemo(() => {
    if (isEnrolParishOther(data.parishId)) {
      return data.parishOther.trim() || "Not listed (manual)";
    }
    return parishes.find((p) => p.id === data.parishId)?.name ?? "";
  }, [parishes, data.parishId, data.parishOther]);

  const saturdayCohortLabel = useMemo(
    () =>
      saturdayCohorts.find((c) => c.id === data.saturdayCohortId)?.label ?? "",
    [saturdayCohorts, data.saturdayCohortId],
  );

  useEffect(() => {
    let cancelled = false;
    void isAddressLookupReady().then((ready) => {
      if (!cancelled) setAddressLookupReady(ready);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function goNext() {
    if (step.id === "address" && addressLookupReady === null) return;
    const nextErrors = validateStep(step.id as EnrolStepId, data, {
      addressLookupReady: addressLookupReady !== false,
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toastError(
        "Complete the highlighted fields",
        "Almost there",
      );
      focusEnrolError(nextErrors);
      return;
    }

    if (step.id === "declaration") {
      setSubmitError("");
      setSubmitting(true);
      try {
        const result = await submitEnrolment(data);
        if (!result.ok) {
          if (result.code === "already_enrolled") {
            setAlreadyEnrolled({
              email: result.email || data.email.trim().toLowerCase(),
              firstName: result.firstName || data.firstName.trim() || undefined,
            });
            toastError(
              "This email already has an application on file.",
              "Already enrolled",
            );
            return;
          }
          setSubmitError(result.message);
          toastError(result.message, "Enrolment not saved");
          return;
        }
        success(
          result.emailSent
            ? `Reference ${result.reference.display}. Confirmation email sent — your temporary password is also on the next screen.`
            : `Reference ${result.reference.display}. Save your temporary password on the next screen — the confirmation email could not be delivered just now.`,
          "Application received",
        );
        setSubmission({
          reference: result.reference,
          temporaryPassword: result.temporaryPassword,
          emailSubject: result.emailSubject,
          emailSent: result.emailSent,
        });
      } catch (error) {
        console.error("[enrol-wizard] submit failed", error);
        const message = publicActionMessage(
          error,
          "Could not submit your application. Please try again.",
        );
        setSubmitError(message);
        toastError(message, "Enrolment not saved");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setStepIndex((value) => Math.min(value + 1, ENROL_STEPS.length - 1));
    setErrors({});
  }

  function goBack() {
    setStepIndex((value) => Math.max(value - 1, 0));
    setErrors({});
  }

  if (alreadyEnrolled) {
    return (
      <EnrolAlreadyApplied
        email={alreadyEnrolled.email}
        firstName={alreadyEnrolled.firstName}
        onDismiss={() => {
          setAlreadyEnrolled(null);
          setSubmitError("");
          const addressIndex = ENROL_STEPS.findIndex(
            (item) => item.id === "address",
          );
          setStepIndex(addressIndex >= 0 ? addressIndex : 0);
        }}
      />
    );
  }

  if (submission) {
    return (
      <EnrolPostSubmit
        reference={submission.reference}
        email={data.email.trim()}
        firstName={data.firstName.trim()}
        temporaryPassword={submission.temporaryPassword}
        attendanceMode={data.attendanceMode}
        emailSubject={submission.emailSubject}
        emailSent={submission.emailSent}
      />
    );
  }

  return (
    <div className="relative border border-stone bg-mist" aria-busy={submitting}>
      <DeskLoaderOverlay
        active={submitting}
        label="Submitting your application…"
      />
      <div className="border-b border-stone px-5 py-6 sm:px-8 sm:py-7">
        <StepProgress currentIndex={stepIndex} />
        <h2
          key={`${step.id}-title`}
          className="mt-6 animate-fade-rise font-display text-[clamp(1.6rem,3vw,2.15rem)] tracking-[-0.02em] text-pine"
        >
          {step.title}
        </h2>
      </div>

      <div
        key={step.id}
        className="animate-fade-rise space-y-7 px-5 py-8 sm:px-8 sm:py-10"
      >
        {step.id === "program" ? (
          <div id={enrolFieldDomId("attendanceMode")} tabIndex={-1}>
            <FieldLabel required hint="Select the course track that fits you.">
              Attendance Mode
            </FieldLabel>
            <ChoiceCards
              name="attendanceMode"
              value={data.attendanceMode}
              onChange={(value) =>
                updateField(setData, "attendanceMode", value)
              }
              options={ATTENDANCE_MODES.map((mode) => ({
                value: mode.value,
                label: mode.label,
                hint: mode.hint,
              }))}
              error={errors.attendanceMode}
            />
          </div>
        ) : null}

        {step.id === "identity" ? (
          <>
            <div>
              <FieldLabel htmlFor={enrolFieldDomId("firstName")} required>
                First Name
              </FieldLabel>
              <TextInput
                id={enrolFieldDomId("firstName")}
                value={data.firstName}
                onChange={(value) => updateField(setData, "firstName", value)}
                autoComplete="given-name"
                error={errors.firstName}
              />
            </div>
            <div>
              <FieldLabel htmlFor={enrolFieldDomId("middleName")}>
                Middle Name
              </FieldLabel>
              <TextInput
                id={enrolFieldDomId("middleName")}
                value={data.middleName}
                onChange={(value) => updateField(setData, "middleName", value)}
                autoComplete="additional-name"
              />
            </div>
            <div>
              <FieldLabel htmlFor={enrolFieldDomId("lastName")} required>
                Last Name
              </FieldLabel>
              <TextInput
                id={enrolFieldDomId("lastName")}
                value={data.lastName}
                onChange={(value) => updateField(setData, "lastName", value)}
                autoComplete="family-name"
                error={errors.lastName}
              />
            </div>
            <div id={enrolFieldDomId("gender")} tabIndex={-1}>
              <FieldLabel required>Gender</FieldLabel>
              <ChoiceCards
                name="gender"
                value={data.gender}
                onChange={(value) => updateField(setData, "gender", value)}
                options={GENDERS.map((g) => ({
                  value: g.value,
                  label: g.label,
                }))}
                error={errors.gender}
              />
            </div>
          </>
        ) : null}

        {step.id === "address" ? (
          <>
            {addressLookupReady === null ? (
              <p className="text-sm text-ink/50">Loading address…</p>
            ) : addressLookupReady ? (
              <>
                <AddressSearchField
                  placeId={data.addressPlaceId}
                  formatted={{
                    line1: data.addressLine1,
                    line2: data.addressLine2,
                    townCity: data.townCity,
                    county: data.county,
                    postcode: data.postcode,
                    country: data.country,
                  }}
                  houseNumber={data.houseNumber}
                  onHouseNumberChange={(value) =>
                    updateField(setData, "houseNumber", value)
                  }
                  onConfirm={(address) => {
                    setData((current) => ({
                      ...current,
                      addressLine1: address.line1,
                      addressLine2: address.line2,
                      townCity: address.townCity,
                      county: address.county,
                      postcode: address.postcode,
                      country: address.country,
                      addressPlaceId: address.placeId,
                    }));
                  }}
                  onClear={() => {
                    setData((current) => ({
                      ...current,
                      addressLine1: "",
                      addressLine2: "",
                      townCity: "",
                      county: "",
                      postcode: "",
                      country: "",
                      addressPlaceId: "",
                      houseNumber: "",
                    }));
                  }}
                  error={errors.addressPlaceId}
                />
                {data.addressPlaceId ? (
                  <div>
                    <FieldLabel
                      htmlFor={enrolFieldDomId("addressLine2")}
                      hint="Optional — flat, unit, or building name if needed."
                    >
                      Second line of address
                    </FieldLabel>
                    <TextInput
                      id={enrolFieldDomId("addressLine2")}
                      value={data.addressLine2}
                      onChange={(value) =>
                        updateField(setData, "addressLine2", value)
                      }
                      autoComplete="address-line2"
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="space-y-7">
                <p className="text-sm text-ink/60">
                  Address search is temporarily unavailable. Enter your address
                  below.
                </p>
                <div>
                  <FieldLabel htmlFor={enrolFieldDomId("houseNumber")}>
                    House / flat number
                  </FieldLabel>
                  <TextInput
                    id={enrolFieldDomId("houseNumber")}
                    value={data.houseNumber}
                    onChange={(value) =>
                      updateField(setData, "houseNumber", value)
                    }
                    autoComplete="address-line1"
                    placeholder="e.g. 12 or Flat 3"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={enrolFieldDomId("addressLine1")} required>
                    First line of address
                  </FieldLabel>
                  <TextInput
                    id={enrolFieldDomId("addressLine1")}
                    value={data.addressLine1}
                    onChange={(value) =>
                      updateField(setData, "addressLine1", value)
                    }
                    autoComplete="address-line1"
                    error={errors.addressLine1}
                  />
                </div>
                <div>
                  <FieldLabel
                    htmlFor={enrolFieldDomId("addressLine2")}
                    hint="Optional — flat, unit, or building name."
                  >
                    Second line of address
                  </FieldLabel>
                  <TextInput
                    id={enrolFieldDomId("addressLine2")}
                    value={data.addressLine2}
                    onChange={(value) =>
                      updateField(setData, "addressLine2", value)
                    }
                    autoComplete="address-line2"
                  />
                </div>
                <div className="grid gap-7 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor={enrolFieldDomId("townCity")} required>
                      Town or city
                    </FieldLabel>
                    <TextInput
                      id={enrolFieldDomId("townCity")}
                      value={data.townCity}
                      onChange={(value) =>
                        updateField(setData, "townCity", value)
                      }
                      autoComplete="address-level2"
                      error={errors.townCity}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor={enrolFieldDomId("county")}>
                      County
                    </FieldLabel>
                    <TextInput
                      id={enrolFieldDomId("county")}
                      value={data.county}
                      onChange={(value) =>
                        updateField(setData, "county", value)
                      }
                      autoComplete="address-level1"
                    />
                  </div>
                </div>
                <div className="grid gap-7 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor={enrolFieldDomId("postcode")} required>
                      Postcode
                    </FieldLabel>
                    <TextInput
                      id={enrolFieldDomId("postcode")}
                      value={data.postcode}
                      onChange={(value) =>
                        updateField(setData, "postcode", value)
                      }
                      autoComplete="postal-code"
                      error={errors.postcode}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor={enrolFieldDomId("country")} required>
                      Country
                    </FieldLabel>
                    <SelectInput
                      id={enrolFieldDomId("country")}
                      value={data.country}
                      onChange={(value) =>
                        updateField(setData, "country", value)
                      }
                      options={COUNTRIES}
                      placeholder="Select country"
                      searchable
                      searchPlaceholder="Search country…"
                      error={errors.country}
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="grid gap-7 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor={enrolFieldDomId("mobileNumber")} required>
                  Mobile Number
                </FieldLabel>
                <TextInput
                  id={enrolFieldDomId("mobileNumber")}
                  value={data.mobileNumber}
                  onChange={(value) =>
                    updateField(setData, "mobileNumber", value)
                  }
                  inputMode="tel"
                  autoComplete="tel"
                  error={errors.mobileNumber}
                />
              </div>
              <div>
                <FieldLabel htmlFor={enrolFieldDomId("homeTelephone")}>
                  Home Telephone Number
                </FieldLabel>
                <TextInput
                  id={enrolFieldDomId("homeTelephone")}
                  value={data.homeTelephone}
                  onChange={(value) =>
                    updateField(setData, "homeTelephone", value)
                  }
                  inputMode="tel"
                  autoComplete="tel-national"
                  error={errors.homeTelephone}
                />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor={enrolFieldDomId("email")} required>
                Email Address
              </FieldLabel>
              <TextInput
                id={enrolFieldDomId("email")}
                type="email"
                value={data.email}
                onChange={(value) => updateField(setData, "email", value)}
                autoComplete="email"
                error={errors.email}
              />
            </div>
          </>
        ) : null}

        {step.id === "personal" ? (
          <>
            <div>
              <FieldLabel
                htmlFor={enrolFieldDomId("nationality")}
                required
                hint="Your country — this can differ from where you live now."
              >
                Country
              </FieldLabel>
              <SelectInput
                id={enrolFieldDomId("nationality")}
                value={data.nationality}
                onChange={(value) => updateField(setData, "nationality", value)}
                options={COUNTRIES}
                placeholder="Select country"
                searchable
                searchPlaceholder="Search country…"
                error={errors.nationality}
              />
            </div>
            <div>
              <FieldLabel
                htmlFor={enrolFieldDomId("dateOfBirth")}
                required
                hint="Tap the field to open the calendar."
              >
                Date of Birth
              </FieldLabel>
              <DateField
                id={enrolFieldDomId("dateOfBirth")}
                value={data.dateOfBirth}
                onChange={(value) => updateField(setData, "dateOfBirth", value)}
                error={errors.dateOfBirth}
              />
            </div>
            <div id={enrolFieldDomId("maritalStatus")} tabIndex={-1}>
              <FieldLabel required>Marital Status</FieldLabel>
              <ChipGroup
                options={MARITAL_STATUSES}
                value={data.maritalStatus}
                onChange={(value) =>
                  updateField(setData, "maritalStatus", value as string)
                }
                error={errors.maritalStatus}
              />
            </div>
          </>
        ) : null}

        {step.id === "faith" ? (
          <>
            <div id={enrolFieldDomId("bornAgain")} tabIndex={-1}>
              <FieldLabel
                required
                hint="To be born again is to have a life transformed by a willful submission to, and an acceptance of the Lordship of Jesus Christ."
              >
                Have you been born again?
              </FieldLabel>
              <ChipGroup
                options={["Yes", "No"]}
                value={data.bornAgain}
                onChange={(value) =>
                  updateField(setData, "bornAgain", value as string)
                }
                error={errors.bornAgain}
              />
            </div>
            <Reveal show={data.bornAgain === "Yes"}>
              <div>
                <FieldLabel
                  htmlFor={enrolFieldDomId("bornAgainDate")}
                  hint="Optional if you remember"
                >
                  Date of being born again
                </FieldLabel>
                <DateField
                  id={enrolFieldDomId("bornAgainDate")}
                  value={data.bornAgainDate}
                  onChange={(value) =>
                    updateField(setData, "bornAgainDate", value)
                  }
                  error={errors.bornAgainDate}
                />
              </div>
              <div>
                <FieldLabel
                  htmlFor={enrolFieldDomId("bornAgainWhere")}
                  hint="Optional if you remember"
                >
                  Where were you born again?
                </FieldLabel>
                <TextInput
                  id={enrolFieldDomId("bornAgainWhere")}
                  value={data.bornAgainWhere}
                  onChange={(value) =>
                    updateField(setData, "bornAgainWhere", value)
                  }
                />
              </div>
            </Reveal>

            <div id={enrolFieldDomId("baptisedHolySpirit")} tabIndex={-1}>
              <FieldLabel required>
                Have you been baptised in the Holy Spirit?
              </FieldLabel>
              <ChipGroup
                options={["Yes", "No"]}
                value={data.baptisedHolySpirit}
                onChange={(value) =>
                  updateField(setData, "baptisedHolySpirit", value as string)
                }
                error={errors.baptisedHolySpirit}
              />
            </div>
            <Reveal show={data.baptisedHolySpirit === "Yes"}>
              <div>
                <FieldLabel
                  htmlFor={enrolFieldDomId("holySpiritDate")}
                  hint="Optional if you remember"
                >
                  Date of baptism in the Holy Spirit
                </FieldLabel>
                <DateField
                  id={enrolFieldDomId("holySpiritDate")}
                  value={data.holySpiritDate}
                  onChange={(value) =>
                    updateField(setData, "holySpiritDate", value)
                  }
                  error={errors.holySpiritDate}
                />
              </div>
              <div>
                <FieldLabel
                  htmlFor={enrolFieldDomId("holySpiritWhere")}
                  hint="Optional if you remember"
                >
                  Where were you baptised in the Holy Spirit?
                </FieldLabel>
                <TextInput
                  id={enrolFieldDomId("holySpiritWhere")}
                  value={data.holySpiritWhere}
                  onChange={(value) =>
                    updateField(setData, "holySpiritWhere", value)
                  }
                />
              </div>
            </Reveal>
          </>
        ) : null}

        {step.id === "life" ? (
          <>
            <div>
              <FieldLabel
                htmlFor={enrolFieldDomId("biblicalCourses")}
                hint="Optional — list any biblical or theological courses you have attended."
              >
                Biblical / theological courses attended
              </FieldLabel>
              <TextArea
                id={enrolFieldDomId("biblicalCourses")}
                value={data.biblicalCourses}
                onChange={(value) =>
                  updateField(setData, "biblicalCourses", value)
                }
                rows={3}
              />
            </div>
            <div id={enrolFieldDomId("occupations")} tabIndex={-1}>
              <FieldLabel
                required
                hint="You can select more than one option."
              >
                What is your present occupation?
              </FieldLabel>
              <ChipGroup
                multiple
                options={OCCUPATIONS}
                value={data.occupations}
                onChange={(value) =>
                  updateField(setData, "occupations", value as string[])
                }
                error={errors.occupations}
              />
            </div>
            <Reveal show={data.occupations.includes("Other")}>
              <div>
                <FieldLabel htmlFor={enrolFieldDomId("occupationOther")} required>
                  Please describe
                </FieldLabel>
                <TextInput
                  id={enrolFieldDomId("occupationOther")}
                  value={data.occupationOther}
                  onChange={(value) =>
                    updateField(setData, "occupationOther", value)
                  }
                  error={errors.occupationOther}
                />
              </div>
            </Reveal>
            <div>
              <FieldLabel
                htmlFor={enrolFieldDomId("parishId")}
                required
                hint="Choose the parish or ministry running your School of Disciples course, or add yours if it is not listed."
              >
                Parish / Ministry
              </FieldLabel>
              <SelectInput
                id={enrolFieldDomId("parishId")}
                value={data.parishId}
                onChange={(value) => {
                  setData((prev) => ({
                    ...prev,
                    parishId: value,
                    parishOther: isEnrolParishOther(value)
                      ? prev.parishOther
                      : "",
                  }));
                }}
                placeholder={
                  parishes.length === 0
                    ? "No listed parishes yet — add yours below"
                    : "Select parish / ministry"
                }
                options={(() => {
                  const listed = parishes.map((p) => ({
                    value: p.id,
                    label: p.region ? `${p.name} — ${p.region}` : p.name,
                  }));
                  const other = {
                    value: ENROL_PARISH_OTHER_VALUE,
                    label: "My parish, ministry or church isn’t listed",
                  };
                  // Keep “other” 2nd (not last): first listed parish, then other, then the rest.
                  if (listed.length === 0) return [other];
                  return [listed[0], other, ...listed.slice(1)];
                })()}
                error={errors.parishId}
              />
            </div>
            <Reveal show={isEnrolParishOther(data.parishId)}>
              <div>
                <FieldLabel
                  htmlFor={enrolFieldDomId("parishOther")}
                  required
                  hint="We will place you once the national desk confirms your parish or ministry."
                >
                  Parish, ministry or church name
                </FieldLabel>
                <TextInput
                  id={enrolFieldDomId("parishOther")}
                  value={data.parishOther}
                  onChange={(value) =>
                    updateField(setData, "parishOther", value)
                  }
                  placeholder="e.g. Redeemed Christian Church — Manchester"
                  error={errors.parishOther}
                />
              </div>
            </Reveal>
            <div>
              <FieldLabel
                required
                hint={SATURDAY_COHORT_HINT}
              >
                Your Saturday
              </FieldLabel>
              <p className="mb-3 text-sm text-ink/65">
                You have been placed on{" "}
                <span className="font-medium text-ink">
                  {intakeContext.intakeLabel}
                </span>
                .
                {saturdayForced ? (
                  <>
                    {" "}
                    Because enrolment is late in Year 1, you join the Saturday
                    class that is still available.
                  </>
                ) : (
                  <> Choose which Saturday you will attend.</>
                )}
                {intakeContext.enrolClosesLabel ? (
                  <>
                    {" "}
                    Enrolment for this intake closes on{" "}
                    {intakeContext.enrolClosesLabel}.
                  </>
                ) : null}
              </p>
              <SaturdayCohortPicker
                cohorts={saturdayCohorts}
                value={data.saturdayCohortId}
                onChange={(id) => updateField(setData, "saturdayCohortId", id)}
                error={errors.saturdayCohortId}
                forced={saturdayForced}
              />
            </div>
          </>
        ) : null}

        {step.id === "preview" ? (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-ink/65">
              Review your details before the final declaration. Use Back if
              anything needs changing.
            </p>
            <dl className="border border-stone bg-mist/40 px-4 py-2 sm:px-5">
              <ReviewRow label="Program" value={attendanceLabel} />
              <ReviewRow
                label="Name"
                value={[data.firstName, data.middleName, data.lastName]
                  .filter(Boolean)
                  .join(" ")}
              />
              <ReviewRow label="Gender" value={genderLabel} />
              <ReviewRow
                label="Address"
                value={[
                  data.houseNumber,
                  data.addressLine1,
                  data.addressLine2,
                  data.townCity,
                  data.county,
                  data.postcode,
                  data.country,
                ]
                  .filter(Boolean)
                  .join(", ")}
              />
              <ReviewRow label="Email" value={data.email} />
              <ReviewRow label="Mobile" value={data.mobileNumber} />
              <ReviewRow label="Country" value={data.nationality} />
              <ReviewRow
                label="Country of residence"
                value={data.country}
              />
              <ReviewRow label="Date of birth" value={data.dateOfBirth} />
              <ReviewRow label="Marital status" value={data.maritalStatus} />
              <ReviewRow label="Born again" value={data.bornAgain} />
              <ReviewRow
                label="Holy Spirit baptism"
                value={data.baptisedHolySpirit}
              />
              <ReviewRow
                label="Biblical courses"
                value={data.biblicalCourses}
              />
              <ReviewRow
                label="Occupation"
                value={[
                  ...data.occupations.filter((item) => item !== "Other"),
                  data.occupationOther,
                ]
                  .filter(Boolean)
                  .join(", ")}
              />
              <ReviewRow label="Parish" value={parishLabel} />
              <ReviewRow label="Intake" value={intakeContext.intakeLabel} />
              <ReviewRow label="Your Saturday" value={saturdayCohortLabel} />
            </dl>
          </div>
        ) : null}

        {step.id === "declaration" ? (
          <div className="relative overflow-hidden border border-pine/25 bg-gradient-to-br from-stone/50 via-mist to-mist">
            <div
              className="absolute inset-y-0 left-0 w-1 bg-pine"
              aria-hidden
            />
            <div className="px-5 py-7 sm:px-8 sm:py-9">
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
                Final step
              </p>
              <h3 className="mt-2 font-display text-2xl tracking-[-0.015em] text-pine">
                Applicant&apos;s Declaration
              </h3>
              <p className="mt-5 text-sm leading-relaxed text-ink/80 text-justify sm:text-[0.95rem]">
                I hereby promise, if accepted as a student, to abide by the
                rules and regulations of the School of Disciples, to obey the
                Authorities of the School and to pray for them. I also promise
                not to put a stumbling block in the way of any of my fellow
                students. I will endeavour to make at least one disciple for
                Christ during the period of my training.
              </p>
              <label
                id={enrolFieldDomId("declarationAccepted")}
                tabIndex={-1}
                className="mt-8 flex cursor-pointer items-start gap-3 border border-stone bg-mist/80 px-4 py-4 transition-colors duration-300 hover:border-pine/30"
              >
                <input
                  type="checkbox"
                  checked={data.declarationAccepted}
                  onChange={(event) =>
                    updateField(
                      setData,
                      "declarationAccepted",
                      event.target.checked,
                    )
                  }
                  className="mt-1 size-4 accent-pine"
                />
                <span className="text-sm leading-relaxed text-ink">
                  I, the applicant named on this form, agree to this
                  declaration.
                  <span className="ml-1 text-red-700" aria-hidden>
                    *
                  </span>
                </span>
              </label>
              {errors.declarationAccepted ? (
                <p className="mt-3 text-sm text-red-800" role="alert">
                  {errors.declarationAccepted}
                </p>
              ) : null}
              {submitError ? (
                <p className="mt-4 text-sm text-red-800" role="alert">
                  {submitError}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-row items-center justify-between gap-3 border-t border-stone px-5 py-5 sm:px-8">
        <button
          type="button"
          onClick={goBack}
          disabled={stepIndex === 0 || submitting}
          className="inline-flex items-center justify-center border border-pine/25 px-5 py-3 text-sm font-medium tracking-wide text-pine transition-colors duration-300 hover:border-pine hover:bg-stone/40 disabled:cursor-not-allowed disabled:opacity-35"
        >
          Back
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={submitting}
          className="inline-flex min-h-[2.75rem] min-w-[9.5rem] items-center justify-center bg-pine px-6 py-3 text-sm font-medium tracking-wide text-mist transition-colors duration-300 hover:bg-celadon disabled:opacity-60"
        >
          {step.id === "declaration" ? (
            submitting ? (
              <DeskLoader label="Submitting…" tone="mist" />
            ) : (
              "Submit application"
            )
          ) : (
            "Continue"
          )}
        </button>
      </div>
    </div>
  );
}
