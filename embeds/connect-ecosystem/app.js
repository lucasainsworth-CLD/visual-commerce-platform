/* Buildless, relative CSV paths for GitHub Pages and iframe embeds.
 * Pre-built reveals ALL integration-directory entries, not a verified connector subset.
 * API integrations is an illustrative reach view, not a verified vendor capability map.
 */
(async () => {
  'use strict';
  const CONFIG = {
    integrations: ['./data/cloudinary-integrations.csv', './data/integrations.csv'],
    ecosystem: './data/ecosystem.csv', taxonomy: './data/taxonomy.csv', view: 'default',
    // Bump when a CSV changes: a cached copy of an older shape fails the column
    // check and silently falls back to prettified category ids.
    dataVersion: '20261111-1',
    three: 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
    presetZoom: { ecosystem:1.44, prebuilt:1.2, custom:1.08 },
    focusZoom: 3, zoomLimits: { min:.65, max:3.4 }
  };
  const $ = id => document.getElementById(id);
  const root = $('galaxy');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const categoryAliases = {
    'commerce-platform':'commerce', 'creative-tools':'creative', stock:'creative',
    'online-video-editor':'creative', 'content-builder':'cms', 'work-management':'workflow',
    'workflow-management':'workflow', 'creative-workflow':'workflow', social:'marketing',
    'cloud-provider':'data', 'artificial-intelligence':'ai', 'ai-agents':'ai',
    'digital-rights-management':'dam'
  };
  const safeURL = input => {
    try { const url = new URL(input); return /^(https?:)$/.test(url.protocol) ? url.href : null; }
    catch { return null; }
  };
  async function csv(path, columns) {
    const response = await fetch(`${path}?v=${CONFIG.dataVersion}`);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    const rows = d3.csvParse((await response.text()).replace(/^\uFEFF/,''));
    if (!columns.every(c=>rows.columns.includes(c))) throw new Error(`${path}: missing columns`);
    return rows.filter(row=>row.name || row.category_id);
  }
  async function integrationCSV() {
    for (const path of CONFIG.integrations) {
      try { const rows = await csv(path,['id','name','logo_url']); if (!rows.length) throw new Error('No integrations'); return rows; }
      catch (error) { if (path === CONFIG.integrations.at(-1)) throw error; }
    }
  }
  function categoryFor(row) {
    if (row.category) return row.category.trim();
    const source = (row.source_category || '').split('|')[0].trim();
    if (source) return categoryAliases[source] || source;
    const tags = (row.tags || '').split(',').map(t=>t.trim());
    return ['ai','analytics','commerce','pim','cms','creative','marketing','workflow','data'].find(c=>tags.includes(c)) || 'other';
  }
  // Editorial scores, not vendor capability facts. Empty/invalid cells keep the old layout.
  function score(value) {
    if (String(value ?? '').trim() === '') return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
  }
  function idFraction(id, salt='') {
    let hash=2166136261;
    for(const char of `${salt}:${id}`){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
    return (hash>>>0)/4294967296;
  }
  let renderer;
  try {
    if (!window.d3) throw new Error('Could not load the CSV library. Check your connection and reload.');
    const [THREE, integrationRows, ecosystemRows, taxonomy] = await Promise.all([
      import(CONFIG.three), integrationCSV(),
      csv(CONFIG.ecosystem,['id','name','category']).catch(error=>{console.warn(error);return [];}),
      csv(CONFIG.taxonomy,['view_id','category_id','label','order']).catch(error=>{console.warn(error);return [];})
    ]);
    const random = d3.randomLcg(.38291), range = (min,max)=>min+random()*(max-min);
    const seen = new Set();
    const companies = [...integrationRows.map(row=>({...row,integration:true})),...ecosystemRows.map(row=>({...row,integration:false}))]
      .filter(row=>{if(!row.name||seen.has(row.id))return false;seen.add(row.id);return true;})
      .map((row,index)=>({...row,index,category:categoryFor(row),categoryFit:score(row.category_fit),prominenceScore:score(row.prominence),position:new THREE.Vector3(),screen:{x:0,y:0,z:0,visible:false}}));
    const taxonomyMap = new Map(taxonomy.filter(row=>row.view_id===CONFIG.view).map(row=>[row.category_id,row]));
    const groups = Array.from(d3.group(companies,d=>d.category),([id,members])=>({id,members,
      label:taxonomyMap.get(id)?.label || id.replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
      order:Number(taxonomyMap.get(id)?.order)||99}))
      .sort((a,b)=>a.order-b.order || a.id.localeCompare(b.id));
    // Section identity is keyed by category ID, so taxonomy reordering cannot change it.
    const sectionColors = {
      commerce:'#ffb64d', pim:'#28dfbc', cms:'#529bff', creative:'#eb78df',
      marketing:'#ff7465', workflow:'#aa8aff', analytics:'#e4df65',
      dam:'#7d8dff', data:'#4bdcff', ai:'#87ef9f', search:'#e9bc91'
    };
    const colors = Object.values(sectionColors);
    // An elliptical arrangement fits the landscape iframe. Sector area responds to
    // category population, while the local fit score determines center vs edge.
    const groupById=new Map(groups.map(group=>[group.id,group]));
    const weightTotal=d3.sum(groups,group=>Math.sqrt(group.members.length)+1.5);
    let angleStart=-.16;
    groups.forEach((group,index)=>{
      const span=(Math.sqrt(group.members.length)+1.5)/weightTotal*Math.PI*2;
      group.angle=angleStart+span/2;angleStart+=span;
      group.color=new THREE.Color(sectionColors[group.id]||'#a8bdce');
      group.center=new THREE.Vector3(Math.cos(group.angle)*315,Math.sin(group.angle)*165,Math.sin(index*2.1)*34);
      group.members.forEach(company=>{
        company.group=group;
        company.logoScale=.25+.25*(company.prominenceScore??3);
      });
    });
    groups.forEach(group=>{
      const local=group.members.map(company=>{
        const fit=company.categoryFit??3;
        const tags=(company.tags||'').split(',').map(tag=>tag.trim()==='content_builder'?'cms':tag.trim());
        const adjacent=tags.find(id=>id!==company.category&&groupById.has(id));
        let angle=idFraction(company.id,'angle')*Math.PI*2;
        if(fit<=3&&adjacent){
          const toward=groupById.get(adjacent).center.clone().sub(group.center);
          angle=Math.atan2(toward.y,toward.x)+(idFraction(company.id,'bridge')-.5)*.5;
        }
        const radius=24+(5-fit)*17+(idFraction(company.id,'radius')-.5)*8;
        const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
        return {company,x,y,tx:x,ty:y};
      });
      // Only small star hitpoints repel here; logo card sizes do not spread the galaxy.
      const compact=d3.forceSimulation(local).randomSource(d3.randomLcg(.31))
        .force('x',d3.forceX(d=>d.tx).strength(.35))
        .force('y',d3.forceY(d=>d.ty).strength(.35))
        .force('collide',d3.forceCollide(12.5).iterations(4)).stop();
      compact.tick(240);
      local.forEach(({company,x,y})=>{
        company.position.copy(group.center).add(new THREE.Vector3(x,y,(idFraction(company.id,'depth')-.5)*30));
        company.starPosition=company.position.clone();
      });
      const starTop=Math.max(...group.members.map(company=>company.position.y-group.center.y));
      group.starLabelPosition=group.center.clone().add(new THREE.Vector3(0,starTop+27,0));
      const cardExtent=Math.sqrt(d3.sum(group.members,company=>(24*company.logoScale+3)**2))*.95+20;
      group.logoLabelPosition=group.center.clone().add(new THREE.Vector3(0,cardExtent+12,0));
      group.labelPosition=group.starLabelPosition.clone();
    });
    // Blend only category memberships supported by the existing source/tags.
    // Primary category gets greater weight; low-fit pilot scores permit more crossover.
    companies.forEach(company=>{
      const weights=new Map([[company.category,company.categoryFit===null?3:.8+company.categoryFit*.8]]);
      const add=(id,weight)=>{if(id!==company.category&&groupById.has(id))weights.set(id,Math.max(weights.get(id)||0,weight));};
      (company.source_category||'').split('|').forEach(source=>add(categoryAliases[source.trim()]||source.trim(),2));
      (company.tags||'').split(',').forEach(tag=>{
        const id=tag.trim()==='content_builder'?'cms':tag.trim();
        add(id,1.2);
      });
      const total=Array.from(weights.values()).reduce((sum,n)=>sum+n,0);
      company.starColor=new THREE.Color(0,0,0);
      for(const [id,weight] of weights)company.starColor.add(groupById.get(id).color.clone().multiplyScalar(weight/total));
      company.colorSections=Array.from(weights.keys());
    });
    const revealOrder=companies.filter(company=>company.integration).slice()
      .sort((a,b)=>(b.prominenceScore??3)-(a.prominenceScore??3)||a.index-b.index);
    revealOrder.forEach((company,rank)=>{company.revealRank=rank;});
    // Resolve collisions in the composed camera view, accounting for perspective.
    // Positions remain 3D: this only composes the home view, not later rotations.
    const homePitch=-.12, homeCos=Math.cos(homePitch), homeSin=Math.sin(homePitch);
    const layoutCameraDistance=1040/CONFIG.presetZoom.prebuilt;
    function homeProject(position) {
      const y=position.y*homeCos-position.z*homeSin+27;
      const z=position.y*homeSin+position.z*homeCos;
      return {x:layoutCameraDistance*position.x/(layoutCameraDistance-z),y:layoutCameraDistance*y/(layoutCameraDistance-z)};
    }
    const anchors=companies.map(c=>{const point=homeProject(c.position);return {company:c,...point,tx:point.x,ty:point.y,r:24*c.logoScale+3};});
    const obstacles=groups.map(g=>{const point=homeProject(g.logoLabelPosition);return {...point,fx:point.x,fy:point.y,r:35};});
    const simulation=d3.forceSimulation([...anchors,...obstacles,{x:0,y:27,fx:0,fy:27,r:25}])
      .randomSource(d3.randomLcg(.3)).force('x',d3.forceX(d=>d.tx??d.x).strength(.18))
      .force('y',d3.forceY(d=>d.ty??d.y).strength(.18))
      .force('collide',d3.forceCollide(d=>d.r+2).iterations(4)).stop();
    // Keep larger cards inside the default 4:3 composition as collisions settle.
    const layoutPixelsPerUnit=540/(2*Math.tan(Math.PI/8)*layoutCameraDistance);
    for(let tick=0;tick<360;tick++){
      simulation.tick();
      anchors.forEach(anchor=>{
        const maxX=(360-10)/layoutPixelsPerUnit-anchor.r;
        const maxY=(270-10)/layoutPixelsPerUnit-anchor.r;
        const minY=(270-(540-84))/layoutPixelsPerUnit+anchor.r;
        anchor.x=Math.max(-maxX,Math.min(maxX,anchor.x));
        anchor.y=Math.max(minY,Math.min(maxY,anchor.y));
      });
    }
    anchors.forEach(a=>{
      const z=a.company.position.z;
      const y=(a.y*(layoutCameraDistance-z*homeCos)+layoutCameraDistance*z*homeSin-layoutCameraDistance*27)/(layoutCameraDistance*homeCos+a.y*homeSin);
      a.company.logoPosition=new THREE.Vector3(a.x*(layoutCameraDistance-y*homeSin-z*homeCos)/layoutCameraDistance,y,z);
      a.company.apiPosition=a.company.starPosition.clone().multiply(new THREE.Vector3(1.4,1.18,1.25));
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45,1,1,4000);
    renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.setClearColor(0x040711,0);
    $('scene').append(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden','true');
    const galaxy = new THREE.Group(); scene.add(galaxy);
    const farField = new THREE.Group(); scene.add(farField);
    const positions=[],sizes=[],phases=[],kinds=[],starColors=[],starGroups=[];
    const anonymous=[];
    function addStar(position,size,kind,color,phase=random()*6.28,groupId=null) {
      positions.push(position.x,position.y,position.z);sizes.push(size);kinds.push(kind);phases.push(phase);
      starColors.push(color.r,color.g,color.b);starGroups.push(groupId);
    }
    companies.forEach(c=>addStar(c.position,c.prominenceScore===null?11:5+c.prominenceScore*2,c.integration?1:2,c.starColor,undefined,c.category));
    const cloudinary={id:'cloudinary',name:'Cloudinary',category:'Media',integration:false,
      position:new THREE.Vector3(),screen:{},url:'https://cloudinary.com',cloudinary:true};
    addStar(cloudinary.position,12,2,new THREE.Color('#b1d8ff'));
    groups.forEach(group=>{
      for(let i=0;i<38;i++){
        const theta=random()*Math.PI*2, radius=Math.sqrt(random())*(24+Math.sqrt(group.members.length)*11)*1.25;
        const point=group.center.clone().add(new THREE.Vector3(Math.cos(theta)*radius,Math.sin(theta)*radius*.8,range(-55,55)));
        anonymous.push(point);addStar(point,range(3,8),3,group.color,undefined,group.id);
      }
    });
    // A wider anonymous field gives Custom real visual expansion without vendor claims.
    for(let i=0;i<200;i++){
      const theta=random()*Math.PI*2,radius=range(1.08,1.4);
      const point=new THREE.Vector3(Math.cos(theta)*350*radius,Math.sin(theta)*190*radius,range(-110,100));
      anonymous.push(point);addStar(point,range(3,8),3,new THREE.Color(colors[i%colors.length]));
    }
    const uniform = {
      uTime:{value:0},uReveal:{value:0},uLayout:{value:0},uCustom:{value:0},
      uPixelRatio:{value:Math.min(devicePixelRatio,2)},uMotion:{value:reduced.matches?0:1}
    };
    const vertexShader=`
      attribute float aSize; attribute float aPhase; attribute float aKind; attribute float aHighlight;
      attribute vec3 aColor;
      uniform float uTime,uReveal,uCustom,uPixelRatio,uMotion;
      varying vec3 vColor; varying float vAlpha;
      void main(){
        vec3 p=position;
        if(aKind>2.5){p*=1.0+uCustom*.18;}
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        float energized=aKind>2.5?uCustom:(aKind<1.5?max(uReveal,uCustom):uCustom*.7);
        float twinkle=1.0+.14*sin(uTime*.7+aPhase)*uMotion;
        float intensity=aKind>2.5?mix(.17,.9,uCustom):(.9+energized*.6);
        vAlpha=intensity*twinkle*(1.0+aHighlight*1.5);
        vColor=mix(aColor,vec3(1.0),(aKind<2.5?.06:0.0)+aHighlight*.12);
        gl_PointSize=min(50.0,aSize*uPixelRatio*(900.0/-mv.z)*(1.0+energized*.65)*(1.0+aHighlight*.25));
        gl_Position=projectionMatrix*mv;
      }`;
    const fragmentShader=`
      varying vec3 vColor; varying float vAlpha;
      void main(){
        float r=length(gl_PointCoord-vec2(.5));
        if(r>.5)discard;
        float core=exp(-r*r*135.0);
        float halo=exp(-r*r*19.0)*.48;
        gl_FragColor=vec4(vColor,(core+halo)*vAlpha);
        #include <colorspace_fragment>
      }`;
    function geometry(position,size,phase,kind,color) {
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
      geo.setAttribute('aSize',new THREE.Float32BufferAttribute(size,1));
      geo.setAttribute('aPhase',new THREE.Float32BufferAttribute(phase,1));
      geo.setAttribute('aKind',new THREE.Float32BufferAttribute(kind,1));
      geo.setAttribute('aColor',new THREE.Float32BufferAttribute(color,3));
      geo.setAttribute('aHighlight',new THREE.Float32BufferAttribute(new Float32Array(size.length),1));
      return geo;
    }
    const starMaterial=new THREE.ShaderMaterial({uniforms:uniform,vertexShader,fragmentShader,
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    const companyStars=new THREE.Points(geometry(positions,sizes,phases,kinds,starColors),starMaterial);
    companyStars.frustumCulled=false;galaxy.add(companyStars);
    const bgP=[],bgS=[],bgPhase=[],bgK=[],bgC=[];
    for(let i=0;i<1000;i++){
      bgP.push(range(-1500,1500),range(-1300,1300),range(-1500,-400));
      bgS.push(range(2,5));bgPhase.push(random()*6.28);bgK.push(0);bgC.push(.37,.49,.66);
    }
    farField.add(new THREE.Points(geometry(bgP,bgS,bgPhase,bgK,bgC),starMaterial));
    // Subtle procedural haze, not a supplied or generated brand image.
    const hazeCanvas=document.createElement('canvas');hazeCanvas.width=hazeCanvas.height=128;
    const ctx=hazeCanvas.getContext('2d');const gradient=ctx.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'rgba(255,255,255,.28)');gradient.addColorStop(.4,'rgba(255,255,255,.10)');gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
    const hazeTexture=new THREE.CanvasTexture(hazeCanvas);
    const haze=[];
    groups.forEach(group=>{
      const material=new THREE.SpriteMaterial({map:hazeTexture,color:group.color,opacity:.13,depthWrite:false,blending:THREE.AdditiveBlending});
      const sprite=new THREE.Sprite(material);sprite.position.copy(group.center);sprite.position.z-=70;
      sprite.scale.set(245,190,1);galaxy.add(sprite);haze.push(sprite);
    });
    // Sparse intra-cluster edges sketch constellations, not asserted integrations.
    const linePoints=[],lineColors=[],linePairs=[];
    groups.forEach(group=>group.members.forEach((company,i)=>{
      if(!i)return;
      const nearest=group.members.slice(0,i).reduce((a,b)=>a.position.distanceTo(company.position)<b.position.distanceTo(company.position)?a:b);
      linePairs.push([company,nearest]);
      linePoints.push(...company.position.toArray(),...nearest.position.toArray());
      lineColors.push(...company.starColor.toArray(),...nearest.starColor.toArray());
    }));
    const constellationLines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(linePoints,3)).setAttribute('color',new THREE.Float32BufferAttribute(lineColors,3)),
      new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.055,depthWrite:false}));
    constellationLines.frustumCulled=false;galaxy.add(constellationLines);
    // Direct light-blue rays share each company's live, rotating 3D endpoint.
    // Background dust is decoration; a connected item is a named CSV record.
    const hubGeometry=new THREE.BufferGeometry();
    hubGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(companies.length*6),3));
    const hubConnections=new THREE.LineSegments(hubGeometry,
      new THREE.LineBasicMaterial({color:'#8dd9ff',transparent:true,opacity:0,depthWrite:false}));
    hubConnections.frustumCulled=false;galaxy.add(hubConnections);
    let connectionOpacity=0;
    let mode='ecosystem',level=0,modeAt=performance.now(),revealAt=0;
    let width=0,height=0,yaw=0,pitch=-.12,targetYaw=0,targetPitch=-.12,zoom=CONFIG.presetZoom.ecosystem,targetZoom=CONFIG.presetZoom.ecosystem;
    let lastTime=performance.now(),lastInteraction=lastTime,hovered=null,selected=null,keyboardFocus=null;
    let shown=true,raf=0,destroyed=false;
    let activeGroup=null,hoverCategory=null,focusCategory=null,categoryClearTimer=0;
    // The ecosystem view centers a clicked region by panning the galaxy, so the
    // region's own stars stay put in 3D and rotation keeps working while zoomed.
    let labelGroup=null,nameRevealFrames=0,nameClearTimer=0;
    const focusPan=new THREE.Vector3(),focusPanTarget=new THREE.Vector3(),panned=new THREE.Vector3();
    const nameLayer=document.createElement('div');nameLayer.id='category-names';
    root.append(nameLayer);
    $('labels').removeAttribute('aria-hidden');$('labels').setAttribute('role','group');$('labels').setAttribute('aria-label','Categories');
    const companyList=[...companies,cloudinary];
    companyList.forEach(company=>{
      const button=document.createElement('button');button.type='button';button.className='company';
      button.setAttribute('aria-label',`${company.name}${company.cloudinary?'':` · ${company.group.label}`}`);
      button.title='';button.dataset.company=company.id;
      if(company.starColor){
        button.dataset.starColor='#'+company.starColor.getHexString();
        button.dataset.colorSections=company.colorSections.join(',');
        button.dataset.section=company.category;
        button.dataset.prominence=String(company.prominenceScore??3);
        button.dataset.logoScale=String(company.logoScale);
        button.style.setProperty('--prominence-scale',String(company.logoScale));
        button.style.setProperty('--star-color','#'+company.starColor.getHexString());
      }
      if(company.categoryFit!==null&&company.group){
        button.dataset.categoryFit=String(company.categoryFit);
        button.dataset.clusterDistance=company.starPosition.distanceTo(company.group.center).toFixed(2);
        button.dataset.logoClusterDistance=company.logoPosition.distanceTo(company.group.center).toFixed(2);
      }
      if(company.cloudinary){
        button.classList.add('cloudinary');const name=document.createElement('span');name.className='cloudinary-name';name.textContent='Cloudinary';button.append(name);
      }else{
        const logo=document.createElement('span');logo.className='logo';
        const initials=document.createElement('span');initials.className='initials';initials.textContent=company.name.split(/\s+/).map(w=>w[0]).join('').slice(0,3);logo.append(initials);
        const url=safeURL(company.logo_url);
        if(url){const img=document.createElement('img');img.alt='';img.decoding='async';img.addEventListener('load',()=>button.classList.add('has-logo'));
          img.addEventListener('error',()=>img.remove());img.src=url;logo.append(img);}
        const name=document.createElement('span');name.className='company-name';name.textContent=company.name;
        button.append(logo,name);
      }
      button.addEventListener('pointerenter',()=>{hovered=company;if(company.group)setCategoryHover(company.category);});
      button.addEventListener('pointerleave',()=>{if(hovered===company)hovered=null;});
      button.addEventListener('focus',()=>{keyboardFocus=company;hovered=company;});
      button.addEventListener('blur',()=>{keyboardFocus=null;hovered=null;});
      // Pointer selection is handled on release, so a drag never opens a detail card.
      button.addEventListener('click',event=>{if(event.detail===0)openDetail(company);});
      company.element=button;$('companies').append(button);
    });
    groups.forEach(group=>{
      const label=document.createElement('button');label.type='button';label.className='category';
      label.setAttribute('aria-label',`${group.label} category`);label.setAttribute('aria-expanded','false');
      label.addEventListener('pointerenter',()=>setCategoryHover(group.id));
      label.addEventListener('pointerleave',scheduleCategoryClear);
      label.addEventListener('focus',()=>{focusCategory=group.id;refreshCategory();interact();});
      label.addEventListener('blur',()=>{focusCategory=null;scheduleCategoryClear();});
      label.addEventListener('click',()=>focusRegion(group.id));
      label.style.color='#'+group.color.getHexString();label.dataset.category=group.id;
      const text=document.createElement('span');text.textContent=group.label;label.append(text);
      $('labels').append(label);group.element=label;
    });
    function setCategoryHover(id){
      // State 1 reveals names on click, so hovering must not open a region there.
      if(mode==='ecosystem')return;
      clearTimeout(categoryClearTimer);hoverCategory=groupById.has(id)?id:null;refreshCategory();
    }
    function scheduleCategoryClear(){
      clearTimeout(categoryClearTimer);
      categoryClearTimer=setTimeout(()=>{hoverCategory=null;refreshCategory();},220);
    }
    function clearCategory(){
      clearTimeout(categoryClearTimer);hoverCategory=null;focusCategory=null;refreshCategory();
    }
    // Regions have no geometry of their own, so a click lands in one by falling
    // inside its members' screen bounds; ties go to the nearest center.
    function regionAt(clientX,clientY){
      const rect=root.getBoundingClientRect(),x=clientX-rect.x,y=clientY-rect.y;
      const candidates=groups.filter(group=>group.hoverBounds&&x>=group.hoverBounds.left&&x<=group.hoverBounds.right&&y>=group.hoverBounds.top&&y<=group.hoverBounds.bottom);
      candidates.sort((a,b)=>Math.hypot(x-a.hoverBounds.cx,y-a.hoverBounds.cy)-Math.hypot(x-b.hoverBounds.cx,y-b.hoverBounds.cy));
      return candidates[0]||null;
    }
    function focusRegion(id){
      if(!groupById.has(id))return;
      focusCategory=id;refreshCategory();
      focusPanTarget.copy(groupById.get(id).center);
      targetZoom=CONFIG.focusZoom;targetYaw=0;targetPitch=-.12;interact();
    }
    function clearFocus(){
      clearCategory();focusPanTarget.set(0,0,0);targetZoom=CONFIG.presetZoom[mode];interact();
    }
    function refreshCategory(){
      const next=groupById.get(hoverCategory||focusCategory)||null;
      if(next===activeGroup)return;
      activeGroup=next;root.dataset.activeCategory=next?.id||'';
      groups.forEach(group=>{group.element?.classList.toggle('active',group===next);group.element?.setAttribute('aria-expanded',String(group===next));});
      companies.forEach(company=>company.element.classList.toggle('category-active',company.group===next));
      clearTimeout(nameClearTimer);
      if(!next){
        // Keep the labels in the DOM, and still laid out, so they fade out in place
        // instead of vanishing the instant the region closes.
        nameLayer.classList.remove('is-visible');
        nameClearTimer=setTimeout(()=>{if(!activeGroup){nameLayer.replaceChildren();labelGroup=null;}},420);
        return;
      }
      nameLayer.replaceChildren();nameLayer.classList.remove('is-visible');
      next.members.forEach(company=>{
        const label=document.createElement('span');label.className='category-name';
        label.textContent=company.name;label.dataset.categoryName=company.id;
        nameLayer.append(label);company.categoryLabel=label;
      });
      labelGroup=next;
      // Reveal a frame later, once the labels have been positioned and painted at
      // opacity 0 — otherwise the browser has nothing to transition from.
      nameRevealFrames=2;
    }
    // Labels stay at a fixed offset from their projected star. No cards, leaders,
    // collision avoidance or independent fan-out; overlaps are intentional.
    function layoutCategoryNames(){
      if(!labelGroup)return;
      labelGroup.members.forEach(company=>{
        const label=company.categoryLabel,point=company.screen;
        label.hidden=company.element.style.display==='none';
        const leftSide=point.x>width*.68;
        label.style.transform=`translate3d(${(point.x+(leftSide?-8:8)).toFixed(1)}px,${point.y.toFixed(1)}px,0) translate(${leftSide?'-100%':'0'},-50%)`;
      });
    }
    const projected=new THREE.Vector3();
    function project(position) {
      projected.copy(position).applyMatrix4(galaxy.matrixWorld).project(camera);
      return {x:(projected.x*.5+.5)*width,y:(-.5*projected.y+.5)*height,z:projected.z,visible:projected.z>-1&&projected.z<1};
    }
    function detailPosition() {
      if(!selected)return;
      const point=selected.screen,card=$('detail');
      card.style.left=`${Math.max(12,Math.min(width-card.offsetWidth-12,point.x+24))}px`;
      card.style.top=`${Math.max(12,Math.min(height-card.offsetHeight-85,point.y-card.offsetHeight/2))}px`;
    }
    function openDetail(company) {
      if(selected)selected.element.classList.remove('selected');
      selected=company;company.element.classList.add('selected');
      $('detail-name').textContent=company.name;
      // Detail copy describes the record; it never infers connector or MCP support.
      $('detail-category').textContent=company.cloudinary?'Media platform':`${company.group.label} · ${company.integration?'Integration directory':'Ecosystem reference'}`;
      const logo=safeURL(company.logo_url);$('detail-logo').hidden=!logo;
      $('detail-logo').onerror=()=>{$('detail-logo').hidden=true;};
      if(logo)$('detail-logo').src=logo;else $('detail-logo').removeAttribute('src');
      const url=company.cloudinary?company.url:safeURL(company.integration_page_url||company.website_url);
      $('detail-link').hidden=!url;if(url)$('detail-link').href=url;else $('detail-link').removeAttribute('href');
      $('detail-link').textContent=company.integration?'View integration ↗':'View company ↗';
      $('detail').hidden=false;detailPosition();interact();
    }
    function closeDetail(returnFocus=false) {
      const previous=selected;
      if(previous)previous.element.classList.remove('selected');selected=null;$('detail').hidden=true;
      if(returnFocus&&previous)previous.element.focus({preventScroll:true});
    }
    $('close-detail').addEventListener('click',()=>closeDetail(true));
    function interact(){lastInteraction=performance.now();root.classList.add('interacted');}
    function home(){targetYaw=0;targetPitch=-.12;targetZoom=CONFIG.presetZoom[mode];focusPanTarget.set(0,0,0);interact();}
    function setMode(next) {
      if(!Object.hasOwn(CONFIG.presetZoom,next))return;
      if(next===mode&&next!=='ecosystem'){home();return;}
      const oldLevel=level;mode=next;level=['ecosystem','prebuilt','custom'].indexOf(mode);
      root.dataset.mode=mode;modeAt=performance.now();
      if(mode==='prebuilt'&&oldLevel!==1)revealAt=modeAt;
      root.dataset.connectionCount=String(mode==='ecosystem'?0:mode==='prebuilt'?companies.filter(c=>c.integration).length:companies.length);
      root.dataset.presetZoom=String(CONFIG.presetZoom[mode]);
      document.querySelectorAll('.mode-controls button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
      clearCategory();closeDetail();home();
      $('mode-announcement').textContent=[
        'Ecosystem. Explore company stars by dragging, scrolling, or focusing a star.',
        `${integrationRows.length} directory logos revealed, each connected to Cloudinary by a light-blue line. Inclusion is directory membership, not verified pre-built status.`,
        'API integrations. Company logos return to dots, the cloud expands, and light-blue lines connect every named company to Cloudinary. This illustrates extensibility; vendor API compatibility is not asserted.'
      ][level];
    }
    document.querySelectorAll('.mode-controls button').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
    $('reset').addEventListener('click',home);
    $('zoom-in').addEventListener('click',()=>{targetZoom=Math.min(CONFIG.zoomLimits.max,targetZoom*1.15);interact();});
    $('zoom-out').addEventListener('click',()=>{targetZoom=Math.max(CONFIG.zoomLimits.min,targetZoom/1.15);interact();});
    const pointers=new Map();let gesture=null,lastPinch=0;
    const hitCompany=target=>{const button=target.closest?.('.company');return button?companyList.find(c=>c.element===button):null;};
    const isUI=target=>Boolean(target.closest?.('nav,.view-controls,#detail,.category,.category-name'));
    root.addEventListener('pointerdown',event=>{
      if(isUI(event.target)||event.button>0)return;
      interact();pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(pointers.size===1){gesture={x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false,company:hitCompany(event.target)};root.setPointerCapture(event.pointerId);}
      if(pointers.size===2){const p=[...pointers.values()];lastPinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(gesture)gesture.moved=true;}
    });
    root.addEventListener('pointermove',event=>{
      if(!pointers.has(event.pointerId)||!gesture)return;
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(pointers.size===2){const p=[...pointers.values()];const distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
        if(lastPinch>0)targetZoom=Math.max(CONFIG.zoomLimits.min,Math.min(CONFIG.zoomLimits.max,targetZoom*distance/lastPinch));lastPinch=distance;
      }else{
        const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
        if(Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)>5)gesture.moved=true;
        if(gesture.moved){targetYaw+=dx*.006;targetPitch=Math.max(-1.15,Math.min(1.15,targetPitch+dy*.004));hovered=null;}
        gesture.x=event.clientX;gesture.y=event.clientY;
      }
      interact();
    });
    function endPointer(event,cancelled=false){
      if(!pointers.has(event.pointerId))return;
      pointers.delete(event.pointerId);
      if(pointers.size===0&&gesture){
        if(!cancelled&&!gesture.moved){
          if(gesture.company)openDetail(gesture.company);
          else{
            closeDetail();
            // A click inside a region opens it; a click on open space reverses both
            // the zoom and the names. Name labels do not take the pointer, so a
            // click on one lands in its own region and keeps it open.
            if(mode==='ecosystem'){const region=regionAt(event.clientX,event.clientY);region?focusRegion(region.id):clearFocus();}
          }
        }
        gesture=null;
      }
      else if(gesture){const p=[...pointers.values()][0];gesture.x=p.x;gesture.y=p.y;gesture.moved=true;}
    }
    root.addEventListener('pointerup',event=>endPointer(event));
    root.addEventListener('pointercancel',event=>endPointer(event,true));
    root.addEventListener('pointermove',event=>{
      if(mode==='ecosystem')return;
      if(gesture?.moved){setCategoryHover(null);return;}
      const direct=event.target.closest?.('[data-category],.company');
      const id=direct?.dataset.category||direct?.dataset.section;
      if(id){setCategoryHover(id);return;}
      if(event.target.closest?.('nav,.view-controls,#detail')){scheduleCategoryClear();return;}
      const region=regionAt(event.clientX,event.clientY);
      if(region)setCategoryHover(region.id);else scheduleCategoryClear();
    });
    root.addEventListener('pointerleave',scheduleCategoryClear);
    root.addEventListener('wheel',event=>{
      if(isUI(event.target))return;event.preventDefault();targetZoom=Math.max(CONFIG.zoomLimits.min,Math.min(CONFIG.zoomLimits.max,targetZoom*Math.exp(-event.deltaY*.001)));interact();
    },{passive:false});
    // Bound to the document: clicking open space leaves focus on the body, and
    // Escape still has to reverse the zoom from there.
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'){clearFocus();closeDetail(true);return;}
      if(event.target.closest('nav,.view-controls,#detail,.category,.category-name'))return;
      const keys={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,-.12],ArrowDown:[0,.12]};
      if(keys[event.key]){event.preventDefault();targetYaw+=keys[event.key][0];targetPitch=Math.max(-1.15,Math.min(1.15,targetPitch+keys[event.key][1]));interact();}
      if(['+','=','-','Home'].includes(event.key)){
        event.preventDefault();if(event.key==='Home')home();else{targetZoom=Math.max(CONFIG.zoomLimits.min,Math.min(CONFIG.zoomLimits.max,targetZoom*(event.key==='-'?1/1.15:1.15)));interact();}
      }
    });
    root.addEventListener('dblclick',event=>{if(!isUI(event.target)&&!hitCompany(event.target))home();});
    renderer.domElement.addEventListener('webglcontextlost',event=>{
      event.preventDefault();$('status').hidden=false;$('status').textContent='Graphics paused. Reload to restore the constellation.';
    });
    const resize=()=>{
      width=root.clientWidth;height=root.clientHeight;
      camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);
    };
    const observer=new ResizeObserver(resize);observer.observe(root);resize();
    const visibilityObserver=new IntersectionObserver(entries=>{shown=entries[0].isIntersecting;if(shown&&!raf&&!destroyed)raf=requestAnimationFrame(frame);});visibilityObserver.observe(root);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!raf&&!destroyed)raf=requestAnimationFrame(frame);});
    const ease=(value,target,amount)=>value+(target-value)*amount;
    const clamp=value=>Math.max(0,Math.min(1,value));
    function frame(now) {
      raf=0;if(destroyed||document.hidden||!shown)return;
      const delta=Math.min((now-lastTime)/1000,.05);lastTime=now;
      const blend=reduced.matches?1:1-Math.exp(-delta*7);
      if(mode==='ecosystem'&&!reduced.matches&&!root.classList.contains('interacted')&&!gesture&&!selected&&!hovered&&!keyboardFocus&&!activeGroup&&now-lastInteraction>5500)targetYaw=.08*Math.sin((now-lastInteraction-5500)/18000);
      yaw=ease(yaw,targetYaw,blend);pitch=ease(pitch,targetPitch,blend);zoom=ease(zoom,targetZoom,blend);
      galaxy.rotation.set(pitch,yaw,0);
      focusPan.lerp(focusPanTarget,blend*.55);
      panned.copy(focusPan).applyEuler(galaxy.rotation);
      galaxy.position.set(-panned.x,27-panned.y,0);
      farField.rotation.y=yaw*.06;farField.rotation.x=pitch*.04;
      camera.position.set(0,0,1040*Math.max(1,1.2*height/width)/zoom);camera.updateMatrixWorld();galaxy.updateMatrixWorld(true);
      const goal=mode==='prebuilt'?1:0;
      uniform.uReveal.value=ease(uniform.uReveal.value,goal,blend*.65);
      uniform.uLayout.value=ease(uniform.uLayout.value,goal,blend*.65);
      uniform.uCustom.value=ease(uniform.uCustom.value,mode==='custom'?1:0,blend*.65);
      uniform.uTime.value=now/1000;uniform.uMotion.value=reduced.matches?0:1;
      const expansion=uniform.uLayout.value;
      const apiExpansion=uniform.uCustom.value;
      const starAttribute=companyStars.geometry.attributes.position;
      const highlightAttribute=companyStars.geometry.attributes.aHighlight;
      groups.forEach(group=>{group.emphasis=ease(group.emphasis||0,group===activeGroup?1:0,blend);});
      starGroups.forEach((id,index)=>highlightAttribute.setX(index,id?groupById.get(id).emphasis:0));
      highlightAttribute.needsUpdate=true;
      companies.forEach((company,index)=>{
        company.position.lerpVectors(company.starPosition,company.logoPosition,expansion).lerp(company.apiPosition,apiExpansion);
        starAttribute.setXYZ(index,company.position.x,company.position.y,company.position.z);
      });
      starAttribute.needsUpdate=true;
      groups.forEach(group=>{
        group.labelPosition.lerpVectors(group.starLabelPosition,group.logoLabelPosition,expansion);
        group.labelPosition.lerp(group.starLabelPosition.clone().multiply(new THREE.Vector3(1.4,1.18,1.25)),apiExpansion);
      });
      const lineAttribute=constellationLines.geometry.attributes.position;
      linePairs.forEach(([a,b],index)=>{
        lineAttribute.setXYZ(index*2,a.position.x,a.position.y,a.position.z);
        lineAttribute.setXYZ(index*2+1,b.position.x,b.position.y,b.position.z);
      });
      lineAttribute.needsUpdate=true;
      constellationLines.material.opacity=.05+uniform.uReveal.value*.035;
      connectionOpacity=ease(connectionOpacity,level>0?.22:0,blend*.65);
      hubConnections.material.opacity=connectionOpacity;
      hubConnections.visible=connectionOpacity>.001;
      const hubAttribute=hubGeometry.attributes.position;
      companies.forEach((company,index)=>{
        const weight=company.integration?1:apiExpansion;
        hubAttribute.setXYZ(index*2,0,0,0);
        hubAttribute.setXYZ(index*2+1,company.position.x*weight,company.position.y*weight,company.position.z*weight);
      });
      hubAttribute.needsUpdate=true;
      haze.forEach((sprite,index)=>{
        const group=groups[index];
        sprite.position.copy(group.center).multiply(new THREE.Vector3(1+apiExpansion*.4,1+apiExpansion*.18,1+apiExpansion*.25));
        sprite.position.z-=70;sprite.scale.set(245*(1+apiExpansion*.12),190*(1+apiExpansion*.12),1);
        sprite.material.opacity=.13+apiExpansion*.13;
      });
      renderer.render(scene,camera);
      const revealProgress=reduced.matches?1:clamp((now-revealAt-300)/2100);
      companyList.forEach(company=>{
        const point=project(company.position);company.screen=point;
        const visible=point.visible&&point.x>5&&point.x<width-5&&point.y>5&&point.y<height-70;
        const el=company.element;el.style.display=visible?'':'none';
        if(!visible)return;
        // Depth affects scale and stacking, while overlays remain readable and face-on.
        const scale=Math.max(.4,Math.min(1.4,height/800*1040/(company.position.clone().applyMatrix4(galaxy.matrixWorld).distanceTo(camera.position))));
        el.style.transform=`translate3d(${point.x.toFixed(2)}px,${point.y.toFixed(2)}px,0) scale(${scale.toFixed(3)})`;
        el.style.zIndex=String(Math.round((1-point.z)*10000));
        if(company.integration){
          const threshold=company.revealRank/Math.max(1,revealOrder.length-1)*.78;
          const reveal=mode==='prebuilt'?clamp((revealProgress-threshold)*5):0;
          if(reveal!==company.reveal){company.reveal=reveal;el.style.setProperty('--logo-reveal',String(reveal));el.classList.toggle('revealed',reveal>.1);}
        }
      });
      groups.forEach(group=>{
        const point=project(group.labelPosition);group.element.style.transform=`translate3d(${point.x.toFixed(2)}px,${point.y.toFixed(2)}px,0) translate(-50%,-50%)`;
        group.element.style.display=point.visible&&point.x>30&&point.x<width-30&&point.y>20&&point.y<height-95?'':'none';
      });
      groups.forEach(group=>{
        const visible=group.members.filter(company=>company.element.style.display!=='none');
        if(!visible.length){group.hoverBounds=null;return;}
        const xs=visible.map(company=>company.screen.x),ys=visible.map(company=>company.screen.y);
        group.hoverBounds={left:Math.min(...xs)-18,right:Math.max(...xs)+18,top:Math.min(...ys)-18,bottom:Math.max(...ys)+18,cx:d3.mean(xs),cy:d3.mean(ys)};
      });
      layoutCategoryNames();detailPosition();
      if(nameRevealFrames&&!--nameRevealFrames)nameLayer.classList.add('is-visible');
      raf=requestAnimationFrame(frame);
    }
    // Keep graphics and observers from outliving an embed that has navigated away.
    window.addEventListener('pageshow',event=>{if(event.persisted&&!destroyed&&!raf)raf=requestAnimationFrame(frame);});
    window.addEventListener('pagehide',event=>{
      if(event.persisted){cancelAnimationFrame(raf);raf=0;return;}
      destroyed=true;clearTimeout(categoryClearTimer);cancelAnimationFrame(raf);observer.disconnect();visibilityObserver.disconnect();
      scene.traverse(object=>{object.geometry?.dispose();if(object.material){const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>material.dispose());}});
      hazeTexture.dispose();renderer.dispose();
    });
    root.dataset.connectionCount='0';root.dataset.presetZoom=String(CONFIG.presetZoom.ecosystem);
    $('status').hidden=true;root.setAttribute('aria-busy','false');
    $('mode-announcement').textContent='Ecosystem loaded. Company stars are grouped by category. Drag to rotate, scroll to zoom, or focus a star to reveal its company.';
    raf=requestAnimationFrame(frame);
  } catch(error) {
    console.error(error);root.setAttribute('aria-busy','false');$('status').hidden=false;
    $('status').textContent=location.protocol==='file:'?'Serve this folder over HTTP to load the constellation.':`Unable to load the constellation. ${error.message}`;
    document.querySelectorAll('button').forEach(button=>button.disabled=true);
    renderer?.dispose();
  }
})();
