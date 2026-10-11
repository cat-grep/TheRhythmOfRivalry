// The hero map: pulsing stadiums + conference footprints, Voronoi turf and rivalry arcs.
import { state, setState, subscribe, confOf, bpmOf, passesFilter, selectSchool, toggleConf } from "../state.js";
import { confColor, symbolPath, ERA_LABEL, RIVAL_INK, fmtKm } from "../theme.js";
import { fillFor, legendSpec, COLOR_BY } from "../encode.js";
import { usProjection, drawBasemap, bowedArc, nearestSong } from "../geo.js";
import { svgIn, showTip, hideTip, a11yMark, el, escapeHtml } from "../ui.js";

const W = 960, H = 600;

export function initMainMap(ctx) {
    const svg = svgIn("#main-map", W, H, "Map of 65 college fight song stadiums");
    const projection = usProjection(ctx.nation, W, H, 18);
    const path = d3.geoPath(projection);
    const xy = new Map(ctx.songs.map(d => [d.school, projection([d.lon, d.lat])]));

    svg.append("defs").append("clipPath").attr("id", "main-clip")
        .append("path").datum(ctx.nation).attr("d", path);

    drawBasemap(svg.append("g"), ctx, path);
    const gVor = svg.append("g").attr("class", "voronoi").attr("clip-path", "url(#main-clip)");
    const gHull = svg.append("g").attr("class", "hulls");
    const gArc = svg.append("g").attr("class", "arcs");
    const gYou = svg.append("g").attr("class", "you");
    const gPts = svg.append("g").attr("class", "points");
    const gLbl = svg.append("g").attr("class", "labels");

    // --- Voronoi turf (planar, in projected space; fine at this scale) ---
    const delaunay = d3.Delaunay.from(ctx.songs, d => xy.get(d.school)[0], d => xy.get(d.school)[1]);
    const voronoi = delaunay.voronoi([0, 0, W, H]);
    const cells = gVor.selectAll("path").data(ctx.songs).join("path")
        .attr("class", "cell mark")
        .attr("data-school", d => d.school)
        .attr("d", (d, i) => voronoi.renderCell(i))
        .on("click", (e, d) => selectSchool(d.school))
        .on("mousemove", (e, d) => showTip(e, `<strong>${escapeHtml(d.school)}</strong> turf<br><span class="tip-sub">${escapeHtml(d.song_name)}</span>`))
        .on("mouseleave", hideTip);

    // --- Rivalry arcs ---
    const arcs = gArc.selectAll("path").data(ctx.rivalries).join("path")
        .attr("class", "rival-arc")
        .attr("d", r => bowedArc(xy.get(r.school_a), xy.get(r.school_b), 0.3))
        .attr("stroke", RIVAL_INK)
        .on("mousemove", (e, r) => showTip(e, `<strong>${escapeHtml(r.name)}</strong><br>${escapeHtml(r.school_a)} vs ${escapeHtml(r.school_b)}<br><span class="tip-sub">${fmtKm(r.km)} apart · since ${r.since}</span>`))
        .on("mouseleave", hideTip)
        .on("click", (e, r) => {
            setState({ rivalry: ctx.rivalries.indexOf(r) });
            document.getElementById("q4").scrollIntoView({ behavior: "smooth" });
        });

    // --- Stadium points: a pulsing ring + a conference-shaped symbol ---
    const pts = gPts.selectAll("g").data(ctx.songs, d => d.school).join("g")
        .attr("class", "pt mark")
        .attr("data-school", d => d.school)
        .attr("transform", d => `translate(${xy.get(d.school)})`)
        .on("click", (e, d) => selectSchool(d.school))
        .on("mousemove", (e, d) => showTip(e, tipHtml(d)))
        .on("mouseleave", hideTip)
        .on("focus", (e, d) => showTip(e, tipHtml(d)))
        .on("blur", hideTip);
    a11yMark(pts, "", (e, d) => selectSchool(d.school));
    pts.append("circle").attr("class", "ring").attr("r", 7);
    pts.append("path").attr("class", "sym");

    function tipHtml(d) {
        return `<strong>${escapeHtml(d.school)}</strong><br>${escapeHtml(d.song_name)}<br>
            <span class="tip-sub">${bpmOf(d)} BPM · ${d.sec_duration}s · ${confOf(d)}</span>`;
    }

    // --- Toolbar ---
    const toolbar = document.getElementById("map-toolbar");
    toolbar.innerHTML = `
        <div class="tool-group"><span class="tool-label">Color by</span>
            <div class="segmented segmented--sm" id="colorby-seg" role="group" aria-label="Color by">
                ${COLOR_BY.map(o => `<button type="button" data-value="${o.value}">${o.label}</button>`).join("")}
            </div></div>
        <div class="tool-group"><span class="tool-label">Conferences</span>
            <div class="segmented segmented--sm" id="era-seg" role="group" aria-label="Conference era">
                <button type="button" data-value="2019">2019</button>
                <button type="button" data-value="2024">2024–26</button>
            </div></div>
        <div class="tool-group"><span class="tool-label">Layers</span>
            <div class="toggle-row" role="group" aria-label="Map layers">
                <button type="button" class="toggle" data-layer="hulls">Footprints</button>
                <button type="button" class="toggle" data-layer="voronoi">Turf</button>
                <button type="button" class="toggle" data-layer="arcs">Rivalries</button>
            </div></div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="near-me">📍 Near me</button>
        <span class="tool-status" id="map-status" aria-live="polite"></span>`;

    toolbar.querySelectorAll("#colorby-seg button").forEach(b =>
        b.addEventListener("click", () => setState({ colorBy: b.dataset.value })));
    toolbar.querySelectorAll("#era-seg button").forEach(b =>
        b.addEventListener("click", () => setState({ era: b.dataset.value })));
    toolbar.querySelectorAll("[data-layer]").forEach(b =>
        b.addEventListener("click", () => setState({ layers: { [b.dataset.layer]: !state.layers[b.dataset.layer] } })));

    // --- "Near me": browser geolocation → nearest stadium ---
    const status = document.getElementById("map-status");
    function nearMe() {
        if (!navigator.geolocation) { status.textContent = "Location isn't available in this browser."; return; }
        status.textContent = "Locating…";
        navigator.geolocation.getCurrentPosition(pos => {
            const you = [pos.coords.longitude, pos.coords.latitude];
            const { song, km } = nearestSong(ctx.songs, you);
            const p = projection(you);
            gYou.selectAll("*").remove();
            if (p) {
                gYou.append("path").attr("class", "you-line").attr("d", `M${p}L${xy.get(song.school)}`);
                gYou.append("circle").attr("class", "you-dot").attr("cx", p[0]).attr("cy", p[1]).attr("r", 6);
                gYou.append("text").attr("class", "you-label").attr("x", p[0] + 9).attr("y", p[1] + 4).text("You");
            }
            status.textContent = `Nearest: ${song.school} (${fmtKm(km)})`;
            setState({ selected: song.school, layers: { voronoi: true } });
        }, err => {
            status.textContent = err.code === 1 ? "Location permission was declined." : "Couldn't get your location.";
        }, { timeout: 10000, maximumAge: 600000 });
    }
    document.querySelectorAll('[data-action="near-me"]').forEach(b => b.addEventListener("click", nearMe));

    // --- Legend ---
    const legend = document.getElementById("main-legend");
    function renderLegend() {
        const spec = legendSpec(ctx.songs);
        legend.innerHTML = "";
        if (spec.type === "seq") {
            const [a, b] = spec.scale.domain();
            const stops = d3.range(0, 1.01, 0.1).map(t => spec.scale(a + t * (b - a)));
            legend.append(el("div", { class: "legend-seq" }, `
                <span class="legend-title">${spec.label}</span>
                <span class="legend-min">${spec.fmt(a)}</span>
                <span class="legend-ramp" style="background:linear-gradient(90deg,${stops.join(",")})"></span>
                <span class="legend-max">${spec.fmt(b)}</span>
                ${spec.unknown ? `<span class="legend-chip legend-chip--static"><i style="background:${spec.unknown}"></i>Unknown</span>` : ""}`));
            return;
        }
        if (spec.filterable) legend.append(el("span", { class: "legend-title" }, `${ERA_LABEL[state.era]} conferences <span class="legend-hint">click to filter · shift-click to add</span>`));
        spec.items.forEach(it => {
            const active = state.confFilter.size === 0 || state.confFilter.has(it.key);
            const shape = it.conf ? `<svg viewBox="-8 -8 16 16" aria-hidden="true"><path d="${symbolPath(it.conf, 70)}" fill="${it.color}"/></svg>` : `<i style="background:${it.color}"></i>`;
            const chip = el(spec.filterable ? "button" : "span", {
                class: `legend-chip ${spec.filterable ? "" : "legend-chip--static"} ${active ? "" : "is-off"}`,
                ...(spec.filterable ? { type: "button", "aria-pressed": String(state.confFilter.has(it.key)) } : {})
            }, `${shape}${it.label}<span class="legend-n">${it.n}</span>`);
            if (spec.filterable) chip.addEventListener("click", e => toggleConf(it.key, e.shiftKey));
            legend.append(chip);
        });
        if (spec.filterable && state.confFilter.size) {
            const clear = el("button", { type: "button", class: "legend-clear" }, "Show all");
            clear.addEventListener("click", () => setState({ confFilter: new Set() }));
            legend.append(clear);
        }
    }

    // --- Render ---
    function render(s, changed = []) {
        const t = svg.transition().duration(changed.includes("era") || changed.includes("colorBy") ? 600 : 250);

        pts.style("--beat", d => `${(60 / bpmOf(d)).toFixed(3)}s`)
            .attr("aria-label", d => `${d.school}: ${d.song_name}, ${bpmOf(d)} BPM`)
            .classed("is-out", d => !passesFilter(d));
        pts.select(".sym").attr("d", d => symbolPath(confOf(d), d.school === s.selected ? 260 : 95))
            .transition(t).attr("fill", d => fillFor(d));
        pts.select(".ring").attr("stroke", d => fillFor(d));

        cells.style("display", s.layers.voronoi ? null : "none")
            .transition(t).attr("fill", d => fillFor(d));

        arcs.style("display", s.layers.arcs ? null : "none")
            .classed("is-hot", r => s.selected && (r.school_a === s.selected || r.school_b === s.selected));

        // Conference footprints: a rounded convex hull per conference in the active era.
        const groups = s.layers.hulls
            ? d3.groups(ctx.songs.filter(passesFilter), confOf).filter(([c, g]) => g.length >= 2 && c !== "Independent")
            : [];
        gHull.selectAll("path").data(groups, g => g[0]).join(
            enter => enter.append("path").attr("class", "hull").attr("opacity", 0),
            update => update,
            exit => exit.transition(t).attr("opacity", 0).remove()
        )
            .attr("fill", g => confColor[g[0]]).attr("stroke", g => confColor[g[0]])
            .transition(t).attr("opacity", 1)
            .attr("d", ([, g]) => {
                const p = g.map(d => xy.get(d.school));
                const hull = p.length >= 3 ? d3.polygonHull(p) : p;
                return `M${hull.join("L")}Z`;
            });

        // Label the selected school
        const sel = s.selected ? ctx.songs.filter(d => d.school === s.selected) : [];
        gLbl.selectAll("text").data(sel, d => d.school).join("text")
            .attr("class", "map-label")
            .attr("x", d => xy.get(d.school)[0] + 12).attr("y", d => xy.get(d.school)[1] - 10)
            .text(d => d.school);
        if (s.selected) pts.filter(d => d.school === s.selected).raise();

        // Toolbar state
        toolbar.querySelectorAll("#colorby-seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === s.colorBy)));
        toolbar.querySelectorAll("#era-seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === s.era)));
        toolbar.querySelectorAll("[data-layer]").forEach(b => b.setAttribute("aria-pressed", String(!!s.layers[b.dataset.layer])));
        renderLegend();
    }

    subscribe(render);
    render(state, ["colorBy"]);
}
