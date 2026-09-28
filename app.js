const SUPABASE_URL="https://qsyijgvikxmwmhaiulne.supabase.co";
const SUPABASE_KEY="sb_publishable_5qeUg0c0T0IyLh8g0cUj6Q_ZJYgZYJ_";
if(!window.supabase||typeof window.supabase.createClient!=="function"){
 document.body.innerHTML='<div class="loading"><b>Donnerfaust Vineyards konnte nicht geladen werden.</b><br><small>Die Supabase-Bibliothek ist nicht verfügbar. Bitte Seite neu laden.</small></div>';
 throw new Error("Supabase-Bibliothek konnte nicht geladen werden.");
}
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
const dateTime=()=>new Date().toLocaleString("de-DE");
let profile=null, role=null, page="dashboard";
let presenceChannel=null, onlineCount=0;

const NAV=[
["dashboard","⌂","Übersicht","dashboard"],
["invoices","▤","Rechnungen","invoice_view"],
["orders","🛒","Bestellungen","dashboard"],
["inventory","▦","Lager","inventory_view"],
["recipes","♜","Rezepte","inventory_view"],
["cash","$","Kasse","cash_view"],
["employees","♟","Mitarbeiter","employees_view"],
["audit","◷","Protokoll","audit_view"]
];

function can(p){return !!role?.permissions?.[p]}
function badge(s){return '<span class="badge '+(s==="Bezahlt"||s==="OK"?"good":s==="Niedrig"||s==="Offen"?"warn":"bad")+'">'+esc(s)+"</span>"}

async function init(){
 if(!window.supabase||typeof window.supabase.createClient!=="function")throw Error("Die Supabase-Bibliothek konnte nicht geladen werden.");
 const publicToken=new URLSearchParams(location.search).get("rechnung");
 if(publicToken)return publicInvoice(publicToken);
 const sessionResult=await Promise.race([
  supabaseClient.auth.getSession(),
  new Promise((_,reject)=>setTimeout(()=>reject(Error("Die Anmeldung konnte nicht innerhalb von 10 Sekunden initialisiert werden.")),10000))
 ]);
 const {data:{session}}=sessionResult;
 if(!session)return login();
 await loadProfile();
 if(!profile){await supabaseClient.auth.signOut();return login("Dein Konto ist für Donnerfaust Vineyards noch nicht freigeschaltet.");}
 if(profile.must_change_password)return forcePasswordChange();
 render();
 startPresence();
 supabaseClient.auth.onAuthStateChange(async (_e,s)=>{if(!s){if(presenceChannel)await supabaseClient.removeChannel(presenceChannel);presenceChannel=null;login()}});
}
async function loadProfile(){
 const {data,error}=await supabaseClient.from("vineyard_profiles").select("user_id,display_name,role_key,active,phone,must_change_password,vineyard_roles:role_key(key,label,permissions)").eq("user_id",(await supabaseClient.auth.getUser()).data.user.id).maybeSingle();
 if(error||!data||!data.active){profile=null;return}
 profile=data;role=data.vineyard_roles;
}
function login(message=""){
 document.body.innerHTML=`
  <div class="login"><div class="loginbox">
   <div class="loginbrand"><div class="brandmark"><img src="./assets/donnerfaust-vineyards-logo.jpg" alt="Donnerfaust Vineyards"></div><h1>Donnerfaust Vineyards</h1><p>Interne Betriebsverwaltung</p></div>
   ${message?`<div class="error">${esc(message)}</div>`:""}
   <form id="loginform">
    <label>E-Mail<input id="email" type="email" autocomplete="username" placeholder="deine E-Mail-Adresse" required></label>
    <label>Passwort<input id="password" type="password" autocomplete="current-password" required></label>
    <button class="btn primary">Anmelden</button>
   </form>
  </div></div>`;
 $("#loginform").onsubmit=async e=>{
  e.preventDefault();
  const b=e.submitter;
  b.disabled=true;
  const {error}=await supabaseClient.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});
  if(error){b.disabled=false;return login(error.message);}
  await loadProfile();
  if(!profile){await supabaseClient.auth.signOut();return login("Dieser Benutzer hat noch kein Vineyards-Profil.");}
  if(profile.must_change_password)return forcePasswordChange();
  await render();
  startPresence();
 };
}

