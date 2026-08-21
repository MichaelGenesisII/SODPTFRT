"use server";

export type AddressSuggestionPreview = {
  placeId: string;
  label: string;
};

export type AddressSuggestion = {
  line1: string;
  line2: string;
  townCity: string;
  county: string;
  postcode: string;
  country: string;
  placeId: string;
};

export type AddressSearchResult = {
  ok: boolean;
  configured?: boolean;
  message: string;
  suggestions: AddressSuggestionPreview[];
};

export type AddressResolveResult = {
  ok: boolean;
  message: string;
  address: AddressSuggestion | null;
};

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GooglePostalAddress = {
  regionCode?: string;
  postalCode?: string;
  locality?: string;
  administrativeArea?: string;
  addressLines?: string[];
};

const REGION_TO_COUNTRY: Record<string, string> = {
  GB: "United Kingdom",
  IE: "Ireland",
  US: "United States",
  CA: "Canada",
};

function googlePlacesKey(): string | null {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

export async function isAddressLookupReady(): Promise<boolean> {
  return Boolean(googlePlacesKey());
}

function componentText(
  components: GoogleAddressComponent[],
  ...types: string[]
): string {
  for (const type of types) {
    const match = components.find((item) => item.types?.includes(type));
    const value = match?.longText?.trim() || match?.shortText?.trim();
    if (value) return value;
  }
  return "";
}

function countryFromRegion(regionCode: string | undefined): string {
  if (!regionCode) return "United Kingdom";
  return REGION_TO_COUNTRY[regionCode.toUpperCase()] ?? regionCode;
}

function parsePlaceDetails(
  placeId: string,
  payload: {
    id?: string;
    formattedAddress?: string;
    postalAddress?: GooglePostalAddress;
    addressComponents?: GoogleAddressComponent[];
  },
): AddressSuggestion {
  const postal = payload.postalAddress;
  const components = payload.addressComponents ?? [];

  if (postal?.addressLines?.length) {
    const regionCode = postal.regionCode;
    return {
      line1: postal.addressLines[0]?.trim() ?? "",
      line2: postal.addressLines[1]?.trim() ?? "",
      townCity:
        postal.locality?.trim() ||
        componentText(components, "locality", "postal_town") ||
        "",
      county:
        postal.administrativeArea?.trim() ||
        componentText(components, "administrative_area_level_2") ||
        "",
      postcode: postal.postalCode?.trim() ?? "",
      country: countryFromRegion(regionCode),
      placeId: payload.id?.replace(/^places\//, "") || placeId,
    };
  }

  const streetNumber = componentText(components, "street_number");
  const route = componentText(components, "route");
  const line1 =
    [streetNumber, route].filter(Boolean).join(" ") ||
    componentText(components, "premise", "subpremise") ||
    payload.formattedAddress?.split(",")[0]?.trim() ||
    "";

  return {
    line1,
    line2: componentText(components, "subpremise", "floor", "unit"),
    townCity: componentText(
      components,
      "locality",
      "postal_town",
      "sublocality",
    ),
    county: componentText(components, "administrative_area_level_2"),
    postcode: componentText(components, "postal_code"),
    country: countryFromRegion(
      componentText(components, "country") ||
        components.find((item) => item.types?.includes("country"))
          ?.shortText,
    ),
    placeId: payload.id?.replace(/^places\//, "") || placeId,
  };
}

/** Google Places Autocomplete (server-side). Requires GOOGLE_PLACES_API_KEY. */
export async function searchAddressSuggestions(
  query: string,
): Promise<AddressSearchResult> {
  const q = query.trim();
  if (q.length < 3) {
    return {
      ok: false,
      message: "Enter at least 3 characters.",
      suggestions: [],
    };
  }

  const apiKey = googlePlacesKey();
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      message: "Address search is temporarily unavailable. Enter your address below.",
      suggestions: [],
    };
  }

  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify({
          input: q,
          includedRegionCodes: ["gb", "ie"],
        }),
        next: { revalidate: 0 },
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }>;
      error?: { message?: string };
    } | null;

    if (!response.ok) {
      console.error("[address/search]", payload?.error?.message ?? response.status);
      return {
        ok: false,
        message: "Address search is temporarily unavailable.",
        suggestions: [],
      };
    }

    const suggestions = (payload?.suggestions ?? [])
      .map((item) => {
        const prediction = item.placePrediction;
        if (!prediction?.placeId) return null;
        const main = prediction.structuredFormat?.mainText?.text?.trim();
        const secondary =
          prediction.structuredFormat?.secondaryText?.text?.trim();
        const label =
          [main, secondary].filter(Boolean).join(", ") ||
          prediction.text?.text?.trim() ||
          "Address";
        return { placeId: prediction.placeId, label };
      })
      .filter((item): item is AddressSuggestionPreview => Boolean(item))
      .slice(0, 8);

    return {
      ok: true,
      message: suggestions.length ? "" : "No addresses found.",
      suggestions,
    };
  } catch (error) {
    console.error("[address/search]", error);
    return {
      ok: false,
      message: "Address search is temporarily unavailable.",
      suggestions: [],
    };
  }
}

/** Resolve a Places place_id into structured address lines for enrolment. */
export async function resolveAddressPlace(
  placeId: string,
): Promise<AddressResolveResult> {
  const id = placeId.trim();
  if (!id) {
    return { ok: false, message: "Choose an address from the list.", address: null };
  }

  const apiKey = googlePlacesKey();
  if (!apiKey) {
    return {
      ok: false,
      message: "Address search is temporarily unavailable.",
      address: null,
    };
  }

  try {
    const encodedId = encodeURIComponent(id);
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodedId}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,formattedAddress,addressComponents,postalAddress",
        },
        next: { revalidate: 3600 },
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      formattedAddress?: string;
      postalAddress?: GooglePostalAddress;
      addressComponents?: GoogleAddressComponent[];
      error?: { message?: string };
    } | null;

    if (!response.ok || !payload) {
      console.error("[address/resolve]", payload?.error?.message ?? response.status);
      return {
        ok: false,
        message: "Could not load that address. Choose another result from the list.",
        address: null,
      };
    }

    const address = parsePlaceDetails(id, payload);
    if (!address.line1 && !address.postcode && !address.townCity) {
      return {
        ok: false,
        message: "That address could not be confirmed. Choose another result from the list.",
        address: null,
      };
    }

    return { ok: true, message: "", address };
  } catch (error) {
    console.error("[address/resolve]", error);
    return {
      ok: false,
      message: "Address search is temporarily unavailable.",
      address: null,
    };
  }
}
