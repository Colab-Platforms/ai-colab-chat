/**
 * Mirrors `MindmapSpec` in backend/src/modules/document/document.types.ts and
 * `MindmapThemeTokens` in document.mindmapThemes.ts. A local copy, like the
 * other spec shapes: there is no shared package between frontend and backend,
 * so the field names must stay identical to what `GET /documents/:id/spec`
 * returns.
 */
export interface MindmapNodeSpec {
  id: string;
  text: string;
  note?: string;
  children: MindmapNodeSpec[];
}

export interface MindmapSpec {
  title: string;
  root: MindmapNodeSpec;
}

export interface MindmapThemeTokens {
  key: string;
  label: string;
  bg: string;
  rootBg: string;
  rootText: string;
  text: string;
  muted: string;
  branchColors: string[];
  fontFamily: string;
  headingWeight: number;
}