function forcePasswordChange(){
 document.body.innerHTML='<div class="login"><div class="loginbox"><div class="loginbrand"><div class="brandmark">🔐</div><h1>Passwort aktualisieren</h1><p>Bei der ersten Anmeldung musst du das vom Master vergebene Startpasswort ändern.</p></div><div class="error" style="background:#fff0cf;color:#765714">Dein Zugang ist aktiv. Bevor du fortfährst, lege dein persönliches Passwort fest.</div><form id="passwordform"><label>Neues Passwort<input id="newpassword" type="password" autocomplete="new-password" minlength="8" required></label><label>Neues Passwort wiederholen<input id="newpassword2" type="password" autocomplete="new-password" minlength="8" required></label><button class="btn primary">Passwort speichern</button></form></div></div>';
 $("#passwordform").onsubmit=async e=>{
  e.preventDefault();
  const b=e.submitter,b1=$("#newpassword").value,b2=$("#newpassword2").value;
  if(b1.length<8)return alert("Das Passwort muss mindestens 8 Zeichen haben.");
  if(b1!==b2)return alert("Die Passwörter stimmen nicht überein.");
  b.disabled=true;
  const r=await supabaseClient.functions.invoke("vineyard-admin-users",{body:{action:"change_password",password:b1}});
  if(r.error||r.data?.error){b.disabled=false;return alert(r.data?.error||r.error?.message||"Passwort konnte nicht geändert werden.");}
  await loadProfile();
  render();
  startPresence();
 };
}
function shell(content){
 const nav=NAV.filter(n=>can(n[3])).map(n=>`<button class="nav ${page===n[0]?"active":""}" data-page="${n[0]}"><i>${n[1]}</i>${n[2]}</button>`).join("");
 document.body.innerHTML=`<aside class="sidebar" id="sidebar"><div class="brand"><div class="brandmark"><img src="./assets/donnerfaust-vineyards-logo.jpg" alt=""></div><div><b>Donnerfaust Vineyards</b><small>Interne Verwaltung</small></div></div><nav>${nav}</nav><div class="sidefoot"><span class="online"></span>${esc(profile.display_name)} · ${esc(role.label)}<br><button id="logout" class="mini" style="margin-top:9px">Abmelden</button></div></aside><main class="main"><header class="top"><div class="topTitle"><img class="topbrandlogo" src="./assets/donnerfaust-vineyards-logo.jpg" alt="Donnerfaust Vineyards"><div><button class="hamb" id="hamb">☰</button><span class="crumb">DONNERFAUST VINEYARDS</span><h2>${esc(pageTitle())}</h2></div></div><div class="topright"><span class="online"></span><b>${esc(profile.display_name)}</b><span class="avatar">${esc(initials(profile.display_name))}</span></div></header><section class="content">${content}</section></main><div id="modalroot"></div>`;
 $$(".nav").forEach(b=>b.onclick=()=>{page=b.dataset.page;render();});$("#hamb").onclick=()=>$("#sidebar").classList.toggle("open");$("#logout").onclick=()=>supabaseClient.auth.signOut();
}
function pageTitle(){return ({dashboard:"Übersicht",invoices:"Rechnungen",orders:"Bestellungen",inventory:"Lagerübersicht",recipes:"Rezepte",cash:"Kasse",employees:"Mitarbeiter",audit:"Protokoll"})[page]||"Übersicht"}
function initials(n){return String(n||"DF").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()}
function stat(icon,label,value){return '<div class="stat"><span class="icon">'+icon+'</span><div><small>'+label+"</small><b>"+value+"</b></div></div>"}
function intro(k,h,p,action,label){return '<div class="intro"><div><div class="eyebrow">'+k+"</div><h1>"+h+"</h1><p>"+p+"</p></div>"+(action?'<button type="button" class="btn gold" data-action="'+action+'">'+label+"</button>":"")+"</div>"}

async function dashboard(){
 const openInvoices=0,openOrders=0;
 return `
  <div class="welcome">
   <div><div class="eyebrow">DONNERFAUST VINEYARDS</div><h1>Willkommen, ${esc(profile.display_name)}</h1><p>Deine aktuelle Übersicht für den Weinbetrieb.</p></div>
   <div class="welcomegrape"><img src="./assets/donnerfaust-vineyards-logo.jpg" alt="Donnerfaust Vineyards"></div>
  </div>
  <div class="overviewgrid">
   <button class="overviewcard" data-page-action="invoices"><div class="overviewicon invoice">▤</div><div class="overviewtext"><small>OFFENE RECHNUNGEN</small><b>${openInvoices}</b><span>Rechnungsmenü öffnen</span></div><span class="arrow">→</span></button>
   <button class="overviewcard" data-page-action="orders"><div class="overviewicon order">🛒</div><div class="overviewtext"><small>OFFENE BESTELLUNGEN</small><b>${openOrders}</b><span>Bestellungsmenü öffnen</span></div><span class="arrow">→</span></button>
   <div class="overviewcard static"><div class="overviewicon staff">♟</div><div class="overviewtext"><small>MITARBEITER ONLINE</small><b id="onlineCount">${onlineCount||1}</b><span>Aktuell im System angemeldet</span></div><span class="live"><i></i> LIVE</span></div>
  </div>
  <div class="quickgrid">
   <button class="quickcard" data-page-action="inventory"><span>📦</span><div><b>Lager</b><small>Bestände verwalten</small></div><span class="arrow">→</span></button>
   <button class="quickcard" data-page-action="cash"><span>$</span><div><b>Kasse</b><small>Kassenbuch öffnen</small></div><span class="arrow">→</span></button>
   <button class="quickcard" data-page-action="employees"><span>♟</span><div><b>Mitarbeiter</b><small>Team verwalten</small></div><span class="arrow">→</span></button>
  </div>`;
}

