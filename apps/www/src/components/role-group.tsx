import type { Group } from "@/i18n/roles";
import { MEDIA, hasAsset } from "@/media/manifest";

import { LineArt } from "./line-art";
import { RoleShot } from "./role-shot";
import { Section } from "./section";

// One capability group: a title and lede, the capabilities as cards, and the
// group's screenshot on a tinted stage beside them when it has one.
export function RoleGroup({ id, group, ground }: { id: string; group: Group; ground: "pen" | "marker" | "field" }) {
  const slot = group.shot ? MEDIA[group.shot] : null;
  const shown = slot && hasAsset(slot) ? slot : null;
  const layout = shown ? (shown.frame === "phone" ? "rgroup-phone" : "rgroup-plate") : "rgroup-text";

  return (
    <Section id={id}>
      <header data-reveal="" className="max-w-[40rem]">
        <h2 className="t-h2">{group.title}</h2>
        <p className="t-lede mt-4">{group.lede}</p>
      </header>

      <div className={`rgroup ${layout} mt-10`}>
        <ul role="list" className="cap-grid" data-reveal="">
          {group.capabilities.map((c) => (
            <li key={c.name} className="cap-card">
              <span className="cap-icon">
                <LineArt name="check" className="h-5 w-5" />
              </span>
              <h3 className="cap-name">{c.name}</h3>
              <p className="cap-detail">{c.detail}</p>
            </li>
          ))}
        </ul>

        {shown ? (
          <div className="rstage" data-ground={ground} data-reveal="">
            <RoleShot slot={shown} alt={`${group.title}. ${group.lede}`} />
          </div>
        ) : null}
      </div>
    </Section>
  );
}
