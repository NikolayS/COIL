/**
 * Reproducible, explicit triangle-surface models in the logo's coordinate frame.
 * +Z is forward. The rose has separate rolled petals, not an image extrusion;
 * the rhinarium has open nostril apertures with inset cavity walls.
 * These meshes are area-sampled into the scene's existing particle budget.
 */
type V = [number, number, number];
type Triangle = { a: V; b: V; c: V; color: V; normal: V; area: number };
type Surface = (u: number, v: number) => V;
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const mix = (a: number, b: number, t: number) => a + (b-a)*t;
const TAU = Math.PI * 2;

/** A continuous anatomical shell, shared by textured fur and its 3D skin. */
export function facialDepth(x: number, y: number) {
  const bump=(cx:number,cy:number,sx:number,sy:number)=>Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2));
  const skull=Math.sqrt(Math.max(0,1-(x/.76)**2-((y-.06)/1.10)**2));
  const cheeks=bump(Math.sign(x)*.38,-.03,.22,.30);
  const eyes=bump(Math.sign(x)*.23,.19,.12,.10);
  const bridge=bump(.038,-.15,.205,.31);
  const muzzle=bump(.038,-.305,.252,.187);
  const jaw=.32*bump(.038,-.575,.23,.12);
  const crown=Math.max(0,Math.min(1,(y-.14)/.56));
  const foreheadSetback=.23*crown*crown*(3-2*crown);
  return -.22+skull*.48+cheeks*.075-eyes*.085+bridge*.20+muzzle*.23+jaw-foreheadSetback;
}

