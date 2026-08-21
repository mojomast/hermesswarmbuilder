const dashboards = [
  { group: 'Clean-slate clients', name: 'Radar', detail: 'Polar SVG operations', path: '/next/radar/index.html' },
  { group: 'Clean-slate clients', name: 'Daily Swarm', detail: 'Editorial broadsheet', path: '/next/broadsheet/index.html' },
  { group: 'Clean-slate clients', name: 'Sequencer', detail: 'Timeline and tracks', path: '/next/sequencer/index.html' },
  { group: 'Clean-slate clients', name: 'Operator Shell', detail: 'Keyboard command OS', path: '/next/operator-shell/index.html' },
  { group: 'Clean-slate clients', name: 'Control Table', detail: 'Spreadsheet workbook', path: '/next/control-table/index.html' },
  { group: 'Clean-slate clients', name: 'Field Guide', detail: 'Mobile field binder', path: '/next/field-guide/index.html' },
  { group: 'Clean-slate clients', name: 'Constellation', detail: 'Orbital SVG network', path: '/next/constellation/index.html' },
  { group: 'Clean-slate clients', name: 'Casefiles', detail: 'Evidence case registry', path: '/next/casefiles/index.html' },
  { group: 'Clean-slate clients', name: 'Patchbay', detail: 'Modular signal routing', path: '/next/patchbay/index.html' },
  { group: 'Clean-slate clients', name: 'Swarm Gallery', detail: 'Museum wayfinding', path: '/next/gallery/index.html' },
  { group: 'Interface studies', name: 'Command Center', detail: 'Balanced operations', path: '/command-center.html' },
  { group: 'Interface studies', name: 'Flight Deck', detail: 'Aerospace mission control', path: '/flight-deck.html' },
  { group: 'Interface studies', name: 'Briefing Room', detail: 'Editorial intelligence', path: '/briefing-room.html' },
  { group: 'Interface studies', name: 'Swarm Atlas', detail: 'Cartographic field view', path: '/swarm-atlas.html' },
  { group: 'Interface studies', name: 'Switchyard', detail: 'Industrial dispatch board', path: '/switchyard.html' },
  { group: 'Interface studies', name: 'Quiet Observatory', detail: 'Low-fatigue monitoring', path: '/quiet-observatory.html' },
  { group: 'Legacy tools', name: 'Studio', detail: 'Original full control surface', path: '/' },
  { group: 'Legacy tools', name: 'Matrix', detail: 'Dense swarm matrix', path: '/matrix.html' },
  { group: 'Legacy tools', name: 'Timeline', detail: 'Waterfall and bottlenecks', path: '/timeline.html' },
  { group: 'Legacy tools', name: 'Console', detail: 'Terminal and resources', path: '/console.html' },
  { group: 'Legacy tools', name: 'Swarm Ops', detail: 'Topology and fleet', path: '/ultimate.html' },
];

const currentPath = location.pathname.replace(/\/$/, '') || '/';
const groups = [...new Set(dashboards.map((dashboard) => dashboard.group))];
const directory = document.createElement('details');
directory.className = 'global-dashboard-directory';
directory.innerHTML = `
  <summary aria-label="Open dashboard directory">
    <span class="directory-pulse" aria-hidden="true"></span>
    Dashboards
    <span class="directory-count">${dashboards.length}</span>
  </summary>
  <div class="directory-panel">
    <header><span>Hermes interfaces</span><button type="button" aria-label="Close dashboard directory">Close</button></header>
    ${groups.map((group) => `
      <section aria-labelledby="directory-${group.replace(/\W+/g, '-').toLowerCase()}">
        <h2 id="directory-${group.replace(/\W+/g, '-').toLowerCase()}">${group}</h2>
        <nav>${dashboards.filter((dashboard) => dashboard.group === group).map((dashboard) => {
          const active = dashboard.path === currentPath;
          return `<a href="${dashboard.path}"${active ? ' class="active" aria-current="page"' : ''}><b>${dashboard.name}</b><small>${dashboard.detail}</small></a>`;
        }).join('')}</nav>
      </section>
    `).join('')}
  </div>`;

const style = document.createElement('style');
style.textContent = `
  .global-dashboard-directory{position:fixed;z-index:190;left:14px;bottom:12px;color:#eef5f7;font:12px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  .global-dashboard-directory>summary{list-style:none;display:flex;align-items:center;gap:7px;min-height:36px;padding:5px 8px;border:1px solid color-mix(in oklch,#8ed8dd 38%,#35444c);border-radius:7px;background:rgba(9,16,20,.94);box-shadow:0 8px 30px rgba(0,0,0,.34);cursor:pointer;font-weight:750;letter-spacing:.02em;backdrop-filter:blur(14px)}
  .global-dashboard-directory>summary::-webkit-details-marker{display:none}
  .global-dashboard-directory>summary:hover{border-color:#8ed8dd;background:#101d22}
  .global-dashboard-directory>summary:focus-visible,.global-dashboard-directory a:focus-visible,.global-dashboard-directory button:focus-visible{outline:2px solid #8ed8dd;outline-offset:2px}
  .directory-pulse{width:7px;height:7px;border-radius:50%;background:#80dca8;box-shadow:0 0 0 3px rgba(128,220,168,.12)}
  .directory-count{display:grid;min-width:20px;height:20px;place-items:center;border:1px solid #40545c;border-radius:99px;color:#aebec3;font:10px ui-monospace,monospace}
  .directory-panel{position:absolute;left:0;bottom:calc(100% + 8px);width:min(390px,calc(100vw - 28px));max-height:min(680px,calc(100vh - 76px));overflow:auto;border:1px solid #3d5058;border-radius:10px;background:#0b1317;box-shadow:0 22px 70px rgba(0,0,0,.58)}
  .directory-panel>header{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #293a41;background:#0b1317}
  .directory-panel>header span{font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
  .directory-panel button{min-height:28px;border:1px solid #40545c;border-radius:5px;background:#152128;color:#dfeaec;padding:3px 8px;font:inherit;cursor:pointer}
  .directory-panel section{padding:10px 10px 4px}
  .directory-panel h2{margin:0 2px 7px;color:#869ba2;font-size:10px;letter-spacing:.13em;text-transform:uppercase}
  .directory-panel nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
  .directory-panel a{display:grid;gap:2px;min-width:0;padding:8px 9px;border:1px solid transparent;border-radius:6px;color:#e8f0f2;text-decoration:none;background:#101a1f}
  .directory-panel a:hover{border-color:#42575f;background:#162329}
  .directory-panel a.active{border-color:#76cbd1;background:#13272b;box-shadow:inset 3px 0 #76cbd1}
  .directory-panel a b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
  .directory-panel a small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#84989f;font-size:10px}
  @media(max-width:560px){.global-dashboard-directory{left:8px;bottom:8px}.directory-panel nav{grid-template-columns:1fr}.directory-panel{width:calc(100vw - 16px)}}
  @media(prefers-reduced-motion:reduce){.global-dashboard-directory *{scroll-behavior:auto!important;transition:none!important}}
`;

document.head.append(style);
document.body.append(directory);

directory.querySelector('header button').addEventListener('click', () => {
  directory.open = false;
  directory.querySelector('summary').focus();
});
document.addEventListener('click', (event) => {
  if (directory.open && !directory.contains(event.target)) directory.open = false;
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !directory.open) return;
  directory.open = false;
  directory.querySelector('summary').focus();
});
