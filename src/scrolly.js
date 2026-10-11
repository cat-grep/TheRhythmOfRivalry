// Scroll-driven steps for the hero map. Each step sets the shared state.
import { setState } from "./state.js";

const STEPS = {
    pulse: { colorBy: "bpm", layers: { hulls: false, voronoi: false, arcs: false } },
    conference: { colorBy: "conference", era: "2019", layers: { hulls: true, voronoi: false, arcs: false } },
    realign: { colorBy: "conference", era: "2024", layers: { hulls: true, voronoi: false, arcs: false } },
    turf: { colorBy: "conference", layers: { hulls: false, voronoi: true, arcs: false } },
    rivals: { layers: { hulls: false, voronoi: false, arcs: true } },
    explore: {}
};

export function initScrolly() {
    const steps = [...document.querySelectorAll(".step")];
    let current = null;

    const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const name = entry.target.dataset.step;
            if (name === current) return;
            current = name;
            steps.forEach(s => s.classList.toggle("is-active", s === entry.target));
            setState(STEPS[name] || {});
        });
    }, { rootMargin: "-45% 0px -45% 0px" });

    steps.forEach(s => io.observe(s));
}