export function sculptWolfDetails(random: () => number, budget: number,
  add: (position: V, color: V, normal: V, size: number) => void) {
  const triangles: Triangle[] = [];
  const triangle = (a: V, b: V, c: V, color: V) => {
    const n = cross(sub(b, a), sub(c, a));
    const length = Math.hypot(...n);
    if (length > 1e-9) triangles.push({ a, b, c, color, normal: n.map(x => x/length) as V, area: length/2 * (color[1] > .5 ? 8 : color[0] > .15 && color[1] < .1 ? 3 : color[0] < .34 && color[1] > color[0] ? 2.4 : 1) });
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
  // onto anatomy. Perspective must not enlarge the nose over the teeth.
  const project = (p: V): V => [p[0]*(1-p[2]/3.6),p[1]*(1-p[2]/3.6),p[2]];
  const shape = (fn: Surface, nu: number, nv: number, color: V,
    include: (p: V) => boolean = () => true) =>
    surface((u,v)=>project(fn(u,v)),nu,nv,color,p=>include([p[0]/(1-p[2]/3.6),p[1]/(1-p[2]/3.6),p[2]]));
  const line = (path: (t: number) => V, radius: (t: number) => number, color: V, steps=48) =>
    tube(t=>project(path(t)),radius,color,steps);

  // A gently domed, broad-topped rhinarium; the narrow lower edge is tucked
  // above the mouth, not an oversized cap at the end of an extruded tube.
  const nose = (u: number,v: number): V => {
    const a=u*TAU,r=v,top=Math.sin(a);
    return [.038+.129*r*Math.cos(a)*(1+.22*top),
      -.326+.089*r*Math.sign(top)*Math.abs(top)**.75-.008*r*Math.cos(a)**2,
      .660+.043*Math.sqrt(Math.max(0,1-r*r))];
  };
  const nostrils: V[]=[[-.035,-.321,.690],[.111,-.321,.690]];
  const noNostril = (p: V) => nostrils.every(c=>((p[0]-c[0])/.030)**2+((p[1]-c[1])/.013)**2>1);
  shape(nose,72,28,[.13,.16,.20],noNostril);
  // Broad, softly broken highlight across the damp upper leather.
  for(let i=0;i<5;i++) line(t=>[mix(-.039,.105,t),-.250-i*.005-.005*(t*2-1)**2,.681+i*.003],()=>.0018,[.26-i*.020,.31-i*.022,.36-i*.024],24);
  shape((u,v)=>{const p=nose(u,1);return [.038+(p[0]-.038)*(1-.12*v),-.326+(p[1]+.326)*(1-.10*v),.660-.087*v];},96,12,[.060,.075,.095]);
  for (const c of nostrils) {
    shape((u,v)=>{const a=u*TAU,r=1-v*.7;return [c[0]+Math.cos(a)*.031*r,c[1]+Math.sin(a)*.014*r,c[2]-.055*v];},36,10,[.012,.018,.026]);
    line(t=>{const a=t*Math.PI;return [c[0]+Math.cos(a)*.032,c[1]+Math.sin(a)*.015,c[2]+.001];},()=>.0024,[.19,.22,.26],28);
  }
  // Deliberate cool highlight, central groove and dark upper lip.
  line(t=>[mix(-.043,.115,t),-.239-.008*(t*2-1)**2,.671+.009*Math.sin(t*Math.PI)],()=>.0028,[.34,.39,.44]);
  line(t=>[.038,-.398-t*.041,.669-t*.038],()=>.003,[.025,.034,.045]);

  // A shallow closed bite belongs to the muzzle, not a separate smiling
  // tooth ring. The lip seam turns back into the cheek on either side.
  const lip = (sign: number, t: number): V => [
    .038+sign*.213*t, -.448+.006*t+.016*t*t, .625-.231*t*t,
  ];
  shape((u,v)=>{const a=u*TAU,b=v*Math.PI;return [.038+.188*Math.cos(a)*Math.sin(b),-.467+.032*Math.sin(a)*Math.sin(b),.540+.066*Math.cos(b)];},64,24,[.014,.019,.024]);
  for(const sign of [-1,1]) {
    // The furred lower mandible wraps behind the lip and joins the existing
    // chin surface; it is not an outline suspended in front of the face.
    for(let band=0;band<5;band++) shape((u,v)=>{
      const t=u,drop=(band+v)/5,p=lip(sign,t);
      const x=p[0],y=p[1]-.034-.073*drop*(1-.55*t);
      const target=facialDepth(x,y);
      return [x,y,mix(p[2]-.009,target,drop)];
    },42,5,[.40-band*.038,.42-band*.038,.43-band*.038]);
    line(t=>lip(sign,t),t=>.011-.004*t,[.043,.050,.060]);
    line(t=>{const p=lip(sign,t);return [p[0],p[1]-.036*(1-t*t),p[2]-.007];},t=>.009-.004*t,[.10,.115,.12]);
    // Only the tips clear the closed lips. Roots are buried in the muzzle;
    // small irregular teeth avoid a bright human-like horseshoe of enamel.
    shape((u,v)=>{const a=u*TAU,r=.011*(1-v)**.7;return [.038+sign*(.115-.010*v)+r*Math.cos(a),-.435-.053*v,.620+.006*Math.sin(v*Math.PI)+r*Math.sin(a)];},24,16,[.62,.64,.59]);
  }
  for(let i=0;i<4;i++) {
    const x=.038+(i-1.5)*.019;
    shape((u,v)=>{const a=u*TAU,b=v*Math.PI;return [x+.006*Math.cos(a)*Math.sin(b),-.452+.004*Math.sin(a)*Math.sin(b),.621+.005*Math.cos(b)];},16,10,[.37,.39,.37]);
  }

  // A single orthonormal growth frame connects stem, calyx and folded petals.
  // Its axis points predominantly left (-X), with a forward lean that lets
  // the front view still see into the flower rather than an edge-on disk.
  const flowerAxis: V=[-.766,-.080,.638];
  const flowerAcross: V=[.6400,0,.7684];
  const flowerUp: V=[-.0615,.9968,.0512];
  const rosePoint = (p: V): V => [0,1,2].map(k=>
    [-.590,-.454,.650][k]+flowerAcross[k]*p[0]*1.08+flowerUp[k]*p[1]*1.03+flowerAxis[k]*p[2]
  ) as V;
  // The stem passes through the lip seam and under the canine tips. At the
  // flower end it curves into the calyx along the flower's actual growth axis.
  // Shared frame makes this cubic tangent exactly opposite the growth axis.
  const control: V[]=[rosePoint([0,0,-.070]),rosePoint([0,0,-.120]),[-.20,-.452,.588],[.79,-.431,.595]];
  const stem = (t: number): V => {
    return [0,1,2].map(k=>(1-t)**3*control[0][k]+3*(1-t)**2*t*control[1][k]+3*(1-t)*t*t*control[2][k]+t**3*control[3][k]) as V;
  };
  line(stem,()=>.007,[.13,.15,.065],100);
  line(t=>[mix(.33,.51,t),-.443+.027*Math.sin(t*Math.PI),.586],t=>.0025*Math.sin(t*Math.PI),[.20,.22,.09],30);

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
  // Explicit anatomical muzzle/forehead mesh. It carries the original fur
  // samples above it and prevents the far eye/cheek from showing through.
  // A small inset leaves the surface porous while hiding the opposite side.
  const skin: number[]=[];
  const vertex=(x:number,y:number):V=>{const z=facialDepth(x,y)-.040;return [x*(1-z/3.6),y*(1-z/3.6),z];};
  const inside=(x:number,y:number)=> (x/.61)**2+((y-.02)/.67)**2<1
    && !(((x-.038)/.19)**2+((y+.50)/.13)**2<1);
  for(let i=0;i<80;i++) for(let j=0;j<88;j++) {
    const x=-.62+i*.0155,y=-.66+j*.015;
    if(![[x,y],[x+.0155,y],[x+.0155,y+.015],[x,y+.015]].every(([a,b])=>inside(a,b)))continue;
    const a=vertex(x,y),b=vertex(x+.0155,y),c=vertex(x+.0155,y+.015),d=vertex(x,y+.015);
    skin.push(...a,...b,...c,...a,...c,...d);
  }
  return {
    triangleCount: triangles.length+skin.length/9,
    // Invisible depth skin keeps the two facial sides and overlapping petals
    // separate; the visible result remains entirely individual particles.
    positions: [...skin,...triangles.flatMap(t => [...t.a, ...t.b, ...t.c])],
  };
}
