const width = 800;
const mapHeight = 500;
const chartHeight = 350;
const margin = { top: 30, right: 30, bottom: 40, left: 40 };

const conferenceColors = {
    "ACC": "#013ca6", "Big 12": "#ef473e", "Big Ten": "#0088ce",
    "Pac-12": "#00274d", "SEC": "#F1B82D", "Independent": "#9abd55"
};
const studentColors = { "Yes": "#1b9e77", "No": "#7570b3", "Unknown": "#bababa" };

const fipsToAbbr = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE",
    "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA",
    "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM",
    "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
    "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY"
};

let selectedSchool = null;

Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
    d3.csv("data/fight-songs-with-coordinates.csv"),
    d3.xml("data/american-football-svgrepo-com.svg")
]).then(([us, data, xml]) => {
    window.allFightSongs = data;
    const states = topojson.feature(us, us.objects.states);
    data.forEach(d => {
        d.latitude = +d.latitude;
        d.longitude = +d.longitude;
        d.bpm = +d.bpm;
        d.sec_duration = +d.sec_duration;
        const p = [d.longitude, d.latitude];
        const foundState = states.features.find(s => d3.geoContains(s, p));
        d.stateAbbr = foundState ? (fipsToAbbr[foundState.id] || "USA") : "USA";
    });

    // Draw everything
    drawHtmlLegend();
    drawMap(us, data, xml);
    drawBeeswarmPlot("#bpm-vis", data, "bpm", "Beats Per Minute");
    drawBeeswarmPlot("#duration-vis", data, "sec_duration", "Seconds");
    drawScatterPlot("#scatter-vis", data);

    drawYearStackedChart("#year-vis", data);
    drawDonutChart("#student-vis", data);
    drawStudentWriterMap("#student-map-vis", us, data);
    drawTropeStackedChart("#tropes-vis", data);
    drawFightiestChart("#fightiest-vis", data);
    drawRadarChart("#radar-vis", data);
    drawCooccurrenceHeatmap("#heatmap-vis", data);
});

// --- NEW LEGEND FUNCTION ---
function drawHtmlLegend() {
    const container = document.getElementById("map-legend");
    const confs = Object.keys(conferenceColors).sort((a, b) => {
        if (a === "Independent") return 1;
        if (b === "Independent") return -1;
        return a.localeCompare(b);
    });

    confs.forEach(conf => {
        const item = document.createElement("div");
        item.className = "legend-item";

        const box = document.createElement("div");
        box.className = "legend-color";
        box.style.backgroundColor = conferenceColors[conf];

        const text = document.createTextNode(conf);

        item.appendChild(box);
        item.appendChild(text);
        container.appendChild(item);
    });
}

// --- INTERACTION ---
function handleSchoolClick(event, d) {
    if (event) event.stopPropagation();
    if (selectedSchool === d.school) {
        selectedSchool = null;
        resetHighlight();
        updateInfoPanel(null);
    } else {
        selectedSchool = d.school;
        highlightSchool(d.school);
        updateInfoPanel(d);
    }
}

function highlightSchool(schoolName) {
    // 1. Icons (Map)
    d3.selectAll(".icon")
        .classed("highlighted", d => d.school === schoolName)
        .classed("dimmed", d => d.school !== schoolName)
        .transition().duration(200)
        .attr("transform", function (d) {
            const baseTransform = d3.select(this).attr("data-base-transform");
            if (d.school === schoolName) return baseTransform.replace("scale(1)", "scale(2)");
            return baseTransform;
        });

    // 2. Jitter Points (BPM & Duration)
    d3.selectAll(".jitter-point")
        .classed("highlighted", d => d.school === schoolName)
        .classed("dimmed", d => d.school !== schoolName)
        .transition().duration(200)
        .attr("r", d => d.school === schoolName ? 10 : 6);

    // 3. Scatter Dots
    d3.selectAll(".scatter-dot")
        .classed("highlighted", d => d.school === schoolName)
        .classed("dimmed", d => d.school !== schoolName)
        .transition().duration(200)
        .attr("r", d => d.school === schoolName ? 10 : 6)
        .style("stroke", d => d.school === schoolName ? "#fff" : "none")
        .style("stroke-width", d => d.school === schoolName ? 2 : 0);
}

function resetHighlight() {
    // 1. Icons
    d3.selectAll(".icon")
        .classed("highlighted", false)
        .classed("dimmed", false)
        .transition().duration(200)
        .attr("transform", function () { return d3.select(this).attr("data-base-transform"); });

    // 2. Jitter Points
    d3.selectAll(".jitter-point")
        .classed("highlighted", false)
        .classed("dimmed", false)
        .transition().duration(200)
        .attr("r", 6);

    // 3. Scatter Dots
    d3.selectAll(".scatter-dot")
        .classed("highlighted", false)
        .classed("dimmed", false)
        .transition().duration(200)
        .attr("r", 6)
        .style("stroke", "none");
}

