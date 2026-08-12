import { analyzeBlogContent } from "../modules/blog/blog-content-analysis";
import { CALIBRATION_CASES } from "../modules/blog/content-analysis/calibration-fixtures";

const BANDS: Record<string, [number, number]> = {
  empty: [0, 20],
  poor: [0, 55],
  average: [50, 72],
  good: [70, 79],
  strong: [75, 89],
  excellent: [80, 100],
};

function pad(value: string | number, n: number) {
  return String(value).padEnd(n);
}

let failures = 0;

console.log("Officekit Content Quality Score — calibration\n");
console.log(
  `${pad("id", 28)} ${pad("expect", 10)} ${pad("overall", 8)} ${pad("seo", 5)} ${pad("geo", 5)} ${pad("llm", 5)} ${pad("qual", 5)} ${pad("read", 5)} ${pad("crit/hi", 8)} rec`,
);

for (const testCase of CALIBRATION_CASES) {
  const r = analyzeBlogContent(testCase.input);
  const [lo, hi] = BANDS[testCase.expect];
  const ok = r.overallScore >= lo && r.overallScore <= hi;
  if (!ok) failures += 1;
  const flag = ok ? " " : "!";
  console.log(
    `${flag}${pad(testCase.id, 27)} ${pad(testCase.expect, 10)} ${pad(r.overallScore, 8)} ${pad(r.seoScore, 5)} ${pad(r.geoScore, 5)} ${pad(r.llmScore, 5)} ${pad(r.contentQualityScore, 5)} ${pad(r.readabilityScore, 5)} ${pad(`${r.severityCounts.critical}/${r.severityCounts.high}`, 8)} ${r.publishing.band}`,
  );
}

console.log(`\n${CALIBRATION_CASES.length - failures}/${CALIBRATION_CASES.length} within expected bands.`);
if (failures) process.exitCode = 1;
