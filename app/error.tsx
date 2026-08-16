"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
        Error
      </p>
      <h2 className="mt-3 font-display text-3xl tracking-[-0.02em] text-pine">
        Something went wrong
      </h2>
      <p className="mt-4 text-base leading-relaxed text-ink/70">
        {error.message || "Please try again."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-8 bg-pine px-6 py-3 text-sm font-medium tracking-wide text-mist transition-colors duration-300 hover:bg-celadon"
      >
        Try again
      </button>
    </div>
  );
}
