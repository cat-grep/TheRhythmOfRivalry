// Q3: lyric tropes, conference signatures, trope correlations, "fightiest", authorship, archetypes.
import { state, subscribe, confOf, selectSchool, passesFilter } from "../state.js";
import { CONFS, confColor, symbolPath, studentColor, studentLabel, archetypeColor, divInterpolator, ERA_LABEL, fmtP } from "../theme.js";
import { svgIn, showTip, hideTip, a11yMark, el, escapeHtml } from "../ui.js";

export function initWords(ctx) {
    initTropeUnits(ctx);
    initConfSignatures(ctx);
    initPhi(ctx);
    initFightiest(ctx);
    initStudentWaffle(ctx);
    initGalaxy(ctx);
}

const confRank = c => CONFS.indexOf(c);
const SHORT = { fight: "Fight", victory_win_won: "Win", rah: "Rah", nonsense: "Nons.", colors: "Color", men: "Men", opponents: "Opp.", spelling: "Spell" };

/* ---------------- Unit chart: one dot per song per trope ---------------- */
function initTropeUnits(ctx) {
    const tropes = ctx.analysis.tropes;
    const W = 960, rowH = 30, M = { t: 10, r: 70, b: 10, l: 120 };
    const H = M.t + M.b + rowH * tropes.length;
    const step = (W - M.l - M.r) / 66;
    const svg = svgIn("#tropes-chart", W, H, "Which songs use each lyric trope");

    const rows = svg.selectAll("g.trow").data(tropes).join("g").attr("class", "trow")
        .attr("transform", (t, i) => `translate(0,${M.t + i * rowH + rowH / 2})`);
    rows.append("text").attr("class", "row-label").attr("x", M.l - 14).attr("dy", "0.35em").attr("text-anchor", "end").text(t => t.label);
    rows.append("line").attr("class", "row-rule").attr("x1", M.l - 6).attr("x2", W - M.r + 50).attr("y1", rowH / 2).attr("y2", rowH / 2);

    const units = tropes.flatMap(t => ctx.songs.filter(d => d.tropes[t.key]).map(d => ({ t, d, school: d.school })));
    const dots = svg.append("g").selectAll("path").data(units).join("path")
        .attr("class", "mark unit-dot")
        .attr("data-school", u => u.d.school)
        .on("click", (e, u) => selectSchool(u.d.school))
        .on("mousemove", (e, u) => showTip(e, `<strong>${escapeHtml(u.d.school)}</strong> · ${u.t.label}<br><span class="tip-sub">${escapeHtml(u.d.song_name)}</span>`))
        .on("mouseleave", hideTip);
    const counts = rows.append("text").attr("class", "value-label").attr("dy", "0.35em");

    function render() {
        tropes.forEach((t, i) => {
            const members = units.filter(u => u.t === t)
                .sort((a, b) => confRank(confOf(a.d)) - confRank(confOf(b.d)) || a.d.school.localeCompare(b.d.school));
            members.forEach((u, j) => { u.x = M.l + j * step + step / 2; u.y = M.t + i * rowH + rowH / 2; });
        });
        dots.attr("d", u => symbolPath(confOf(u.d), 46)) // symbol paths can't be interpolated
            .transition().duration(500)
            .attr("transform", u => `translate(${u.x},${u.y})`)
            .attr("fill", u => confColor[confOf(u.d)]);
        counts.attr("x", t => M.l + units.filter(u => u.t === t).length * step + 10)
            .text(t => { const n = units.filter(u => u.t === t).length; return `${n} · ${Math.round(n / ctx.songs.length * 100)}%`; });
    }
    subscribe((s, changed) => { if (changed.includes("era")) render(); });
    render();
}

