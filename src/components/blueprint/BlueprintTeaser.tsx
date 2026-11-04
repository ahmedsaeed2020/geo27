import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SECTORS, blueprintSearch } from "@/content/blueprint";
import { localeHref, useLocale } from "@/lib/i18n";
import { BP } from "./copy";
import SystemMap from "./SystemMap";
import "@/blueprint.css";

const SAMPLE = SECTORS.find(s => s.id === "retail")!.suggests;

/** Home band that opens the blueprint builder, either blank or pre-filled from a sector. */
export default function BlueprintTeaser() {
  const locale = useLocale();
  const Next = locale === "ar" ? ArrowLeft : ArrowRight;
  const to = localeHref("/blueprint", locale);
  return (
    <section className="bp-teaser" id="blueprint" aria-labelledby="bp-teaser-title">
      <div className="bp-grid-bg" aria-hidden="true" />
      <div className="bp-wrap bp-teaser-grid">
        <div className="bp-teaser-copy">
          <p className="bp-kicker">{BP.teaserKicker[locale]}</p>
          <h2 id="bp-teaser-title">{BP.teaserTitle[locale]}</h2>
          <p className="bp-lede">{BP.teaserLede[locale]}</p>
          <Link to={to} className="bp-teaser-cta">{BP.teaserCta[locale]} <Next aria-hidden="true" /></Link>
          <p className="bp-teaser-pick">{BP.teaserPick[locale]}</p>
          <ul className="bp-teaser-sectors">
            {SECTORS.slice(0, 6).map(s => (
              <li key={s.id}>
                <Link to={to} search={blueprintSearch({ sector: s.id, needs: [...s.suggests] }) as never}>{s.label[locale]}</Link>
              </li>
            ))}
          </ul>
        </div>
        <figure className="bp-teaser-map">
          <SystemMap needs={SAMPLE} locale={locale} label={`${BP.teaserSample[locale]}`} mini />
          <figcaption>{BP.teaserSample[locale]}</figcaption>
        </figure>
      </div>
    </section>
  );
}
