// Overtime: "Where's that fight song?" — a GeoGuessr-style game scored by great-circle distance.
import { setState } from "../state.js";
import { ACCENT, fmtKm, symbolPath, confColor } from "../theme.js";
import { usProjection, drawBasemap, haversineKm } from "../geo.js";
import { svgIn, escapeHtml } from "../ui.js";

const ROUNDS = 5;
const CLUE_PENALTY = 0.15;
const score = km => Math.round(1000 * Math.exp(-km / 600));

export function initGeoGuess(ctx) {
    const W = 760, H = 470;
    const svg = svgIn("#guess-map", W, H, "Map: click to place your guess");
    const projection = usProjection(ctx.nation, W, H, 10);
    const path = d3.geoPath(projection);
    drawBasemap(svg.append("g"), ctx, path);
    const gStates = svg.append("g").attr("class", "guess-states");
    gStates.selectAll("path").data(ctx.states.features).join("path").attr("d", path);
    const gOut = svg.append("g");
    const panel = document.getElementById("guess-panel");

    let game;

    function newGame() {
        const pool = d3.shuffle(ctx.songs.filter(d => d.spotify_id).slice());
        game = { rounds: pool.slice(0, ROUNDS), i: 0, total: 0, history: [] };
        newRound();
    }
    function newRound() {
        game.guess = null;
        game.locked = false;
        game.clues = 1;
        gOut.selectAll("*").remove();
        render();
    }

    function placeGuess(lonlat) {
        if (game.locked || !lonlat) return;
        game.guess = lonlat;
        const p = projection(lonlat);
        gOut.selectAll("*").remove();
        if (p) drawPin(p, "guess-pin", "Your guess");
        render();
    }

    function drawPin([x, y], cls, label) {
        const g = gOut.append("g").attr("class", cls).attr("transform", `translate(${x},${y})`);
        g.append("path").attr("d", "M0,0 C-7,-10 -9,-14 -9,-19 A9,9 0 1,1 9,-19 C9,-14 7,-10 0,0Z");
        g.append("circle").attr("cy", -19).attr("r", 3.5).attr("class", "pin-hole");
        g.append("text").attr("y", -32).attr("text-anchor", "middle").text(label);
    }

    svg.on("click", event => {
        const [mx, my] = d3.pointer(event);
        placeGuess(projection.invert([mx, my]));
    });

    function lockIn() {
        const song = game.rounds[game.i];
        const km = haversineKm(game.guess, [song.lon, song.lat]);
        const pts = Math.round(score(km) * Math.max(0, 1 - CLUE_PENALTY * (game.clues - 1)));
        game.locked = true;
        game.total += pts;
        game.history.push({ song, km, pts });
        const a = projection(game.guess), b = projection([song.lon, song.lat]);
        gOut.insert("path", ":first-child").attr("class", "guess-line").attr("d", `M${a}L${b}`)
            .attr("stroke-dasharray", function () { const l = this.getTotalLength(); return `${l} ${l}`; })
            .attr("stroke-dashoffset", function () { return this.getTotalLength(); })
            .transition().duration(700).attr("stroke-dashoffset", 0);
        gOut.append("path").attr("class", "answer-sym").attr("transform", `translate(${b})`)
            .attr("d", symbolPath(song.conf["2024"], 220)).attr("fill", confColor[song.conf["2024"]]);
        gOut.append("text").attr("class", "map-label").attr("x", b[0] + 12).attr("y", b[1] + 4).text(song.school);
        render({ km, pts });
    }

    // The round skeleton (incl. the Spotify iframe) is built once per round so playback
    // survives map clicks; render() only updates the parts that change.
    function buildRound() {
        const song = game.rounds[game.i];
        panel.innerHTML = `
            <div class="guess-head">
                <span class="guess-round">Round ${game.i + 1} / ${ROUNDS}</span>
                <span class="guess-score"></span>
            </div>
            <ol class="guess-clues"></ol>
            <div class="masked-embed">
                <iframe title="Mystery fight song" src="https://open.spotify.com/embed/track/${song.spotify_id}?utm_source=generator&theme=0" height="80" loading="lazy" allow="autoplay; encrypted-media"></iframe>
                <div class="embed-mask">Title hidden — press ▶ on the right to listen</div>
            </div>
            <label class="guess-state">No mouse? Guess a state:
                <select id="guess-state-select"><option value="">Choose…</option>
                    ${ctx.states.features.map(f => f.properties.name).sort().map(n => `<option>${n}</option>`).join("")}
                </select></label>
            <div class="guess-result-slot" aria-live="polite"></div>
            <div class="guess-actions"></div>`;
        const sel = panel.querySelector("#guess-state-select");
        sel.addEventListener("change", () => {
            const f = ctx.states.features.find(f => f.properties.name === sel.value);
            if (f) placeGuess(d3.geoCentroid(f));
        });
        game.built = game.i;
    }

    function render(result) {
        const song = game.rounds[game.i];
        if (!song) return renderSummary();
        if (game.built !== game.i) buildRound();
        const clues = [
            `<li><b>Tempo</b> ${song.bpm} BPM · <b>Length</b> ${song.sec_duration}s · <b>Written</b> ${song.year ?? "year unknown"}</li>`,
            `<li><b>Lyrics use</b> ${ctx.analysis.tropes.filter(t => song.tropes[t.key]).map(t => t.label).join(", ") || "none of the eight tropes"} · <b>Student-written</b> ${song.student_writer.toLowerCase()}</li>`,
            `<li><b>Conference</b> ${song.conf["2019"]} (2019)</li>`
        ];
        panel.querySelector(".guess-score").innerHTML = `${game.total}<small> pts</small>`;
        panel.querySelector(".guess-clues").innerHTML = clues.slice(0, game.clues).join("");
        panel.querySelector(".embed-mask")?.toggleAttribute("hidden", !!result);
        panel.querySelector("#guess-state-select").disabled = !!result;
        panel.querySelector(".guess-result-slot").innerHTML = result ? `
            <div class="guess-result">
                <div class="guess-answer">${escapeHtml(song.school)} · <i>${escapeHtml(song.song_name)}</i></div>
                <div>You were <strong>${fmtKm(result.km)}</strong> away: <strong>+${result.pts}</strong> points</div>
            </div>` : "";
        const actions = panel.querySelector(".guess-actions");
        actions.innerHTML = result
            ? `<button type="button" class="btn btn-ghost" data-act="card">Open ${escapeHtml(song.school)}'s card</button>
               <button type="button" class="btn btn-primary" data-act="next">${game.i + 1 < ROUNDS ? "Next round →" : "See final score"}</button>`
            : `<button type="button" class="btn btn-ghost" data-act="clue" ${game.clues >= clues.length ? "disabled" : ""}>Another clue (−${CLUE_PENALTY * 100}%)</button>
               <button type="button" class="btn btn-primary" data-act="lock" ${game.guess ? "" : "disabled"}>${game.guess ? "Lock in guess" : "Click the map to guess"}</button>`;
        actions.querySelector('[data-act="clue"]')?.addEventListener("click", () => { game.clues++; render(); });
        actions.querySelector('[data-act="lock"]')?.addEventListener("click", lockIn);
        actions.querySelector('[data-act="next"]')?.addEventListener("click", () => { game.i++; newRound(); });
        actions.querySelector('[data-act="card"]')?.addEventListener("click", () => setState({ selected: song.school }));
    }

    function renderSummary() {
        const best = ROUNDS * 1000;
        const rating = game.total > 3500 ? "All-American scout 🏆" : game.total > 2200 ? "Varsity starter" : game.total > 1000 ? "Walk-on" : "Still learning the playbook";
        panel.innerHTML = `
            <div class="guess-head"><span class="guess-round">Final whistle</span><span class="guess-score">${game.total}<small> / ${best}</small></span></div>
            <p class="guess-rating">${rating}</p>
            <ol class="guess-history">${game.history.map(h => `
                <li><span>${escapeHtml(h.song.school)}</span><span>${fmtKm(h.km)}</span><b>+${h.pts}</b></li>`).join("")}</ol>
            <div class="guess-actions"><button type="button" class="btn btn-primary" data-act="again">Play again</button></div>`;
        panel.querySelector('[data-act="again"]').addEventListener("click", newGame);
        gOut.selectAll("*").remove();
        game.history.forEach(h => {
            const p = projection([h.song.lon, h.song.lat]);
            gOut.append("circle").attr("cx", p[0]).attr("cy", p[1]).attr("r", 6).attr("fill", ACCENT);
            gOut.append("text").attr("class", "map-label").attr("x", p[0] + 9).attr("y", p[1] + 4).text(h.song.school);
        });
    }

    newGame();
}