/* ---------------- Conference signatures: rate + Wilson CI ---------------- */
function initConfSignatures(ctx) {
    const picker = document.getElementById("trope-picker");
    const desc = document.getElementById("conf-trope-desc");
    let trope = "fight";
    ctx.analysis.tropes.forEach(t => {
        const b = el("button", { type: "button", class: "chip", "data-value": t.key, "aria-pressed": String(t.key === trope) }, t.label);
        b.addEventListener("click", () => { trope = t.key; render(); });
        picker.append(b);
    });

    const W = 560, rowH = 40, M = { t: 24, r: 30, b: 34, l: 120 };
    let svg;

    function render() {
        picker.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === trope)));
        const row = ctx.analysis.trope_stats[state.era].find(r => r.key === trope);
        const confs = CONFS.filter(c => row.by_conf[c]);
        const H = M.t + M.b + rowH * confs.length;
        svg = svgIn("#conf-trope-chart", W, H, `Share of songs using “${row.label}” by conference`);
        const x = d3.scaleLinear().domain([0, 1]).range([M.l, W - M.r]);
        const y = d3.scaleBand().domain(confs).range([M.t, H - M.b]).padding(0.3);

        svg.append("g").attr("class", "grid").attr("transform", `translate(0,${H - M.b})`)
            .call(d3.axisBottom(x).ticks(5, "%").tickSize(-(H - M.t - M.b)))
            .call(g => g.select(".domain").remove());
        svg.append("line").attr("class", "overall-line").attr("x1", x(row.overall)).attr("x2", x(row.overall)).attr("y1", M.t - 10).attr("y2", H - M.b);
        svg.append("text").attr("class", "chart-note").attr("x", x(row.overall)).attr("y", M.t - 12).attr("text-anchor", "middle").text(`all songs ${Math.round(row.overall * 100)}%`);

        const g = svg.append("g").selectAll("g").data(confs).join("g")
            .attr("transform", c => `translate(0,${y(c) + y.bandwidth() / 2})`)
            .on("mousemove", (e, c) => {
                const b = row.by_conf[c];
                showTip(e, `<strong>${c}</strong>: ${b.k} of ${b.n} songs (${Math.round(b.rate * 100)}%)<br><span class="tip-sub">95% interval ${Math.round(b.ci[0] * 100)}–${Math.round(b.ci[1] * 100)}%</span>`);
            })
            .on("mouseleave", hideTip);
        g.append("text").attr("class", "row-label").attr("x", M.l - 28).attr("dy", "0.35em").attr("text-anchor", "end").text(c => c);
        g.append("text").attr("class", "row-sub").attr("x", M.l - 28).attr("dy", "1.6em").attr("text-anchor", "end").text(c => `n = ${row.by_conf[c].n}`);
        g.append("path").attr("transform", `translate(${M.l - 16},0)`).attr("d", c => symbolPath(c, 60)).attr("fill", c => confColor[c]);
        g.append("line").attr("class", "ci-line").attr("x1", c => x(row.by_conf[c].ci[0])).attr("x2", c => x(row.by_conf[c].ci[1])).attr("stroke", c => confColor[c]);
        g.append("circle").attr("r", 7).attr("cx", c => x(row.by_conf[c].rate)).attr("fill", c => confColor[c]).attr("stroke", "#161b22").attr("stroke-width", 2);
        g.append("text").attr("class", "value-label").attr("x", c => x(row.by_conf[c].ci[1]) + 8).attr("dy", "0.35em").text(c => `${Math.round(row.by_conf[c].rate * 100)}%`);

        const sig = row.p < 0.05;
        desc.innerHTML = `Share of each conference's songs that use <strong>${row.label}</strong> (${ERA_LABEL[state.era]} membership). Lines are 95% intervals: wide lines mean few schools.
            Permutation χ² test: <strong>p = ${fmtP(row.p)}</strong> — ${sig
                ? "conferences differ more than chance would suggest, though with eight tropes tested, one hit is expected by luck."
                : "no evidence that conferences differ."}`;
    }
    subscribe((s, changed) => { if (changed.includes("era")) render(); });
    render();
}

/* ---------------- Phi correlation matrix (lower triangle) ---------------- */
function initPhi(ctx) {
    const tropes = ctx.analysis.tropes;
    const keys = tropes.map(t => t.key);
    const label = Object.fromEntries(tropes.map(t => [t.key, t.label]));
    const W = 560, M = { t: 10, r: 10, b: 96, l: 110 };
    const size = (W - M.l - M.r) / keys.length;
    const H = M.t + M.b + size * keys.length;
    const svg = svgIn("#phi-chart", W, H, "Correlation between lyric tropes");
    const color = d3.scaleSequential(divInterpolator).domain([-0.5, 0.5]).clamp(true);
    const cells = ctx.analysis.phi.filter(c => keys.indexOf(c.a) > keys.indexOf(c.b));

    svg.append("g").selectAll("g").data(cells).join("g")
        .attr("transform", c => `translate(${M.l + keys.indexOf(c.b) * size},${M.t + keys.indexOf(c.a) * size})`)
        .call(g => {
            g.append("rect").attr("class", "phi-cell").attr("width", size - 2).attr("height", size - 2).attr("rx", 3).attr("fill", c => color(c.phi));
            g.append("text").attr("class", "phi-text").attr("x", size / 2 - 1).attr("y", size / 2).attr("dy", "0.35em")
                .attr("text-anchor", "middle").text(c => d3.format("+.2f")(c.phi).replace(/^([+−-])0/, "$1"));
        })
        .on("mousemove", (e, c) => showTip(e, `<strong>${label[c.a]} + ${label[c.b]}</strong><br>together in ${c.count} songs (chance: ${c.expected.toFixed(1)})<br><span class="tip-sub">φ = ${c.phi.toFixed(2)}</span>`))
        .on("mouseleave", hideTip);

    svg.append("g").selectAll("text").data(keys.slice(1)).join("text").attr("class", "row-label")
        .attr("x", M.l - 8).attr("y", (k, i) => M.t + (i + 1) * size + size / 2).attr("dy", "0.35em").attr("text-anchor", "end").text(k => label[k]);
    svg.append("g").selectAll("text").data(keys.slice(0, -1)).join("text").attr("class", "row-label")
        .attr("transform", (k, i) => `translate(${M.l + i * size + size / 2},${M.t + keys.length * size + 8}) rotate(-40)`)
        .attr("text-anchor", "end").text(k => label[k]);
}

