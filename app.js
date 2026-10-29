const SUPABASE_URL="https://qsyijgvikxmwmhaiulne.supabase.co";
const SUPABASE_KEY="sb_publishable_5qeUg0c0T0IyLh8g0cUj6Q_ZJYgZYJ_";
if(!window.supabase||typeof window.supabase.createClient!=="function"){
 document.body.innerHTML='<div class="loading"><b>Donnerfaust Saloon konnte nicht geladen werden.</b><br><small>Die Supabase-Bibliothek ist nicht verfügbar. Bitte Seite neu laden.</small></div>';
 throw new Error("Supabase-Bibliothek konnte nicht geladen werden.");
}
let currentEmployeeId=sessionStorage.getItem("vineyard_employee_id")||"";
const employeeFetch=(input,init={})=>{
 const headers=new Headers(input instanceof Request?input.headers:undefined);
 for(const [k,v] of new Headers(init.headers||{}).entries())headers.set(k,v);
 const employeeSession=sessionStorage.getItem("vineyard_employee_session")||"";
 if(employeeSession)headers.set("x-employee-session",employeeSession);else headers.delete("x-employee-session");
 headers.delete("x-employee-id");
 return fetch(input,{...init,headers});
};
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{global:{fetch:employeeFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const asArray=value=>Array.isArray(value)?value:[];
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

["manual","▤","Betriebsanleitung","dashboard"]
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
function badge(s){const good=["Bezahlt","OK","Bestellung abgeschlossen"].includes(s);const warn=["Niedrig","Offen","Eingegangen","In Bearbeitung","Abhol-/Versandbereit"].includes(s);return '<span class="badge '+(good?"good":warn?"warn":"bad")+'">'+esc(s)+"</span>"}


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
function pageTitle(){return ({dashboard:"Übersicht",customers:"Kunden",invoices:"Rechnungen",orders:"Bestellungen",inventory:"Lagerübersicht",purchase:"Einkauf",sales:"Verkauf",cash:"Kasse",employees:"Mitarbeiter",appointments:"Termine",commission:"Provision",manual:"Betriebsanleitung"})[page]||"Übersicht"}
function initials(n){return String(n||"DF").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()}
function stat(icon,label,value){return '<div class="stat"><span class="icon">'+icon+'</span><div><small>'+label+"</small><b>"+value+"</b></div></div>"}
function intro(k,h,p,action,label){return '<div class="intro"><div><div class="eyebrow">'+k+"</div><h1>"+h+"</h1><p>"+p+"</p></div>"+(action?'<button type="button" class="btn gold" data-action="'+action+'">'+label+"</button>":"")+"</div>"}

async function dashboard(){
 const [invoiceCount,orderCount]=await Promise.all([
  can("invoice_view")?supabaseClient.from("vineyard_invoices").select("id",{count:"exact",head:true}).eq("status","Offen"):Promise.resolve({count:0,error:null}),
  supabaseClient.from("vineyard_orders").select("id",{count:"exact",head:true}).in("status",["Eingegangen","In Bearbeitung","Abhol-/Versandbereit"])
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
 const {data:rawRows,error}=await supabaseClient.from("vineyard_invoices").select("id,invoice_number,invoice_type,partner_name,status,created_at,created_by,employee_id,commission_rate,commission_amount").order("created_at",{ascending:false});
 if(error)return errorBox(error.message);
 const rows=asArray(rawRows);
 const {data:rawEmployees,error:ee}=await supabaseClient.rpc("vineyard_order_employees");
 if(ee)return errorBox(ee.message);
 const employees=asArray(rawEmployees);
 const emap=Object.fromEntries(employees.map(x=>[x.user_id,x.display_name]));
 rows.forEach(x=>{x.employee_name=emap[x.employee_id]||"—";x.completed_by_name=emap[x.completed_by]||"—"});
 const open=rows.filter(x=>x.status==="Offen").length;
 const total=rows.length;
 const commission=rows.reduce((s,x)=>s+Number(x.commission_amount||0),0);
 return intro("HANDELSNACHWEISE","Rechnungen","Nur Verkaufs- und Einkaufsrechnungen. Bestellungen und Lieferungen werden automatisch über das Bestellsystem abgerechnet.",can("invoice_edit")?"newinvoice":null,can("invoice_edit")?"+ Rechnung erstellen":null)+
 '<div class="stats">'+stat("▤","OFFENE RECHNUNGEN",open)+stat("$","HANDELSVORGÄNGE",total)+stat("↗","VERKAUF",rows.filter(x=>x.invoice_type==="Verkauf").length)+stat("%","PROVISIONEN",money(commission))+'</div>'+
 '<div class="panel"><div class="tablewrap"><table><thead><tr><th>NUMMER</th><th>ART</th><th>HANDELSPARTNER</th><th>MITARBEITER</th><th>PROVISION</th><th>DATUM</th><th>STATUS</th><th></th></tr></thead><tbody>'+
 (rows.map(x=>'<tr><td><b>'+esc(x.invoice_number)+'</b></td><td>'+esc(x.invoice_type)+'</td><td>'+esc(x.partner_name)+'</td><td>'+esc(x.employee_name)+'</td><td>'+money(x.commission_amount||0)+' ('+Number(x.commission_rate||0).toLocaleString("de-DE")+'%)</td><td>'+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</td><td>'+badge(x.status)+'</td><td><button class="mini gold" data-share-invoice="'+x.id+'">Teilen</button> <button class="mini" data-edit-invoice="'+x.id+'">Bearbeiten</button> <button class="mini" data-delete-invoice="'+x.id+'">Löschen</button></td></tr>').join("")||'<tr><td colspan="8">Noch keine Rechnungen vorhanden.</td></tr>')+
 '</tbody></table></div></div>';
}
async function orders(){
 const {data:rawRows,error}=await supabaseClient.from("vineyard_orders").select("id,order_number,status,customer_name,customer_email,customer_phone,customer_address,customer_note,employee_id,completed_by,total,commission_rate,commission_amount,delivery_date,delivery_requested,delivery_fee,created_at,accepted_at,completed_at,customer_id,subtotal_before_discount,customer_discount_percent").order("created_at",{ascending:false});
 if(error)return errorBox(error.message);
 const rows=Array.isArray(rawRows)?rawRows:[];
 const [{data:rawEmployees,error:ee},{data:customerRows,error:ce},{data:completionLogs,error:le}]=await Promise.all([supabaseClient.rpc("vineyard_order_employees"),supabaseClient.from("vineyard_customers").select("id,name,discount_percent").eq("active",true).order("name"),supabaseClient.from("vineyard_audit_log").select("entity_id,actor_id,created_at").eq("entity","order").eq("action","Bestellung abgeschlossen").order("created_at",{ascending:false})]);
 if(ee)return errorBox(ee.message);if(ce)return errorBox(ce.message);if(le)return errorBox(le.message);
 const employees=Array.isArray(rawEmployees)?rawEmployees:[];
 const customersList=Array.isArray(customerRows)?customerRows:[];
 const customerOptions=[{value:"",label:"Privatkunde (0 % Rabatt)"},...customersList.map(k=>({value:k.id,label:k.name+" (−"+Number(k.discount_percent||0).toLocaleString("de-DE")+" %)"}))];
 const emap=Object.fromEntries(employees.map(x=>[x.user_id,x.display_name]));
 const completedByOrder={};
 // Use the authoritative completed_by column first. Audit-log actor is only a legacy fallback.
 for(const x of rows){if(x.completed_by)completedByOrder[x.id]=x.completed_by;}
 for(const log of (completionLogs||[])){if(log.actor_id&&!completedByOrder[log.entity_id])completedByOrder[log.entity_id]=log.actor_id;}
 const completedIds=[...new Set([...Object.values(completedByOrder),...rows.filter(x=>x.completed_by).map(x=>x.completed_by)])];
 const {data:completedProfiles=[],error:cpe}=completedIds.length?await supabaseClient.from("vineyard_profiles").select("user_id,display_name").in("user_id",completedIds):{data:[],error:null};
 if(cpe)return errorBox(cpe.message);
 const completedNames=Object.fromEntries((completedProfiles||[]).map(x=>[x.user_id,x.display_name]));
 rows.forEach(x=>{x.employee_name=emap[x.employee_id]||"—";x.completed_by_name=completedNames[completedByOrder[x.id]]||"—";});
 const open=rows.filter(x=>["Eingegangen","In Bearbeitung","Abhol-/Versandbereit"].includes(x.status));
 const recent=rows.filter(x=>x.status==="Bestellung abgeschlossen").slice(0,10);
 const totalOpen=open.reduce((n,x)=>n+Number(x.total||0),0);
 const formLink=new URL("./bestellung.html",location.href).href;
 const dateText=x=>x.delivery_date?new Date(x.delivery_date+"T00:00:00").toLocaleDateString("de-DE"):"—";
 const card=x=>'<div class="ordercard"><div class="ordercardtop"><div><span class="orderNo">'+esc(x.order_number)+'</span>'+badge(x.status)+'</div><b>'+money(x.total)+'</b></div>'+
 '<div class="ordercustomer"><strong>'+esc(x.customer_name)+'</strong><span>Lieferdatum: '+esc(dateText(x))+'</span><span>Lieferung: '+(x.delivery_requested?"Ja · +10%":"Nein")+'</span>'+(Number(x.customer_discount_percent||0)>0?'<span>Kundenrabatt: −'+Number(x.customer_discount_percent).toLocaleString("de-DE")+' %</span>':'<span>Kundenrabatt: 0 %</span>')+'</div>'+
 '<div class="ordermeta"><span>Erstellt: '+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</span><span>Mitarbeiter: '+esc(x.employee_name)+'</span>'+(x.commission_amount?'<span>Provision: '+money(x.commission_amount)+'</span>':'')+(x.status==="Bestellung abgeschlossen"?'<span>Abgeschlossen von: '+esc(x.completed_by_name)+'</span>':'')+'</div>'+
 ((x.status==="In Bearbeitung")?'<div class="order-customer-select"><label style="display:block;margin:10px 0 5px;font-weight:700">KUNDE AUSWÄHLEN</label><select data-order-customer="'+x.id+'">'+customerOptions.map(o=>'<option value="'+esc(o.value)+'" '+(String(x.customer_id||"")===String(o.value)?"selected":"")+'>'+esc(o.label)+'</option>').join("")+'</select><small>Rabatt wird sofort auf den Warenwert angewendet. Liefergebühr bleibt unverändert.</small><button class="mini gold" data-save-order-customer="'+x.id+'">Kundenwahl speichern</button></div>':"")+
 '<div class="orderactions"><button class="mini gold" data-view-order="'+x.id+'">Details</button>'+
 (x.status==="Eingegangen"?'<button class="mini gold" data-order-status="'+x.id+'|In Bearbeitung">Bestellung annehmen</button>':"")+
 (x.status==="In Bearbeitung"?'<button class="mini gold" data-order-status="'+x.id+'|Abhol-/Versandbereit">Abhol-/Versandbereit</button>':"")+((x.status==="In Bearbeitung"||x.status==="Abhol-/Versandbereit")?'<button class="mini gold" data-order-status="'+x.id+'|Bestellung abgeschlossen">Bestellung abschließen</button>':"")+
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
 const closer=order.completed_by?await supabaseClient.from("vineyard_profiles").select("display_name").eq("user_id",order.completed_by).maybeSingle():{data:null};
 const date=order.delivery_date?new Date(order.delivery_date+"T00:00:00").toLocaleDateString("de-DE"):"—";
 const rows=items.map(x=>'<tr><td>'+esc(x.item_name)+'</td><td>'+Number(x.quantity).toLocaleString("de-DE")+' '+esc(x.unit)+'</td><td>'+money(x.unit_price)+'</td><td>'+money(x.line_total)+'</td></tr>').join("");
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal"><div class="modalhead"><b>Bestellung · '+esc(order.order_number)+'</b><button type="button" id="x">×</button></div><div class="grid2"><div class="panel"><b>Kunde</b><p>'+esc(order.customer_name)+'</p><b>Lieferdatum</b><p>'+esc(date)+'</p><b>Lieferung</b><p>'+(order.delivery_requested?"Ja · +10% Liefergebühr":"Nein")+'</p></div><div class="panel"><b>Status</b><p>'+badge(order.status)+'</p><b>Angenommen von</b><p>'+esc(employee?.data?.display_name||"Noch nicht zugewiesen")+'</p><b>Abgeschlossen von</b><p>'+esc(closer?.data?.display_name||"—")+'</p><b>Provision</b><p>'+money(order.commission_amount||0)+'</p></div></div><div class="tablewrap"><table><thead><tr><th>Produkt</th><th>Menge</th><th>Einzelpreis</th><th>Gesamt</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="publicTotal"><span>Gesamtsumme</span><b>'+money(order.total)+'</b></div><p class="muted">'+esc(order.customer_note||"")+'</p><div class="actions"><button type="button" class="btn outline" id="closeOrderModal">Schließen</button></div></div></div>';
 const close=()=>$("#modalroot").innerHTML="";
 $("#x").onclick=$("#closeOrderModal").onclick=close;
}
async function updateOrderStatus(id,status){
 const button=document.querySelector('[data-order-status="'+id+'|'+status+'"]');
 if(button)button.disabled=true;
 try{
  const {data:order}=await supabaseClient.from("vineyard_orders").select("order_number,customer_name,total,delivery_date").eq("id",id).maybeSingle();
  const {data:orderItems=[]}=await supabaseClient.from("vineyard_order_items").select("item_name,quantity,unit").eq("order_id",id);
  const {error}=await supabaseClient.rpc("vineyard_update_order_status",{p_order_id:id,p_status:status});
  if(error)throw error;
  await auditLog(status==="In Bearbeitung"?"Bestellung angenommen":status==="Abhol-/Versandbereit"?"Bestellung abhol-/versandbereit":"Bestellung abgeschlossen","order",id,{status,order_number:order?.order_number||"",customer_name:order?.customer_name||"",total:Number(order?.total||0),delivery_date:order?.delivery_date||"",items:(orderItems||[]).map(x=>({item_name:x.item_name,quantity:Number(x.quantity||0),unit:x.unit||""}))});
  if(status==="Abhol-/Versandbereit")alert("Die Bestellung ist jetzt als abhol-/versandbereit markiert. Lagerbestand und Kasse bleiben bis zum endgültigen Abschluss unverändert.");
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
 const [{data:items=[],error},{data:customerRows=[],error:ce}]=await Promise.all([
  supabaseClient.from("vineyard_inventory").select("*").order("category").order("item_name"),
  supabaseClient.from("vineyard_customers").select("id,name,active").order("name")
 ]);
 if(error)return errorBox(error.message);
 if(ce)return errorBox(ce.message);
 const ingredients=items.filter(x=>x.category==="Zutaten"),products=items.filter(x=>x.category==="Produkte");
 return '<div class="intro"><div><div class="eyebrow">LAGER</div><h1>Lagerbestand</h1><p>Alle Artikel und Bestandsbewegungen übersichtlich verwalten.</p></div><div class="actions">'+(canManageCatalog()?'<button type="button" class="btn gold" data-action="newitem">+ Lagerartikel</button>':'')+(can("inventory_view")?'<button type="button" class="btn outline" data-action="stockin">＋ Eingang</button><button type="button" class="btn outline" data-action="stockout">− Ausgang</button>':'')+'</div></div>'+
 '<div class="panel"><input class="fullinput" id="q" placeholder="Artikel suchen …"><div class="inventoryhint"><b>'+ingredients.length+'</b> Zutaten · <b>'+products.length+'</b> Produkte · <b>'+items.length+'</b> Artikel insgesamt</div></div>'+
 '<div class="panel inventorytablewrap"><table class="inventorytable"><thead><tr><th>Artikel</th><th>Kategorie</th><th>Bestand</th><th>Einheit</th><th>Mindestbestand</th><th>Preis</th><th>Verfügbarkeit</th><th class="inventoryactionshead">Aktionen</th><th>Unternehmen</th></tr></thead><tbody id="inventoryRows">'+inventoryRows(items,customerRows)+'</tbody></table></div>';
}
function inventoryRows(items,customers=[]){
 const customerName=id=>customers.find(c=>String(c.id)===String(id))?.name||"";
 const sortedItems=[...items].sort((a,b)=>String(a.item_name||"").localeCompare(String(b.item_name||""),"de",{numeric:true,sensitivity:"base"}));
 return sortedItems.map(x=>{
  const low=Number(x.quantity)<=Number(x.min_stock);
  const price=x.category==="Zutaten"?"Einkauf "+money(x.purchase_price):"Verkauf "+money(x.sale_price);
  const actions=canManageCatalog()?'<button class="mini" data-edit-item="'+x.id+'">Bearbeiten</button> <button class="mini danger" data-delete-item="'+x.id+'">Löschen</button>':'';
  const owner=canManageCatalog()?'<select class="inventory-owner-select" data-owner-customer="'+x.id+'" aria-label="Unternehmen für '+esc(x.item_name)+'"><option value="">Kein Unternehmen</option>'+customers.filter(c=>c.active||String(c.id)===String(x.owner_customer_id)).map(c=>'<option value="'+esc(c.id)+'" '+(String(c.id)===String(x.owner_customer_id)?"selected":"")+'>'+esc(c.name)+'</option>').join("")+'</select>':(customerName(x.owner_customer_id)?'<span>'+esc(customerName(x.owner_customer_id))+'</span>':'<span class="muted">—</span>');
  const availability=x.category==="Produkte"?(canManageCatalog()?'<button type="button" class="availability-toggle '+(x.is_available?"is-available":"")+'" data-toggle-availability="'+x.id+'" data-available="'+String(!!x.is_available)+'" aria-pressed="'+String(!!x.is_available)+'"><span></span>'+(x.is_available?"Verfügbar":"Nicht verfügbar")+'</button>':(x.is_available?'<span class="badge good">Verfügbar</span>':'<span class="badge bad">Nicht verfügbar</span>')):'<span class="muted">—</span>';
  return '<tr><td><b>'+esc(x.item_name)+'</b></td><td>'+esc(x.category)+'</td><td><span class="qty '+(low?'low':'')+'">'+Number(x.quantity).toLocaleString("de-DE")+'</span></td><td>'+esc(x.unit)+'</td><td>'+Number(x.min_stock).toLocaleString("de-DE")+'</td><td>'+price+'</td><td>'+availability+'</td><td class="inventoryactions">'+actions+'</td><td class="inventory-owner-cell">'+owner+'</td></tr>';
 }).join("")||'<tr><td colspan="9" class="muted">Noch keine Lagerartikel angelegt.</td></tr>';
}
async function recipes(){
 const {data:rowsRaw=[],error}=await supabaseClient.from("vineyard_recipes").select("*");
 const rows=[...rowsRaw].sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"de",{numeric:true,sensitivity:"base"}));
 if(error)return errorBox(error.message);
 const {data:inv=[]}=await supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category");
 const map=Object.fromEntries(inv.map(x=>[x.id,x]));
 const {data:items=[]}=await supabaseClient.from("vineyard_recipe_items").select("recipe_id,quantity,inventory_id,vineyard_inventory:inventory_id(item_name,unit,category)").order("created_at");
 const byRecipe={};asArray(items).forEach(x=>(byRecipe[x.recipe_id]??=[]).push(x));
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
 asArray(items).forEach(x=>(byRecipe[x.recipe_id]??=[]).push(x));
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
 '<div class="panel"><h3>Letzte Buchungen</h3><div class="tablewrap"><table><thead><tr><th>DATUM</th><th>ART</th><th>ARTIKEL</th><th>MENGE</th><th>EINZELPREIS</th><th>GESAMT</th><th></th></tr></thead><tbody>'+
 (visibleRows.map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</td><td>'+(x.trade_type==="Einkauf"?'<span class="badge warn">Einkauf</span>':'<span class="badge good">Verkauf</span>')+'</td><td><b>'+esc(x.item_name)+'</b><small class="tableunit">'+esc(x.unit)+'</small></td><td>'+Number(x.quantity).toLocaleString("de-DE")+'</td><td>'+money(x.unit_price)+'</td><td><b>'+money(x.total)+'</b></td><td><button class="mini gold" data-edit-trade="'+x.id+'">Bearbeiten</button> <button class="mini" data-delete-trade="'+x.id+'">Löschen</button></td></tr>').join("")||'<tr><td colspan="7">Noch keine Ein- oder Verkäufe gebucht.</td></tr>')+
 '</tbody></table></div></div>';
}
async function appointments(){
 return intro("TERMINE","Termine","Interne Terminübersicht für Besprechungen, Lieferungen und Veranstaltungen.")+
 '<div class="panel placeholder"><div class="placeholdericon">◷</div><h2>Terminverwaltung</h2><p class="muted">Die Terminübersicht ist wieder im Menü erreichbar. Termine können hier als eigener Bereich gepflegt werden.</p><div class="placeholderstate">Noch keine Termine hinterlegt.</div></div>';
}
async function commissions(){
 const [{data:employees=[],error:ee},{data:orders=[],error:oe},{data:invoices=[],error:ie},{data:trades=[],error:te},{data:payouts=[],error:pe}]=await Promise.all([
  supabaseClient.from("vineyard_profiles").select("user_id,display_name,role_key,active").eq("active",true),
  supabaseClient.from("vineyard_orders").select("completed_by,commission_amount").in("status",["Bestellung abgeschlossen","Lieferung abgeschlossen"]),
  supabaseClient.from("vineyard_invoices").select("employee_id,commission_amount").gt("commission_amount",0).neq("status","Storniert"),
  supabaseClient.from("vineyard_trades").select("employee_id,commission_amount").eq("trade_type","Verkauf").gt("commission_amount",0),
  supabaseClient.from("vineyard_commission_payouts").select("employee_id,amount,paid_at")
 ]);
 if(ee||oe||ie||te||pe)return errorBox((ee||oe||ie||te||pe).message);
 const rankMap={master:12,familienvogt:11,familienrat:10,geschaeftsfuehrer:9,vertrauensmitglied:8,verwaltung:7,lager:6,winzer:5,winzerlehrling:4,kasse:3,kellerhelfer:2,mitarbeiter:1};
 const labelMap={master:"FAMILIENOBERHAUPT",familienvogt:"FAMILIENVOGT",familienrat:"FAMILIENRAT",geschaeftsfuehrer:"GESCHÄFTSFÜHRER",vertrauensmitglied:"VERTRAUENSMITGLIED",verwaltung:"BETRIEBSLEITER",lager:"KELLERMEISTER",winzer:"WINZER/BRAUER",winzerlehrling:"LEHRLING",kasse:"STUBENBEDIENSTETE",kellerhelfer:"KELLERHELFER",mitarbeiter:"ERNTEHELFER"};
 const accrued={}; const paid={};
 asArray(orders).forEach(x=>{const recipient=x.completed_by;if(recipient)accrued[recipient]=(accrued[recipient]||0)+Number(x.commission_amount||0)});
 asArray(invoices).forEach(x=>accrued[x.employee_id]=(accrued[x.employee_id]||0)+Number(x.commission_amount||0));
 asArray(trades).forEach(x=>accrued[x.employee_id]=(accrued[x.employee_id]||0)+Number(x.commission_amount||0));
 asArray(payouts).forEach(x=>paid[x.employee_id]=(paid[x.employee_id]||0)+Number(x.amount||0));
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
 const sourceLabels={trade:"Ein-/Verkauf",order:"Bestellung",commission:"Provisionsauszahlung",invoice:"Rechnung",payroll:"Lohn",purchase:"Einkauf",sale:"Verkauf"};
 const body=visibleRows.map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleString("de-DE"))+'</td><td>'+(x.kind==="in"?'<span class="badge good">Einnahme</span>':'<span class="badge bad">Ausgabe</span>')+'</td><td><b>'+money(x.amount)+'</b></td><td>'+esc(x.category||"—")+(x.source_type&&sourceLabels[x.source_type]?' <span class="badge warn">'+esc(sourceLabels[x.source_type])+'</span>':"")+'</td><td>'+esc(x.description||"")+'</td><td>'+(x.source_type?'<span class="muted">Automatisch gebucht</span>':'<button class="mini" data-edit-cash="'+x.id+'">Bearbeiten</button> <button class="mini" data-delete-cash="'+x.id+'">Löschen</button>')+'</td></tr>').join("")||'<tr><td colspan="6">Keine Buchungen.</td></tr>';
 return intro("KASSE","Kassenbuch","Alle Kassenbewegungen: Einzahlungen, Auszahlungen, Verkäufe, Einkäufe, Bestellungen, Rechnungen, Lohn- und Provisionsauszahlungen.",can("cash_edit")?"newcash":null,can("cash_edit")?"+ Buchung":null)+
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

function manualGuide(){
 const sections=[
 {id:"start",title:"Erste Schritte und Anmeldung",tags:"passwort mitarbeiter login",body:`
 <ol><li>Öffne die Website des Donnerfaust Saloon.</li><li>Wähle deinen eigenen Mitarbeiternamen aus.</li><li>Gib das persönliche Passwort ein und tippe auf <b>Anmelden</b>.</li><li>Prüfe oben rechts, ob dein Name angezeigt wird. Unten im Menü stehen dein Name und deine Rolle.</li></ol>
 <p><b>Mitarbeiter wechseln:</b> Nutze unten links „Mitarbeiter wechseln“, wenn du dich abmelden oder eine andere berechtigte Person anmelden möchtest. Gib niemals dein Passwort an andere weiter und arbeite nicht unter dem Namen einer anderen Person.</p>
 <p><b>Passwort fehlt oder wird abgelehnt?</b> Prüfe die Eingabe und wähle bei Bedarf „Zurück“, um den Mitarbeiternamen erneut auszuwählen. Wenn für deinen Zugang kein Passwort eingerichtet ist oder es weiterhin nicht funktioniert, wende dich an eine dazu berechtigte Führungskraft.</p>`},
 {id:"dashboard",title:"Übersicht",tags:"startseite offene rechnungen bestellungen online live",body:`
 <ol><li>Nach der Anmeldung öffnet sich die Übersicht.</li><li>„Offene Rechnungen“ zeigt die Anzahl der Rechnungen mit Status „Offen“, sofern du Rechnungen sehen darfst.</li><li>„Offene Bestellungen“ zeigt Bestellungen mit Status „Eingegangen“ oder „In Bearbeitung“.</li><li>Tippe auf eine Übersichtskarte, um direkt zum jeweiligen Menü zu wechseln.</li><li>Die Live-Anzeige zeigt die erkannten aktuell angemeldeten Mitarbeiter.</li></ol>
 <p>Die Übersicht ist eine schnelle Orientierung. Für eine konkrete Buchung oder Statusprüfung immer das jeweilige Fachmenü öffnen.</p>`},
 {id:"orders",title:"Bestellungen",tags:"bestellung annehmen bearbeiten status kunde bestellposition",body:`
 <ol><li>Öffne <b>BESTELLUNGEN</b> im Seitenmenü.</li><li>Suche die betreffende Bestellung und öffne ihre Details.</li><li>Prüfe Kundenzuordnung, bestellte Produkte, Mengen und Hinweise sorgfältig.</li><li>Nutze die verfügbaren Aktionen in der Bestellung, um den Vorgang anzunehmen und den Status passend zum tatsächlichen Bearbeitungsstand zu aktualisieren.</li><li>Bearbeite die Bestellung erst weiter, wenn die angezeigten Angaben mit dem Auftrag übereinstimmen.</li><li>Kontrolliere nach dem Speichern, ob der neue Status sichtbar ist.</li></ol>
 <p><b>Beispiel:</b> Eine Bestellung ist neu eingegangen. Prüfe zuerst, welcher Kunde zugeordnet ist und welche Produkte bestellt wurden. Nimm sie erst an, wenn du sie tatsächlich bearbeitest, und setze den Status danach entsprechend dem realen Stand.</p>
 <p><b>Fehlerbehebung:</b> Fehlt der Kunde, prüfe die Kundenauswahl und wähle den passenden vorhandenen Kunden aus. Stimmen Produkt oder Menge nicht, buche nicht blind weiter, sondern kläre die Angaben vor Abschluss. Wird eine Änderung nicht angezeigt, warte kurz und lade die Seite neu. Vermeide wiederholtes Klicken auf Speichern.</p>
 <p><b>Wichtig:</b> Diese Anleitung legt keine zusätzlichen Status oder Aktionen fest. Maßgeblich sind die Optionen, die in der Website tatsächlich angezeigt werden.</p>`},
 {id:"customers",title:"Kunden",tags:"kunde kunden anlegen suchen rabatt",body:`
 <ol><li>Öffne <b>Kunden</b>.</li><li>Suche zunächst, ob der Kunde bereits angelegt ist, um doppelte Datensätze zu vermeiden.</li><li>Wenn die Website eine Neuanlage anbietet, erfasse die erforderlichen Kundendaten sorgfältig und speichere sie.</li><li>Prüfe Schreibweise und Kontaktdaten nach dem Speichern.</li><li>Wenn ein Kundenrabatt hinterlegt ist, prüfe den angezeigten Prozentsatz, bevor du einen rabattabhängigen Vorgang buchst.</li></ol>
 <p>Bei Bestellungen und Verkäufen ist die richtige Kundenzuordnung wichtig. Verwende keinen ähnlich klingenden Kundeneintrag, wenn die Identität nicht eindeutig ist.</p>
 <p><b>Fehlerbehebung:</b> Kunde nicht auffindbar? Prüfe alternative Schreibweisen. Besteht Unsicherheit, ob zwei Einträge dieselbe Person bzw. denselben Geschäftspartner betreffen, kläre das vor einer Neuanlage.</p>`},
 {id:"inventory",title:"Lager",tags:"lager bestand artikel menge einheit mindestbestand",body:`
 <ol><li>Öffne <b>Lager</b>, um die vorhandenen Artikel und ihre Bestände einzusehen.</li><li>Prüfe Artikelname, Einheit, Menge und gegebenenfalls Einkaufs- und Verkaufspreis.</li><li>Erfasse Änderungen nur über den dafür vorgesehenen Vorgang, etwa Einkauf, Verkauf oder eine erlaubte Artikelverwaltung.</li><li>Kontrolliere nach einem gebuchten Vorgang, ob der Bestand plausibel aktualisiert wurde.</li></ol>
 <p><b>Grundregel:</b> Lagerbestände müssen die tatsächlichen Warenbewegungen widerspiegeln. Erfinde keine Korrekturmenge und buche eine Lieferung oder einen Verkauf nicht doppelt.</p>
 <p><b>Fehlerbehebung:</b> Ist der Bestand unerwartet niedrig oder verändert, prüfe die zugehörigen Einkäufe, Verkäufe und Produktionsbuchungen. Bei unklaren Abweichungen pausierst du weitere Buchungen für den betroffenen Artikel und meldest den Sachverhalt der Führungskraft.</p>`},
 {id:"purchase",title:"Einkauf",tags:"einkauf lieferant ware eingang einkaufsrechnung",body:`
 <ol><li>Öffne <b>Einkauf</b> und starte den dort vorgesehenen Einkaufsvorgang.</li><li>Prüfe die tatsächlich erhaltene Ware, den Artikel, die Menge und den Gesamtbetrag.</li><li>Trage die Angaben in die passenden Felder ein und kontrolliere sie vor dem Speichern.</li><li>Speichere den Vorgang einmal und prüfe anschließend die angezeigte Buchung sowie den Lagerbestand.</li><li>Wenn eine Rechnung oder ein weiterer Handelsnachweis vorgesehen ist, prüfe diesen im Menü <b>Rechnungen</b>.</li></ol>
 <p><b>Beispiel:</b> Es kommen 12 Flaschen an. Erfasse nur die tatsächlich gelieferten 12 Flaschen und die passende Einheit; eine bestellte, aber nicht gelieferte Menge darf nicht als Wareneingang gebucht werden.</p>
 <p><b>Fehlerbehebung:</b> Falscher Artikel oder falsche Menge? Nicht durch eine zweite Gegenbuchung „auf Verdacht“ korrigieren. Prüfe, ob der Vorgang bereits gespeichert wurde, und wende dich bei einer falschen Buchung an die zuständige Führungskraft.</p>`},
 {id:"sales",title:"Verkauf",tags:"verkauf kunde lieferung produkt preis rabatt provision",body:`
 <ol><li>Öffne <b>Verkauf</b> und wähle die angebotene Verkaufs- oder Lieferaktion.</li><li>Wähle den zuständigen Mitarbeiter, sofern das Formular danach fragt.</li><li>Wähle den richtigen Kunden. „Privatkunde“ kann als Standard vorausgewählt sein; kontrolliere deshalb die Kundenauswahl bewusst.</li><li>Wähle das Produkt und gib die tatsächliche Menge ein.</li><li>Prüfe den Preis vor Rabatt und den angezeigten Endbetrag nach einem hinterlegten Kundenrabatt.</li><li>Speichere den Vorgang erst, wenn Produkt, Menge, Kunde und Betrag stimmen.</li><li>Prüfe danach Lagerbestand, Handelsnachweis und gegebenenfalls Provision.</li></ol>
 <p><b>Beispiel:</b> Der reguläre Gesamtpreis beträgt 100,00 $ und der ausgewählte Kunde hat 10 % Rabatt. Der erwartete Endbetrag ist 90,00 $. Prüfe, dass der richtige Kunde ausgewählt wurde und der angezeigte Endbetrag passt.</p>
 <p><b>Fehlerbehebung:</b> Bei „Nicht genügend Bestand“ die Menge und den aktuellen Lagerbestand prüfen. Bei einem Hinweis, dass der Endbetrag nicht zum Rabatt passt, Kunde, Rabatt und Preis vor Rabatt kontrollieren. Speichere nicht mehrfach, nur weil die Anzeige kurz verzögert ist.</p>`},
 {id:"invoices",title:"Rechnungen",tags:"rechnung handelsnachweis verkauf einkauf offen provision teilen",body:`
 <ol><li>Öffne <b>Rechnungen</b>. Hier werden die vorhandenen Handelsvorgänge mit Nummer, Art, Handelspartner, Mitarbeiter, Provision, Datum und Status angezeigt.</li><li>Prüfe Rechnungsnummer, Art und Handelspartner, bevor du eine Rechnung öffnest oder teilst.</li><li>Nutze „Teilen“, wenn du den angezeigten Rechnungsnachweis weitergeben musst.</li><li>Nutze „Bearbeiten“ nur, wenn du berechtigt bist und die Korrektur sachlich begründet ist.</li><li>„Löschen“ ist eine weitreichende Aktion: Nutze sie nicht, um eine unklare Buchung schnell zu beseitigen. Kläre vorher, ob sie wirklich entfernt werden muss.</li><li>Prüfe den Status nach jeder Änderung.</li></ol>
 <p><b>Offen bedeutet:</b> Die Rechnung ist in der Anwendung als „Offen“ gekennzeichnet. Verändere den Status nicht ohne einen tatsächlichen, nachvollziehbaren Grund.</p>
 <p><b>Fehlerbehebung:</b> Fehlt eine Rechnung, prüfe zuerst, ob der zugehörige Handelsvorgang gespeichert wurde und ob du die erforderliche Berechtigung hast. Bei falschem Partner, Betrag oder Mitarbeiter die Daten vor jeder Änderung sorgfältig prüfen.</p>`},
 {id:"cash",title:"Kasse",tags:"kasse einnahme ausgabe betrag kassenbuch kategorien",body:`
 <ol><li>Öffne <b>Kasse</b>.</li><li>Wähle die passende Buchungsart: Einnahme oder Ausgabe.</li><li>Wähle eine passende Kategorie, zum Beispiel Weinverkauf, Trauben, Material, Lohn, Betriebskosten oder Sonstiges.</li><li>Trage den tatsächlichen Betrag größer als null ein und ergänze eine klare Beschreibung.</li><li>Prüfe Art, Kategorie, Betrag und Beschreibung vor dem Speichern.</li><li>Kontrolliere anschließend, ob die Buchung in der Kassenübersicht erscheint.</li></ol>
 <p><b>Beispiel:</b> Für eine tatsächlich bezahlte betriebliche Ausgabe von 25,00 $ wählst du „Ausgabe“, die passende Kategorie und 25,00 $ als Betrag. Die Beschreibung soll den Zweck erkennen lassen.</p>
 <p><b>Fehlerbehebung:</b> Das Formular akzeptiert keinen Betrag? Prüfe, ob der Betrag größer als null ist. Eine Einnahme darf nicht als Ausgabe gebucht werden. Bei einer bereits gespeicherten Fehlbuchung nicht einfach eine zweite Buchung erstellen, ohne die Korrektur mit der Führungskraft abzustimmen.</p>`},
 {id:"employees",title:"Mitarbeiter und Rollen",tags:"mitarbeiter passwort rolle zugang löschen wechseln",body:`
 <ol><li>Öffne <b>Mitarbeiter</b>, sofern deine Rolle den Menüpunkt sehen darf.</li><li>Bei einer Neuanlage werden Name, Rolle und ein Passwort benötigt. Das Passwort muss mindestens 8 Zeichen lang sein.</li><li>Bei einer Änderung kannst du das Passwort leer lassen, wenn es unverändert bleiben soll.</li><li>Vergib nur die Rolle, die für die tatsächlichen Aufgaben benötigt wird. Die verfügbaren Rollen hängen von deiner eigenen Berechtigung ab.</li><li>Beim Löschen eines Mitarbeiters wird dessen Zugang gesperrt. Historische Rechnungen und Buchungen bleiben laut Systemhinweis erhalten.</li></ol>
 <p><b>Sicherheit:</b> Zugangsdaten sind persönlich. Teile keine Passwörter im Teamchat. Wenn ein Zugang kompromittiert sein könnte, informiere sofort die zuständige Führungskraft.</p>
 <p><b>Fehlerbehebung:</b> Du kannst eine Funktion nicht sehen? Das kann an deiner Rolle liegen und ist nicht automatisch ein Fehler. Bitte eine berechtigte Führungskraft um Prüfung, statt einen anderen Mitarbeiterzugang zu verwenden.</p>`},
 {id:"appointments",title:"Termine",tags:"termine kalender terminverwaltung",body:`
 <p>Öffne <b>Termine</b> und nutze die dort tatsächlich angebotenen Funktionen, um Termine einzusehen oder zu verwalten. Prüfe Datum, Uhrzeit und Beschreibung vor dem Speichern und kontrolliere nach einer Änderung, ob die aktualisierten Angaben sichtbar sind.</p>
 <p>Diese Anleitung erfindet keine zusätzlichen Kalenderaktionen: Welche Felder und Schaltflächen verfügbar sind, richtet sich nach der aktuell angezeigten Terminmaske.</p>
 <p><b>Fehlerbehebung:</b> Bei einem falschen Datum oder einer unklaren Zuordnung vor dem Speichern abbrechen und die Angaben klären. Wird ein Termin nicht angezeigt, prüfe den Zeitraum und lade die Seite einmal neu.</p>`},
 {id:"commission",title:"Provision",tags:"provision mitarbeiter anteil verkauf rechnung",body:`
 <p>Öffne <b>Provision</b>, um die für dich freigegebenen Provisionsinformationen einzusehen. Rechnungen können Provisionssatz und Provisionsbetrag ausweisen; kontrolliere bei Rückfragen den zugrunde liegenden Handelsvorgang, den zugeordneten Mitarbeiter und den ausgewiesenen Satz.</p>
 <ol><li>Öffne den passenden Eintrag.</li><li>Prüfe Mitarbeiter, Rechnungsart, Betrag und Provisionssatz.</li><li>Vergleiche die Angaben mit dem zugrunde liegenden Vorgang.</li><li>Melde Abweichungen an die zuständige Führungskraft, bevor eine Korrektur vorgenommen wird.</li></ol>
 <p>Erfinde oder ändere keine Provisionsregel. Maßgeblich sind die im System hinterlegten Werte und die betrieblichen Vereinbarungen.</p>`},
 {id:"errors",title:"Allgemeine Fehlerbehebung",tags:"fehler laden speichern doppelt internet berechtigung",body:`
 <ul><li><b>Seite lädt nicht:</b> Prüfe die Internetverbindung und lade die Website einmal neu.</li><li><b>Du wirst abgemeldet:</b> Melde dich erneut mit deinem eigenen Mitarbeiternamen und Passwort an.</li><li><b>Menü fehlt:</b> Prüfe, ob du mit dem richtigen Mitarbeiterkonto angemeldet bist. Menüs sind rollenabhängig.</li><li><b>Speichern schlägt fehl:</b> Lies die Fehlermeldung, kontrolliere Pflichtfelder und versuche nicht, den Vorgang mehrfach parallel zu speichern.</li><li><b>Daten scheinen veraltet:</b> Warte kurz auf die Aktualisierung und lade die Seite einmal neu. Prüfe, ob der Vorgang tatsächlich gespeichert wurde, bevor du ihn erneut anlegst.</li><li><b>Bestand, Kasse oder Rechnung weichen ab:</b> Erstelle keine improvisierte Gegenbuchung. Sichere die relevanten Angaben und melde die Abweichung einer berechtigten Führungskraft.</li><li><b>Ungewöhnliche oder kritische Fehlermeldung:</b> Notiere die Seite, den Zeitpunkt und den betroffenen Vorgang. Teile niemals Passwörter oder geheime Schlüssel mit.</li></ul>
 <p><b>Goldene Regel:</b> Erst prüfen, dann buchen. Wenn du nicht sicher bist, ob eine Buchung bereits gespeichert wurde, kontrolliere die Liste, bevor du einen zweiten Versuch startest.</p>`}
 ];
 return '<div class="intro"><div><div class="eyebrow">MITARBEITERHANDBUCH</div><h1>Betriebsanleitung</h1><p>Schritt-für-Schritt-Hilfe für den täglichen Betrieb des Donnerfaust Saloon. Die sichtbaren Menüs und Berechtigungen können je nach Mitarbeiterrolle abweichen.</p></div></div>'+
 '<div class="panel" style="margin-bottom:16px"><label for="manualSearch"><b>Anleitung durchsuchen</b></label><input id="manualSearch" type="search" placeholder="Zum Beispiel: Bestellung, Rabatt, Passwort …" style="width:100%;margin-top:8px"><small class="muted">Suche nach einem Menüpunkt oder Stichwort. Tippe auf einen Abschnitt, um ihn zu öffnen.</small></div>'+
 '<div id="manualSections" class="manual-sections">'+sections.map((x,i)=>'<details class="panel manual-section" data-search="'+esc((x.title+" "+x.tags).toLowerCase())+'" '+(i===0?'open':'')+'><summary style="cursor:pointer;font-weight:700;padding:4px 0">'+esc(x.title)+'</summary><div style="padding-top:14px;line-height:1.65">'+x.body+'</div></details>').join("")+'</div>'+
 '<div class="panel" style="margin-top:16px"><b>Hinweis für alle Mitarbeiter</b><p class="muted">Dieses Handbuch beschreibt die Arbeitsweise anhand der derzeit sichtbaren Menüs und Validierungen. Es ändert keine Systemrechte oder Betriebsfunktionen. Bei Abweichungen zwischen Anleitung und Website gilt die tatsächliche Anzeige; melde die Abweichung der Führungskraft, damit das Handbuch aktualisiert werden kann.</p></div>';
}

function errorBox(t){return '<div class="panel"><b>Fehler</b><p class="muted">'+esc(t)+"</p></div>"}

async function render(){
 if(page==="recipes"||page==="production")page="dashboard";
 let content=page==="dashboard"?await dashboard():page==="invoices"?await invoices():page==="orders"?await orders():page==="customers"?await customers():page==="inventory"?await inventory():page==="recipes"?await recipes():page==="production"?await production():page==="purchase"?await trades("Einkauf"):page==="sales"?await trades("Verkauf"):page==="trades"?await trades("all"):page==="cash"?await cash():page==="employees"?await employees():page==="appointments"?await appointments():page==="commission"?await commissions():page==="manual"?manualGuide():await dashboard();
 shell(content);bind();
 startInventoryRealtime();
 if(page==="orders")startOrderRealtime();else stopOrderRealtime();
}
function bindInventoryRows(){
 $$("[data-owner-customer]").forEach(select=>select.onchange=async()=>{
  if(select.dataset.busy==="1")return;
  select.dataset.busy="1";select.disabled=true;
  const id=select.dataset.ownerCustomer,ownerId=select.value||null;
  try{
   if(!canManageCatalog())throw new Error("Du darfst Produktzuordnungen nicht ändern.");
   const {data:savedOwner,error}=await supabaseClient.from("vineyard_inventory").update({owner_customer_id:ownerId,updated_at:new Date().toISOString(),updated_by:profile?.user_id||null}).eq("id",id).select("id,owner_customer_id").single();
   if(error)throw error;
   if(!savedOwner||String(savedOwner.id)!==String(id)||String(savedOwner.owner_customer_id||"")!==String(ownerId||""))throw new Error("Die Unternehmenszuordnung wurde nicht in der Datenbank gespeichert. Bitte Berechtigungen prüfen.");
   const ownerName=ownerId?select.options[select.selectedIndex]?.text||"Unternehmen":"";
   await auditLog("Produktunternehmen geändert","inventory",id,{owner_customer_id:ownerId,owner_name:ownerName});
   await render();
  }catch(error){alert("Unternehmen konnte nicht gespeichert werden. "+(error?.message||""));select.disabled=false;select.dataset.busy="0";}
 });
 $$("[data-edit-item]").forEach(b=>b.onclick=()=>itemModal(b.dataset.editItem));
 $$("[data-delete-item]").forEach(b=>b.onclick=()=>deleteItem(b.dataset.deleteItem));
 $$("[data-toggle-branded]").forEach(b=>b.onclick=async()=>{
  if(b.dataset.busy==="1")return;
  b.dataset.busy="1";b.disabled=true;
  try{
   if(!canManageCatalog())throw new Error("Du darfst Produkte nicht ändern.");
   const next=b.dataset.branded!=="true";
   const {error}=await supabaseClient.from("vineyard_inventory").update({is_branded:next,updated_at:new Date().toISOString(),updated_by:profile?.user_id||null}).eq("id",b.dataset.toggleBranded).eq("category","Produkte");
   if(error)throw error;
   await auditLog(next?"Produkt als gebrandet markiert":"Branding-Markierung entfernt","inventory",b.dataset.toggleBranded,{is_branded:next});
   await render();
  }catch(error){alert("Branding-Markierung konnte nicht gespeichert werden. "+(error?.message||""));b.disabled=false;b.dataset.busy="0";}
 });
 $$("[data-toggle-availability]").forEach(b=>b.onclick=async()=>{
  if(b.dataset.busy==="1")return;
  const id=b.dataset.toggleAvailability;
  const current=b.dataset.available==="true";
  b.dataset.busy="1";b.disabled=true;
  try{
   await toggleAvailability(id,current);
  }catch(error){
   console.error("Verfügbarkeit konnte nicht geändert werden:",error);
   alert("Die Verfügbarkeit konnte nicht gespeichert werden. "+(error?.message||"Bitte Berechtigung und Verbindung prüfen."));
  }finally{
   b.dataset.busy="0";
   if(document.body.contains(b))b.disabled=false;
  }
 });
}
async function toggleAvailability(id,current){
 if(!canManageCatalog())throw new Error("Du darfst die Verfügbarkeit nicht ändern.");
 const next=!current;
 const {data,error}=await supabaseClient.rpc("vineyard_set_product_availability",{p_inventory_id:id,p_is_available:next});
 if(error)throw error;
 if(!data||data.is_available!==next)throw new Error("Die Datenbank hat die Änderung nicht bestätigt.");
 const removed=Number(data.removed_from_active_orders||0);
 await render();
 alert(next?"Produkt ist jetzt verfügbar.":"Produkt ist nicht mehr verfügbar."+(removed?" "+removed+" Bestellposition(en) wurden aus offenen Bestellungen entfernt.":""));
}
function bind(){
 const manualSearch=$("#manualSearch");
 if(manualSearch)manualSearch.addEventListener("input",()=>{const q=manualSearch.value.trim().toLocaleLowerCase("de");$$(".manual-section").forEach(section=>{const match=!q||section.dataset.search.includes(q)||section.textContent.toLocaleLowerCase("de").includes(q);section.style.display=match?"":"none";if(q&&match)section.open=true;});});
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
 $("#q")?.addEventListener("input",async e=>{const [{data=[]},{data:customers=[]}]=await Promise.all([supabaseClient.from("vineyard_inventory").select("*").order("category").order("item_name"),supabaseClient.from("vineyard_customers").select("id,name,active").order("name")]);const q=e.target.value.toLowerCase();$("#inventoryRows").innerHTML=inventoryRows(data.filter(x=>(x.item_name+" "+x.category+" "+x.unit+" "+(customers.find(c=>String(c.id)===String(x.owner_customer_id))?.name||"")).toLowerCase().includes(q)),customers);bindInventoryRows()});
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
 // Der Details-Button wird zentral per Event-Delegation behandelt (auch nach erneutem Rendern).
  $$("[data-view-order]").forEach(b=>b.onclick=()=>orderModal(b.dataset.viewOrder));
 $$("[data-save-order-customer]").forEach(b=>b.onclick=async()=>{if(b.dataset.busy==="1")return;const id=b.dataset.saveOrderCustomer,select=document.querySelector('[data-order-customer="'+id+'"]');if(!select)return;b.dataset.busy="1";b.disabled=true;try{const {error}=await supabaseClient.rpc("vineyard_assign_order_customer",{p_order_id:id,p_customer_id:select.value||null});if(error)throw error;alert("Kunde zugeordnet; Rabatt und Bestellwert wurden aktualisiert.");await render()}catch(err){alert(err.message||String(err))}finally{b.dataset.busy="0";if(b.isConnected)b.disabled=false}});
 $$("[data-order-status]").forEach(b=>b.onclick=async()=>{if(b.dataset.busy==="1")return;b.dataset.busy="1";b.disabled=true;try{const parts=b.dataset.orderStatus.split("|");if(parts.length!==2||!parts[0]||!parts[1])throw Error("Ungültige Bestellaktion.");await updateOrderStatus(parts[0],parts[1]);}catch(err){console.error("Bestellung aktualisieren:",err);alert(err?.message||String(err));}finally{b.dataset.busy="0";if(b.isConnected)b.disabled=false;}});
 $$("[data-delete-order]").forEach(b=>b.onclick=()=>deleteOrder(b.dataset.deleteOrder)); $$("[data-pay-commission]").forEach(b=>b.onclick=async()=>{if(b.dataset.busy==="1")return;const paymentSource=await new Promise(resolve=>{const root=$("#modalroot");root.innerHTML='<div class="modalback"><div class="modal"><div class="modalhead"><b>Auszahlung verbuchen</b><button type="button" id="commission-source-x">×</button></div><form id="commission-source-form"><label>Auszahlung erfolgt über<select name="payment_source" required><option value="Kasse">Kasse – vom Kassenbestand abziehen</option><option value="Privat">Privat – Kassenbestand bleibt unverändert</option></select></label><div class="actions"><button type="button" class="btn outline" id="commission-source-cancel">Abbrechen</button><button class="btn primary">Weiter</button></div></form></div></div>';const close=()=>{root.innerHTML="";resolve(null)};$("#commission-source-x").onclick=$("#commission-source-cancel").onclick=close;$("#commission-source-form").onsubmit=e=>{e.preventDefault();const value=new FormData(e.target).get("payment_source");root.innerHTML="";resolve(value)}});if(!paymentSource)return;if(!confirm("Provision vollständig als "+paymentSource+" ausgezahlt markieren?"+(paymentSource==="Kasse"?"\n\nDer Betrag wird als Kassenausgabe verbucht.":"\n\nDer Kassenbestand bleibt unverändert.")))return;b.dataset.busy="1";b.disabled=true;try{const r=await supabaseClient.rpc("vineyard_pay_commission",{p_employee_id:b.dataset.payCommission,p_payment_source:paymentSource});if(r.error)throw r.error;alert("Provision von "+money(r.data)+" wurde als "+paymentSource+" ausgezahlt verbucht.");await render()}catch(err){alert(err.message||String(err));b.dataset.busy="";b.disabled=false}});

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
 if(a==="edit-customer"){const id=actionButton?.dataset.customerId;if(!id)throw Error("Kunde konnte nicht ermittelt werden.");await customerModal(id);return}
 if(a==="toggle-customer"){const id=actionButton?.dataset.customerId;if(!id)throw Error("Kunde konnte nicht ermittelt werden.");await toggleCustomer(id,actionButton.dataset.active==="true");return}
 if(a==="newcustomer"){await customerModal();return}
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

function isSellableProduct(item){return item?.category==="Produkte"&&item?.is_available===true;}
function productStar(item){return item?.owner_customer_id?"★ ":"";}

async function itemModal(id){
  if(!canManageCatalog())throw Error("Du darfst keine Lagerartikel anlegen oder Stammdaten bearbeiten.");
 const {data:customers=[],error:customerError}=await supabaseClient.from("vineyard_customers").select("id,name,active").order("name");
 if(customerError)throw customerError;
 let item=null;
 if(id){const {data,error}=await supabaseClient.from("vineyard_inventory").select("*").eq("id",id).single();if(error)throw error;item=data}
 const cat=item?.category||"Produkte";
 const customerOptions=[{value:"",label:"Kein Unternehmen"},...customers.filter(c=>c.active||String(c.id)===String(item?.owner_customer_id||"")).map(c=>({value:c.id,label:c.name}))];
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal"><div class="modalhead"><b>'+(id?"Lagerartikel bearbeiten":"Neuer Lagerartikel")+'</b><button id="x">×</button></div><form id="mf">'+
 field("Artikel / Ressource","item_name","text",item?.item_name||"",true)+
 selectField("Kategorie","category",[{value:"Zutaten",label:"Zutaten"},{value:"Produkte",label:"Produkte"}],cat)+
 '<label id="ownerCustomerWrap">Unternehmen / Kunde<select name="owner_customer_id">'+customerOptions.map(o=>'<option value="'+esc(o.value)+'" '+(String(item?.owner_customer_id||"")===String(o.value)?"selected":"")+'>'+esc(o.label)+'</option>').join("")+'</select><small class="muted">Nur bei Produkten relevant. Ohne Zuordnung wird kein Sternchen angezeigt.</small></label>'+
 field("Einheit","unit","text",item?.unit||"Stück",true)+
 field("Bestand","quantity","number",item?.quantity??0)+
 field("Mindestbestand","min_stock","number",item?.min_stock??0)+
 '<label id="purchaseWrap">Einkaufspreis<input name="purchase_price" type="number" step="0.01" min="0" value="'+esc(item?.purchase_price??0)+'"></label>'+
 '<label id="saleWrap">Verkaufspreis<input name="sale_price" type="number" step="0.01" min="0" value="'+esc(item?.sale_price??0)+'"></label>'+
 '<div class="actions"><button type="button" class="btn outline" id="cancel">Abbrechen</button><button class="btn primary">Speichern</button></div></form></div></div>';
 const close=()=>$("#modalroot").innerHTML="";
 $("#x").onclick=$("#cancel").onclick=close;
 const category=$("#mf [name=category]"),purchase=$("#purchaseWrap"),sale=$("#saleWrap"),ownerWrap=$("#ownerCustomerWrap");
 const updatePrices=()=>{
   const ingredient=category.value==="Zutaten";
   purchase.style.display=ingredient?"":"none";
   sale.style.display=ingredient?"none":"";
   ownerWrap.style.display="";
   $("#ownerCustomerWrap select").disabled=false;
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
    const patch={item_name:v.item_name.trim(),category:v.category,unit:v.unit.trim(),quantity:Number(v.quantity)||0,min_stock:Number(v.min_stock)||0,purchase_price,sale_price,owner_customer_id:(v.owner_customer_id||null),updated_at:new Date().toISOString(),updated_by:profile?.user_id||null};
    if(!id&&!ingredient)patch.is_available=true;
    const r=id?await supabaseClient.from("vineyard_inventory").update(patch).eq("id",id):await supabaseClient.from("vineyard_inventory").insert(patch);
    if(r.error)throw r.error;
    await auditLog(id?"Lagerartikel geändert":"Lagerartikel angelegt","inventory",id||v.item_name,patch);
    close();await render();
   }catch(err){alert(err.message||String(err))}finally{b.disabled=false}
 };
}
async function recipeModal(id){
  if(!canManageRecipes())throw Error("Nur Familienoberhaupt und Familienvogt dürfen Rezepte erstellen oder bearbeiten.");
 const [{data:ingredients=[]},{data:products=[]},recipeResult,itemsResult,{data:customers=[],error:customerError}]=await Promise.all([
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category").order("item_name"),
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category,owner_customer_id").eq("category","Produkte").order("item_name"),
  id?supabaseClient.from("vineyard_recipes").select("*").eq("id",id).single():Promise.resolve({data:null}),
  id?supabaseClient.from("vineyard_recipe_items").select("inventory_id,quantity").eq("recipe_id",id).order("created_at"):Promise.resolve({data:[]}),
  supabaseClient.from("vineyard_customers").select("id,name,active").order("name")
 ]);
 const recipe=recipeResult.data, existing=itemsResult.data||[];
 if(customerError)throw customerError;
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
 '<label>Unternehmen / Kunde<select name="output_owner_customer_id"><option value="">Kein Unternehmen</option>'+customers.filter(c=>c.active||String(c.id)===String(products.find(p=>String(p.id)===String(recipe?.output_inventory_id||products[0].id))?.owner_customer_id||"")).map(c=>'<option value="'+esc(c.id)+'" '+(String(c.id)===String(products.find(p=>String(p.id)===String(recipe?.output_inventory_id||products[0].id))?.owner_customer_id||"")?"selected":"")+'">'+esc(c.name)+'</option>').join("")+'</select><small class="muted">Die Zuordnung wird am Produkt gespeichert und steuert das Sternchen in Bestellungen und Verkäufen.</small></label>'+
 field("Produzierte Menge pro Produktion","output_quantity","number",recipe?.output_quantity??1,true)+
 '<div class="recipeformhead"><b>Zutaten</b><button type="button" class="mini gold" id="addingredient">+ Zutat</button></div><div id="recipeitemsform"></div>'+
 '<div class="actions"><button type="button" class="btn outline" id="cancel">Abbrechen</button><button class="btn primary">Speichern</button></div></form></div></div>';

 const close=()=>$("#modalroot").innerHTML="";
 $("#x").onclick=$("#cancel").onclick=close;
 $("#recipeform [name=output_inventory_id]").onchange=e=>{
  const product=products.find(p=>String(p.id)===String(e.target.value));
  const ownerSelect=$("#recipeform [name=output_owner_customer_id]");
  if(ownerSelect)ownerSelect.value=product?.owner_customer_id||"";
 };

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

   const ownerId=e.target.output_owner_customer_id.value||null;
   const ownerUpdate=await supabaseClient.from("vineyard_inventory").update({owner_customer_id:ownerId,updated_at:new Date().toISOString(),updated_by:profile?.user_id||null}).eq("id",output_inventory_id).select("id,owner_customer_id").single();
   if(ownerUpdate.error)throw ownerUpdate.error;
   if(!ownerUpdate.data||String(ownerUpdate.data.owner_customer_id||"")!==String(ownerId||""))throw Error("Unternehmen/Kunde konnte nicht am Produkt gespeichert werden.");

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
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category,purchase_price,sale_price,is_available,owner_customer_id").order("category").order("item_name"),
  id?supabaseClient.from("vineyard_invoices").select("id,invoice_type,partner_name,status,employee_id,commission_rate,commission_amount,customer_id").eq("id",id).single():Promise.resolve({data:null}),
  supabaseClient.rpc("vineyard_order_employees"),
  supabaseClient.from("vineyard_customers").select("id,name,discount_percent,active").order("name")
 ]);
 if(error)throw error;
 if(ee)throw ee;
 if(ce)throw ce;
 if(id&&!existingInvoice)throw Error("Rechnung nicht gefunden.");
 if(!inventory.length)throw Error("Lege zuerst Artikel im Lager an. Nur dort hinterlegte Artikel können auf Rechnungen ausgewählt werden.");
 const typeOptions=[
  {value:"Verkauf",label:"🛒 Verkauf · Einnahme bei Zahlung"},
  {value:"Einkauf",label:"📦 Einkauf · Ausgabe bei Zahlung"}
 ];
 let existingItems=[];
 if(id){
  const {data:its,error:ie}=await supabaseClient.from("vineyard_invoice_items").select("inventory_id,quantity,unit_price").eq("invoice_id",id).order("created_at");
  if(ie)throw ie;
  existingItems=its||[];
 }
 const sellableInventory=inventory.filter(isSellableProduct);
 const initialInvoiceType=existingInvoice?.invoice_type||"Verkauf";
 const initialInventory=(initialInvoiceType==="Verkauf"?sellableInventory:inventory)[0]||inventory[0];
 const rows=existingItems.length?existingItems.map(x=>({inventory_id:x.inventory_id,quantity:x.quantity,unit_price:x.unit_price})):[{inventory_id:initialInventory.id,quantity:1,unit_price:0}];
 const defaultPrice=(item,type)=>type==="Einkauf"?Number(item?.purchase_price||0):Number(item?.sale_price||0);
 const defaultEmployee=existingInvoice?.employee_id||profile.user_id;
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal invoiceModal"><div class="modalhead"><b>'+(id?"Rechnung bearbeiten":"Neue Rechnung")+'</b><button id="x">×</button></div><form id="invoiceform">'+
 selectField("Handelsvorgang","invoice_type",typeOptions,existingInvoice?.invoice_type||"Verkauf")+
 selectField("Mitarbeiter / Provision","employee_id",employees.map(x=>({value:x.user_id,label:x.display_name})),defaultEmployee)+
 selectField("Status","status",[{value:"Offen",label:"Offen"},{value:"Bezahlt",label:"Bezahlt"},{value:"Storniert",label:"Storniert"}],existingInvoice?.status||"Offen")+
 selectField("KUNDE","customer_id",[{value:"",label:"Privatkunde"},...customerRows.filter(k=>k.active).map(k=>({value:k.id,label:k.name+" (−"+Number(k.discount_percent||0).toLocaleString("de-DE")+" %)"}))],existingInvoice?.customer_id||"")+ 
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
 const commissionRate=type=>type==="Verkauf"?20:0;
 const draw=()=>{
  const invoiceInventory=typeEl.value==="Verkauf"?sellableInventory:inventory;
  $("#invoiceitemsform").innerHTML=rows.map((r,n)=>'<div class="invoiceformrow"><select data-ii="'+n+'" class="invoiceitem">'+invoiceInventory.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===r.inventory_id?"selected":"")+'>'+ productStar(x)+esc(x.item_name)+' · '+esc(x.unit)+'</option>').join("")+'</select><input data-iq="'+n+'" class="invoicequantity" type="number" min="0.0001" step="any" value="'+esc(r.quantity)+'" required><input data-ip="'+n+'" class="invoiceprice" type="number" min="0" step="0.01" value="'+esc(r.unit_price)+'" required><button type="button" class="mini" data-remove-ii="'+n+'">×</button></div>').join("");
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
  $$(".invoiceitem").forEach(s=>s.onchange=()=>{const n=Number(s.dataset.ii),item=inventory.find(x=>x.id===s.value);rows[n].inventory_id=s.value;rows[n].unit_price=defaultPrice(item,typeEl.value);$$("[data-ip='"+n+"']").value=rows[n].unit_price.toFixed(2);refresh()});
  $$(".invoicequantity").forEach(i=>i.oninput=refresh);
  $$(".invoiceprice").forEach(i=>i.oninput=refresh);
  $$(".invoicequantity").forEach(i=>i.onchange=()=>rows[Number(i.dataset.iq)].quantity=Number(i.value));
  $$(".invoiceprice").forEach(i=>i.onchange=()=>rows[Number(i.dataset.ip)].unit_price=Number(i.value));
  $$(".invoiceitem").forEach(s=>{const n=Number(s.dataset.ii);if(!rows[n].unit_price){const item=inventory.find(x=>x.id===s.value);rows[n].unit_price=defaultPrice(item,typeEl.value);$$("[data-ip='"+n+"']").value=rows[n].unit_price.toFixed(2)}});
  $$(".invoiceformrow [data-remove-ii]").forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.removeIi),1);if(!rows.length)rows.push({inventory_id:inventory[0].id,quantity:1,unit_price:defaultPrice(inventory[0],typeEl.value)});draw()});
  refresh();
 };
 $("#addinvoiceitem").onclick=()=>{const source=(typeEl.value==="Verkauf")?sellableInventory:inventory;const item=source[0];if(!item){alert("Für diesen Vorgang sind aktuell keine verfügbaren Artikel vorhanden.");return}rows.push({inventory_id:item.id,quantity:1,unit_price:defaultPrice(item,typeEl.value)});draw()};
 typeEl.onchange=()=>{const source=(typeEl.value==="Verkauf")?sellableInventory:inventory;rows.forEach(r=>{if((typeEl.value==="Verkauf"||typeEl.value==="Bestellung")&&!source.some(x=>String(x.id)===String(r.inventory_id))){r.inventory_id=source[0]?.id||""}const item=inventory.find(x=>String(x.id)===String(r.inventory_id));r.unit_price=defaultPrice(item,typeEl.value)});draw()};
 rows[0].unit_price=defaultPrice(inventory[0],existingInvoice?.invoice_type||"Verkauf");draw();
 $("#invoiceform").onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  try{
   rows.forEach((r,n)=>{r.quantity=Number($("[data-iq='"+n+"']").value);r.unit_price=Number($("[data-ip='"+n+"']").value)});
   if(!rows.length||rows.some(r=>!r.inventory_id||!Number.isFinite(r.quantity)||r.quantity<=0||!Number.isFinite(r.unit_price)||r.unit_price<0))throw Error("Bitte Positionen, Mengen und Preise prüfen.");
   const partner=e.target.partner_name.value.trim();
   if(!partner)throw Error("Bitte einen Handelspartner angeben.");
   const rate=commissionRate(typeEl.value);
   if(rate&&!employeeEl.value)throw Error("Für Verkaufsrechnungen muss ein Mitarbeiter ausgewählt werden.");
   const r=await supabaseClient.rpc("vineyard_save_invoice",{p_invoice_id:id||null,p_type:typeEl.value,p_partner_name:partner,p_status:statusEl.value,p_employee_id:employeeEl.value||null,p_items:rows});
   if(r.error)throw r.error;
   const savedInvoiceId=id||r.data?.id;
   if(savedInvoiceId){const {error:customerSaveError}=await supabaseClient.from("vineyard_invoices").update({customer_id:customerEl.value||null}).eq("id",savedInvoiceId);if(customerSaveError)throw customerSaveError;}
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
  const oldQuantity=Number(item.quantity);
  const {error}=await supabaseClient.rpc("vineyard_adjust_inventory",{p_inventory_id:v.inventory_id,p_delta:delta,p_reason:reason});
  if(error)throw error;
  const {data:updatedItem,error:stockReadError}=await supabaseClient.from("vineyard_inventory").select("quantity").eq("id",v.inventory_id).single();
  if(stockReadError)throw stockReadError;
  const newQuantity=Number(updatedItem.quantity);
  await auditLog(v.mode==="in"?"Lagerzugang gebucht":"Lagerausgang gebucht","inventory",v.inventory_id,{item_name:item.item_name,quantity:amount,unit:item.unit,old_quantity:oldQuantity,new_quantity:newQuantity,delta,employee_id:employee.user_id,employee_name:employee.display_name,reason:(v.reason||"").trim()});
 });
}

