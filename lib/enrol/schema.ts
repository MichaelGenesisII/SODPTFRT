export const ATTENDANCE_MODES = [
  {
    value: "standard",
    label: "Standard Program",
    hint: "10 months long",
  },
  {
    value: "ignite",
    label: "SOD Ignite",
    hint: "Young adults 17–22 years old",
  },
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
  { id: "life", label: "Life", title: "School, work & church" },
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
  addressLine1: string;
  addressLine2: string;
  townCity: string;
  county: string;
  postcode: string;
  /** Country of residence (address) — not nationality */
  country: string;
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
  baptisedWater: string;
  waterBaptismDate: string;
  waterBaptismWhere: string;
  schoolsAttended: string;
  occupations: string[];
  occupationOther: string;
  /** Organisational parish (required) */
  parishId: string;
  /** Open enrolment batch for that parish (required) */
  batchId: string;
  /** Optional assembly / location detail */
  localChurch: string;
  churchLeader: string;
  churchActivities: string;
  declarationAccepted: boolean;
};

export const initialEnrolFormData: EnrolFormData = {
  attendanceMode: "",
  firstName: "",
  middleName: "",
  lastName: "",
  addressLine1: "",
  addressLine2: "",
  townCity: "",
  county: "",
  postcode: "",
  country: "",
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
  schoolsAttended: "",
  occupations: [],
  occupationOther: "",
  parishId: "",
  batchId: "",
  localChurch: "",
  churchLeader: "",
  churchActivities: "",
  declarationAccepted: false,
};

export function validateStep(
  stepId: EnrolStepId,
  data: EnrolFormData,
): Partial<Record<keyof EnrolFormData, string>> {
  const errors: Partial<Record<keyof EnrolFormData, string>> = {};

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
  }

  if (stepId === "address") {
    if (!data.addressLine1.trim())
      errors.addressLine1 = "First line of address is required.";
    if (!data.townCity.trim()) errors.townCity = "Town/City is required.";
    if (!data.postcode.trim()) errors.postcode = "Postcode is required.";
    if (!data.country) errors.country = "Country of residence is required.";
    else if (!(COUNTRIES as readonly string[]).includes(data.country))
      errors.country = "Please choose a valid country.";
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
    if (!data.nationality) errors.nationality = "Nationality is required.";
    else if (!(NATIONALITIES as readonly string[]).includes(data.nationality))
      errors.nationality = "Please choose a valid nationality.";
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
    if (!data.baptisedHolySpirit)
      errors.baptisedHolySpirit = "Please answer this question.";
    else if (!yesNo.has(data.baptisedHolySpirit))
      errors.baptisedHolySpirit = "Please answer Yes or No.";
    if (!data.baptisedWater)
      errors.baptisedWater = "Please answer this question.";
    else if (!yesNo.has(data.baptisedWater))
      errors.baptisedWater = "Please answer Yes or No.";
  }

  if (stepId === "life") {
    if (!data.schoolsAttended.trim())
      errors.schoolsAttended = "Please include schools attended.";
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
    if (!data.parishId) errors.parishId = "Please select your parish.";
    if (!data.batchId) errors.batchId = "Please select an open batch.";
    if (!data.churchLeader.trim())
      errors.churchLeader = "Church leader name is required.";
  }

  if (stepId === "declaration") {
    if (!data.declarationAccepted)
      errors.declarationAccepted = "You must agree to the declaration.";
  }

  return errors;
}
