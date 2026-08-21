import type { GraduationChecklistItem } from "@/lib/graduation/eligibility";



type Props = {

  items: GraduationChecklistItem[];

  compact?: boolean;

};



export function GraduationChecklist({ items, compact = false }: Props) {

  if (!items.length) return null;



  return (

    <ul

      className={`space-y-2 ${compact ? "text-sm" : ""}`}

      aria-label="Graduation requirements"

    >

      {items.map((item) => (

        <li

          key={item.id}

          className={`flex gap-3 border border-stone px-3 py-2.5 ${

            item.met ? "bg-white/50" : "bg-mist/60"

          }`}

        >

          <span

            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${

              item.met

                ? "bg-celadon/20 text-pine"

                : "bg-stone/80 text-ink/40"

            }`}

            aria-hidden

          >

            {item.met ? "✓" : "·"}

          </span>

          <div className="min-w-0">

            <p className="font-medium text-ink">{item.label}</p>

            <p className="mt-0.5 text-xs text-ink/55">{item.detail}</p>

          </div>

        </li>

      ))}

    </ul>

  );

}

