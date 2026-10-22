const SUPABASE_URL="https://qsyijgvikxmwmhaiulne.supabase.co";
const SUPABASE_KEY="sb_publishable_5qeUg0c0T0IyLh8g0cUj6Q_ZJYgZYJ_";
if(!window.supabase||typeof window.supabase.createClient!=="function"){
 document.body.innerHTML='<div class="loading"><b>Donnerfaust Saloon konnte nicht geladen werden.</b><br><small>Die Supabase-Bibliothek ist nicht verfügbar. Bitte Seite neu laden.</small></div>';
 throw new Error("Supabase-Bibliothek konnte nicht geladen werden.");
}
let currentEmployeeId=sessionStorage.getItem("vineyard_employee_id")||"";
const employeeFetch=(input,init={})=>{
 const headers=new Headers(input instanceof Request?input.headers:undefined);
 new Headers(init.headers||{}).forEach((v,k)=>headers.set(k,v));
 const employeeSession=sessionStorage.getItem("vineyard_employee_session")||"";
 if(employeeSession)headers.set("x-employee-session",employeeSession);else headers.delete("x-employee-session");
 headers.delete("x-employee-id");
 return fetch(input,{...init,headers});
};
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{global:{fetch:employeeFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
const dateTime=()=>new Date().toLocaleString("de-DE");
let profile=null, role=null, page="dashboard";
let presenceChannel=null, onlineCount=0, onlineNames=[], orderRealtimeChannel=null, inventoryRealtimeChannel=null;

function startInventoryRealtime(){
 try{
  if(inventoryRealtimeChannel||!supabaseClient?.channel)return;
  const channel=supabaseClient.channel("donnerfaust-vineyards-inventory-live");
  channel.on("postgres_changes",{event:"*",schema:"public",table:"vineyard_inventory"},()=>{
   if(["inventory","dashboard","cash","commission","trades","purchase","sales"].includes(page))void render();
  });
  channel.on("postgres_changes",{event:"*",schema:"public",table:"vineyard_cashbook"},()=>{
   if(["dashboard","cash","commission"].includes(page))void render();
  });
  channel.subscribe();
  inventoryRealtimeChannel=channel;
 }catch(err){console.warn("Lager-Liveaktualisierung konnte nicht gestartet werden:",err)}
}
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
        onlineNames=[];
        Object.keys(state).forEach(k=>{
          (state[k]||[]).forEach(entry=>{
            const id=String(entry?.user_id||k);
            const name=String(entry?.display_name||"").trim();
            if(id && name && !onlineNames.includes(name))onlineNames.push(name);
          });
        });
        if(profile?.display_name && !onlineNames.includes(String(profile.display_name)))onlineNames.unshift(String(profile.display_name));
        onlineNames.sort((a,b)=>a.localeCompare(b,"de"));
        onlineCount=onlineNames.length||1;
        const el=document.querySelector("#onlineCount");
        if(el)el.textContent=String(onlineCount);
        const namesEl=document.querySelector("#onlineNames");
        if(namesEl)namesEl.textContent=onlineNames.join(" · ")||String(profile?.display_name||"");
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
["orders","🛒","BESTELLUNGEN","orders_manage"],
["customers","♙","Kunden","orders_manage"],

["inventory","▦","Lager","inventory_view"],
["purchase","↘","Einkauf","trade_edit"],
["sales","↗","Verkauf","trade_edit"],
["invoices","▤","Rechnungen","invoice_view"],
["cash","$","Kasse","cash_view"],
["employees","♟","Mitarbeiter","employees_view"],
["appointments","◷","Termine","dashboard"],
["commission","%","Provision","invoice_view"],
["admin","⚙","Administration","admin_access"]
];

function normalizedRole(value){return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"")}
function isFamilyHead(){
 const values=[role?.key,role?.label,profile?.role_key].map(normalizedRole);
 return values.some(value=>["master","familienoberhaupt","familyhead","familyowner","inhaber","inhaberin"].includes(value));
}
function can(p){return isFamilyHead()||!!role?.permissions?.[p]}
function canManageCatalog(){
 const allowed=new Set(["familienoberhaupt","familienvogt","familienrat","geschaeftsfuehrer","geschaftsfuehrer","master"]);
 return isFamilyHead()||[role?.key,role?.label,profile?.role_key].some(value=>allowed.has(normalizedRole(value)));
}
function canManageRecipes(){
 const allowed=new Set(["familienoberhaupt","familienvogt","master"]);
 return isFamilyHead()||[role?.key,role?.label,profile?.role_key].some(value=>allowed.has(normalizedRole(value)));
}
function badge(s){const good=["Bezahlt","OK","Bestellung abgeschlossen"].includes(s);const warn=["Niedrig","Offen","Eingegangen","In Bearbeitung"].includes(s);return '<span class="badge '+(good?"good":warn?"warn":"bad")+'">'+esc(s)+"</span>"}


async function init(){
 if(!window.supabase||typeof window.supabase.createClient!=="function")throw Error("Die Supabase-Bibliothek konnte nicht geladen werden.");
 const publicToken=new URLSearchParams(location.search).get("rechnung");
 if(publicToken)return publicInvoice(publicToken);
 await selectEmployee(false);
}
async function selectEmployee(forcePicker=true){
 const {data:employees,error}=await supabaseClient.from("vineyard_profiles").select("user_id,display_name,role_key,active,phone,vineyard_roles:role_key(key,label,permissions,rank_order)").eq("active",true).order("display_name");
 if(error)throw error;
 if(!employees?.length)throw Error("Es sind noch keine aktiven Mitarbeiter hinterlegt.");
 const saved=employees.find(x=>x.user_id===currentEmployeeId);
 if(!forcePicker&&saved&&sessionStorage.getItem("vineyard_employee_session")){
  const {data:verified,error:verifyError}=await supabaseClient.rpc("vineyard_current_employee_id");
  if(!verifyError&&verified===saved.user_id){setCurrentEmployee(saved);await render();startPresence();return;}
  sessionStorage.removeItem("vineyard_employee_session");sessionStorage.removeItem("vineyard_employee_id");currentEmployeeId="";
 }
 document.body.innerHTML=`<div class="login"><div class="loginbox"><div class="loginbrand"><div class="brandmark"><img src="./assets/donnerfaust-saloon-logo.svg" alt="Donnerfaust Saloon"></div><h1>Donnerfaust Saloon</h1><p>Mitarbeiter auswählen</p></div><p class="muted" style="margin:18px 0">Wähle deinen Namen aus. Anschließend wird das persönliche Passwort dieses Mitarbeiters abgefragt.</p><div class="employeegrid">${employees.map(x=>'<button type="button" class="employee" data-choose-employee="'+esc(x.user_id)+'" style="text-align:left;width:100%;cursor:pointer"><div class="avatar">'+esc(initials(x.display_name))+'</div><div style="flex:1"><b>'+esc(x.display_name)+'</b><small>'+esc(x.vineyard_roles?.label||x.role_key)+'</small></div><span>›</span></button>').join("")}</div></div></div>`;
 $$("[data-choose-employee]").forEach(button=>button.addEventListener("click",async()=>{
  const employee=employees.find(x=>x.user_id===button.dataset.chooseEmployee);if(!employee)return;
  button.disabled=true;
  try{
   const {data:hasPassword,error:pe}=await supabaseClient.rpc("vineyard_employee_has_password",{p_employee_id:employee.user_id});
   if(pe)throw pe;if(!hasPassword)throw Error("Für diesen Mitarbeiter wurde noch kein Passwort eingerichtet.");
   document.body.innerHTML=`<div class="login"><div class="loginbox"><div class="loginbrand"><div class="brandmark"><img src="./assets/donnerfaust-saloon-logo.svg" alt="Donnerfaust Saloon"></div><h1>Donnerfaust Saloon</h1><p>${esc(employee.display_name)} · Passwort</p></div><p class="muted" style="margin:18px 0">Bitte gib das persönliche Passwort für diesen Mitarbeiter ein.</p><form id="employeePasswordForm"><label>Passwort<input id="employeePassword" type="password" autocomplete="current-password" minlength="8" required></label><div id="employeePasswordError" class="error" style="display:none"></div><div class="actions"><button type="button" class="btn outline" id="backToEmployees">Zurück</button><button type="submit" class="btn primary">Anmelden</button></div></form></div></div>`;
   const input=$("#employeePassword"),form=$("#employeePasswordForm"),back=$("#backToEmployees");
   back.onclick=()=>selectEmployee(true);input.focus();
   form.onsubmit=async ev=>{
    ev.preventDefault();const submit=ev.submitter;submit.disabled=true;const eb=$("#employeePasswordError");if(eb){eb.style.display="none";eb.textContent=""}
    try{
     const {data:token,error}=await supabaseClient.rpc("vineyard_check_employee_password",{p_employee_id:employee.user_id,p_password:input.value});
     if(error)throw error;if(!token)throw Error("Das Passwort ist falsch.");
     sessionStorage.setItem("vineyard_employee_session",String(token));sessionStorage.setItem("vineyard_employee_id",String(employee.user_id));
     setCurrentEmployee(employee);await render();startPresence();
    }catch(err){if(eb){eb.textContent=err?.message||String(err);eb.style.display="block"}else alert(err?.message||String(err));submit.disabled=false;input.focus();input.select();}
   };
  }catch(err){alert(err?.message||String(err));button.disabled=false}
 }));
}
function setCurrentEmployee(employee){profile=employee;role=employee.vineyard_roles;currentEmployeeId=employee.user_id;sessionStorage.setItem("vineyard_employee_id",currentEmployeeId);}
function shell(content){
 const nav=NAV.filter(n=>can(n[3])||role?.key==="admin").map(n=>`<button type="button" class="nav ${page===n[0]?"active":""}" data-page="${n[0]}"><i>${n[1]}</i>${n[2]}</button>`).join("");
 document.body.innerHTML=`<div class="nav-overlay" id="navOverlay"></div><aside class="sidebar" id="sidebar"><div class="brand"><div class="brandmark"><img src="./assets/donnerfaust-saloon-logo.svg" alt="Donnerfaust Saloon"></div><div><b>Donnerfaust Saloon</b><small>Interne Verwaltung</small></div></div><nav>${nav}</nav><div class="sidefoot"><span class="online"></span>${esc(profile.display_name)} · ${esc(role.label)}<br><button id="switchEmployee" class="mini" style="margin-top:9px">Mitarbeiter wechseln</button></div></aside><main class="main"><header class="top"><div class="topTitle"><button class="hamb" id="hamb" type="button" aria-label="Menü öffnen" aria-expanded="false">☰</button><img class="topbrandlogo" src="./assets/donnerfaust-saloon-logo.svg" alt="Donnerfaust Saloon"><div><span class="crumb">DONNERFAUST SALOON</span><h2>${esc(pageTitle())}</h2></div></div><div class="topright"><span class="online"></span><b>${esc(profile.display_name)}</b><span class="avatar">${esc(initials(profile.display_name))}</span></div></header><section class="content">${content}</section></main><div id="modalroot"></div>`;
 const switchEmployee=$("#switchEmployee");
 if(switchEmployee) switchEmployee.addEventListener("click",async e=>{e.preventDefault();if(presenceChannel){try{await supabaseClient.removeChannel(presenceChannel)}catch(_){}presenceChannel=null;}stopOrderRealtime();const token=sessionStorage.getItem("vineyard_employee_session")||"";if(token){try{await supabaseClient.rpc("vineyard_revoke_employee_session",{p_token:token})}catch(_){}}sessionStorage.removeItem("vineyard_employee_session");sessionStorage.removeItem("vineyard_employee_id");currentEmployeeId="";profile=null;role=null;await selectEmployee(true)});
}
function pageTitle(){return ({dashboard:"Übersicht",customers:"Kunden",invoices:"Rechnungen",orders:"Bestellungen",inventory:"Lagerübersicht",purchase:"Einkauf",sales:"Verkauf",cash:"Kasse",employees:"Mitarbeiter",appointments:"Termine",commission:"Provision",admin:"Administration"})[page]||"Übersicht"}
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
   <div><div class="eyebrow">DONNERFAUST SALOON</div><h1>Willkommen, ${esc(profile.display_name)}</h1><p>Deine aktuelle Übersicht für den Weinbetrieb.</p></div>
   <div class="welcomegrape"><img src="./assets/donnerfaust-saloon-logo.svg" alt="Donnerfaust Saloon"></div>
  </div>
  <div class="overviewgrid">
   <button class="overviewcard" data-page-action="invoices"><div class="overviewicon invoice">▤</div><div class="overviewtext"><small>OFFENE RECHNUNGEN</small><b>${openInvoices}</b><span>Rechnungsmenü öffnen</span></div><span class="arrow">→</span></button>
   <button class="overviewcard" data-page-action="orders"><div class="overviewicon order">🛒</div><div class="overviewtext"><small>OFFENE BESTELLUNGEN</small><b>${openOrders}</b><span>Bestellungsmenü öffnen</span></div><span class="arrow">→</span></button>
   <div class="overviewcard static"><div class="overviewicon staff">♟</div><div class="overviewtext"><small>WER IST GERADE ONLINE?</small><b id="onlineCount">${onlineCount||1}</b><span id="onlineNames">${esc(onlineNames.join(" · ")||profile?.display_name||"")}</span></div><span class="live"><i></i> LIVE</span></div>
  </div>
