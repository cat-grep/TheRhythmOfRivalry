// Q4: rivalry map + face-off, geography-vs-music pairs, and LISA hot spots.
import { state, setState, subscribe, confOf, selectSchool } from "../state.js";
import { confColor, symbolPath, lisaColor, lisaLabel, RIVAL_INK, ACCENT, fmtKm } from "../theme.js";
import { usProjection, drawBasemap, bowedArc } from "../geo.js";
import { svgIn, showTip, hideTip, a11yMark, segmented, el, escapeHtml } from "../ui.js";

export function initRivalry(ctx) {
    if (state.rivalry === null) state.rivalry = 0;
    const pairDists = ctx.analysis.pairs.map(p => p.d).sort(d3.ascending);
    const pctMoreDifferent = d => d3.bisectLeft(pairDists, d) / pairDists.length;

    /* ---------- map ---------- */
    const W = 760, H = 470;
    const svg = svgIn("#rivalry-map", W, H, "Map of 33 college football rivalries");
    const projection = usProjection(ctx.nation, W, H, 10);
    drawBasemap(svg.append("g"), ctx, d3.geoPath(projection));
    const xy = new Map(ctx.songs.map(d => [d.school, projection([d.lon, d.lat])]));
    const inRivalry = new Set(ctx.rivalries.flatMap(r => [r.school_a, r.school_b]));

    const arcs = svg.append("g").selectAll("path").data(ctx.rivalries).join("path")
        .attr("class", "rival-arc rival-arc--big")
        .attr("d", r => bowedArc(xy.get(r.school_a), xy.get(r.school_b), 0.35))
        .attr("stroke", RIVAL_INK)
        .on("click", (e, r) => setState({ rivalry: ctx.rivalries.indexOf(r) }))
        .on("mousemove", (e, r) => showTip(e, `<strong>${escapeHtml(r.name)}</strong><br>${escapeHtml(r.school_a)} vs ${escapeHtml(r.school_b)}`))
        .on("mouseleave", hideTip);
    const pts = svg.append("g").selectAll("path").data(ctx.songs.filter(d => inRivalry.has(d.school))).join("path")
        .attr("class", "mark rival-pt").attr("data-school", d => d.school)
        .attr("transform", d => `translate(${xy.get(d.school)})`)
        .on("click", (e, d) => {
            // clicking a school cycles through its rivalries
            const mine = ctx.rivalries.map((r, i) => [r, i]).filter(([r]) => r.school_a === d.school || r.school_b === d.school);
            const cur = mine.findIndex(([, i]) => i === state.rivalry);
            setState({ rivalry: mine[(cur + 1) % mine.length][1] });
        })
        .on("mousemove", (e, d) => showTip(e, `<strong>${escapeHtml(d.school)}</strong>`))
        .on("mouseleave", hideTip);
    const labels = svg.append("g");

    /* ---------- list ---------- */
    const list = document.getElementById("rivalry-list");
    const items = ctx.rivalries.map((r, i) => {
        const b = el("button", { type: "button", class: "rivalry-item", role: "option", "data-i": i },
            `<span class="ri-name">${escapeHtml(r.name)}</span><span class="ri-teams">${escapeHtml(r.school_a)} – ${escapeHtml(r.school_b)}</span>`);
        b.addEventListener("click", () => setState({ rivalry: i }));
        list.append(b);
        return b;
    });

    /* ---------- face-off ---------- */
    const box = document.getElementById("faceoff");

    function renderFaceoff(r) {
        const a = ctx.bySchool.get(r.school_a), b = ctx.bySchool.get(r.school_b);
        const pct = pctMoreDifferent(r.music_distance);
        const twin = r.bpm_folded_diff <= 4;
        const rows = [
            ["Tempo", a.bpm, b.bpm, "BPM"],
            ["Folded tempo", a.bpm_folded, b.bpm_folded, "BPM"],
            ["Length", a.sec_duration, b.sec_duration, "s"],
            ["Tropes used", a.trope_count, b.trope_count, "/8"],
            ["Says “fight”", a.number_fights, b.number_fights, "×"]
        ];
        const yearRow = `<div class="fo-row"><span class="fo-val">${a.year ?? "?"}</span><span class="fo-label">Written</span><span class="fo-val">${b.year ?? "?"}</span></div>`;
        const tropeCells = ctx.analysis.tropes.map(t => {
            const ia = a.tropes[t.key], ib = b.tropes[t.key];
            return `<div class="fo-trope ${ia && ib ? "is-shared" : ""}"><span class="${ia ? "on" : "off"}"></span><em>${t.label}</em><span class="${ib ? "on" : "off"}"></span></div>`;
        }).join("");
        const team = d => `
            <div class="fo-team" style="--team:${confColor[confOf(d)]}">
                <button type="button" class="fo-school" data-school="${escapeHtml(d.school)}">${escapeHtml(d.school)}</button>
                <div class="fo-song">${escapeHtml(d.song_name)}</div>
                <div class="fo-conf">${confOf(d)}</div>
            </div>`;

        box.innerHTML = `
            <div class="fo-title">
                <div class="fo-name">${escapeHtml(r.name)}</div>
                <div class="fo-meta">Since ${r.since} · ${fmtKm(r.km)} apart</div>
            </div>
            <div class="fo-teams">${team(a)}<div class="fo-vs">VS</div>${team(b)}</div>
            <div class="fo-embeds" id="fo-embeds"></div>
            <div class="fo-board">
                ${rows.map(([label, va, vb, unit]) => {
                    const m = Math.max(va, vb) || 1;
                    return `<div class="fo-row">
                        <span class="fo-val ${va > vb ? "is-more" : ""}">${va}<small>${unit}</small></span>
                        <span class="fo-bars"><i class="fo-bar fo-bar--a" style="width:${va / m * 50}%"></i><em>${label}</em><i class="fo-bar fo-bar--b" style="width:${vb / m * 50}%"></i></span>
                        <span class="fo-val ${vb > va ? "is-more" : ""}">${vb}<small>${unit}</small></span>
                    </div>`;
                }).join("")}
                ${yearRow}
            </div>
            <div class="fo-tropes">${tropeCells}</div>
            <div class="fo-verdict">
                ${twin ? `<strong>Tempo twins.</strong> Once folded, these songs march within ${r.bpm_folded_diff} BPM of each other. ` : ""}
                Musically, these rivals are more different than <strong>${Math.round(pct * 100)}%</strong> of all school pairs
                ${r.shared_tropes.length ? `and share ${r.shared_tropes.length} of 8 tropes.` : "and share no tropes at all."}
            </div>`;

        box.querySelector("#fo-embeds").innerHTML = [a, b].map(d => d.spotify_id
            ? `<iframe title="${escapeHtml(d.song_name)} on Spotify" src="https://open.spotify.com/embed/track/${d.spotify_id}?utm_source=generator&theme=0" height="80" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`
            : `<div class="no-track">No recording available</div>`).join("");
        box.querySelectorAll(".fo-school").forEach(btn => btn.addEventListener("click", () => setState({ selected: btn.dataset.school })));
    }

    function render(s) {
        const r = ctx.rivalries[s.rivalry];
        arcs.classed("is-picked", d => d === r).filter(d => d === r).raise();
        pts.attr("d", d => symbolPath(confOf(d), (d.school === r.school_a || d.school === r.school_b) ? 200 : 60))
            .attr("fill", d => confColor[confOf(d)])
            .classed("is-muted", d => d.school !== r.school_a && d.school !== r.school_b);
        labels.selectAll("text").data([r.school_a, r.school_b]).join("text").attr("class", "map-label")
            .attr("x", d => xy.get(d)[0] + 12).attr("y", d => xy.get(d)[1] + 4).text(d => d);
        items.forEach((b, i) => { b.classList.toggle("is-active", i === s.rivalry); b.setAttribute("aria-selected", String(i === s.rivalry)); });
        renderFaceoff(r);
    }
    subscribe((s, changed) => { if (changed.includes("rivalry") || changed.includes("era")) render(s); });
    render(state);

    initPairs(ctx);
    initLisa(ctx);
}

