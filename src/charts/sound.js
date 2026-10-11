// Halftime: tempo (raw vs folded), song length, tempo × length, and "tap the tempo".
import { state, setState, subscribe, confOf, bpmOf, selectSchool } from "../state.js";
import { confColor, symbolPath } from "../theme.js";
import { svgIn, showTip, hideTip, a11yMark, segmented, reducedMotion, escapeHtml } from "../ui.js";
import { tick } from "../audio.js";

function swarm(values, x, cy, r) {
    const nodes = values.map(v => ({ v, x: x(v.val), y: cy }));
    const sim = d3.forceSimulation(nodes)
        .force("x", d3.forceX(n => x(n.v.val)).strength(1))
        .force("y", d3.forceY(cy).strength(0.07))
        .force("collide", d3.forceCollide(r)).stop();
    for (let i = 0; i < 220; i++) sim.tick();
    return new Map(nodes.map(n => [n.v.d.school, [n.x, n.y]]));
}

function kde(values, xs, bw) {
    return xs.map(x => [x, d3.mean(values, v => {
        const u = (x - v) / bw;
        return Math.abs(u) <= 1 ? 0.75 * (1 - u * u) / bw : 0;
    })]);
}

function markDots(sel) {
    sel.attr("class", "mark swarm-dot")
        .attr("data-school", d => d.school)
        .on("click", (e, d) => selectSchool(d.school))
        .on("mouseleave", hideTip);
    a11yMark(sel, "", (e, d) => selectSchool(d.school));
    return sel;
}

export function initSound(ctx) {
    initTempo(ctx);
    initDuration(ctx);
    initScatter(ctx);
    initTapTempo(ctx);
}

