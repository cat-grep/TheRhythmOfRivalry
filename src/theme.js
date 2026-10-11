// Shared visual vocabulary. Every chart reads colors and shapes from here.

export const CONFS = ["Big Ten", "SEC", "ACC", "Big 12", "Pac-12", "Independent"];

// Five hues validated all-pairs on the dark card surface (#161b22) for colour-vision
// deficiency (worst ΔE 8.7) and normal vision (worst ΔE 20.5). Independent has a single
// school, so it gets neutral grey rather than a sixth hue. Shapes are the secondary channel.
export const confColor = {
    "Big Ten": "#3987e5",
    "SEC": "#e8a33a",
    "ACC": "#2fbf8f",
    "Big 12": "#008300",
    "Pac-12": "#d55181",
    "Independent": "#8b949e"
};

export const confSymbol = {
    "Big Ten": d3.symbolCircle,
    "SEC": d3.symbolDiamond,
    "ACC": d3.symbolSquare,
    "Big 12": d3.symbolTriangle,
    "Pac-12": d3.symbolStar,
    "Independent": d3.symbolWye
};

export const ERA_LABEL = { "2019": "2019", "2024": "2024–26" };

export const studentColor = { "Yes": "#3987e5", "No": "#e8a33a", "Unknown": "#59616b" };
export const studentLabel = { "Yes": "Student", "No": "Non-student", "Unknown": "Unknown" };

export const archetypeColor = {
    "The Classic March": "#3987e5",
    "The Old Guard": "#e8a33a",
    "The Cheer": "#2fbf8f",
    "The Anthem": "#d55181"
};

// Single-hue sequential ramp (blue), dark → light so high values stand out on the dark page.
export const seqInterpolator = d3.interpolateRgb("#2f66b3", "#dcebfd");

// Diverging pair for correlations: blue (negative) ↔ grey ↔ red (positive).
export const divInterpolator = t => t < 0.5
    ? d3.interpolateRgb("#3987e5", "#383835")(t * 2)
    : d3.interpolateRgb("#383835", "#e66767")((t - 0.5) * 2);

export const lisaColor = {
    HH: "#e66767", LL: "#3987e5", HL: "#f2b8b8", LH: "#a9c9f2", ns: "#3a414b"
};
export const lisaLabel = {
    HH: "High among high", LL: "Low among low", HL: "High among low", LH: "Low among high", ns: "Not significant"
};

export const ACCENT = "#f0b429";
export const RIVAL_INK = "#f4efe1";

export function symbolPath(conf, size = 90) {
    return d3.symbol(confSymbol[conf] || d3.symbolCircle, size)();
}

export function confSlug(conf) {
    return conf.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const fmtKm = km => `${d3.format(",")(Math.round(km))} km`;
export const fmtP = p => p < 0.001 ? "< 0.001" : d3.format(".3f")(p);