function updateInfoPanel(d) {
    const defaultMsg = document.getElementById("default-msg");
    const content = document.getElementById("detail-content");
    const spotifyDiv = document.getElementById("spotify-embed");

    if (!d) {
        defaultMsg.style.display = "block";
        content.style.display = "none";
        spotifyDiv.innerHTML = "";
        return;
    }

    defaultMsg.style.display = "none";
    content.style.display = "block";

    document.getElementById("info-school").textContent = d.school;
    document.getElementById("info-state").textContent = d.stateAbbr;
    document.getElementById("info-conf").textContent = d.conference;
    document.getElementById("info-conf").style.color = conferenceColors[d.conference];
    document.getElementById("info-song").textContent = d.song_name;
    document.getElementById("info-writer").textContent = d.writers;
    document.getElementById("info-year").textContent = d.year;
    document.getElementById("info-tempo").textContent = d.bpm + " BPM";
    document.getElementById("info-length").textContent = (d.sec_duration === "undefined" ? d.sec_duration : d.sec_duration + " sec");

    if (d.spotify_id) {
        spotifyDiv.innerHTML = `
            <iframe
            src="https://open.spotify.com/embed/track/${d.spotify_id}?theme=0"
            width="100%"
            height="170"
            frameborder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy">
            </iframe>`;
    } else {
        spotifyDiv.innerHTML = "No Spotify Track Available";
    }

    drawMiniRadar(d);
}