/* ---------- every pair: distance vs musical difference ---------- */
function initPairs(ctx) {
    const W = 960, H = 340, M = { t: 16, r: 24, b: 40, l: 54 };
    const svg = svgIn("#pairs-chart", W, H, "Geographic distance versus musical distance for every pair of schools");
    const pairs = ctx.analysis.pairs;
    const x = d3.scaleLinear().domain([0, d3.max(pairs, p => p.km)]).nice().range([M.l, W - M.r]);
    const y = d3.scaleLinear().domain([0, d3.max(pairs, p => p.d)]).nice().range([H - M.b, M.t]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${M.l},0)`)
        .call(d3.axisLeft(y).ticks(4).tickSize(-(W - M.l - M.r))).call(g => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`)
        .call(d3.axisBottom(x).ticks(8).tickFormat(d => `${d3.format(",")(d)} km`));
    svg.append("text").attr("class", "axis-title").attr("x", M.l + 4).attr("y", M.t + 4).text("↑ Musical distance (Gower)");
    svg.append("text").attr("class", "axis-title").attr("x", W - M.r).attr("y", H - 6).attr("text-anchor", "end").text("Distance apart →");

    const key = (a, b) => [a, b].sort().join("|");
    const rivalIdx = new Map(ctx.rivalries.map((r, i) => [key(r.school_a, r.school_b), i]));

    svg.append("g").selectAll("circle").data(pairs.filter(p => !rivalIdx.has(key(p.a, p.b)))).join("circle")
        .attr("class", "pair-dot").attr("r", 2.2).attr("cx", p => x(p.km)).attr("cy", p => y(p.d));
    const hot = svg.append("g");

    // binned mean: is there any trend?
    const bins = d3.bin().value(p => p.km).thresholds(d3.range(0, 5000, 400))(pairs).filter(b => b.length > 10);
    svg.append("path").datum(bins).attr("class", "trend-line")
        .attr("d", d3.line().curve(d3.curveMonotoneX).x(b => x((b.x0 + b.x1) / 2)).y(b => y(d3.mean(b, p => p.d))));
    svg.append("text").attr("class", "chart-note").attr("x", W - M.r).attr("y", y(d3.mean(bins[bins.length - 1], p => p.d)) - 10)
        .attr("text-anchor", "end").text("average per 400 km: flat");

    const rivals = svg.append("g").selectAll("circle").data(pairs.filter(p => rivalIdx.has(key(p.a, p.b)))).join("circle")
        .attr("class", "pair-dot pair-dot--rival").attr("r", 5.5).attr("cx", p => x(p.km)).attr("cy", p => y(p.d))
        .attr("fill", ACCENT)
        .on("click", (e, p) => setState({ rivalry: rivalIdx.get(key(p.a, p.b)) }))
        .on("mousemove", (e, p) => showTip(e, `<strong>${escapeHtml(ctx.rivalries[rivalIdx.get(key(p.a, p.b))].name)}</strong><br>${escapeHtml(p.a)} – ${escapeHtml(p.b)}<br><span class="tip-sub">${fmtKm(p.km)} · distance ${p.d.toFixed(2)}</span>`))
        .on("mouseleave", hideTip);
    a11yMark(rivals, "", (e, p) => setState({ rivalry: rivalIdx.get(key(p.a, p.b)) }));
    rivals.attr("aria-label", p => `${ctx.rivalries[rivalIdx.get(key(p.a, p.b))].name}`);

    // a selected school lights up all of its pairs
    function render(s) {
        const mine = s.selected ? pairs.filter(p => p.a === s.selected || p.b === s.selected) : [];
        hot.selectAll("circle").data(mine).join("circle").attr("class", "pair-dot pair-dot--mine").attr("r", 3.4)
            .attr("cx", p => x(p.km)).attr("cy", p => y(p.d))
            .on("mousemove", (e, p) => showTip(e, `${escapeHtml(p.a)} – ${escapeHtml(p.b)}<br><span class="tip-sub">${fmtKm(p.km)} · distance ${p.d.toFixed(2)}</span>`))
            .on("mouseleave", hideTip);
        rivals.raise();
    }
    subscribe((s, changed) => { if (changed.includes("selected")) render(s); });
    render(state);
}

