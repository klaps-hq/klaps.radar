import type { ComponentType } from "react";
import type { IScreeningDetail } from "./IScreenings";

export type TemplateDefinition = {
  key: string;
  component: ComponentType<IScreeningDetail>;
};
