# Network Operations Center (NOC) Interface Research & Design Report

**Client Route:** `/next/network-noc/index.html`  
**Client Codebase Archetype:** Tier-1 Global Network Operations Center (NOC), BGP-4 Peering Matrix, and DWDM Optical Transport Mesh Control  
**Primary Framework:** D3.js (Data-Driven Documents v7, `../../vendor/d3.js`)  
**Primary Renderer:** D3 Force-Directed Dynamic SVG Mesh Topology + DWDM 16-Lambda Optical Matrix + ITU-T X.733 Alarm Triage Table  

---

## 1. Design Discipline Researched

Global telecommunications network operations centers (e.g. AT&T Global NOC, NTT Tier-1 Backbone, Equinix Peering Exchanges, Internet Engineering Task Force RFC 4271 BGP-4, ITU-T G.872 Optical Transport) govern petabit data routing across fault-tolerant meshes:
- **BGP-4 Peering Topology**: Autonomous System Number (ASN) node-link topology with dynamic route path attributes (AS-PATH, MED, Local-Pref), prefix advertisement streams, and Route Flap Damping (RFD) exponential decay penalties.
- **DWDM 16-Lambda Optical Cross-Connect Grid**: High-density ITU-T grid wavelength channels ($\lambda_1\text{--}\lambda_{16}$, $1550\text{ nm}$ C-band), optical signal-to-noise ratio (OSNR), and chromatic dispersion meters.
- **ITU-T X.733 Telecommunications Alarm Triage**: Strict 5-tier alarm severity categorization (Critical / Red, Major / Orange, Minor / Yellow, Warning / Cyan, Indeterminate / Grey) with alarm deduplication, root-cause correlation, and circuit isolation interlocks.
- **Packet Wire-Tap Protocol Buffer**: Deep inspection of raw telemetry frames and tool execution payloads.

---

## 2. Authoritative Sources

1. **IETF RFC 4271 (*A Border Gateway Protocol 4 - BGP-4*) & RFC 2439 (*BGP Route Flap Damping*)**  
   https://www.rfc-editor.org/rfc/rfc4271  
   https://www.rfc-editor.org/rfc/rfc2439  
   *Applied*: Models swarm components as Autonomous Systems (`AS65001` Orchestrator, `AS65002` Core Engineers, `AS65003` QA Evaluators); computes exponential route flap damping penalty scores for flaky or blocking tasks.

2. **ITU-T Recommendation G.872 (*Architecture of optical transport networks*)**  
   https://www.itu.int/rec/T-REC-G.872  
   *Applied*: Models task concurrency as Dense Wavelength Division Multiplexing (DWDM) optical lambdas; optical power level meters (dBm).

3. **ITU-T Recommendation X.733 (*Information Technology - Open Systems Interconnection - Alarm Management Function*)**  
   https://www.itu.int/rec/T-REC-X.733  
   *Applied*: Five-state standard alarm hierarchy; alarm correlation rules; suppression of secondary cascade faults.

4. **W3C WAI-ARIA APG — *Treegrid and Dynamic Data Presentation Standards***  
   https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/  
   *Applied*: Semantic ARIA Data Tables accompanying D3 force-directed SVG graphs; accessible keyboard focus rings for network nodes and links.

---

## 3. Framework and Dependency Research

- **Primary Framework & Renderer**: D3.js v7 (`../../vendor/d3.js`). D3 provides data-driven DOM and SVG transformations, force-directed graph physics (`d3.forceSimulation`, `d3.forceLink`, `d3.forceManyBody`), scale generators, and seamless enter/update/exit selection pipelines.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js` and `../../vendor/d3.js`.

---

## 4. Applied Design Decisions

- **Global Mesh Topology**: Interactive D3 SVG graph representing autonomous systems and live bandwidth link saturation pipes.
- **DWDM Lambda Matrix**: 16-channel optical carrier spectrum tracking active agent tool calls.
- **Alarm Triage Table**: X.733 severity classification with 1-click BGP circuit isolation and deblock routing.
- **Maintenance Windows (Plans)**: Project plan lifecycle mapped to formal telecom Network Maintenance Windows.

---

## 5. Accessibility Decisions

- **Semantic BGP Peer Table**: The visual D3 topology graph is paired with an accessible HTML `<table role="grid">` listing all ASNs, peer IP endpoints, and BGP session states.
- **Keyboard Node Traversal**: `Tab` cycles through network nodes; `Enter` opens node packet inspection.
- **High-Contrast Link Saturation**: Thick stroke widths ($2\text{--}8\text{px}$) and patterned dashes for high/low link loads.

---

## 6. Performance Decisions

- **Simulation Cooling**: D3 force simulations automatically cool down (`alphaTarget(0)`) after initial layout stabilization to eliminate unnecessary CPU cycles.
- **SVG Transform Clustering**: Node elements are grouped in `<g>` containers to minimize redraw passes.

---

## 7. Distinctions from the Other 19 Dashboards

- **vs. Constellation**: Global BGP-4 routing mesh and DWDM optical transport, whereas Constellation is an astronomical star chart with orbital gravity physics.
- **vs. SCADA Powergrid**: Packet-switched telecommunications network with ASNs, IP prefixes, and DWDM lambdas, whereas SCADA Powergrid is a high-voltage electrical substation.
- **vs. All Others**: The only dashboard modeling swarm orchestration as global Tier-1 Internet backbone routing with D3.js force graphs, BGP peering, and ITU-T X.733 alarms.
