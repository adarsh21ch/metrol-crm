(function(){
"use strict";

/* ------------------------------------------------------------------ data */
var MEMBERS = [
  {id:"m1", name:"Mohit Verma",    initials:"MV"},
  {id:"m2", name:"Priya Nair",     initials:"PN"},
  {id:"m3", name:"Arjun Mehta",    initials:"AM"},
  {id:"m4", name:"Sneha Kulkarni", initials:"SK"},
  {id:"m5", name:"Imran Shaikh",   initials:"IS"}
];

var PROJECTS = [
  // c1/c2 stand in for a real uploaded project photo. p2 and p4 deliberately
  // have none, so the "no photo yet" placeholder is visible in both views.
  {id:"p1", name:"Funding Room",      desc:"Investor lead generation across Meta and Google campaigns.", team:5, updated:"2 hours ago", status:"Active", live:true, c1:"#232326", c2:"#4A4A52"},
  {id:"p2", name:"Prime Estates",     desc:"Site-visit bookings for the Gurugram residential launch.",  team:3, updated:"Yesterday",   status:"Active", leads:186, customers:22, gross:1120000},
  {id:"p3", name:"Skillveda Academy", desc:"Admission enquiries for the digital marketing batch.",      team:4, updated:"4 hours ago", status:"Active", leads:412, customers:96, gross:864000, c1:"#1B2420", c2:"#3E5148"},
  {id:"p4", name:"Aarogya Clinics",   desc:"Appointment leads across three Indore branches.",           team:2, updated:"3 days ago",  status:"Active", leads:97,  customers:31, gross:372000},
  {id:"p5", name:"Nova Motors",       desc:"Test-drive bookings for the EV showroom launch.",           team:2, updated:"Last week",   status:"Paused", leads:64,  customers:9,  gross:585000, c1:"#241E1E", c2:"#4E3F3F"},
  {id:"p6", name:"Metrol Retainers",  desc:"Inbound agency enquiries coming from metrol.in.",           team:2, updated:"Today",      status:"Active", leads:38,  customers:7,  gross:1260000, c1:"#1E1E1E", c2:"#3C3C3C"}
];

// status: new | connected | follow_up | converted | dead
// quality: good | average | bad | null
var LEADS = [
  {id:1,  name:"Rahul Sharma",    email:"rahul.sharma@gmail.com",   phone:"+91 98219 44012", status:"follow_up", quality:"good",    owner:"m1", project:"Funding Room"},
  {id:2,  name:"Kavita Iyer",     email:"kavita.iyer@outlook.com",  phone:"+91 99801 23764", status:"converted", quality:"good",    owner:"m2", project:"Funding Room", amount:145000, daysAgo:0, verified:true},
  {id:3,  name:"Deepak Chauhan",  email:"d.chauhan@gmail.com",      phone:"+91 98111 66230", status:"connected", quality:"average", owner:"m1", project:"Funding Room"},
  {id:4,  name:"Anjali Gupta",    email:"anjali.gupta21@gmail.com", phone:"+91 97178 40915", status:"new",       quality:null,      owner:null, project:"Funding Room"},
  {id:5,  name:"Vikram Rathore",  email:"vikram.r@yahoo.in",        phone:"+91 90045 78129", status:"converted", quality:"good",    owner:"m3", project:"Funding Room", amount:210000, daysAgo:1, verified:true},
  {id:6,  name:"Neha Bansal",     email:"neha.bansal@gmail.com",    phone:"+91 98332 51806", status:"follow_up", quality:"average", owner:"m2", project:"Funding Room"},
  {id:7,  name:"Imran Qureshi",   email:"imran.q@gmail.com",        phone:"+91 99677 30248", status:"dead",      quality:"bad",     owner:"m1", project:"Funding Room"},
  {id:8,  name:"Pooja Deshmukh",  email:"pooja.desh@gmail.com",     phone:"+91 98904 11573", status:"connected", quality:"good",    owner:"m4", project:"Funding Room"},
  {id:9,  name:"Sanjay Kulkarni", email:"sanjay.k@rediffmail.com",  phone:"+91 97654 82301", status:"new",       quality:null,      owner:null, project:"Funding Room"},
  {id:10, name:"Ritu Aggarwal",   email:"ritu.agg@gmail.com",       phone:"+91 98730 29645", status:"converted", quality:"good",    owner:"m1", project:"Funding Room", amount:95000, daysAgo:0, verified:false},
  {id:11, name:"Harsh Vardhan",   email:"harsh.vardhan@gmail.com",  phone:"+91 99105 63428", status:"follow_up", quality:"good",    owner:"m3", project:"Funding Room"},
  {id:12, name:"Meera Joshi",     email:"meera.joshi@gmail.com",    phone:"+91 98220 77104", status:"connected", quality:"average", owner:"m2", project:"Funding Room"},
  {id:13, name:"Nikhil Bhatia",   email:"nikhil.bhatia@gmail.com",  phone:"+91 97399 15862", status:"dead",      quality:"bad",     owner:"m4", project:"Funding Room"},
  {id:14, name:"Shreya Pillai",   email:"shreya.pillai@gmail.com",  phone:"+91 98455 30719", status:"converted", quality:"good",    owner:"m2", project:"Funding Room", amount:175000, daysAgo:2, verified:true},
  {id:15, name:"Aditya Rao",      email:"aditya.rao@gmail.com",     phone:"+91 90192 44807", status:"new",       quality:null,      owner:null, project:"Funding Room"},
  {id:16, name:"Farhan Ali",      email:"farhan.ali@gmail.com",     phone:"+91 98670 21395", status:"follow_up", quality:"average", owner:"m1", project:"Funding Room"},
  {id:17, name:"Divya Menon",     email:"divya.menon@gmail.com",    phone:"+91 99000 58273", status:"converted", quality:"good",    owner:"m4", project:"Funding Room", amount:120000, daysAgo:3, verified:true},
  {id:18, name:"Rohit Saxena",    email:"rohit.saxena@gmail.com",   phone:"+91 98118 90462", status:"connected", quality:"good",    owner:"m3", project:"Funding Room"},
  {id:19, name:"Tanvi Shah",      email:"tanvi.shah@gmail.com",     phone:"+91 97022 34158", status:"follow_up", quality:"good",    owner:"m2", project:"Funding Room"},
  {id:20, name:"Gaurav Malhotra", email:"gaurav.m@gmail.com",       phone:"+91 98999 71204", status:"converted", quality:"average", owner:"m1", project:"Funding Room", amount:68000, daysAgo:5, verified:false},
  {id:21, name:"Ishita Roy",      email:"ishita.roy@gmail.com",     phone:"+91 98300 46817", status:"new",       quality:null,      owner:null, project:"Funding Room"},
  {id:22, name:"Manish Tiwari",   email:"manish.tiwari@gmail.com",  phone:"+91 97114 62590", status:"connected", quality:"bad",     owner:"m5", project:"Funding Room"},
  {id:23, name:"Payal Chopra",    email:"payal.chopra@gmail.com",   phone:"+91 98204 33871", status:"converted", quality:"good",    owner:"m3", project:"Funding Room", amount:240000, daysAgo:6, verified:true},
  {id:24, name:"Karan Grover",    email:"karan.grover@gmail.com",   phone:"+91 99719 08246", status:"follow_up", quality:"average", owner:"m5", project:"Funding Room"},
  {id:25, name:"Bhavna Desai",    email:"bhavna.desai@gmail.com",   phone:"+91 98255 61930", status:"converted", quality:"good",    owner:"m4", project:"Funding Room", amount:190000, daysAgo:18, verified:true},
  {id:26, name:"Suresh Nambiar",  email:"suresh.n@gmail.com",       phone:"+91 90350 27614", status:"converted", quality:"average", owner:"m5", project:"Funding Room", amount:85000, daysAgo:40, verified:true},
  {id:27, name:"Yash Thakur",     email:"yash.thakur@gmail.com",    phone:"+91 98866 40127", status:"new",       quality:null,      owner:"m1", project:"Funding Room", isNew:true},
  {id:28, name:"Swati Kapoor",    email:"swati.kapoor@gmail.com",   phone:"+91 97400 51238", status:"converted", quality:"good",    owner:"m2", project:"Skillveda Academy", amount:110000, daysAgo:12, verified:true},
  {id:29, name:"Alok Nanda",      email:"alok.nanda@gmail.com",     phone:"+91 98911 30475", status:"new",       quality:null,      owner:"m1", project:"Prime Estates", isNew:true}
];

/* The 29 leads above carry the sales story by hand. This tops the project up to
   a realistic size so the Leads page actually pages — none of these convert, so
   the Sales figures and the gross stay exactly as written above. */
(function fillLeads(){
  var FIRST = ["Aarav","Isha","Rohan","Ananya","Kabir","Meera","Siddharth","Nisha","Varun","Riya",
               "Aditya","Sneha","Karan","Pooja","Rahul","Diya","Nikhil","Tanya","Vivek","Aisha",
               "Manav","Kritika","Yash","Sanya","Dev","Ira","Arnav","Naina","Rehan","Simran"];
  var LAST  = ["Sharma","Patel","Reddy","Nair","Iyer","Singh","Gupta","Mehta","Joshi","Rao",
               "Bose","Kulkarni","Chopra","Malhotra","Bhatt","Sethi","Kapoor","Menon","Shah","Verma"];
  var ST = ["new","connected","follow_up","connected","new","dead","follow_up","connected"];
  var QL = ["good","average","good","bad","average","good","average","good"];
  var id = 100;
  for(var i = 0; i < 95; i++){
    var f = FIRST[(i * 7) % FIRST.length], l = LAST[(i * 11) % LAST.length];
    var st = ST[i % ST.length];
    LEADS.push({
      id: ++id,
      name: f + " " + l,
      email: (f + "." + l).toLowerCase() + (i % 4 ? "" : i) + "@gmail.com",
      phone: "+91 " + (90000 + (i * 137) % 9999) + " " + (10000 + (i * 7919) % 89999),
      status: st,
      quality: st === "new" ? null : QL[i % QL.length],
      owner: (i % 9 === 0) ? null : MEMBERS[i % MEMBERS.length].id,
      project: "Funding Room"
    });
  }
})();

var STATUS = {
  "new":       {label:"New",       cls:"chip--mute"},
  "connected": {label:"Connected", cls:"chip--accent"},
  "follow_up": {label:"Follow-up", cls:"chip--warn"},
  "converted": {label:"Converted", cls:"chip--good"},
  "dead":      {label:"Dead",      cls:"chip--mute"}
};
var QUALITY = {
  "good":    {label:"Good",    cls:"chip--good"},
  "average": {label:"Average", cls:"chip--warn"},
  "bad":     {label:"Bad",     cls:"chip--bad"}
};
/* Where a lead came from. Adarsh runs Metrol's Meta ads, so that is the common
   case; "Excel import" is stamped on anything brought in through the importer. */
var SOURCES = ["Meta lead form","Meta lead form","Manual entry","Meta lead form","Website form"];

/* The literals above are the shape of record; main.js replaces them with the
   real rows before boot, so nothing below has to know where they came from. */
var SEED = window.__SEED || {};
if(SEED.MEMBERS){ MEMBERS = SEED.MEMBERS; PROJECTS = SEED.PROJECTS; LEADS = SEED.LEADS; }
var CURRENT_PROJECT = (PROJECTS[0] && PROJECTS[0].name) || "";
var CURRENT_PID     = (PROJECTS[0] && PROJECTS[0].id) || null;
var ME = (SEED.me && SEED.me.id) || null;
var IS_OWNER = !(SEED.me && SEED.me.role === "member");
var DB = window.__DB || {saveLead:function(){}, saveEvent:function(){}, insertLeads:function(){}};
function save(id, patch){
  DB.saveLead(id, patch).then(function(err){ if(err) toast("Could not save: " + err); });
}

/* ----------------------------------------------------------------- utils */
var $  = function(s,r){ return (r||document).querySelector(s); };
var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
var inr = new Intl.NumberFormat("en-IN");
function money(n){ return "₹" + inr.format(Math.round(n||0)); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
}); }
function member(id){ for(var i=0;i<MEMBERS.length;i++){ if(MEMBERS[i].id===id) return MEMBERS[i]; } return null; }
function lead(id){ for(var i=0;i<LEADS.length;i++){ if(LEADS[i].id===id) return LEADS[i]; } return null; }
function isConnected(l){ return l.status !== "new"; }
function projectLeads(){ return LEADS.filter(function(l){ return l.pid === CURRENT_PID; }); }
function converted(list){ return list.filter(function(l){ return l.status === "converted"; }); }

