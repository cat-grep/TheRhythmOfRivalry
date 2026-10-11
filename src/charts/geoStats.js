// Q1 panels: realignment distances and Moran's I permutation tests.
import { CONFS, confColor, symbolPath, fmtKm, fmtP } from "../theme.js";
import { svgIn, showTip, hideTip } from "../ui.js";

/** Dumbbell chart: mean distance between member stadiums, 2019 → 2024. */
export function initRealignChart(ctx) {
    const disp = ctx.analysis.dispersion;
    const rows = CONFS.filter(c => disp["2019"][c] || disp["2024"][c]).map(c => ({
        conf: c, a: disp["2019"][c], b: disp["2024"][c]
    }));
    const W = 560, rowH = 46, M = { t: 34, r: 70, b: 34, l: 92 };
    const H = M.t + M.b + rows.length * rowH;
    const svg = svgIn("#realign-chart", W, H, "Average distance between conference members, 2019 versus 2024");
    const x = d3.scaleLinear().domain([0, 1800]).range([M.l, W - M.r]);
    const y = d3.scaleBand().domain(rows.map(r => r.conf)).range([M.t, H - M.b]).padding(0.4);

    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${H - M.b})`)
        .call(d3.axisBottom(x).ticks(4).tickSize(-(H - M.t - M.b)).tickFormat(d => `${d3.format(",")(d)} km`))
        .call(g => g.select(".domain").remove());

    // era key
    const key = svg.append("g").attr("class", "chart-key").attr("transform", `translate(${M.l},14)`);
    key.append("circle").attr("r", 5).attr("class", "dot-2019");
    key.append("text").attr("x", 10).attr("dy", "0.35em").text("2019");
    key.append("circle").attr("cx", 70).attr("r", 5).attr("fill", "#e6edf3");
    key.append("text").attr("x", 80).attr("dy", "0.35em").text("2024–26");

    const g = svg.append("g").selectAll("g").data(rows).join("g")
        .attr("transform", r => `translate(0,${y(r.conf) + y.bandwidth() / 2})`)
        .on("mousemove", (e, r) => showTip(e, `<strong>${r.conf}</strong><br>
            2019: ${r.a ? fmtKm(r.a.mean_pair_km) + ` (${r.a.n} schools)` : "—"}<br>
            2024: ${r.b ? fmtKm(r.b.mean_pair_km) + ` (${r.b.n} schools)` : "—"}<br>
            <span class="tip-sub">Farthest pair: ${(r.b || r.a).max_pair.join(" – ")}, ${fmtKm((r.b || r.a).max_pair_km)}</span>`))
        .on("mouseleave", hideTip);

    g.append("text").attr("class", "row-label").attr("x", M.l - 26).attr("dy", "0.35em").attr("text-anchor", "end").text(r => r.conf);
    g.append("path").attr("transform", `translate(${M.l - 14},0)`).attr("d", r => symbolPath(r.conf, 70)).attr("fill", r => confColor[r.conf]);
    g.filter(r => r.a && r.b).append("line").attr("class", "dumbbell")
        .attr("x1", r => x(r.a.mean_pair_km)).attr("x2", r => x(r.b.mean_pair_km))
        .attr("stroke", r => confColor[r.conf]);
    g.filter(r => r.a).append("circle").attr("class", "dot-2019").attr("r", 6).attr("cx", r => x(r.a.mean_pair_km));
    g.filter(r => r.b).append("circle").attr("r", 7).attr("cx", r => x(r.b.mean_pair_km)).attr("fill", r => confColor[r.conf]).attr("stroke", "#0d1117").attr("stroke-width", 2);
    g.append("text").attr("class", "value-label")
        .attr("x", r => x(Math.max(r.a?.mean_pair_km || 0, r.b?.mean_pair_km || 0)) + 12).attr("dy", "0.35em")
        .text(r => {
            if (!r.a || !r.b) return "";
            const pct = (r.b.mean_pair_km / r.a.mean_pair_km - 1) * 100;
            return `${pct > 0 ? "+" : ""}${Math.round(pct)}%`;
        });
}

/** Small multiples: permutation distribution vs observed Moran's I for each variable. */
export function initMoranCards(ctx) {
    const container = d3.select("#moran-cards");
    const order = ["bpm_folded", "sec_duration", "year", "trope_count", "student", "bpm"];
    order.forEach(key => {
        const m = ctx.analysis.moran[key];
        const sig = m.p < 0.05;
        const card = container.append("div").attr("class", `moran-card ${sig ? "is-sig" : ""}`);
        card.append("div").attr("class", "moran-label").text(m.label);
        card.append("div").attr("class", "moran-value")
            .html(`I = <strong>${d3.format("+.3f")(m.I)}</strong> <span class="moran-p">p ${m.p < 0.001 ? "" : "= "}${fmtP(m.p)}</span>`);

        const W = 220, H = 64, pad = 4;
        const svg = card.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
            .attr("aria-label", `${m.label}: observed I ${m.I.toFixed(3)}, p ${fmtP(m.p)}`);
        const { counts, edges, observed } = m.perm_hist;
        const lo = Math.min(edges[0], observed), hi = Math.max(edges[edges.length - 1], observed);
        const x = d3.scaleLinear().domain([lo, hi]).range([pad, W - pad]);
        const y = d3.scaleLinear().domain([0, d3.max(counts)]).range([H - 12, 4]);
        svg.append("g").selectAll("rect").data(counts).join("rect")
            .attr("class", "perm-bar")
            .attr("x", (c, i) => x(edges[i]) + 0.5).attr("width", (c, i) => Math.max(0.5, x(edges[i + 1]) - x(edges[i]) - 1))
            .attr("y", c => y(c)).attr("height", c => y(0) - y(c));
        svg.append("line").attr("class", "obs-line").attr("x1", x(observed)).attr("x2", x(observed)).attr("y1", 2).attr("y2", H - 10);
        svg.append("line").attr("class", "zero-line").attr("x1", pad).attr("x2", W - pad).attr("y1", H - 11.5).attr("y2", H - 11.5);
        card.append("div").attr("class", "moran-verdict").text(sig
            ? (m.I > 0 ? "Weak clustering: neighbours are a bit alike" : "Neighbours differ more than chance")
            : "No geographic pattern");
    });
}
