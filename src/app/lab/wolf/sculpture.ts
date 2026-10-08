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

/** One continuous skin: the muzzle grows out of the cheeks and nasal bridge.
 * Smooth implicit volumes avoid a loft seam or a separate conical snout. */
export function facialDepth(x: number, y: number) {
  const bump=(cx:number,cy:number,sx:number,sy:number)=>Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2));
  const skull=Math.sqrt(Math.max(0,1-(x/.69)**2-((y-.08)/.86)**2));
  const base=-.22+skull*.57+bump(Math.sign(x)*.37,-.07,.22,.30)*.085
    -bump(Math.sign(x)*.23,.19,.115,.09)*.070+bump(Math.sign(x)*.18,.30,.18,.11)*.050;
  // Fields overlap below the skin; their union has no visible intersection.
  const components = [
    [.028,-.215,.465,.172,.138,.240], // snout, with a rounded forward end
    [.028,-.025,.375,.131,.285,.180], // nasal bridge into the brow stop
    [-.215,-.145,.228,.205,.240,.185],
    [.255,-.145,.228,.205,.240,.185], // cheek pads flank the snout
    [.028,-.352,.312,.232,.117,.233], // connected, closed lower jaw
  ];
  const terms=components.map(([cx,cy,cz,rx,ry,rz])=>[
    Math.exp(-2*(((x-cx)/rx)**2+((y-cy)/ry)**2)),cz,rz,
  ]);
  const field=(z:number)=>terms.reduce((v,[weight,cz,rz])=>v+weight*Math.exp(-2*((z-cz)/rz)**2),0);
  // A soft union with the original cranium uses its own shallow depth field.
  const union=(z:number)=>field(z)+Math.exp(-2)*Math.exp((base-z)*16);
  let lo=base,hi=.82;
  for(let i=0;i<19;i++) {const mid=(lo+hi)/2;if(union(mid)>Math.exp(-2))lo=mid;else hi=mid;}
  return (lo+hi)/2;
}

/** Replace the painted open bite while retaining the original eyes and ruff. */
export function replacedMuzzle(x: number, y: number) {
  return ((x-.028)/.365)**2+((y+.248)/.327)**2 < 1;
}

export function sculptWolfDetails(random: () => number, budget: number,
  add: (position: V, color: V, normal: V, size: number) => void,
  furColor: (x: number, y: number) => V) {
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

  // This is the SAME skin function used by every original fur sample above
  // and beside it. Area sampling makes turned cheeks as dense as the front.
  // No rear muzzle rim, flat cap, separate jaw sheet or white outline exists.
  const step=.007;
  for(let x=-.342;x<.398;x+=step)for(let y=-.580;y<.084;y+=step) {
    const corners: V[]=[[x,y,0],[x+step,y,0],[x+step,y+step,0],[x,y+step,0]];
    if(!corners.every(p=>replacedMuzzle(p[0],p[1])))continue;
    const color=furColor(x+step/2,y+step/2);
    const p=corners.map(([a,b])=>project([a,b,facialDepth(a,b)]));
    triangle(p[0],p[1],p[2],color);triangle(p[0],p[2],p[3],color);
  }

  // A small rounded canine rhinarium seated on the forward pad. Its black
  // leather has volume, but no disc-shaped rim or two bright pig nostrils.
  const nose=(u:number,v:number):V=>{
    const a=u*TAU,latitude=(v-.5)*Math.PI,s=Math.sin(a);
    const r=Math.cos(latitude);
    return [.028+.105*r*Math.cos(a)*(1+.16*s),-.227+.064*r*s,
      .690+.036*Math.sin(latitude)];
  };
  shape(nose,72,32,[.061,.075,.090]);
  // Subtle nostril creases on the sloping lateral wings, not a frontal ring.
  for(const sign of [-1,1])line(t=>[
    .028+sign*(.069+.020*Math.sin(t*Math.PI)),
    -.222+.012*Math.cos(t*Math.PI),.717-.006*Math.sin(t*Math.PI),
  ],()=>.0032,[.016,.024,.031],24);
  line(t=>[mix(-.010,.066,t),-.170-.002*(t*2-1)**2,.708],()=>.0012,[.17,.19,.21],28);

  // A quiet closed mouth follows the curved skin from beneath the nose
  // into both cheeks. All jaw volume is part of the common skin above.
  line(t=>{const y=mix(-.287,-.316,t);return [.028,y,facialDepth(.028,y)+.006];},()=>.0024,[.055,.064,.071],20);
  for(const sign of [-1,1])line(t=>{
    const x=.028+sign*.240*t,y=-.318-.017*Math.sin(t*Math.PI*.7);
    return [x,y,facialDepth(x,y)+.005];
  },t=>.003+.002*Math.sin(t*Math.PI),[.10,.11,.12],54);

  // A single orthonormal growth frame connects stem, calyx and folded petals.
  // Its axis points predominantly left (-X), with a forward lean that lets
  // the front view still see into the flower rather than an edge-on disk.
  const flowerAxis: V=[-.766,-.080,.638];
  const flowerAcross: V=[.6400,0,.7684];
  const flowerUp: V=[-.0615,.9968,.0512];
  const rosePoint = (p: V): V => [0,1,2].map(k=>
    [-.525,-.314,.724][k]+flowerAcross[k]*p[0]*1.08+flowerUp[k]*p[1]*1.03+flowerAxis[k]*p[2]
  ) as V;
  // The stem passes through the closed lip seam; there are no visible teeth. At the
  // flower end it curves into the calyx along the flower's actual growth axis.
  // Shared frame makes this cubic tangent exactly opposite the growth axis.
  const control: V[]=[rosePoint([0,0,-.070]),rosePoint([0,0,-.120]),[-.20,-.318,.649],[.79,-.291,.669]];
  const stem = (t: number): V => {
    return [0,1,2].map(k=>(1-t)**3*control[0][k]+3*(1-t)**2*t*control[1][k]+3*(1-t)*t*t*control[2][k]+t**3*control[3][k]) as V;
  };
  line(stem,()=>.007,[.13,.15,.065],100);
  line(t=>[mix(.33,.51,t),-.303+.027*Math.sin(t*Math.PI),.660],t=>.0025*Math.sin(t*Math.PI),[.20,.22,.09],30);

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
  return {
    triangleCount: triangles.length+skin.length/9,
    // Invisible depth skin keeps the two facial sides and overlapping petals
    // separate; the visible result remains entirely individual particles.
    positions: [...skin,...triangles.flatMap(t => [...t.a, ...t.b, ...t.c])],
  };
}