/* ------------------------------------------------------------------ theme */
/* Three states are kept alive: explicit light, explicit dark, and no
   data-theme attribute at all, which means "follow the device". The topbar
   button flips between light and dark; "Match device" clears the choice.   */
var THEME_KEY = "metrol-crm-theme";
var MQ_DARK = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
var ICON_MOON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
var ICON_SUN  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';

function storeGet(k){ try { return window.localStorage.getItem(k); } catch(_){ return null; } }
function storeSet(k,v){
  try { if(v == null) window.localStorage.removeItem(k); else window.localStorage.setItem(k,v); } catch(_){}
}
function effectiveTheme(){
  var a = document.documentElement.getAttribute("data-theme");
  if(a === "light" || a === "dark") return a;
  return (MQ_DARK && MQ_DARK.matches) ? "dark" : "light";
}
function paintTheme(){
  var eff = effectiveTheme();
  var set = document.documentElement.getAttribute("data-theme") || "system";
  $$("[data-theme-set]").forEach(function(b){ b.classList.toggle("is-on", b.dataset.themeSet === set); });
  $$("[data-theme-toggle]").forEach(function(b){
    b.innerHTML = (eff === "dark") ? ICON_SUN : ICON_MOON;
    var label = (eff === "dark") ? "Switch to light mode" : "Switch to dark mode";
    b.setAttribute("aria-label", label);
    b.setAttribute("title", (eff === "dark") ? "Light mode" : "Dark mode");
  });
}
function applyTheme(v, persist){
  if(v === "light" || v === "dark") document.documentElement.setAttribute("data-theme", v);
  else document.documentElement.removeAttribute("data-theme");
  if(persist !== false) storeSet(THEME_KEY, (v === "light" || v === "dark") ? v : null);
  paintTheme();
}
if(MQ_DARK){
  var onScheme = function(){ paintTheme(); };
  if(MQ_DARK.addEventListener) MQ_DARK.addEventListener("change", onScheme);
  else if(MQ_DARK.addListener) MQ_DARK.addListener(onScheme);
}

/* ---------------------------------------------------------------- history */
/* Every change to a lead is appended here, so the owner can open any lead and
   see where it has been: who held it, how the status moved, when it closed. */
var EVENTS = (window.__SEED && window.__SEED.EVENTS) || [];
var EVENT_SEQ = EVENTS.reduce(function(m,e){ return Math.max(m, e.id||0); }, 0);
function logEvent(leadId, what, from, to, by, whenMs){
  var e = {
    id: ++EVENT_SEQ, leadId: leadId, what: what,
    from: from == null ? "" : from, to: to == null ? "" : to,
    by: by || "\u2014", at: whenMs == null ? Date.now() : whenMs
  };
  EVENTS.push(e);
  DB.saveEvent(e);   // the trail outlives the tab it was made in
}
function leadEvents(leadId){
  return EVENTS.filter(function(e){ return e.leadId === leadId; })
               .sort(function(a,b){ return a.at - b.at || a.id - b.id; });
}
function fmtWhen(ms){
  var d = new Date(ms);
  return d.toLocaleDateString("en-IN",{day:"numeric",month:"short"}) + ", " +
         d.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"});
}
function byName(id){
  var m = member(id);
  return m ? m.name : (id || "\u2014");
}

/* ------------------------------------------------------------- hover tip */
/* Shown only when the control is NOT already displaying its own label, so a
   widened rail or an expanded sidebar does not repeat itself. */
var tipEl = null;
function hideTip(){ if(tipEl) tipEl.classList.remove("is-on"); }
function showTip(el){
  var text = el.getAttribute("data-tip");
  if(!text) return hideTip();
  var own = el.querySelector(".rail-name, .side-nm");
  if(own && own.offsetParent !== null) return hideTip();   // label already visible
  if(!tipEl) tipEl = document.getElementById("hoverTip");
  if(!tipEl) return;
  tipEl.textContent = text;
  tipEl.classList.add("is-on");
  var r = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  var left = r.right + 9;
  if(left + t.width > window.innerWidth - 8) left = Math.max(8, r.left - t.width - 9);
  tipEl.style.left = Math.round(left) + "px";
  tipEl.style.top  = Math.round(Math.min(Math.max(8, r.top + r.height/2 - t.height/2),
                                         window.innerHeight - t.height - 8)) + "px";
}
document.addEventListener("mouseover", function(e){
  var el = e.target.closest ? e.target.closest("[data-tip]") : null;
  if(el) showTip(el); else hideTip();
});
document.addEventListener("focusin", function(e){
  var el = e.target.closest ? e.target.closest("[data-tip]") : null;
  if(el) showTip(el); else hideTip();
});
document.addEventListener("focusout", hideTip);
window.addEventListener("scroll", hideTip, true);
window.addEventListener("resize", hideTip);

var toastTimer;
function toast(msg){
  var t = $("#toast");
  t.textContent = msg;
  t.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove("is-on"); }, 2600);
}

/* ------------------------------------------------------------ table core */
/* Columns: {key,label,width,min,render(row)} */
function buildTable(tableId, cols, rows, guideId, opts){
  opts = opts || {};
  var table = $("#"+tableId);
  var colgroup = table.querySelector("colgroup");
  var headRow  = table.querySelector("thead tr");
  var body     = table.querySelector("tbody");

  // remember widths across re-renders
  if(!table._widths){ table._widths = cols.map(function(c){ return c.width; }); }
  if(!table._defaults){ table._defaults = cols.map(function(c){ return c.width; }); }

  colgroup.innerHTML = cols.map(function(c,i){
    return '<col style="width:'+table._widths[i]+'px">';
  }).join("");

  headRow.innerHTML = cols.map(function(c){
    return '<th class="rz-col">'+esc(c.label)+"</th>";
  }).join("");

  body.innerHTML = rows.map(function(r){
    var cls = (r.isNew ? "is-new " : "") + (opts.rowClass || "");
    cls = cls.replace(/\s+$/, "");
    var attrs = opts.rowAttrs ? opts.rowAttrs(r) : "";
    return "<tr"+(cls ? ' class="'+cls+'"' : "")+' data-id="'+r.id+'"'+attrs+">" + cols.map(function(c){
      return "<td>"+c.render(r)+"</td>";
    }).join("") + "</tr>";
  }).join("");

  applyWidths(table);
  wireResize(table, guideId);
  return table;
}

/* The table used to carry min-width:100%, which let the browser stretch every
   column proportionally whenever the grid was narrower than its container. Two
   things broke: _widths no longer matched what was on screen (so the drag guide
   sat left of the real edge), and a 100px drag moved the edge ~135px. Slack now
   goes to the LAST column only, so _widths is always the truth and dragging is
   one-to-one with the pointer. */
function applyWidths(table){
  var cols = table.querySelectorAll("colgroup col");
  var total = 0, i;
  for(i=0;i<cols.length;i++){ total += table._widths[i]; }
  var host = table.closest(".grid-scroll");
  var avail = host ? host.clientWidth : 0;
  var slack = (avail && total < avail) ? (avail - total) : 0;
  for(i=0;i<cols.length;i++){
    cols[i].style.width = (table._widths[i] + (i === cols.length-1 ? slack : 0)) + "px";
  }
  table.style.width = (total + slack) + "px";
  table.style.minWidth = "";
  renderResizeStrips(table);
}

