"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { listOpenBatchesForEnrol } from "@/app/admin/parishes/actions";
import { submitEnrolment } from "@/app/enrol/actions";
import {
  ATTENDANCE_MODES,
  COUNTRIES,
  ENROL_STEPS,
  initialEnrolFormData,
  MARITAL_STATUSES,
  NATIONALITIES,
  OCCUPATIONS,
  validateStep,
  type EnrolFormData,
  type EnrolStepId,
} from "@/lib/enrol/schema";
import type { ApplicationReference } from "@/lib/enrol/reference";
import { formatBatchLabel } from "@/lib/parishes";
import { EnrolAlreadyApplied } from "@/components/enrol/already-enrolled";
import { EnrolPostSubmit } from "@/components/enrol/post-submit";
import {
  ChipGroup,
  ChoiceCards,
  DateField,
  FieldLabel,
  Reveal,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/enrol/fields";
import { useToast } from "@/components/ui/toast";
import { publicActionMessage } from "@/lib/safe-action-message";

type EnrolParishOption = { id: string; name: string; region: string | null };
type EnrolBatchOption = { id: string; name: string; year: number; parish_id: string };
function updateField<K extends keyof EnrolFormData>(
  setData: Dispatch<SetStateAction<EnrolFormData>>,
  key: K,
  value: EnrolFormData[K],
) {
  setData((prev) => ({ ...prev, [key]: value }));
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

      {/* Mobile: single unlabeled bar */}
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

      {/* Desktop: labeled journey track only */}
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

export function EnrolWizard({
  parishes,
}: {
  parishes: EnrolParishOption[];
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
  const [batches, setBatches] = useState<EnrolBatchOption[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);

  const step = ENROL_STEPS[stepIndex];

  const attendanceLabel = useMemo(
    () =>
      ATTENDANCE_MODES.find((mode) => mode.value === data.attendanceMode)
        ?.label ?? "",
    [data.attendanceMode],
  );

  const parishLabel = useMemo(
    () => parishes.find((p) => p.id === data.parishId)?.name ?? "",
    [parishes, data.parishId],
  );

  const batchLabel = useMemo(() => {
    const batch = batches.find((b) => b.id === data.batchId);
    return batch ? formatBatchLabel(batch) : "";
  }, [batches, data.batchId]);

  useEffect(() => {
    let cancelled = false;
    if (!data.parishId) {
      setBatches([]);
      return;
    }
    setBatchesLoading(true);
    void listOpenBatchesForEnrol(data.parishId).then((rows) => {
      if (cancelled) return;
      setBatches(rows);
      setBatchesLoading(false);
      setData((prev) => {
        if (prev.batchId && rows.some((r) => r.id === prev.batchId)) {
          return prev;
        }
        return { ...prev, batchId: "" };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [data.parishId]);

  async function goNext() {
    const nextErrors = validateStep(step.id as EnrolStepId, data);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

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
    <div className="border border-stone bg-mist">
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
          <div>
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
              <FieldLabel htmlFor="firstName" required>
                First Name
              </FieldLabel>
              <TextInput
                id="firstName"
                value={data.firstName}
                onChange={(value) => updateField(setData, "firstName", value)}
                autoComplete="given-name"
                error={errors.firstName}
              />
            </div>
            <div>
              <FieldLabel htmlFor="middleName">Middle Name</FieldLabel>
              <TextInput
                id="middleName"
                value={data.middleName}
                onChange={(value) => updateField(setData, "middleName", value)}
                autoComplete="additional-name"
              />
            </div>
            <div>
              <FieldLabel htmlFor="lastName" required>
                Last Name
              </FieldLabel>
              <TextInput
                id="lastName"
                value={data.lastName}
                onChange={(value) => updateField(setData, "lastName", value)}
                autoComplete="family-name"
                error={errors.lastName}
              />
            </div>
          </>
        ) : null}

        {step.id === "address" ? (
          <>
            <div>
              <FieldLabel htmlFor="addressLine1" required>
                First Line of Address
              </FieldLabel>
              <TextInput
                id="addressLine1"
                value={data.addressLine1}
                onChange={(value) =>
                  updateField(setData, "addressLine1", value)
                }
                autoComplete="address-line1"
                error={errors.addressLine1}
              />
            </div>
            <div>
              <FieldLabel htmlFor="addressLine2">
                Second Line of Address
              </FieldLabel>
              <TextInput
                id="addressLine2"
                value={data.addressLine2}
                onChange={(value) =>
                  updateField(setData, "addressLine2", value)
                }
                autoComplete="address-line2"
              />
            </div>
            <div className="grid gap-7 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="townCity" required>
                  Town/City
                </FieldLabel>
                <TextInput
                  id="townCity"
                  value={data.townCity}
                  onChange={(value) => updateField(setData, "townCity", value)}
                  autoComplete="address-level2"
                  error={errors.townCity}
                />
              </div>
              <div>
                <FieldLabel htmlFor="county">County</FieldLabel>
                <TextInput
                  id="county"
                  value={data.county}
                  onChange={(value) => updateField(setData, "county", value)}
                  autoComplete="address-level1"
                />
              </div>
            </div>
            <div className="grid gap-7 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="postcode" required>
                  Postcode
                </FieldLabel>
                <TextInput
                  id="postcode"
                  value={data.postcode}
                  onChange={(value) => updateField(setData, "postcode", value)}
                  autoComplete="postal-code"
                  error={errors.postcode}
                />
              </div>
              <div>
                <FieldLabel htmlFor="country" required>
                  Country of residence
                </FieldLabel>
                <SelectInput
                  id="country"
                  value={data.country}
                  onChange={(value) => updateField(setData, "country", value)}
                  options={COUNTRIES}
                  placeholder="Select country"
                  error={errors.country}
                />
              </div>
            </div>
            <div className="grid gap-7 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="mobileNumber" required>
                  Mobile Number
                </FieldLabel>
                <TextInput
                  id="mobileNumber"
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
                <FieldLabel htmlFor="homeTelephone">
                  Home Telephone Number
                </FieldLabel>
                <TextInput
                  id="homeTelephone"
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
              <FieldLabel htmlFor="email" required>
                Email Address
              </FieldLabel>
              <TextInput
                id="email"
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
                htmlFor="nationality"
                required
                hint="Your nationality / citizenship — this is different from country of residence."
              >
                Nationality
              </FieldLabel>
              <SelectInput
                id="nationality"
                value={data.nationality}
                onChange={(value) => updateField(setData, "nationality", value)}
                options={NATIONALITIES}
                placeholder="Select nationality"
                error={errors.nationality}
              />
            </div>
            <div>
              <FieldLabel
                htmlFor="dateOfBirth"
                required
                hint="Tap the field to open the calendar."
              >
                Date of Birth
              </FieldLabel>
              <DateField
                id="dateOfBirth"
                value={data.dateOfBirth}
                onChange={(value) => updateField(setData, "dateOfBirth", value)}
                error={errors.dateOfBirth}
              />
            </div>
            <div>
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
            <div>
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
                  htmlFor="bornAgainDate"
                  hint="Enter an approximate date if you can't remember the exact date."
                >
                  Date of being born again
                </FieldLabel>
                <DateField
                  id="bornAgainDate"
                  value={data.bornAgainDate}
                  onChange={(value) =>
                    updateField(setData, "bornAgainDate", value)
                  }
                />
              </div>
              <div>
                <FieldLabel
                  htmlFor="bornAgainWhere"
                  hint="Location or church name / address / town / city."
                >
                  Where were you born again?
                </FieldLabel>
                <TextInput
                  id="bornAgainWhere"
                  value={data.bornAgainWhere}
                  onChange={(value) =>
                    updateField(setData, "bornAgainWhere", value)
                  }
                />
              </div>
            </Reveal>

            <div>
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
                  htmlFor="holySpiritDate"
                  hint="Enter an approximate date if you can't remember the exact date."
                >
                  Date of baptism in the Holy Spirit
                </FieldLabel>
                <DateField
                  id="holySpiritDate"
                  value={data.holySpiritDate}
                  onChange={(value) =>
                    updateField(setData, "holySpiritDate", value)
                  }
                />
              </div>
              <div>
                <FieldLabel
                  htmlFor="holySpiritWhere"
                  hint="Location or church name / address / town / city."
                >
                  Where were you baptised in the Holy Spirit?
                </FieldLabel>
                <TextInput
                  id="holySpiritWhere"
                  value={data.holySpiritWhere}
                  onChange={(value) =>
                    updateField(setData, "holySpiritWhere", value)
                  }
                />
              </div>
            </Reveal>

            <div>
              <FieldLabel required>
                Have you been baptised in water by immersion?
              </FieldLabel>
              <ChipGroup
                options={["Yes", "No"]}
                value={data.baptisedWater}
                onChange={(value) =>
                  updateField(setData, "baptisedWater", value as string)
                }
                error={errors.baptisedWater}
              />
            </div>
            <Reveal show={data.baptisedWater === "Yes"}>
              <div>
                <FieldLabel
                  htmlFor="waterBaptismDate"
                  hint="Enter an approximate date if you can't remember the exact date."
                >
                  Date of baptism in water by immersion
                </FieldLabel>
                <DateField
                  id="waterBaptismDate"
                  value={data.waterBaptismDate}
                  onChange={(value) =>
                    updateField(setData, "waterBaptismDate", value)
                  }
                />
              </div>
              <div>
                <FieldLabel
                  htmlFor="waterBaptismWhere"
                  hint="Location or church name / address / town / city."
                >
                  Where were you baptised in water by immersion?
                </FieldLabel>
                <TextInput
                  id="waterBaptismWhere"
                  value={data.waterBaptismWhere}
                  onChange={(value) =>
                    updateField(setData, "waterBaptismWhere", value)
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
                htmlFor="schoolsAttended"
                required
                hint="Please include dates and qualifications obtained."
              >
                Schools Attended
              </FieldLabel>
              <TextArea
                id="schoolsAttended"
                value={data.schoolsAttended}
                onChange={(value) =>
                  updateField(setData, "schoolsAttended", value)
                }
                error={errors.schoolsAttended}
              />
            </div>
            <div>
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
                <FieldLabel htmlFor="occupationOther" required>
                  Please describe
                </FieldLabel>
                <TextInput
                  id="occupationOther"
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
                htmlFor="parishId"
                required
                hint="Choose the parish running your School of Disciples course."
              >
                Parish / church
              </FieldLabel>
              <SelectInput
                id="parishId"
                value={data.parishId}
                onChange={(value) => {
                  setData((prev) => ({
                    ...prev,
                    parishId: value,
                    batchId: "",
                  }));
                }}
                placeholder={
                  parishes.length === 0
                    ? "No parishes open yet"
                    : "Select parish"
                }
                options={parishes.map((p) => ({
                  value: p.id,
                  label: p.region ? `${p.name} — ${p.region}` : p.name,
                }))}
                error={errors.parishId}
              />
            </div>
            <div>
              <FieldLabel
                htmlFor="batchId"
                required
                hint="Only batches currently open for enrolment are listed."
              >
                Batch
              </FieldLabel>
              <SelectInput
                id="batchId"
                value={data.batchId}
                onChange={(value) => updateField(setData, "batchId", value)}
                placeholder={
                  !data.parishId
                    ? "Select a parish first"
                    : batchesLoading
                      ? "Loading batches…"
                      : batches.length === 0
                        ? "No open batches for this parish"
                        : "Select batch"
                }
                options={batches.map((b) => ({
                  value: b.id,
                  label: formatBatchLabel(b),
                }))}
                error={errors.batchId}
              />
            </div>
            <div>
              <FieldLabel
                htmlFor="localChurch"
                hint="Optional — assembly name or address if different from the parish."
              >
                Local assembly detail
              </FieldLabel>
              <TextArea
                id="localChurch"
                value={data.localChurch}
                onChange={(value) => updateField(setData, "localChurch", value)}
                rows={2}
                error={errors.localChurch}
              />
            </div>
            <div>
              <FieldLabel
                htmlFor="churchLeader"
                required
                hint="This should be the lead pastor, reverend etc."
              >
                Name of Your Church Leader
              </FieldLabel>
              <TextInput
                id="churchLeader"
                value={data.churchLeader}
                onChange={(value) =>
                  updateField(setData, "churchLeader", value)
                }
                error={errors.churchLeader}
              />
            </div>
            <div>
              <FieldLabel htmlFor="churchActivities">
                What activities are you involved in at your local
                church/assembly?
              </FieldLabel>
              <TextArea
                id="churchActivities"
                value={data.churchActivities}
                onChange={(value) =>
                  updateField(setData, "churchActivities", value)
                }
                rows={3}
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
              <ReviewRow
                label="Address"
                value={[
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
              <ReviewRow label="Nationality" value={data.nationality} />
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
              <ReviewRow label="Water baptism" value={data.baptisedWater} />
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
              <ReviewRow label="Batch" value={batchLabel} />
              <ReviewRow label="Assembly detail" value={data.localChurch} />
              <ReviewRow label="Church leader" value={data.churchLeader} />
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
              <label className="mt-8 flex cursor-pointer items-start gap-3 border border-stone bg-mist/80 px-4 py-4 transition-colors duration-300 hover:border-pine/30">
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
          className="inline-flex items-center justify-center bg-pine px-6 py-3 text-sm font-medium tracking-wide text-mist transition-colors duration-300 hover:bg-celadon disabled:opacity-60"
        >
          {step.id === "declaration"
            ? submitting
              ? "Submitting…"
              : "Submit application"
            : "Continue"}
        </button>
      </div>
    </div>
  );
}