async function tradeModal(id,defaultType=null){
 const [{data:items=[],error:ie},{data:existing,error:te},{data:customerRows=[],error:ce},{data:employees=[],error:ee}]=await Promise.all([
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,category,purchase_price,sale_price,quantity,is_available,owner_customer_id").order("category").order("item_name"),
  id?supabaseClient.from("vineyard_trades").select("*").eq("id",id).single():Promise.resolve({data:null,error:null}),
  supabaseClient.from("vineyard_customers").select("id,name,discount_percent,active").order("name"),
  supabaseClient.rpc("vineyard_order_employees")
 ]);
 if(ie)throw ie;if(te)throw te;if(ce)throw ce;if(ee)throw ee;
 if(id&&!existing)throw Error("Handelsvorgang nicht gefunden.");
 const type=existing?.trade_type||defaultType||"Einkauf";
 const initialItems=type==="Einkauf"?items:items.filter(isSellableProduct);
 if(!initialItems.length)throw Error(type==="Einkauf"?"Lege zuerst mindestens eine Zutat mit Einkaufspreis im Lager an.":"Lege zuerst mindestens ein verfügbares Produkt im Lager an.");
 const optionsFor=t=>t==="Einkauf"?items:items.filter(isSellableProduct);
 const optionHtml=(t,selected)=>optionsFor(t).map(x=>'<option value="'+esc(x.id)+'" '+(String(selected)===String(x.id)?"selected":"")+'>'+(x.owner_customer_id?"★ ":"")+esc(x.item_name)+' · '+esc(x.unit)+'</option>').join("");
 const customerOptions=[{value:"",label:"Privatkunde"},...customerRows.filter(k=>k.active).map(k=>({value:k.id,label:k.name+" (−"+Number(k.discount_percent||0).toLocaleString("de-DE")+" %)"}))];
 $("#modalroot").innerHTML='<div class="modalback"><div class="modal tradeModal"><div class="modalhead"><b>'+(id?"Ein-/Verkauf bearbeiten":"Ein- und Verkauf")+'</b><button type="button" id="x">×</button></div><form id="tradeform">'+
 selectField("Ein- oder Verkauf","trade_type",[{value:"Einkauf",label:"Einkauf"},{value:"Verkauf",label:"Verkauf"}],type)+
 (type==="Verkauf"?selectField("KUNDE","customer_id",customerOptions,existing?.customer_id||""):"")+
 '<div id="tradeEmployeeWrap" style="display:'+(type==="Verkauf"?"block":"none")+'">'+selectField("Mitarbeiter","employee_id",[{value:"",label:"Mitarbeiter auswählen…"},...employees.map(x=>({value:x.user_id,label:x.display_name}))],existing?.employee_id||profile?.user_id||"")+'</div>'+
 '<div id="tradeItems"></div><div class="actions" id="tradeAddWrap" style="justify-content:flex-start"><button type="button" class="btn outline" id="addTradeItem">＋ Weiteren Artikel hinzufügen</button></div>'+
 '<div class="tradeprice"><div><span>GESAMTSUMME</span><b id="tradeTotal">'+money(existing?.total||0)+'</b><small id="tradeUnitPrice"></small></div><div class="tradeformula" id="tradeFormula"></div></div>'+
 '<div class="actions"><button type="button" class="btn outline" id="cancel">Abbrechen</button><button type="submit" class="btn primary">Buchen</button></div></form></div></div>';
 const close=()=>$("#modalroot").innerHTML="";
 $("#x").onclick=$("#cancel").onclick=close;
 const typeEl=$("#tradeform [name=trade_type]"),itemsWrap=$("#tradeItems"),totalEl=$("#tradeTotal"),unitEl=$("#tradeUnitPrice"),formulaEl=$("#tradeFormula"),addWrap=$("#tradeAddWrap");
 const rowHtml=(selectedId,quantity=1)=>'<div class="trade-item-row" style="display:grid;grid-template-columns:minmax(0,2fr) minmax(85px,1fr) auto;gap:10px;align-items:end;margin:12px 0;padding:12px;border:1px solid var(--line,#444);border-radius:12px"><label>Artikel<select class="trade-item-select">'+optionHtml(typeEl.value,selectedId)+'</select></label><label>Menge<input class="trade-item-qty" type="number" min="0.01" step="any" value="'+esc(quantity)+'" required></label><button type="button" class="mini remove-trade-item" aria-label="Artikel entfernen">✕</button><small class="trade-item-total" style="grid-column:1/-1"></small></div>';
 const addRow=(selectedId=null,quantity=1)=>{const wrap=document.createElement("div");wrap.innerHTML=rowHtml(selectedId||optionsFor(typeEl.value)[0]?.id||"",quantity);const row=wrap.firstElementChild;itemsWrap.appendChild(row);row.querySelector(".trade-item-select").onchange=updatePrice;row.querySelector(".trade-item-qty").oninput=updatePrice;row.querySelector(".remove-trade-item").onclick=()=>{if(itemsWrap.children.length===1)return alert("Mindestens ein Artikel muss enthalten sein.");row.remove();updatePrice()};updatePrice()};
 const updatePrice=()=>{
  let total=0;const summaries=[];
  [...itemsWrap.querySelectorAll(".trade-item-row")].forEach(row=>{
   const item=items.find(x=>String(x.id)===String(row.querySelector(".trade-item-select").value));
   const qty=Number(row.querySelector(".trade-item-qty").value)||0;
   const price=item?(typeEl.value==="Einkauf"?Number(item.purchase_price||0):Number(item.sale_price||0)):0;
   const line=Math.round(price*qty*100)/100;total+=line;
   row.querySelector(".trade-item-total").textContent=item?qty.toLocaleString("de-DE")+" × "+money(price)+" = "+money(line):"";
   if(item)summaries.push(item.item_name+": "+qty.toLocaleString("de-DE")+" "+item.unit);
  });
  total=Math.round(total*100)/100;totalEl.textContent=money(total);
  unitEl.textContent=typeEl.value==="Einkauf"?"Zugang zum Lager":"Abgang aus dem Lager";
  formulaEl.textContent=summaries.join(" · ");
 };
 const refreshType=()=>{
  const wrap=$("#tradeEmployeeWrap");if(wrap)wrap.style.display=typeEl.value==="Verkauf"?"block":"none";
  const customer=$("#tradeform [name=customer_id]");if(typeEl.value==="Verkauf"&&!customer){const label=document.createElement("div");label.innerHTML=selectField("KUNDE","customer_id",customerOptions,"");wrap.before(label.firstElementChild)}
  if(typeEl.value!=="Verkauf")$("#tradeform [name=customer_id]")?.closest("label")?.remove();
  itemsWrap.innerHTML="";addRow();addWrap.style.display=id?"none":"flex";$("#addTradeItem").style.display=id?"none":"inline-flex";updatePrice();
 };
 typeEl.onchange=refreshType;
 $("#addTradeItem").onclick=()=>addRow();
 if(existing)addRow(existing.inventory_id,existing.quantity);else addRow();
 if(id){addWrap.style.display="none";$("#addTradeItem").style.display="none"}
 updatePrice();
 $("#tradeform").onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  try{
   const rows=[...itemsWrap.querySelectorAll(".trade-item-row")].map(row=>({inventory_id:row.querySelector(".trade-item-select").value,quantity:Number(row.querySelector(".trade-item-qty").value)}));
   if(!rows.length)throw Error("Bitte mindestens einen Artikel hinzufügen.");
   if(rows.some(x=>!x.inventory_id||!Number.isFinite(x.quantity)||x.quantity<=0))throw Error("Bitte für alle Artikel eine gültige Menge angeben.");
   if(typeEl.value==="Verkauf"&&!$("#tradeform [name=employee_id]")?.value)throw Error("Bitte den Mitarbeiter auswählen, dem die Provision zugeordnet werden soll.");
   const employeeId=$("#tradeform [name=employee_id]")?.value||"";
   const customerId=$("#tradeform [name=customer_id]")?.value||null;
   if(id&&rows.length!==1)throw Error("Beim Bearbeiten eines bestehenden Handelsvorgangs kann nur ein Artikel geändert werden. Für mehrere Artikel bitte einen neuen Vorgang anlegen.");
   const savedIds=[];
   for(const item of rows){
    const rpc=id?"vineyard_update_trade":"vineyard_create_trade";
    const args=id?{p_trade_id:id,p_trade_type:typeEl.value,p_inventory_id:item.inventory_id,p_quantity:item.quantity}:{p_trade_type:typeEl.value,p_inventory_id:item.inventory_id,p_quantity:item.quantity};
    const {data:tradeSaved,error}=await supabaseClient.rpc(rpc,args);if(error)throw error;
    const tradeId=id?(tradeSaved?.trade_id||id):(tradeSaved?.trade_id||tradeSaved?.id);
    if(!tradeId)throw Error("Der Handelsvorgang wurde gespeichert, aber die Rückgabe enthielt keine Vorgangsnummer.");
    savedIds.push(tradeId);
    if(typeEl.value==="Verkauf"){
     const {error:assignError}=await supabaseClient.rpc("vineyard_assign_trade_commission",{p_trade_id:tradeId,p_employee_id:employeeId,p_customer_id:customerId});
     if(assignError)throw Error("Verkauf "+tradeId+" wurde gespeichert, aber die Provision konnte nicht zugeordnet werden: "+assignError.message);
    }else if(id&&existing?.trade_type==="Verkauf"){
     const {error:clearError}=await supabaseClient.from("vineyard_trades").update({employee_id:null,commission_rate:0,commission_amount:0,customer_id:null}).eq("id",id);
     if(clearError)throw clearError;
    }
   }
   await auditLog(id?"Ein-/Verkauf geändert":"Ein-/Verkauf gebucht","trade",savedIds[0]||null,{trade_type:typeEl.value,items:rows,trade_ids:savedIds});
   close();await render();
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
  supabaseClient.from("vineyard_inventory").select("id,item_name,unit,quantity,sale_price,owner_customer_id").eq("category","Produkte").order("item_name"),
  supabaseClient.from("vineyard_customers").select("id,name,discount_percent").eq("active",true).order("name")
 ]);
 if(ee)throw ee;if(ie)throw ie;if(ce)throw ce;
 if(!employees.length)throw Error("Keine aktiven Mitarbeiter verfügbar.");
 if(!products.length)throw Error("Lege zuerst mindestens ein Produkt im Lager an.");
 const employeeOptions=employees.map(x=>({value:x.user_id,label:x.display_name}));
 const productOptions=products.map(x=>{const owner=customersList.find(c=>String(c.id)===String(x.owner_customer_id));return {value:x.id,label:productStar(x)+x.item_name}});
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
  const event={
   actor_id:profile.user_id,
   actor_name:profile.display_name||"",
   action:String(action||"Aktion"),
   entity:String(entity||"Website"),
   entity_id:entityId==null?null:String(entityId),
   details:d,
   occurred_at:new Date().toISOString()
  };
  const {error}=await supabaseClient.from("vineyard_audit_log").insert({
   actor_id:event.actor_id,action:event.action,entity:event.entity,entity_id:event.entity_id,details:d
  });
  if(error){
   console.warn("Audit-Log konnte nicht gespeichert werden:",error.message);
   return;
  }
  // Discord is an additional audit destination only; it must never block or repeat a business transaction.
  const session=sessionStorage.getItem("vineyard_employee_session")||"";
  if(session){
   fetch(SUPABASE_URL+"/functions/v1/vineyard-discord-audit",{
    method:"POST",
    headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY,"x-employee-session":session},
    body:JSON.stringify(event),
    keepalive:true
   }).then(async response=>{
    if(!response.ok)console.warn("Discord-Audit konnte nicht zugestellt werden:",response.status);
   }).catch(err=>console.warn("Discord-Audit:",err));
  }
 }catch(err){console.warn("Audit-Log:",err)}
}
function showBootError(err){
 console.error("Donnerfaust Saloon Startfehler:",err);
 document.body.innerHTML='<div class="login"><div class="loginbox"><div class="loginbrand"><div class="brandmark"><img src="./assets/donnerfaust-saloon-logo.svg" alt="Donnerfaust Saloon"></div><h1>Donnerfaust Saloon</h1><p>Die Anwendung konnte nicht gestartet werden.</p></div><div class="error">Technischer Fehler beim Start.<br><small>'+esc(err?.message||String(err))+'</small></div><button class="btn primary" onclick="location.reload()">Erneut versuchen</button></div></div>';
}
init().catch(showBootError);