function drawMiniRadar(d) {
    const containerId = "#mini-radar";
    d3.select(containerId).selectAll("*").remove();

    if (!d) return;

    const metrics = [
        { id: "fight", label: "Fight" },
        { id: "victory", label: "Victory" },
        { id: "win_won", label: "Win" },
        { id: "rah", label: "Rah" },
        { id: "nonsense", label: "Nonsense" },
        { id: "colors", label: "Colors" },
        { id: "spelling", label: "Spell" }
    ];

    // Setup SVG
    const width = 280;
    const height = 220;
    const margin = 35;
    const radius = (Math.min(width, height) / 2) - margin;

    const svg = d3.select(containerId).append("svg")
        .attr("width", "100%").attr("height", "100%")
        .attr("viewBox", `0 0 ${width} ${height}`);

    const g = svg.append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2})`);

    // Draw Grid (Web)
    const angleSlice = (Math.PI * 2) / metrics.length;
    const rScale = d3.scaleLinear().range([0, radius]).domain([0, 1]);

    [0.5, 1].forEach(level => {
        g.append("circle")
            .attr("r", radius * level)
            .style("fill", "none")
            .style("stroke", "#eee")
            .style("stroke-dasharray", "3 3");
    });

    // Axis Lines & Labels
    metrics.forEach((m, i) => {
        const angle = i * angleSlice - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        g.append("line")
            .attr("x1", 0).attr("y1", 0).attr("x2", x).attr("y2", y)
            .style("stroke", "#eee").style("stroke-width", 1);

        const labelX = Math.cos(angle) * (radius + 15);
        const labelY = Math.sin(angle) * (radius + 15);
        g.append("text")
            .attr("x", labelX).attr("y", labelY)
            .text(m.label)
            .style("text-anchor", "middle")
            .style("alignment-baseline", "middle")
            .style("font-size", "0.6em")
            .style("fill", "#999");
    });

    // Draw Selected Song Shape
    // Map "Yes" to 1, "No" to 0
    const lineGenerator = d3.lineRadial()
        .angle((m, i) => i * angleSlice)
        .radius((m) => rScale(d[m.id] === "Yes" ? 1 : 0))
        .curve(d3.curveLinearClosed);

    g.append("path")
        .datum(metrics)
        .attr("d", lineGenerator)
        .style("fill", conferenceColors[d.conference])
        .style("fill-opacity", 0.2)
        .style("stroke", conferenceColors[d.conference])
        .style("stroke-width", 2);

    // Draw Dots
    metrics.forEach((m, i) => {
        const val = d[m.id] === "Yes" ? 1 : 0;
        const angle = i * angleSlice - Math.PI / 2;
        g.append("circle")
            .attr("cx", Math.cos(angle) * rScale(val))
            .attr("cy", Math.sin(angle) * rScale(val))
            .attr("r", 4)
            .style("fill", val === 1 ? conferenceColors[d.conference] : "#eee");
    });
}

// --- DRAW FUNCTIONS ---
/* MAP */
function drawMap(us, data, xml) {
    const svg = d3.select("#map-vis").append("svg").attr("width", "100%").attr("height", "100%")
        .attr("viewBox", `0 0 ${width} ${mapHeight}`).attr("preserveAspectRatio", "xMidYMid meet");

    const projection = d3.geoAlbersUsa().scale(1000).translate([width / 2, mapHeight / 2]);
    const path = d3.geoPath().projection(projection);

    const importedNode = document.importNode(xml.documentElement, true);
    const icon = d3.select(importedNode).attr("id", "stadium-icon").attr("width", 24).attr("height", 24);
    icon.selectAll("*").attr("fill", null).attr("stroke", null).style("fill", null).style("stroke", null);
    svg.append("defs").node().appendChild(icon.node());

    svg.append("g").selectAll("path")
        .data(topojson.feature(us, us.objects.states).features)
        .join("path").attr("class", "state").attr("d", path);

    svg.append("g").selectAll("use")
        .data(data).join("use")
        .attr("href", "#stadium-icon").attr("class", "icon")
        .each(function (d) {
            const p = projection([d.longitude, d.latitude]);
            const transform = p ? `translate(${p[0]}, ${p[1]}) translate(-12, -12) scale(1)` : "translate(-1000,-1000) scale(1)";
            d3.select(this).attr("transform", transform).attr("data-base-transform", transform);
        })
        .style("fill", d => conferenceColors[d.conference] || "#333")
        .style("display", d => projection([d.longitude, d.latitude]) ? "inline" : "none")
        .on("click", handleSchoolClick)
        .on("mouseover", (e, d) => showTooltip(e, `<strong>${d.school}`))
        .on("mouseout", () => d3.select("#tooltip").style("opacity", 0));
}

/* JITTER PLOT */
function drawBeeswarmPlot(containerId, data, key, xLabel) {
    const svg = d3.select(containerId).append("svg").attr("width", "100%").attr("height", "100%")
        .attr("viewBox", `0 0 ${width} ${chartHeight}`).attr("preserveAspectRatio", "xMidYMid meet");

    const xExtent = d3.extent(data, d => d[key]);
    const xScale = d3.scaleLinear().domain([xExtent[0] * 0.9, xExtent[1] * 1.05]).range([margin.left, width - margin.right]);
    const centerY = chartHeight / 2;

    svg.append("g").attr("transform", `translate(0, ${centerY})`)
        .call(d3.axisBottom(xScale).tickSize(5)).attr("class", "axis").select(".domain").attr("stroke", "#ddd");

    const nodes = data.map(d => ({ ...d, x: xScale(d[key]), y: centerY }));
    const simulation = d3.forceSimulation(nodes)
        .force("x", d3.forceX(d => xScale(d[key])).strength(1))
        .force("y", d3.forceY(centerY).strength(0.1))
        .force("collide", d3.forceCollide(7))
        .stop();
    for (let i = 0; i < 150; i++) simulation.tick();

    svg.append("g").selectAll("circle")
        .data(nodes).join("circle")
        .attr("class", "jitter-point")
        .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", 6)
        .style("fill", d => conferenceColors[d.conference] || "#ccc")
        .on("click", handleSchoolClick)
        .on("mouseover", (e, d) => showTooltip(e, `<strong>${d.school}</strong><br>${d[key]}`))
        .on("mouseout", () => d3.select("#tooltip").style("opacity", 0));

    svg.append("text")
        .attr("class", "axis-label")
        .attr("x", width / 2)
        .attr("y", chartHeight - 10)
        .text(xLabel);
}

/* SCATTER PLOT (Energy vs Stamina) */
function drawScatterPlot(containerId, data) {
    const svg = d3.select(containerId).append("svg")
        .attr("width", "100%").attr("height", "100%") // Responsive
        .attr("viewBox", `0 0 ${width} ${chartHeight}`); // Aspect Ratio

    const padding = { top: 20, right: 30, bottom: 50, left: 50 };

    // Filter valid data
    const plotData = data.filter(d => d.bpm > 0 && d.sec_duration > 0);

    const xScale = d3.scaleLinear()
        .domain([0, d3.max(plotData, d => d.sec_duration)]).nice()
        .range([padding.left, width - padding.right]);

    const yMax = d3.max(plotData, d => d.bpm);
    const yScale = d3.scaleLinear()
        .domain([0, yMax * 1.05])
        .range([chartHeight - padding.bottom, padding.top]);

    // Axes
    svg.append("g").attr("transform", `translate(0, ${chartHeight - padding.bottom})`)
        .call(d3.axisBottom(xScale)).attr("class", "axis");
    svg.append("g").attr("transform", `translate(${padding.left}, 0)`)
        .call(d3.axisLeft(yScale)).attr("class", "axis");

    // Labels
    svg.append("text").attr("x", width / 2).attr("y", chartHeight - 10)
        .attr("class", "axis-label").text("Song Length (Seconds)");

    svg.append("text").attr("transform", "rotate(-90)")
        .attr("x", -chartHeight / 2).attr("y", 15) // Centered vertically
        .attr("class", "axis-label").text("Tempo (BPM)");

    // Dots
    svg.append("g").selectAll("circle")
        .data(plotData).join("circle")
        .attr("class", "scatter-dot")
        .attr("cx", d => xScale(d.sec_duration))
        .attr("cy", d => yScale(d.bpm))
        .attr("r", 6)
        .attr("fill", d => conferenceColors[d.conference] || "#999")
        .on("click", handleSchoolClick)
        .on("mouseover", (e, d) => showTooltip(e, `<strong>${d.school}</strong><br>BPM: ${d.bpm}<br>Sec: ${d.sec_duration}`))
        .on("mouseout", () => d3.select("#tooltip").style("opacity", 0));
}

function drawYearStackedChart(containerId, data) {
    const svg = d3.select(containerId).append("svg").attr("width", "100%").attr("height", "100%").attr("viewBox", `0 0 ${width} ${chartHeight}`);

    const validData = data.filter(d => d.year && d.year !== "Unknown" && !isNaN(+d.year));
    const minYear = d3.min(validData, d => +d.year);
    const maxYear = d3.max(validData, d => +d.year);
    const conferences = Object.keys(conferenceColors);

    const nested = d3.rollup(validData, v => {
        const c = {}; conferences.forEach(conf => c[conf] = []);
        v.forEach(d => c[d.conference].push(d.school));
        return c;
    }, d => +d.year);


    const stackData = [];
    for (let y = minYear; y <= maxYear; y++) {
        const row = { year: y };
        conferences.forEach(conf => {
            row[conf] = (nested.get(y)?.[conf] || []).length;
            row[`${conf}_schools`] = nested.get(y)?.[conf] || [];
        });
        row.total = d3.sum(conferences, c => row[c]);
        stackData.push(row);
    }

    const series = d3.stack().keys(conferences)(stackData);
    const xScale = d3.scaleBand().domain(stackData.map(d => d.year)).range([margin.left, width - margin.right]).padding(0.2);
    const yScale = d3.scaleLinear().domain([0, d3.max(stackData, d => d.total)]).nice().range([chartHeight - margin.bottom, margin.top]);

    svg.append("g").attr("transform", `translate(0, ${chartHeight - margin.bottom})`)
        .call(d3.axisBottom(xScale).tickValues(xScale.domain().filter(y => y % 5 === 0))).attr("class", "axis");
    svg.append("g").attr("transform", `translate(${margin.left}, 0)`).call(d3.axisLeft(yScale).ticks(5)).attr("class", "axis");

    svg.append("g").selectAll("g").data(series).join("g").attr("class", "layer").attr("fill", d => conferenceColors[d.key])
        .selectAll("rect").data(d => d).join("rect")
        .attr("x", d => xScale(d.data.year)).attr("y", d => yScale(d[1]))
        .attr("height", d => yScale(d[0]) - yScale(d[1])).attr("width", xScale.bandwidth())
        .on("mouseover", (e, d) => {
            const conf = d3.select(e.target.parentNode).datum().key;
            const schools = d.data[`${conf}_schools`].slice(0, 6).join(", ");
            showTooltip(e,
                `<strong>${d.data.year}</strong><br>
                ${conf}: ${d[1] - d[0]}<br>
                ${schools}${d.data[`${conf}_schools`].length > 6 ? ", …" : ""}`
            );
        })
        .on("mouseout", () => d3.select("#tooltip").style("opacity", 0));

    svg.append("g").selectAll("text").data(stackData).join("text")
        .attr("class", "bar-label")
        .attr("x", d => xScale(d.year) + xScale.bandwidth() / 2)
        .attr("y", d => yScale(d.total) - 5)
        .text(d => d.total > 0 ? d.total : "");
}

function drawTropeStackedChart(containerId, data) {
    const svg = d3.select(containerId).append("svg").attr("width", "100%").attr("height", "100%").attr("viewBox", `0 0 ${width} ${chartHeight}`);
    const tropes = [
        { k: "fight", l: "Fight" }, { k: "victory", l: "Victory" }, { k: "win_won", l: "Win/Won" },
        { k: "rah", l: "Rah" }, { k: "nonsense", l: "Nonsense" }, { k: "colors", l: "Colors" },
        { k: "spelling", l: "Spelling" }
    ];
    const conferences = Object.keys(conferenceColors);
    const stackData = tropes.map(t => {
        const row = { trope: t.l };

        // initialize counts + school lists
        conferences.forEach(conf => {
            row[conf] = 0;
            row[`${conf}_schools`] = [];
        });

        // fill counts + lists
        data.forEach(d => {
            if (d[t.k] === "Yes") {
                row[d.conference] = (row[d.conference] || 0) + 1;
                row[`${d.conference}_schools`].push(d.school);
            }
        });

        row.total = d3.sum(conferences, c => row[c]);
        return row;
    });


    const series = d3.stack().keys(conferences)(stackData);
    const xScale = d3.scaleBand().domain(tropes.map(t => t.l)).range([margin.left, width - margin.right]).padding(0.3);
    const yScale = d3.scaleLinear().domain([0, d3.max(stackData, d => d.total)]).nice().range([chartHeight - margin.bottom, margin.top]);

    svg.append("g").attr("transform", `translate(0, ${chartHeight - margin.bottom})`).call(d3.axisBottom(xScale)).attr("class", "axis");
    svg.append("g").attr("transform", `translate(${margin.left}, 0)`).call(d3.axisLeft(yScale)).attr("class", "axis");

    svg.append("g").selectAll("g").data(series).join("g").attr("class", "layer").attr("fill", d => conferenceColors[d.key])
        .selectAll("rect").data(d => d).join("rect")
        .attr("x", d => xScale(d.data.trope)).attr("y", d => yScale(d[1]))
        .attr("height", d => yScale(d[0]) - yScale(d[1])).attr("width", xScale.bandwidth())
        .on("mouseover", (e, d) => {
            const conf = d3.select(e.target.parentNode).datum().key;

            const count = d[1] - d[0];
            const schoolsArr = d.data[`${conf}_schools`] || [];

            const schoolsHtml = schoolsArr
                .sort()
                .join("<br>");

            showTooltip(e,
                `<strong>${d.data.trope}</strong><br>
                ${conf}: ${count}<br><br>
                ${schoolsHtml}`
            );
        })
        .on("mouseout", () => d3.select("#tooltip").style("opacity", 0));

    svg.append("g").selectAll("text").data(stackData).join("text")
        .attr("class", "bar-label")
        .attr("x", d => xScale(d.trope) + xScale.bandwidth() / 2)
        .attr("y", d => yScale(d.total) - 5)
        .text(d => d.total);
}

function drawDonutChart(containerId, data) {
    const container = d3.select(containerId);

    const containerWidth = container.node().clientWidth;
    const containerHeight = container.node().clientHeight || 300;

    const size = Math.min(containerWidth, containerHeight);

    const svg = container.append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", `0 0 ${size} ${size}`);

    const radius = size * 0.5;
    const counts = d3.rollup(
        data,
        v => ({
            count: v.length,
            schools: v.map(d => d.school)
        }),
        d => d.student_writer || "Unknown"
    );
    const pieData = d3.pie().value(d => d[1].count)(counts);
    const arc = d3.arc()
        .innerRadius(radius * 0.6)
        .outerRadius(radius);
    const arcHover = d3.arc()
        .innerRadius(radius * 0.6)
        .outerRadius(radius * 1.08);

    const g = svg.append("g")
        .attr("transform", `translate(${size / 2}, ${size / 2})`);

    const ctCount = g.append("text")
        .attr("class", "center-text-count")
        .attr("dy", "-0.2em")
        .text(data.length);

    const ctLabel = g.append("text")
        .attr("class", "center-text")
        .attr("dy", "1.4em")
        .text("Total Songs");

    g.selectAll("path").data(pieData).join("path")
        .attr("d", arc)
        .attr("fill", d => studentColors[d.data[0]] || "#ccc")
        .attr("stroke", "white").attr("stroke-width", 2)
        .on("mouseover", function (e, d) {
            d3.select(this).transition().duration(200).attr("d", arcHover);

            const total = data.length;
            const count = d.data[1].count;

            const pct = (count / total * 100).toFixed(1);

            const schools = d.data[1].schools.slice(0, 10).join("<br>");

            ctCount.text(count);
            ctLabel.text(`${d.data[0]} (${pct}%)`);

            // showTooltip(e,
            //     `<strong>${d.data[0]} (${pct}%)</strong><br>
            //     ${schools}${d.data[1].schools.length > 10 ? "<br>…" : ""}`
            // );
        })
        .on("mouseout", function () {
            d3.select(this).transition().duration(200).attr("d", arc);
            ctCount.text(data.length);
            ctLabel.text("Total Songs");
        });

    g.append("text").attr("dy", "5em").attr("text-anchor", "middle").style("font-size", "11px").style("fill", "#aaa");
}

