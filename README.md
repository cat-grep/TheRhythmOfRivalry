# The Rhythm of Rivalry  
### A Visual Story of College Fight Songs

This project is an interactive data-driven story exploring the **musical, lyrical and geographic patterns of U.S. college fight songs**. Using coordinated visualizations, it examines how tempo, song length, lyrics, authorship, conferences and history shape one of the most recognizable traditions in American college sports culture.

The application was inspired by the **BTAA Data Visualization Student Championship** and builds upon the original fight song analysis by **FiveThirtyEight**, extending it with richer interaction, geographic context and musical interpretation.

[Live Demo✨](https://cat-grep.github.io/TheRhythmOfRivalry/)


## The Story

The page is structured like a football game:

| Chapter | What it shows |
|---|---|
| **Q1 Where** | Scroll-driven hero map: stadiums pulse at their song's tempo; conference footprints in 2019 vs 2024–26 realignment; Voronoi "home turf"; rivalry arcs; Moran's I tests for geographic clustering |
| **Q2 When** | Beeswarm timeline + cumulative curve; animated map with the decade-by-decade centre of gravity |
| **Halftime Sound** | Raw vs *folded* tempo (half-time correction), song length, tempo × length, and a "tap the tempo" game |
| **Q3 Words** | Trope unit chart, conference signatures with Wilson intervals + permutation tests, φ correlation matrix, "fightiest" isotype, student-author waffle, archetype clustering |
| **Q4 Rivalry** | 33 rivalries with a head-to-head face-off, geographic vs musical distance for all 2,080 pairs (Mantel test), LISA hot spots |
| **Overtime Play** | "Where's that fight song?" — guess the stadium from clues and audio, scored by great-circle distance |

Every chart is linked: selecting a school anywhere opens its card and highlights it everywhere; clicking a conference in the map legend filters the whole page. Views can be shared via the URL (`#school=Wisconsin`, `#rivalry=The Game`).


## Running Locally

The page loads JSON, so it must be served (opening `index.html` directly will not work):

```bash
python -m http.server 8000
# open http://localhost:8000
```

To rebuild the processed data and statistics after editing anything in `data/`:

```bash
python analysis/build_data.py   # needs numpy, scipy, scikit-learn
```


## Project Structure

```
index.html, style.css
src/
  main.js          data loading, linking, URL hash, nav
  state.js         shared state store
  theme.js         colours, shapes, formatters (palette validated for colour-vision deficiency)
  encode.js        "color by" encodings for the map
  geo.js           projection + distance helpers
  scrolly.js       scroll-driven map steps
  card.js          school card drawer
  audio.js         metronome / tap clicks (Web Audio)
  maps/mainMap.js  hero map
  charts/          geoStats, timeline, sound, words, rivalry
  games/geoGuess.js
analysis/build_data.py   reproducible statistics → data/processed/*.json
data/
  fight-songs-with-coordinates.csv
  schools-extra.csv      state + 2019 / 2024 conference membership
  rivalries.csv          curated rivalry list
  processed/             generated: songs.json, analysis.json
```


## Technologies Used

- **D3.js (v7)** – interactive data visualizations  
- **TopoJSON** – U.S. state geometry  
- **Python (NumPy, SciPy, scikit-learn)** – spatial statistics, permutation tests, clustering, MDS  
- **HTML / CSS / JavaScript (ES modules)** – application structure and styling  
- **Web Audio API** – metronome and tap-tempo clicks  
- **Google Fonts** – typography  
- **Spotify Embed** – music playback


## Data Sources

- **Fight Song Lyrics & Metadata**  
  FiveThirtyEight  
  https://github.com/fivethirtyeight/data/blob/master/fight-songs/fight-songs.csv  

- **Dataset Updates**  
  Provided by the **Big Ten Academic Alliance (BTAA)** for the Data Visualization Student Championship  
  https://btaa.org/docs/default-source/research-data/fight-songs-updated.csv?sfvrsn=6c0d2771_1&download=true

- **Stadium Coordinates**  
  College Football Data API (CFBD)  
  https://collegefootballdata.com/

- **Cover Image**  
  mix108.com – Wisconsin “Jump Around” tradition  
  https://mix108.com/wisconsin-jump-around-tradition/

- **Icon**  
  SVG Repo – American football icon  
  https://www.svgrepo.com/svg/401099/american-football


## Inspiration & References

- **BTAA Data Visualization Student Championship**  
  https://btaa.org/technology/love-data-week/data-viz-student-championship  

- **FiveThirtyEight Example Visualization**  
  *College Fight Song Lyrics*  
  https://web.archive.org/web/20250305132007/https:/projects.fivethirtyeight.com/college-fight-song-lyrics/

- **Data Set Description**
  https://btaa.org/docs/default-source/research-data/readme-data-description.pdf?sfvrsn=f13148d3_1


## Author

**Eugenie Huang**  
Master’s Student in Cartography & Geographic Information Systems  
University of Wisconsin–Madison  
huang674@wisc.edu  
https://linkedin.com/in/eugenie-huang
