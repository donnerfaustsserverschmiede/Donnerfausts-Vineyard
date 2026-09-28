const SUPABASE_URL="https://qsyijgvikxmwmhaiulne.supabase.co";
const SUPABASE_KEY="sb_publishable_5qeUg0c0T0IyLh8g0cUj6Q_ZJYgZYJ_";
const supabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const money=n=>new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n)||0);
const dateTime=()=>new Date().toLocaleString("de-DE");
let profile=null, role=null, page="dashboard";
let presenceChannel=null, onlineCount=0;

const NAV=[
["dashboard","⌂","Übersicht","dashboard"],
["invoices","▤","Rechnungen","dashboard"],
["orders","🛒","Bestellungen","dashboard"],
["inventory","▦","Lager","inventory_view"],
["cash","€","Kasse","cash_view"],
["employees","♟","Mitarbeiter","employees_view"],
["audit","◷","Protokoll","audit_view"]
];

function can(p){return !!role?.permissions?.[p]}
function badge(s){return '<span class="badge '+(s==="Bezahlt"||s==="OK"?"good":s==="Niedrig"||s==="Offen"?"warn":"bad")+'">'+esc(s)+"</span>"}

async function init(){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)return login();
 await loadProfile();
 if(!profile){await supabase.auth.signOut();return login("Dein Konto ist für Donnerfaust Vineyards noch nicht freigeschaltet.");}
 render();
 startPresence();
 supabase.auth.onAuthStateChange(async (_e,s)=>{if(!s){if(presenceChannel)await supabase.removeChannel(presenceChannel);presenceChannel=null;login()}});
}
async function loadProfile(){
 const {data,error}=await supabase.from("vineyard_profiles").select("user_id,display_name,role_key,active,phone,vineyard_roles:role_key(key,label,permissions)").eq("user_id",(await supabase.auth.getUser()).data.user.id).maybeSingle();
 if(error||!data||!data.active){profile=null;return}
 profile=data;role=data.vineyard_roles;
}
function login(message=""){
 document.body.innerHTML='<div class="login"><div class="loginbox"><div class="loginbrand"><div class="brandmark">🍇</div><h1>Donnerfaust Vineyards</h1><p>Interne Betriebsverwaltung</p></div>'+(message?'<div class="error">'+esc(message)+"</div>":"")+
 '<form id="loginform"><label>E-Mail<input id="email" type="email" autocomplete="username" value="ragnaroekduo2018@gmail.com" required></label><label>Passwort<input id="password" type="password" autocomplete="current-password" required></label><button class="btn primary">Anmelden</button></form></div></div>';
 $("#loginform").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;const {error}=await supabase.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});if(error){b.disabled=false;login(error.message)}else{await loadProfile();if(!profile){await supabase.auth.signOut();login("Dieser Benutzer hat noch kein Vineyards-Profil.");}else render()}};
}
function shell(content){
 const nav=NAV.filter(n=>can(n[3])).map(n=>'<button class="nav '+(page===n[0]?"active":"")+'" data-page="'+n[0]+'"><i>'+n[1]+"</i>"+n[2]+"</button>").join("");
 document.body.innerHTML='<aside class="sidebar" id="sidebar"><div class="brand"><div class="brandmark">🍇</div><div><b>Donnerfaust Vineyards</b><small>Interne Verwaltung</small></div></div><nav>"+nav+'</nav><div class="sidefoot"><span class="online"></span>'+esc(profile.display_name)+' · '+esc(role.label)+'<br><button id="logout" class="mini" style="margin-top:9px">Abmelden</button></div></aside><main class="main"><header class="top"><div><button class="hamb" id="hamb">☰</button><span class="crumb">DONNERFAUST VINEYARDS</span><h2>'+esc(pageTitle())+'</h2></div><div class="topright"><span class="online"></span><b>'+esc(profile.display_name)+'</b><span class="avatar">'+esc(initials(profile.display_name))+"</span></div></header><section class="content">"+content+'</section></main><div id="modalroot"></div>';
 $$(".nav").forEach(b=>b.onclick=()=>{page=b.dataset.page;render()});$("#hamb").onclick=()=>$("#sidebar").classList.toggle("open");$("#logout").onclick=()=>supabase.auth.signOut();
}
function pageTitle(){return ({dashboard:"Übersicht",invoices:"Rechnungen",orders:"Bestellungen",inventory:"Lagerübersicht",cash:"Kasse",employees:"Mitarbeiter",audit:"Protokoll"})[page]||"Übersicht"}
function initials(n){return String(n||"DF").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()}
function stat(icon,label,value){return '<div class="stat"><span class="icon">'+icon+'</span><div><small>'+label+"</small><b>"+value+"</b></div></div>"}
function intro(k,h,p,action,label){return '<div class="intro"><div><div class="eyebrow">'+k+"</div><h1>"+h+"</h1><p>"+p+"</p></div>"+(action?'<button class="btn gold" data-action="'+action+'">'+label+"</button>":"")+"</div>"}