/* One drag strip per column boundary, spanning the whole grid. Elements are
   reused rather than rebuilt, so a strip is never replaced mid-drag while it
   still holds the pointer capture. */
function renderResizeStrips(table){
  var scroller = table.closest(".grid-scroll");
  if(!scroller || !table._widths) return;
  var layer = scroller.querySelector(".rz-layer");
  if(!layer){
    layer = document.createElement("div");
    layer.className = "rz-layer";
    scroller.appendChild(layer);
  }
  var need = Math.max(0, table._widths.length - 1), i;
  if(layer.children.length !== need){
    var html = "";
    for(i = 0; i < need; i++){
      html += '<span class="rz-strip" data-i="'+i+'" title="Drag to resize \u00b7 double-click to reset"></span>';
    }
    layer.innerHTML = html;
  }
  var x = 0;
  for(i = 0; i < need; i++){
    x += table._widths[i];
    layer.children[i].style.left = (x - 5) + "px";
  }
  layer.style.width = table.offsetWidth + "px";
  layer.style.height = table.offsetHeight + "px";
}

/* the container width decides the slack, so re-apply when the window changes */
function reflowGrids(){
  $$("table.grid").forEach(function(t){ if(t._widths) applyWidths(t); });
}

function wireResize(table, guideId){
  var guide = guideId ? $("#"+guideId) : null;
  var scroller = table.closest(".grid-scroll");
  if(!scroller || scroller._resizeWired) return;
  scroller._resizeWired = true;

  scroller.addEventListener("pointerdown", function(e){
    var h = e.target.closest(".rz-strip");
    if(!h) return;
    e.preventDefault();
    var i = parseInt(h.dataset.i,10);
    var startX = e.clientX;
    var startW = table._widths[i];
    var min = 64;
    var frame = null;
    var dragging = true;
    try { h.setPointerCapture(e.pointerId); } catch(_){}
    h.classList.add("is-drag");
    document.body.classList.add("is-resizing");

    function place(){
      if(!guide || !dragging) return;
      var th = table.querySelectorAll("thead th")[i];
      if(!th) return;
      var r = th.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
      guide.style.display = "block";
      guide.style.left = Math.min(Math.max(r.right, sr.left), sr.right) + "px";
      guide.style.top = sr.top + "px";
      guide.style.height = sr.height + "px";
    }
    place();

    function move(ev){
      var w = Math.max(min, Math.min(720, startW + (ev.clientX - startX)));
      if(w === table._widths[i]) return;
      table._widths[i] = w;
      if(frame) return;
      frame = requestAnimationFrame(function(){
        frame = null;
        applyWidths(table);
        place();
      });
    }
    function up(ev){
      dragging = false;
      // A pointermove can schedule a frame that pointerup then cancels, which
      // would leave _widths correct but the DOM one frame stale. Paint once.
      if(frame){ cancelAnimationFrame(frame); frame = null; }
      applyWidths(table);
      try { h.releasePointerCapture(ev.pointerId); } catch(_){}
      h.classList.remove("is-drag");
      document.body.classList.remove("is-resizing");
      if(guide) guide.style.display = "none";
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("mousemove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("mouseup", up, true);
      window.removeEventListener("pointercancel", up, true);
    }
    // listen on the window so a fast drag that leaves the 8px handle keeps working
    window.addEventListener("pointermove", move, true);
    window.addEventListener("mousemove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("mouseup", up, true);
    window.addEventListener("pointercancel", up, true);
  });

  scroller.addEventListener("dblclick", function(e){
    var h = e.target.closest(".rz-strip");
    if(!h) return;
    var i = parseInt(h.dataset.i,10);
    table._widths[i] = table._defaults[i];
    applyWidths(table);
  });
}

/* ----------------------------------------------------------------- panes */
/* The sidebar switches pages. Clicking Leads opens the Leads page, not a
   scroll position inside one endless column. */
var PANES = ["sec-overview","sec-leads","sec-sales","sec-team","sec-dash"];
var CURRENT_PANE = "sec-overview";
function showPane(id){
  if(PANES.indexOf(id) < 0) id = PANES[0];
  CURRENT_PANE = id;
  PANES.forEach(function(name){
    var el = document.getElementById(name);
    if(el) el.classList.toggle("is-on", name === id);
  });
  $$("[data-sec]").forEach(function(b){ b.classList.toggle("is-on", b.dataset.sec === id); });
  var sc = $("#ownerScroll");
  if(sc) sc.scrollTop = 0;
  reflowGrids();   // a hidden pane measures zero, so re-place its drag strips
}

/* ------------------------------------------------------------ pagination */
var PAGE_SIZE = 50;
var PAGES = {leads:0, sales:0};
function pageSlice(kind, rows){
  var last = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  if(PAGES[kind] > last) PAGES[kind] = last;
  if(PAGES[kind] < 0) PAGES[kind] = 0;
  var start = PAGES[kind] * PAGE_SIZE;
  return rows.slice(start, start + PAGE_SIZE);
}
function pagerHTML(kind, total){
  var pages = Math.ceil(total / PAGE_SIZE);
  if(pages <= 1) return "";
  var page = PAGES[kind];
  return '<button class="pager-btn" data-page="'+kind+':'+(page-1)+'"'+(page === 0 ? " disabled" : "")+
           ' aria-label="Previous page">\u2039</button>'+
         '<span class="pager-now">Page '+(page+1)+' of '+pages+"</span>"+
         '<button class="pager-btn" data-page="'+kind+':'+(page+1)+'"'+(page >= pages-1 ? " disabled" : "")+
           ' aria-label="Next page">\u203a</button>';
}
function pageRange(total, page){
  if(!total) return "0";
  return (page*PAGE_SIZE + 1) + "\u2013" + Math.min(total, (page+1)*PAGE_SIZE) + " of " + total;
}

/* --------------------------------------------------------------- renders */
function renderChip(map, key, fallback){
  var m = map[key];
  if(!m) return '<span class="chip chip--none">'+fallback+"</span>";
  return '<span class="chip '+m.cls+'">'+m.label+"</span>";
}
var caret = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

/* The owner does not work leads — the assigned salesperson sets status and
   quality, and the owner reads them. Unset shows a dash, not an empty control. */
function readChip(map, key){
  var m = map[key];
  if(!m) return '<span class="cell-dash">\u2014</span>';
  return '<span class="chip '+m.cls+'">'+m.label+"</span>";
}

function editChip(map, key, fallback, kind, id){
  var m = map[key];
  var cls = m ? m.cls : "chip--none";
  var label = m ? m.label : fallback;
  return '<button class="cell-edit chip '+cls+'" data-edit="'+kind+'" data-id="'+id+'">'+label+caret+"</button>";
}

/* Assigning and REASSIGNING are both the owner's job, so an assigned lead stays
   clickable — but it is a name in a table cell, not a control in a pill. The
   caret only appears on hover. */
function ownerCell(l){
  var mm = member(l.owner);
  if(!mm) return '<button class="assign-btn" data-assign="'+l.id+'">+ Assign</button>';
  return '<button class="assignee" data-assign="'+l.id+'" title="Change who this lead belongs to">'+
    '<span class="avatar">'+mm.initials+"</span>"+
    '<span class="assignee-nm">'+esc(mm.name)+"</span>"+caret+"</button>";
}

function nameCell(l){
  return '<span class="td-flex">'+(l.isNew?'<span class="new-dot" title="New lead"></span>':"")+
    '<button class="name-btn" data-history="'+l.id+'" title="Open this lead\u2019s history">'+esc(l.name)+"</button></span>";
}

/* ------------------------------------------------------------ owner view */
function leadCols(){
  return [
    {key:"idx",   label:"#",           width:52,  render:function(r,i){ return '<span class="cell-idx">'+r.sn+"</span>"; }},
    {key:"name",  label:"Name",        width:172, render:nameCell},
    {key:"email", label:"Email",       width:216, render:function(r){ return '<span class="cell-mute">'+esc(r.email)+"</span>"; }},
    {key:"phone", label:"Phone",       width:150, render:function(r){ return '<span class="cell-mono">'+esc(r.phone)+"</span>"; }},
    {key:"conn",  label:"Connected",   width:108, render:function(r){
      // Yes or no. It is a fact, not a status — it needs no chip around it.
      return isConnected(r) ? '<span class="yn">Yes</span>' : '<span class="yn is-no">No</span>';
    }},
    {key:"status",label:"Status",      width:134, render:function(r){ return readChip(STATUS, r.status); }},
    {key:"qual",  label:"Quality",     width:126, render:function(r){ return readChip(QUALITY, r.quality); }},
    {key:"owner", label:"Assigned to", width:186, render:ownerCell}
  ];
}

function salesCols(){
  return [
    {key:"idx",  label:"#",            width:52,  render:function(r){ return '<span class="cell-idx">'+r.sn+"</span>"; }},
    {key:"cust", label:"Customer",     width:180, render:function(r){ return '<span class="cell-strong">'+esc(r.name)+"</span>"; }},
    {key:"ph",   label:"Phone",        width:150, render:function(r){ return '<span class="cell-mono">'+esc(r.phone)+"</span>"; }},
    {key:"amt",  label:"Amount",       width:130, render:function(r){ return '<span class="cell-money">'+money(r.amount)+"</span>"; }},
    {key:"ver",  label:"Payment",      width:136, render:function(r){
      return '<button class="cell-edit chip '+(r.verified?"chip--good":"chip--warn")+'" data-verify="'+r.id+'">'+(r.verified?"Verified":"Pending")+caret+"</button>";
    }},
    {key:"by",   label:"Converted by", width:180, render:function(r){
      var mm = member(r.owner);
      return mm ? '<span class="td-flex"><span class="avatar">'+mm.initials+'</span><span>'+esc(mm.name)+"</span></span>" : '<span class="cell-mute">—</span>';
    }},
    {key:"when", label:"Closed",       width:118, render:function(r){ return '<span class="cell-mute">'+ago(r.daysAgo)+"</span>"; }}
  ];
}

function teamCols(){
  return [
    {key:"nm",   label:"Team member",   width:200, render:function(r){
      return '<span class="td-flex"><span class="avatar">'+r.initials+'</span><span class="cell-strong">'+esc(r.name)+"</span></span>";
    }},
    {key:"as",   label:"Leads",         width:88,  render:function(r){ return '<span class="num">'+r.assigned+"</span>"; }},
    {key:"cn",   label:"Connected",     width:106, render:function(r){ return '<span class="num">'+r.connected+"</span>"; }},
    {key:"fu",   label:"Follow-ups",    width:110, render:function(r){ return '<span class="num">'+r.followups+"</span>"; }},
    {key:"cv",   label:"Converted",     width:106, render:function(r){ return '<span class="num">'+r.converted+"</span>"; }},
    {key:"td",   label:"Today",         width:112, render:function(r){ return '<span class="cell-money">'+money(r.today)+"</span>"; }},
    {key:"wk",   label:"This week",     width:124, render:function(r){ return '<span class="cell-money">'+money(r.week)+"</span>"; }},
    {key:"mo",   label:"This month",    width:130, render:function(r){ return '<span class="cell-money">'+money(r.month)+"</span>"; }},
    {key:"all",  label:"All time",      width:138, render:function(r){ return '<span class="cell-money" style="color:var(--ink)">'+money(r.all)+"</span>"; }}
  ];
}

function ago(d){
  if(d === 0) return "Today";
  if(d === 1) return "Yesterday";
  if(d < 7)  return d + " days ago";
  if(d < 31) return Math.round(d/7) + " weeks ago";
  return Math.round(d/30) + " months ago";
}

function renderOwner(){
  var all = projectLeads();
  var q = ($("#leadSearch").value || "").trim().toLowerCase();
  var shown = all.filter(function(l){
    if(!q) return true;
    return (l.name+" "+l.email+" "+l.phone).toLowerCase().indexOf(q) > -1;
  });
  shown.forEach(function(l,i){ l.sn = i+1; });   // number across the whole filtered set
  var leadPage = pageSlice("leads", shown);

  // KPIs
  var conv = converted(all);
  var gross = conv.reduce(function(s,l){ return s + (l.amount||0); }, 0);
  var kpis = [
    {k:"Total leads",   v:all.length,  s:all.filter(function(l){return l.status==="new";}).length+" waiting to be called", accent:true},
    {k:"Connected",     v:all.filter(isConnected).length, s:pct(all.filter(isConnected).length, all.length)+" of all leads"},
    {k:"Follow-ups",    v:all.filter(function(l){return l.status==="follow_up";}).length, s:"open right now"},
    {k:"Customers",     v:conv.length, s:pct(conv.length, all.length)+" conversion"},
    {k:"Gross sale",    v:money(gross), s:conv.filter(function(l){return !l.verified;}).length+" payments pending"}
  ];
  $("#kpiRow").innerHTML = kpis.map(function(x){
    return '<div class="kpi'+(x.accent?" kpi--accent":"")+'">'+
      '<div class="kpi-label">'+x.k+"</div>"+
      '<div class="kpi-value">'+x.v+"</div>"+
      '<div class="kpi-sub">'+x.s+"</div></div>";
  }).join("");

  $("#navLeads").textContent = all.length;
  $("#navSales").textContent = conv.length;
  $("#leadsSub").textContent = all.filter(function(l){return !l.owner;}).length + " unassigned";
  $("#leadsFoot").textContent = "Showing " + pageRange(shown.length, PAGES.leads) +
    (shown.length === all.length ? " leads" : " matching leads");
  $("#leadsPager").innerHTML = pagerHTML("leads", shown.length);

  buildTable("leadsGrid", leadCols(), leadPage, "guideLeads");

  // sales
  var sales = conv.slice().sort(function(a,b){ return a.daysAgo - b.daysAgo; });
  sales.forEach(function(l,i){ l.sn = i+1; });
  buildTable("salesGrid", salesCols(), pageSlice("sales", sales), "guideSales");
  $("#salesSub").textContent = sales.length + " closed deals · " + money(gross) + " gross";
  $("#salesFoot").textContent = sales.filter(function(l){return l.verified;}).length + " verified · " +
                                sales.filter(function(l){return !l.verified;}).length + " pending";
  $("#salesPager").innerHTML = pagerHTML("sales", sales.length);

  renderOverview(all, conv);

  // team tracking
  var team = MEMBERS.map(function(m){
    var mine = all.filter(function(l){ return l.owner === m.id; });
    var cv = converted(mine);
    return {
      id:m.id, name:m.name, initials:m.initials,
      assigned:mine.length,
      connected:mine.filter(isConnected).length,
      followups:mine.filter(function(l){return l.status==="follow_up";}).length,
      converted:cv.length,
      today:sum(cv.filter(function(l){return l.daysAgo===0;})),
      week:sum(cv.filter(function(l){return l.daysAgo<=6;})),
      month:sum(cv.filter(function(l){return l.daysAgo<=30;})),
      all:sum(cv)
    };
  }).sort(function(a,b){ return b.all - a.all; });
  buildTable("teamGrid", teamCols(), team, "guideTeam");
  $("#teamFoot").textContent = MEMBERS.length + " salespeople on this project";

  // sales dashboard
  var today = sum(conv.filter(function(l){ return l.daysAgo === 0; }));
  var week  = sum(conv.filter(function(l){ return l.daysAgo <= 6; }));
  var month = sum(conv.filter(function(l){ return l.daysAgo <= 30; }));
  var year  = gross;
  function deals(n){ return n + (n === 1 ? " deal" : " deals"); }
  $("#moneyGrid").innerHTML = [
    {k:"Today",      v:today, s:deals(conv.filter(function(l){return l.daysAgo===0;}).length)},
    {k:"This week",  v:week,  s:deals(conv.filter(function(l){return l.daysAgo<=6;}).length)},
    {k:"This month", v:month, s:deals(conv.filter(function(l){return l.daysAgo<=30;}).length)},
    {k:"This year",  v:year,  s:deals(conv.length)}
  ].map(function(x){
    return '<div class="money-tile"><div class="kpi-label">'+x.k+"</div>"+
      '<div class="kpi-value">'+money(x.v)+"</div>"+
      '<div class="kpi-sub">'+x.s+"</div></div>";
  }).join("");

  // last 7 days bars
  var days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  var buckets = [];
  for(var d=6; d>=0; d--){
    buckets.push({
      d:d,
      v:sum(conv.filter(function(l){ return l.daysAgo === d; }))
    });
  }
  var max = Math.max.apply(null, buckets.map(function(b){ return b.v; })) || 1;
  $("#bars").innerHTML = buckets.map(function(b){
    var h = b.v ? Math.max(4, Math.round(b.v/max*100)) : 2;
    var isToday = b.d === 0;
    var callOut = b.v && (b.v === max || isToday);
    return '<div class="bar-col'+(b.v?"":" is-zero")+(isToday?" is-today":"")+
      '" title="'+(isToday?"Today":ago(b.d))+' \u00b7 '+money(b.v)+'">'+
      '<div class="bar-value'+(callOut?" is-shown":"")+'">'+money(b.v)+"</div>"+
      '<div class="bar" style="height:'+h+'%"></div>'+
      '<div class="bar-label">'+(isToday?"Today":days[(new Date().getDay()+6-b.d)%7])+"</div></div>";
  }).join("");
  $("#weekTotal").textContent = money(week) + " this week \u00b7 " +
    deals(conv.filter(function(l){ return l.daysAgo <= 6; }).length);

  // who closed it — the same team figures, ranked, readable at a glance
  var top = team.slice().sort(function(a,b){ return b.all - a.all; });
  var topMax = Math.max.apply(null, top.map(function(t){ return t.all; })) || 1;
  $("#hbars").innerHTML = top.map(function(t){
    return '<div class="hbar'+(t.all?"":" is-zero")+'">'+
      '<span class="hbar-nm">'+esc(t.name)+"</span>"+
      '<span class="hbar-track"><span class="hbar-fill" style="width:'+
        (t.all ? Math.max(3, Math.round(t.all/topMax*100)) : 3)+'%"></span></span>'+
      '<span class="hbar-v">'+money(t.all)+"</span></div>";
  }).join("");
}

/* The Overview page is a summary that points at the other pages, not a copy of
   them — three things worth acting on, and what has happened lately. */
function renderOverview(all, conv){
  var items = [
    {n: all.filter(function(l){ return !l.owner; }).length,
     label:"leads with nobody on them", cta:"Assign", go:"sec-leads"},
    {n: all.filter(function(l){ return l.status === "follow_up"; }).length,
     label:"follow-ups open right now", cta:"Open leads", go:"sec-leads"},
    {n: conv.filter(function(l){ return !l.verified; }).length,
     label:"payments still unverified", cta:"Open sales", go:"sec-sales"}
  ];
  $("#ovAttention").innerHTML = items.map(function(x){
    return '<button class="ov-row" data-sec="'+x.go+'">'+
      '<span class="ov-n'+(x.n ? "" : " is-zero")+'">'+x.n+"</span>"+
      '<span class="ov-l">'+x.label+"</span>"+
      '<span class="ov-cta">'+x.cta+" \u2192</span></button>";
  }).join("");

  var here = {};
  all.forEach(function(l){ here[l.id] = true; });
  var recent = EVENTS.filter(function(e){ return here[e.leadId]; })
    .sort(function(a,b){ return b.at - a.at || b.id - a.id; })
    .slice(0, 8);
  $("#ovFeed").innerHTML = recent.length ? recent.map(function(e){
    var l = lead(e.leadId);
    return '<div class="ov-ev">'+
      '<span class="ov-ev-nm">'+esc(l ? l.name : "\u2014")+"</span>"+
      '<span class="ov-ev-what">'+esc(e.what)+(e.to ? " <b>"+esc(e.to)+"</b>" : "")+"</span>"+
      '<span class="ov-ev-by">'+esc(e.by)+"</span>"+
      '<span class="ov-ev-at">'+fmtWhen(e.at)+"</span></div>";
  }).join("") : '<div class="cell-dash">Nothing recorded yet.</div>';
}

function sum(list){ return list.reduce(function(s,l){ return s + (l.amount||0); }, 0); }
function pct(a,b){ return b ? Math.round(a/b*100)+"%" : "0%"; }

/* ----------------------------------------------------------- member view */
function memberCols(){
  return [
    {key:"idx",  label:"#",         width:52,  render:function(r){ return '<span class="cell-idx">'+r.sn+"</span>"; }},
    {key:"name", label:"Name",      width:180, render:nameCell},
    {key:"ph",   label:"Phone",     width:152, render:function(r){ return '<span class="cell-mono">'+esc(r.phone)+"</span>"; }},
    {key:"pr",   label:"Project",   width:158, render:function(r){ return '<span class="cell-mute">'+esc(r.project)+"</span>"; }},
    {key:"st",   label:"Status",    width:134, render:function(r){ return editChip(STATUS, r.status, "Set status", "status", r.id); }},
    {key:"ql",   label:"Quality",   width:126, render:function(r){ return editChip(QUALITY, r.quality, "Not set", "quality", r.id); }},
    {key:"am",   label:"Sale",      width:120, render:function(r){
      return r.amount ? '<span class="cell-money">'+money(r.amount)+"</span>" : '<span class="cell-mute">—</span>';
    }}
  ];
}
function memberSalesCols(){
  return [
    {key:"idx",  label:"#",        width:52,  render:function(r){ return '<span class="cell-idx">'+r.sn+"</span>"; }},
    {key:"cust", label:"Customer", width:190, render:function(r){ return '<span class="cell-strong">'+esc(r.name)+"</span>"; }},
    {key:"pr",   label:"Project",  width:170, render:function(r){ return '<span class="cell-mute">'+esc(r.project)+"</span>"; }},
    {key:"amt",  label:"Amount",   width:130, render:function(r){ return '<span class="cell-money">'+money(r.amount)+"</span>"; }},
    {key:"ver",  label:"Payment",  width:130, render:function(r){
      return '<span class="chip '+(r.verified?"chip--good":"chip--warn")+'">'+(r.verified?"Verified":"Pending")+"</span>";
    }},
    {key:"when", label:"Closed",   width:130, render:function(r){ return '<span class="cell-mute">'+ago(r.daysAgo)+"</span>"; }}
  ];
}

function renderMember(){
  var mine = LEADS.filter(function(l){ return l.owner === ME; });
  mine.forEach(function(l,i){ l.sn = i+1; });
  var cv = converted(mine);

  var kpis = [
    {k:"My leads",   v:mine.length, s:mine.filter(function(l){return l.status==="new";}).length+" not called yet", accent:true},
    {k:"Connected",  v:mine.filter(isConnected).length, s:pct(mine.filter(isConnected).length, mine.length)+" of my leads"},
    {k:"Follow-ups", v:mine.filter(function(l){return l.status==="follow_up";}).length, s:"need a next call"},
    {k:"Converted",  v:cv.length,   s:pct(cv.length, mine.length)+" conversion"},
    {k:"My sales",   v:money(sum(cv)), s:cv.filter(function(l){return !l.verified;}).length+" awaiting verification"}
  ];
  $("#memberKpis").innerHTML = kpis.map(function(x){
    return '<div class="kpi'+(x.accent?" kpi--accent":"")+'">'+
      '<div class="kpi-label">'+x.k+"</div>"+
      '<div class="kpi-value">'+x.v+"</div>"+
      '<div class="kpi-sub">'+x.s+"</div></div>";
  }).join("");

  buildTable("memberGrid", memberCols(), mine, "guideMember");
  $("#memberLeadsSub").textContent = mine.length + " leads across " +
    (mine.map(function(l){return l.project;}).filter(function(v,i,a){return a.indexOf(v)===i;}).length) + " projects";
  $("#memberFoot").textContent = mine.length + " leads";

  var sales = cv.slice().sort(function(a,b){ return a.daysAgo - b.daysAgo; });
  sales.forEach(function(l,i){ l.sn = i+1; });
  buildTable("memberSalesGrid", memberSalesCols(), sales, "guideMemberSales");
  $("#memberSalesSub").textContent = sales.length + " closed · " + money(sum(sales)) + " total";
  $("#memberSalesFoot").textContent = sales.filter(function(l){return l.verified;}).length + " verified · " +
                                      sales.filter(function(l){return !l.verified;}).length + " pending";

  var news = mine.filter(function(l){ return l.isNew; });
  var banner = $("#memberBanner");
  if(news.length){
    banner.hidden = false;
    $("#bannerTitle").textContent = news.length + (news.length===1 ? " new lead assigned to you" : " new leads assigned to you");
  } else {
    banner.hidden = true;
  }
}

/* --------------------------------------------------------------- menus */
var openMenu = null;
function closeMenu(){ if(openMenu){ openMenu.remove(); openMenu = null; } }

function showMenu(anchor, items, current, onPick){
  closeMenu();
  var m = document.createElement("div");
  m.className = "menu";
  m.innerHTML = items.map(function(it){
    return '<button data-v="'+it.value+'" class="'+(it.value===current?"is-on":"")+'">'+
      (it.html ? it.html : '<span class="chip '+it.cls+'">'+it.label+"</span>")+
      '<svg class="tick" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'+
      "</button>";
  }).join("");
  document.body.appendChild(m);
  var r = anchor.getBoundingClientRect();
  var top = r.bottom + 6;
  if(top + m.offsetHeight > window.innerHeight - 10){ top = r.top - m.offsetHeight - 6; }
  m.style.top = Math.max(10, top) + "px";
  m.style.left = Math.min(r.left, window.innerWidth - m.offsetWidth - 12) + "px";
  m.addEventListener("click", function(e){
    var b = e.target.closest("button[data-v]");
    if(!b) return;
    onPick(b.dataset.v);
    closeMenu();
  });
  openMenu = m;
}

document.addEventListener("click", function(e){
  if(openMenu && !e.target.closest(".menu") && !e.target.closest("[data-edit]") &&
     !e.target.closest("[data-assign]") && !e.target.closest("[data-verify]")) closeMenu();
});
window.addEventListener("resize", function(){ closeMenu(); reflowGrids(); });

/* --------------------------------------------------------------- events */
function rerender(){
  if($("#screen-project").classList.contains("is-active")) renderOwner();
  if($("#screen-member").classList.contains("is-active")) renderMember();
}

document.addEventListener("click", function(e){
  var t = e.target;

  // status / quality editors
  var ed = t.closest("[data-edit]");
  if(ed){
    var id = ed.dataset.id;
    var l = lead(id);
    if(!l) return;
    if(ed.dataset.edit === "status"){
      showMenu(ed, Object.keys(STATUS).map(function(k){
        return {value:k, label:STATUS[k].label, cls:STATUS[k].cls};
      }), l.status, function(v){
        if(v === "converted" && !l.amount){
          openSaleModal(l);
        } else {
          var was = STATUS[l.status] ? STATUS[l.status].label : "";
          l.status = v;
          l.isNew = false;
          if(v !== "converted"){ delete l.amount; delete l.verified; delete l.daysAgo; }
          save(l.id, {status:v, amount:l.amount||0, verified:!!l.verified});
          logEvent(l.id, "Status", was, STATUS[v].label, byName(l.owner));
          rerender();
          toast(l.name + " — status set to " + STATUS[v].label);
        }
      });
    } else {
      showMenu(ed, Object.keys(QUALITY).map(function(k){
        return {value:k, label:QUALITY[k].label, cls:QUALITY[k].cls};
      }), l.quality, function(v){
        var was = QUALITY[l.quality] ? QUALITY[l.quality].label : "Not set";
        l.quality = v; l.isNew = false;
        save(l.id, {quality:v});
        logEvent(l.id, "Quality", was, QUALITY[v].label, byName(l.owner));
        rerender();
        toast(l.name + " — marked " + QUALITY[v].label);
      });
    }
    return;
  }

  // payment verify toggle
  var ver = t.closest("[data-verify]");
  if(ver){
    var vl = lead(ver.dataset.verify);
    showMenu(ver, [
      {value:"yes", label:"Verified", cls:"chip--good"},
      {value:"no",  label:"Pending",  cls:"chip--warn"}
    ], vl.verified ? "yes" : "no", function(v){
      var was = vl.verified ? "Verified" : "Pending";
      vl.verified = (v === "yes");
      save(vl.id, {verified: vl.verified});
      logEvent(vl.id, "Payment", was, vl.verified ? "Verified" : "Pending", "Owner");
      rerender();
      toast(vl.name + " — payment " + (vl.verified ? "verified" : "marked pending"));
    });
    return;
  }

  // lead history
  var hs = t.closest("[data-history]");
  if(hs){ openHistory(hs.dataset.history); return; }

  // assign / reassign
  var asg = t.closest("[data-assign]");
  if(asg){ openAssignMenu(asg, asg.dataset.assign); return; }

  // screen routing
  var go = t.closest("[data-go]");
  if(go){
    // "landing" is the sign-out affordance in the topbar; end the real session.
    if(go.dataset.go === "landing"){ DB.signOut(); return; }
    goTo(go.dataset.go); return;
  }

  var si = t.closest("[data-signin]");
  if(si){ goTo(si.dataset.signin === "owner" ? "projects" : "member"); return; }

  // project cards
  var pc = t.closest("[data-project]");
  if(pc){
    var pRow = null;
    for(var pi=0; pi<PROJECTS.length; pi++){ if(PROJECTS[pi].id === pc.dataset.project) pRow = PROJECTS[pi]; }
    if(pRow){ CURRENT_PROJECT = pRow.name; CURRENT_PID = pRow.id; goTo("project"); }
    return;
  }

  // modals
  var md = t.closest("[data-modal]");
  if(md){
    if(md.dataset.modal === "import") openImport();
    else $("#"+md.dataset.modal+"Modal").hidden = false;
    return;
  }
  if(t.closest("[data-close]")){ closeModals(); return; }
  var ct = t.closest("[data-close-toast]");
  if(ct){ closeModals(); toast(ct.dataset.closeToast); return; }
  if(t.classList.contains("backdrop")){ closeModals(); return; }

  // density
  var dn = t.closest("[data-density]");
  if(dn){
    var on = dn.dataset.density === "comfortable";
    // scoped to density buttons — the Cards/List segment is a .seg too
    $$("[data-density]").forEach(function(b){
      b.classList.toggle("is-on", b.dataset.density === dn.dataset.density);
    });
    $$(".screen--app").forEach(function(s){ s.classList.toggle("dense-comfortable", on); });
    return;
  }

  // sidebar / chip-strip: switch page
  var sec = t.closest("[data-sec]");
  if(sec){ showPane(sec.dataset.sec); return; }

  // pagination
  var pg = t.closest("[data-page]");
  if(pg){
    var bits = pg.dataset.page.split(":");
    PAGES[bits[0]] = parseInt(bits[1], 10);
    renderOwner();
    var sc = $("#ownerScroll");
    if(sc) sc.scrollTop = 0;
    return;
  }

  // projects: cards / list
  var pv = t.closest("[data-projview]");
  if(pv){
    PROJ_VIEW = pv.dataset.projview;
    $$("[data-projview]").forEach(function(b){ b.classList.toggle("is-on", b.dataset.projview === PROJ_VIEW); });
    renderProjects();
    return;
  }

  // theme — topbar sun/moon
  if(t.closest("[data-theme-toggle]")){
    applyTheme(effectiveTheme() === "dark" ? "light" : "dark");
    return;
  }

  // theme — prototype panel, including "match device"
  var th = t.closest("[data-theme-set]");
  if(th){
    var v = th.dataset.themeSet;
    applyTheme(v === "system" ? null : v);
    return;
  }
});

$("#projSelect").addEventListener("change", function(){
  var v = this.value;
  if(v === "__all"){ goTo("projects"); return; }
  var picked = null;
  for(var i=0;i<PROJECTS.length;i++){ if(PROJECTS[i].id === v) picked = PROJECTS[i]; }
  if(picked && picked.live){ goTo("project"); return; }
  toast("Prototype — Funding Room is the fully wired-up example.");
  renderProjSelect();
});

$("#bannerDismiss").addEventListener("click", function(){ $("#memberBanner").hidden = true; });
$("#leadSearch").addEventListener("input", function(){ PAGES.leads = 0; renderOwner(); });
$("#protoToggle").addEventListener("click", function(){
  var p = $("#protoPanel"); p.hidden = !p.hidden;
});

document.addEventListener("keydown", function(e){
  if(e.key === "Escape"){ closeModals(); closeMenu(); $("#protoPanel").hidden = true; }
});

function closeModals(){ $$(".backdrop").forEach(function(b){ b.hidden = true; }); }

/* --------------------------------------------------------------- assign */
/* Assignment is a one-tap choice between five people, so it uses the same
   dropdown as the status and quality cells. A modal was too much furniture. */
function openAssignMenu(anchor, id){
  var l = lead(id);
  if(!l) return;
  var items = MEMBERS.map(function(mm){
    return {value: mm.id, html:
      '<span class="menu-person"><span class="avatar">'+mm.initials+"</span>"+
      "<span>"+esc(mm.name)+"</span></span>"};
  });
  if(l.owner){
    items.push({value:"__none", html:'<span class="menu-person menu-person--none"><span>Unassign</span></span>'});
  }
  showMenu(anchor, items, l.owner, function(v){
    var was = l.owner ? member(l.owner).name : "Unassigned";
    if(v === "__none"){
      l.owner = null; l.isNew = false;
      save(l.id, {owner:null});
      logEvent(l.id, "Assigned", was, "Unassigned", "Owner");
      rerender();
      toast(l.name + " is unassigned again");
      return;
    }
    if(l.owner === v) return;
    l.owner = v; l.isNew = true;
    save(l.id, {owner:v});
    logEvent(l.id, "Assigned", was, member(v).name, "Owner");
    rerender();
    toast(l.name + (was === "Unassigned" ? " assigned to " : " moved to ") + member(v).name);
  });
}

/* ------------------------------------------------------------- importing */
/* Adarsh runs Metrol's Meta ads, so leads arrive in bulk far more often than
   one at a time. CSV is parsed here; .xlsx goes through SheetJS, and if that
   script did not load the modal says so rather than failing silently. */
var impRows = null;

function parseCSV(text){
  var rows = [], row = [], cur = "", q = false;
  for(var i = 0; i < text.length; i++){
    var c = text.charAt(i);
    if(q){
      if(c === '"'){ if(text.charAt(i+1) === '"'){ cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if(c === '"'){ q = true; }
    else if(c === ","){ row.push(cur); cur = ""; }
    else if(c === "\n"){ row.push(cur); rows.push(row); row = []; cur = ""; }
    else if(c !== "\r"){ cur += c; }
  }
  if(cur !== "" || row.length){ row.push(cur); rows.push(row); }
  return rows.filter(function(r){
    return r.some(function(x){ return String(x == null ? "" : x).trim() !== ""; });
  });
}

function mapImport(rows){
  if(!rows || rows.length < 2) return {error:"That file has no rows under the header."};
  var head = rows[0].map(function(h){ return String(h == null ? "" : h).trim().toLowerCase(); });
  function col(names){
    for(var i = 0; i < names.length; i++){
      var k = head.indexOf(names[i]);
      if(k > -1) return k;
    }
    return -1;
  }
  var iName  = col(["name","full name","lead name","customer","customer name"]);
  var iPhone = col(["phone","mobile","phone number","mobile number","contact","contact number"]);
  var iEmail = col(["email","e-mail","email address","mail"]);
  var iOwner = col(["assign to","assigned to","owner","salesperson","sales person"]);
  if(iName < 0 && iPhone < 0){
    return {error:'No "Name" or "Phone" column in the header row. Rename the header and try again.'};
  }
  function cell(r, i){ return i < 0 ? "" : String(r[i] == null ? "" : r[i]).trim(); }

  var seen = {}, out = [], dupes = 0, blanks = 0;
  projectLeads().forEach(function(l){ seen[String(l.phone).replace(/\D/g,"")] = true; });

  rows.slice(1).forEach(function(r){
    var name = cell(r, iName), phone = cell(r, iPhone);
    if(!name && !phone){ blanks++; return; }
    var key = phone.replace(/\D/g,"");
    if(key && seen[key]){ dupes++; return; }
    if(key) seen[key] = true;
    var ownerName = cell(r, iOwner).toLowerCase();
    var owner = null;
    MEMBERS.forEach(function(m){ if(ownerName && m.name.toLowerCase() === ownerName) owner = m.id; });
    out.push({
      name: name || "(no name)",
      email: cell(r, iEmail) || "\u2014",
      phone: phone || "\u2014",
      owner: owner
    });
  });
  return {leads:out, dupes:dupes, blanks:blanks};
}

function impSay(msg, kind){
  var el = $("#impResult");
  el.hidden = false;
  el.className = "imp-result" + (kind ? " is-" + kind : "");
  el.innerHTML = msg;
}

function impLoad(file){
  if(!file) return;
  impRows = null;
  $("#impGo").disabled = true;
  $("#impDrop").classList.add("has-file");
  $("#impDropName").textContent = file.name;
  $("#impDropHint").textContent = "Reading\u2026";

  var done = function(rows, err){
    if(err){ impSay(esc(err), "bad"); $("#impDropHint").textContent = "Pick another file"; return; }
    var m = mapImport(rows);
    if(m.error){ impSay(esc(m.error), "bad"); $("#impDropHint").textContent = "Pick another file"; return; }
    impRows = m.leads;
    $("#impDropHint").textContent = "Ready to import";
    var bits = ["<b>" + m.leads.length + "</b> lead" + (m.leads.length === 1 ? "" : "s") + " found"];
    if(m.dupes)  bits.push(m.dupes + " skipped as duplicate phone numbers");
    if(m.blanks) bits.push(m.blanks + " blank rows ignored");
    impSay(bits.join(" \u00b7 "), m.leads.length ? "ok" : "bad");
    $("#impGo").disabled = !m.leads.length;
  };

  var lower = file.name.toLowerCase();
  if(/\.(xlsx|xls)$/.test(lower)){
    if(!window.XLSX){
      done(null, "The Excel reader could not load. Save the sheet as CSV and import that.");
      return;
    }
    var fr = new FileReader();
    fr.onload = function(){
      try {
        var wb = XLSX.read(new Uint8Array(fr.result), {type:"array"});
        done(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:""}), null);
      } catch(_){ done(null, "That file could not be read as a spreadsheet."); }
    };
    fr.onerror = function(){ done(null, "The file could not be opened."); };
    fr.readAsArrayBuffer(file);
  } else {
    var fr2 = new FileReader();
    fr2.onload = function(){
      try { done(parseCSV(String(fr2.result)), null); }
      catch(_){ done(null, "That file could not be read as CSV."); }
    };
    fr2.onerror = function(){ done(null, "The file could not be opened."); };
    fr2.readAsText(file);
  }
}

function openImport(){
  impRows = null;
  $("#impGo").disabled = true;
  $("#impFile").value = "";
  $("#impResult").hidden = true;
  $("#impDrop").classList.remove("has-file","is-over");
  $("#impDropName").textContent = "Choose a file";
  $("#impDropHint").textContent = "or drop it here \u2014 .xlsx or .csv";
  $("#impAssign").innerHTML = '<option value="">Leave unassigned</option>' +
    MEMBERS.map(function(m){ return '<option value="'+m.id+'">'+esc(m.name)+"</option>"; }).join("");
  $("#importModal").hidden = false;
}

function runImport(){
  if(!impRows || !impRows.length) return;
  var bulk = $("#impAssign").value || null;
  var nextId = LEADS.reduce(function(mx, l){ return Math.max(mx, l.id); }, 0);
  var n = 0;
  impRows.forEach(function(r){
    var owner = r.owner || bulk || null;
    var l = {
      id: ++nextId, name: r.name, email: r.email, phone: r.phone,
      status: "new", quality: null, owner: owner,
      project: CURRENT_PROJECT, source: "Excel import", isNew: true
    };
    LEADS.push(l);
    logEvent(l.id, "Lead created", "", "Excel import", "Owner");
    if(owner) logEvent(l.id, "Assigned", "Unassigned", member(owner).name, "Owner");
    n++;
  });
  impRows = null;
  closeModals();
  rerender();
  renderProjects();
  toast(n + " lead" + (n === 1 ? "" : "s") + " imported into " + CURRENT_PROJECT +
        (bulk ? " and assigned to " + member(bulk).name : ""));
}

$("#impDrop").addEventListener("click", function(){ $("#impFile").click(); });
$("#impDrop").addEventListener("keydown", function(e){
  if(e.key === "Enter" || e.key === " "){ e.preventDefault(); $("#impFile").click(); }
});
$("#impFile").addEventListener("change", function(){ impLoad(this.files && this.files[0]); });
["dragenter","dragover"].forEach(function(t){
  $("#impDrop").addEventListener(t, function(e){ e.preventDefault(); this.classList.add("is-over"); });
});
["dragleave","drop"].forEach(function(t){
  $("#impDrop").addEventListener(t, function(e){ e.preventDefault(); this.classList.remove("is-over"); });
});
$("#impDrop").addEventListener("drop", function(e){
  var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if(f) impLoad(f);
});
$("#impGo").addEventListener("click", runImport);

/* ------------------------------------------------------------- history UI */
function openHistory(id){
  var l = lead(id);
  if(!l) return;
  $("#histTitle").textContent = l.name;
  $("#histMeta").innerHTML = [
    ["Phone",       esc(l.phone)],
    ["Project",     esc(l.project)],
    ["Source",      esc(l.source || "Manual entry")],
    ["Status",      STATUS[l.status] ? STATUS[l.status].label : "\u2014"],
    ["Quality",     l.quality ? QUALITY[l.quality].label : "\u2014"],
    ["Assigned to", l.owner ? esc(member(l.owner).name) : "Unassigned"],
    ["Sale",        l.amount ? money(l.amount) + (l.verified ? " \u00b7 verified" : " \u00b7 pending") : "\u2014"]
  ].map(function(x){
    return '<div><span class="k">'+x[0]+'</span><span class="v">'+x[1]+"</span></div>";
  }).join("");

  var evs = leadEvents(id);
  $("#histBody").innerHTML = evs.length ? evs.map(function(e){
    return "<tr><td class=\"when\">"+fmtWhen(e.at)+"</td>"+
      "<td class=\"what\">"+esc(e.what)+"</td>"+
      "<td>"+(e.from ? esc(e.from) : '<span class="cell-dash">\u2014</span>')+"</td>"+
      "<td>"+(e.to ? esc(e.to) : '<span class="cell-dash">\u2014</span>')+"</td>"+
      "<td>"+esc(e.by)+"</td></tr>";
  }).join("") : '<tr><td colspan="5" class="cell-dash">Nothing recorded for this lead yet.</td></tr>';
  $("#historyModal").hidden = false;
}

/* Back-fill a plausible trail for the sample leads, so the history table shows
   a real journey instead of being empty until someone clicks something. */
function seedHistory(){
  var DAY = 86400000, HR = 3600000, now = Date.now();
  /* Nothing back-filled may be stamped later than this. A lead closed TODAY has
     ct === now, and the old code then added 0.05 and 0.4 of a day to it for the
     sale and the payment — putting both in the FUTURE. Sorted newest-first they
     sat above anything the user actually did, so a real change looked like it
     had not registered. Every seeded time is now clamped into the past. */
  var CAP = now - 5 * 60000;
  function past(t){ return Math.min(t, CAP); }

  LEADS.forEach(function(l, i){
    if(!l.source) l.source = SOURCES[i % SOURCES.length];
    var closed = (l.daysAgo == null) ? null : l.daysAgo;
    var age = (closed == null) ? 3 + (i % 12) : closed + 2 + (i % 5);
    var t = now - age * DAY;
    var who = l.owner ? member(l.owner).name : "\u2014";
    logEvent(l.id, "Lead created", "", l.source, "System", past(t));
    if(l.owner){ t += 0.25*DAY; logEvent(l.id, "Assigned", "Unassigned", who, "Owner", past(t)); }
    if(l.status !== "new"){
      t += 0.5*DAY; logEvent(l.id, "Status", "New", "Connected", who, past(t));
    }
    if(l.quality){
      t += 0.15*DAY; logEvent(l.id, "Quality", "Not set", QUALITY[l.quality].label, who, past(t));
    }
    if(l.status === "follow_up"){ t += 0.4*DAY; logEvent(l.id, "Status", "Connected", "Follow-up", who, past(t)); }
    if(l.status === "dead"){     t += 0.4*DAY; logEvent(l.id, "Status", "Connected", "Dead", who, past(t)); }
    if(l.status === "converted"){
      // a deal closed today is anchored six hours back so its own chain still fits
      var ct = now - closed * DAY - (closed === 0 ? 6 * HR : 0);
      logEvent(l.id, "Status", "Connected", "Converted", who, past(ct));
      logEvent(l.id, "Sale recorded", "", money(l.amount), who, past(ct + 0.03*DAY));
      if(l.verified) logEvent(l.id, "Payment", "Pending", "Verified", "Owner", past(ct + 0.12*DAY));
    }
  });
}

/* ----------------------------------------------------------- sale modal */
var saleLead = null;
function openSaleModal(l){
  saleLead = l;
  $("#saleLeadName").textContent = l.name + " · " + l.project;
  $("#saleAmount").value = "";
  $("#saleModal").hidden = false;
  setTimeout(function(){ $("#saleAmount").focus(); }, 30);
}
$("#saleSave").addEventListener("click", function(){
  var v = parseInt($("#saleAmount").value, 10);
  if(!v || v <= 0){ toast("Enter the sale amount to continue."); return; }
  var wasStatus = STATUS[saleLead.status] ? STATUS[saleLead.status].label : "";
  saleLead.status = "converted";
  saleLead.amount = v;
  saleLead.verified = false;
  saleLead.daysAgo = 0;
  saleLead.isNew = false;
  if(!saleLead.quality) saleLead.quality = "good";
  logEvent(saleLead.id, "Status", wasStatus, "Converted", byName(saleLead.owner));
  logEvent(saleLead.id, "Sale recorded", "", money(v), byName(saleLead.owner));
  closeModals();
  rerender();
  toast(saleLead.name + " converted — " + money(v) + " added to sales");
});

/* -------------------------------------------------------------- routing */
var SCREENS = ["landing","signin","projects","project","member"];
function goTo(name){
  SCREENS.forEach(function(s){
    $("#screen-"+s).classList.toggle("is-active", s === name);
  });
  $$("#protoPanel [data-go]").forEach(function(b){ b.classList.toggle("is-on", b.dataset.go === name); });
  closeMenu(); closeModals();
  if(name === "projects") renderProjects();
  if(name === "project"){
    PAGES.leads = 0; PAGES.sales = 0;
    renderOwner(); renderRail(); renderProjSelect();
    showPane("sec-overview");
  }
  if(name === "member") renderMember();
  window.scrollTo(0,0);
}

var PROJ_VIEW = "cards";

function initialsOf(name){
  var w = String(name).trim().split(/\s+/);
  if(w.length < 2) return w[0].slice(0,2).toUpperCase();
  return (w[0].charAt(0) + w[1].charAt(0)).toUpperCase();
}

/* A project photo is drawn inline as an SVG data URI. The published Artifact
   blocks images from outside hosts, so nothing here may be a remote URL —
   a real uploaded photo would be stored and served the same self-contained way. */
function coverURI(p, withLabel){
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270" preserveAspectRatio="xMidYMid slice">'+
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'+
      '<stop offset="0" stop-color="'+p.c1+'"/><stop offset="1" stop-color="'+p.c2+'"/>'+
    '</linearGradient></defs>'+
    '<rect width="480" height="270" fill="url(#g)"/>'+
    '<circle cx="398" cy="58" r="88" fill="#F5C518" opacity="0.17"/>'+
    '<path d="M0 208 L136 148 L266 198 L392 126 L480 164 L480 270 L0 270 Z" fill="#000000" opacity="0.24"/>'+
    // at 44px wide the baked-in label is an illegible smudge, so list thumbnails drop it
    (withLabel ? '<text x="28" y="232" font-family="Archivo, Helvetica, sans-serif" font-size="44" font-weight="700" fill="#FFFFFF" opacity="0.9">'+
      initialsOf(p.name)+'</text>' : "")+
    '</svg>';
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function mediaHTML(p, small){
  if(p.c1) return '<img src="'+coverURI(p, !small)+'" alt="">';
  return '<div class="proj-ph"><b>'+initialsOf(p.name)+'</b><i>No photo yet</i></div>';
}

function projCols(){
  return [
    {key:"idx",  label:"#",           width:52,  render:function(r){ return '<span class="cell-idx">'+r.sn+"</span>"; }},
    {key:"th",   label:"Photo",       width:78,  render:function(r){ return '<span class="thumb-sm">'+mediaHTML(r, true)+"</span>"; }},
    {key:"nm",   label:"Project",     width:186, render:function(r){ return '<span class="cell-strong">'+esc(r.name)+"</span>"; }},
    {key:"ds",   label:"Description", width:300, render:function(r){ return '<span class="cell-mute">'+esc(r.desc)+"</span>"; }},
    {key:"ld",   label:"Leads",       width:92,  render:function(r){ return '<span class="num">'+inr.format(r._leads)+"</span>"; }},
    {key:"cu",   label:"Customers",   width:112, render:function(r){ return '<span class="num">'+inr.format(r._cust)+"</span>"; }},
    {key:"gr",   label:"Gross sale",  width:132, render:function(r){ return '<span class="cell-money">'+money(r._gross)+"</span>"; }},
    {key:"st",   label:"Status",      width:104, render:function(r){
      return '<span class="chip '+(r.status==="Active"?"chip--good":"chip--mute")+'">'+r.status+"</span>";
    }}
  ];
}

function projectRows(){
  var live = projectLeads();
  var liveConv = converted(live);
  return PROJECTS.map(function(p,i){
    var o = {};
    for(var k in p){ if(Object.prototype.hasOwnProperty.call(p,k)) o[k] = p[k]; }
    o.sn = i + 1;
    o._leads = p.live ? live.length     : p.leads;
    o._cust  = p.live ? liveConv.length : p.customers;
    o._gross = p.live ? sum(liveConv)   : p.gross;
    return o;
  });
}

function renderProjects(){
  var rows = projectRows();

  $("#projGrid").innerHTML = rows.map(function(p){
    var team = MEMBERS.slice(0, p.team);
    return '<button class="proj-card" data-project="'+p.id+'" data-live="'+(p.live?"1":"0")+'">'+
      '<div class="proj-media">'+mediaHTML(p)+"</div>"+
      '<div class="proj-body">'+
        '<div class="proj-top"><h3>'+esc(p.name)+"</h3>"+
          '<span class="chip '+(p.status==="Active"?"chip--good":"chip--mute")+'">'+p.status+"</span></div>"+
        '<p class="proj-desc">'+esc(p.desc)+"</p>"+
        '<div class="proj-stats">'+
          '<div class="proj-stat"><span class="v">'+inr.format(p._leads)+'</span><span class="k">Leads</span></div>'+
          '<div class="proj-stat"><span class="v">'+inr.format(p._cust)+'</span><span class="k">Customers</span></div>'+
          '<div class="proj-stat"><span class="v">'+money(p._gross)+'</span><span class="k">Gross sale</span></div>'+
        "</div>"+
        '<div class="proj-foot"><span class="stack">'+team.map(function(m){
          return '<span class="avatar">'+m.initials+"</span>";
        }).join("")+"</span><span>"+p.team+" people · updated "+p.updated+"</span></div>"+
      "</div>"+
    "</button>";
  }).join("");

  buildTable("projListGrid", projCols(), rows, "guideProjects", {
    rowClass:"row-link",
    rowAttrs:function(r){ return ' data-project="'+r.id+'" data-live="'+(r.live?"1":"0")+'"'; }
  });
  $("#projListFoot").textContent = rows.length + " projects";

  var cards = PROJ_VIEW === "cards";
  $("#projGrid").hidden = !cards;
  $("#projListShell").hidden = cards;
  $("#projCount").textContent = PROJECTS.filter(function(p){return p.status==="Active";}).length + " active projects";
}

/* --------------------------------------------------- sidebar 1: proj rail */
function renderRail(){
  var list = $("#projRailList");
  if(!list) return;
  list.innerHTML =
    '<button class="rail-btn" data-go="projects" aria-label="All projects" data-tip="All projects">'+
      '<span class="rail-mark"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">'+
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>'+
      '<rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></span>'+
      '<span class="rail-name">All projects</span></button>'+
    '<div class="rail-sep"></div>'+
    PROJECTS.map(function(p){
      var on = p.name === CURRENT_PROJECT;
      return '<button class="rail-btn'+(on?" is-on":"")+'" data-project="'+p.id+'" data-live="'+(p.live?"1":"0")+'"'+
        ' aria-label="'+esc(p.name)+'" data-tip="'+esc(p.name)+'"'+(on?' aria-current="true"':"")+'>'+
        '<span class="rail-mark">'+initialsOf(p.name)+"</span>"+
        '<span class="rail-name">'+esc(p.name)+"</span></button>";
    }).join("");
}

/* ------------------------------------------------------- resizable panes */
/* Both sidebars drag like a table column, remember their width, and reset on
   double-click. The projects rail swaps monograms for full names once it is
   wide enough to hold them. */
var RAIL_MIN = 56, RAIL_MAX = 300, RAIL_DEF = 64, RAIL_WIDE = 132;
var SIDE_MIN = 168, SIDE_MAX = 380, SIDE_DEF = 214;
var SIDE_SNAP = 150, SIDE_MINI = 64;   // drag narrower than SNAP and it folds

function setRailWidth(w){
  w = Math.max(RAIL_MIN, Math.min(RAIL_MAX, Math.round(w)));
  document.documentElement.style.setProperty("--rail-w", w + "px");
  var rail = $("#projRail");
  if(rail) rail.classList.toggle("is-wide", w >= RAIL_WIDE);
  paintRailToggle();
  return w;
}
/* Dragging is the primary gesture: pull the edge left past SIDE_SNAP and the
   sidebar folds to icons by itself, pull it back out and it opens again. The
   chevron does the same thing in one click for anyone who would rather not drag. */
function setSideWidth(w){
  if(w < SIDE_SNAP){
    setSideMini(true, false);
    return SIDE_MINI;
  }
  setSideMini(false, false);
  w = Math.max(SIDE_MIN, Math.min(SIDE_MAX, Math.round(w)));
  document.documentElement.style.setProperty("--side-w", w + "px");
  return w;
}

function wirePaneResize(handleId, paneId, apply, storeKey, def, commit){
  var h = $("#"+handleId), pane = $("#"+paneId);
  if(!h || !pane) return;
  h.addEventListener("pointerdown", function(e){
    e.preventDefault();
    var startX = e.clientX;
    var startW = pane.getBoundingClientRect().width;
    var frame = null, latest = startW;
    try { h.setPointerCapture(e.pointerId); } catch(_){}
    h.classList.add("is-drag");
    document.body.classList.add("is-resizing");
    function move(ev){
      latest = startW + (ev.clientX - startX);
      if(frame) return;
      frame = requestAnimationFrame(function(){ frame = null; apply(latest); });
    }
    function up(ev){
      if(frame){ cancelAnimationFrame(frame); frame = null; }
      var w = apply(latest);
      storeSet(storeKey, String(w));
      if(commit) commit();
      reflowGrids();
      try { h.releasePointerCapture(ev.pointerId); } catch(_){}
      h.classList.remove("is-drag");
      document.body.classList.remove("is-resizing");
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("mousemove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("mouseup", up, true);
      window.removeEventListener("pointercancel", up, true);
    }
    window.addEventListener("pointermove", move, true);
    window.addEventListener("mousemove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("mouseup", up, true);
    window.addEventListener("pointercancel", up, true);
  });
  h.addEventListener("dblclick", function(){
    apply(def); storeSet(storeKey, String(def));
    if(commit) commit();
    reflowGrids();
  });
}

var CHEV_L = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
var CHEV_R = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

/* Either sidebar can be dropped to icons only, which hands the width back to
   the grid. Both remember the choice. */
function setSideMini(on, persist){
  var nav = $("#sideNav"), b = $("#sideToggle");
  if(!nav) return;
  nav.classList.toggle("is-mini", !!on);
  if(b){
    b.innerHTML = on ? CHEV_R : CHEV_L;
    b.setAttribute("title", on ? "Expand sidebar" : "Collapse to icons");
    b.setAttribute("aria-label", b.getAttribute("title"));
  }
  if(persist !== false){ storeSet("metrol-crm-side-mini", on ? "1" : "0"); reflowGrids(); }
}

function paintRailToggle(){
  var b = $("#railToggle"), rail = $("#projRail");
  if(!b || !rail) return;
  var wide = rail.classList.contains("is-wide");
  b.innerHTML = wide ? CHEV_L : CHEV_R;
  b.setAttribute("title", wide ? "Show icons only" : "Show project names");
  b.setAttribute("aria-label", b.getAttribute("title"));
}

function initPanes(){
  var r = parseInt(storeGet("metrol-crm-rail-w"), 10);
  var d = parseInt(storeGet("metrol-crm-side-w"), 10);
  setRailWidth(isNaN(r) ? RAIL_DEF : r);
  setSideWidth(isNaN(d) ? SIDE_DEF : d);
  wirePaneResize("railRz", "projRail", setRailWidth, "metrol-crm-rail-w", RAIL_DEF);
  wirePaneResize("sideRz", "sideNav", setSideWidth, "metrol-crm-side-w", SIDE_DEF, function(){
    storeSet("metrol-crm-side-mini", $("#sideNav").classList.contains("is-mini") ? "1" : "0");
  });

  setSideMini(storeGet("metrol-crm-side-mini") === "1", false);
  var st = $("#sideToggle");
  if(st) st.addEventListener("click", function(){
    setSideMini(!$("#sideNav").classList.contains("is-mini"));
  });
  var rt = $("#railToggle");
  if(rt) rt.addEventListener("click", function(){
    var wide = $("#projRail").classList.contains("is-wide");
    var w = setRailWidth(wide ? RAIL_DEF : 208);
    storeSet("metrol-crm-rail-w", String(w));
    reflowGrids();
  });
  paintRailToggle();
}

function renderProjSelect(){
  var sel = $("#projSelect");
  if(!sel) return;
  sel.innerHTML = '<option value="__all">\u2190 All projects</option>' + PROJECTS.map(function(p){
    return '<option value="'+p.id+'"'+(p.name===CURRENT_PROJECT?" selected":"")+">"+esc(p.name)+"</option>";
  }).join("");
}

/* ------------------------------------------------------------------ init */
applyTheme(storeGet(THEME_KEY), false);   // remembered choice, or follow device
/* History now comes from the events table, not from fabricated rows. */
initPanes();
renderProjects();
renderRail();
renderProjSelect();
renderOwner();
renderMember();
})();