function drawStudentWriterMap(containerId, us, data) {
    const w = 400;
    const h = 300;

    const svg = d3.select(containerId)
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", `0 0 ${w} ${h}`);

    const projection = d3.geoAlbersUsa()
        .scale(500)
        .translate([w / 2, h / 2]);

    const path = d3.geoPath().projection(projection);

    // States background
    svg.append("g")
        .selectAll("path")
        .data(topojson.feature(us, us.objects.states).features)
        .join("path")
        .attr("d", path)
        .attr("fill", "#eee")
        .attr("stroke", "#fff");

    // School dots
    svg.append("g")
        .selectAll("circle")
        .data(data.filter(d => projection([d.longitude, d.latitude])))
        .join("circle")
        .attr("cx", d => projection([d.longitude, d.latitude])[0])
        .attr("cy", d => projection([d.longitude, d.latitude])[1])
        .attr("r", 3)
        .attr("fill", d => studentColors[d.student_writer || "Unknown"])
        .attr("opacity", 0.8)
        .on("mouseover", (e, d) =>
            showTooltip(e,
                `<strong>${d.school}</strong><br>
                ${d.student_writer || "Unknown"}`
            )
        )
        .on("mouseout", () => d3.select("#tooltip").style("opacity", 0));
}

function showTooltip(event, text) {
    const tooltip = d3.select("#tooltip");
    tooltip.style("opacity", 1).html(text)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
}

