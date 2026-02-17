import ScaleSelector from "./ScaleSelector";
import ScaleInfo from "./ScaleInfo";
import ScaleComparison from "./ScaleComparison";

export default function ScalesModule() {
  return (
    <section className="section-panel flex flex-col gap-4">
      <h2 className="font-heading text-lg text-text-primary">
        Escalas e Modos
      </h2>
      <ScaleSelector />
      <ScaleInfo />
      <ScaleComparison />
    </section>
  );
}
