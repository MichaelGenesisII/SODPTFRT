export const ATTENDANCE_MODES = [
  {
    value: "standard",
    label: "Standard Program",
    hint: "10 months · one Saturday class each month",
  },
  {
    value: "ignite",
    label: "SOD Ignite",
    hint: "Young adults 17–22 years old",
  },
] as const;

export const GENDERS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

export const MARITAL_STATUSES = [
  "Single",
  "Engaged",
  "Married",
  "Separated",
  "Divorced",
  "Widowed",
  "Other",
] as const;

export const OCCUPATIONS = [
  "Student",
  "Employed",
  "Unemployed",
  "Business Owner",
  "Other",
] as const;

/** Residence / address country — distinct from nationality. */
export const COUNTRIES = [
  "United Kingdom",
  "Ireland",
  "United States",
  "Canada",
  "Nigeria",
  "Ghana",
  "South Africa",
  "Kenya",
  "Uganda",
  "Zimbabwe",
  "Cameroon",
  "Australia",
  "New Zealand",
  "Germany",
  "France",
  "Netherlands",
  "Belgium",
  "Spain",
  "Italy",
  "Portugal",
  "Poland",
  "Sweden",
  "Norway",
  "Denmark",
  "Finland",
  "Switzerland",
  "Austria",
  "India",
  "Pakistan",
  "Bangladesh",
  "Philippines",
  "Jamaica",
  "Trinidad and Tobago",
  "Barbados",
  "Brazil",
  "Other",
] as const;

/**
 * Citizenship / nationality options.
 * Kept separate from COUNTRIES so residence and nationality can differ.
 */
export const NATIONALITIES = [
  "British",
  "Irish",
  "American",
  "Canadian",
  "Nigerian",
  "Ghanaian",
  "South African",
  "Kenyan",
  "Ugandan",
  "Zimbabwean",
  "Cameroonian",
  "Australian",
  "New Zealander",
  "German",
  "French",
  "Dutch",
  "Belgian",
  "Spanish",
  "Italian",
  "Portuguese",
  "Polish",
  "Swedish",
  "Norwegian",
  "Danish",
  "Finnish",
  "Swiss",
  "Austrian",
  "Indian",
  "Pakistani",
  "Bangladeshi",
  "Filipino",
  "Jamaican",
  "Trinidadian",
  "Barbadian",
  "Brazilian",
  "Other",
] as const;

export const ENROL_STEPS = [
  { id: "program", label: "Program", title: "Choose your path" },
  { id: "identity", label: "Identity", title: "Who you are" },
  { id: "address", label: "Address", title: "Where you live" },
  { id: "personal", label: "Personal", title: "About you" },
  { id: "faith", label: "Faith", title: "Your walk with Christ" },
  { id: "life", label: "Life", title: "Course, parish & Saturday" },
  { id: "preview", label: "Preview", title: "Preview & confirm" },
  {
    id: "declaration",
    label: "Declare",
    title: "Applicant's declaration",
  },
] as const;

export type EnrolStepId = (typeof ENROL_STEPS)[number]["id"];

export type EnrolFormData = {
  attendanceMode: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  addressLine1: string;
  addressLine2: string;
  townCity: string;
  county: string;
  postcode: string;
  /** Country of residence (address) — not nationality */
  country: string;
  /** Place id from address search when lookup is configured */
  addressPlaceId: string;
  /** House / flat number collected after postcode search */
  houseNumber: string;
  mobileNumber: string;
  homeTelephone: string;
  email: string;
  /** Citizenship / nationality — distinct from country of residence */
  nationality: string;
  dateOfBirth: string;
  maritalStatus: string;
  bornAgain: string;
  bornAgainDate: string;
  bornAgainWhere: string;
  baptisedHolySpirit: string;
  holySpiritDate: string;
  holySpiritWhere: string;
  /** @deprecated Removed from UI; kept for legacy preview/submit defaults */
  baptisedWater: string;
  waterBaptismDate: string;
  waterBaptismWhere: string;
  /** Biblical / theological courses attended (minimal) */
  biblicalCourses: string;
  occupations: string[];
  occupationOther: string;
  /**
   * Organisational parish id, or `ENROL_PARISH_OTHER_VALUE` when the visitor
   * types a parish/church that is not in the list.
   */
  parishId: string;
  /** Free-text parish/church when `parishId` is the other sentinel. */
  parishOther: string;
  /** Saturday cohort (1st–4th Saturday) for the active programme year. */
  saturdayCohortId: string;
  declarationAccepted: boolean;
};