/* ---------------- Fightiest: isotype footballs ---------------- */
function initFightiest(ctx) {
    const sorted = [...ctx.songs].sort((a, b) => b.number_fights - a.number_fights);
    const cutoff = sorted[9].number_fights;
    const top = sorted.filter(d => d.number_fights >= cutoff);
    const max = top[0].number_fights;
    const W = 560, rowH = 26, M = { t: 8, r: 40, b: 8, l: 130 };
    const H = M.t + M.b + rowH * top.length;
    const icon = Math.min(20, (W - M.l - M.r) / max);
    const svg = svgIn("#fightiest-chart", W, H, "Schools whose fight songs say “fight” the most");

    const rows = svg.selectAll("g").data(top).join("g")
        .attr("class", "mark fight-row").attr("data-school", d => d.school)
        .attr("transform", (d, i) => `translate(0,${M.t + i * rowH + rowH / 2})`)
        .on("click", (e, d) => selectSchool(d.school))
        .on("mousemove", (e, d) => showTip(e, `<strong>${escapeHtml(d.school)}</strong><br>${escapeHtml(d.song_name)}<br><span class="tip-sub">“fight” × ${d.number_fights}</span>`))
        .on("mouseleave", hideTip);
    a11yMark(rows, "", (e, d) => selectSchool(d.school));
    rows.attr("aria-label", d => `${d.school}: ${d.number_fights} fights`);
    rows.append("rect").attr("class", "hit").attr("x", 0).attr("y", -rowH / 2).attr("width", W).attr("height", rowH);
    rows.append("text").attr("class", "row-label").attr("x", M.l - 12).attr("dy", "0.35em").attr("text-anchor", "end").text(d => d.school);
    rows.each(function (d) {
        const g = d3.select(this).append("g").attr("class", "footballs");
        d3.range(d.number_fights).forEach(i => {
            const fx = M.l + i * icon + icon / 2;
            const ball = g.append("g").attr("transform", `translate(${fx},0) rotate(-30)`);
            ball.append("ellipse").attr("rx", icon * 0.42).attr("ry", icon * 0.26).attr("class", "ball");
            ball.append("line").attr("x1", -icon * 0.14).attr("x2", icon * 0.14).attr("class", "lace");
        });
    });
    rows.append("text").attr("class", "value-label").attr("x", d => M.l + d.number_fights * icon + 8).attr("dy", "0.35em").text(d => d.number_fights);
    const update = () => rows.selectAll(".ball").attr("fill", function () { return confColor[confOf(d3.select(this.parentNode.parentNode.parentNode).datum())]; });
    subscribe((s, changed) => { if (changed.includes("era")) update(); });
    update();
}

