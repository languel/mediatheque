# Early Cinema & Chronophotography Provenance Guide

This guide establishes the curatorial standards, legal provenance, holding archives, and scouring methodology for early cinema and chronophotography assets in **Mediathèque**.

---

## 1. Scope & Primary Figures

| Creator / Studio | Active Era | Key Technological Innovations | Holding Institutions |
| :--- | :--- | :--- | :--- |
| **Eadweard Muybridge** | 1878–1893 | Multi-camera electro-photographic shutter tripwire batteries; *Animal Locomotion* collotype plates; Zoopraxiscope animated glass projection discs. | Library of Congress (Prints & Photos); Univ. of Pennsylvania Archives; Kingston Museum; National Gallery of Art. |
| **Étienne-Jules Marey** & **Georges Demenÿ** | 1882–1904 | *Fusil photographique* (1882); fixed-plate chronophotography; geometric chronophotography (black suit with reflective stripes); movable-film chronophotography; Phonoscope. | Collège de France (Archives Marey); Cinémathèque française; Société française de photographie (SFP); CNC Archives françaises du film. |
| **Auguste & Louis Lumière** | 1895–1905 | *Cinématographe* (reversible camera, printer, and projector running at 16 fps, 35mm with round perforations); first commercial narrative film projections. | Institut Lumière (Lyon); CNC (Centre national du cinéma); Cinémathèque française. |
| **Thomas Edison**, **W.K.L. Dickson**, **William Heise** | 1891–1896 | Kinetograph camera & Kinetoscope peephole viewer; Black Maria revolving studio (West Orange, NJ); 35mm rectangular 4-perforation film standard. | Library of Congress (Motion Picture, Broadcasting & Recorded Sound Division - Paper Print Collection); Thomas Edison National Historical Park. |
| **Georges Méliès** | 1896–1913 | Star Film Studio (Montreuil); stop-trick substitution; multi-exposure; dissolve transitions; miniature puppets; scale dolly illusions; hand-colored stencils. | Library of Congress (Paper Print Collection); Cinémathèque française; CNC. |
| **Ottomar Anschütz** & **Max Skladanowsky** | 1886–1895 | Anschütz *Schnellseher* / *Electrotachyscope* stroboscopic disc projector (1887); Skladanowsky *Bioscop* dual-strip projector (Berlin Wintergarten, Nov 1895). | Bundesarchiv-Filmarchiv; Deutsches Filmmuseum (DFF Frankfurt). |

---

## 2. Provenance & Copyright Status

All works included in this curatorial scope were created prior to 1928 and meet the following public domain standards:

1. **United States (`PD-US-expired`)**:
   - Any work published or registered for US copyright prior to **January 1, 1929** is in the public domain in the United States.
   - Thomas Edison, W.K.L. Dickson, and Georges Méliès (via his brother Gaston Méliès, representing the Star Film Company in New York) deposited paper prints directly with the **Library of Congress Register of Copyrights** between 1894 and 1904. These registrations expired without renewal and are preserved in the LC Paper Print Collection.
   - Eadweard Muybridge copyrighted his *Animal Locomotion* plates with the Library of Congress in **1887** (registration nos. 1887-14234 through 1887-15024).

2. **France & European Union (`PD-old-70` / `PD-old-100`)**:
   - Étienne-Jules Marey died in **1904** (70+ years post mortem auctoris passed on 1 January 1975).
   - Georges Demenÿ died in **1917**.
   - Louis Lumière died in **1948** and Auguste Lumière in **1954**; their films were created under the company entity *Société Lumière* and published between 1895 and 1897 (>70 years since publication).
   - Georges Méliès died in **1938** (70+ years post mortem passed on 1 January 2009).
   - Max Skladanowsky died in **1939**.

---

## 3. Scouring Standards & Ingestion Requirements

When scouring a new candidate media file from Wikimedia Commons, the Library of Congress API, or the Internet Archive:

1. **Direct High-Fidelity Source**:
   - Always retain or extract the highest-resolution uncompressed master file (`.webm`, `.mp4`, `.gif`, `.tiff`, `.png`).
   - Retain original aspect ratio without anamorphic stretching or non-standard letterboxing.

2. **Derivative Pipeline**:
   - `media`: Normalized delivery file (MP4 H.264 high profile for video; optimized GIF for animations).
   - `proxy`: Downscaled 768px max edge, 15 fps VP9 WebM without audio (optimized for real-time computer vision in MediaPipe, optical flow, and frame differencing).
   - `poster`: First or representative frame WebP.
   - `thumb`: 480×480 center-crop square WebP thumbnail.
   - `original`: Unmodified upstream archival asset.

3. **Required Provenance Record**:
   Every item must include:
   - `step: "obtained"` with the upstream archive URL, timestamp, and upstream SHA-256 checksum.
   - `step: "derived"` documenting ffmpeg / Pillow parameters used to build web and proxy derivatives.
   - `step: "analyzed"` listing all automated analysis runs (`probe`, `flow`, `gif`, `scenes`).

4. **Required Rights & Credit Record**:
   - `status`: `"public-domain"`
   - `license`: Specific license identifier (`"PD-US-expired"`, `"PD-old-100"`, `"PD-old-70"`)
   - `credit`: Standard credit string format:
     `"{Creator}, {Year}. {Title}. {Holding Archive / Origin}. Public domain."`
