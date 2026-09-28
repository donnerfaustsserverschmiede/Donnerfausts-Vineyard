const SUPABASE_URL="https://qsyijgvikxmwmhaiulne.supabase.co";
const SUPABASE_KEY="sb_publishable_5qeUg0c0T0IyLh8g0cUj6Q_ZJYgZYJ_";
if(!window.supabase||typeof window.supabase.createClient!=="function"){
 document.body.innerHTML='<div class="loading"><b>Donnerfaust Barrelworks konnte nicht geladen werden.</b><br><small>Die Supabase-Bibliothek ist nicht verfügbar. Bitte Seite neu laden.</small></div>';
 throw new Error("Supabase-Bibliothek konnte nicht geladen werden.");
}
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
const dateTime=()=>new Date().toLocaleString("de-DE");
let profile=null, role=null, page="dashboard";
let presenceChannel=null, onlineCount=0, orderRealtimeChannel=null;

function startOrderRealtime(){
 try{
  if(page!=="orders"||orderRealtimeChannel||!supabaseClient?.channel)return;
  const channel=supabaseClient.channel("donnerfaust-vineyards-orders");
  channel.on("postgres_changes",{event:"*",schema:"public",table:"vineyard_orders"},()=>{if(page==="orders")render()});
  channel.subscribe();
  orderRealtimeChannel=channel;
 }catch(_){}
}
function stopOrderRealtime(){
 if(orderRealtimeChannel){try{supabaseClient.removeChannel(orderRealtimeChannel)}catch(_){}orderRealtimeChannel=null;}
}
function startPresence(){
  try{
    if(!profile?.user_id || !supabaseClient?.channel)return;
    if(presenceChannel){
      try{supabaseClient.removeChannel(presenceChannel)}catch(_){}
      presenceChannel=null;
    }
    const channel=supabaseClient.channel("donnerfaust-vineyards-online",{config:{presence:{key:String(profile.user_id)}}});
    const updateOnline=()=>{
      try{
        const state=channel.presenceState()||{};
        const ids=new Set();
        Object.keys(state).forEach(k=>{
          (state[k]||[]).forEach(entry=>{
            const id=String(entry?.user_id||k);
            if(id)ids.add(id);
          });
        });
        onlineCount=ids.size||1;
        const el=document.querySelector("#onlineCount");
        if(el)el.textContent=String(onlineCount);
      }catch(_){
        onlineCount=1;
        const el=document.querySelector("#onlineCount");
        if(el)el.textContent="1";
      }
    };
    channel
      .on("presence",{event:"sync"},updateOnline)
      .on("presence",{event:"join"},updateOnline)
      .on("presence",{event:"leave"},updateOnline)
      .subscribe(async status=>{
        if(status!=="SUBSCRIBED")return;
        try{
          await channel.track({user_id:String(profile.user_id),display_name:String(profile.display_name||"")});
          updateOnline();
        }catch(_){
          onlineCount=1;
          const el=document.querySelector("#onlineCount");
          if(el)el.textContent="1";
        }
      });
    presenceChannel=channel;
  }catch(_){
    onlineCount=1;
    const el=document.querySelector("#onlineCount");
    if(el)el.textContent="1";
  }
}

const NAV=[
["dashboard","⌂","Übersicht","dashboard"],
["invoices","▤","Rechnungen","invoice_view"],
["orders","🛒","Bestellungen","dashboard"],
["inventory","▦","Lager","inventory_view"],
["recipes","♜","Rezepte","inventory_view"],
["production","⚗","Produktion","inventory_view"],
["trades","⇄","Ein- und Verkauf","trade_edit"],
["cash","$","Kasse","cash_view"],
["employees","♟","Mitarbeiter","employees_view"],
["admin","⚙","Administration","admin_access"]
];