/* ---------------- Waffle: student authorship ---------------- */
function initStudentWaffle(ctx) {
    const order = { Yes: 0, No: 1, Unknown: 2 };
    const songs = [...ctx.songs].sort((a, b) => order[a.student_writer] - order[b.student_writer] || a.school.localeCompare(b.school));
    const cols = 13, cell = 30, gap = 4;
    const rowsN = Math.ceil(songs.length / cols);
    const W = cols * (cell + gap) + 170, H = rowsN * (cell + gap) + 8;
    const svg = svgIn("#student-chart", W, H, "Waffle chart of student-written fight songs");
    const sq = svg.append("g").attr("transform", "translate(4,4)").selectAll("rect").data(songs).join("rect")
        .attr("class", "mark waffle-cell").attr("data-school", d => d.school)
        .attr("x", (d, i) => (i % cols) * (cell + gap)).attr("y", (d, i) => Math.floor(i / cols) * (cell + gap))
        .attr("width", cell).attr("height", cell).attr("rx", 4)
        .attr("fill", d => studentColor[d.student_writer])
        .on("click", (e, d) => selectSchool(d.school))
        .on("mousemove", (e, d) => showTip(e, `<strong>${escapeHtml(d.school)}</strong><br>${escapeHtml(d.writers)}<br><span class="tip-sub">${studentLabel[d.student_writer]} writer</span>`))
        .on("mouseleave", hideTip);
    a11yMark(sq, "", (e, d) => selectSchool(d.school));
    sq.attr("aria-label", d => `${d.school}: ${studentLabel[d.student_writer]} writer`);

    const lx = cols * (cell + gap) + 16;
    const counts = d3.rollup(songs, v => v.length, d => d.student_writer);
    const leg = svg.append("g").attr("transform", `translate(${lx},14)`);
    ["Yes", "No", "Unknown"].forEach((k, i) => {
        const g = leg.append("g").attr("transform", `translate(0,${i * 44})`);
        g.append("rect").attr("width", 14).attr("height", 14).attr("rx", 3).attr("fill", studentColor[k]);
        g.append("text").attr("class", "legend-big").attr("x", 22).attr("y", 12).text(`${counts.get(k) || 0}`);
        g.append("text").attr("class", "row-sub").attr("x", 22).attr("y", 28).text(`${studentLabel[k]} · ${Math.round((counts.get(k) || 0) / songs.length * 100)}%`);
    });
}

/* ---------------- Archetype galaxy (MDS) ---------------- */
function initGalaxy(ctx) {
    const W = 620, H = 440, pad = 34;
    const svg = svgIn("#galaxy-chart", W, H, "Map of musical similarity between fight songs");
    const x = d3.scaleLinear().domain(d3.extent(ctx.songs, d => d.mds[0])).range([pad, W - pad]);
    const y = d3.scaleLinear().domain(d3.extent(ctx.songs, d => d.mds[1])).range([H - pad, pad]);

    const dots = svg.append("g").selectAll("circle").data(ctx.songs).join("circle")
        .attr("class", "mark galaxy-dot").attr("data-school", d => d.school)
        .attr("cx", d => x(d.mds[0])).attr("cy", d => y(d.mds[1])).attr("r", 6.5)
        .attr("fill", d => archetypeColor[d.archetype])
        .on("click", (e, d) => selectSchool(d.school))
        .on("mousemove", (e, d) => showTip(e, `<strong>${escapeHtml(d.school)}</strong><br>${escapeHtml(d.song_name)}<br><span class="tip-sub">${d.archetype}</span>`))
        .on("mouseleave", hideTip);
    a11yMark(dots, "", (e, d) => selectSchool(d.school));
    dots.attr("aria-label", d => `${d.school}: ${d.archetype}`);

    // direct labels at each archetype's centroid
    const groups = d3.groups(ctx.songs, d => d.archetype);
    svg.append("g").selectAll("text").data(groups).join("text").attr("class", "galaxy-label")
        .attr("x", ([, g]) => x(d3.mean(g, d => d.mds[0]))).attr("y", ([, g]) => y(d3.mean(g, d => d.mds[1])) - 14)
        .attr("text-anchor", "middle").text(([k]) => k);

    const cards = d3.select("#archetype-cards");
    const tropes = ctx.analysis.tropes;
    ctx.analysis.archetypes.forEach(a => {
        const card = cards.append("div").attr("class", "archetype-card").attr("tabindex", 0)
            .style("--arch", archetypeColor[a.name])
            .on("mouseenter focus", () => dots.classed("is-faded", d => d.archetype !== a.name))
            .on("mouseleave blur", () => dots.classed("is-faded", false));
        card.append("div").attr("class", "archetype-name").html(`${a.name} <span class="legend-n">${a.n}</span>`);
        card.append("p").attr("class", "archetype-blurb").text(a.blurb);
        card.append("div").attr("class", "archetype-stats").text(`~${Math.round(a.bpm_folded)} BPM · ${Math.round(a.year)} avg · ${a.trope_count.toFixed(1)} tropes`);
        const bars = card.append("div").attr("class", "mini-bars");
        tropes.forEach(t => bars.append("div").attr("class", "mini-bar").attr("title", `${t.label}: ${Math.round(a.tropes[t.key] * 100)}%`)
            .html(`<span style="height:${Math.max(2, a.tropes[t.key] * 100)}%"></span><em>${SHORT[t.key]}</em>`));
    });
}
