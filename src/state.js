// One small store shared by every chart. Charts subscribe and re-render the parts they own.

export const state = {
    selected: null,          // school name
    rivalry: null,           // index into analysis.rivalries
    era: "2019",             // "2019" | "2024"
    colorBy: "bpm",          // conference | bpm | year | student | archetype
    tempo: "raw",            // raw | folded
    confFilter: new Set(),   // empty = show all
    layers: { hulls: false, voronoi: false, arcs: false }
};

const listeners = new Set();

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function setState(patch) {
    if (patch.layers) patch = { ...patch, layers: { ...state.layers, ...patch.layers } };
    const changed = Object.keys(patch).filter(k => state[k] !== patch[k]);
    if (!changed.length) return;
    Object.assign(state, patch);
    listeners.forEach(fn => fn(state, changed));
}

export const confOf = d => d.conf[state.era];
export const bpmOf = d => state.tempo === "folded" ? d.bpm_folded : d.bpm;

export function passesFilter(d) {
    return state.confFilter.size === 0 || state.confFilter.has(confOf(d));
}

export function toggleConf(conf, additive) {
    const next = new Set(additive ? state.confFilter : []);
    if (state.confFilter.has(conf) && (additive || state.confFilter.size === 1)) next.delete(conf);
    else next.add(conf);
    setState({ confFilter: next });
}

export function selectSchool(name) {
    setState({ selected: state.selected === name ? null : name });
}