function can(p){return !!role?.permissions?.[p]}
function badge(s){const good=["Bezahlt","OK","Bestellung abgeschlossen"].includes(s);const warn=["Niedrig","Offen","Eingegangen","In Bearbeitung"].includes(s);return '<span class="badge '+(good?"good":warn?"warn":"bad")+'">'+esc(s)+"</span>"}

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
 if(!profile){await supabaseClient.auth.signOut();return login("Dein Konto ist für Donnerfaust Barrelworks noch nicht freigeschaltet.");}
 if(profile.must_change_password)return forcePasswordChange();
 render();
 startPresence();
 supabaseClient.auth.onAuthStateChange(async (_e,s)=>{if(!s){if(presenceChannel)await supabaseClient.removeChannel(presenceChannel);presenceChannel=null;stopOrderRealtime();login()}});
}
async function loadProfile(){
 const {data,error}=await supabaseClient.from("vineyard_profiles").select("user_id,display_name,role_key,active,phone,must_change_password,vineyard_roles:role_key(key,label,permissions)").eq("user_id",(await supabaseClient.auth.getUser()).data.user.id).maybeSingle();
 if(error||!data||!data.active){profile=null;return}
 profile=data;role=data.vineyard_roles;
}
function login(message=""){
 document.body.innerHTML=`
  <div class="login"><div class="loginbox">
   <div class="loginbrand"><div class="brandmark"><img src="./assets/donnerfaust-vineyards-logo.jpg" alt="Donnerfaust Barrelworks"></div><h1>Donnerfaust Barrelworks</h1><p>Interne Betriebsverwaltung</p></div>
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
  if(!profile){await supabaseClient.auth.signOut();return login("Dieser Benutzer hat noch kein Barrelworks-Profil.");}
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
 document.body.innerHTML=`<aside class="sidebar" id="sidebar"><div class="brand"><div class="brandmark"><img src="./assets/donnerfaust-vineyards-logo.jpg" alt=""></div><div><b>Donnerfaust Barrelworks</b><small>Interne Verwaltung</small></div></div><nav>${nav}</nav><div class="sidefoot"><span class="online"></span>${esc(profile.display_name)} · ${esc(role.label)}<br><button id="logout" class="mini" style="margin-top:9px">Abmelden</button></div></aside><main class="main"><header class="top"><div class="topTitle"><img class="topbrandlogo" src="./assets/donnerfaust-vineyards-logo.jpg" alt="Donnerfaust Barrelworks"><div><button class="hamb" id="hamb">☰</button><span class="crumb">DONNERFAUST BARRELWORKS</span><h2>${esc(pageTitle())}</h2></div></div><div class="topright"><span class="online"></span><b>${esc(profile.display_name)}</b><span class="avatar">${esc(initials(profile.display_name))}</span></div></header><section class="content">${content}</section></main><div id="modalroot"></div>`;
 $$(".nav").forEach(b=>b.onclick=()=>{page=b.dataset.page;render();});$("#hamb").onclick=()=>$("#sidebar").classList.toggle("open");$("#logout").onclick=()=>supabaseClient.auth.signOut();
}
function pageTitle(){return ({dashboard:"Übersicht",invoices:"Rechnungen",orders:"Bestellungen",inventory:"Lagerübersicht",recipes:"Rezepte",production:"Produktion",trades:"Ein- und Verkauf",cash:"Kasse",employees:"Mitarbeiter",admin:"Administration"})[page]||"Übersicht"}
function initials(n){return String(n||"DF").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()}
function stat(icon,label,value){return '<div class="stat"><span class="icon">'+icon+'</span><div><small>'+label+"</small><b>"+value+"</b></div></div>"}
function intro(k,h,p,action,label){return '<div class="intro"><div><div class="eyebrow">'+k+"</div><h1>"+h+"</h1><p>"+p+"</p></div>"+(action?'<button type="button" class="btn gold" data-action="'+action+'">'+label+"</button>":"")+"</div>"}

async function dashboard(){
 const [invoiceCount,orderCount]=await Promise.all([
  can("invoice_view")?supabaseClient.from("vineyard_invoices").select("id",{count:"exact",head:true}).eq("status","Offen"):Promise.resolve({count:0,error:null}),
  supabaseClient.from("vineyard_orders").select("id",{count:"exact",head:true}).in("status",["Eingegangen","In Bearbeitung"])
 ]);
 const openInvoices=invoiceCount.error?0:(invoiceCount.count||0);
 const openOrders=orderCount.error?0:(orderCount.count||0);
 return `
  <div class="welcome">
   <div><div class="eyebrow">DONNERFAUST BARRELWORKS</div><h1>Willkommen, ${esc(profile.display_name)}</h1><p>Deine aktuelle Übersicht für den Weinbetrieb.</p></div>
   <div class="welcomegrape"><img src="./assets/donnerfaust-vineyards-logo.jpg" alt="Donnerfaust Barrelworks"></div>
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
 const {data:rows=[],error}=await supabaseClient.from("vineyard_invoices").select("id,invoice_number,invoice_type,partner_name,status,created_at,created_by,employee_id,commission_rate,commission_amount").order("created_at",{ascending:false});
 if(error)return errorBox(error.message);
 const {data:employees=[],error:ee}=await supabaseClient.rpc("vineyard_order_employees");
 if(ee)return errorBox(ee.message);
 const emap=Object.fromEntries((employees||[]).map(x=>[x.user_id,x.display_name]));
 rows.forEach(x=>x.employee_name=emap[x.employee_id]||"—");
 const open=rows.filter(x=>x.status==="Offen").length;
 const total=rows.length;
 const commission=rows.reduce((s,x)=>s+Number(x.commission_amount||0),0);
 return intro("HANDELSNACHWEISE","Rechnungen","Verkauf, Einkauf, Produktion und Bestellungen als nachvollziehbare Handelsnachweise verwalten.",can("invoice_edit")?"newinvoice":null,can("invoice_edit")?"+ Rechnung erstellen":null)+
 '<div class="stats">'+stat("▤","OFFENE RECHNUNGEN",open)+stat("$","HANDELSVORGÄNGE",total)+stat("↗","VERKAUF",rows.filter(x=>x.invoice_type==="Verkauf").length)+stat("%","PROVISIONEN",money(commission))+'</div>'+
 '<div class="panel"><div class="tablewrap"><table><thead><tr><th>NUMMER</th><th>ART</th><th>HANDELSPARTNER</th><th>MITARBEITER</th><th>PROVISION</th><th>DATUM</th><th>STATUS</th><th></th></tr></thead><tbody>'+
 (rows.map(x=>'<tr><td><b>'+esc(x.invoice_number)+'</b></td><td>'+esc(x.invoice_type)+'</td><td>'+esc(x.partner_name)+'</td><td>'+esc(x.employee_name)+'</td><td>'+money(x.commission_amount||0)+' ('+Number(x.commission_rate||0).toLocaleString("de-DE")+'%)</td><td>'+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</td><td>'+badge(x.status)+'</td><td><button class="mini gold" data-share-invoice="'+x.id+'">Teilen</button> <button class="mini" data-edit-invoice="'+x.id+'">Bearbeiten</button> <button class="mini" data-delete-invoice="'+x.id+'">Löschen</button></td></tr>').join("")||'<tr><td colspan="8">Noch keine Rechnungen vorhanden.</td></tr>')+
 '</tbody></table></div></div>';
}
async function orders(){
 const {data:rows=[],error}=await supabaseClient.from("vineyard_orders").select("id,order_number,status,customer_name,customer_email,customer_phone,customer_address,customer_note,employee_id,total,commission_rate,commission_amount,created_at,accepted_at,completed_at").order("created_at",{ascending:false});
 if(error)return errorBox(error.message);
 const {data:employees=[],error:ee}=await supabaseClient.rpc("vineyard_invoice_employees");
 if(ee)return errorBox(ee.message);
 const emap=Object.fromEntries((employees||[]).map(x=>[x.user_id,x.display_name]));
 rows.forEach(x=>x.employee_name=emap[x.employee_id]||"—");
 const open=rows.filter(x=>x.status==="Eingegangen"||x.status==="In Bearbeitung");
 const recent=rows.filter(x=>x.status==="Bestellung abgeschlossen").slice(0,10);
 const totalOpen=open.reduce((n,x)=>n+Number(x.total||0),0);
 const formLink=new URL("./bestellung.html",location.href).href;
 const card=x=>'<div class="ordercard"><div class="ordercardtop"><div><span class="orderNo">'+esc(x.order_number)+'</span>'+badge(x.status)+'</div><b>'+money(x.total)+'</b></div>'+
 '<div class="ordercustomer"><strong>'+esc(x.customer_name)+'</strong><span>'+esc(x.customer_email)+'</span>'+(x.customer_phone?'<span>'+esc(x.customer_phone)+'</span>':'')+'</div>'+
 '<div class="ordermeta"><span>Erstellt: '+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</span><span>Mitarbeiter: '+esc(x.employee_name)+'</span>'+(x.commission_amount?'<span>Provision: '+money(x.commission_amount)+'</span>':'')+'</div>'+
 '<div class="orderactions"><button class="mini gold" data-view-order="'+x.id+'">Details</button><button class="mini" data-edit-order="'+x.id+'">Bearbeiten</button>'+
 (x.status==="Eingegangen"?'<button class="mini gold" data-order-status="'+x.id+'|In Bearbeitung">Bestellung annehmen</button>':"")+
 (x.status==="In Bearbeitung"?'<button class="mini gold" data-order-status="'+x.id+'|Bestellung abgeschlossen">Bestellung abschließen</button>':"")+
 '<button class="mini" data-delete-order="'+x.id+'">Löschen</button>'+
 '</div></div>';
 return intro("BESTELLUNGEN","Bestellungsmenü","Kunden bestellen über einen öffentlichen Link. Mitarbeiter nehmen Bestellungen an, bearbeiten sie und schließen sie anschließend ab.",null,null)+
 '<div class="orderlinkpanel"><div><div class="eyebrow">KUNDENFORMULAR</div><b>Bestelllink für Kunden</b><p>Über diesen Link kann ein Kunde seine Bestellung selbst zusammenstellen. Der Preis wird dabei automatisch aus dem Verkaufspreis des Lagers berechnet.</p></div><div class="orderlinkactions"><input class="orderlinkinput" readonly value="'+esc(formLink)+'"><button class="btn gold" data-action="copy-order-link">Link kopieren</button><button class="btn outline" data-action="open-order-form">Formular öffnen</button></div></div>'+
 '<div class="stats">'+stat("🛒","OFFENE BESTELLUNGEN",open.length)+stat("$","OFFENER BESTELLWERT",money(totalOpen))+stat("↗","IN BEARBEITUNG",rows.filter(x=>x.status==="In Bearbeitung").length)+stat("✓","LETZTE BESTELLUNGEN",recent.length)+'</div>'+
 '<div class="orderssection"><div class="sectiontitle"><div><div class="eyebrow">AKTUELL</div><h2>Offene Bestellungen</h2><p>Neue Bestellungen und Bestellungen in Bearbeitung.</p></div></div>'+
 '<div class="ordergrid">'+(open.map(card).join("")||'<div class="panel"><p class="muted">Aktuell liegen keine offenen Bestellungen vor.</p></div>')+'</div></div>'+
 '<div class="orderssection"><div class="sectiontitle"><div><div class="eyebrow">ARCHIV</div><h2>Letzte Bestellungen</h2><p>Abgeschlossene Bestellungen bleiben hier als Nachweis erhalten.</p></div></div>'+
 '<div class="ordergrid">'+(recent.map(card).join("")||'<div class="panel"><p class="muted">Noch keine abgeschlossenen Bestellungen.</p></div>')+'</div></div>';
}
async function admin(){
 if(!role?.permissions?.admin_access)return errorBox("Kein Admin-Zugang.");
 const {data:rows=[],error}=await supabaseClient.from("vineyard_audit_log").select("*,vineyard_profiles:actor_id(display_name)").order("created_at",{ascending:false}).limit(500);
 if(error)return errorBox(error.message);
 const actorName=x=>x.vineyard_profiles?.display_name||x.details?.actor_name||"SYSTEM";
 const formatDate=x=>{const d=new Date(x.created_at);return d.toLocaleDateString("de-DE")+" · "+d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})+" Uhr"};
 const message=x=>{
  const d=x.details||{}, a=String(x.action||"").toLowerCase(), name=actorName(x);
  if(a.includes("rezept produziert")) return name+" hat "+Number(d.output_quantity||0).toLocaleString("de-DE")+" "+(d.output_unit||"")+" "+(d.recipe||"produziert")+".";
  if(a.includes("ein-/verkauf gebucht")||a.includes("einkauf gebucht")||a.includes("verkauf gebucht")) return name+" hat "+String(d.quantity||"")+" "+String(d.unit||"")+" "+String(d.item_name||"Artikel")+" als "+String(d.trade_type||"Vorgang")+" gebucht: "+money(d.total||0)+".";
  if(a.includes("kassenbuchung")) return name+" hat "+(d.kind==="in"?"eine Einnahme":"eine Ausgabe")+" von "+money(d.amount||0)+" in die Kasse gebucht.";
  if(a==="lagerbestand geändert") return name+" hat den Lagerbestand von "+String(d.item_name||"Artikel")+" um "+Number(d.delta||0).toLocaleString("de-DE")+" verändert.";
  if(a.includes("bestellung eingegangen")) return "KUNDE hat Bestellung "+String(d.order_number||"")+" über "+money(d.total||0)+" eingereicht.";
  if(a.includes("bestellung angenommen")) return name+" hat Bestellung "+String(d.order_number||"")+" angenommen.";
  if(a.includes("bestellung abgeschlossen")) return name+" hat Bestellung "+String(d.order_number||"")+" abgeschlossen.";
  if(a.includes("rechnung erstellt")) return name+" hat eine Rechnung erstellt.";
  if(a.includes("rechnung geändert")) return name+" hat eine Rechnung geändert.";
  if(a.includes("rechnung gelöscht")) return name+" hat eine Rechnung gelöscht.";
  if(a.includes("rezept gelöscht")) return name+" hat das Rezept "+String(d.name||"")+" gelöscht.";
  if(a.includes("lagerartikel gelöscht")) return name+" hat den Lagerartikel gelöscht.";
  if(a.includes("mitarbeiter angelegt")) return name+" hat einen Mitarbeiter angelegt.";
  if(a.includes("mitarbeiter geändert")) return name+" hat einen Mitarbeiter geändert.";
  if(a.includes("mitarbeiter gelöscht")) return name+" hat einen Mitarbeiter gelöscht.";
  if(a.includes("ein-/verkauf geändert")) return name+" hat einen Ein-/Verkauf geändert.";
  if(a.includes("ein-/verkauf gelöscht")) return name+" hat einen Ein-/Verkauf gelöscht.";
  return name+" hat "+String(x.action||"eine Änderung")+" durchgeführt.";
 };
 return '<div class="intro"><div><div class="eyebrow">ADMINISTRATION</div><h1>Aktivitätslog</h1><p>Hier wird nachvollziehbar festgehalten, was im Barrelworks-System passiert ist – mit Datum, Uhrzeit, Mitarbeiter und Vorgang.</p></div></div>'+
 '<div class="panel adminlog"><div class="adminloghead"><div><b>Vollständiges Systemprotokoll</b><small>Die neuesten 500 Einträge</small></div><span class="badge good">'+rows.length+' Einträge</span></div>'+
 (rows.map(x=>'<div class="adminlogrow"><div class="adminlogtime">'+esc(formatDate(x))+'</div><div class="adminlogicon">◷</div><div class="adminlogbody"><b>'+esc(message(x))+'</b><small>'+esc(actorName(x))+' · '+esc(x.entity||"System")+'</small></div></div>').join("")||'<p class="muted">Noch keine Aktivitäten protokolliert.</p>')+
 '</div>';
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
  const actions=can("inventory_edit")?`<button class="mini gold" data-stock="${x.id}">Bestand ändern</button> <button class="mini" data-edit-item="${x.id}">Bearbeiten</button> <button class="mini" data-delete-item="${x.id}">Löschen</button>`:"";
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
async function production(){
 const [{data:recipes=[],error:recipeError},{data:inv=[],error:invError}]=await Promise.all([
  supabaseClient.from("vineyard_recipes").select("id,name,output_inventory_id,output_quantity,active").eq("active",true).order("name"),
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category").order("item_name")
 ]);
 if(recipeError||invError)return errorBox((recipeError||invError).message);
 const products=Object.fromEntries(inv.filter(x=>x.category==="Produkte").map(x=>[x.id,x]));
 const ingredients=Object.fromEntries(inv.filter(x=>x.category==="Zutaten").map(x=>[x.id,x]));
 const recipeIds=recipes.map(x=>x.id);
 let items=[];
 if(recipeIds.length){
  const r=await supabaseClient.from("vineyard_recipe_items").select("recipe_id,inventory_id,quantity").in("recipe_id",recipeIds).order("created_at");
  if(r.error)return errorBox(r.error.message);
  items=r.data||[];
 }
 const byRecipe={};
 items.forEach(x=>(byRecipe[x.recipe_id]??=[]).push(x));
 if(!recipes.length)return intro("PRODUKTION","Produktion","Wähle ein gespeichertes Rezept und buche die Herstellung. Die Lagerbestände werden automatisch angepasst.",null,null)+
  '<div class="panel"><b>Noch keine Rezepte vorhanden.</b><p class="muted">Lege zuerst im Lager Zutaten und Produkte an und erstelle anschließend unter Rezepte ein Rezept.</p></div>';

 const first=recipes[0];
 const recipeOptions=recipes.map(x=>({value:x.id,label:x.name}));
 const outputFor=r=>products[r?.output_inventory_id];
 const rowsFor=(recipeId,batches)=>{
  const list=byRecipe[recipeId]||[];
  if(!list.length)return '<p class="muted">Für dieses Rezept sind keine Zutaten hinterlegt.</p>';
  return list.map(x=>{
   const ing=ingredients[x.inventory_id];
   const need=Number(x.quantity)*Number(batches||0);
   return '<div class="productioningredient"><div><b>'+esc(ing?.item_name||"Unbekannte Zutat")+'</b><small>'+esc(ing?.unit||"")+'</small></div><strong>'+need.toLocaleString("de-DE",{maximumFractionDigits:6})+' '+esc(ing?.unit||"")+'</strong></div>';
  }).join("");
 };
 const output=outputFor(first);
 return intro("PRODUKTION","Produktion","Rezept auswählen, Menge festlegen und die benötigten Zutaten vor der Buchung prüfen.",null,null)+
 '<div class="productionpanel">'+
 '<div class="productionform">'+
 selectField("Rezept","production_recipe",recipeOptions,first.id)+
 field("Menge","production_batches","number",1,true)+
 '<div class="productionoutput"><span>HERGESTELLTES PRODUKT</span><b id="productionOutputName">'+esc(output?.item_name||"")+'</b><small id="productionOutputQty">'+Number(first.output_quantity||1).toLocaleString("de-DE")+' '+esc(output?.unit||"")+' pro Produktion</small></div>'+
 '<button type="button" class="btn primary" id="bookProduction" '+(can("inventory_edit")?"":"disabled")+'>Produktion buchen</button>'+
 (!can("inventory_edit")?'<p class="muted">Du hast keine Berechtigung, Produktionen zu buchen.</p>':"")+
 '</div>'+
 '<div class="productioningredientswrap"><div class="eyebrow">BENÖTIGTE ZUTATEN</div><h3>Automatisch berechnet</h3><div id="productionIngredients">'+rowsFor(first.id,1)+'</div></div>'+
 '</div>';
}

async function trades(){
 const {data:rows=[],error}=await supabaseClient.from("vineyard_trades").select("*").order("created_at",{ascending:false});
 if(error)return errorBox(error.message);
 const purchases=rows.filter(x=>x.trade_type==="Einkauf");
 const sales=rows.filter(x=>x.trade_type==="Verkauf");
 const purchaseTotal=purchases.reduce((sum,x)=>sum+Number(x.total||0),0);
 const salesTotal=sales.reduce((sum,x)=>sum+Number(x.total||0),0);
 return intro("HANDEL","Ein- und Verkauf","Ein- und Verkäufe buchen. Lagerbestand und Kasse werden dabei automatisch und gemeinsam aktualisiert.",can("trade_edit")?"newtrade":null,can("trade_edit")?"+ Ein-/Verkauf":null)+
 '<div class="stats">'+
 stat("↘","EINKÄUFE",money(purchaseTotal))+
 stat("↗","VERKÄUFE",money(salesTotal))+
 stat("$","HANDELSVORGÄNGE",rows.length)+
 stat("▦","NETTO",money(salesTotal-purchaseTotal))+
 '</div>'+
 '<div class="panel tradehint"><b>Automatik:</b> Einkauf erhöht den Lagerbestand und belastet die Kasse. Verkauf reduziert den Lagerbestand und schreibt den Verkauf als Einnahme in die Kasse.</div>'+
 '<div class="panel"><div class="tablewrap"><table><thead><tr><th>DATUM</th><th>ART</th><th>ARTIKEL</th><th>MENGE</th><th>EINZELPREIS</th><th>GESAMT</th><th></th></tr></thead><tbody>'+
 (rows.map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</td><td>'+(x.trade_type==="Einkauf"?'<span class="badge warn">Einkauf</span>':'<span class="badge good">Verkauf</span>')+'</td><td><b>'+esc(x.item_name)+'</b><small class="tableunit">'+esc(x.unit)+'</small></td><td>'+Number(x.quantity).toLocaleString("de-DE")+'</td><td>'+money(x.unit_price)+'</td><td><b>'+money(x.total)+'</b></td><td><button class="mini gold" data-edit-trade="'+x.id+'">Bearbeiten</button> <button class="mini" data-delete-trade="'+x.id+'">Löschen</button></td></tr>').join("")||'<tr><td colspan="7">Noch keine Ein- oder Verkäufe gebucht.</td></tr>')+
 '</tbody></table></div></div>';
}
async function cash(){
 const {data:rows=[],error}=await supabaseClient.from("vineyard_cashbook").select("*").order("created_at",{ascending:false});
 if(error)return errorBox(error.message);
 const balance=rows.reduce((s,x)=>s+(x.kind==="in"?1:-1)*Number(x.amount||0),0);
 return intro("KASSE","Kassenbuch","Ein- und Auszahlungen mit Benutzerprotokoll.",can("cash_edit")?"newcash":null,can("cash_edit")?"+ Buchung":null)+
 '<div class="stats">'+stat("$","AKTUELLER KASSENSTAND",money(balance))+stat("↗","EINNAHMEN",money(rows.filter(x=>x.kind==="in").reduce((s,x)=>s+Number(x.amount),0)))+stat("↘","AUSGABEN",money(rows.filter(x=>x.kind==="out").reduce((s,x)=>s+Number(x.amount),0)))+stat("▤","BUCHUNGEN",rows.length)+"</div>"+
 '<div class="panel"><div class="tablewrap"><table><thead><tr><th>DATUM</th><th>ART</th><th>BETRAG</th><th>KATEGORIE</th><th>BESCHREIBUNG</th><th></th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</td><td>'+(x.kind==="in"?'<span class="badge good">Einnahme</span>':'<span class="badge bad">Ausgabe</span>')+'</td><td><b>'+money(x.amount)+"</b></td><td>"+esc(x.category)+(x.source_type==="trade"?' <span class="badge warn">Ein-/Verkauf</span>':"")+"</td><td>"+esc(x.description)+"</td><td>"+(x.source_type==="trade"?'<span class="muted">Über Ein-/Verkauf</span>':'<button class=\"mini\" data-edit-cash=\""+x.id+"\">Bearbeiten</button> <button class=\"mini\" data-delete-cash=\""+x.id+"\">Löschen</button>')+"</td></tr>").join("")||'<tr><td colspan="6">Keine Buchungen.</td></tr>'+"</tbody></table></div></div>";
}
async function employees(){
 const [{data:emps=[]},{data:roles=[]}]=await Promise.all([
  supabaseClient.from("vineyard_profiles").select("user_id,display_name,role_key,active,phone,vineyard_roles:role_key(label)").order("display_name"),
  supabaseClient.from("vineyard_roles").select("key,label,permissions").order("key")
 ]);
 return intro("TEAM","Mitarbeiter","Konten, Rollen und Rechte werden ausschließlich über den Master verwaltet.",can("employees_edit")?"newemployee":null,can("employees_edit")?"+ Mitarbeiter":null)+
 '<div class="employeegrid">'+emps.map(x=>'<div class="employee"><div class="avatar">'+esc(initials(x.display_name))+'</div><div style="flex:1"><b>'+esc(x.display_name)+"</b><small>"+esc(x.vineyard_roles?.label||x.role_key)+" · "+(x.active?'<span class="good">Aktiv</span>':'<span class="bad">Deaktiviert</span>')+"</small>"+(x.phone?'<small>'+esc(x.phone)+"</small>":"")+'</div>'+(role?.key==="master"?'<button class="mini" data-edit-employee="'+x.user_id+'">Bearbeiten</button> <button class="mini" data-delete-employee="'+x.user_id+'">Löschen</button>':"")+"</div>").join("")+"</div>";
}
function errorBox(t){return '<div class="panel"><b>Fehler</b><p class="muted">'+esc(t)+"</p></div>"}

async function render(){
 let content=page==="dashboard"?await dashboard():page==="invoices"?await invoices():page==="orders"?await orders():page==="inventory"?await inventory():page==="recipes"?await recipes():page==="production"?await production():page==="trades"?await trades():page==="cash"?await cash():page==="employees"?await employees():page==="admin"?await admin():await dashboard();
 shell(content);bind();
 if(page==="orders")startOrderRealtime();else stopOrderRealtime();
}
function bind(){
 document.onclick=async e=>{
  const b=e.target.closest?.("[data-action]");
  if(!b)return;
  e.preventDefault();
  e.stopPropagation();
  if(b.dataset.busy==="1")return;
  b.dataset.busy="1";
  b.disabled=true;
  try{await action(b.dataset.action)}catch(err){console.error("Donnerfaust Barrelworks Aktion:",err);alert(err?.message||String(err))}
  finally{b.disabled=false;b.dataset.busy="0"}
 };
 $("[data-page-action]").forEach(b=>b.onclick=()=>{page=b.dataset.pageAction;render()});
 if(page==="production"){
  const recipeEl=$("#production_recipe"),batchEl=$("[name=production_batches]"),book=$("#bookProduction"),ingEl=$("#productionIngredients"),outName=$("#productionOutputName"),outQty=$("#productionOutputQty");
  const recipeData=[];
  const productMap={};
  const updateProduction=async()=>{
   const id=recipeEl?.value,batches=Number(batchEl?.value)||0;
   if(!id)return;
   const [rr,ir]=await Promise.all([
    supabaseClient.from("vineyard_recipes").select("id,name,output_inventory_id,output_quantity").eq("id",id).single(),
    supabaseClient.from("vineyard_recipe_items").select("inventory_id,quantity,vineyard_inventory:inventory_id(item_name,unit)").eq("recipe_id",id).order("created_at")
   ]);
   if(rr.error||ir.error)return;
   const rec=rr.data; const product=(await supabaseClient.from("vineyard_inventory").select("item_name,unit").eq("id",rec.output_inventory_id).single()).data;
   if(outName)outName.textContent=product?.item_name||"";
   if(outQty)outQty.textContent=(Number(rec.output_quantity||1)*batches).toLocaleString("de-DE",{maximumFractionDigits:6})+" "+(product?.unit||"")+" hergestellt";
   if(ingEl)ingEl.innerHTML=(ir.data||[]).map(x=>'<div class="productioningredient"><div><b>'+esc(x.vineyard_inventory?.item_name||"Unbekannte Zutat")+'</b><small>'+esc(x.vineyard_inventory?.unit||"")+'</small></div><strong>'+(Number(x.quantity)*batches).toLocaleString("de-DE",{maximumFractionDigits:6})+' '+esc(x.vineyard_inventory?.unit||"")+'</strong></div>').join("")||'<p class="muted">Keine Zutaten hinterlegt.</p>';
  };
  recipeEl?.addEventListener("change",updateProduction);batchEl?.addEventListener("input",updateProduction);updateProduction();
  book?.addEventListener("click",async()=>{
   book.disabled=true;
   try{
    const batches=Number(batchEl.value);
    if(!Number.isFinite(batches)||batches<=0)throw Error("Die Menge muss größer als 0 sein.");
    const r=await supabaseClient.rpc("vineyard_produce_recipe",{p_recipe_id:recipeEl.value,p_batches:batches});
    if(r.error)throw r.error;
    alert("Produktion wurde gebucht.");
    await render();
   }catch(err){alert(err.message||String(err));book.disabled=false}
  });
 }
 $("#q")?.addEventListener("input",async e=>{const {data=[]}=await supabaseClient.from("vineyard_inventory").select("*").order("category").order("item_name");const q=e.target.value.toLowerCase();$("#ingredients").innerHTML=itemCards(data.filter(x=>x.category==="Zutaten"&&x.item_name.toLowerCase().includes(q)));$("#products").innerHTML=itemCards(data.filter(x=>x.category==="Produkte"&&x.item_name.toLowerCase().includes(q)))});
 $$("[data-stock]").forEach(b=>b.onclick=()=>stockModal(b.dataset.stock));
 $$("[data-edit-item]").forEach(b=>b.onclick=()=>itemModal(b.dataset.editItem));
 $$("[data-delete-item]").forEach(b=>b.onclick=()=>deleteItem(b.dataset.deleteItem));
 $$("[data-edit-recipe]").forEach(b=>b.onclick=()=>recipeModal(b.dataset.editRecipe));
 $$("[data-delete-recipe]").forEach(b=>b.onclick=()=>deleteRecipe(b.dataset.deleteRecipe));
 $("[data-edit-trade]").forEach(b=>b.onclick=()=>tradeModal(b.dataset.editTrade));
 $("[data-delete-trade]").forEach(b=>b.onclick=()=>deleteTrade(b.dataset.deleteTrade));
 $("[data-edit-cash]").forEach(b=>b.onclick=()=>cashModal(b.dataset.editCash));
 $("[data-delete-cash]").forEach(b=>b.onclick=()=>deleteCash(b.dataset.deleteCash));
 $$("[data-edit-employee]").forEach(b=>b.onclick=()=>employeeModal(b.dataset.editEmployee));
 $$("[data-delete-employee]").forEach(b=>b.onclick=()=>deleteEmployee(b.dataset.deleteEmployee));
 $$("[data-share-invoice]").forEach(b=>b.onclick=()=>shareInvoice(b.dataset.shareInvoice));
 $$("[data-edit-invoice]").forEach(b=>b.onclick=()=>invoiceModal(b.dataset.editInvoice));
 $("[data-delete-invoice]").forEach(b=>b.onclick=()=>deleteInvoice(b.dataset.deleteInvoice));
 $("[data-view-order]").forEach(b=>b.onclick=()=>orderModal(b.dataset.viewOrder));
 $("[data-order-status]").forEach(b=>b.onclick=async()=>{const [id,status]=b.dataset.orderStatus.split("|");await updateOrderStatus(id,status)});
 $("[data-delete-order]").forEach(b=>b.onclick=()=>deleteOrder(b.dataset.deleteOrder));

}
async function action(a){
 if(a==="openinventory"){page="inventory";await render();return}
 if(a==="newitem"){await itemModal();return}
 if(a==="newrecipe"){await recipeModal();return}
 if(a==="newcash"){await cashModal();return}
 if(a==="newtrade"){await tradeModal();return}
 if(a==="newemployee"){await employeeModal();return}
 if(a==="newinvoice"){await invoiceModal();return}
 if(a==="copy-order-link"){const link=new URL("./bestellung.html",location.href).href;try{await navigator.clipboard.writeText(link);alert("Kunden-Bestelllink kopiert.")}catch(_){prompt("Kunden-Bestelllink",link)}return}
 if(a==="open-order-form"){window.open(new URL("./bestellung.html",location.href).href,"_blank");return}
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
 if(id){const {data,error}=await supabaseClient.from("vineyard_inventory").select("*").eq("id",id).single();if(error)throw error;if(ee)throw ee;item=data}
 const cat=item?.category||"Zutaten";
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal"><div class="modalhead"><b>'+(id?"Lagerartikel bearbeiten":"Neuer Lagerartikel")+'</b><button id="x">×</button></div><form id="mf">'+
 field("Artikel / Ressource","item_name","text",item?.item_name||"",true)+
 selectField("Kategorie","category",[{value:"Zutaten",label:"Zutaten"},{value:"Produkte",label:"Produkte"}],cat)+
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
 if(!ingredients.length)throw Error("Lege zuerst mindestens eine Zutat im Lager an.");
 if(!products.length)throw Error("Lege zuerst mindestens ein Produkt im Lager an.");

 const rows=existing.length
  ? existing.map(x=>({inventory_id:x.inventory_id,quantity:x.quantity}))
  : [
    {inventory_id:ingredients[0].id,quantity:1},
    {inventory_id:ingredients[Math.min(1,ingredients.length-1)].id,quantity:1}
   ];

 $("#modalroot").innerHTML='<div class="modalback"><div class="modal recipeModal"><div class="modalhead"><b>'+(id?"Rezept bearbeiten":"Neues Rezept")+'</b><button id="x">×</button></div><form id="recipeform">'+
 selectField("Produkt","output_inventory_id",products.map(x=>({value:x.id,label:x.item_name+" · "+x.unit})),recipe?.output_inventory_id||products[0].id)+
 '<div class="recipeformhead"><b>Zutaten</b><button type="button" class="mini gold" id="addingredient">+ Zutat</button></div><div id="recipeitemsform"></div>'+
 '<div class="actions"><button type="button" class="btn outline" id="cancel">Abbrechen</button><button class="btn primary">Speichern</button></div></form></div></div>';

 const close=()=>$("#modalroot").innerHTML="";
 $("#x").onclick=$("#cancel").onclick=close;

 const draw=()=>{
  $("#recipeitemsform").innerHTML=rows.map((r,n)=>
   '<div class="recipeformrow"><select data-ri="'+n+'" class="recipeingredient">'+
   ingredients.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===r.inventory_id?"selected":"")+'>'+esc(x.item_name)+' · '+esc(x.unit)+'</option>').join("")+
   '</select><input data-rq="'+n+'" class="recipequantity" type="number" min="0.0001" step="any" value="'+esc(r.quantity)+'" required>'+
   '<button type="button" class="mini" data-remove-ri="'+n+'">×</button></div>'
  ).join("");
  $$("[data-remove-ri]").forEach(b=>b.onclick=()=>{
   if(rows.length<=1)return;
   rows.splice(Number(b.dataset.removeRi),1);
   draw();
  });
 };
 $("#addingredient").onclick=()=>{
  rows.push({inventory_id:ingredients[0].id,quantity:1});
  draw();
 };
 draw();

 $("#recipeform").onsubmit=async e=>{
  e.preventDefault();
  const b=e.submitter;b.disabled=true;
  try{
   const output_inventory_id=e.target.output_inventory_id.value;
   const product=products.find(x=>x.id===output_inventory_id);
   const payload=[...$(".recipeformrow")].map(row=>({
    inventory_id:row.querySelector(".recipeingredient").value,
    quantity:Number(row.querySelector(".recipequantity").value)
   })).filter(x=>x.inventory_id);

   if(!product)throw Error("Bitte ein Produkt auswählen.");
   if(!payload.length)throw Error("Ein Rezept benötigt mindestens eine Zutat.");
   if(payload.some(x=>!Number.isFinite(x.quantity)||x.quantity<=0))throw Error("Alle Zutatenmengen müssen größer als 0 sein.");
   if(new Set(payload.map(x=>x.inventory_id)).size!==payload.length)throw Error("Eine Zutat darf pro Rezept nur einmal vorkommen.");

   const r=await supabaseClient.rpc("vineyard_save_recipe",{
    p_recipe_id:id||null,
    p_name:product.item_name,
    p_description:"",
    p_output_inventory_id:output_inventory_id,
    p_output_quantity:1,
    p_items:payload
   });
   if(r.error)throw r.error;
   close();
   await render();
  }catch(err){alert(err.message||String(err))}
  finally{b.disabled=false}
 };
}
async function deleteRecipe(id){
 if(!confirm("Dieses Rezept wirklich löschen?"))return;
 const r=await supabaseClient.rpc("vineyard_delete_recipe",{p_recipe_id:id});
 if(r.error)return alert(r.error.message);
 await render();
}
async function invoiceModal(id){
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal"><div class="modalhead"><b>Rechnung wird vorbereitet</b></div><p class="muted">Lagerartikel und Mitarbeiter werden geladen…</p></div></div>';
 const [{data:inventory=[],error},{data:existingInvoice},{data:employees=[],error:ee}]=await Promise.all([
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category,purchase_price,sale_price").order("category").order("item_name"),
  id?supabaseClient.from("vineyard_invoices").select("id,invoice_type,partner_name,status,employee_id,commission_rate,commission_amount").eq("id",id).single():Promise.resolve({data:null}),
  supabaseClient.rpc("vineyard_order_employees")
 ]);
 if(error)throw error;
 if(ee)throw ee;
 if(id&&!existingInvoice)throw Error("Rechnung nicht gefunden.");
 if(!inventory.length)throw Error("Lege zuerst Artikel im Lager an. Nur dort hinterlegte Artikel können auf Rechnungen ausgewählt werden.");
 const typeOptions=[
  {value:"Produktion",label:"🏭 Produktion · Provision 10%"},
  {value:"Verkauf",label:"🛒 Verkauf · Provision 20%"},
  {value:"Einkauf",label:"📦 Einkauf · keine Provision"},
  {value:"Bestellung",label:"📋 Bestellung/Lieferung · Provision 30%"}
 ];
 let existingItems=[];
 if(id){
  const {data:its,error:ie}=await supabaseClient.from("vineyard_invoice_items").select("inventory_id,quantity,unit_price").eq("invoice_id",id).order("created_at");
  if(ie)throw ie;
  existingItems=its||[];
 }
 const rows=existingItems.length?existingItems.map(x=>({inventory_id:x.inventory_id,quantity:x.quantity,unit_price:x.unit_price})):[{inventory_id:inventory[0].id,quantity:1,unit_price:0}];
 const defaultPrice=(item,type)=>type==="Einkauf"?Number(item?.purchase_price||0):Number(item?.sale_price||0);
 const defaultEmployee=existingInvoice?.employee_id||profile.user_id;
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal invoiceModal"><div class="modalhead"><b>'+(id?"Rechnung bearbeiten":"Neue Rechnung")+'</b><button id="x">×</button></div><form id="invoiceform">'+
 selectField("Handelsvorgang","invoice_type",typeOptions,existingInvoice?.invoice_type||"Verkauf")+
 selectField("Mitarbeiter / Provision","employee_id",employees.map(x=>({value:x.user_id,label:x.display_name})),defaultEmployee)+
 selectField("Status","status",[{value:"Offen",label:"Offen"},{value:"Bezahlt",label:"Bezahlt"},{value:"Storniert",label:"Storniert"}],existingInvoice?.status||"Offen")+
 field("Handelspartner","partner_name","text",existingInvoice?.partner_name||"",true)+
 '<div class="recipeformhead"><b>Gehandelte Positionen</b><button type="button" class="mini gold" id="addinvoiceitem">+ Position</button></div><div id="invoiceitemsform"></div>'+
 '<div class="invoiceTotal" id="invoiceTotal"></div><div class="invoiceCommission" id="invoiceCommission"></div>'+
 '<div class="actions"><button type="button" class="btn outline" id="cancel">Abbrechen</button><button class="btn primary">Rechnung speichern</button></div></form></div></div>';
 const close=()=>$("#modalroot").innerHTML="";
 $("#x").onclick=$("#cancel").onclick=close;
 const typeEl=$("#invoiceform [name=invoice_type]");
 const employeeEl=$("#invoiceform [name=employee_id]");
 const statusEl=$("#invoiceform [name=status]");
 const commissionRate=type=>type==="Produktion"?10:type==="Verkauf"?20:type==="Bestellung"?30:0;
 const draw=()=>{
  $("#invoiceitemsform").innerHTML=rows.map((r,n)=>'<div class="invoiceformrow"><select data-ii="'+n+'" class="invoiceitem">'+inventory.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===r.inventory_id?"selected":"")+'>'+esc(x.item_name)+' · '+esc(x.unit)+'</option>').join("")+'</select><input data-iq="'+n+'" class="invoicequantity" type="number" min="0.0001" step="any" value="'+esc(r.quantity)+'" required><input data-ip="'+n+'" class="invoiceprice" type="number" min="0" step="0.01" value="'+esc(r.unit_price)+'" required><button type="button" class="mini" data-remove-ii="'+n+'">×</button></div>').join("");
  const refresh=()=>{
   let sum=0,base=0;
   rows.forEach((r,n)=>{
    const q=Number($("[data-iq='"+n+"']")?.value)||0,p=Number($("[data-ip='"+n+"']")?.value)||0;
    sum+=q*p;
    const item=inventory.find(x=>x.id===r.inventory_id);
    base+=q*Number(item?.sale_price||0);
   });
   const rate=commissionRate(typeEl.value),commission=base*rate/100;
   $("#invoiceTotal").innerHTML="<span>Rechnungssumme</span><b>"+money(sum)+"</b>";
   $("#invoiceCommission").innerHTML=rate?"<span>Mitarbeiterprovision · "+rate+"%</span><b>"+money(commission)+"</b><small>Berechnet aus dem im Lager hinterlegten Verkaufspreis.</small>":"<span>Keine Mitarbeiterprovision bei Einkauf</span>";
  };
  $$(".invoiceitem").forEach(s=>s.onchange=()=>{const n=Number(s.dataset.ii),item=inventory.find(x=>x.id===s.value);rows[n].inventory_id=s.value;rows[n].unit_price=defaultPrice(item,typeEl.value);$("[data-ip='"+n+"']").value=rows[n].unit_price.toFixed(2);refresh()});
  $$(".invoicequantity").forEach(i=>i.oninput=refresh);
  $$(".invoiceprice").forEach(i=>i.oninput=refresh);
  $$(".invoicequantity").forEach(i=>i.onchange=()=>rows[Number(i.dataset.iq)].quantity=Number(i.value));
  $$(".invoiceprice").forEach(i=>i.onchange=()=>rows[Number(i.dataset.ip)].unit_price=Number(i.value));
  $$(".invoiceitem").forEach(s=>{const n=Number(s.dataset.ii);if(!rows[n].unit_price){const item=inventory.find(x=>x.id===s.value);rows[n].unit_price=defaultPrice(item,typeEl.value);$("[data-ip='"+n+"']").value=rows[n].unit_price.toFixed(2)}});
  $$(".invoiceformrow [data-remove-ii]").forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.removeIi),1);if(!rows.length)rows.push({inventory_id:inventory[0].id,quantity:1,unit_price:defaultPrice(inventory[0],typeEl.value)});draw()});
  refresh();
 };
 $("#addinvoiceitem").onclick=()=>{const item=inventory[0];rows.push({inventory_id:item.id,quantity:1,unit_price:defaultPrice(item,typeEl.value)});draw()};
 typeEl.onchange=()=>{rows.forEach(r=>{const item=inventory.find(x=>x.id===r.inventory_id);r.unit_price=defaultPrice(item,typeEl.value)});draw()};
 rows[0].unit_price=defaultPrice(inventory[0],existingInvoice?.invoice_type||"Verkauf");draw();
 $("#invoiceform").onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  try{
   rows.forEach((r,n)=>{r.quantity=Number($("[data-iq='"+n+"']").value);r.unit_price=Number($("[data-ip='"+n+"']").value)});
   if(!rows.length||rows.some(r=>!r.inventory_id||!Number.isFinite(r.quantity)||r.quantity<=0||!Number.isFinite(r.unit_price)||r.unit_price<0))throw Error("Bitte Positionen, Mengen und Preise prüfen.");
   const partner=e.target.partner_name.value.trim();
   if(!partner)throw Error("Bitte einen Handelspartner angeben.");
   const rate=commissionRate(typeEl.value);
   if(rate&&!employeeEl.value)throw Error("Für Produktion, Verkauf und Bestellung/Lieferung muss ein Mitarbeiter ausgewählt werden.");
   const r=await supabaseClient.rpc("vineyard_save_invoice",{p_invoice_id:id||null,p_type:typeEl.value,p_partner_name:partner,p_status:statusEl.value,p_employee_id:employeeEl.value||null,p_items:rows});
   if(r.error)throw r.error;
   close();await render();
  }catch(err){alert(err.message||String(err))}finally{b.disabled=false}
 };
}
async function deleteItem(id){
 if(!confirm("Diesen Lagerartikel wirklich löschen? Zugehörige Rezepte werden dabei entfernt; historische Rechnungspositionen bleiben erhalten."))return;
 const {error}=await supabaseClient.rpc("vineyard_delete_inventory",{p_inventory_id:id});if(error)throw error;await render();
}
async function deleteTrade(id){
 if(!confirm("Diesen Ein-/Verkauf wirklich löschen? Lagerbestand und Kassenbuchung werden dabei automatisch zurückgebucht."))return;
 const {error}=await supabaseClient.rpc("vineyard_delete_trade",{p_trade_id:id});
 if(error)throw error;
 await render();
}
async function deleteCash(id){
 if(!confirm("Diese Kassenbuchung wirklich löschen?"))return;
 const {error}=await supabaseClient.from("vineyard_cashbook").delete().eq("id",id);if(error)throw error;await auditLog("Kassenbuchung gelöscht","cashbook",id,{});await render();
}
async function deleteInvoice(id){
 if(!confirm("Diese Rechnung wirklich löschen? Der öffentliche Rechnungslink funktioniert danach nicht mehr."))return;
 const {error}=await supabaseClient.rpc("vineyard_delete_invoice",{p_invoice_id:id});if(error)throw error;await render();
}
async function deleteEmployee(id){
 if(role?.key!=="master")throw Error("Nur der Master darf Mitarbeiter löschen.");
 if(!confirm("Diesen Mitarbeiter und seinen Zugang wirklich dauerhaft löschen?"))return;
 const r=await supabaseClient.functions.invoke("vineyard-admin-users",{body:{action:"delete",user_id:id}});if(r.error)throw r.error;if(r.data?.error)throw Error(r.data.error);await render();
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
 if(error||!invoice)return document.body.innerHTML='<div class="publicInvoice"><div class="publicInvoiceBox"><div class="brandmark"><img src="./assets/donnerfaust-vineyards-logo.jpg" alt="Donnerfaust Barrelworks"></div><h1>Rechnung nicht verfügbar</h1><p>Der Link ist ungültig oder die Rechnung wurde storniert.</p></div></div>';
 const items=Array.isArray(data.items)?data.items:[];
 const total=items.reduce((s,x)=>s+Number(x.line_total||0),0);
 document.body.innerHTML='<main class="publicInvoice"><div class="publicInvoiceBox"><div class="publicHead"><div><div class="eyebrow">DONNERFAUST BARRELWORKS</div><h1>Rechnung</h1><p>Schreibgeschützter Handelsnachweis</p></div><div class="publicNumber">'+esc(invoice.invoice_number)+'</div></div><div class="publicMeta"><div><small>VORGANG</small><b>'+esc(invoice.invoice_type)+'</b></div><div><small>HANDELSPARTNER</small><b>'+esc(invoice.partner_name)+'</b></div><div><small>DATUM</small><b>'+esc(new Date(invoice.created_at).toLocaleString("de-DE"))+'</b></div><div><small>STATUS</small><b>'+esc(invoice.status)+'</b></div><div><small>MITARBEITER</small><b>'+esc(invoice.employee_name||"—")+'</b></div></div><div class="publicTable"><table><thead><tr><th>Artikel</th><th>Menge</th><th>Einzelpreis</th><th>Gesamt</th></tr></thead><tbody>'+items.map(x=>'<tr><td>'+esc(x.item_name)+'</td><td>'+Number(x.quantity).toLocaleString("de-DE")+' '+esc(x.unit)+'</td><td>'+money(x.unit_price)+'</td><td>'+money(x.line_total)+'</td></tr>').join("")+'</tbody></table></div><div class="publicTotal"><span>Gesamtsumme</span><b>'+money(total)+'</b></div><p class="publicReadonly">Diese Ansicht ist schreibgeschützt. Es besteht kein Zugriff auf die interne Vineyard-Verwaltung.</p></div></main>';
}
async function stockModal(id){
 const {data:item}=await supabaseClient.from("vineyard_inventory").select("*").eq("id",id).single();
 if(!item)throw Error("Lagerartikel nicht gefunden.");
 modal("Bestandsbewegung · "+item.item_name,selectField("Bewegung","mode",[{value:"in",label:"Zugang (+)"},{value:"out",label:"Abgang (-)"}])+field("Menge","amount","number","",true)+field("Grund","reason","text","",true),
 async v=>{const amount=Math.abs(Number(v.amount)||0);if(!amount)throw Error("Menge muss größer als 0 sein.");const delta=v.mode==="in"?amount:-amount;const {error}=await supabaseClient.rpc("vineyard_adjust_inventory",{p_inventory_id:id,p_delta:delta,p_reason:v.reason.trim()});if(error)throw error})
}
async function tradeModal(id){
 const [{data:items=[],error:ie},{data:existing,error:te}]=await Promise.all([
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category,purchase_price,sale_price,quantity").order("category").order("item_name"),
  id?supabaseClient.from("vineyard_trades").select("*").eq("id",id).single():Promise.resolve({data:null,error:null})
 ]);
 if(ie)throw ie;
 if(te)throw te;
 if(id&&!existing)throw Error("Handelsvorgang nicht gefunden.");
 const type=existing?.trade_type||"Einkauf";
 const initialItems=items.filter(x=>x.category===(type==="Einkauf"?"Zutaten":"Produkte"));
 if(!initialItems.length)throw Error(type==="Einkauf"?"Lege zuerst mindestens eine Zutat mit Einkaufspreis im Lager an.":"Lege zuerst mindestens ein Produkt mit Verkaufspreis im Lager an.");
 const optionsFor=t=>items.filter(x=>x.category===(t==="Einkauf"?"Zutaten":"Produkte"));
 const optionHtml=(t,selected)=>{
  const list=optionsFor(t);
  return list.map(x=>'<option value="'+esc(x.id)+'" '+(String(selected)===String(x.id)?"selected":"")+'>'+esc(x.item_name)+' · '+esc(x.unit)+'</option>').join("");
 };
 const selected=existing?.inventory_id||initialItems[0].id;
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal tradeModal"><div class="modalhead"><b>'+(id?"Ein-/Verkauf bearbeiten":"Ein- und Verkauf")+'</b><button id="x">×</button></div><form id="tradeform">'+
 selectField("Ein- oder Verkauf","trade_type",[{value:"Einkauf",label:"Einkauf"},{value:"Verkauf",label:"Verkauf"}],type)+
 '<label>Was wurde ein/verkauft?<select id="trade_inventory" name="inventory_id">'+optionHtml(type,selected)+'</select></label>'+
 field("Menge","quantity","number",existing?.quantity??1,true)+
 '<div class="tradeprice"><div><span>PREIS</span><b id="tradeTotal">'+money(existing?.total||0)+'</b><small id="tradeUnitPrice"></small></div><div class="tradeformula" id="tradeFormula"></div></div>'+
 '<div class="actions"><button type="button" class="btn outline" id="cancel">Abbrechen</button><button class="btn primary">Buchen</button></div></form></div></div>';
 const close=()=>$("#modalroot").innerHTML="";
 $("#x").onclick=$("#cancel").onclick=close;
 const typeEl=$("#tradeform [name=trade_type]"),itemEl=$("#trade_inventory"),qtyEl=$("#tradeform [name=quantity]"),totalEl=$("#tradeTotal"),unitEl=$("#tradeUnitPrice"),formulaEl=$("#tradeFormula"),submitBtn=$("#tradeform button[type=submit]");
 const refreshItems=(t,selectedId)=>{
  const list=optionsFor(t);
  itemEl.innerHTML=optionHtml(t,selectedId&&list.some(x=>String(x.id)===String(selectedId))?selectedId:(list[0]?.id||""));
  updatePrice();
 };
 const updatePrice=()=>{
  const item=items.find(x=>String(x.id)===String(itemEl.value));
  const qty=Number(qtyEl.value)||0;
  if(!item){totalEl.textContent=money(0);unitEl.textContent="";formulaEl.textContent="";return}
  const unitPrice=typeEl.value==="Einkauf"?Number(item.purchase_price||0):Number(item.sale_price||0);
  const total=Math.round(unitPrice*qty*100)/100;
  totalEl.textContent=money(total);
  unitEl.textContent="Einzelpreis: "+money(unitPrice)+" · "+(typeEl.value==="Einkauf"?"Zugang zum Lager":"Abgang aus dem Lager");
  formulaEl.textContent=qty.toLocaleString("de-DE")+" × "+money(unitPrice)+" = "+money(total);
 };
 typeEl.onchange=()=>refreshItems(typeEl.value,null);
 itemEl.onchange=updatePrice;
 qtyEl.oninput=updatePrice;
 updatePrice();
 $("#tradeform").onsubmit=async e=>{
  e.preventDefault();
  const b=e.submitter;
  b.disabled=true;
  try{
   const quantity=Number(qtyEl.value);
   if(!Number.isFinite(quantity)||quantity<=0)throw Error("Die Menge muss größer als 0 sein.");
   const rpc=id?"vineyard_update_trade":"vineyard_create_trade";
   const args=id?{p_trade_id:id,p_trade_type:typeEl.value,p_inventory_id:itemEl.value,p_quantity:quantity}:{p_trade_type:typeEl.value,p_inventory_id:itemEl.value,p_quantity:quantity};
   const {error}=await supabaseClient.rpc(rpc,args);
   if(error)throw error;
   close();
   await render();
  }catch(err){alert(err.message||String(err));b.disabled=false}
 };
}
async function cashModal(id){
 let existing=null;
 if(id){const {data,error}=await supabaseClient.from("vineyard_cashbook").select("*").eq("id",id).single();if(error)throw error;existing=data}
 modal(id?"Kassenbuchung bearbeiten":"Kassenbuchung",selectField("Art","kind",[{value:"in",label:"Einnahme (+)"},{value:"out",label:"Ausgabe (-)"}],existing?.kind||"in")+selectField("Kategorie","category",["Weinverkauf","Trauben","Material","Lohn","Betriebskosten","Sonstiges"],existing?.category||"Sonstiges")+field("Betrag ($)","amount","number",existing?.amount??"",true)+field("Beschreibung","description","text",existing?.description||"",true),
 async v=>{const amount=Number(v.amount)||0;if(amount<=0)throw Error("Betrag muss größer als 0 sein.");let r;if(id)r=await supabaseClient.from("vineyard_cashbook").update({kind:v.kind,category:v.category,amount,description:v.description.trim()}).eq("id",id);else r=await supabaseClient.from("vineyard_cashbook").insert({kind:v.kind,category:v.category,amount,description:v.description.trim(),created_by:(await supabaseClient.auth.getUser()).data.user.id});if(r.error)throw r.error;await auditLog(id?"Kassenbuchung geändert":"Kassenbuchung","cashbook",id||null,{kind:v.kind,amount,category:v.category,description:v.description.trim()})})
}
async function employeeModal(id){
 const [{data:e},{data:roles}]=await Promise.all([supabaseClient.from("vineyard_profiles").select("*").eq("user_id",id||"00000000-0000-0000-0000-000000000000").maybeSingle(),supabaseClient.from("vineyard_roles").select("key,label,rank_order").order("rank_order",{ascending:true})]);
 if(id){
  modal("Mitarbeiter verwalten",field("Name","display_name","text",e?.display_name||"",true)+selectField("Rolle","role_key",roles.map(r=>({value:r.key,label:r.label})),e?.role_key||"mitarbeiter")+field("Telefon","phone","text",e?.phone||"")+selectField("Status","active",[{value:"true",label:"Aktiv"},{value:"false",label:"Deaktiviert"}],String(e?.active!==false)),
  async v=>{const r=await supabaseClient.functions.invoke("vineyard-admin-users",{body:{action:"update",user_id:id,display_name:v.display_name,role_key:v.role_key,phone:v.phone,active:v.active==="true"}});if(r.error)throw r.error;await auditLog("Mitarbeiter geändert","employee",id,{role_key:v.role_key,active:v.active==="true"})})
 }else{
  modal("Neuen Mitarbeiter anlegen",field("Name","display_name","text","",true)+field("E-Mail","email","email","",true)+field("Startpasswort","password","password","",true)+selectField("Rolle","role_key",roles.map(r=>({value:r.key,label:r.label})),"mitarbeiter")+field("Telefon","phone"),
  async v=>{if(v.password.length<8)throw Error("Das Startpasswort muss mindestens 8 Zeichen haben.");const r=await supabaseClient.functions.invoke("vineyard-admin-users",{body:{action:"create",display_name:v.display_name,email:v.email,password:v.password,role_key:v.role_key,phone:v.phone}});if(r.error)throw r.error;if(r.data?.error)throw Error(r.data.error);await auditLog("Mitarbeiter angelegt","employee",r.data.user_id,{email:v.email,role_key:v.role_key})})
 }
}
async function auditLog(action,entity,entityId,details){
 const user=(await supabaseClient.auth.getUser()).data.user;
 const d={...(details||{})};
 if(!d.actor_name)d.actor_name=profile?.display_name||"";
 await supabaseClient.from("vineyard_audit_log").insert({actor_id:user.id,action,entity,entity_id:entityId?String(entityId):null,details:d});
}
function showBootError(err){
 console.error("Donnerfaust Barrelworks Startfehler:",err);
 document.body.innerHTML='<div class="login"><div class="loginbox"><div class="loginbrand"><div class="brandmark"><img src="./assets/donnerfaust-vineyards-logo.jpg" alt="Donnerfaust Barrelworks"></div><h1>Donnerfaust Barrelworks</h1><p>Die Anwendung konnte nicht gestartet werden.</p></div><div class="error">Technischer Fehler beim Start.<br><small>'+esc(err?.message||String(err))+'</small></div><button class="btn primary" onclick="location.reload()">Erneut versuchen</button></div></div>';
}
init().catch(showBootError);