function drawFightiestChart(containerId, data) {
    // 1. Prepare Data
    const top10 = [...data]
        .map(d => ({ ...d, number_fights: +d.number_fights }))
        .filter(d => !isNaN(d.number_fights))
        .sort((a, b) => b.number_fights - a.number_fights)
        .slice(0, 10);

    // 2. Define Local Margins (Make sure 'right' is big enough for the text!)
    const localMargin = { top: 30, right: 50, bottom: 40, left: 160 };

    const svg = d3.select(containerId)
        .append("svg")
        .attr("width", "100%").attr("height", "100%")
        .attr("viewBox", `0 0 ${width} ${chartHeight}`);

    const y = d3.scaleBand()
        .domain(top10.map(d => d.school))
        .range([localMargin.top, chartHeight - localMargin.bottom]) // Dynamic height
        .padding(0.2);

    const x = d3.scaleLinear()
        .domain([0, d3.max(top10, d => d.number_fights)])
        .range([localMargin.left, width - localMargin.right])
        .nice();

    // 3. Draw Bars
    svg.append("g")
        .selectAll("rect")
        .data(top10)
        .join("rect")
        .attr("x", localMargin.left)
        .attr("y", d => y(d.school))
        .attr("height", y.bandwidth())
        .attr("width", d => x(d.number_fights) - localMargin.left)
        .attr("fill", d => conferenceColors[d.conference] || "#666")
        .on("mouseover", (e, d) =>
            showTooltip(e, `<strong>${d.school}</strong><br>${d.song_name}`)
        )
        .on("mouseout", () => d3.select("#tooltip").style("opacity", 0));

    // 4. ADD LABELS (New Code)
    svg.append("g")
        .selectAll("text")
        .data(top10)
        .join("text")
        .text(d => d.number_fights)
        .attr("x", d => x(d.number_fights) + 5) // Position at end of bar + 5px padding
        .attr("y", d => y(d.school) + y.bandwidth() / 2) // Center vertically
        .attr("dy", "0.35em") // Vertical alignment adjustment
        .attr("class", "bar-label");

    // 5. Draw Axes
    svg.append("g")
        .attr("transform", `translate(0, ${chartHeight - localMargin.bottom})`)
        .call(d3.axisBottom(x).ticks(5)).attr("class", "axis");

    svg.append("g")
        .attr("transform", `translate(${localMargin.left}, 0)`)
        .call(d3.axisLeft(y)).attr("class", "axis");
}