/* ---------------- Tempo ---------------- */
function initTempo(ctx) {
    const W = 960, H = 330, M = { t: 16, r: 24, b: 34, l: 24 };
    const kdeH = 90;
    const svg = svgIn("#tempo-chart", W, H, "Tempo of each fight song, raw or folded");
    const x = d3.scaleLinear().domain([55, 190]).range([M.l, W - M.r]);
    const cy = kdeH + (H - M.b - kdeH) / 2 + 6;

    const layouts = {
        raw: swarm(ctx.songs.map(d => ({ d, val: d.bpm })), x, cy, 7.2),
        folded: swarm(ctx.songs.map(d => ({ d, val: d.bpm_folded })), x, cy, 7.2)
    };
    const xs = d3.range(55, 191, 1);
    const dens = {
        raw: kde(ctx.songs.map(d => d.bpm), xs, 9),
        folded: kde(ctx.songs.map(d => d.bpm_folded), xs, 9)
    };
    const yK = d3.scaleLinear().domain([0, d3.max([...dens.raw, ...dens.folded], p => p[1])]).range([kdeH, M.t]);
    const area = d3.area().curve(d3.curveBasis).x(p => x(p[0])).y0(kdeH).y1(p => yK(p[1]));

    // half-time band
    const band = svg.append("g").attr("class", "halftime-band");
    band.append("rect").attr("x", x(62)).attr("width", x(92) - x(62)).attr("y", M.t).attr("height", H - M.b - M.t);
    band.append("text").attr("x", x(77)).attr("y", M.t + 12).attr("text-anchor", "middle").text("“half-time” cluster");

    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`).call(d3.axisBottom(x).ticks(10));
    svg.append("text").attr("class", "axis-title").attr("x", W - M.r).attr("y", H - 4).attr("text-anchor", "end").text("Beats per minute →");
    const kPath = svg.append("path").attr("class", "kde");

    const dots = markDots(svg.append("g").selectAll("path").data(ctx.songs).join("path"))
        .on("mousemove", (e, d) => showTip(e, `<strong>${escapeHtml(d.school)}</strong><br>${escapeHtml(d.song_name)}<br>
            <span class="tip-sub">${d.bpm} BPM${d.folded ? ` → folded ${d.bpm_folded}` : ""}</span>`));

    // annotations: the slowest and fastest songs
    const slow = ctx.songs.reduce((a, b) => a.bpm < b.bpm ? a : b);
    const fast = ctx.songs.reduce((a, b) => a.bpm > b.bpm ? a : b);
    const ann = svg.append("g").attr("class", "annotation");

    const setMode = segmented("#tempo-toggle", v => setState({ tempo: v }));

    function render(animate) {
        const mode = state.tempo;
        const L = layouts[mode];
        const t = d3.transition().duration(animate && !reducedMotion() ? 900 : 0).ease(d3.easeCubicInOut);
        dots.attr("d", d => symbolPath(confOf(d), 85)).attr("fill", d => confColor[confOf(d)])
            .attr("aria-label", d => `${d.school}: ${bpmOf(d)} BPM`)
            .transition(t).attr("transform", d => `translate(${L.get(d.school)})`);
        kPath.datum(dens[mode]).transition(t).attr("d", area);
        band.transition(t).style("opacity", mode === "raw" ? 1 : 0);
        setMode(mode);

        ann.selectAll("*").remove();
        [[slow, "start", 0], [fast, "end", 0]].forEach(([d, anchor]) => {
            const [px, py] = L.get(d.school);
            const label = mode === "folded" && d.folded ? `${d.school}: ${d.bpm} → ${d.bpm_folded}` : `${d.school}: ${d.bpm}`;
            ann.append("path").attr("d", `M${px},${py + 9}V${H - M.b - 6}`);
            ann.append("text").attr("x", px + (anchor === "start" ? 4 : -4)).attr("y", H - M.b - 10)
                .attr("text-anchor", anchor).text(label);
        });
    }
    subscribe((s, changed) => {
        if (changed.includes("tempo")) render(true);
        else if (changed.includes("era")) render(false);
    });
    render(false);

    document.addEventListener("tapmatch", e => {
        const set = new Set(e.detail);
        dots.classed("is-match", d => set.has(d.school));
    });
}

/* ---------------- Duration ---------------- */
function initDuration(ctx) {
    const W = 560, H = 230, M = { t: 16, r: 20, b: 34, l: 20 };
    const svg = svgIn("#duration-chart", W, H, "Length of each fight song in seconds");
    const x = d3.scaleLinear().domain([0, d3.max(ctx.songs, d => d.sec_duration) * 1.05]).nice().range([M.l, W - M.r]);
    const cy = (H - M.b + M.t) / 2;
    const L = swarm(ctx.songs.map(d => ({ d, val: d.sec_duration })), x, cy, 6.4);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`).call(d3.axisBottom(x).ticks(6));
    svg.append("text").attr("class", "axis-title").attr("x", W - M.r).attr("y", H - 4).attr("text-anchor", "end").text("Seconds →");

    const dots = markDots(svg.append("g").selectAll("path").data(ctx.songs).join("path"))
        .attr("transform", d => `translate(${L.get(d.school)})`)
        .on("mousemove", (e, d) => showTip(e, `<strong>${escapeHtml(d.school)}</strong><br>${escapeHtml(d.song_name)}<br><span class="tip-sub">${d.sec_duration} seconds</span>`));

    const longest = ctx.songs.reduce((a, b) => a.sec_duration > b.sec_duration ? a : b);
    const [lx, ly] = L.get(longest.school);
    const ann = svg.append("g").attr("class", "annotation");
    ann.append("path").attr("d", `M${lx},${ly - 8}V${M.t + 10}`);
    ann.append("text").attr("x", lx - 4).attr("y", M.t + 6).attr("text-anchor", "end").text(`${longest.song_name}, ${longest.sec_duration}s`);

    const render = () => dots.attr("d", d => symbolPath(confOf(d), 70)).attr("fill", d => confColor[confOf(d)]);
    subscribe((s, changed) => { if (changed.includes("era")) render(); });
    render();
}