`;
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
 return intro("HANDELSNACHWEISE","Rechnungen","Verkauf, Einkauf und Lieferungen als nachvollziehbare Handelsnachweise verwalten.",can("invoice_edit")?"newinvoice":null,can("invoice_edit")?"+ Rechnung erstellen":null)+
 '<div class="stats">'+stat("▤","OFFENE RECHNUNGEN",open)+stat("$","HANDELSVORGÄNGE",total)+stat("↗","VERKAUF",rows.filter(x=>x.invoice_type==="Verkauf").length)+stat("%","PROVISIONEN",money(commission))+'</div>'+
 '<div class="panel"><div class="tablewrap"><table><thead><tr><th>NUMMER</th><th>ART</th><th>HANDELSPARTNER</th><th>MITARBEITER</th><th>PROVISION</th><th>DATUM</th><th>STATUS</th><th></th></tr></thead><tbody>'+
 (rows.map(x=>'<tr><td><b>'+esc(x.invoice_number)+'</b></td><td>'+esc(x.invoice_type)+'</td><td>'+esc(x.partner_name)+'</td><td>'+esc(x.employee_name)+'</td><td>'+money(x.commission_amount||0)+' ('+Number(x.commission_rate||0).toLocaleString("de-DE")+'%)</td><td>'+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</td><td>'+badge(x.status)+'</td><td><button class="mini gold" data-share-invoice="'+x.id+'">Teilen</button> <button class="mini" data-edit-invoice="'+x.id+'">Bearbeiten</button> <button class="mini" data-delete-invoice="'+x.id+'">Löschen</button></td></tr>').join("")||'<tr><td colspan="8">Noch keine Rechnungen vorhanden.</td></tr>')+
 '</tbody></table></div></div>';
}
async function orders(){
 const {data:rawRows,error}=await supabaseClient.from("vineyard_orders").select("id,order_number,status,customer_name,customer_email,customer_phone,customer_address,customer_note,employee_id,total,commission_rate,commission_amount,delivery_date,delivery_requested,delivery_fee,created_at,accepted_at,completed_at,customer_id,subtotal_before_discount,customer_discount_percent").order("created_at",{ascending:false});
 if(error)return errorBox(error.message);
 const rows=Array.isArray(rawRows)?rawRows:[];
 const [{data:rawEmployees,error:ee},{data:customerRows,error:ce}]=await Promise.all([supabaseClient.rpc("vineyard_order_employees"),supabaseClient.from("vineyard_customers").select("id,name,discount_percent").eq("active",true).order("name")]);
 if(ee)return errorBox(ee.message);if(ce)return errorBox(ce.message);
 const employees=Array.isArray(rawEmployees)?rawEmployees:[];
 const customersList=Array.isArray(customerRows)?customerRows:[];
 const customerOptions=[{value:"",label:"Privatkunde (0 % Rabatt)"},...customersList.map(k=>({value:k.id,label:k.name+" (−"+Number(k.discount_percent||0).toLocaleString("de-DE")+" %)"}))];
 const emap=Object.fromEntries(employees.map(x=>[x.user_id,x.display_name]));
 rows.forEach(x=>x.employee_name=emap[x.employee_id]||"—");
 const open=rows.filter(x=>x.status==="Eingegangen"||x.status==="In Bearbeitung");
 const recent=rows.filter(x=>x.status==="Bestellung abgeschlossen").slice(0,10);
 const totalOpen=open.reduce((n,x)=>n+Number(x.total||0),0);
 const formLink=new URL("./bestellung.html",location.href).href;
 const dateText=x=>x.delivery_date?new Date(x.delivery_date+"T00:00:00").toLocaleDateString("de-DE"):"—";
 const card=x=>'<div class="ordercard"><div class="ordercardtop"><div><span class="orderNo">'+esc(x.order_number)+'</span>'+badge(x.status)+'</div><b>'+money(x.total)+'</b></div>'+
 '<div class="ordercustomer"><strong>'+esc(x.customer_name)+'</strong><span>Lieferdatum: '+esc(dateText(x))+'</span><span>Lieferung: '+(x.delivery_requested?"Ja · +10%":"Nein")+'</span></div>'+
 '<div class="ordermeta"><span>Erstellt: '+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</span><span>Mitarbeiter: '+esc(x.employee_name)+'</span>'+(x.commission_amount?'<span>Provision: '+money(x.commission_amount)+'</span>':'')+'</div>'+
 ((x.status==="In Bearbeitung"||x.status==="Eingegangen")?'<div class="order-customer-select"><label style="display:block;margin:10px 0 5px;font-weight:700">KUNDE</label><select data-order-customer="'+x.id+'">'+customerOptions.map(o=>'<option value="'+esc(o.value)+'" '+(String(x.customer_id||"")===String(o.value)?"selected":"")+'>'+esc(o.label)+'</option>').join("")+'</select><small>Rabatt wird vom Warenwert abgezogen; Liefergebühr bleibt unverändert.</small><button class="mini gold" data-save-order-customer="'+x.id+'">Kundenwahl speichern</button></div>':"")+
 '<div class="orderactions"><button class="mini gold" data-view-order="'+x.id+'">Details</button>'+
 (x.status==="Eingegangen"?'<button class="mini gold" data-order-status="'+x.id+'|In Bearbeitung">Bestellung annehmen</button>':"")+
 (x.status==="In Bearbeitung"?'<button class="mini gold" data-order-status="'+x.id+'|Bestellung abgeschlossen">Bestellung abschließen</button>':"")+
 (x.status!=="Bestellung abgeschlossen"?'<button class="mini" data-delete-order="'+x.id+'">Löschen</button>':"")+
 '</div></div>';
 return intro("BESTELLUNGEN","Bestellungsmenü","Kunden bestellen über den öffentlichen Link. Mitarbeiter übernehmen Bestellungen und erhalten dabei 30% Provision. Beim Abschluss werden Lager und Kasse automatisch gebucht.",null,null)+
 '<div class="orderlinkpanel"><div><div class="eyebrow">KUNDENFORMULAR</div><b>Bestelllink für Kunden</b><p>Produkt, Menge, Lieferdatum und Lieferung werden erfasst. Lieferung berechnet automatisch 10% Aufschlag.</p></div><div class="orderlinkactions"><input class="orderlinkinput" readonly value="'+esc(formLink)+'"><button class="btn gold" data-action="copy-order-link">Link kopieren</button><button class="btn outline" data-action="open-order-form">Formular öffnen</button></div></div>'+
 '<div class="stats">'+stat("🛒","OFFENE BESTELLUNGEN",open.length)+stat("$","OFFENER BESTELLWERT",money(totalOpen))+stat("↗","IN BEARBEITUNG",rows.filter(x=>x.status==="In Bearbeitung").length)+stat("✓","LETZTE BESTELLUNGEN",recent.length)+'</div>'+
 '<div class="orderssection"><div class="sectiontitle"><div><div class="eyebrow">AKTUELL</div><h2>Offene Bestellungen</h2><p>Neue Bestellungen und Bestellungen in Bearbeitung.</p></div></div>'+
 '<div class="ordergrid">'+(open.map(card).join("")||'<div class="panel" style="text-align:center;padding:28px"><h2 style="margin:0 0 8px">Keine Bestellung verfügbar</h2><p class="muted" style="margin:0">Aktuell liegt keine offene Bestellung vor. Der Kunden-Bestelllink steht oben bereit und kann direkt kopiert und weitergegeben werden.</p></div>')+'</div></div>'+
 '<div class="orderssection"><div class="sectiontitle"><div><div class="eyebrow">ARCHIV</div><h2>Letzte Bestellungen</h2><p>Abgeschlossene Bestellungen bleiben als Nachweis erhalten.</p></div></div>'+
 '<div class="ordergrid">'+(recent.map(card).join("")||'<div class="panel"><p class="muted">Keine Bestellungen hinterlegt</p></div>')+'</div></div>';
}

async function orderModal(id){
 const {data:order,error}=await supabaseClient.from("vineyard_orders").select("id,order_number,status,customer_name,customer_email,customer_phone,customer_address,customer_note,employee_id,total,commission_rate,commission_amount,delivery_date,delivery_requested,delivery_fee,created_at,accepted_at,completed_at").eq("id",id).single();
 if(error)throw error;
 const {data:items=[],error:ie}=await supabaseClient.from("vineyard_order_items").select("item_name,unit,quantity,unit_price,line_total").eq("order_id",id).order("created_at");
 if(ie)throw ie;
 const employee=order.employee_id?await supabaseClient.from("vineyard_profiles").select("display_name").eq("user_id",order.employee_id).maybeSingle():{data:null};
 const date=order.delivery_date?new Date(order.delivery_date+"T00:00:00").toLocaleDateString("de-DE"):"—";
 const rows=items.map(x=>'<tr><td>'+esc(x.item_name)+'</td><td>'+Number(x.quantity).toLocaleString("de-DE")+' '+esc(x.unit)+'</td><td>'+money(x.unit_price)+'</td><td>'+money(x.line_total)+'</td></tr>').join("");
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal"><div class="modalhead"><b>Bestellung · '+esc(order.order_number)+'</b><button type="button" id="x">×</button></div><div class="grid2"><div class="panel"><b>Kunde</b><p>'+esc(order.customer_name)+'</p><b>Lieferdatum</b><p>'+esc(date)+'</p><b>Lieferung</b><p>'+(order.delivery_requested?"Ja · +10% Liefergebühr":"Nein")+'</p></div><div class="panel"><b>Status</b><p>'+badge(order.status)+'</p><b>Mitarbeiter</b><p>'+esc(employee.data?.display_name||"Noch nicht zugewiesen")+'</p><b>Provision</b><p>'+money(order.commission_amount||0)+'</p></div></div><div class="tablewrap"><table><thead><tr><th>Produkt</th><th>Menge</th><th>Einzelpreis</th><th>Gesamt</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="publicTotal"><span>Gesamtsumme</span><b>'+money(order.total)+'</b></div><p class="muted">'+esc(order.customer_note||"")+'</p><div class="actions"><button type="button" class="btn outline" id="closeOrderModal">Schließen</button></div></div></div>';
 const close=()=>$("#modalroot").innerHTML="";
 $("#x").onclick=$("#closeOrderModal").onclick=close;
}
async function updateOrderStatus(id,status){
 const button=document.querySelector('[data-order-status="'+id+'|'+status+'"]');
 if(button)button.disabled=true;
 try{
  const {error}=await supabaseClient.rpc("vineyard_update_order_status",{p_order_id:id,p_status:status});
  if(error)throw error;
  await auditLog(status==="In Bearbeitung"?"Bestellung angenommen":"Bestellung abgeschlossen","order",id,{status});
  if(status==="Bestellung abgeschlossen")alert("Bestellung abgeschlossen. Lagerbestand und Kasse wurden automatisch angepasst.");
  await render();
 }catch(err){alert(err.message||String(err))}finally{if(button)button.disabled=false}
}
async function deleteOrder(id){
 if(!confirm("Diese Bestellung wirklich löschen?"))return;
 const {error}=await supabaseClient.rpc("vineyard_delete_order",{p_order_id:id});
 if(error)throw error;
 await auditLog("Bestellung gelöscht","order",id,{});
 await render();
}
async function admin(){
 if(!role?.permissions?.admin_access)return errorBox("Kein Admin-Zugang.");
 const {data:rows=[],error}=await supabaseClient.from("vineyard_audit_log").select("*").order("created_at",{ascending:false}).limit(500);
 if(error)return errorBox(error.message);
 const actorIds=[...new Set(rows.map(x=>x.actor_id).filter(Boolean))];
 const {data:actors=[]}=actorIds.length?await supabaseClient.from("vineyard_profiles").select("user_id,display_name").in("user_id",actorIds):{data:[]};
 const actorMap=Object.fromEntries((actors||[]).map(x=>[x.user_id,x.display_name]));
 const actorName=x=>actorMap[x.actor_id]||x.details?.actor_name||"SYSTEM";
 const formatDate=x=>{const d=new Date(x.created_at);return d.toLocaleDateString("de-DE")+" · "+d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})+" Uhr"};
 const message=x=>{
  const d=x.details||{}, a=String(x.action||"").toLowerCase(), name=actorName(x);
  if(a.includes("rezept produziert")) return name+" hat "+Number(d.output_quantity||0).toLocaleString("de-DE")+" "+(d.output_unit||"")+" "+(d.recipe||"produziert")+".";
  if(a.includes("ein-/verkauf gebucht")||a.includes("einkauf gebucht")||a.includes("verkauf gebucht")) return name+" hat "+String(d.quantity||"")+" "+String(d.unit||"")+" "+String(d.item_name||"Artikel")+" als "+String(d.trade_type||"Vorgang")+" gebucht: "+money(d.total||0)+".";
  if(a.includes("kassenbuchung")) return name+" hat "+(d.kind==="in"?"eine Einnahme":"eine Ausgabe")+" von "+money(d.amount||0)+" in die Kasse gebucht.";
  if(a==="lagerbestand geändert") return name+" hat den Lagerbestand von "+String(d.item_name||"Artikel")+" um "+Number(d.delta||0).toLocaleString("de-DE")+" verändert.";
  if(a.includes("lieferung erfasst")) return name+" hat eine Lieferung erfasst: "+String(d.item_name||"Artikel")+" · "+String(d.quantity||"")+" · "+money(d.total||0)+" · Provision "+money(d.commission_amount||0)+".";
  
  
  if(a.includes("rechnung erstellt")) return name+" hat eine Rechnung erstellt.";
  if(a.includes("rechnung geändert")) return name+" hat eine Rechnung geändert.";
  if(a.includes("rechnung gelöscht")) return name+" hat eine Rechnung gelöscht.";
  if(a.includes("rezept angelegt")) return name+" hat das Rezept "+String(d.name||"")+" angelegt.";
   if(a.includes("rezept geändert")) return name+" hat das Rezept "+String(d.name||"")+" geändert.";
   if(a.includes("rezept gelöscht")) return name+" hat das Rezept "+String(d.name||"")+" gelöscht.";
  if(a.includes("lagerartikel angelegt")) return name+" hat einen Lagerartikel "+String(d.item_name||"")+" angelegt.";
   if(a.includes("lagerartikel geändert")) return name+" hat den Lagerartikel "+String(d.item_name||"")+" geändert.";
   if(a.includes("lagerartikel gelöscht")) return name+" hat den Lagerartikel gelöscht.";
  if(a.includes("mitarbeiter angelegt")) return name+" hat einen Mitarbeiter angelegt.";
  if(a.includes("mitarbeiter geändert")) return name+" hat einen Mitarbeiter geändert.";
  if(a.includes("mitarbeiter gelöscht")) return name+" hat einen Mitarbeiter gelöscht.";
  if(a.includes("ein-/verkauf geändert")) return name+" hat einen Ein-/Verkauf geändert.";
  if(a.includes("ein-/verkauf gelöscht")) return name+" hat einen Ein-/Verkauf gelöscht.";
  return name+" hat "+String(x.action||"eine Änderung")+" durchgeführt.";
 };
 return '<div class="intro"><div><div class="eyebrow">ADMINISTRATION</div><h1>Aktivitätslog</h1><p>Hier wird nachvollziehbar festgehalten, was im Saloon-System passiert ist – mit Datum, Uhrzeit, Mitarbeiter und Vorgang.</p></div></div>'+
 '<div class="panel adminlog"><div class="adminloghead"><div><b>Vollständiges Systemprotokoll</b><small>Die neuesten 500 Einträge</small></div><span class="badge good">'+rows.length+' Einträge</span></div>'+
 (rows.map(x=>'<div class="adminlogrow"><div class="adminlogtime">'+esc(formatDate(x))+'</div><div class="adminlogicon">◷</div><div class="adminlogbody"><b>'+esc(message(x))+'</b><small>'+esc(actorName(x))+' · '+esc(x.entity||"System")+'</small></div></div>').join("")||'<p class="muted">Noch keine Aktivitäten protokolliert.</p>')+
 '</div>';
}
async function inventory(){
 const {data:items=[],error}=await supabaseClient.from("vineyard_inventory").select("*").order("category").order("item_name");
 if(error)return errorBox(error.message);
 const ingredients=items.filter(x=>x.category==="Zutaten"),products=items.filter(x=>x.category==="Produkte");
 return '<div class="intro"><div><div class="eyebrow">LAGER</div><h1>Lagerbestand</h1><p>Alle Artikel und Bestandsbewegungen übersichtlich verwalten.</p></div><div class="actions">'+(canManageCatalog()?'<button type="button" class="btn gold" data-action="newitem">+ Lagerartikel</button>':'')+(can("inventory_view")?'<button type="button" class="btn outline" data-action="stockin">＋ Eingang</button><button type="button" class="btn outline" data-action="stockout">− Ausgang</button>':'')+'</div></div>'+
 '<div class="panel"><input class="fullinput" id="q" placeholder="Artikel suchen …"><div class="inventoryhint"><b>'+ingredients.length+'</b> Zutaten · <b>'+products.length+'</b> Produkte · <b>'+items.length+'</b> Artikel insgesamt</div></div>'+
 '<div class="panel inventorytablewrap"><table class="inventorytable"><thead><tr><th>Artikel</th><th>Kategorie</th><th>Bestand</th><th>Einheit</th><th>Mindestbestand</th><th>Preis</th><th class="inventoryactionshead">Aktionen</th></tr></thead><tbody id="inventoryRows">'+inventoryRows(items)+'</tbody></table></div>';
}
function inventoryRows(items){
 return items.map(x=>{
  const low=Number(x.quantity)<=Number(x.min_stock);
  const price=x.category==="Zutaten"?"Einkauf "+money(x.purchase_price):"Verkauf "+money(x.sale_price);
  const actions=canManageCatalog()?'<button class="mini" data-edit-item="'+x.id+'">Bearbeiten</button> <button class="mini danger" data-delete-item="'+x.id+'">Löschen</button>':'';
  return '<tr><td><b>'+esc(x.item_name)+'</b></td><td>'+esc(x.category)+'</td><td><span class="qty '+(low?'low':'')+'">'+Number(x.quantity).toLocaleString("de-DE")+'</span></td><td>'+esc(x.unit)+'</td><td>'+Number(x.min_stock).toLocaleString("de-DE")+'</td><td>'+price+'</td><td class="inventoryactions">'+actions+'</td></tr>';
 }).join("")||'<tr><td colspan="7" class="muted">Noch keine Lagerartikel angelegt.</td></tr>';
}
async function recipes(){
 const {data:rows=[],error}=await supabaseClient.from("vineyard_recipes").select("*").order("name");
 if(error)return errorBox(error.message);
 const {data:inv=[]}=await supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category");
 const map=Object.fromEntries(inv.map(x=>[x.id,x]));
 const {data:items=[]}=await supabaseClient.from("vineyard_recipe_items").select("recipe_id,quantity,inventory_id,vineyard_inventory:inventory_id(item_name,unit,category)").order("created_at");
 const byRecipe={};items.forEach(x=>(byRecipe[x.recipe_id]??=[]).push(x));
 return intro("REZEPTE","Rezeptverwaltung","Hier legst du fest, welche im Lager angelegten Zutaten für ein Produkt benötigt werden.",canManageRecipes()?"newrecipe":null,canManageRecipes()?"+ Rezept":null)+
 '<div class="recipehint"><b>Wichtig:</b> Nur Artikel, die vorher im <b>Lager</b> angelegt wurden, können hier ausgewählt werden. Als Zutaten können sowohl <b>Zutaten</b> als auch bereits hergestellte <b>Produkte</b> verwendet werden. Das Rezept-Ergebnis muss als <b>Produkt</b> angelegt sein.</div>'+
 '<div class="recipegrid">'+rows.map(r=>{
   const out=map[r.output_inventory_id];
   const its=byRecipe[r.id]||[];
   return '<div class="recipecard"><div class="eyebrow">REZEPT</div><h3>'+esc(r.name)+'</h3><p class="muted">'+esc(r.description||"Keine Beschreibung")+'</p>'+
   '<div class="recipeoutput"><span>ERGEBNIS</span><b>'+(out?esc(out.item_name):"Nicht mehr im Lager")+'</b><small>'+Number(r.output_quantity).toLocaleString("de-DE")+' '+esc(out?.unit||"")+'</small></div>'+
   '<div class="recipeingredients"><small>ZUTATEN</small>'+its.map(x=>'<div><span>'+esc(x.vineyard_inventory?.item_name||"Unbekannter Lagerartikel")+'</span><b>'+Number(x.quantity).toLocaleString("de-DE")+' '+esc(x.vineyard_inventory?.unit||"")+'</b></div>').join("")+'</div>'+
   '<div class="recipeactions">'+(canManageRecipes()?'<button class="mini gold" data-edit-recipe="'+r.id+'">Bearbeiten</button> <button class="mini" data-delete-recipe="'+r.id+'">Löschen</button>':"")+'</div></div>';
 }).join("")||'<div class="panel"><p class="muted">Noch keine Rezepte angelegt. Lege zuerst Zutaten und Produkte im Lager an.</p></div>'+'</div>';
}
async function production(){
 const [{data:recipes=[],error:recipeError},{data:inv=[],error:invError}]=await Promise.all([
  supabaseClient.from("vineyard_recipes").select("id,name,output_inventory_id,output_quantity,active").eq("active",true).order("name"),
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category").order("item_name")
 ]);
 if(recipeError||invError)return errorBox((recipeError||invError).message);
 const products=Object.fromEntries(inv.filter(x=>x.category==="Produkte").map(x=>[x.id,x]));
 const ingredients=Object.fromEntries(inv.map(x=>[x.id,x]));
 const recipeIds=recipes.map(x=>x.id);
 let items=[];
 if(recipeIds.length){
  const r=await supabaseClient.from("vineyard_recipe_items").select("recipe_id,inventory_id,quantity").in("recipe_id",recipeIds).order("created_at");
  if(r.error)return errorBox(r.error.message);
  items=r.data||[];
 }
 const byRecipe={};
 items.forEach(x=>(byRecipe[x.recipe_id]??=[]).push(x));
 const {data:lastProductionRows=[]}=await supabaseClient.from("vineyard_inventory_movements").select("inventory_id,delta,reason,created_at").gt("delta",0).like("reason","Produktion:%").order("created_at",{ascending:false}).limit(1);
 const lastProduction=lastProductionRows[0];
 const lastProduct=lastProduction?inv.find(x=>x.id===lastProduction.inventory_id):null;
 const lastProductionPanel='<div class="productioningredientswrap" style="margin-top:18px"><div class="eyebrow">PRODUKTIONSVERLAUF</div><h3>Letzte Produktion</h3>'+(lastProduction&&lastProduct?'<div class="productioningredient"><div><b>'+esc(lastProduct.item_name)+'</b><small>'+esc(new Date(lastProduction.created_at).toLocaleString("de-DE"))+'</small></div><strong>+'+Number(lastProduction.delta).toLocaleString("de-DE",{maximumFractionDigits:6})+' '+esc(lastProduct.unit||"")+'</strong></div>':'<p class="muted">Noch keine Produktion gebucht.</p>')+'</div>';
 if(!recipes.length)return intro("PRODUKTION","Produktion","Wähle ein gespeichertes Rezept und buche die Herstellung. Die Lagerbestände werden automatisch angepasst.",null,null)+
  '<div class="panel"><b>Noch keine Rezepte vorhanden.</b><p class="muted">Lege zuerst im Lager Zutaten und Produkte an und erstelle anschließend unter Rezepte ein Rezept.</p></div>'+lastProductionPanel;

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
 '</div>'+lastProductionPanel;
}

async function trades(filter="all"){
 const {data:rows=[],error}=await supabaseClient.from("vineyard_trades").select("*").order("created_at",{ascending:false});
 if(error)return errorBox(error.message);
 const purchases=rows.filter(x=>x.trade_type==="Einkauf");
 const sales=rows.filter(x=>x.trade_type==="Verkauf");
 const visibleRows=filter==="Einkauf"?purchases:filter==="Verkauf"?sales:rows;
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
 (visibleRows.map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</td><td>'+(x.trade_type==="Einkauf"?'<span class="badge warn">Einkauf</span>':'<span class="badge good">Verkauf</span>')+'</td><td><b>'+esc(x.item_name)+'</b><small class="tableunit">'+esc(x.unit)+'</small></td><td>'+Number(x.quantity).toLocaleString("de-DE")+'</td><td>'+money(x.unit_price)+'</td><td><b>'+money(x.total)+'</b></td><td><button class="mini gold" data-edit-trade="'+x.id+'">Bearbeiten</button> <button class="mini" data-delete-trade="'+x.id+'">Löschen</button></td></tr>').join("")||'<tr><td colspan="7">Noch keine Ein- oder Verkäufe gebucht.</td></tr>')+
 '</tbody></table></div></div>';
}
async function appointments(){
 return intro("TERMINE","Termine","Interne Terminübersicht für Besprechungen, Lieferungen und Veranstaltungen.")+
 '<div class="panel placeholder"><div class="placeholdericon">◷</div><h2>Terminverwaltung</h2><p class="muted">Die Terminübersicht ist wieder im Menü erreichbar. Termine können hier als eigener Bereich gepflegt werden.</p><div class="placeholderstate">Noch keine Termine hinterlegt.</div></div>';
}
async function commissions(){
 const [{data:employees=[],error:ee},{data:orders=[],error:oe},{data:invoices=[],error:ie},{data:payouts=[],error:pe}]=await Promise.all([
  supabaseClient.from("vineyard_profiles").select("user_id,display_name,role_key,active").eq("active",true),
  supabaseClient.from("vineyard_orders").select("employee_id,commission_amount").eq("status","Lieferung abgeschlossen"),
  supabaseClient.from("vineyard_invoices").select("employee_id,commission_amount").gt("commission_amount",0).neq("status","Storniert"),
  supabaseClient.from("vineyard_commission_payouts").select("employee_id,amount,paid_at")
 ]);
 if(ee||oe||ie||pe)return errorBox((ee||oe||ie||pe).message);
 const rankMap={master:12,familienvogt:11,familienrat:10,geschaeftsfuehrer:9,vertrauensmitglied:8,verwaltung:7,lager:6,winzer:5,winzerlehrling:4,kasse:3,kellerhelfer:2,mitarbeiter:1};
 const labelMap={master:"FAMILIENOBERHAUPT",familienvogt:"FAMILIENVOGT",familienrat:"FAMILIENRAT",geschaeftsfuehrer:"GESCHÄFTSFÜHRER",vertrauensmitglied:"VERTRAUENSMITGLIED",verwaltung:"BETRIEBSLEITER",lager:"KELLERMEISTER",winzer:"WINZER/BRAUER",winzerlehrling:"LEHRLING",kasse:"STUBENBEDIENSTETE",kellerhelfer:"KELLERHELFER",mitarbeiter:"ERNTEHELFER"};
 const accrued={}; const paid={};
 orders.forEach(x=>accrued[x.employee_id]=(accrued[x.employee_id]||0)+Number(x.commission_amount||0));
 invoices.forEach(x=>accrued[x.employee_id]=(accrued[x.employee_id]||0)+Number(x.commission_amount||0));
 payouts.forEach(x=>paid[x.employee_id]=(paid[x.employee_id]||0)+Number(x.amount||0));
 const rows=employees.filter(x=>rankMap[x.role_key]).map(x=>({...x,rank:rankMap[x.role_key],roleLabel:labelMap[x.role_key]||x.role_key,accrued:accrued[x.user_id]||0,paid:paid[x.user_id]||0,due:Math.max((accrued[x.user_id]||0)-(paid[x.user_id]||0),0)})).sort((a,b)=>b.rank-a.rank||a.display_name.localeCompare(b.display_name,"de"));
 const total=rows.reduce((s,x)=>s+x.due,0);
 const canPay=profile?.role_key==="master"||profile?.role_key==="familienvogt";
 return intro("PROVISION","Provisionsabrechnung","Alle aktiven Mitarbeiter werden nach Rang sortiert angezeigt. Offene Provisionen können ausschließlich vom Familienoberhaupt oder Familienvogt ausgezahlt werden.",null,null)+
 '<div class="stats">'+stat("💰","OFFENE PROVISION",money(total))+stat("👥","MITARBEITER",rows.length)+stat("✓","AUSZAHLUNG","FAMILIENVOGT / OBERHAUPT")+stat("↻","SYSTEM","AUTOMATISCH")+'</div>'+
 '<div class="panel"><div class="tablewrap"><table><thead><tr><th>RANG</th><th>MITARBEITER</th><th>PROVISION ERHALTEN</th><th>OFFEN</th><th>AKTION</th></tr></thead><tbody>'+
 (rows.map(x=>'<tr><td><b>#'+x.rank+'</b><br><small>'+esc(x.roleLabel)+'</small></td><td><b>'+esc(x.display_name)+'</b></td><td>'+money(x.accrued)+'</td><td><strong>'+money(x.due)+'</strong></td><td>'+(canPay&&x.due>0?'<button class="mini gold" data-pay-commission="'+x.user_id+'">✓ Ausgezahlt</button>':x.due<=0?'<span class="badge good">Ausgeglichen</span>':'<span class="muted">Keine Berechtigung</span>')+'</td></tr>').join("")||'<tr><td colspan="5">Keine aktiven Mitarbeiter vorhanden.</td></tr>')+
 '</tbody></table></div></div>';
}
async function cash(){
 const {data:rows=[],error}=await supabaseClient.from("vineyard_cashbook").select("*").order("created_at",{ascending:false});
 if(error)return errorBox(error.message);
 const visibleRows=rows||[];
 const balance=visibleRows.reduce((s,x)=>s+(x.kind==="in"?1:-1)*Number(x.amount||0),0);
 const income=visibleRows.filter(x=>x.kind==="in").reduce((s,x)=>s+Number(x.amount||0),0);
 const expenses=visibleRows.filter(x=>x.kind==="out").reduce((s,x)=>s+Number(x.amount||0),0);
 const body=visibleRows.map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</td><td>'+(x.kind==="in"?'<span class="badge good">Einnahme</span>':'<span class="badge bad">Ausgabe</span>')+'</td><td><b>'+money(x.amount)+'</b></td><td>'+esc(x.category||"—")+(x.source_type==="trade"?' <span class="badge warn">Ein-/Verkauf</span>':"")+'</td><td>'+esc(x.description||"")+'</td><td>'+(x.source_type==="trade"?'<span class="muted">Über Ein-/Verkauf</span>':'<button class="mini" data-edit-cash="'+x.id+'">Bearbeiten</button> <button class="mini" data-delete-cash="'+x.id+'">Löschen</button>')+'</td></tr>').join("")||'<tr><td colspan="6">Keine Buchungen.</td></tr>';
 return intro("KASSE","Kassenbuch","Ein- und Auszahlungen mit Benutzerprotokoll.",can("cash_edit")?"newcash":null,can("cash_edit")?"+ Buchung":null)+
 '<div class="stats">'+stat("$","AKTUELLER KASSENSTAND",money(balance))+stat("↗","EINNAHMEN",money(income))+stat("↘","AUSGABEN",money(expenses))+stat("▤","BUCHUNGEN",visibleRows.length)+"</div>"+
 '<div class="panel"><div class="tablewrap"><table><thead><tr><th>DATUM</th><th>ART</th><th>BETRAG</th><th>KATEGORIE</th><th>BESCHREIBUNG</th><th></th></tr></thead><tbody>'+body+'</tbody></table></div></div>';
}
async function employees(){
 const rankOrder={winzerlehrling:10,kellerhelfer:20,mitarbeiter:30,kasse:40,winzer:50,lager:60,vertrauensmitglied:70,verwaltung:80,geschaeftsfuehrer:90,familienrat:100,familienvogt:110,master:120};
 const [{data:emps=[]},{data:roles=[]}]=await Promise.all([
  supabaseClient.from("vineyard_profiles").select("user_id,display_name,role_key,active,phone,vineyard_roles:role_key(label)").eq("active",true).order("display_name"),
  supabaseClient.from("vineyard_roles").select("key,label,permissions").order("key")
 ]);
 emps.sort((a,b)=>{const ar=a.role_key==="admin"?10000:(rankOrder[a.role_key]??9990);const br=b.role_key==="admin"?10000:(rankOrder[b.role_key]??9990);return ar-br||String(a.display_name||"").localeCompare(String(b.display_name||""));});
 return intro("TEAM","Mitarbeiter","Mitarbeiter werden mit Namen und Rolle geführt. Die Rechte richten sich nach der jeweiligen Rolle.",can("employees_edit")?"newemployee":null,can("employees_edit")?"+ Mitarbeiter":null)+
 '<div class="employeegrid">'+emps.map(x=>'<div class="employee"><div class="avatar">'+esc(initials(x.display_name))+'</div><div style="flex:1"><b>'+esc(x.display_name)+"</b><small>"+esc(x.vineyard_roles?.label||x.role_key)+" · "+(x.active?'<span class="good">Aktiv</span>':'<span class="bad">Deaktiviert</span>')+"</small>"+(x.phone?'<small>'+esc(x.phone)+"</small>":"")+'</div>'+(can("employees_edit")?'<div class="actions"><button type="button" class="mini" data-action="edit-employee" data-employee-id="'+x.user_id+'">Name / Rolle ändern</button><button type="button" class="mini danger" data-action="delete-employee" data-employee-id="'+x.user_id+'">Löschen</button></div>':"")+"</div>").join("")+"</div>";
}
function errorBox(t){return '<div class="panel"><b>Fehler</b><p class="muted">'+esc(t)+"</p></div>"}

async function render(){
 if(page==="recipes"||page==="production")page="dashboard";
 let content=page==="dashboard"?await dashboard():page==="invoices"?await invoices():page==="orders"?await orders():page==="customers"?await customers():page==="inventory"?await inventory():page==="recipes"?await recipes():page==="production"?await production():page==="purchase"?await trades("Einkauf"):page==="sales"?await trades("Verkauf"):page==="trades"?await trades("all"):page==="cash"?await cash():page==="employees"?await employees():page==="appointments"?await appointments():page==="commission"?await commissions():page==="admin"?await admin():await dashboard();
 shell(content);bind();
 startInventoryRealtime();
 if(page==="orders")startOrderRealtime();else stopOrderRealtime();
}
function bindInventoryRows(){ $$("[data-edit-item]").forEach(b=>b.onclick=()=>itemModal(b.dataset.editItem)); $$("[data-delete-item]").forEach(b=>b.onclick=()=>deleteItem(b.dataset.deleteItem)); }
function bind(){
 document.onclick=async e=>{
  const hamburger=e.target.closest?.("#hamb");
  if(hamburger){
   e.preventDefault();
   e.stopPropagation();
   const sidebar=$("#sidebar"),overlay=$("#navOverlay");
   if(sidebar){
    const open=!sidebar.classList.contains("open");
    sidebar.classList.toggle("open",open);
    if(overlay)overlay.classList.toggle("open",open);
    hamburger.setAttribute("aria-expanded",open?"true":"false");
    hamburger.setAttribute("aria-label",open?"Menü schließen":"Menü öffnen");
   }
   return;
  }
  if(e.target.closest?.("#navOverlay")){
   e.preventDefault();
   const sidebar=$("#sidebar"),overlay=$("#navOverlay"),button=$("#hamb");
   sidebar?.classList.remove("open");
   overlay?.classList.remove("open");
   button?.setAttribute("aria-expanded","false");
   button?.setAttribute("aria-label","Menü öffnen");
   return;
  }
  const navButton=e.target.closest?.(".nav");
  if(navButton){
   e.preventDefault();
   page=navButton.dataset.page;
   const sidebar=$("#sidebar"),overlay=$("#navOverlay"),button=$("#hamb");
   sidebar?.classList.remove("open");
   overlay?.classList.remove("open");
   button?.setAttribute("aria-expanded","false");
   button?.setAttribute("aria-label","Menü öffnen");
   void auditLog("Seite geöffnet","navigation",page,{page_title:pageTitle()});
   try{await render()}catch(err){console.error("Donnerfaust Navigation:",err);document.body.innerHTML=errorBox(err?.message||"Die Seite konnte nicht geladen werden.")}
   return;
  }
  const pageButton=e.target.closest?.("[data-page-action]");
  if(pageButton){
   e.preventDefault();
   page=pageButton.dataset.pageAction;
   await render();
   return;
  }
  const actionButton=e.target.closest?.("[data-action]");
  if(!actionButton)return;
  e.preventDefault();
  e.stopPropagation();
  if(actionButton.dataset.busy==="1")return;
  actionButton.dataset.busy="1";
  actionButton.disabled=true;
  try{await action(actionButton.dataset.action,actionButton)}
  catch(err){console.error("Donnerfaust Saloon Aktion:",err);alert(err?.message||String(err))}
  finally{actionButton.disabled=false;actionButton.dataset.busy="0"}
 };
 if(page==="production"){
  const recipeEl=$("select[name=production_recipe],#production_recipe"),batchEl=$("input[name=production_batches],#production_batches"),book=$("#bookProduction"),ingEl=$("#productionIngredients"),outName=$("#productionOutputName"),outQty=$("#productionOutputQty");
  const recipeData=[];
  const productMap={};
  const updateProduction=async()=>{
   if(!recipeEl||!batchEl){console.error("Produktionsformular unvollständig", {recipeEl:!!recipeEl,batchEl:!!batchEl});return;}
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
   if(!recipeEl||!batchEl){alert("Das Produktionsformular konnte nicht vollständig geladen werden. Bitte lade die Seite neu.");return;}
   book.disabled=true;
   try{
    const batches=Number(batchEl.value);
    if(!Number.isFinite(batches)||batches<=0)throw Error("Die Menge muss größer als 0 sein.");
    const selectedRecipeId=recipeEl.value;
    if(!selectedRecipeId)throw Error("Bitte wähle zuerst ein Rezept aus.");
    const r=await supabaseClient.rpc("vineyard_produce_recipe",{p_recipe_id:selectedRecipeId,p_batches:batches});
    if(r.error)throw r.error;
    await auditLog("Produktion gebucht","production",selectedRecipeId,{recipe_id:selectedRecipeId,batches});
    alert("Produktion wurde gebucht.");
    await render();
    await render();
   }catch(err){alert(err.message||String(err));book.disabled=false}
  });
 }
 $("#q")?.addEventListener("input",async e=>{const {data=[]}=await supabaseClient.from("vineyard_inventory").select("*").order("category").order("item_name");const q=e.target.value.toLowerCase();$("#inventoryRows").innerHTML=inventoryRows(data.filter(x=>(x.item_name+" "+x.category+" "+x.unit).toLowerCase().includes(q)));bindInventoryRows()});
 $$("[data-stock]").forEach(b=>b.onclick=()=>stockModal(b.dataset.stock));
 bindInventoryRows();
 $$("[data-edit-recipe]").forEach(b=>b.onclick=()=>recipeModal(b.dataset.editRecipe));
 $$("[data-delete-recipe]").forEach(b=>b.onclick=()=>deleteRecipe(b.dataset.deleteRecipe));
 $$("[data-edit-trade]").forEach(b=>b.onclick=()=>tradeModal(b.dataset.editTrade));
 $$("[data-delete-trade]").forEach(b=>b.onclick=()=>deleteTrade(b.dataset.deleteTrade));
 $$("[data-edit-cash]").forEach(b=>b.onclick=()=>cashModal(b.dataset.editCash));
 $$("[data-delete-cash]").forEach(b=>b.onclick=()=>deleteCash(b.dataset.deleteCash));
 $$("[data-edit-employee]").forEach(b=>b.onclick=()=>employeeModal(b.dataset.editEmployee));
 $$("[data-share-invoice]").forEach(b=>b.onclick=()=>shareInvoice(b.dataset.shareInvoice));
 $$("[data-edit-invoice]").forEach(b=>b.onclick=()=>invoiceModal(b.dataset.editInvoice));
 $$("[data-delete-invoice]").forEach(b=>b.onclick=()=>deleteInvoice(b.dataset.deleteInvoice));
 $$("[data-view-order]").forEach(b=>b.onclick=()=>orderModal(b.dataset.viewOrder));
  $$("[data-save-order-customer]").forEach(b=>b.onclick=async()=>{if(b.dataset.busy==="1")return;const id=b.dataset.saveOrderCustomer,select=document.querySelector('[data-order-customer="'+id+'"]');if(!select)return;b.dataset.busy="1";b.disabled=true;try{const {error}=await supabaseClient.rpc("vineyard_assign_order_customer",{p_order_id:id,p_customer_id:select.value||null});if(error)throw error;alert("Kunde zugeordnet; Rabatt und Bestellwert wurden aktualisiert.");await render()}catch(err){alert(err.message||String(err))}finally{b.dataset.busy="0";if(b.isConnected)b.disabled=false}});
 $$("[data-order-status]").forEach(b=>b.onclick=async()=>{if(b.dataset.busy==="1")return;b.dataset.busy="1";b.disabled=true;try{const parts=b.dataset.orderStatus.split("|");if(parts.length!==2||!parts[0]||!parts[1])throw Error("Ungültige Bestellaktion.");await updateOrderStatus(parts[0],parts[1]);}catch(err){console.error("Bestellung aktualisieren:",err);alert(err?.message||String(err));}finally{b.dataset.busy="0";if(b.isConnected)b.disabled=false;}});
 $$("[data-delete-order]").forEach(b=>b.onclick=()=>deleteOrder(b.dataset.deleteOrder)); $$("[data-pay-commission]").forEach(b=>b.onclick=async()=>{if(b.dataset.busy==="1")return;if(!confirm("Provision für diesen Mitarbeiter jetzt vollständig auszahlen und den offenen Wert auf 0 setzen?"))return;b.dataset.busy="1";b.disabled=true;try{const r=await supabaseClient.rpc("vineyard_pay_commission",{p_employee_id:b.dataset.payCommission});if(r.error)throw r.error;alert("Provision von "+money(r.data)+" wurde als ausgezahlt verbucht.");await render()}catch(err){alert(err.message||String(err));b.dataset.busy="";b.disabled=false}});

}
async function action(a,actionButton){
 if(a==="openinventory"){page="inventory";await render();return}
 if(a==="newitem"){if(!canManageCatalog())throw Error("Nur Familienoberhaupt, Familienvogt, Familienrat und Geschäftsführer dürfen Lagerartikel anlegen.");await itemModal();return}
 if(a==="stockin"){await stockModal(null,"in");return}
 if(a==="stockout"){await stockModal(null,"out");return}
 if(a==="newrecipe"){if(!canManageRecipes())throw Error("Nur Familienoberhaupt und Familienvogt dürfen Rezepte verwalten.");await recipeModal();return}
 if(a==="newcash"){await cashModal();return}
 if(a==="newtrade"){await tradeModal(null,page==="purchase"?"Einkauf":page==="sales"?"Verkauf":null);return}
 if(a==="newemployee"){await employeeModal();return}
 if(a==="edit-employee"){const id=actionButton?.dataset.employeeId;if(!id)throw Error("Mitarbeiter konnte nicht ermittelt werden.");await employeeModal(id);return}
 if(a==="delete-employee"){const id=actionButton?.dataset.employeeId;await deleteEmployee(id);return}
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
  if(!canManageCatalog())throw Error("Du darfst keine Lagerartikel anlegen oder Stammdaten bearbeiten.");
 let item=null;
 if(id){const {data,error}=await supabaseClient.from("vineyard_inventory").select("*").eq("id",id).single();if(error)throw error;item=data}
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
    const v=Object.fromEntries(new FormData(e.target));
    const ingredient=v.category==="Zutaten";
    const purchase_price=ingredient?Number(v.purchase_price):0;
    const sale_price=ingredient?0:Number(v.sale_price);
    if(!ingredient&&!Number.isFinite(sale_price))throw Error("Bitte einen gültigen Verkaufspreis angeben.");
    if(ingredient&&!Number.isFinite(purchase_price))throw Error("Bitte einen gültigen Einkaufspreis angeben.");
    const patch={item_name:v.item_name.trim(),category:v.category,unit:v.unit.trim(),quantity:Number(v.quantity)||0,min_stock:Number(v.min_stock)||0,purchase_price,sale_price,updated_at:new Date().toISOString(),updated_by:profile?.user_id||null};
    const r=id?await supabaseClient.from("vineyard_inventory").update(patch).eq("id",id):await supabaseClient.from("vineyard_inventory").insert(patch);
    if(r.error)throw r.error;
    await auditLog(id?"Lagerartikel geändert":"Lagerartikel angelegt","inventory",id||v.item_name,patch);
    close();await render();
   }catch(err){alert(err.message||String(err))}finally{b.disabled=false}
 };
}
async function recipeModal(id){
  if(!canManageRecipes())throw Error("Nur Familienoberhaupt und Familienvogt dürfen Rezepte erstellen oder bearbeiten.");
 const [{data:ingredients=[]},{data:products=[]},recipeResult,itemsResult]=await Promise.all([
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category").order("item_name"),
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
 field("Produzierte Menge pro Produktion","output_quantity","number",recipe?.output_quantity??1,true)+
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
   const output_quantity=Number(e.target.output_quantity.value);
   const product=products.find(x=>x.id===output_inventory_id);
   const payload=$$(".recipeformrow").map(row=>({
    inventory_id:row.querySelector(".recipeingredient").value,
    quantity:Number(row.querySelector(".recipequantity").value)
   })).filter(x=>x.inventory_id);

   if(!product)throw Error("Bitte ein Produkt auswählen.");
   if(!Number.isFinite(output_quantity)||output_quantity<=0)throw Error("Die produzierte Menge muss größer als 0 sein.");
   if(!payload.length)throw Error("Ein Rezept benötigt mindestens eine Zutat.");
   if(payload.some(x=>!Number.isFinite(x.quantity)||x.quantity<=0))throw Error("Alle Zutatenmengen müssen größer als 0 sein.");
   if(new Set(payload.map(x=>x.inventory_id)).size!==payload.length)throw Error("Eine Zutat darf pro Rezept nur einmal vorkommen.");

   const r=await supabaseClient.rpc("vineyard_save_recipe",{
    p_recipe_id:id||null,
    p_name:product.item_name,
    p_description:"",
    p_output_inventory_id:output_inventory_id,
    p_output_quantity:output_quantity,
    p_items:payload
   });
   if(r.error)throw r.error;
   await auditLog(id?"Rezept geändert":"Rezept angelegt","recipe",id||output_inventory_id,{name:product.item_name,output_inventory_id,ingredients:payload});
   close();
   await render();
  }catch(err){alert(err.message||String(err))}
  finally{b.disabled=false}
 };
}
async function deleteRecipe(id){
  if(!canManageRecipes())throw Error("Nur Familienoberhaupt und Familienvogt dürfen Rezepte löschen.");
 if(!confirm("Dieses Rezept wirklich löschen?"))return;
 const r=await supabaseClient.rpc("vineyard_delete_recipe",{p_recipe_id:id});
 if(r.error)return alert(r.error.message);
 await auditLog("Rezept gelöscht","recipe",id,{});
 await render();
}
async function invoiceModal(id){
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal"><div class="modalhead"><b>Rechnung wird vorbereitet</b></div><p class="muted">Lagerartikel und Mitarbeiter werden geladen…</p></div></div>';
 const [{data:inventory=[],error},{data:existingInvoice},{data:employees=[],error:ee},{data:customerRows=[],error:ce}]=await Promise.all([
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category,purchase_price,sale_price").order("category").order("item_name"),
  id?supabaseClient.from("vineyard_invoices").select("id,invoice_type,partner_name,status,employee_id,commission_rate,commission_amount").eq("id",id).single():Promise.resolve({data:null}),
  supabaseClient.rpc("vineyard_order_employees"),
  supabaseClient.from("vineyard_customers").select("id,name,discount_percent,active").eq("active",true).order("name")
 ]);
 if(error)throw error;
 if(ee)throw ee;
 if(ce)throw ce;
 if(id&&!existingInvoice)throw Error("Rechnung nicht gefunden.");
 if(!inventory.length)throw Error("Lege zuerst Artikel im Lager an. Nur dort hinterlegte Artikel können auf Rechnungen ausgewählt werden.");
 const typeOptions=[
  {value:"Produktion",label:"🏭 Produktion · Provision 10%"},
  {value:"Verkauf",label:"🛒 Verkauf · Provision 20%"},
  {value:"Einkauf",label:"📦 Einkauf · keine Provision"},
  {value:"Bestellung",label:"📦 Lieferung · Provision 30%"}
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
 selectField("KUNDE","customer_id",[{value:"",label:"Privatkunde"},...customerRows.map(k=>({value:k.id,label:k.name+" (−"+Number(k.discount_percent||0).toLocaleString("de-DE")+" %)"}))],existingInvoice?.customer_id||"")+ 
 field("Handelspartner","partner_name","text",existingInvoice?.partner_name||"",true)+
 '<div class="recipeformhead"><b>Gehandelte Positionen</b><button type="button" class="mini gold" id="addinvoiceitem">+ Position</button></div><div id="invoiceitemsform"></div>'+
 '<div class="invoiceTotal" id="invoiceTotal"></div><div class="invoiceCommission" id="invoiceCommission"></div>'+
 '<div class="actions"><button type="button" class="btn outline" id="cancel">Abbrechen</button><button class="btn primary">Rechnung speichern</button></div></form></div></div>';
 const close=()=>$("#modalroot").innerHTML="";
 $("#x").onclick=$("#cancel").onclick=close;
 const typeEl=$("#invoiceform [name=invoice_type]");
 const employeeEl=$("#invoiceform [name=employee_id]");
 const statusEl=$("#invoiceform [name=status]");
 const customerEl=$("#invoiceform [name=customer_id]");
 customerEl.onchange=()=>{const k=customerRows.find(x=>x.id===customerEl.value);if(k)$("#invoiceform [name=partner_name]").value=k.name;else $("#invoiceform [name=partner_name]").value="Privatkunde"};
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
   await auditLog(id?"Rechnung geändert":"Rechnung erstellt","invoice",id||null,{invoice_type:typeEl.value,partner_name:partner,status:statusEl.value,items:rows});
   close();await render();
  }catch(err){alert(err.message||String(err))}finally{b.disabled=false}
 };
}
async function deleteItem(id){
  if(!canManageCatalog())throw Error("Du darfst keine Lagerartikel löschen.");
 if(!confirm("Diesen Lagerartikel wirklich löschen? Zugehörige Rezepte werden dabei entfernt; historische Rechnungspositionen bleiben erhalten."))return;
 const {error}=await supabaseClient.rpc("vineyard_delete_inventory",{p_inventory_id:id});if(error)throw error;await auditLog("Lagerartikel gelöscht","inventory",id,{});await render();
}
async function deleteTrade(id){
 if(!confirm("Diesen Ein-/Verkauf wirklich löschen? Lagerbestand und Kassenbuchung werden dabei automatisch zurückgebucht."))return;
 const {error}=await supabaseClient.rpc("vineyard_delete_trade",{p_trade_id:id});
 if(error)throw error;
 await auditLog("Ein-/Verkauf gelöscht","trade",id,{});
 await render();
}
async function deleteCash(id){
 if(!confirm("Diese Kassenbuchung wirklich löschen?"))return;
 const {error}=await supabaseClient.from("vineyard_cashbook").delete().eq("id",id);if(error)throw error;await auditLog("Kassenbuchung gelöscht","cashbook",id,{});await render();
}
async function deleteInvoice(id){
 if(!confirm("Diese Rechnung wirklich löschen? Der öffentliche Rechnungslink funktioniert danach nicht mehr."))return;
 const {error}=await supabaseClient.rpc("vineyard_delete_invoice",{p_invoice_id:id});if(error)throw error;await auditLog("Rechnung gelöscht","invoice",id,{});await render();
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
 if(error||!invoice)return document.body.innerHTML='<div class="publicInvoice"><div class="publicInvoiceBox"><div class="brandmark"><img src="./assets/donnerfaust-saloon-logo.svg" alt="Donnerfaust Saloon"></div><h1>Rechnung nicht verfügbar</h1><p>Der Link ist ungültig oder die Rechnung wurde storniert.</p></div></div>';
 const items=Array.isArray(data.items)?data.items:[];
 const total=items.reduce((s,x)=>s+Number(x.line_total||0),0);
 document.body.innerHTML='<main class="publicInvoice"><div class="publicInvoiceBox"><div class="publicHead"><div><div class="eyebrow">DONNERFAUST SALOON</div><h1>Rechnung</h1><p>Schreibgeschützter Handelsnachweis</p></div><div class="publicNumber">'+esc(invoice.invoice_number)+'</div></div><div class="publicMeta"><div><small>VORGANG</small><b>'+esc(invoice.invoice_type)+'</b></div><div><small>HANDELSPARTNER</small><b>'+esc(invoice.partner_name)+'</b></div><div><small>DATUM</small><b>'+esc(new Date(invoice.created_at).toLocaleString("de-DE"))+'</b></div><div><small>STATUS</small><b>'+esc(invoice.status)+'</b></div><div><small>MITARBEITER</small><b>'+esc(invoice.employee_name||"—")+'</b></div></div><div class="publicTable"><table><thead><tr><th>Artikel</th><th>Menge</th><th>Einzelpreis</th><th>Gesamt</th></tr></thead><tbody>'+items.map(x=>'<tr><td>'+esc(x.item_name)+'</td><td>'+Number(x.quantity).toLocaleString("de-DE")+' '+esc(x.unit)+'</td><td>'+money(x.unit_price)+'</td><td>'+money(x.line_total)+'</td></tr>').join("")+'</tbody></table></div><div class="publicTotal"><span>Gesamtsumme</span><b>'+money(total)+'</b></div><p class="publicReadonly">Diese Ansicht ist schreibgeschützt. Es besteht kein Zugriff auf die interne Vineyard-Verwaltung.</p></div></main>';
}
async function stockModal(id=null,mode=null){
 const [{data:items=[],error},{data:employees=[],error:employeeError}]=await Promise.all([
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,quantity,category").order("category").order("item_name"),
  supabaseClient.rpc("vineyard_order_employees")
 ]);
 if(error)throw error;
 if(employeeError)throw employeeError;
 if(!items.length)throw Error("Es sind noch keine Lagerartikel angelegt.");
 if(!employees.length)throw Error("Es sind keine aktiven Mitarbeiter verfügbar.");
 if(id&&!items.some(x=>String(x.id)===String(id)))throw Error("Lagerartikel nicht gefunden.");
 const chosen=items.find(x=>String(x.id)===String(id))||items[0];
 const options=items.map(x=>({value:x.id,label:x.item_name+" · Bestand "+Number(x.quantity).toLocaleString("de-DE")+" "+x.unit}));
 const employeeOptions=employees.map(x=>({value:x.user_id,label:x.display_name}));
 const title=mode==="in"?"Wareneingang":mode==="out"?"Warenausgang":"Bestandsbewegung";
 modal(title,selectField("Lagerartikel","inventory_id",options,chosen.id)+selectField("Mitarbeiter","employee_id",employeeOptions,profile?.user_id||employees[0].user_id)+selectField("Bewegung","mode",[{value:"in",label:"Eingang (+)"},{value:"out",label:"Ausgang (−)"}],mode||"in")+field("Menge","amount","number","",true)+field("Grund / Bemerkung","reason","text","",true),
 async v=>{
  const amount=Number(v.amount);
  if(!Number.isFinite(amount)||amount<=0)throw Error("Die Menge muss größer als 0 sein.");
  const item=items.find(x=>String(x.id)===String(v.inventory_id));
  if(!item)throw Error("Bitte einen gültigen Lagerartikel wählen.");
  const employee=employees.find(x=>String(x.user_id)===String(v.employee_id));
  if(!employee)throw Error("Bitte einen gültigen Mitarbeiter auswählen.");
  if(v.mode==="out"&&amount>Number(item.quantity))throw Error("Der Ausgang ist größer als der aktuelle Bestand ("+Number(item.quantity).toLocaleString("de-DE")+" "+item.unit+").");
  const reason="Mitarbeiter: "+employee.display_name+" · "+(v.reason||"Keine Bemerkung").trim();
  const delta=v.mode==="in"?amount:-amount;
  const {error}=await supabaseClient.rpc("vineyard_adjust_inventory",{p_inventory_id:v.inventory_id,p_delta:delta,p_reason:reason});
  if(error)throw error;
  await auditLog(v.mode==="in"?"Lagerzugang gebucht":"Lagerausgang gebucht","inventory",v.inventory_id,{item_name:item.item_name,quantity:amount,unit:item.unit,employee_id:employee.user_id,employee_name:employee.display_name,reason:(v.reason||"").trim()});
 });
}

async function tradeModal(id,defaultType=null){
 const [{data:items=[],error:ie},{data:existing,error:te},{data:customerRows=[],error:ce}]=await Promise.all([
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category,purchase_price,sale_price,quantity").order("category").order("item_name"),
  id?supabaseClient.from("vineyard_trades").select("*").eq("id",id).single():Promise.resolve({data:null,error:null}),
  supabaseClient.from("vineyard_customers").select("id,name,discount_percent,active").eq("active",true).order("name")
 ]);
 if(ie)throw ie;
 if(te)throw te;
 if(ce)throw ce;
 if(id&&!existing)throw Error("Handelsvorgang nicht gefunden.");
 const type=existing?.trade_type||defaultType||"Einkauf";
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
 (type==="Verkauf"?selectField("KUNDE","customer_id",[{value:"",label:"Privatkunde"},...customerRows.map(k=>({value:k.id,label:k.name+" (−"+Number(k.discount_percent||0).toLocaleString("de-DE")+" %)"}))],existing?.customer_id||""):"")+
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
   await auditLog(id?"Ein-/Verkauf geändert":"Ein-/Verkauf gebucht","trade",id||null,{trade_type:typeEl.value,inventory_id:itemEl.value,quantity});
   close();
   await render();
  }catch(err){alert(err.message||String(err));b.disabled=false}
 };
}
async function customers(){
 const {data:rows=[],error}=await supabaseClient.from("vineyard_customers").select("*").order("name");
 if(error)return errorBox(error.message);
 const active=rows.filter(x=>x.active).length;
 return intro("STAMMKUNDEN","Kunden","Kunden verwalten und feste Rabatte für Lieferungen hinterlegen.",can("orders_manage")?"newcustomer":null,can("orders_manage")?"+ Kunde hinzufügen":null)+
 '<div class="stats">'+stat("♙","KUNDEN",rows.length)+stat("✓","AKTIV",active)+stat("%","RABATTE",rows.filter(x=>x.active&&Number(x.discount_percent)>0).length)+'</div>'+
 '<div class="panel"><div class="tablewrap"><table><thead><tr><th>Kunde</th><th>Rabatt</th><th>Status</th><th>Notiz</th><th>Aktionen</th></tr></thead><tbody>'+
 (rows.map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td>'+Number(x.discount_percent).toLocaleString("de-DE")+' %</td><td>'+badge(x.active?"Aktiv":"Inaktiv")+'</td><td>'+esc(x.notes||"—")+'</td><td><button class="mini" data-action="edit-customer" data-customer-id="'+x.id+'">Bearbeiten</button> <button class="mini" data-action="toggle-customer" data-customer-id="'+x.id+'" data-active="'+x.active+'">'+(x.active?"Deaktivieren":"Aktivieren")+'</button></td></tr>').join("")||'<tr><td colspan="5">Noch keine Kunden angelegt.</td></tr>')+
 '</tbody></table></div></div>';
}
async function customerModal(id){
 let customer=null;
 if(id){const r=await supabaseClient.from("vineyard_customers").select("*").eq("id",id).single();if(r.error)throw r.error;customer=r.data}
 modal(id?"Kunden bearbeiten":"Kunden anlegen",
 field("Kundenname","name","text",customer?.name||"",true)+
 field("Kundenrabatt (%)","discount_percent","number",customer?.discount_percent??0,true)+
 field("Notiz","notes","text",customer?.notes||""),
 async v=>{const discount=Number(v.discount_percent);if(!v.name.trim())throw Error("Bitte einen Kundennamen eingeben.");if(!Number.isFinite(discount)||discount<0||discount>100)throw Error("Der Rabatt muss zwischen 0 und 100 Prozent liegen.");const payload={name:v.name.trim(),discount_percent:discount,notes:(v.notes||"").trim(),updated_at:new Date().toISOString()};const r=id?await supabaseClient.from("vineyard_customers").update(payload).eq("id",id):await supabaseClient.from("vineyard_customers").insert(payload);if(r.error)throw r.error;await auditLog(id?"Kunde geändert":"Kunde angelegt","customer",id||null,{name:payload.name,discount_percent:discount})});
}
async function toggleCustomer(id,active){
 const r=await supabaseClient.from("vineyard_customers").update({active:!active,updated_at:new Date().toISOString()}).eq("id",id);
 if(r.error)throw r.error;
 await auditLog(!active?"Kunde aktiviert":"Kunde deaktiviert","customer",id,{active:!active});
 await render();
}
async function deliveryModal(){
 const [{data:employees=[],error:ee},{data:products=[],error:ie},{data:customersList=[],error:ce}]=await Promise.all([
  supabaseClient.rpc("vineyard_order_employees"),
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,quantity,sale_price").eq("category","Produkte").order("item_name"),
  supabaseClient.from("vineyard_customers").select("id,name,discount_percent").eq("active",true).order("name")
 ]);
 if(ee)throw ee;if(ie)throw ie;if(ce)throw ce;
 if(!employees.length)throw Error("Keine aktiven Mitarbeiter verfügbar.");
 if(!products.length)throw Error("Lege zuerst mindestens ein Produkt im Lager an.");
 const employeeOptions=employees.map(x=>({value:x.user_id,label:x.display_name}));
 const productOptions=products.map(x=>({value:x.id,label:x.item_name}));
 const customerOptions=[{value:"",label:"Privatkunde"},...customersList.map(x=>({value:x.id,label:x.name+" (−"+Number(x.discount_percent).toLocaleString("de-DE")+" %)"}))];
 modal("Lieferung an Großhändler",
 '<div class="recipehint"><b>Hinweis:</b> Standardmäßig ist „Privatkunde“ ausgewählt. Wähle einen angelegten Kunden aus, um dessen Rabatt automatisch vom regulären Produktpreis abzuziehen. Die Provision wird wie bisher in der Provisionstabelle geführt.</div>'+
 selectField("Wer hat geliefert?","employee_id",employeeOptions,profile?.user_id||employees[0].user_id)+
 selectField("Kunde","customer_id",customerOptions,"")+
 selectField("Produkt","inventory_id",productOptions,products[0].id)+
 field("Menge","quantity","number","1",true)+
 field("Preis vor Rabatt ($)","subtotal","number","",true)+
 '<div class="tradeprice"><div><span>KUNDENRABATT</span><b id="deliveryDiscount">0 % · '+money(0)+'</b><small id="deliverySubtotal">Endbetrag: '+money(0)+'</small></div></div>'+
 field("Endbetrag nach Rabatt ($)","total","number","",true),
 async v=>{
  const quantity=Number(v.quantity),subtotal=Number(v.subtotal),total=Number(v.total);
  if(!Number.isFinite(quantity)||quantity<=0)throw Error("Die Liefermenge muss größer als 0 sein.");
  if(!Number.isFinite(subtotal)||subtotal<=0)throw Error("Der Preis vor Rabatt muss größer als 0 sein.");
  if(!Number.isFinite(total)||total<=0)throw Error("Der Endbetrag muss größer als 0 sein.");
  const product=products.find(x=>String(x.id)===String(v.inventory_id));if(!product)throw Error("Produkt nicht gefunden.");
  if(quantity>Number(product.quantity))throw Error("Nicht genügend Bestand vorhanden.");
  const customer=customersList.find(x=>String(x.id)===String(v.customer_id));
  const expected=Math.round(subtotal*(1-Number(customer?.discount_percent||0)/100)*100)/100;
  if(Math.abs(expected-total)>0.011)throw Error("Der Endbetrag passt nicht zum Kundenrabatt. Bitte Betrag prüfen.");
  const r=await supabaseClient.rpc("vineyard_create_delivery",{p_employee_id:v.employee_id,p_inventory_id:v.inventory_id,p_quantity:quantity,p_total:total,p_customer_id:v.customer_id||null,p_subtotal:subtotal,p_discount_percent:Number(customer?.discount_percent||0)});
  if(r.error)throw r.error;
  await auditLog("Lieferung erfasst","delivery",r.data?.id||null,{employee_id:v.employee_id,inventory_id:v.inventory_id,quantity,total,subtotal,customer_id:v.customer_id||null,customer_name:customer?.name||"Standardkunde",discount_percent:Number(customer?.discount_percent||0)});
 });
 const customerEl=$("[name=customer_id]"),productEl=$("[name=inventory_id]"),qtyEl=$("[name=quantity]"),subEl=$("[name=subtotal]"),totalEl=$("[name=total]");
 const updatePrice=()=>{
  const product=products.find(x=>String(x.id)===String(productEl?.value));
  const customer=customersList.find(x=>String(x.id)===String(customerEl?.value));
  const qty=Number(qtyEl?.value)||0,discount=Number(customer?.discount_percent||0);
  const subtotal=Number(subEl?.value)||0;
  if(product&&(!subEl.value||subEl.dataset.autofill==="1")){subEl.value=(Number(product.sale_price||0)*qty).toFixed(2);subEl.dataset.autofill="1"}
  const base=Number(subEl?.value)||0,final=Math.round(base*(1-discount/100)*100)/100;
  if(totalEl)totalEl.value=final.toFixed(2);
  const d=$("#deliveryDiscount");if(d)d.textContent=discount.toLocaleString("de-DE")+" % · −"+money(base-final);
  const s=$("#deliverySubtotal");if(s)s.textContent="Endbetrag: "+money(final);
 };
 subEl?.addEventListener("input",()=>{subEl.dataset.autofill="0";updatePrice()});
 productEl?.addEventListener("change",()=>{subEl.dataset.autofill="1";updatePrice()});
 customerEl?.addEventListener("change",updatePrice);qtyEl?.addEventListener("input",updatePrice);
 updatePrice();
}
async function cashModal(id){
 let existing=null;
 if(id){const {data,error}=await supabaseClient.from("vineyard_cashbook").select("*").eq("id",id).single();if(error)throw error;existing=data}
 modal(id?"Kassenbuchung bearbeiten":"Kassenbuchung",selectField("Art","kind",[{value:"in",label:"Einnahme (+)"},{value:"out",label:"Ausgabe (-)"}],existing?.kind||"in")+selectField("Kategorie","category",["Weinverkauf","Trauben","Material","Lohn","Betriebskosten","Sonstiges"],existing?.category||"Sonstiges")+field("Betrag ($)","amount","number",existing?.amount??"",true)+field("Beschreibung","description","text",existing?.description||"",true),
 async v=>{const amount=Number(v.amount)||0;if(amount<=0)throw Error("Betrag muss größer als 0 sein.");let r;if(id)r=await supabaseClient.from("vineyard_cashbook").update({kind:v.kind,category:v.category,amount,description:v.description.trim()}).eq("id",id);else r=await supabaseClient.from("vineyard_cashbook").insert({kind:v.kind,category:v.category,amount,description:v.description.trim(),created_by:profile.user_id});if(r.error)throw r.error;await auditLog(id?"Kassenbuchung geändert":"Kassenbuchung","cashbook",id||null,{kind:v.kind,amount,category:v.category,description:v.description.trim()})})
}
async function employeeModal(id){
 const [profileResult,rolesResult]=await Promise.all([
  id?supabaseClient.from("vineyard_profiles").select("*").eq("user_id",id).maybeSingle():Promise.resolve({data:null,error:null}),
  supabaseClient.from("vineyard_roles").select("key,label,rank_order").order("rank_order",{ascending:true})
 ]);
 if(profileResult.error)throw profileResult.error;
 if(rolesResult.error)throw rolesResult.error;
 const employee=profileResult.data,roles=rolesResult.data||[];
 if(id&&!employee)throw Error("Mitarbeiter wurde nicht gefunden.");
 if(!roles.length)throw Error("Keine Mitarbeiterrollen konnten geladen werden.");
 const options=roles.filter(r=>role?.key==="master"?(r.key!=="admin"):Number(r.rank_order||0)<Number(role?.rank_order||0))
  .map(r=>({value:r.key,label:r.label}));
 if(!options.length)throw Error("Deine Rolle darf keine Mitarbeiterrollen vergeben.");
 modal(id?"Mitarbeiter bearbeiten":"Mitarbeiter hinzufügen",
  field("Name","display_name","text",employee?.display_name||"",true)+
  selectField("Rolle","role_key",options,employee?.role_key||"mitarbeiter")+
  '<label>Passwort'+
  '<input name="password" type="password" autocomplete="new-password" minlength="8" '+(id?'':'required')+' placeholder="'+(id?'Leer lassen, wenn das Passwort unverändert bleiben soll.':'Mindestens 8 Zeichen')+'">'+
  '</label>',
  async v=>{
   const password=String(v.password||"").trim();
   const result=await supabaseClient.rpc("vineyard_manage_employee",{
    p_action:id?"update":"create",
    p_employee_id:id||null,
    p_display_name:v.display_name.trim(),
    p_role_key:v.role_key,
    p_password:password||null
   });
   if(result.error)throw result.error;
   await auditLog(id?"Mitarbeiter geändert":"Mitarbeiter angelegt","employee",result.data?.user_id||id,{role_key:v.role_key,display_name:v.display_name.trim(),password_changed:!!password});
  });
}
async function deleteEmployee(id){
 if(!id)throw Error("Mitarbeiter konnte nicht ermittelt werden.");
 const employee=await supabaseClient.from("vineyard_profiles").select("user_id,display_name,role_key").eq("user_id",id).maybeSingle();
 if(employee.error)throw employee.error;
 if(!employee.data)throw Error("Mitarbeiter wurde nicht gefunden.");
 if(!confirm('Mitarbeiter "'+employee.data.display_name+'" wirklich löschen? Der Zugang wird sofort gesperrt. Historische Rechnungen und Buchungen bleiben erhalten.'))return;
 const result=await supabaseClient.rpc("vineyard_manage_employee",{
  p_action:"delete",
  p_employee_id:id,
  p_display_name:null,
  p_role_key:null,
  p_password:null
 });
 if(result.error)throw result.error;
 await auditLog("Mitarbeiter gelöscht","employee",id,{display_name:employee.data.display_name,role_key:employee.data.role_key});
 await render();
}

async function auditLog(action,entity,entityId,details){
 try{
  if(!profile?.user_id)return;
  const d={...(details||{})};
  if(!d.actor_name)d.actor_name=profile.display_name||"";
  const {error}=await supabaseClient.from("vineyard_audit_log").insert({
   actor_id:profile.user_id,action,entity,entity_id:entityId?String(entityId):null,details:d
  });
  if(error)console.warn("Audit-Log konnte nicht gespeichert werden:",error.message);
 }catch(err){console.warn("Audit-Log:",err)}
}
function showBootError(err){
 console.error("Donnerfaust Saloon Startfehler:",err);
 document.body.innerHTML='<div class="login"><div class="loginbox"><div class="loginbrand"><div class="brandmark"><img src="./assets/donnerfaust-saloon-logo.svg" alt="Donnerfaust Saloon"></div><h1>Donnerfaust Saloon</h1><p>Die Anwendung konnte nicht gestartet werden.</p></div><div class="error">Technischer Fehler beim Start.<br><small>'+esc(err?.message||String(err))+'</small></div><button class="btn primary" onclick="location.reload()">Erneut versuchen</button></div></div>';
}
init().catch(showBootError);