/* ---------- LISA ---------- */
function initLisa(ctx) {
    const W = 760, H = 470;
    const svg = svgIn("#lisa-map", W, H, "Local Moran's I clusters");
    const projection = usProjection(ctx.nation, W, H, 10);
    drawBasemap(svg.append("g"), ctx, d3.geoPath(projection));
    const pts = svg.append("g").selectAll("circle").data(ctx.songs).join("circle")
        .attr("class", "mark lisa-pt").attr("data-school", d => d.school)
        .attr("cx", d => projection([d.lon, d.lat])[0]).attr("cy", d => projection([d.lon, d.lat])[1])
        .on("click", (e, d) => selectSchool(d.school))
        .on("mouseleave", hideTip);
    const legend = document.getElementById("lisa-legend");
    let variable = "bpm_folded";
    const quad = d => d.lisa[variable].p < 0.05 ? d.lisa[variable].quad : "ns";

    function render() {
        pts.attr("r", d => quad(d) === "ns" ? 4.5 : 8).attr("fill", d => lisaColor[quad(d)])
            .on("mousemove", (e, d) => showTip(e, `<strong>${escapeHtml(d.school)}</strong><br>${lisaLabel[quad(d)]}<br>
                <span class="tip-sub">${variable === "bpm_folded" ? `${d.bpm_folded} BPM (folded)` : `${d.trope_count} tropes`} · p = ${d.lisa[variable].p.toFixed(3)}</span>`));
        pts.filter(d => quad(d) !== "ns").raise();
        const counts = d3.rollup(ctx.songs, v => v.length, quad);
        legend.innerHTML = ["HH", "LL", "HL", "LH", "ns"].map(k => `
            <div class="lisa-item"><i style="background:${lisaColor[k]}"></i><span>${lisaLabel[k]}</span><b>${counts.get(k) || 0}</b></div>`).join("")
            + `<p class="note">“High among high” = a ${variable === "bpm_folded" ? "fast" : "trope-heavy"} song whose neighbours are too. Significance at p &lt; 0.05 without multiple-testing correction.</p>`;
    }
    segmented("#lisa-toggle", v => { variable = v; render(); });
    render();
}
