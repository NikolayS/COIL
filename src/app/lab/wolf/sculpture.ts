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
  // The forehead is the front of a rounded cranium, not a ramp running all
  // the way to the nose. The nasal bridge is a separate lengthwise volume.
  const skull=Math.sqrt(Math.max(0,1-(x/.69)**2-((y-.08)/.86)**2));
  const cheeks=bump(Math.sign(x)*.37,-.07,.22,.30);
  const eyes=bump(Math.sign(x)*.23,.19,.115,.09);
  const brow=bump(Math.sign(x)*.18,.30,.18,.11);
  return -.22+skull*.57+cheeks*.085-eyes*.070+brow*.050;
}

/** Original open-mouth artwork is replaced by a closed, fully modeled muzzle. */
export function replacedMuzzle(x: number, y: number) {
  return ((x-.038)/.305)**2+((y+.225)/.282)**2 < 1
    || ((x-.038)/.245)**2+((y+.488)/.128)**2 < 1;
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
  // onto anatomy. Perspective compensation retains the recognizable frontal landmarks.
  const project = (p: V): V => [p[0]*(1-p[2]/3.6),p[1]*(1-p[2]/3.6),p[2]];
  const shape = (fn: Surface, nu: number, nv: number, color: V,
    include: (p: V) => boolean = () => true) =>
    surface((u,v)=>project(fn(u,v)),nu,nv,color,p=>include([p[0]/(1-p[2]/3.6),p[1]/(1-p[2]/3.6),p[2]]));
  const line = (path: (t: number) => V, radius: (t: number) => number, color: V, steps=48) =>
    tube(t=>project(path(t)),radius,color,steps);

  // A proper canine muzzle is a horizontal, tapering volume projecting out
  // of the stop below the eyes. Cross-sections have independent dorsal and
  // ventral heights; no part is an extruded patch of the front logo.
  const muzzle = (t: number, angle: number): V => {
    const width=mix(.320,.114,t**.80);
    const top=mix(.135,-.137,t**.48);
    const bottom=mix(-.385,-.294,t);
    const centre=(top+bottom)/2, height=(top-bottom)/2;
    return [.038+width*Math.cos(angle),centre+height*Math.sin(angle),mix(.205,.768,t)];
  };
  // Separated fur planes retain the wolf's pale muzzle and charcoal underside.
  for(let band=0;band<16;band++) {
    const angle=(band+.5)/16*TAU;
    const dorsal=Math.sin(angle);
    const shade=dorsal>-.25 ? .69+.16*Math.max(0,dorsal) : .30;
    shape((u,v)=>muzzle(u,(band+v)/16*TAU),56,6,[shade,shade*1.015,shade*1.025]);
  }
  // Close the forward fur surface behind the leather; nothing can shine
  // through the dark nose in side or quarter views.
  shape((u,v)=>{const rim=muzzle(1,u*TAU);return [mix(.038,rim[0],v),mix(-.216,rim[1],v),.769];},64,14,[.20,.22,.23]);

  // Compact rhinarium: broad top, tapered underside and only a shallow lip.
  // Its side walls converge into the muzzle instead of forming a round tube.
  const nose = (u: number,v: number): V => {
    const angle=u*TAU,s=Math.sin(angle),r=v;
    return [.038+.119*r*Math.cos(angle)*(1+.27*s),
      -.209+.072*r*s,
      .791+.016*(1-r*r)-.016*Math.max(0,-s)*r];
  };
  const nostrils: V[]=[[-.046,-.205,.797],[.122,-.205,.797]];
  const noNostril = (p: V) => nostrils.every(c=>((p[0]-c[0])/.024)**2+((p[1]-c[1])/.010)**2>1);
  shape(nose,72,24,[.045,.055,.068],noNostril);
  shape((u,v)=>{const p=nose(u,1);return [mix(p[0],.038+(p[0]-.038)*.88,v),mix(p[1],-.215+(p[1]+.209)*.90,v),mix(p[2],.746,v)];},72,10,[.037,.043,.052]);
  for (const c of nostrils) {
    shape((u,v)=>{const a=u*TAU,r=1-v*.75;return [c[0]+Math.cos(a)*.024*r,c[1]+Math.sin(a)*.010*r,c[2]-.032*v];},32,8,[.006,.009,.014]);
    line(t=>{const a=t*Math.PI;return [c[0]+Math.cos(a)*.025,c[1]+Math.sin(a)*.0105,c[2]+.001];},()=>.0014,[.115,.13,.15],24);
  }
  // A broken upper glint, not a bright circular border around the snout.
  line(t=>[mix(-.031,.082,t),-.145-.005*(t*2-1)**2,.787],()=>.0018,[.20,.23,.26],30);
  line(t=>[.038,mix(-.270,-.302,t),mix(.780,.746,t)],()=>.0025,[.023,.029,.037]);

  // Closed lips curve from the nose back to the cheek. No enamel geometry is
  // generated: neither incisors, canine tips nor buried tooth depth meshes.
  const lip = (sign: number,t: number): V => [
    .038+sign*mix(.100,.300,t), mix(-.303,-.380,t)+.007*Math.sin(t*Math.PI), mix(.752,.205,t),
  ];
  for(const sign of [-1,1]) {
    // A broad connected mandibular surface tapers forward under the muzzle.
    for(let band=0;band<8;band++) shape((u,v)=>{
      const t=u,angle=(band+v)/8*Math.PI/2,p=lip(sign,t);
      const width=Math.abs(p[0]-.038);
      const drop=mix(.065,.105,t)*Math.sin(angle);
      return [.038+sign*width*Math.cos(angle),p[1]-.010-drop,p[2]-.014];
    },56,6,[.39-band*.020,.405-band*.020,.42-band*.020]);
    line(t=>lip(sign,t),t=>mix(.0055,.008,t),[.023,.030,.038]);
    // The rear mandible blends into the original chin/ruff. Closing this
    // lower shell avoids an empty black oval left by the old open mouth.
    shape((u,v)=>{
      const a=u*Math.PI/2;
      const x=.038+sign*mix(.300,.242,v)*Math.cos(a);
      const y=-.390-(.105+.130*v)*Math.sin(a);
      return [x,y,mix(.191,facialDepth(x,y)+.012,v)];
    },28,16,[.30,.32,.34]);
  }
  // Rounded chin cap meets both halves of the mandible, behind the nose.
  shape((u,v)=>{const a=u*Math.PI;return [.038+.100*Math.cos(a)*v,-.313-.065*Math.sin(a)*v,.738+.011*(1-v)];},48,12,[.27,.29,.31]);

  // A single orthonormal growth frame connects stem, calyx and folded petals.
  // Its axis points predominantly left (-X), with a forward lean that lets
  // the front view still see into the flower rather than an edge-on disk.
  const flowerAxis: V=[-.766,-.080,.638];
  const flowerAcross: V=[.6400,0,.7684];
  const flowerUp: V=[-.0615,.9968,.0512];
  const rosePoint = (p: V): V => [0,1,2].map(k=>
    [-.525,-.314,.774][k]+flowerAcross[k]*p[0]*1.08+flowerUp[k]*p[1]*1.03+flowerAxis[k]*p[2]
  ) as V;
  // The stem passes through the closed lip seam; there are no visible teeth. At the
  // flower end it curves into the calyx along the flower's actual growth axis.
  // Shared frame makes this cubic tangent exactly opposite the growth axis.
  const control: V[]=[rosePoint([0,0,-.070]),rosePoint([0,0,-.120]),[-.20,-.309,.712],[.79,-.291,.719]];
  const stem = (t: number): V => {
    return [0,1,2].map(k=>(1-t)**3*control[0][k]+3*(1-t)**2*t*control[1][k]+3*(1-t)*t*t*control[2][k]+t**3*control[3][k]) as V;
  };
  line(stem,()=>.007,[.13,.15,.065],100);
  line(t=>[mix(.33,.51,t),-.303+.027*Math.sin(t*Math.PI),.710],t=>.0025*Math.sin(t*Math.PI),[.20,.22,.09],30);

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
