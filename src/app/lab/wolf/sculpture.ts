/**
 * Reproducible, explicit triangle-surface models in the logo's coordinate frame.
 * +Z is forward. The rose has separate rolled petals, not an image extrusion;
 * the wolf has a unified implicit facial skin and a seated canine rhinarium.
 * These meshes are area-sampled into the scene's existing particle budget.
 */
type V = [number, number, number];
type Triangle = { a: V; b: V; c: V; color: V; normal: V; area: number };
type Surface = (u: number, v: number) => V;
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const mix = (a: number, b: number, t: number) => a + (b-a)*t;
const TAU = Math.PI * 2;

// z, maxillary half width, nasal bridge, closed lip, mandibular underside.
const muzzleSections = [
  [.12,.335,.245,-.208,-.490], [.25,.283,.212,-.245,-.486],
  [.38,.232,.141,-.273,-.447], [.50,.193,.076,-.285,-.410],
  [.62,.167,.015,-.283,-.385], [.72,.144,-.054,-.266,-.350],
  [.77,.095,-.104,-.250,-.323], [.80,.001,-.170,-.245,-.280],
];
const muzzleAt=(z:number)=>{
  let i=0;while(i<muzzleSections.length-2&&muzzleSections[i+1][0]<z)i++;
  const a=muzzleSections[i],b=muzzleSections[i+1],f=Math.max(0,Math.min(1,(z-a[0])/(b[0]-a[0])));
  return a.map((n,k)=>mix(n,b[k],f));
};
export const headHeight=(y:number)=>y>.28 ? .28+(y-.28)*.83 : y;
export const mouthLipAtDepth=(z:number)=>muzzleAt(z)[3];
export const earThickness=(x:number,y:number)=> {
  const t=Math.max(0,Math.min(1,(y-.40)/.58));
  const side=Math.exp(-(((Math.abs(x)-(.35+.16*t))/.23)**2));
  return y>.40 && Math.abs(x)>.27 ? (.17*(1-t)+.045)*side : 0;
};
export const cranialBack=(x:number,y:number)=> -.15-.57*Math.sqrt(Math.max(0,1-(x/.72)**2-((y-.04)/.86)**2));
const cranialDepth=(x:number,y:number)=>{
  const bump=(cx:number,cy:number,sx:number,sy:number)=>Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2));
  const skull=Math.sqrt(Math.max(0,1-(x/.69)**2-((y-.08)/.86)**2));
  return -.22+skull*.57-.08*Math.max(0,(y-.30)/.65)+bump(Math.sign(x)*.37,-.07,.22,.30)*.045
    -bump(Math.sign(x)*.23,.19,.115,.09)*.070+bump(Math.sign(x)*.18,.30,.18,.11)*.050;
};
const smoothUnion=(a:number,b:number,k:number)=>{
  const h=Math.max(k-Math.abs(a-b),0)/k;
  return Math.min(a,b)-h*h*k*.25;
};
/** A true volumetric field: independently bounded upper and lower jaws join
 * the cranium at their roots. Undercuts remain empty space, not skin curtains. */
const facialField=(x:number,y:number,z:number)=>{
  const [,w,top,lip,bottom]=muzzleAt(z);
  const section=(width:number,upper:number,lower:number,power:number)=>{
    const h=(upper-lower)/2,cy=(upper+lower)/2;
    const radial=(Math.abs((x-.028)/width)**power+Math.abs((y-cy)/h)**power)**(1/power)-1;
    return Math.max(radial*Math.min(width,h),.12-z,z-.80);
  };
  const upper=section(w,top,lip-.004,2.7);
  const lower=section(w*.88,lip-.017,bottom,2.2);
  const cranium=z-cranialDepth(x,y);
  return Math.min(smoothUnion(cranium,upper,.065),smoothUnion(cranium,lower,.035));
};
export function facialDepth(x:number,y:number) {
  const base=cranialDepth(x,y);
  if(y>.23||y<-.57||Math.abs(x-.028)>.38)return base;
  for(let z=1.02;z>base;z-=.015)if(facialField(x,y,z)<0){
    let lo=z,hi=z+.015;
    for(let i=0;i<9;i++){const m=(lo+hi)/2;if(facialField(x,y,m)<0)lo=m;else hi=m;}
    return (lo+hi)/2;
  }
  return base;
}

/** Replace the painted open bite while retaining the original eyes and ruff. */
export function replacedMuzzle(x: number, y: number) {
  return ((x-.028)/.365)**2+((y+.205)/.407)**2 < 1;
}

