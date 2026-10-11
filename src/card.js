// The "trading card" drawer that opens when a school is selected anywhere on the page.
import { state, setState, subscribe, confOf, bpmOf } from "./state.js";
import { confColor, symbolPath, archetypeColor, lisaLabel, ERA_LABEL, studentLabel, fmtKm } from "./theme.js";
import { startMetronome, stopMetronome } from "./audio.js";
import { escapeHtml } from "./ui.js";

export function initCard(ctx) {
    const drawer = document.getElementById("card");
    const inner = document.getElementById("card-inner");
    let shown = null;
    let lastFocus = null;

    function close() { setState({ selected: null }); }

    document.addEventListener("keydown", e => { if (e.key === "Escape" && state.selected) close(); });

    function render(s) {
        if (!s.selected) {
            stopMetronome();
            drawer.classList.remove("is-open");
            drawer.setAttribute("aria-hidden", "true");
            document.body.classList.remove("card-open");
            shown = null;
            lastFocus?.focus?.({ preventScroll: true });
            return;
        }
        const d = ctx.bySchool.get(s.selected);
        if (!d) return;
        if (shown !== d.school) lastFocus = document.activeElement;
        stopMetronome(); // the button is re-rendered as "off"
        const conf = confOf(d);
        const moved = d.conf["2019"] !== d.conf["2024"];
        const rivals = ctx.rivalries.map((r, i) => [r, i]).filter(([r]) => r.school_a === d.school || r.school_b === d.school);
        const lisa = d.lisa.bpm_folded;
        const tropes = ctx.analysis.tropes;

        const keepEmbed = shown === d.school && inner.querySelector(".card-embed iframe");
        const embedHtml = keepEmbed ? null : d.spotify_id
            ? `<iframe title="${escapeHtml(d.song_name)} on Spotify" src="https://open.spotify.com/embed/track/${d.spotify_id}?utm_source=generator&theme=0" height="152" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`
            : `<div class="no-track">No recording available</div>`;
        const oldEmbed = keepEmbed ? inner.querySelector(".card-embed") : null;

        inner.innerHTML = `
            <div class="card-band" style="--team:${confColor[conf]}">
                <svg viewBox="-10 -10 20 20" class="card-sym" aria-hidden="true"><path d="${symbolPath(conf, 120)}"/></svg>
                <span>${conf}${moved ? ` <small>(${ERA_LABEL[s.era === "2019" ? "2024" : "2019"]}: ${d.conf[s.era === "2019" ? "2024" : "2019"]})</small>` : ""}</span>
                <button type="button" class="card-close" aria-label="Close school card">✕</button>
            </div>
            <div class="card-body">
                <h2 class="card-school" tabindex="-1">${escapeHtml(d.school)}</h2>
                <p class="card-song">${escapeHtml(d.song_name)}</p>
                <p class="card-writers">${escapeHtml(d.writers)} · ${d.year ?? "year unknown"} · ${d.state}</p>
                <div class="card-embed"></div>
                <div class="card-stats">
                    <div class="stat"><span class="stat-num">${d.bpm}</span><span class="stat-lbl">BPM${d.folded ? ` · folded ${d.bpm_folded}` : ""}</span></div>
                    <div class="stat"><span class="stat-num">${d.sec_duration}</span><span class="stat-lbl">seconds</span></div>
                    <div class="stat"><span class="stat-num">${d.number_fights}</span><span class="stat-lbl">× “fight”</span></div>
                </div>
                <button type="button" class="btn btn-ghost btn-sm metro-btn" aria-pressed="false">
                    <span class="metro-dot"></span> Metronome at ${bpmOf(d)} BPM
                </button>
                <h3 class="card-h">Lyric tropes <span class="card-sub">${d.trope_count} of 8</span></h3>
                <div class="trope-chips">${tropes.map(t => `<span class="trope-chip ${d.tropes[t.key] ? "on" : ""}">${t.label}</span>`).join("")}</div>
                <h3 class="card-h">Archetype</h3>
                <p class="card-arch"><i style="background:${archetypeColor[d.archetype]}"></i>${d.archetype}</p>
                <h3 class="card-h">Writer</h3>
                <p class="card-text">${studentLabel[d.student_writer]}${d.official_song === "Yes" ? " · official school song" : ""}${d.contest === "Yes" ? " · chosen in a contest" : ""}</p>
                ${rivals.length ? `<h3 class="card-h">Rivals</h3>
                <div class="card-links">${rivals.map(([r, i]) => {
                    const other = r.school_a === d.school ? r.school_b : r.school_a;
                    return `<button type="button" class="link-btn" data-rivalry="${i}">⚔ ${escapeHtml(other)} <small>${escapeHtml(r.name)}</small></button>`;
                }).join("")}</div>` : ""}
                <h3 class="card-h">Nearest stadiums</h3>
                <div class="card-links">${d.nearest.map(n => `<button type="button" class="link-btn" data-school="${escapeHtml(n.school)}">${escapeHtml(n.school)} <small>${fmtKm(n.km)}</small></button>`).join("")}</div>
                <p class="card-note">Tempo neighbourhood (LISA): ${lisa.p < 0.05 ? lisaLabel[lisa.quad].toLowerCase() : "nothing unusual"}.</p>
            </div>`;

        const embedSlot = inner.querySelector(".card-embed");
        if (oldEmbed) embedSlot.replaceWith(oldEmbed); else embedSlot.innerHTML = embedHtml;

        inner.querySelector(".card-close").addEventListener("click", close);
        inner.querySelectorAll("[data-school]").forEach(b => b.addEventListener("click", () => setState({ selected: b.dataset.school })));
        inner.querySelectorAll("[data-rivalry]").forEach(b => b.addEventListener("click", () => {
            setState({ rivalry: +b.dataset.rivalry });
            document.getElementById("q4").scrollIntoView({ behavior: "smooth" });
        }));
        const metroBtn = inner.querySelector(".metro-btn");
        const dot = metroBtn.querySelector(".metro-dot");
        metroBtn.addEventListener("click", () => {
            const on = metroBtn.getAttribute("aria-pressed") === "true";
            if (on) { stopMetronome(); metroBtn.setAttribute("aria-pressed", "false"); return; }
            metroBtn.setAttribute("aria-pressed", "true");
            startMetronome(bpmOf(d), () => { dot.classList.remove("beat"); void dot.offsetWidth; dot.classList.add("beat"); });
        });

        drawer.classList.add("is-open");
        drawer.setAttribute("aria-hidden", "false");
        document.body.classList.add("card-open");
        if (shown !== d.school) inner.querySelector(".card-school").focus({ preventScroll: true });
        shown = d.school;
    }

    subscribe((s, changed) => {
        if (changed.some(k => ["selected", "era", "tempo"].includes(k))) render(s);
    });
}