/* RADAR CHART (Conference Signatures) */
function drawRadarChart(containerId, data) {
    // 1. Setup Data
    const conferences = Object.keys(conferenceColors).sort((a, b) => {
        if (a === "Independent") return 1;
        if (b === "Independent") return -1;
        return a.localeCompare(b);
    });

    const metrics = [
        { id: "fight", label: "Fight", max: 1 },
        { id: "victory", label: "Victory", max: 1 },
        { id: "win_won", label: "Win/Won", max: 1 },
        { id: "rah", label: "Rah", max: 1 },
        { id: "nonsense", label: "Nonsense", max: 1 },
        { id: "colors", label: "Colors", max: 1 },
        { id: "spelling", label: "Spelling", max: 1 }
    ];

    const confData = {};
    const confTotals = {};

    conferences.forEach(c => {
        const songs = data.filter(d => d.conference === c);
        const count = songs.length;

        confTotals[c] = count;

        if (count === 0) return;

        confData[c] = {
            fight: songs.filter(d => d.fight === "Yes").length / count,
            victory: songs.filter(d => d.victory === "Yes").length / count,
            win_won: songs.filter(d => d.win_won === "Yes").length / count,
            rah: songs.filter(d => d.rah === "Yes").length / count,
            nonsense: songs.filter(d => d.nonsense === "Yes").length / count,
            colors: songs.filter(d => d.colors === "Yes").length / count,
            spelling: songs.filter(d => d.spelling === "Yes").length / count
        };
    });

    // 2. Setup SVG
    const containerWidth = d3.select(containerId).node().getBoundingClientRect().width;
    const radarSize = Math.max(300, Math.min(containerWidth, 600));

    const margin = 80;
    const radius = (radarSize - margin * 2) / 2;

    d3.select(containerId).selectAll("*").remove();

    const svg = d3.select(containerId).append("svg")
        .attr("width", "100%")
        .attr("height", radarSize)
        .attr("viewBox", `0 0 ${radarSize} ${radarSize}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g")
        .attr("transform", `translate(${radarSize / 2}, ${radarSize / 2})`);

    // 3. Draw Grid
    const angleSlice = (Math.PI * 2) / metrics.length;
    const rScale = d3.scaleLinear().range([0, radius]).domain([0, 1]);

    [0.2, 0.4, 0.6, 0.8, 1].forEach(p => {
        g.append("circle")
            .attr("class", "radar-grid-circle")
            .attr("r", radius * p)
            .style("fill", "none")
            .style("stroke", "#e0e0e0")
            .style("stroke-dasharray", "3 3");
    });

    metrics.forEach((m, i) => {
        const angle = i * angleSlice - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        g.append("line")
            .attr("x1", 0).attr("y1", 0).attr("x2", x).attr("y2", y)
            .style("stroke", "#ccc").style("stroke-width", "1px");

        const labelX = Math.cos(angle) * (radius + 25);
        const labelY = Math.sin(angle) * (radius + 25);
        g.append("text")
            .attr("x", labelX).attr("y", labelY)
            .attr("class", "axis-label")
            .text(m.label)
            .style("alignment-baseline", "middle");
    });

    // --- STATE MANAGEMENT ---
    let selected1 = "Big Ten";
    let selected2 = "SEC";

    function updateRadar() {
        const selection = [selected1, selected2].filter(x => x);

        // 1. Draw Areas
        const paths = g.selectAll(".radar-area").data(selection);
        paths.join("path")
            .attr("class", "radar-area")
            .transition().duration(500)
            .attr("d", conf => {
                const coords = metrics.map((m, i) => {
                    const angle = i * angleSlice - Math.PI / 2;
                    const val = confData[conf]?.[m.id] || 0;
                    const r = rScale(val);
                    return [Math.cos(angle) * r, Math.sin(angle) * r];
                });
                return "M" + coords.map(c => c.join(",")).join("L") + "Z";
            })
            .style("fill", d => conferenceColors[d])
            .style("fill-opacity", 0.2)
            .style("stroke", d => conferenceColors[d])
            .style("stroke-width", 2.5);

        // 2. Draw Tooltip Circles
        g.selectAll(".radar-point-group").remove();

        selection.forEach(conf => {
            const pointsData = metrics.map((m, i) => {
                const val = confData[conf]?.[m.id] || 0;
                return {
                    angle: i * angleSlice - Math.PI / 2,
                    val: val,
                    metric: m.label,
                    conf: conf,
                    totalCount: confTotals[conf] // Pass the total for calculation
                };
            });

            const pointGroup = g.append("g").attr("class", "radar-point-group");

            pointGroup.selectAll("circle")
                .data(pointsData)
                .join("circle")
                .attr("cx", d => Math.cos(d.angle) * rScale(d.val))
                .attr("cy", d => Math.sin(d.angle) * rScale(d.val))
                .attr("r", 6)
                .style("fill", conferenceColors[conf])
                .style("fill-opacity", 0)
                .style("stroke", "transparent")
                .style("cursor", "pointer")
                .on("mouseover", function (e, d) {
                    d3.select(this).style("fill-opacity", 1);

                    // NEW: Calculate Count (Ratio * Total)
                    const count = Math.round(d.val * d.totalCount);

                    showTooltip(e,
                        `<div style="display:flex; align-items:center; gap:5px;">
                            <div style="width:10px; height:10px; background:${conferenceColors[d.conf]};"></div>
                            <strong>${d.conf}</strong>
                         </div>
                         ${d.metric}: ${count}`
                    );
                })
                .on("mouseout", function () {
                    d3.select(this).style("fill-opacity", 0);
                    d3.select("#tooltip").style("opacity", 0);
                });
        });
    }

    // --- CUSTOM DROPDOWN BUILDER ---
    function renderDropdown(divId, currentVal, excludeVal, onSelect) {
        const container = document.getElementById(divId);
        container.innerHTML = "";

        const options = conferences.filter(c => c !== excludeVal);

        const btn = document.createElement("div");
        btn.className = "dropdown-btn";
        btn.innerHTML = `
            <div style="display:flex; align-items:center;">
                <span class="conf-icon" style="background-color: ${conferenceColors[currentVal]}"></span>
                ${currentVal}
            </div>
            <span>▾</span>
        `;

        const list = document.createElement("div");
        list.className = "dropdown-list";

        options.forEach(opt => {
            const item = document.createElement("div");
            item.className = "dropdown-item";
            item.innerHTML = `
                <span class="conf-icon" style="background-color: ${conferenceColors[opt]}"></span>
                ${opt}
            `;
            item.onclick = () => {
                onSelect(opt);
            };
            list.appendChild(item);
        });

        btn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll(".dropdown-list").forEach(l => {
                if (l !== list) l.classList.remove("show");
            });
            list.classList.toggle("show");
        };

        container.appendChild(btn);
        container.appendChild(list);
    }

    function refreshControls() {
        renderDropdown("radar-dropdown-1", selected1, selected2, (val) => {
            selected1 = val;
            updateRadar();
            refreshControls();
        });

        renderDropdown("radar-dropdown-2", selected2, selected1, (val) => {
            selected2 = val;
            updateRadar();
            refreshControls();
        });
    }

    document.addEventListener("click", () => {
        document.querySelectorAll(".dropdown-list").forEach(l => l.classList.remove("show"));
    });

    refreshControls();
    updateRadar();
}

/* CO-OCCURRENCE HEATMAP */
function drawCooccurrenceHeatmap(containerId, data) {
    const svg = d3.select(containerId).append("svg")
        .attr("width", "100%").attr("height", "100%")
        .attr("viewBox", `0 0 ${width} ${chartHeight}`);

    const padding = { top: 30, right: 30, bottom: 30, left: 100 };

    // Define the tropes key and label
    const tropes = [
        { k: "fight", l: "Fight" }, { k: "victory", l: "Victory" },
        { k: "win_won", l: "Win" }, { k: "rah", l: "Rah" },
        { k: "nonsense", l: "Nonsense" }, { k: "colors", l: "Colors" },
        { k: "spelling", l: "Spelling" }
    ];
    const vars = tropes.map(d => d.l);

    // Compute Co-occurrence matrix
    const matrix = [];
    tropes.forEach((t1, i) => {
        tropes.forEach((t2, j) => {
            let count = 0;
            data.forEach(d => {
                if (d[t1.k] === "Yes" && d[t2.k] === "Yes") {
                    count++;
                }
            });
            matrix.push({ x: t1.l, y: t2.l, val: count });
        });
    });

    // Scales
    const x = d3.scaleBand()
        .range([padding.left, width - padding.right])
        .domain(vars).padding(0.05);

    const y = d3.scaleBand()
        .range([chartHeight - padding.bottom, padding.top])
        .domain(vars).padding(0.05);

    const color = d3.scaleSequential().interpolator(d3.interpolateBlues)
        .domain([0, d3.max(matrix, d => d.val)]);

    // Draw Squares
    svg.selectAll("rect")
        .data(matrix)
        .join("rect")
        .attr("class", "heatmap-rect")
        .attr("x", d => x(d.x))
        .attr("y", d => y(d.y))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", d => d.x === d.y ? "#eee" : color(d.val)) // Grey out diagonal (self-comparison)
        .on("mouseover", (e, d) => {
            if (d.x !== d.y) {
                showTooltip(e, `<strong>${d.x} + ${d.y}</strong><br>appear together in ${d.val} songs`);
            }
        })
        .on("mouseout", () => d3.select("#tooltip").style("opacity", 0));

    // Axis Labels
    svg.append("g").attr("transform", `translate(0, ${chartHeight - padding.bottom})`)
        .call(d3.axisBottom(x).tickSize(0)).select(".domain").remove();
    svg.append("g").attr("transform", `translate(${padding.left}, 0)`)
        .call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();
}

// Mobile-only: keep info panel as bottom sheet only for map + 2 jitter plots
function setupScopedMobileBottomSheet() {
    const mq = window.matchMedia("(max-width: 900px)");

    const startEl = document.querySelector("#section-map");
    const endEl = document.querySelector("#section-duration"); // last section that should use sheet

    if (!startEl || !endEl) return;

    const update = () => {
        // Only apply logic on mobile
        if (!mq.matches) {
            document.body.classList.remove("mobile-sheet");
            return;
        }

        const startRect = startEl.getBoundingClientRect();
        const endRect = endEl.getBoundingClientRect();

        // "Active range" = when we've reached section-map, but haven't scrolled past section-duration
        const inRange = (startRect.top <= 0) && (endRect.bottom > 0);

        document.body.classList.toggle("mobile-sheet", inRange);
    };

    // Use IntersectionObserver for robustness + a scroll fallback
    const io = new IntersectionObserver(update, { threshold: [0, 0.01, 1] });
    io.observe(startEl);
    io.observe(endEl);

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    mq.addEventListener?.("change", update);

    update();
}

setupScopedMobileBottomSheet();