export function sculptWolfDetails(random: () => number, budget: number,
  add: (position: V, color: V, normal: V, size: number) => void,
  furColor: (x: number, y: number, z?:number) => V) {
  const triangles: Triangle[] = [];
  const triangle = (a: V, b: V, c: V, color: V) => {
    const n = cross(sub(b, a), sub(c, a));
    const length = Math.hypot(...n);
    if (length > 1e-9) triangles.push({ a, b, c, color, normal: n.map(x => x/length) as V, area: length/2 * (color[1] > .5 ? 2.2 : color[0] > .15 && color[1] < .1 ? 3 : color[0] < .34 && color[1] > color[0] ? 2.4 : 1) });
  };
  const surface = (fn: Surface, nu: number, nv: number, color: V,
    include: (p: V) => boolean = () => true) => {
    for (let i=0;i<nu;i++) for (let j=0;j<nv;j++) {
      const a=fn(i/nu,j/nv), b=fn((i+1)/nu,j/nv), c=fn((i+1)/nu,(j+1)/nv), d=fn(i/nu,(j+1)/nv);
      if ([a,b,c,d].every(include)) { triangle(a,b,c,color); triangle(a,c,d,color); }
    }
  };
  const tube = (path: (t: number) => V, radius: (t: number) => number, color: V, steps=48) => {
    surface((u,v)=>{
      const p=path(u), tangent=sub(path(Math.min(1,u+.001)),path(Math.max(0,u-.001)));
      const side=cross(tangent, [0,0,1]); const len=Math.hypot(...side)||1;
      const a=side.map(x=>x/len) as V; const n=cross(a,tangent); const nl=Math.hypot(...n)||1;
      const r=radius(u), angle=v*TAU;
      return p.map((x,k)=>x+r*(a[k]*Math.cos(angle)+n[k]/nl*Math.sin(angle))) as V;
    },steps,12,color);
  };
  // Coordinates are composed in the front artwork's frame, then projected
  // onto anatomy. Perspective compensation retains the recognizable frontal landmarks.
  const project = (p: V): V => [p[0]*(1-p[2]/3.6),p[1]*(1-p[2]/3.6),p[2]];
  const shape = (fn: Surface, nu: number, nv: number, color: V,
    include: (p: V) => boolean = () => true) =>
    surface((u,v)=>project(fn(u,v)),nu,nv,color,p=>include([p[0]/(1-p[2]/3.6),p[1]/(1-p[2]/3.6),p[2]]));
  const line = (path: (t: number) => V, radius: (t: number) => number, color: V, steps=48) =>
    tube(t=>project(path(t)),radius,color,steps);

  // Extract all exposed sides of the connected cheek/maxilla/mandible skin.
  // A shared lattice and tetrahedral edges avoid cracks between neighboring cells.
  const nx=60,ny=64,nz=66,dx=.75/nx,dy=.85/ny,dz=.92/nz;
  const grid:V[]=[],values:number[]=[];
  const gridIndex=(i:number,j:number,k:number)=>(i*(ny+1)+j)*(nz+1)+k;
  for(let i=0;i<=nx;i++)for(let j=0;j<=ny;j++)for(let k=0;k<=nz;k++){
    const p:V=[-.347+i*dx,-.587+j*dy,k*dz];
    grid.push(p);values.push(facialField(...p));
  }
  const tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  const emit=(a:V,b:V,c:V)=>{
    const p:V=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];
    if(!replacedMuzzle(p[0],p[1]))return;
    triangle(project(a),project(b),project(c),furColor(...p));
  };
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++)for(let k=0;k<nz;k++){
    const cube=[gridIndex(i,j,k),gridIndex(i+1,j,k),gridIndex(i+1,j+1,k),gridIndex(i,j+1,k),
      gridIndex(i,j,k+1),gridIndex(i+1,j,k+1),gridIndex(i+1,j+1,k+1),gridIndex(i,j+1,k+1)];
    if(cube.every(n=>values[n]<0)||cube.every(n=>values[n]>=0))continue;
    const edge=(a:number,b:number):V=>{
      const t=values[a]/(values[a]-values[b]);return grid[a].map((v,n)=>mix(v,grid[b][n],t)) as V;
    };
    for(const tet of tets){
      const ins=tet.map(n=>cube[n]).filter(n=>values[n]<0),out=tet.map(n=>cube[n]).filter(n=>values[n]>=0);
      if(ins.length===1)emit(edge(ins[0],out[0]),edge(ins[0],out[1]),edge(ins[0],out[2]));
      else if(ins.length===3)emit(edge(out[0],ins[2]),edge(out[0],ins[1]),edge(out[0],ins[0]));
      else if(ins.length===2){
        const a=edge(ins[0],out[0]),b=edge(ins[0],out[1]),c=edge(ins[1],out[0]),d=edge(ins[1],out[1]);
        emit(a,b,c);emit(b,d,c);
      }
    }
  }

  // The rhinarium wraps the tip of the nasal bones, broad and slightly squared,
  // with a top plane and lateral wings. It is visibly leather, not white fur.
  const nose=(u:number,v:number):V=>{
    const a=u*TAU,latitude=(v-.5)*Math.PI,r=Math.cos(latitude),s=Math.sin(a);
    const rounded=(n:number)=>Math.sign(n)*Math.abs(n)**.72;
    return [.028+.139*r*rounded(Math.cos(a))*(1+.10*s),
      -.155+.095*r*rounded(s),.784+.068*Math.sin(latitude)];
  };
  shape(nose,80,40,[.195,.215,.245]);
  for(const sign of [-1,1])line(t=>[
    .028+sign*(.070+.027*Math.sin(t*Math.PI)),
    -.149+.027*Math.cos(t*Math.PI),.840-.011*Math.sin(t*Math.PI),
  ],()=>.007,[.025,.032,.043],28);
  line(t=>[mix(-.043,.096,t),-.068-.007*(t*2-1)**2,.818],()=>.0016,[.30,.33,.37],32);

  // A single orthonormal growth frame connects stem, calyx and folded petals.
  // Its axis points predominantly left (-X), with a forward lean that lets
  // the front view still see into the flower rather than an edge-on disk.
  const flowerAxis: V=[-.766,-.080,.638];
  const flowerAcross: V=[.6400,0,.7684];
  const flowerUp: V=[-.0615,.9968,.0512];
  const rosePoint = (p: V): V => [0,1,2].map(k=>
    [-.555,-.422,.488][k]+flowerAcross[k]*p[0]*1.08+flowerUp[k]*p[1]*1.03+flowerAxis[k]*p[2]
  ) as V;
  // The stem passes through the closed lip seam; there are no visible teeth. At the
  // flower end it curves into the calyx along the flower's actual growth axis.
  // Shared frame makes this cubic tangent exactly opposite the growth axis.
  const grip:V=[-.15,mouthLipAtDepth(.60)-.010,.60];
  const control: V[]=[rosePoint([0,0,-.070]),rosePoint([0,0,-.120]),[-.32,grip[1],.60],grip];
  const stem = (t: number): V => {
    if(t>.52)return [mix(grip[0],.73,(t-.52)/.48),grip[1],.60];
    const u=t/.52;
    return [0,1,2].map(k=>(1-u)**3*control[0][k]+3*(1-u)**2*u*control[1][k]+3*(1-u)*u*u*control[2][k]+u**3*control[3][k]) as V;
  };
  line(stem,()=>.007,[.13,.15,.065],100);
  line(t=>[mix(.33,.51,t),-.288+.027*Math.sin(t*Math.PI),.604],t=>.0025*Math.sin(t*Math.PI),[.20,.22,.09],30);

  const rose = (p: V): V => project(rosePoint(p));
  // The calyx narrows to the stem at local -Z, not the side of the bloom.
  line(t=>rosePoint([0,0,mix(-.070,-.019,t)]),t=>mix(.008,.030,t),[.08,.13,.045],24);
  const petalSurface = (fn: Surface, color: V, nu=36,nv=24) => surface((u,v)=>rose(fn(u,v)),nu,nv,color);
  // Broad, individually composed velvet folds. Unequal angular spacing and
  // open side seams avoid the concentric-ring silhouette of a polar flower.
  const petals = [
    // angle, reach, width, crown depth, fold, offset
    [-.25,.215,.125,.075,.045,-.016],
    [1.02,.205,.132,.082,.035,.012],
    [2.36,.220,.116,.053,.048,-.006],
    [3.48,.193,.139,.072,.034,.010],
    [4.87,.225,.124,.037,.043,-.012],
    [.45,.151,.100,.136,.043,.019],
    [1.91,.149,.104,.149,.036,-.013],
    [3.32,.153,.107,.119,.046,.008],
    [4.73,.148,.100,.142,.035,-.016],
    [1.14,.084,.063,.192,.027,-.009],
    [3.40,.086,.059,.181,.032,.014],
    [5.32,.075,.060,.204,.025,-.009],
  ];
  for(let k=0;k<petals.length;k++) {
    const [angle,reach,width,height,fold,offset]=petals[k];
    const point=(u:number,v:number):V=>{
      const s=u*2-1;
      // A wide, almost polygonal outer lip with pinched roots and a single
      // diagonal fold; each petal is a sheet, not a sector of a sphere.
      const spread=Math.sin(v*Math.PI*.59)**.72;
      const tangent=width*.83*s*spread+offset*v;
      const radial=.022+(reach-.022)*v-.046*Math.abs(s)**2*v;
      const turn=angle+.13*s*v;
      const z=height-.100*(1-v)**2 +fold*(1-s*s)*Math.sin(v*Math.PI*.83)
        -.034*v**8 +.028*s*v+.017*Math.max(0,s-.18)*v;
      return [radial*Math.cos(turn)-tangent*Math.sin(turn)-.007,
        radial*Math.sin(turn)+tangent*Math.cos(turn)+.009,z];
    };
    // The directional fold has a lit plane and a deeply shaded reverse plane.
    // Keep the whole boundary unoutlined: only the folded-over lip catches light.
    for(let iu=0;iu<8;iu++)for(let iv=0;iv<5;iv++) {
      const u=(iu+.5)/8,v=(iv+.5)/5;
      const plane=u<.57 ? 1.00-.23*u : .26+.19*(1-u);
      const shade=(.48+.52*v)*plane*(.78+.19*Math.sin(k*2.4));
      petalSurface((s,t)=>point((iu+s)/8,(iv+t)/5),[shade,.009+shade*.028,.019+shade*.031],4,4);
    }
    petalSurface((u,v)=>{
      const p=point(u,1),curl=v*Math.PI;
      const extension=.010*Math.sin(curl)*(1-(u*2-1)**2);
      return [p[0]+Math.cos(angle)*extension,p[1]+Math.sin(angle)*extension,p[2]+.010*(1-Math.cos(curl))];
    },[.55+(k%3)*.065,.024,.037],32,6);
  }
  // A small, off-centre heart: two folded blades, not a large perfect spiral.
  for(let k=0;k<2;k++)petalSurface((u,v)=>{
    const angle=.7+k*2.7+u*3.7,r=.012+.027*u+.004*v;
    return [-.009+r*Math.cos(angle),.011+r*Math.sin(angle),.209+.025*v-.019*u];
  },k===0?[.60,.022,.038]:[.38,.009,.020],40,12);
  // Five slender sepals beneath the flower and a visible short calyx.
  for(let i=0;i<5;i++) petalSurface((u,v)=>{
    const a=i*TAU/5+(u-.5)*.46*(1-v),r=.039+.091*v;
    return [r*Math.cos(a),r*Math.sin(a),-.035-.019*Math.sin(v*Math.PI)];
  },[.09,.15,.055],12,16);

  // Area-weighted stratified barycentric samples: stable density across triangle
  // sizes, not extra clouds concentrated at mesh vertices or petal intersections.
  const total=triangles.reduce((n,t)=>n+t.area,0);
  let index=0, cumulative=triangles[0].area;
  for(let i=0;i<budget;i++) {
    const target=(i+random())/budget*total;
    while(cumulative<target && index<triangles.length-1) cumulative+=triangles[++index].area;
    const t=triangles[index], a=Math.sqrt(random()), b=random();
    const p=t.a.map((x,k)=>x*(1-a)+t.b[k]*a*(1-b)+t.c[k]*a*b) as V;
    add(p,t.color,t.normal,t.color[1]>.5?.78:t.color[0]>.4?1.06:.90);
  }
  // Shared anatomical skin under the retained forehead/cheek fur. It carries the original fur
  // samples above it and prevents the far eye/cheek from showing through.
  // A small inset leaves the surface porous while hiding the opposite side.
  const skin: number[]=[];
  const vertex=(x:number,y:number):V=>{const z=facialDepth(x,y)-.040;return [x*(1-z/3.6),y*(1-z/3.6),z];};
  const inside=(x:number,y:number)=> (x/.61)**2+((y-.02)/.67)**2<1
    && !replacedMuzzle(x,y);
  for(let i=0;i<80;i++) for(let j=0;j<88;j++) {
    const x=-.62+i*.0155,y=-.66+j*.015;
    if(![[x,y],[x+.0155,y],[x+.0155,y+.015],[x,y+.015]].every(([a,b])=>inside(a,b)))continue;
    const a=vertex(x,y),b=vertex(x+.0155,y),c=vertex(x+.0155,y+.015),d=vertex(x,y+.015);
    skin.push(...a,...b,...c,...a,...c,...d);
  }
  // The rounded occiput closes the head volume behind the front relief.
  // It is inset from the sampled coat; it never renders a solid silhouette.
  const backVertex=(x:number,y:number):V=>[x*.80,y*.90,cranialBack(x,y)+.032];
  for(let i=0;i<56;i++)for(let j=0;j<62;j++) {
    const x=-.60+i*.0215,y=-.62+j*.020;
    const corners=[[x,y],[x+.0215,y],[x+.0215,y+.020],[x,y+.020]];
    if(!corners.every(([a,b])=>(a/.61)**2+((b-.02)/.70)**2<1))continue;
    const [a,b,c,d]=corners.map(([x,y])=>backVertex(x,y));
    skin.push(...a,...b,...c,...a,...c,...d);
  }
  return {
    triangleCount: triangles.length+skin.length/9,
    // Invisible depth skin keeps the two facial sides and overlapping petals
    // separate; the visible result remains entirely individual particles.
    positions: [...skin,...triangles.flatMap(t => [...t.a, ...t.b, ...t.c])].map((v,i)=>i%3===1?headHeight(v):v),
  };
}