/** Sentinel parish select value — stores free-text in `parishOther` / `local_church`. */
export const ENROL_PARISH_OTHER_VALUE = "__other__";

export function isEnrolParishOther(parishId: string): boolean {
  return parishId.trim() === ENROL_PARISH_OTHER_VALUE;
}

export const initialEnrolFormData: EnrolFormData = {
  attendanceMode: "",
  firstName: "",
  middleName: "",
  lastName: "",
  gender: "",
  addressLine1: "",
  addressLine2: "",
  townCity: "",
  county: "",
  postcode: "",
  country: "",
  addressPlaceId: "",
  houseNumber: "",
  mobileNumber: "",
  homeTelephone: "",
  email: "",
  nationality: "",
  dateOfBirth: "",
  maritalStatus: "",
  bornAgain: "",
  bornAgainDate: "",
  bornAgainWhere: "",
  baptisedHolySpirit: "",
  holySpiritDate: "",
  holySpiritWhere: "",
  baptisedWater: "",
  waterBaptismDate: "",
  waterBaptismWhere: "",
  biblicalCourses: "",
  occupations: [],
  occupationOther: "",
  parishId: "",
  parishOther: "",
  saturdayCohortId: "",
  declarationAccepted: false,
};

export type ValidateStepContext = {
  /** When false, place search is down — require typed address lines instead. */
  addressLookupReady?: boolean;
};

function validateAddressLines(
  data: EnrolFormData,
  errors: Partial<Record<keyof EnrolFormData, string>>,
) {
  if (!data.addressLine1.trim())
    errors.addressLine1 = "First line of address is required.";
  if (!data.townCity.trim()) errors.townCity = "Town or city is required.";
  if (!data.postcode.trim()) errors.postcode = "Postcode is required.";
  if (!data.country) errors.country = "Country is required.";
  else if (!(COUNTRIES as readonly string[]).includes(data.country))
    errors.country = "Please choose a valid country.";
}

