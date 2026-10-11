// Entry point: load data, build shared context, initialise every module, wire global behaviour.
import { state, setState, subscribe, passesFilter } from "./state.js";
import { fmtKm, fmtP } from "./theme.js";
import { reducedMotion } from "./ui.js";
import { initMainMap } from "./maps/mainMap.js";
import { initScrolly } from "./scrolly.js";
import { initRealignChart, initMoranCards } from "./charts/geoStats.js";
import { initTimeline } from "./charts/timeline.js";
import { initSound } from "./charts/sound.js";
import { initWords } from "./charts/words.js";
import { initRivalry } from "./charts/rivalry.js";
import { initGeoGuess } from "./games/geoGuess.js";
import { initCard } from "./card.js";

const US_ATLAS = "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json";

async function load() {
    const [us, songs, analysis] = await Promise.all([
        d3.json(US_ATLAS),
        d3.json("data/processed/songs.json"),
        d3.json("data/processed/analysis.json")
    ]);
    const states = topojson.feature(us, us.objects.states);
    return {
        us, songs, analysis,
        states,
        nation: topojson.feature(us, us.objects.nation),
        stateMesh: topojson.mesh(us, us.objects.states, (a, b) => a !== b),
        rivalries: analysis.rivalries,
        bySchool: new Map(songs.map(d => [d.school, d]))
    };
}

function bindNumbers(ctx) {
    const a = ctx.analysis;
    const values = {
        "tempo.n_folded": a.tempo.n_folded,
        "tempo.bc_raw": a.tempo.bc_raw.toFixed(2),
        "tempo.bc_folded": a.tempo.bc_folded.toFixed(2),
        "rivals.km": fmtKm(a.rivalry_test.mean_km_rivals),
        "rivals.allkm": fmtKm(a.rivalry_test.mean_km_all),
        "rivals.p": fmtP(a.rivalry_test.p_more_similar),
        "pairs.n": d3.format(",")(a.pairs.length),
        "mantel.r": d3.format("+.2f")(a.mantel.r),
        "mantel.p": fmtP(a.mantel.p)
    };
    for (const era of ["2019", "2024"]) {
        for (const [conf, v] of Object.entries(a.dispersion[era])) values[`disp.${era}.${conf}`] = fmtKm(v.mean_pair_km);
    }
    document.querySelectorAll("[data-k]").forEach(n => {
        if (values[n.dataset.k] !== undefined) n.textContent = values[n.dataset.k];
    });
}

function initScoreboard(ctx) {
    const dated = ctx.songs.filter(d => d.year);
    const known = ctx.songs.filter(d => d.student_writer !== "Unknown");
    const items = [
        { n: ctx.songs.length, label: "fight songs" },
        { n: d3.min(dated, d => d.year), label: "oldest song", plain: true },
        { n: d3.max(ctx.songs, d => d.bpm), label: "top BPM" },
        { n: Math.round(known.filter(d => d.student_writer === "Yes").length / known.length * 100), label: "% by students" },
        { n: ctx.rivalries.length, label: "rivalries" }
    ];
    const board = d3.select("#scoreboard");
    const cells = board.selectAll("div").data(items).join("div").attr("class", "score-cell");
    const num = cells.append("span").attr("class", "score-num");
    cells.append("span").attr("class", "score-label").text(d => d.label);
    if (reducedMotion()) { num.text(d => d.n); return; }
    num.transition().delay((d, i) => 300 + i * 120).duration(1200).ease(d3.easeCubicOut)
        .textTween(d => {
            const from = d.plain ? d.n - 60 : 0;
            const i = d3.interpolateRound(from, d.n);
            return t => i(t);
        });
}