async function invoices(){
 const {data:rows=[],error}=await supabaseClient.from("vineyard_invoices").select("id,invoice_number,invoice_type,partner_name,status,created_at,created_by").order("created_at",{ascending:false});
 if(error)return errorBox(error.message);
 const open=rows.filter(x=>x.status==="Offen").length;
 const total=rows.reduce((s,x)=>s+1,0);
 return intro("HANDELSNACHWEISE","Rechnungen","Verkauf, Einkauf und Bestellungen als nachvollziehbare Handelsnachweise verwalten.",can("invoice_edit")?"newinvoice":null,can("invoice_edit")?"+ Rechnung erstellen":null)+
 '<div class="stats">'+stat("▤","OFFENE RECHNUNGEN",open)+stat("$","HANDELSVORGÄNGE",total)+stat("↗","VERKAUF",rows.filter(x=>x.invoice_type==="Verkauf").length)+stat("↙","EINKAUF",rows.filter(x=>x.invoice_type==="Einkauf").length)+'</div>'+
 '<div class="panel"><div class="tablewrap"><table><thead><tr><th>NUMMER</th><th>ART</th><th>HANDELSPARTNER</th><th>DATUM</th><th>STATUS</th><th></th></tr></thead><tbody>'+
 (rows.map(x=>'<tr><td><b>'+esc(x.invoice_number)+'</b></td><td>'+esc(x.invoice_type)+'</td><td>'+esc(x.partner_name)+'</td><td>'+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</td><td>'+badge(x.status)+'</td><td><button class="mini gold" data-share-invoice="'+x.id+'">Teilen</button></td></tr>').join("")||'<tr><td colspan="6">Noch keine Rechnungen vorhanden.</td></tr>')+
 '</tbody></table></div></div>';
}
async function orders(){return '<div class="placeholder"><div class="placeholdericon">🛒</div><div class="eyebrow">BESTELLUNGEN</div><h1>Bestellungsmenü</h1><p>Hier werden offene Bestellungen und Lieferungen verwaltet.</p><div class="placeholderstate">Noch keine Bestellungen hinterlegt.</div></div>';}
function startPresence(){
 if(presenceChannel)return;
 const channel=supabaseClient.channel("vineyard-online",{config:{presence:{key:profile.user_id}}});
 const update=()=>{const state=channel.presenceState();onlineCount=Object.keys(state).length;const el=$("#onlineCount");if(el)el.textContent=onlineCount;};
 channel.on("presence",{event:"sync"},update).on("presence",{event:"join"},update).on("presence",{event:"leave"},update);
 channel.subscribe(async status=>{if(status==="SUBSCRIBED"){await channel.track({user_id:profile.user_id,name:profile.display_name,online_at:new Date().toISOString()});update();}});
 presenceChannel=channel;
}
async function inventory(){
 const {data:items=[],error}=await supabaseClient.from("vineyard_inventory").select("*").order("category").order("item_name");
 if(error)return errorBox(error.message);
 const ingredients=items.filter(x=>x.category==="Zutaten");
 const products=items.filter(x=>x.category==="Produkte");
 return intro("LAGER","Lagerverzeichnis","Zutaten und fertige Produkte verwalten. Bestandsbewegungen werden nachvollziehbar protokolliert.",can("inventory_edit")?"newitem":null,can("inventory_edit")?"+ Lagerartikel":null)+
 '<div class="panel"><input class="fullinput" id="q" placeholder="Zutat oder Produkt suchen …"><div class="inventoryhint"><b>'+ingredients.length+'</b> Zutaten · <b>'+products.length+'</b> Produkte</div></div>'+
 '<div class="inventorysection"><div class="sectiontitle"><div><div class="eyebrow">KATEGORIE 1</div><h2>Zutaten</h2><p>Grundzutaten und Ressourcen, die für die Weinproduktion benötigt werden.</p></div></div><div class="itemgrid" id="ingredients">'+itemCards(ingredients)+'</div></div>'+
 '<div class="inventorysection"><div class="sectiontitle"><div><div class="eyebrow">KATEGORIE 2</div><h2>Produkte</h2><p>Fertig produzierte Weine und andere verkaufsfertige Produkte.</p></div></div><div class="itemgrid" id="products">'+itemCards(products)+'</div></div>';
}
function itemCards(items){
 return items.map(x=>{
  const low=Number(x.quantity)<=Number(x.min_stock);
  const production=x.category==="Produkte"&&can("inventory_edit")?`<button class="mini gold" data-production="${x.id}">+ Produktion</button> `:"";
  const actions=can("inventory_edit")?`<button class="mini gold" data-stock="${x.id}">Bestand ändern</button> ${production}<button class="mini" data-edit-item="${x.id}">Bearbeiten</button>`:"";
  const price=x.category==="Zutaten"?"Einkaufspreis: "+money(x.purchase_price):"Verkaufspreis: "+money(x.sale_price);
  return `
   <div class="itemcard">
    <div class="eyebrow">${esc(x.category)} · ${esc(x.unit)}</div>
    <h3>${esc(x.item_name)}</h3>
    <div class="qty ${low?"low":""}">${Number(x.quantity).toLocaleString("de-DE")} ${esc(x.unit)}</div>
    <small class="muted">Mindestbestand: ${Number(x.min_stock).toLocaleString("de-DE")} · ${price}</small>
    <div style="margin-top:12px">${actions}</div>
   </div>`;
 }).join("")||'<p class="muted">Noch keine Einträge in dieser Kategorie.</p>';
}

async function recipes(){
 const {data:rows=[],error}=await supabaseClient.from("vineyard_recipes").select("*").order("name");
 if(error)return errorBox(error.message);
 const {data:inv=[]}=await supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category");
 const map=Object.fromEntries(inv.map(x=>[x.id,x]));
 const {data:items=[]}=await supabaseClient.from("vineyard_recipe_items").select("recipe_id,quantity,inventory_id,vineyard_inventory:inventory_id(item_name,unit,category)").order("created_at");
 const byRecipe={};items.forEach(x=>(byRecipe[x.recipe_id]??=[]).push(x));
 return intro("REZEPTE","Rezeptverwaltung","Hier legst du fest, welche im Lager angelegten Zutaten für ein Produkt benötigt werden.",can("inventory_edit")?"newrecipe":null,can("inventory_edit")?"+ Rezept":null)+
 '<div class="recipehint"><b>Wichtig:</b> Nur Artikel, die vorher im <b>Lager</b> angelegt wurden, können hier ausgewählt werden. Zutaten müssen als <b>Zutaten</b> und das Rezept-Ergebnis als <b>Produkte</b> angelegt sein.</div>'+
 '<div class="recipegrid">'+rows.map(r=>{
   const out=map[r.output_inventory_id];
   const its=byRecipe[r.id]||[];
   return '<div class="recipecard"><div class="eyebrow">REZEPT</div><h3>'+esc(r.name)+'</h3><p class="muted">'+esc(r.description||"Keine Beschreibung")+'</p>'+
   '<div class="recipeoutput"><span>ERGEBNIS</span><b>'+(out?esc(out.item_name):"Nicht mehr im Lager")+'</b><small>'+Number(r.output_quantity).toLocaleString("de-DE")+' '+esc(out?.unit||"")+'</small></div>'+
   '<div class="recipeingredients"><small>ZUTATEN</small>'+its.map(x=>'<div><span>'+esc(x.vineyard_inventory?.item_name||"Unbekannter Lagerartikel")+'</span><b>'+Number(x.quantity).toLocaleString("de-DE")+' '+esc(x.vineyard_inventory?.unit||"")+'</b></div>').join("")+'</div>'+
   '<div class="recipeactions">'+(can("inventory_edit")?'<button class="mini gold" data-edit-recipe="'+r.id+'">Bearbeiten</button> <button class="mini" data-delete-recipe="'+r.id+'">Löschen</button>':"")+'</div></div>';
 }).join("")||'<div class="panel"><p class="muted">Noch keine Rezepte angelegt. Lege zuerst Zutaten und Produkte im Lager an.</p></div>'+'</div>';
}
async function cash(){
 const {data:rows=[],error}=await supabaseClient.from("vineyard_cashbook").select("*").order("created_at",{ascending:false});
 if(error)return errorBox(error.message);
 const balance=rows.reduce((s,x)=>s+(x.kind==="in"?1:-1)*Number(x.amount||0),0);
 return intro("KASSE","Kassenbuch","Ein- und Auszahlungen mit Benutzerprotokoll.",can("cash_edit")?"newcash":null,can("cash_edit")?"+ Buchung":null)+
 '<div class="stats">'+stat("$","AKTUELLER KASSENSTAND",money(balance))+stat("↗","EINNAHMEN",money(rows.filter(x=>x.kind==="in").reduce((s,x)=>s+Number(x.amount),0)))+stat("↘","AUSGABEN",money(rows.filter(x=>x.kind==="out").reduce((s,x)=>s+Number(x.amount),0)))+stat("▤","BUCHUNGEN",rows.length)+"</div>"+
 '<div class="panel"><div class="tablewrap"><table><thead><tr><th>DATUM</th><th>ART</th><th>BETRAG</th><th>KATEGORIE</th><th>BESCHREIBUNG</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</td><td>'+(x.kind==="in"?'<span class="badge good">Einnahme</span>':'<span class="badge bad">Ausgabe</span>')+'</td><td><b>'+money(x.amount)+"</b></td><td>"+esc(x.category)+"</td><td>"+esc(x.description)+"</td></tr>").join("")||'<tr><td colspan="5">Keine Buchungen.</td></tr>'+"</tbody></table></div></div>";
}
async function employees(){
 const [{data:emps=[]},{data:roles=[]}]=await Promise.all([
  supabaseClient.from("vineyard_profiles").select("user_id,display_name,role_key,active,phone,vineyard_roles:role_key(label)").order("display_name"),
  supabaseClient.from("vineyard_roles").select("key,label,permissions").order("key")
 ]);
 return intro("TEAM","Mitarbeiter","Konten, Rollen und Rechte werden ausschließlich über den Master verwaltet.",can("employees_edit")?"newemployee":null,can("employees_edit")?"+ Mitarbeiter":null)+
 '<div class="employeegrid">'+emps.map(x=>'<div class="employee"><div class="avatar">'+esc(initials(x.display_name))+'</div><div style="flex:1"><b>'+esc(x.display_name)+"</b><small>"+esc(x.vineyard_roles?.label||x.role_key)+" · "+(x.active?'<span class="good">Aktiv</span>':'<span class="bad">Deaktiviert</span>')+"</small>"+(x.phone?'<small>'+esc(x.phone)+"</small>":"")+'</div>'+(can("employees_edit")?'<button class="mini" data-edit-employee="'+x.user_id+'">Verwalten</button>':"")+"</div>").join("")+"</div>";
}
async function audit(){
 const {data:rows=[],error}=await supabaseClient.from("vineyard_audit_log").select("*,vineyard_profiles:actor_id(display_name)").order("created_at",{ascending:false}).limit(100);
 if(error)return errorBox(error.message);
 return intro("SICHERHEIT","Änderungsprotokoll","Nachvollziehbare Protokollierung wichtiger Verwaltungsvorgänge.")+
 '<div class="panel">'+rows.map(x=>'<div class="row"><span>◷</span><div class="rowgrow"><b>'+esc(x.action)+"</b><small>"+esc(x.vineyard_profiles?.display_name||"SYSTEM")+" · "+esc(x.entity)+" · "+esc(new Date(x.created_at).toLocaleString("de-DE"))+"</small></div></div>").join("")||'<p class="muted">Noch keine Einträge.</p>'+"</div>";
}
function errorBox(t){return '<div class="panel"><b>Fehler</b><p class="muted">'+esc(t)+"</p></div>"}

async function render(){let content=page==="dashboard"?await dashboard():page==="invoices"?await invoices():page==="orders"?await orders():page==="inventory"?await inventory():page==="recipes"?await recipes():page==="cash"?await cash():page==="employees"?await employees():await audit();shell(content);bind()}
function bind(){
 document.onclick=async e=>{
  const b=e.target.closest?.("[data-action]");
  if(!b)return;
  e.preventDefault();
  e.stopPropagation();
  if(b.dataset.busy==="1")return;
  b.dataset.busy="1";
  b.disabled=true;
  try{await action(b.dataset.action)}catch(err){console.error("Donnerfaust Vineyards Aktion:",err);alert(err?.message||String(err))}
  finally{b.disabled=false;b.dataset.busy="0"}
 };
 $("[data-page-action]").forEach(b=>b.onclick=()=>{page=b.dataset.pageAction;render()});
 $("#q")?.addEventListener("input",async e=>{const {data=[]}=await supabaseClient.from("vineyard_inventory").select("*").order("category").order("item_name");const q=e.target.value.toLowerCase();$("#ingredients").innerHTML=itemCards(data.filter(x=>x.category==="Zutaten"&&x.item_name.toLowerCase().includes(q)));$("#products").innerHTML=itemCards(data.filter(x=>x.category==="Produkte"&&x.item_name.toLowerCase().includes(q)))});
 $$("[data-stock]").forEach(b=>b.onclick=()=>stockModal(b.dataset.stock));
 $$("[data-production]").forEach(b=>b.onclick=()=>productionModal(b.dataset.production));
 $$("[data-edit-item]").forEach(b=>b.onclick=()=>itemModal(b.dataset.editItem));
 $$("[data-edit-recipe]").forEach(b=>b.onclick=()=>recipeModal(b.dataset.editRecipe));
 $$("[data-delete-recipe]").forEach(b=>b.onclick=()=>deleteRecipe(b.dataset.deleteRecipe));
 $$("[data-edit-employee]").forEach(b=>b.onclick=()=>employeeModal(b.dataset.editEmployee));
 $$("[data-share-invoice]").forEach(b=>b.onclick=()=>shareInvoice(b.dataset.shareInvoice));
}
async function action(a){
 if(a==="openinventory"){page="inventory";await render();return}
 if(a==="newitem"){await itemModal();return}
 if(a==="newrecipe"){await recipeModal();return}
 if(a==="newcash"){await cashModal();return}
 if(a==="newemployee"){await employeeModal();return}
 if(a==="newinvoice"){await invoiceModal();return}
}

function modal(title,body,onSubmit){
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal"><div class="modalhead"><b>'+title+'</b><button id="x">×</button></div><form id="mf">'+body+'<div class="actions"><button type="button" class="btn outline" id="cancel">Abbrechen</button><button class="btn primary">Speichern</button></div></form></div></div>';
 $("#x").onclick=$("#cancel").onclick=()=>$("#modalroot").innerHTML="";
 $("#mf").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await onSubmit(Object.fromEntries(new FormData(e.target)));$("#modalroot").innerHTML="";await render()}catch(err){alert(err.message||err)}finally{b.disabled=false}};
}
function field(label,name,type="text",value="",required=false){return '<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(required?"required":"")+"></label>"}
function selectField(label,name,opts,value=""){return '<label>'+label+'<select name="'+name+'">'+opts.map(o=>'<option value="'+esc(o.value??o)+'" '+(String(value)===String(o.value??o)?"selected":"")+'>'+esc(o.label??o)+"</option>").join("")+"</select></label>"}

async function itemModal(id){
 let item=null;
 if(id){const {data,error}=await supabaseClient.from("vineyard_inventory").select("*").eq("id",id).single();if(error)throw error;item=data}
 const cat=item?.category||"Zutaten";
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal"><div class="modalhead"><b>'+(id?"Lagerartikel bearbeiten":"Neuer Lagerartikel")+'</b><button id="x">×</button></div><form id="mf">'+
 field("Artikel / Ressource","item_name","text",item?.item_name||"",true)+
 selectField("Kategorie","category",[{value:"Zutaten",label:"Zutaten · Grundzutaten / Ressourcen"},{value:"Produkte",label:"Produkte · fertige Weine / Verkaufsartikel"}],cat)+
 field("Einheit","unit","text",item?.unit||"Stück",true)+
 field("Bestand","quantity","number",item?.quantity??0)+
 field("Mindestbestand","min_stock","number",item?.min_stock??0)+
 '<label id="purchaseWrap">Einkaufspreis<input name="purchase_price" type="number" step="0.01" min="0" value="'+esc(item?.purchase_price??0)+'"></label>'+
 '<label id="saleWrap">Verkaufspreis<input name="sale_price" type="number" step="0.01" min="0" value="'+esc(item?.sale_price??0)+'"></label>'+
 '<div class="actions"><button type="button" class="btn outline" id="cancel">Abbrechen</button><button class="btn primary">Speichern</button></div></form></div></div>';
 const close=()=>$("#modalroot").innerHTML="";
 $("#x").onclick=$("#cancel").onclick=close;
 const category=$("#mf [name=category]"),purchase=$("#purchaseWrap"),sale=$("#saleWrap");
 const updatePrices=()=>{
   const ingredient=category.value==="Zutaten";
   purchase.style.display=ingredient?"":"none";
   sale.style.display=ingredient?"none":"";
   $("#purchaseWrap input").required=ingredient;
   $("#saleWrap input").required=!ingredient;
 };
 category.onchange=updatePrices;updatePrices();
 $("#mf").onsubmit=async e=>{
   e.preventDefault();const b=e.submitter;b.disabled=true;
   try{
    const v=Object.fromEntries(new FormData(e.target)), user=(await supabaseClient.auth.getUser()).data.user;
    const ingredient=v.category==="Zutaten";
    const purchase_price=ingredient?Number(v.purchase_price):0;
    const sale_price=ingredient?0:Number(v.sale_price);
    if(!ingredient&&!Number.isFinite(sale_price))throw Error("Bitte einen gültigen Verkaufspreis angeben.");
    if(ingredient&&!Number.isFinite(purchase_price))throw Error("Bitte einen gültigen Einkaufspreis angeben.");
    const patch={item_name:v.item_name.trim(),category:v.category,unit:v.unit.trim(),quantity:Number(v.quantity)||0,min_stock:Number(v.min_stock)||0,purchase_price,sale_price,updated_at:new Date().toISOString(),updated_by:user.id};
    const r=id?await supabaseClient.from("vineyard_inventory").update(patch).eq("id",id):await supabaseClient.from("vineyard_inventory").insert(patch);
    if(r.error)throw r.error;
    await auditLog(id?"Lagerartikel geändert":"Lagerartikel angelegt","inventory",id||v.item_name,patch);
    close();await render();
   }catch(err){alert(err.message||String(err))}finally{b.disabled=false}
 };
}
async function recipeModal(id){
 const [{data:ingredients=[]},{data:products=[]},recipeResult,itemsResult]=await Promise.all([
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category").eq("category","Zutaten").order("item_name"),
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category").eq("category","Produkte").order("item_name"),
  id?supabaseClient.from("vineyard_recipes").select("*").eq("id",id).single():Promise.resolve({data:null}),
  id?supabaseClient.from("vineyard_recipe_items").select("inventory_id,quantity").eq("recipe_id",id).order("created_at"):Promise.resolve({data:[]})
 ]);
 const recipe=recipeResult.data, existing=itemsResult.data||[];
 if(id&&!recipe)throw Error("Rezept nicht gefunden.");
 if(!ingredients.length)throw Error("Lege zuerst mindestens eine Zutat im Lager an. Nur Lagerartikel der Kategorie Zutaten können in Rezepten verwendet werden.");
 if(!products.length)throw Error("Lege zuerst mindestens ein Produkt im Lager an. Nur Lagerartikel der Kategorie Produkte können Rezept-Ergebnisse sein.");
 const rows=existing.length?existing.map(x=>({inventory_id:x.inventory_id,quantity:x.quantity})):([{inventory_id:ingredients[0]?.id||"",quantity:1}]);
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal recipeModal"><div class="modalhead"><b>'+(id?"Rezept bearbeiten":"Neues Rezept")+'</b><button id="x">×</button></div><form id="recipeform">'+
 field("Rezeptname","name","text",recipe?.name||"",true)+
 field("Beschreibung","description","text",recipe?.description||"")+
 selectField("Ergebnis / fertiges Produkt","output_inventory_id",products.map(x=>({value:x.id,label:x.item_name+" · "+x.unit})),recipe?.output_inventory_id||products[0].id)+
 field("Produktionsmenge","output_quantity","number",recipe?.output_quantity??1,true)+
 '<div class="recipeformhead"><b>Zutaten</b><button type="button" class="mini gold" id="addingredient">+ Zutat</button></div><div id="recipeitemsform"></div>'+
 '<div class="actions"><button type="button" class="btn outline" id="cancel">Abbrechen</button><button class="btn primary">Rezept speichern</button></div></form></div></div>';
 const close=()=>$("#modalroot").innerHTML="";$("#x").onclick=$("#cancel").onclick=close;
 const draw=()=>{$("#recipeitemsform").innerHTML=rows.map((r,n)=>'<div class="recipeformrow"><select data-ri="'+n+'" class="recipeingredient">'+ingredients.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===r.inventory_id?"selected":"")+'>'+esc(x.item_name)+' · '+esc(x.unit)+'</option>').join("")+'</select><input data-rq="'+n+'" class="recipequantity" type="number" min="0.0001" step="any" value="'+esc(r.quantity)+'" required><button type="button" class="mini" data-remove-ri="'+n+'">×</button></div>').join("")||'<p class="muted">Noch keine Zutaten. Füge mindestens eine hinzu.</p>';$$("[data-remove-ri]").forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.removeRi),1);draw()});};
 $("#addingredient").onclick=()=>{rows.push({inventory_id:ingredients[0]?.id||"",quantity:1});draw()};draw();
 $("#recipeform").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{
   const name=e.target.name.value.trim(),description=e.target.description.value.trim(),output_inventory_id=e.target.output_inventory_id.value,output_quantity=Number(e.target.output_quantity.value);
   const payload=[...$(".recipeformrow")].map(row=>({inventory_id:row.querySelector(".recipeingredient").value,quantity:Number(row.querySelector(".recipequantity").value)})).filter(x=>x.inventory_id);
   if(!name)throw Error("Bitte einen Rezeptnamen eingeben.");
   if(!Number.isFinite(output_quantity)||output_quantity<=0)throw Error("Die Produktionsmenge muss größer als 0 sein.");
   if(!payload.length)throw Error("Ein Rezept benötigt mindestens eine Zutat.");
   if(payload.some(x=>!Number.isFinite(x.quantity)||x.quantity<=0))throw Error("Alle Zutatenmengen müssen größer als 0 sein.");
   if(new Set(payload.map(x=>x.inventory_id)).size!==payload.length)throw Error("Eine Zutat darf pro Rezept nur einmal vorkommen.");
   const r=await supabaseClient.rpc("vineyard_save_recipe",{p_recipe_id:id||null,p_name:name,p_description:description,p_output_inventory_id:output_inventory_id,p_output_quantity:output_quantity,p_items:payload});
   if(r.error)throw r.error;close();await render();
 }catch(err){alert(err.message||String(err))}finally{b.disabled=false}};
}
async function deleteRecipe(id){
 if(!confirm("Dieses Rezept wirklich löschen?"))return;
 const r=await supabaseClient.rpc("vineyard_delete_recipe",{p_recipe_id:id});
 if(r.error)return alert(r.error.message);
 await render();
}
async function invoiceModal(){
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal"><div class="modalhead"><b>Rechnung wird vorbereitet</b></div><p class="muted">Lagerartikel werden geladen…</p></div></div>';
 const {data:inventory=[],error}=await supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category,purchase_price,sale_price").order("category").order("item_name");
 if(error)throw error;
 if(!inventory.length)throw Error("Lege zuerst Artikel im Lager an. Nur dort hinterlegte Artikel können auf Rechnungen ausgewählt werden.");
 const typeOptions=[{value:"Verkauf",label:"🛒 Verkauf"},{value:"Einkauf",label:"📦 Einkauf"},{value:"Bestellung",label:"📋 Bestellung"}];
 const rows=[{inventory_id:inventory[0].id,quantity:1,unit_price:0}];
 const defaultPrice=(item,type)=>type==="Einkauf"?Number(item?.purchase_price||0):Number(item?.sale_price||0);
 $( "#modalroot").innerHTML='<div class="modalback"><div class="modal invoiceModal"><div class="modalhead"><b>Neue Rechnung</b><button id="x">×</button></div><form id="invoiceform">'+
 selectField("Handelsvorgang","invoice_type",typeOptions,"Verkauf")+
 field("Handelspartner","partner_name","text","",true)+
 '<div class="recipeformhead"><b>Gehandelte Positionen</b><button type="button" class="mini gold" id="addinvoiceitem">+ Position</button></div><div id="invoiceitemsform"></div>'+
 '<div class="invoiceTotal" id="invoiceTotal"></div>'+
 '<div class="actions"><button type="button" class="btn outline" id="cancel">Abbrechen</button><button class="btn primary">Rechnung speichern</button></div></form></div></div>';
 const close=()=>$("#modalroot").innerHTML="";
 $("#x").onclick=$("#cancel").onclick=close;
 const typeEl=$("#invoiceform [name=invoice_type]");
 const draw=()=>{
  $("#invoiceitemsform").innerHTML=rows.map((r,n)=>'<div class="invoiceformrow"><select data-ii="'+n+'" class="invoiceitem">'+inventory.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===r.inventory_id?"selected":"")+'>'+esc(x.item_name)+' · '+esc(x.unit)+'</option>').join("")+'</select><input data-iq="'+n+'" class="invoicequantity" type="number" min="0.0001" step="any" value="'+esc(r.quantity)+'" required><input data-ip="'+n+'" class="invoiceprice" type="number" min="0" step="0.01" value="'+esc(r.unit_price)+'" required><button type="button" class="mini" data-remove-ii="'+n+'">×</button></div>').join("");
  const refresh=()=>{
   let sum=0;
   rows.forEach((r,n)=>{const q=Number($("[data-iq='"+n+"']")?.value)||0,p=Number($("[data-ip='"+n+"']")?.value)||0;sum+=q*p;});
   $("#invoiceTotal").innerHTML="<span>Gesamtsumme</span><b>"+money(sum)+"</b>";
  };
  $$(".invoiceitem").forEach(s=>s.onchange=()=>{const n=Number(s.dataset.ii),item=inventory.find(x=>x.id===s.value);rows[n].inventory_id=s.value;rows[n].unit_price=defaultPrice(item,typeEl.value);$("[data-ip='"+n+"']").value=rows[n].unit_price.toFixed(2);refresh()});
  $$(".invoicequantity").forEach(i=>i.oninput=refresh);
  $$(".invoiceprice").forEach(i=>i.oninput=refresh);
  $$(".invoicequantity").forEach(i=>i.onchange=()=>rows[Number(i.dataset.iq)].quantity=Number(i.value));
  $$(".invoiceprice").forEach(i=>i.onchange=()=>rows[Number(i.dataset.ip)].unit_price=Number(i.value));
  $$(".invoiceitem").forEach(s=>{const n=Number(s.dataset.ii);if(!rows[n].unit_price){const item=inventory.find(x=>x.id===s.value);rows[n].unit_price=defaultPrice(item,typeEl.value);$("[data-ip='"+n+"']").value=rows[n].unit_price.toFixed(2)}});
  $$(".invoiceitem").forEach(s=>s.oninput=refresh);
  $$(".invoiceformrow [data-remove-ii]").forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.removeIi),1);if(!rows.length)rows.push({inventory_id:inventory[0].id,quantity:1,unit_price:defaultPrice(inventory[0],typeEl.value)});draw()});
  refresh();
 };
 $("#addinvoiceitem").onclick=()=>{const item=inventory[0];rows.push({inventory_id:item.id,quantity:1,unit_price:defaultPrice(item,typeEl.value)});draw()};
 typeEl.onchange=()=>{rows.forEach(r=>{const item=inventory.find(x=>x.id===r.inventory_id);r.unit_price=defaultPrice(item,typeEl.value)});draw()};
 rows[0].unit_price=defaultPrice(inventory[0],"Verkauf");draw();
 $("#invoiceform").onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  try{
   rows.forEach((r,n)=>{r.quantity=Number($("[data-iq='"+n+"']").value);r.unit_price=Number($("[data-ip='"+n+"']").value)});
   if(!rows.length||rows.some(r=>!r.inventory_id||!Number.isFinite(r.quantity)||r.quantity<=0||!Number.isFinite(r.unit_price)||r.unit_price<0))throw Error("Bitte Positionen, Mengen und Preise prüfen.");
   const partner=e.target.partner_name.value.trim();if(!partner)throw Error("Bitte einen Handelspartner angeben.");
   const r=await supabaseClient.rpc("vineyard_create_invoice",{p_type:typeEl.value,p_partner_name:partner,p_items:rows});
   if(r.error)throw r.error;
   close();await render();
  }catch(err){alert(err.message||String(err))}finally{b.disabled=false}
 };
}
async function shareInvoice(id){
 const {data,error}=await supabaseClient.from("vineyard_invoices").select("invoice_number,share_token").eq("id",id).single();
 if(error)throw error;
 const link=location.origin+location.pathname+"?rechnung="+encodeURIComponent(data.share_token);
 try{await navigator.clipboard.writeText(link);alert("Rechnungslink wurde kopiert.\n\n"+link)}catch(_){prompt("Rechnungslink:",link)}
}
async function publicInvoice(token){
 const {data,error}=await supabaseClient.rpc("vineyard_public_invoice",{p_share_token:token});
 const invoice=data?.invoice;
 if(error||!invoice)return document.body.innerHTML='<div class="publicInvoice"><div class="publicInvoiceBox"><div class="brandmark"><img src="./assets/donnerfaust-vineyards-logo.jpg" alt="Donnerfaust Vineyards"></div><h1>Rechnung nicht verfügbar</h1><p>Der Link ist ungültig oder die Rechnung wurde storniert.</p></div></div>';
 const items=Array.isArray(data.items)?data.items:[];
 const total=items.reduce((s,x)=>s+Number(x.line_total||0),0);
 document.body.innerHTML='<main class="publicInvoice"><div class="publicInvoiceBox"><div class="publicHead"><div><div class="eyebrow">DONNERFAUST VINEYARDS</div><h1>Rechnung</h1><p>Schreibgeschützter Handelsnachweis</p></div><div class="publicNumber">'+esc(invoice.invoice_number)+'</div></div><div class="publicMeta"><div><small>VORGANG</small><b>'+esc(invoice.invoice_type)+'</b></div><div><small>HANDELSPARTNER</small><b>'+esc(invoice.partner_name)+'</b></div><div><small>DATUM</small><b>'+esc(new Date(invoice.created_at).toLocaleString("de-DE"))+'</b></div><div><small>STATUS</small><b>'+esc(invoice.status)+'</b></div></div><div class="publicTable"><table><thead><tr><th>Artikel</th><th>Menge</th><th>Einzelpreis</th><th>Gesamt</th></tr></thead><tbody>'+items.map(x=>'<tr><td>'+esc(x.item_name)+'</td><td>'+Number(x.quantity).toLocaleString("de-DE")+' '+esc(x.unit)+'</td><td>'+money(x.unit_price)+'</td><td>'+money(x.line_total)+'</td></tr>').join("")+'</tbody></table></div><div class="publicTotal"><span>Gesamtsumme</span><b>'+money(total)+'</b></div><p class="publicReadonly">Diese Ansicht ist schreibgeschützt. Es besteht kein Zugriff auf die interne Vineyard-Verwaltung.</p></div></main>';
}
async function stockModal(id){
 const {data:item}=await supabaseClient.from("vineyard_inventory").select("*").eq("id",id).single();
 if(!item)throw Error("Lagerartikel nicht gefunden.");
 modal("Bestandsbewegung · "+item.item_name,selectField("Bewegung","mode",[{value:"in",label:"Zugang (+)"},{value:"out",label:"Abgang (-)"}])+field("Menge","amount","number","",true)+field("Grund","reason","text","",true),
 async v=>{const amount=Math.abs(Number(v.amount)||0);if(!amount)throw Error("Menge muss größer als 0 sein.");const delta=v.mode==="in"?amount:-amount;const {error}=await supabaseClient.rpc("vineyard_adjust_inventory",{p_inventory_id:id,p_delta:delta,p_reason:v.reason.trim()});if(error)throw error})
}
async function productionModal(id){
 const {data:item}=await supabaseClient.from("vineyard_inventory").select("*").eq("id",id).single();
 if(!item)throw Error("Lagerartikel nicht gefunden.");
 if(item.category!=="Produkte")throw Error("Produktion kann nur bei Produkten gebucht werden.");
 modal("Produktion · "+item.item_name,
   field("Produzierte Menge","amount","number","",true)+
   field("Produktionshinweis","reason","text","Produktion",true),
   async v=>{const amount=Math.abs(Number(v.amount)||0);if(!amount)throw Error("Die Produktionsmenge muss größer als 0 sein.");const {error}=await supabaseClient.rpc("vineyard_adjust_inventory",{p_inventory_id:id,p_delta:amount,p_reason:v.reason.trim()||"Produktion"});if(error)throw error})
}
async function cashModal(){
 modal("Kassenbuchung",selectField("Art","kind",[{value:"in",label:"Einnahme (+)"},{value:"out",label:"Ausgabe (-)"}])+selectField("Kategorie","category",["Weinverkauf","Trauben","Material","Lohn","Betriebskosten","Sonstiges"])+field("Betrag ($)","amount","number","",true)+field("Beschreibung","description","text","",true),
 async v=>{const amount=Number(v.amount)||0;if(amount<=0)throw Error("Betrag muss größer als 0 sein.");const r=await supabaseClient.from("vineyard_cashbook").insert({kind:v.kind,category:v.category,amount,description:v.description.trim(),created_by:(await supabaseClient.auth.getUser()).data.user.id});if(r.error)throw r.error;await auditLog("Kassenbuchung","cashbook",null,{kind:v.kind,amount,category:v.category,description:v.description.trim()})})
}
async function employeeModal(id){
 const [{data:e},{data:roles}]=await Promise.all([supabaseClient.from("vineyard_profiles").select("*").eq("user_id",id||"00000000-0000-0000-0000-000000000000").maybeSingle(),supabaseClient.from("vineyard_roles").select("key,label").order("key")]);
 if(id){
  modal("Mitarbeiter verwalten",field("Name","display_name","text",e?.display_name||"",true)+selectField("Rolle","role_key",roles.map(r=>({value:r.key,label:r.label})),e?.role_key||"mitarbeiter")+field("Telefon","phone","text",e?.phone||"")+selectField("Status","active",[{value:"true",label:"Aktiv"},{value:"false",label:"Deaktiviert"}],String(e?.active!==false)),
  async v=>{const r=await supabaseClient.functions.invoke("vineyard-admin-users",{body:{action:"update",user_id:id,display_name:v.display_name,role_key:v.role_key,phone:v.phone,active:v.active==="true"}});if(r.error)throw r.error;await auditLog("Mitarbeiter geändert","employee",id,{role_key:v.role_key,active:v.active==="true"})})
 }else{
  modal("Neuen Mitarbeiter anlegen",field("Name","display_name","text","",true)+field("E-Mail","email","email","",true)+field("Startpasswort","password","password","",true)+selectField("Rolle","role_key",roles.map(r=>({value:r.key,label:r.label})),"mitarbeiter")+field("Telefon","phone"),
  async v=>{if(v.password.length<8)throw Error("Das Startpasswort muss mindestens 8 Zeichen haben.");const r=await supabaseClient.functions.invoke("vineyard-admin-users",{body:{action:"create",display_name:v.display_name,email:v.email,password:v.password,role_key:v.role_key,phone:v.phone}});if(r.error)throw r.error;if(r.data?.error)throw Error(r.data.error);await auditLog("Mitarbeiter angelegt","employee",r.data.user_id,{email:v.email,role_key:v.role_key})})
 }
}
async function auditLog(action,entity,entityId,details){const user=(await supabaseClient.auth.getUser()).data.user;await supabaseClient.from("vineyard_audit_log").insert({actor_id:user.id,action,entity,entity_id:entityId?String(entityId):null,details:details||{}})}
function showBootError(err){
 console.error("Donnerfaust Vineyards Startfehler:",err);
 document.body.innerHTML='<div class="login"><div class="loginbox"><div class="loginbrand"><div class="brandmark"><img src="./assets/donnerfaust-vineyards-logo.jpg" alt="Donnerfaust Vineyards"></div><h1>Donnerfaust Vineyards</h1><p>Die Anwendung konnte nicht gestartet werden.</p></div><div class="error">Technischer Fehler beim Start.<br><small>'+esc(err?.message||String(err))+'</small></div><button class="btn primary" onclick="location.reload()">Erneut versuchen</button></div></div>';
}
init().catch(showBootError);
