export const GUIDE_VIEWS = [
  { id: "deployment", artifact: "deployment", label: "Deployment", title: "Deployment", intro: "Follow requests from the browser to the Oracle control plane, then out to the two AWS probe regions." },
  { id: "lifecycle", artifact: "lifecycle", label: "Life of a check", title: "Life of one check", intro: "Follow one execution from durable intent through regional observations to a verdict and an incident decision." },
  { id: "verdicts", artifact: "verdicts", label: "Verdicts", title: "Verdicts and incidents", intro: "Compare the regional evidence, then see why a verdict can change a streak without changing an incident." },
  { id: "coverage", artifact: "availability", label: "Coverage", title: "Availability and coverage", intro: "Compare two windows with the same availability. The amount of evidence behind that percentage changes the claim." },
  { id: "machine", artifact: "machine", label: "Machine", title: "The monitoring machine", intro: "Choose a scenario and run one check. Select a stage to see what its mechanism does, or watch outage and recovery." },
] as const;

export function guideForPath(path: string) {
  return GUIDE_VIEWS.find((view) => path === `/learn/${view.id}`);
}

export function legacyGuidePath(diagram: string | null) {
  const view = GUIDE_VIEWS.find((entry) => entry.id === diagram || entry.artifact === diagram) ?? GUIDE_VIEWS[0];
  return `/learn/${view.id}`;
}