function initSearch(ctx) {
    const input = document.getElementById("school-search");
    const list = document.getElementById("school-list");
    const names = ctx.songs.map(d => d.school).sort();
    list.innerHTML = names.map(n => `<option value="${n}"></option>`).join("");
    const pick = () => {
        const q = input.value.trim().toLowerCase();
        if (!q) return;
        const hit = names.find(n => n.toLowerCase() === q) || names.find(n => n.toLowerCase().startsWith(q)) || names.find(n => n.toLowerCase().includes(q));
        if (hit) { setState({ selected: hit }); input.value = ""; input.blur(); }
    };
    input.addEventListener("change", pick);
    input.addEventListener("keydown", e => { if (e.key === "Enter") pick(); });
}

function initNav() {
    document.querySelectorAll("[data-nav]").forEach(a => a.addEventListener("click", e => {
        const target = document.querySelector(a.getAttribute("href"));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
    }));

    const ball = document.querySelector(".yardline-ball");
    const onScroll = () => {
        const max = document.documentElement.scrollHeight - innerHeight;
        ball.style.left = `${Math.min(1, Math.max(0, scrollY / max)) * 100}%`;
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const links = new Map([...document.querySelectorAll(".dash-nav-link")].map(a => [a.getAttribute("href").slice(1), a]));
    const io = new IntersectionObserver(entries => entries.forEach(en => {
        if (en.isIntersecting) links.forEach((a, id) => a.classList.toggle("is-current", id === en.target.id));
    }), { rootMargin: "-40% 0px -55% 0px" });
    document.querySelectorAll(".chapter").forEach(c => io.observe(c));
}

/** Keep ?school / ?rivalry in the URL hash so any view can be shared. */
function initHash(ctx) {
    const params = new URLSearchParams(location.hash.slice(1));
    const school = params.get("school");
    const rivalry = params.get("rivalry");
    const patch = {};
    if (school && ctx.bySchool.has(school)) patch.selected = school;
    if (rivalry) {
        const i = ctx.rivalries.findIndex(r => r.name === rivalry);
        if (i >= 0) patch.rivalry = i;
    }
    if (Object.keys(patch).length) setState(patch);
    if (patch.rivalry !== undefined) setTimeout(() => document.getElementById("q4").scrollIntoView(), 300);

    subscribe((s, changed) => {
        if (!changed.includes("selected") && !changed.includes("rivalry")) return;
        const p = new URLSearchParams();
        if (s.selected) p.set("school", s.selected);
        if (changed.includes("rivalry") || params.has("rivalry")) p.set("rivalry", ctx.rivalries[s.rivalry].name);
        history.replaceState(null, "", p.toString() ? `#${p}` : location.pathname + location.search);
    });
}

/** Linked highlighting: every mark tagged with data-school responds to selection and filters. */
function initLinking(ctx) {
    function apply(s) {
        const sel = s.selected;
        document.querySelectorAll(".mark[data-school]").forEach(node => {
            const school = node.getAttribute("data-school");
            const song = ctx.bySchool.get(school);
            node.classList.toggle("is-selected", school === sel);
            node.classList.toggle("is-dim", !!sel && school !== sel);
            node.classList.toggle("is-out", !passesFilter(song));
        });
    }
    subscribe((s, changed) => {
        if (changed.some(k => ["selected", "confFilter", "era"].includes(k))) apply(s);
    });
    apply(state);
}

load().then(ctx => {
    window.__fightSongs = ctx; // handy for debugging in the console
    bindNumbers(ctx);
    initScoreboard(ctx);
    initSearch(ctx);
    initNav();

    initMainMap(ctx);
    initRealignChart(ctx);
    initMoranCards(ctx);
    initTimeline(ctx);
    initSound(ctx);
    initWords(ctx);
    initRivalry(ctx);
    initGeoGuess(ctx);
    initCard(ctx);

    initLinking(ctx);
    initHash(ctx);
    initScrolly();
    document.body.classList.add("is-ready");
}).catch(err => {
    console.error(err);
    const msg = document.createElement("div");
    msg.className = "load-error";
    msg.innerHTML = `<strong>Couldn't load the data.</strong> If you opened this file directly, serve the folder instead
        (for example <code>python -m http.server</code>) and open <code>http://localhost:8000</code>.`;
    document.body.prepend(msg);
});
