import type { Portfolio, TemplateId } from "@alibi/shared";
import Geist from "./geist";
import Lowercase from "./lowercase";
import Showcase from "./showcase";

export const TEMPLATES: Record<TemplateId, React.ComponentType<{ portfolio: Portfolio }>> = {
  lowercase: Lowercase,
  showcase: Showcase,
  geist: Geist,
};
