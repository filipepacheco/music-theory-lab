import ScaleSelector from "./ScaleSelector";
import ScaleInfo from "./ScaleInfo";
import ScaleComparison from "./ScaleComparison";
import Frame from "@/components/shared/Frame";

export default function ScalesModule() {
  return (
    <Frame
      as="section"
      title="Escalas e Modos"
      titleAs="h2"
      className="flex flex-col gap-4"
    >
      <ScaleSelector />
      <ScaleInfo />
      <ScaleComparison />
    </Frame>
  );
}