function rejectFutureDate(
  value: string,
  field: keyof EnrolFormData,
  errors: Partial<Record<keyof EnrolFormData, string>>,
) {
  const trimmed = value.trim();
  if (!trimmed) return;
  const date = new Date(`${trimmed}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) {
    errors[field] = "Enter a valid date.";
  } else if (date > today) {
    errors[field] = "Date cannot be in the future.";
  }
}

/** DOM id for autofocus when a field fails validation. */
export function enrolFieldDomId(field: keyof EnrolFormData): string {
  return `enrol-${field}`;
}

export function validateStep(
  stepId: EnrolStepId,
  data: EnrolFormData,
  context: ValidateStepContext = {},
): Partial<Record<keyof EnrolFormData, string>> {
  const errors: Partial<Record<keyof EnrolFormData, string>> = {};
  const addressLookupReady = context.addressLookupReady ?? true;

  if (stepId === "program") {
    if (!data.attendanceMode) {
      errors.attendanceMode = "Please choose a program.";
    } else if (
      !ATTENDANCE_MODES.some((mode) => mode.value === data.attendanceMode)
    ) {
      errors.attendanceMode = "Please choose a valid program.";
    }
  }

  if (stepId === "identity") {
    if (!data.firstName.trim()) errors.firstName = "First name is required.";
    if (!data.lastName.trim()) errors.lastName = "Last name is required.";
    if (!data.gender) errors.gender = "Please select your gender.";
    else if (!GENDERS.some((g) => g.value === data.gender))
      errors.gender = "Please choose a valid option.";
  }

  if (stepId === "address") {
    if (addressLookupReady) {
      if (!data.addressPlaceId.trim()) {
        errors.addressPlaceId =
          "Search by postcode or street, then choose your address.";
      } else if (
        !data.addressLine1.trim() ||
        !data.townCity.trim() ||
        !data.postcode.trim() ||
        !data.country
      ) {
        errors.addressPlaceId =
          "That address could not be confirmed. Search again and pick from the list.";
      } else if (!(COUNTRIES as readonly string[]).includes(data.country)) {
        errors.addressPlaceId =
          "That address is outside supported countries. Contact the school if you need help.";
      }
    } else {
      validateAddressLines(data, errors);
    }
    if (!data.mobileNumber.trim())
      errors.mobileNumber = "Mobile number is required.";
    else if (!/^\+?[\d\s()-]{7,20}$/.test(data.mobileNumber.trim()))
      errors.mobileNumber = "Enter a valid phone number.";
    if (
      data.homeTelephone.trim() &&
      !/^\+?[\d\s()-]{7,20}$/.test(data.homeTelephone.trim())
    )
      errors.homeTelephone = "Enter a valid phone number.";
    if (!data.email.trim()) errors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()))
      errors.email = "Enter a valid email address.";
  }

  if (stepId === "personal") {
    if (!data.nationality) errors.nationality = "Country is required.";
    else if (!(COUNTRIES as readonly string[]).includes(data.nationality))
      errors.nationality = "Please choose a valid country.";
    if (!data.dateOfBirth) errors.dateOfBirth = "Date of birth is required.";
    else {
      const dob = new Date(`${data.dateOfBirth}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isNaN(dob.getTime())) {
        errors.dateOfBirth = "Enter a valid date of birth.";
      } else if (dob > today) {
        errors.dateOfBirth = "Date of birth cannot be in the future.";
      } else {
        const ageYears =
          (today.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (ageYears < 13) {
          errors.dateOfBirth = "Applicants must be at least 13 years old.";
        } else if (ageYears > 100) {
          errors.dateOfBirth = "Please check the date of birth.";
        } else if (data.attendanceMode === "ignite") {
          if (ageYears < 17 || ageYears > 22) {
            errors.dateOfBirth =
              "SOD Ignite is for young adults aged 17–22. Choose Standard, or check the date of birth.";
          }
        }
      }
    }
    if (!data.maritalStatus)
      errors.maritalStatus = "Marital status is required.";
    else if (
      !(MARITAL_STATUSES as readonly string[]).includes(data.maritalStatus)
    )
      errors.maritalStatus = "Please choose a valid marital status.";
  }

  if (stepId === "faith") {
    const yesNo = new Set(["Yes", "No"]);
    if (!data.bornAgain) errors.bornAgain = "Please answer this question.";
    else if (!yesNo.has(data.bornAgain))
      errors.bornAgain = "Please answer Yes or No.";
    else if (data.bornAgain === "Yes") {
      rejectFutureDate(data.bornAgainDate, "bornAgainDate", errors);
    }
    if (!data.baptisedHolySpirit)
      errors.baptisedHolySpirit = "Please answer this question.";
    else if (!yesNo.has(data.baptisedHolySpirit))
      errors.baptisedHolySpirit = "Please answer Yes or No.";
    else if (data.baptisedHolySpirit === "Yes") {
      rejectFutureDate(data.holySpiritDate, "holySpiritDate", errors);
    }
  }

  if (stepId === "preview") {
    for (const prior of ENROL_STEPS) {
      if (prior.id === "preview" || prior.id === "declaration") continue;
      Object.assign(
        errors,
        validateStep(prior.id as EnrolStepId, data, context),
      );
    }
  }

  if (stepId === "life") {
    if (data.occupations.length === 0)
      errors.occupations = "Select at least one occupation.";
    else if (
      data.occupations.some(
        (item) => !(OCCUPATIONS as readonly string[]).includes(item),
      )
    )
      errors.occupations = "Please choose valid occupations.";
    if (data.occupations.includes("Other") && !data.occupationOther.trim())
      errors.occupationOther = "Please describe your occupation.";
    if (!data.parishId) {
      errors.parishId = "Please select your parish, or add it manually.";
    } else if (isEnrolParishOther(data.parishId)) {
      if (!data.parishOther.trim()) {
        errors.parishOther = "Please enter your parish or church name.";
      }
    }
    if (!data.saturdayCohortId.trim()) {
      errors.saturdayCohortId =
        "Please choose which Saturday cohort you will attend.";
    }
  }

  if (stepId === "declaration") {
    if (!data.declarationAccepted)
      errors.declarationAccepted = "You must agree to the declaration.";
  }

  return errors;
}

export function firstEnrolErrorField(
  errors: Partial<Record<keyof EnrolFormData, string>>,
): keyof EnrolFormData | null {
  const order: (keyof EnrolFormData)[] = [
    "attendanceMode",
    "firstName",
    "lastName",
    "gender",
    "addressPlaceId",
    "houseNumber",
    "addressLine1",
    "townCity",
    "postcode",
    "country",
    "mobileNumber",
    "homeTelephone",
    "email",
    "nationality",
    "dateOfBirth",
    "maritalStatus",
    "bornAgain",
    "bornAgainDate",
    "bornAgainWhere",
    "baptisedHolySpirit",
    "holySpiritDate",
    "holySpiritWhere",
    "biblicalCourses",
    "occupations",
    "occupationOther",
    "parishId",
    "parishOther",
    "saturdayCohortId",
    "declarationAccepted",
  ];
  for (const key of order) {
    if (errors[key]) return key;
  }
  return (Object.keys(errors)[0] as keyof EnrolFormData) ?? null;
}