/* ---------------- Scatter ---------------- */
function initScatter(ctx) {
    const W = 560, H = 310, M = { t: 30, r: 20, b: 40, l: 46 };
    const svg = svgIn("#scatter-chart", W, H, "Tempo versus song length");
    const x = d3.scaleLinear().domain(d3.extent(ctx.songs, d => d.sec_duration)).nice().range([M.l, W - M.r]);
    const y = d3.scaleLinear().range([H - M.b, M.t]);
    const gx = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`).call(d3.axisBottom(x).ticks(6));
    const gy = svg.append("g").attr("class", "grid").attr("transform", `translate(${M.l},0)`);
    svg.append("text").attr("class", "axis-title").attr("x", W - M.r).attr("y", H - 6).attr("text-anchor", "end").text("Length (seconds) →");
    const yTitle = svg.append("text").attr("class", "axis-title").attr("x", 4).attr("y", M.t - 16);
    const quad = svg.append("g").attr("class", "quadrants");
    const dots = markDots(svg.append("g").selectAll("path").data(ctx.songs).join("path"))
        .on("mousemove", (e, d) => showTip(e, `<strong>${escapeHtml(d.school)}</strong><br>${bpmOf(d)} BPM · ${d.sec_duration}s`));

    function render(animate) {
        y.domain(d3.extent(ctx.songs, bpmOf)).nice();
        const t = d3.transition().duration(animate && !reducedMotion() ? 800 : 0);
        gy.transition(t).call(d3.axisLeft(y).ticks(5).tickSize(-(W - M.l - M.r))).on("end", () => gy.select(".domain").remove());
        gy.select(".domain").remove();
        yTitle.text(state.tempo === "folded" ? "↑ Folded BPM" : "↑ BPM");
        dots.attr("d", d => symbolPath(confOf(d), 70)).attr("fill", d => confColor[confOf(d)])
            .transition(t).attr("transform", d => `translate(${x(d.sec_duration)},${y(bpmOf(d))})`);

        const mx = d3.median(ctx.songs, d => d.sec_duration), my = d3.median(ctx.songs, bpmOf);
        quad.selectAll("*").remove();
        quad.append("line").attr("x1", x(mx)).attr("x2", x(mx)).attr("y1", M.t).attr("y2", H - M.b);
        quad.append("line").attr("x1", M.l).attr("x2", W - M.r).attr("y1", y(my)).attr("y2", y(my));
        const lab = (tx, ty, text, anchor) => quad.append("text").attr("x", tx).attr("y", ty).attr("text-anchor", anchor).text(text);
        lab(M.l + 8, M.t + 16, "SPRINT · fast & short", "start");
        lab(W - M.r - 6, M.t + 16, "MARATHON · fast & long", "end");
        lab(M.l + 8, H - M.b - 8, "STROLL · slow & short", "start");
        lab(W - M.r - 6, H - M.b - 8, "SLOW BURN · slow & long", "end");
    }
    subscribe((s, changed) => {
        if (changed.includes("tempo")) render(true);
        else if (changed.includes("era")) render(false);
    });
    render(false);
}

/* ---------------- Tap the tempo ---------------- */
function initTapTempo(ctx) {
    const pad = document.getElementById("tap-pad");
    const bpmEl = document.querySelector("#tap-readout .tap-bpm");
    const list = document.getElementById("tap-matches");
    let taps = [];

    function onTap() {
        const now = performance.now();
        if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
        taps.push(now);
        taps = taps.slice(-9);
        tick(taps.length % 4 === 1 ? 1320 : 880);
        pad.classList.remove("is-hit");
        void pad.offsetWidth;
        pad.classList.add("is-hit");
        if (taps.length < 3) { bpmEl.textContent = "…"; return; }
        const intervals = d3.pairs(taps, (a, b) => b - a);
        const bpm = Math.round(60000 / d3.median(intervals));
        bpmEl.textContent = bpm;
        const target = bpm < 100 ? bpm * 2 : bpm;
        const matches = [...ctx.songs].sort((a, b) => Math.abs(a.bpm_folded - target) - Math.abs(b.bpm_folded - target)).slice(0, 5);
        list.innerHTML = "";
        matches.forEach(d => {
            const li = document.createElement("li");
            const b = document.createElement("button");
            b.type = "button";
            b.className = "match-btn";
            b.innerHTML = `<span class="match-school">${escapeHtml(d.school)}</span>
                <span class="match-song">${escapeHtml(d.song_name)}</span>
                <span class="match-bpm">${d.bpm}${d.folded ? ` (${d.bpm_folded})` : ""} BPM</span>`;
            b.addEventListener("click", () => setState({ selected: d.school }));
            li.append(b);
            list.append(li);
        });
        document.dispatchEvent(new CustomEvent("tapmatch", { detail: matches.map(d => d.school) }));
    }
    pad.addEventListener("pointerdown", e => { e.preventDefault(); onTap(); });
    pad.addEventListener("keydown", e => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) onTap(); }
    });
}
