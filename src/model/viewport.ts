/** Reserve screen pixels for the 38px dock + gutter and cross-link arcs/labels.
 * Side panels already reduce the React Flow container; do not pad for them twice.
 */
export const FIT_PADDING = {
  top: "8%",
  left: "8%",
  right: "8%",
  bottom: "160px",
} as const;
