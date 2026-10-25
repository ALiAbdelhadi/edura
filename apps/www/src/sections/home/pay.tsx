import { LineArt, type LineArtName } from "@/components/line-art";
import { Section, SectionBody, SectionTitle } from "@/components/section";
import type { Messages } from "@/i18n/messages";

const METHOD_ART: LineArtName[] = ["card", "wallet", "cash", "parent-wallet"];

// How a lesson is paid for: the two plans, then the four ways to pay as cards.
export function Pay({ t }: { t: Messages }) {
  const p = t.pay;

  return (
    <Section id="pay">
      <div data-reveal="" className="max-w-[40rem]">
        <SectionTitle>{p.title}</SectionTitle>
        <SectionBody>{p.lede}</SectionBody>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {p.plans.map((plan) => (
          <article key={plan.name} data-reveal="" className="card p-6">
            <h3 className="t-h3">{plan.name}</h3>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{plan.body}</p>
            <ul role="list" className="mt-5 border-t border-rule pt-4">
              {plan.points.map((point) => (
                <li key={point} className="flex items-start gap-3 py-1.5 text-[0.9375rem] text-ink">
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    className="mt-1 h-4 w-4 shrink-0 text-pen"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                  {point}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div data-reveal="" className="mt-14">
        <h3 className="t-h3">{p.methodsTitle}</h3>
        <ul role="list" className="method-grid mt-5">
          {p.methods.map((method, i) => (
            <li key={method.title} className="method-card">
              <span className="method-icon">
                <LineArt name={METHOD_ART[i % METHOD_ART.length]!} className="h-7 w-7" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-ink">{method.title}</span>
                <span className="mt-1 block text-[0.9375rem] leading-relaxed text-ink-2">{method.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
