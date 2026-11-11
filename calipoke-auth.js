/* ============================================================
   CALIPOKE AUTH — shared sign-in for every Calipokehouse app
   ------------------------------------------------------------
   One line in each app, after the Firebase compat scripts:
     <script src="https://r-alib.github.io/calipoke-admin/calipoke-auth.js"></script>
   then, once the page is ready:
     CPAuth.init({ app:'station', header:'#appHeader', onReady:user=>{ ... start the app ... } });

   • Accounts live in Firebase Authentication of the calipoke-packstation project
     (email + password). Profiles / roles: packstation/users/{uid}. Activity: packstation/activity.
   • Every app on the same domain (r-alib.github.io) shares the session automatically —
     sign in once, open any other app without signing in again.
   • CPAuth.user            → {uid, email, name, role, roleLabel}
   • CPAuth.can('feature')  → true/false by the role matrix below (admin → everything)
   • CPAuth.log(action, {text, item, qty, loc, ref})  → one line in the activity history
   • CPAuth.switchUser() / CPAuth.signOut()
   • The header gets a "👤 Name · Role" button with Switch user / Sign out.
   BUILD 2026-11-11a
   ============================================================ */
(function(){
  'use strict';
  const AUTH_CONFIG={apiKey:"AIzaSyB2I2sR9czF6F29OZMyEZubmwQGP7nWFlc",authDomain:"calipoke-packstation.firebaseapp.com",databaseURL:"https://calipoke-packstation-default-rtdb.firebaseio.com",projectId:"calipoke-packstation",storageBucket:"calipoke-packstation.firebasestorage.app",messagingSenderId:"125288117157",appId:"1:125288117157:web:461b4d553e100c07b9ae4c"};
  const ROOT='packstation';
  const SDK='https://www.gstatic.com/firebasejs/11.6.1/';
  const ADMIN_URL='https://r-alib.github.io/calipoke-admin/';

  const ROLES={admin:'Admin',wh_backend:'WH Backend',packer:'Packer',receiver:'Receiver',streamer:'Streamer',ls_backend:'LS Backend'};
  const ALL=Object.keys(ROLES);
  /* role matrix — who sees what (admin always sees everything) */
  const ACCESS={
    station:{ admin:['admin'], guidebook:ALL, pickpack:['admin','wh_backend','packer','receiver'], shipment:['admin','wh_backend','receiver'], labels:['admin','wh_backend','receiver','ls_backend'],
      inventory:['admin','wh_backend','packer','receiver'], stockup:['admin','wh_backend'], analyzer:['admin'], supplier:['admin'], kpi:['admin'], streamer:['admin','streamer','ls_backend'],
      plan:ALL, lessons:ALL, returns:['admin','wh_backend'], transfer:ALL, hub:ALL, cphinventory:ALL },
    transfer:{ make:ALL, approve:['admin'], prepare:['admin','wh_backend','receiver'] },
    inventory:{ warehouse:['admin','wh_backend','packer','ls_backend'], stockroom:['admin','wh_backend','receiver','ls_backend'], tiktok1:['admin','wh_backend','streamer','ls_backend'], ebay:['admin','wh_backend','streamer','ls_backend'],
      whatnot:['admin','wh_backend','streamer','ls_backend'], singleslab:['admin','wh_backend','ls_backend'], cardshow:['admin','wh_backend','ls_backend'] },
    lessons:{ view:ALL },
    admin:{ users:['admin'], passwords:['admin'], roles:['admin'], activity:['admin'] }
  };

  const CSS=`
  .cpa-gate{position:fixed;inset:0;z-index:9000;background:#0b0e14;color:#e8ecf3;display:grid;place-items:center;padding:20px;font-family:Inter,system-ui,sans-serif}
  .cpa-box{width:min(400px,94vw);background:#121722;border:1px solid #243049;border-radius:18px;padding:28px 26px;box-shadow:0 24px 60px rgba(0,0,0,.5)}
  .cpa-brand{font-family:'Space Grotesk',Inter,sans-serif;font-weight:800;letter-spacing:.04em;font-size:18px;margin-bottom:2px}
  .cpa-sub{color:#8b96ab;font-size:13px;margin:0 0 18px}
  .cpa-box label{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8b96ab;margin:12px 0 6px}
  .cpa-box input{width:100%;box-sizing:border-box;background:#0b0e14;border:1.5px solid #243049;border-radius:11px;color:#e8ecf3;font-size:16px;padding:12px 13px;outline:none;font-family:inherit}
  .cpa-box input:focus{border-color:#4fd18b}
  .cpa-btn{width:100%;margin-top:16px;background:#4fd18b;color:#06110b;border:0;border-radius:12px;padding:14px;font-size:16px;font-weight:800;cursor:pointer;font-family:inherit}
  .cpa-btn:disabled{opacity:.5;cursor:default}
  .cpa-link{background:none;border:0;color:#8b96ab;font-size:13px;cursor:pointer;margin-top:12px;font-family:inherit;text-decoration:underline}
  .cpa-err{background:#2a1116;color:#ff7b8a;border-radius:10px;padding:10px 12px;font-size:13px;margin-top:12px;display:none}
  .cpa-user{position:relative;display:inline-block;margin-left:8px}
  .cpa-user>button{background:#121722;border:1px solid #243049;color:#e8ecf3;border-radius:999px;padding:7px 12px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
  .cpa-user>button:hover{border-color:#4fd18b}
  .cpa-menu{position:absolute;right:0;top:calc(100% + 6px);background:#121722;border:1px solid #243049;border-radius:12px;min-width:220px;padding:6px;z-index:9001;box-shadow:0 14px 40px rgba(0,0,0,.5);display:none}
  .cpa-menu.on{display:block}
  .cpa-menu .cpa-who{padding:8px 10px;font-size:12.5px;color:#8b96ab;border-bottom:1px solid #243049;margin-bottom:4px}
  .cpa-menu .cpa-who b{color:#e8ecf3;display:block;font-size:14px}
  .cpa-menu button,.cpa-menu a{display:block;width:100%;text-align:left;background:none;border:0;color:#e8ecf3;padding:9px 10px;border-radius:8px;font:500 13.5px Inter,system-ui,sans-serif;cursor:pointer;text-decoration:none;box-sizing:border-box}
  .cpa-menu button:hover,.cpa-menu a:hover{background:#1a2235}
  .cpa-denied{text-align:center;padding:40px 20px;color:#8b96ab}`;

  const state={app:'',user:null,ready:false,onReady:null,header:null,access:JSON.parse(JSON.stringify(ACCESS)),gate:null,fbApp:null,auth:null,db:null,profileRef:null,overridesLoaded:false};

  function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('cannot load '+src)); document.head.appendChild(s); }); }
  async function ensureSdk(){
    if(!window.firebase||!firebase.initializeApp) await loadScript(SDK+'firebase-app-compat.js');
    if(!firebase.auth) await loadScript(SDK+'firebase-auth-compat.js');
    if(!firebase.database) await loadScript(SDK+'firebase-database-compat.js');
  }
  function fbAppFor(config){
    const ex=(firebase.apps||[]).find(a=>a.options&&a.options.projectId===config.projectId);
    if(ex) return ex;
    try{ return firebase.app('cpauth'); }catch(e){ return firebase.initializeApp(config,'cpauth'); }
  }
  function injectCss(){ if(document.getElementById('cpa-css')) return; const st=document.createElement('style'); st.id='cpa-css'; st.textContent=CSS; document.head.appendChild(st); }
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ---------- gate ---------- */
  function showGate(msg){
    injectCss(); hideGate();
    const g=document.createElement('div'); g.className='cpa-gate'; g.id='cpaGate';
    g.innerHTML='<div class="cpa-box"><div class="cpa-brand">CALIPOKEHOUSE</div><p class="cpa-sub">Sign in with your work e-mail. One sign-in works in every Calipoke app on this device.</p>'+
      '<label>E-mail</label><input id="cpaEmail" type="email" autocomplete="username" placeholder="name@winstontcgllc.com">'+
      '<label>Password</label><input id="cpaPass" type="password" autocomplete="current-password" placeholder="••••••••">'+
      '<div class="cpa-err" id="cpaErr"></div><button class="cpa-btn" id="cpaGo">Sign in</button>'+
      '<button class="cpa-link" id="cpaForgot">Forgot the password? Send me a reset link</button></div>';
    document.body.appendChild(g); state.gate=g;
    const err=m=>{ const e=g.querySelector('#cpaErr'); e.textContent=m; e.style.display=m?'block':'none'; };
    if(msg) err(msg);
    try{ const last=localStorage.getItem('cpa.lastEmail'); if(last) g.querySelector('#cpaEmail').value=last; }catch(e){}
    const go=async()=>{ const em=g.querySelector('#cpaEmail').value.trim().toLowerCase(), pw=g.querySelector('#cpaPass').value; if(!em||!pw){ err('Enter e-mail and password'); return; }
      const b=g.querySelector('#cpaGo'); b.disabled=true; err('');
      try{ await state.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); await state.auth.signInWithEmailAndPassword(em,pw); try{ localStorage.setItem('cpa.lastEmail',em); }catch(e){} }
      catch(e){ b.disabled=false; err(friendly(e)); } };
    g.querySelector('#cpaGo').onclick=go; g.querySelectorAll('input').forEach(i=>i.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); }));
    g.querySelector('#cpaForgot').onclick=async()=>{ const em=g.querySelector('#cpaEmail').value.trim().toLowerCase(); if(!em){ err('Type your e-mail first'); return; } try{ await state.auth.sendPasswordResetEmail(em); err(''); alert('A reset link was sent to '+em+'. Open it, set a new password, then sign in here.'); }catch(e){ err(friendly(e)); } };
    setTimeout(()=>{ const f=g.querySelector(g.querySelector('#cpaEmail').value?'#cpaPass':'#cpaEmail'); if(f) f.focus(); },50);
  }
  function hideGate(){ const g=document.getElementById('cpaGate'); if(g) g.remove(); state.gate=null; }
  function friendly(e){ const c=(e&&e.code)||''; if(c.includes('wrong-password')||c.includes('invalid-credential')||c.includes('invalid-login')) return 'Wrong e-mail or password'; if(c.includes('user-not-found')) return 'No account with this e-mail — ask an admin to create one'; if(c.includes('too-many-requests')) return 'Too many attempts — wait a minute and try again'; if(c.includes('network')) return 'No connection'; if(c.includes('user-disabled')) return 'This account is disabled'; if(c.includes('invalid-email')) return 'That is not an e-mail address'; return (e&&e.message)||String(e); }

  /* ---------- header button ---------- */
  function renderHeader(){
    if(!state.header) return; let host=typeof state.header==='string'?document.querySelector(state.header):state.header; if(!host) return;
    injectCss(); let box=host.querySelector('.cpa-user'); if(!box){ box=document.createElement('div'); box.className='cpa-user'; host.appendChild(box); }
    const u=state.user; if(!u){ box.innerHTML=''; return; }
    box.innerHTML='<button id="cpaUserBtn" title="Signed in as '+esc(u.email)+'">👤 '+esc(u.name)+' · '+esc(u.roleLabel)+' ▾</button><div class="cpa-menu" id="cpaMenu"><div class="cpa-who"><b>'+esc(u.name)+'</b>'+esc(u.email)+' · '+esc(u.roleLabel)+'</div>'+
      (u.role==='admin'?'<a href="'+ADMIN_URL+'" target="_blank">🛡 Calipoke Admin ↗</a>':'')+'<button id="cpaPw">🔑 Change my password</button><button id="cpaSwitch">⇄ Switch user</button><button id="cpaOut">⏻ Sign out</button></div>';
    const menu=box.querySelector('#cpaMenu'); box.querySelector('#cpaUserBtn').onclick=e=>{ e.stopPropagation(); menu.classList.toggle('on'); };
    document.addEventListener('click',()=>menu.classList.remove('on'),{once:true});
    box.querySelector('#cpaSwitch').onclick=()=>switchUser(); box.querySelector('#cpaOut').onclick=()=>signOut();
    box.querySelector('#cpaPw').onclick=async()=>{ const pw=prompt('New password (at least 6 characters):'); if(!pw) return; if(pw.length<6){ alert('At least 6 characters'); return; } try{ await state.auth.currentUser.updatePassword(pw); log('password_changed',{text:'changed own password'}); alert('Password changed'); }catch(e){ if(String(e.code).includes('requires-recent-login')){ alert('For safety, sign in again and then change the password.'); switchUser(); } else alert(friendly(e)); } };
  }

  /* ---------- session ---------- */
  async function loadProfile(fbUser){
    const snap=await state.db.ref(ROOT+'/users/'+fbUser.uid).once('value'); let p=snap.val();
    if(!p){ /* first-ever account: if no users exist at all, this one becomes admin (bootstrap) */
      const any=await state.db.ref(ROOT+'/users').limitToFirst(1).once('value');
      if(!any.exists()){ p={email:fbUser.email,name:fbUser.email.split('@')[0],role:'admin',active:true,createdAt:Date.now(),bootstrap:true}; await state.db.ref(ROOT+'/users/'+fbUser.uid).set(p); }
      else return null;
    }
    return p;
  }
  async function onAuth(fbUser){
    if(!fbUser){ state.user=null; renderHeader(); showGate(); return; }
    let p=null; try{ p=await loadProfile(fbUser); }catch(e){ showGate('Could not read your profile: '+(e.message||e)); return; }
    if(!p){ await state.auth.signOut(); showGate('This e-mail has no Calipoke profile yet — ask an admin to add you in Calipoke Admin.'); return; }
    if(p.active===false){ await state.auth.signOut(); showGate('This account is disabled. Ask an admin.'); return; }
    state.user={uid:fbUser.uid,email:fbUser.email,name:p.name||fbUser.email.split('@')[0],role:ROLES[p.role]?p.role:'packer',roleLabel:ROLES[ROLES[p.role]?p.role:'packer']};
    hideGate(); renderHeader();
    try{ state.db.ref(ROOT+'/users/'+fbUser.uid).update({lastLogin:Date.now(),lastApp:state.app}); }catch(e){}
    if(!state.ready){ state.ready=true; log('sign_in',{text:'opened '+state.app}); if(state.onReady) state.onReady(state.user); }
    else { log('sign_in',{text:'switched user in '+state.app}); if(state.onSwitch) state.onSwitch(state.user); else location.reload(); }
  }
  async function signOut(){ try{ await log('sign_out',{text:'signed out of '+state.app}); }catch(e){} await state.auth.signOut(); location.reload(); }
  async function switchUser(){ try{ await log('sign_out',{text:'switch user in '+state.app}); }catch(e){} await state.auth.signOut(); /* onAuth(null) shows the gate; the app reloads after the next sign-in */ state.onSwitch=()=>location.reload(); }

  /* ---------- access ---------- */
  function can(feature,app){ const u=state.user; if(!u) return false; if(u.role==='admin') return true; const m=state.access[app||state.app]||{}; const list=m[feature]; if(!list) return true; return list.includes(u.role); }
  async function loadOverrides(){ try{ const s=await state.db.ref(ROOT+'/access').once('value'); const o=s.val(); if(o){ for(const app in o) for(const f in o[app]){ const v=o[app][f]; if(Array.isArray(v)) { state.access[app]=state.access[app]||{}; state.access[app][f]=v; } else if(v&&typeof v==='object'){ state.access[app]=state.access[app]||{}; state.access[app][f]=Object.keys(v).filter(r=>v[r]); } } } }catch(e){} state.overridesLoaded=true; }

  /* ---------- activity ---------- */
  function log(action,d){ d=d||{}; const u=state.user; if(!u||!state.db) return Promise.resolve();
    const rec={ts:Date.now(),uid:u.uid,name:u.name,role:u.role,app:state.app,action:String(action||'other'),text:d.text||'',item:d.item||null,qty:d.qty!=null?+d.qty:null,loc:d.loc||null,ref:d.ref||null};
    Object.keys(rec).forEach(k=>{ if(rec[k]==null||rec[k]==='') delete rec[k]; });
    return state.db.ref(ROOT+'/activity').push(rec).catch(()=>{}); }

  /* ---------- init ---------- */
  async function init(opts){ opts=opts||{}; state.app=opts.app||'app'; state.onReady=opts.onReady||null; state.onSwitch=opts.onSwitch||null; state.header=opts.header||null;
    await ensureSdk(); state.fbApp=fbAppFor(AUTH_CONFIG); state.auth=state.fbApp.auth(); state.db=state.fbApp.database();
    await loadOverrides();
    state.auth.onAuthStateChanged(onAuth);
  }
  function denied(host,what){ injectCss(); const el=typeof host==='string'?document.querySelector(host):host; if(el) el.innerHTML='<div class="cpa-denied"><div style="font-size:40px">🔒</div><h2>No access</h2><p>Your role ('+esc(state.user?state.user.roleLabel:'—')+') does not include <b>'+esc(what||'this part')+'</b>. Ask an admin if you need it.</p></div>'; }

  window.CPAuth={init,can,log,signOut,switchUser,denied,ROLES,ACCESS,get user(){ return state.user; },get isAdmin(){ return !!state.user&&state.user.role==='admin'; },get db(){ return state.db; },get auth(){ return state.auth; },get fbApp(){ return state.fbApp; },ROOT,AUTH_CONFIG,renderHeader};
})();