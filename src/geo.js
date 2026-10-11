// Geographic helpers shared by every map.

export const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm([lon1, lat1], [lon2, lat2]) {
    return d3.geoDistance([lon1, lat1], [lon2, lat2]) * EARTH_RADIUS_KM;
}

/** An Albers USA projection fitted to the lower 48 + insets, with padding. */
export function usProjection(nation, w, h, pad = 16) {
    return d3.geoAlbersUsa().fitExtent([[pad, pad], [w - pad, h - pad]], nation);
}

/** Draw the state mesh + national outline into a <g>. */
export function drawBasemap(g, ctx, path) {
    g.append("path").datum(ctx.nation).attr("class", "land").attr("d", path);
    g.append("path").datum(ctx.stateMesh).attr("class", "state-mesh").attr("d", path);
    g.append("path").datum(ctx.nation).attr("class", "nation").attr("d", path);
}

/** A gently bowed arc between two projected points (bulges to the left of a→b). */
export function bowedArc(a, b, bend = 0.22) {
    const [x1, y1] = a, [x2, y2] = b;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const cx = mx - dy * bend, cy = my + dx * bend;
    return `M${x1},${y1}Q${cx},${cy} ${x2},${y2}`;
}

export function nearestSong(songs, lonlat) {
    let best = null, bestKm = Infinity;
    for (const s of songs) {
        const km = haversineKm(lonlat, [s.lon, s.lat]);
        if (km < bestKm) { best = s; bestKm = km; }
    }
    return { song: best, km: bestKm };
}
