// "Color by" encodings shared by the main map and its legend.
import { state, confOf, bpmOf } from "./state.js";
import { CONFS, confColor, studentColor, studentLabel, archetypeColor, seqInterpolator } from "./theme.js";

const UNKNOWN = "#59616b";
const bpmScale = d3.scaleSequential(seqInterpolator).domain([60, 185]).clamp(true);
const yearScale = d3.scaleSequential(seqInterpolator).domain([1890, 1970]).clamp(true);

export const COLOR_BY = [
    { value: "bpm", label: "Tempo" },
    { value: "conference", label: "Conference" },
    { value: "year", label: "Year" },
    { value: "student", label: "Writer" },
    { value: "archetype", label: "Archetype" }
];

export function fillFor(d, colorBy = state.colorBy) {
    switch (colorBy) {
        case "conference": return confColor[confOf(d)];
        case "bpm": return bpmScale(bpmOf(d));
        case "year": return d.year ? yearScale(d.year) : UNKNOWN;
        case "student": return studentColor[d.student_writer] || UNKNOWN;
        case "archetype": return archetypeColor[d.archetype];
        default: return confColor[confOf(d)];
    }
}

export function legendSpec(songs, colorBy = state.colorBy) {
    const count = f => v => songs.filter(d => f(d) === v).length;
    switch (colorBy) {
        case "conference": {
            const c = count(confOf);
            return {
                type: "cat", filterable: true, items: CONFS.filter(k => c(k) > 0)
                    .map(k => ({ key: k, label: k, color: confColor[k], n: c(k), conf: k }))
            };
        }
        case "student": {
            const c = count(d => d.student_writer);
            return {
                type: "cat", items: ["Yes", "No", "Unknown"]
                    .map(k => ({ key: k, label: studentLabel[k], color: studentColor[k], n: c(k) }))
            };
        }
        case "archetype": {
            const c = count(d => d.archetype);
            return {
                type: "cat", items: Object.keys(archetypeColor)
                    .map(k => ({ key: k, label: k, color: archetypeColor[k], n: c(k) }))
            };
        }
        case "year":
            return { type: "seq", scale: yearScale, label: "Year written", fmt: d3.format("d"), unknown: UNKNOWN };
        default:
            return {
                type: "seq", scale: bpmScale, fmt: d3.format("d"),
                label: state.tempo === "folded" ? "Folded tempo (BPM)" : "Tempo (BPM)"
            };
    }
}
