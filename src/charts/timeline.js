// Q2: when songs were written — beeswarm timeline, cumulative count, and an animated map.
import { state, subscribe, confOf, selectSchool } from "../state.js";
import { confColor, symbolPath, ACCENT } from "../theme.js";
import { usProjection, drawBasemap } from "../geo.js";
import { svgIn, showTip, hideTip, a11yMark, reducedMotion, escapeHtml } from "../ui.js";

const YEARS = [1888, 1972];
const GOLDEN = [1905, 1925];

export function initTimeline(ctx) {
    const dated = ctx.songs.filter(d => d.year);
    document.querySelectorAll('[data-k="years.unknown"]').forEach(n => n.textContent = ctx.songs.length - dated.length);

    // ---------- beeswarm ----------
    const W = 760, H = 250, M = { t: 30, r: 20, b: 30, l: 44 };
    const svg = svgIn("#timeline-chart", W, H, "Beeswarm of the year each fight song was written");
    const x = d3.scaleLinear().domain(YEARS).range([M.l, W - M.r]);
    const cy = (H - M.b + M.t) / 2;

    svg.append("rect").attr("class", "golden-band")
        .attr("x", x(GOLDEN[0])).attr("width", x(GOLDEN[1]) - x(GOLDEN[0]))
        .attr("y", M.t - 18).attr("height", H - M.b - M.t + 18);
    svg.append("text").attr("class", "band-label").attr("x", x(GOLDEN[0]) + 6).attr("y", H - M.b - 8).text("Golden age 1905–1925");

    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`)
        .call(d3.axisBottom(x).ticks(9).tickFormat(d3.format("d")));

    const nodes = dated.map(d => ({ d, x: x(d.year), y: cy }));
    const sim = d3.forceSimulation(nodes)
        .force("x", d3.forceX(n => x(n.d.year)).strength(1))
        .force("y", d3.forceY(cy).strength(0.08))
        .force("collide", d3.forceCollide(6.6)).stop();
    for (let i = 0; i < 200; i++) sim.tick();

    const dots = svg.append("g").selectAll("path").data(nodes).join("path")
        .attr("class", "mark swarm-dot")
        .attr("data-school", n => n.d.school)
        .attr("transform", n => `translate(${n.x},${n.y})`)
        .on("click", (e, n) => selectSchool(n.d.school))
        .on("mousemove", (e, n) => showTip(e, `<strong>${n.d.year}</strong> · ${escapeHtml(n.d.school)}<br>${escapeHtml(n.d.song_name)}`))
        .on("mouseleave", hideTip);
    a11yMark(dots, "", (e, n) => selectSchool(n.d.school));
    dots.attr("aria-label", n => `${n.d.school}, written ${n.d.year}`);

    // annotate the oldest song
    const oldest = nodes.reduce((a, b) => a.d.year <= b.d.year ? a : b);
    const ann = svg.append("g").attr("class", "annotation");
    ann.append("path").attr("d", `M${oldest.x},${oldest.y - 9}V${M.t + 6}`);
    ann.append("text").attr("x", oldest.x + 4).attr("y", M.t + 2)
        .text(`${oldest.d.year}: ${oldest.d.song_name} (${oldest.d.school})`);

    // ---------- cumulative ----------
    const CW = 760, CH = 130, CM = { t: 12, r: 20, b: 26, l: 44 };
    const csvg = svgIn("#cumulative-chart", CW, CH, "Cumulative number of fight songs written by year");
    const cx = d3.scaleLinear().domain(YEARS).range([CM.l, CW - CM.r]);
    const years = d3.range(YEARS[0], YEARS[1] + 1);
    const cum = years.map(yr => ({ yr, n: dated.filter(d => d.year <= yr).length }));
    const cyS = d3.scaleLinear().domain([0, dated.length]).range([CH - CM.b, CM.t]);
    csvg.append("rect").attr("class", "golden-band").attr("x", cx(GOLDEN[0])).attr("width", cx(GOLDEN[1]) - cx(GOLDEN[0]))
        .attr("y", CM.t).attr("height", CH - CM.t - CM.b);
    csvg.append("g").attr("class", "grid").attr("transform", `translate(${CM.l},0)`)
        .call(d3.axisLeft(cyS).ticks(3).tickSize(-(CW - CM.l - CM.r)))
        .call(g => g.select(".domain").remove());
    csvg.append("path").datum(cum).attr("class", "cum-area")
        .attr("d", d3.area().curve(d3.curveStepAfter).x(p => cx(p.yr)).y0(cyS(0)).y1(p => cyS(p.n)));
    csvg.append("path").datum(cum).attr("class", "cum-line")
        .attr("d", d3.line().curve(d3.curveStepAfter).x(p => cx(p.yr)).y(p => cyS(p.n)));
    const inGolden = dated.filter(d => d.year >= GOLDEN[0] && d.year <= GOLDEN[1]).length;
    csvg.append("text").attr("class", "chart-note").attr("x", cx(GOLDEN[1]) + 8).attr("y", cyS(cum.find(p => p.yr === GOLDEN[1]).n) + 16)
        .text(`${inGolden} of ${dated.length} songs (${Math.round(inGolden / dated.length * 100)}%) were written in these 21 years`);
    csvg.append("text").attr("class", "axis-title").attr("x", CM.l + 4).attr("y", CM.t + 10).text("Songs written so far");
    const cursor = csvg.append("line").attr("class", "year-cursor").attr("y1", CM.t).attr("y2", CH - CM.b);

    function render() {
        dots.attr("d", n => symbolPath(confOf(n.d), 80)).attr("fill", n => confColor[confOf(n.d)]);
    }
    subscribe((s, changed) => { if (changed.includes("era")) render(); });
    render();

    initTimeMap(ctx, dated, year => {
        dots.classed("is-future", n => n.d.year > year);
        cursor.attr("x1", cx(year)).attr("x2", cx(year)).style("display", year >= YEARS[1] - 2 ? "none" : null);
    });
}

function initTimeMap(ctx, dated, onYear) {
    const W = 760, H = 470;
    const svg = svgIn("#time-map", W, H, "Map of fight songs appearing by year written");
    const projection = usProjection(ctx.nation, W, H, 10);
    const path = d3.geoPath(projection);
    drawBasemap(svg.append("g"), ctx, path);

    const gTrail = svg.append("g").attr("class", "trail");
    const gRip = svg.append("g");
    const pts = svg.append("g").selectAll("path").data(dated).join("path")
        .attr("class", "mark time-pt")
        .attr("data-school", d => d.school)
        .attr("transform", d => `translate(${projection([d.lon, d.lat])})`)
        .on("click", (e, d) => selectSchool(d.school))
        .on("mousemove", (e, d) => showTip(e, `<strong>${escapeHtml(d.school)}</strong><br>${d.year} · ${escapeHtml(d.song_name)}`))
        .on("mouseleave", hideTip);

    const decades = ctx.analysis.decades;

    const slider = document.getElementById("time-slider");
    const readout = document.getElementById("time-year");
    const playBtn = document.getElementById("time-play");
    let shown = new Set(dated.map(d => d.school));

    function setYear(year, animate) {
        slider.value = year;
        readout.textContent = year;
        const visible = new Set(dated.filter(d => d.year <= year).map(d => d.school));
        pts.attr("d", d => symbolPath(confOf(d), 80)).attr("fill", d => confColor[confOf(d)])
            .classed("is-hidden", d => !visible.has(d.school));
        if (animate && !reducedMotion()) {
            dated.filter(d => visible.has(d.school) && !shown.has(d.school)).forEach(d => {
                const [px, py] = projection([d.lon, d.lat]);
                gRip.append("circle").attr("class", "ripple").attr("cx", px).attr("cy", py).attr("r", 4)
                    .attr("stroke", confColor[confOf(d)])
                    .transition().duration(1100).ease(d3.easeCubicOut).attr("r", 30).attr("opacity", 0).remove();
            });
        }
        shown = visible;

        // centre-of-gravity trail for all songs written up to each completed decade
        const trail = decades.filter(dc => dc.cum_center && dc.decade <= year).map(dc => ({ ...dc, p: projection(dc.cum_center) })).filter(dc => dc.p);
        gTrail.selectAll("path").data([trail]).join("path").attr("class", "trail-line")
            .attr("d", d3.line().curve(d3.curveCatmullRom).x(dc => dc.p[0]).y(dc => dc.p[1]));
        const tp = gTrail.selectAll("g").data(trail, dc => dc.decade).join(enter => {
            const g = enter.append("g").attr("class", "trail-pt");
            g.append("circle").attr("r", 4.5);
            g.append("text").attr("dx", 7).attr("dy", -6);
            return g;
        });
        tp.attr("transform", dc => `translate(${dc.p})`);
        tp.select("text").text((dc, i) => (i === 0 || i === trail.length - 1) ? `${dc.decade}s` : "");
        onYear(year);
    }

    let timer = null;
    function stop() { timer?.stop(); timer = null; playBtn.textContent = "▶ Play"; }
    function play() {
        if (+slider.value >= 1970) setYear(1890, false);
        const start = +slider.value;
        const t0 = d3.now();
        playBtn.textContent = "❚❚ Pause";
        timer = d3.timer(() => {
            const yr = Math.min(1970, Math.round(start + (d3.now() - t0) / 110));
            if (yr !== +slider.value) setYear(yr, true);
            if (yr >= 1970) stop();
        });
    }
    playBtn.addEventListener("click", () => timer ? stop() : play());
    slider.addEventListener("input", () => { stop(); setYear(+slider.value, true); });
    subscribe((s, changed) => { if (changed.includes("era")) setYear(+slider.value, false); });
    setYear(1970, false);
}
