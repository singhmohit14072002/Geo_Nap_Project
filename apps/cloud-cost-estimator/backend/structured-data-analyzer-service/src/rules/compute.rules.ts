import { KeywordScore, scoreByKeywords } from "../utils/keyword-matcher";

export const COMPUTE_KEYWORDS = [
  "cpu",
  "vcpu",
  "core",
  "ram",
  "memory",
  "vm",
  "instance",
  "server",
  "gpu"
] as const;

export const computeScore = (searchText: string): KeywordScore =>
  scoreByKeywords(searchText, COMPUTE_KEYWORDS);