async function dashboard(){
 const openInvoices=0, openOrders=0;
 return '<div class="welcome"><div><div class="eyebrow">DONNERFAUST VINEYARDS</div><h1>Willkommen, '+esc(profile.display_name)+'</h1><p>Deine aktuelle Übersicht für den Weinbetrieb.</p></div><div class="welcomegrape">🍇</div></div>'+
 '<div class="overviewgrid">'+
 '<button class="overviewcard" data-page-action="invoices"><div class="overviewicon invoice">▤</div><div class="overviewtext"><small>OFFENE RECHNUNGEN</small><b>'+openInvoices+'</b><span>Rechnungsmenü öffnen</span></div><span class="arrow">→</span></button>'+
 '<button class="overviewcard" data-page-action="orders"><div class="overviewicon order">🛒</div><div class="overviewtext"><small>OFFENE BESTELLUNGEN</small><b>'+openOrders+'</b><span>Bestellungsmenü öffnen</span></div><span class="arrow">→</span></button>'+
 '<div class="overviewcard static"><div class="overviewicon staff">♟</div><div class="overviewtext"><small>MITARBEITER ONLINE</small><b id="onlineCount">'+(onlineCount||1)+'</b><span>Aktuell im System angemeldet</span></div><span class="live"><i></i> LIVE</span></div>'
 </div>'+
 '<div class="quickgrid"><button class="quickcard" data-page-action="inventory"><span>📦</span><div><b>Lager</b><small>Bestände verwalten</small></div><span class="arrow">→</span></button>'+
 '<button class="quickcard" data-page-action="cash"><span>€</span><div><b>Kasse</b><small>Kassenbuch öffnen</small></div><span class="arrow">→</span></button>'+
 '<button class="quickcard" data-page-action="employees"><span>♟</span><div><b>Mitarbeiter</b><small>Team verwalten</small></div><span class="arrow">→</span></button></div>';
}
async function invoices(){return '<div class="placeholder"><div class="placeholdericon">▤</div><div class="eyebrow">RECHNUNGEN</div><h1>Rechnungsmenü</h1><p>Hier werden offene Rechnungen und Zahlungen verwaltet.</p><div class="placeholderstate">Noch keine Rechnungen hinterlegt.</div></div>';}
async function orders(){return '<div class="placeholder"><div class="placeholdericon">🛒</div><div class="eyebrow">BESTELLUNGEN</div><h1>Bestellungsmenü</h1><p>Hier werden offene Bestellungen und Lieferungen verwaltet.</p><div class="placeholderstate">Noch keine Bestellungen hinterlegt.</div></div>';}
function startPresence(){
 if(presenceChannel)return;
 const channel=supabase.channel("vineyard-online",{config:{presence:{key:profile.user_id}}});
 const update=()=>{const state=channel.presenceState();onlineCount=Object.keys(state).length;const el=$("#onlineCount");if(el)el.textContent=onlineCount;};
 channel.on("presence",{event:"sync"},update).on("presence",{event:"join"},update).on("presence",{event:"leave"},update);
 channel.subscribe(async status=>{if(status==="SUBSCRIBED"){await channel.track({user_id:profile.user_id,name:profile.display_name,online_at:new Date().toISOString()});update();}});
 presenceChannel=channel;
}
async function inventory(){
 const {data:items=[],error}=await supabase.from("vineyard_inventory").select("*").order("category").order("item_name");
 if(error)return errorBox(error.message);
 return intro("LAGER","Lagerübersicht","Bestände, Mindestbestände und Bewegungen zentral verwalten.",can("inventory_edit")?"newitem":null,can("inventory_edit")?"+ Artikel":null)+
 '<div class="panel"><input class="fullinput" id="q" placeholder="Lagerartikel suchen …"></div><div class="itemgrid" id="items">'+itemCards(items)+"</div>";
}
function itemCards(items){return items.map(x=>'<div class="itemcard"><div class="eyebrow">'+esc(x.category)+" · "+esc(x.unit)+'</div><h3>'+esc(x.item_name)+'</h3><div class="qty '+(Number(x.quantity)<=Number(x.min_stock)?"low":"")+'">'+Number(x.quantity).toLocaleString("de-DE")+" "+esc(x.unit)+"</div><small class="muted">Mindestbestand: "+Number(x.min_stock).toLocaleString("de-DE")+" · Verkauf: "+money(x.sale_price)+"</small><div style="margin-top:12px">'+(can("inventory_edit")?'<button class="mini gold" data-stock="'+x.id+'">Bestand ändern</button> <button class="mini" data-edit-item="'+x.id+'">Bearbeiten</button>':"")+"</div></div>").join("")||'<p class="muted">Noch keine Lagerartikel.</p>'}
async function cash(){
 const {data:rows=[],error}=await supabase.from("vineyard_cashbook").select("*").order("created_at",{ascending:false});
 if(error)return errorBox(error.message);
 const balance=rows.reduce((s,x)=>s+(x.kind==="in"?1:-1)*Number(x.amount||0),0);
 return intro("KASSE","Kassenbuch","Ein- und Auszahlungen mit Benutzerprotokoll.",can("cash_edit")?"newcash":null,can("cash_edit")?"+ Buchung":null)+
 '<div class="stats">'+stat("€","AKTUELLER KASSENSTAND",money(balance))+stat("↗","EINNAHMEN",money(rows.filter(x=>x.kind==="in").reduce((s,x)=>s+Number(x.amount),0)))+stat("↘","AUSGABEN",money(rows.filter(x=>x.kind==="out").reduce((s,x)=>s+Number(x.amount),0)))+stat("▤","BUCHUNGEN",rows.length)+"</div>"+
 '<div class="panel"><div class="tablewrap"><table><thead><tr><th>DATUM</th><th>ART</th><th>BETRAG</th><th>KATEGORIE</th><th>BESCHREIBUNG</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</td><td>'+(x.kind==="in"?'<span class="badge good">Einnahme</span>':'<span class="badge bad">Ausgabe</span>')+'</td><td><b>'+money(x.amount)+"</b></td><td>"+esc(x.category)+"</td><td>"+esc(x.description)+"</td></tr>").join("")||'<tr><td colspan="5">Keine Buchungen.</td></tr>'+"</tbody></table></div></div>";
}
async function employees(){
 const [{data:emps=[]},{data:roles=[]}]=await Promise.all([
  supabase.from("vineyard_profiles").select("user_id,display_name,role_key,active,phone,vineyard_roles:role_key(label)").order("display_name"),
  supabase.from("vineyard_roles").select("key,label,permissions").order("key")
 ]);
 return intro("TEAM","Mitarbeiter","Konten, Rollen und Rechte werden ausschließlich über den Master verwaltet.",can("employees_edit")?"newemployee":null,can("employees_edit")?"+ Mitarbeiter":null)+
 '<div class="employeegrid">'+emps.map(x=>'<div class="employee"><div class="avatar">'+esc(initials(x.display_name))+'</div><div style="flex:1"><b>'+esc(x.display_name)+"</b><small>"+esc(x.vineyard_roles?.label||x.role_key)+" · "+(x.active?'<span class="good">Aktiv</span>':'<span class="bad">Deaktiviert</span>')+"</small>"+(x.phone?'<small>'+esc(x.phone)+"</small>":"")+'</div>'+(can("employees_edit")?'<button class="mini" data-edit-employee="'+x.user_id+'">Verwalten</button>':"")+"</div>").join("")+"</div>";
}
async function audit(){
 const {data:rows=[],error}=await supabase.from("vineyard_audit_log").select("*,vineyard_profiles:actor_id(display_name)").order("created_at",{ascending:false}).limit(100);
 if(error)return errorBox(error.message);
 return intro("SICHERHEIT","Änderungsprotokoll","Nachvollziehbare Protokollierung wichtiger Verwaltungsvorgänge.")+
 '<div class="panel">'+rows.map(x=>'<div class="row"><span>◷</span><div class="rowgrow"><b>'+esc(x.action)+"</b><small>"+esc(x.vineyard_profiles?.display_name||"SYSTEM")+" · "+esc(x.entity)+" · "+esc(new Date(x.created_at).toLocaleString("de-DE"))+"</small></div></div>").join("")||'<p class="muted">Noch keine Einträge.</p>'+"</div>";
}
function errorBox(t){return '<div class="panel"><b>Fehler</b><p class="muted">'+esc(t)+"</p></div>"}

async function render(){let content=page==="dashboard"?await dashboard():page==="invoices"?await invoices():page==="orders"?await orders():page==="inventory"?await inventory():page==="cash"?await cash():page==="employees"?await employees():await audit();shell(content);bind()}
function bind(){
 $("[data-action]").forEach(b=>b.onclick=()=>action(b.dataset.action));
 $("[data-page-action]").forEach(b=>b.onclick=()=>{page=b.dataset.pageAction;render()});
 $("#q")?.addEventListener("input",async e=>{const {data=[]}=await supabase.from("vineyard_inventory").select("*").order("item_name");$("#items").innerHTML=itemCards(data.filter(x=>x.item_name.toLowerCase().includes(e.target.value.toLowerCase())))});
 $$("[data-stock]").forEach(b=>b.onclick=()=>stockModal(b.dataset.stock));
 $$("[data-edit-item]").forEach(b=>b.onclick=()=>itemModal(b.dataset.editItem));
 $$("[data-edit-employee]").forEach(b=>b.onclick=()=>employeeModal(b.dataset.editEmployee));
}
function action(a){if(a==="openinventory"){page="inventory";render()}if(a==="newitem")itemModal();if(a==="newcash")cashModal();if(a==="newemployee")employeeModal()}

function modal(title,body,onSubmit){
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal"><div class="modalhead"><b>'+title+'</b><button id="x">×</button></div><form id="mf">'+body+'<div class="actions"><button type="button" class="btn outline" id="cancel">Abbrechen</button><button class="btn primary">Speichern</button></div></form></div></div>';
 $("#x").onclick=$("#cancel").onclick=()=>$("#modalroot").innerHTML="";
 $("#mf").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await onSubmit(Object.fromEntries(new FormData(e.target)));$("#modalroot").innerHTML="";await render()}catch(err){alert(err.message||err)}finally{b.disabled=false}};
}
function field(label,name,type="text",value="",required=false){return '<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(required?"required":"")+"></label>"}
function selectField(label,name,opts,value=""){return '<label>'+label+'<select name="'+name+'">'+opts.map(o=>'<option value="'+esc(o.value??o)+'" '+(String(value)===String(o.value??o)?"selected":"")+'>'+esc(o.label??o)+"</option>").join("")+"</select></label>"}

async function itemModal(id){
 let item=null;if(id){const {data}=await supabase.from("vineyard_inventory").select("*").eq("id",id).single();item=data}
 modal(id?"Lagerartikel bearbeiten":"Neuer Lagerartikel",
 field("Artikelname","item_name","text",item?.item_name||"",true)+selectField("Kategorie","category",["Rohstoff","Wein","Material","Verpackung","Sonstiges"],item?.category||"Sonstiges")+field("Einheit","unit","text",item?.unit||"Stück",true)+field("Bestand","quantity","number",item?.quantity??0)+field("Mindestbestand","min_stock","number",item?.min_stock??0)+field("Einkaufspreis","purchase_price","number",item?.purchase_price??0)+field("Verkaufspreis","sale_price","number",item?.sale_price??0),
 async v=>{const patch={item_name:v.item_name.trim(),category:v.category,unit:v.unit.trim(),quantity:Number(v.quantity)||0,min_stock:Number(v.min_stock)||0,purchase_price:Number(v.purchase_price)||0,sale_price:Number(v.sale_price)||0,updated_at:new Date().toISOString(),updated_by:(await supabase.auth.getUser()).data.user.id};const r=id?await supabase.from("vineyard_inventory").update(patch).eq("id",id):await supabase.from("vineyard_inventory").insert(patch);if(r.error)throw r.error;await auditLog(id?"Lagerartikel geändert":"Lagerartikel angelegt","inventory",id||v.item_name,patch)})
}
async function stockModal(id){
 const {data:item}=await supabase.from("vineyard_inventory").select("*").eq("id",id).single();
 modal("Bestandsbewegung · "+item.item_name,selectField("Bewegung","mode",[{value:"in",label:"Zugang (+)"},{value:"out",label:"Abgang (-)"}])+field("Menge","amount","number","",true)+field("Grund","reason","text","",true),
 async v=>{const amount=Math.abs(Number(v.amount)||0);if(!amount)throw Error("Menge muss größer als 0 sein.");const delta=v.mode==="in"?amount:-amount;if(Number(item.quantity)+delta<0)throw Error("Bestand kann nicht negativ werden.");const r1=await supabase.from("vineyard_inventory").update({quantity:Number(item.quantity)+delta,updated_at:new Date().toISOString(),updated_by:(await supabase.auth.getUser()).data.user.id}).eq("id",id);if(r1.error)throw r1.error;const r2=await supabase.from("vineyard_inventory_movements").insert({inventory_id:id,delta,reason:v.reason.trim(),created_by:(await supabase.auth.getUser()).data.user.id});if(r2.error)throw r2.error;await auditLog("Lagerbestand geändert","inventory",id,{delta,reason:v.reason.trim()})})
}
async function cashModal(){
 modal("Kassenbuchung",selectField("Art","kind",[{value:"in",label:"Einnahme (+)"},{value:"out",label:"Ausgabe (-)"}])+selectField("Kategorie","category",["Weinverkauf","Trauben","Material","Lohn","Betriebskosten","Sonstiges"])+field("Betrag (€)","amount","number","",true)+field("Beschreibung","description","text","",true),
 async v=>{const amount=Number(v.amount)||0;if(amount<=0)throw Error("Betrag muss größer als 0 sein.");const r=await supabase.from("vineyard_cashbook").insert({kind:v.kind,category:v.category,amount,description:v.description.trim(),created_by:(await supabase.auth.getUser()).data.user.id});if(r.error)throw r.error;await auditLog("Kassenbuchung","cashbook",null,{kind:v.kind,amount,category:v.category,description:v.description.trim()})})
}
async function employeeModal(id){
 const [{data:e},{data:roles}]=await Promise.all([supabase.from("vineyard_profiles").select("*").eq("user_id",id||"00000000-0000-0000-0000-000000000000").maybeSingle(),supabase.from("vineyard_roles").select("key,label").order("key")]);
 if(id){
  modal("Mitarbeiter verwalten",field("Name","display_name","text",e?.display_name||"",true)+selectField("Rolle","role_key",roles.map(r=>({value:r.key,label:r.label})),e?.role_key||"mitarbeiter")+field("Telefon","phone","text",e?.phone||"")+selectField("Status","active",[{value:"true",label:"Aktiv"},{value:"false",label:"Deaktiviert"}],String(e?.active!==false)),
  async v=>{const r=await supabase.functions.invoke("vineyard-admin-users",{body:{action:"update",user_id:id,display_name:v.display_name,role_key:v.role_key,phone:v.phone,active:v.active==="true"}});if(r.error)throw r.error;await auditLog("Mitarbeiter geändert","employee",id,{role_key:v.role_key,active:v.active==="true"})})
 }else{
  modal("Neuen Mitarbeiter anlegen",field("Name","display_name","text","",true)+field("E-Mail","email","email","",true)+field("Startpasswort","password","password","",true)+selectField("Rolle","role_key",roles.map(r=>({value:r.key,label:r.label})),"mitarbeiter")+field("Telefon","phone"),
  async v=>{if(v.password.length<8)throw Error("Das Startpasswort muss mindestens 8 Zeichen haben.");const r=await supabase.functions.invoke("vineyard-admin-users",{body:{action:"create",display_name:v.display_name,email:v.email,password:v.password,role_key:v.role_key,phone:v.phone}});if(r.error)throw r.error;if(r.data?.error)throw Error(r.data.error);await auditLog("Mitarbeiter angelegt","employee",r.data.user_id,{email:v.email,role_key:v.role_key})})
 }
}
async function auditLog(action,entity,entityId,details){const user=(await supabase.auth.getUser()).data.user;await supabase.from("vineyard_audit_log").insert({actor_id:user.id,action,entity,entity_id:entityId?String(entityId):null,details:details||{}})}
init();