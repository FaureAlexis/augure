import { styleText } from "node:util";

export const brand = (s: string) => styleText("yellow", s);
export const ok = (s: string) => styleText("green", s);
export const err = (s: string) => styleText("red", s);
export const dim = (s: string) => styleText("dim", s);
export const bold = (s: string) => styleText("bold", s);
export const cyan = (s: string) => styleText("cyan", s);

export const prefix = brand("▲ augure");
