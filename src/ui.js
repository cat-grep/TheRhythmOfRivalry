// Small UI helpers shared across modules: tooltip, responsive SVG, segmented controls.

const tip = d3.select("#tooltip");

export function showTip(event, html) {
    tip.html(html).classed("is-visible", true);
    const node = tip.node();
    const { innerWidth: vw, innerHeight: vh } = window;
    const r = node.getBoundingClientRect();
    let x, y;
    if (typeof event.clientX === "number" && !event.type.startsWith("focus")) {
        x = event.clientX + 14;
        y = event.clientY - r.height - 10;
    } else {
        // keyboard focus: anchor to the element
        const b = event.target.getBoundingClientRect();
        x = b.right + 8;
        y = b.top - r.height - 4;
    }
    if (x + r.width > vw - 8) x = Math.max(8, x - r.width - 28);
    if (y < 8) y = Math.min(vh - r.height - 8, (event.clientY ?? 0) + 18);
    tip.style("left", `${x}px`).style("top", `${y}px`);
}

export function hideTip() {
    tip.classed("is-visible", false);
}

/** Append a responsive SVG sized by viewBox. */
export function svgIn(container, w, h, label) {
    const sel = typeof container === "string" ? d3.select(container) : container;
    sel.selectAll("svg").remove();
    return sel.append("svg")
        .attr("viewBox", `0 0 ${w} ${h}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .attr("role", "img")
        .attr("aria-label", label || "");
}

/** Wire a .segmented button group; calls onChange(value). Returns a setter. */
export function segmented(el, onChange) {
    const root = typeof el === "string" ? document.querySelector(el) : el;
    const buttons = [...root.querySelectorAll("button")];
    const set = value => buttons.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
    buttons.forEach(b => b.addEventListener("click", () => { set(b.dataset.value); onChange(b.dataset.value); }));
    return set;
}

/** Make an SVG mark keyboard-operable and announce it. */
export function a11yMark(sel, label, onActivate) {
    sel.attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", label)
        .on("keydown.a11y", function (event, d) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onActivate(event, d);
            }
        });
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function el(tag, attrs = {}, html = "") {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
        if (k === "class") n.className = v;
        else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v);
    });
    if (html) n.innerHTML = html;
    return n;
}

export function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
