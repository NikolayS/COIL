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

export function sculptWolfDetails(random: () => number, budget: number,
  add: (position: V, color: V, normal: V, size: number) => void) {
  const triangles: Triangle[] = [];
  const triangle = (a: V, b: V, c: V, color: V) => {
    const n = cross(sub(b, a), sub(c, a));
    const length = Math.hypot(...n);
    if (length > 1e-9) triangles.push({ a, b, c, color, normal: n.map(x => x/length) as V, area: length/2 * (color[0] > .7 && color[1] < .1 ? 3 : color[0] < .34 && color[1] > color[0] ? 2.4 : 1) });
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
  // Long, tapered upper muzzle: broad under the eyes, narrow at the nose.
  // Elliptical loft rings form real side walls and a sloped dorsal bridge.
  surface((u,v)=>{
    const z=mix(.26,.76,u), a=v*TAU;
    const width=mix(.235,.112,u)+.026*Math.sin(u*Math.PI), height=mix(.16,.095,u);
    const cy=mix(-.19,-.335,u);
    return [.038+width*Math.cos(a),cy+height*Math.sin(a),z];
  },38,64,[.93,.96,.98]);
  // Whisker pads terminate behind the nose instead of a bright spherical tip.
  for (const sign of [-1,1]) surface((u,v)=>{
    const a=u*TAU,b=v*Math.PI;
    return [.038+sign*.108+.084*Math.cos(a)*Math.sin(b),-.365+.075*Math.sin(a)*Math.sin(b),.663+.112*Math.cos(b)];
  },32,20,[.93,.96,.98]);
  // Rounded triangular charcoal nose cap, including a curved back/side wall.
  const noseFace = (u: number,v: number): V => {
    const y=mix(-.25,-.422,v)-.024*(1-v)*(u*2-1)**2, w=.122*(1-.39*v)+.014*Math.sin(v*Math.PI);
    const x=(u*2-1)*w;
    return [.038+x,y,.855+.032*Math.sin(v*Math.PI)-.038*(x/w)**2];
  };
  const nostrilCenters: V[]=[[-.035,-.316,.876],[.111,-.316,.876]];
  const noNostril = (p: V) => nostrilCenters.every(c=>((p[0]-c[0])/.033)**2+((p[1]-c[1])/.020)**2>1);
  surface(noseFace,84,58,[.16,.18,.205],noNostril);
  surface((u,v)=>{
    // Traverse the four perimeter edges of the triangular rounded front.
    const edge=u*4, k=Math.min(3,Math.floor(edge)), t=edge-k;
    const p=k===0?noseFace(t,0):k===1?noseFace(1,t):k===2?noseFace(1-t,1):noseFace(0,1-t);
    return [mix(p[0],.038+(p[0]-.038)*.82,v),mix(p[1],-.34+(p[1]+.34)*.85,v),mix(p[2],.728,v)];
  },128,12,[.12,.14,.165]);
  for (const c of nostrilCenters) {
    // Recessed funnel, black floor, and asymmetric alar rim around each hole.
    surface((u,v)=>{const a=u*TAU,r=1-v*.65;return [c[0]+Math.cos(a)*.034*r,c[1]+Math.sin(a)*.021*r,c[2]-.072*v];},36,10,[.028,.034,.045]);
    surface((u,v)=>{const a=u*TAU,r=v;return [c[0]+Math.cos(a)*.012*r,c[1]+Math.sin(a)*.008*r,.803];},28,4,[.012,.015,.021]);
    tube(t=>{const a=t*TAU;return [c[0]+Math.cos(a)*.037,c[1]+Math.sin(a)*.023,c[2]+.003+Math.sin(a)*.006];},t=>.0045+.002*Math.max(0,Math.sin(t*TAU)),[.16,.18,.20],44);
  }
  // Nose-top glint and central philtrum remain restrained, not white fur.
  tube(t=>[mix(-.058,.126,t),-.25-.024*(t*2-1)**2,.850+Math.sin(t*Math.PI)*.016],()=>.0034,[.32,.35,.37]);
  tube(t=>[.038,-.40-t*.062,.831-t*.07],()=>.004,[.065,.072,.08]);
  // Dark canine upper lip curves back along both sides; jaw/teeth artwork stays.
  for(const sign of [-1,1]) tube(t=>[.038+sign*(.012+.188*t),-.445+.030*t+.014*Math.sin(t*Math.PI),.77-.33*t],()=>.009,[.065,.072,.08]);

  // Rose axis points toward the viewer and slightly out to the left. A local
  // flower frame keeps the bloom attached to the bitten horizontal stem.
  const rose = (p: V): V => [-.595+p[0]*.975-p[2]*.22,-.449+p[1],.38+p[0]*.22+p[2]*.975];
  // Broad overlapping petals, each a distinct curled bicubic-like surface.
  // Five outer, six middle and five inner petals spiral into the furled bud.
  for (const [ring,count,radius,depth] of [[0,5,.218,.02],[1,6,.162,.085],[2,5,.107,.133]] as const) {
    for(let petal=0;petal<count;petal++) {
      const angle=petal*TAU/count+ring*.61;
      const span=ring===0?1.75:ring===1?1.72:1.85;
      const petalRadius=radius*(1+.07*Math.sin(petal*4.3+ring));
      surface((u,v)=>{
        const s=u*2-1, a=angle+s*span/2+.22*v;
        const r=mix(petalRadius*.25,petalRadius,v)*(1-.32*s*s);
        // Cupped bottom, open body, then recurved rim; a shallow center crease
        // and lopsided scallops prevent concentric bowl/disc geometry.
        const cup=depth+.122*Math.sin(v*Math.PI*.79)-.075*v**5;
        const z=cup+.032*s*s*v+.014*Math.sin(a*3+ring)*v*v;
        return rose([r*Math.cos(a),r*Math.sin(a),z]);
      },26,24,[.48+ring*.065+(petal%2)*.08,.014+ring*.003,.025+ring*.003]);
      // Rolled outer edges carry a thin lit rim and cast depth discontinuities.
      tube(t=>{
        const s=t*2-1,a=angle+s*span/2+.22;
        const r=petalRadius*(1-.32*s*s);
        const z=depth+.122*Math.sin(Math.PI*.79)-.075+.032*s*s+.014*Math.sin(a*3+ring);
        return rose([r*Math.cos(a),r*Math.sin(a),z]);
      },()=>.0035,[.80,.040,.058],30);
    }
  }
  // Curled central bud: continuous rising spiral, not a red sphere.
  surface((u,v)=>{
    const a=u*TAU*1.8, r=.015+.049*u+.014*v;
    return rose([r*Math.cos(a),r*Math.sin(a),.19+.052*v-.037*u]);
  },100,12,[.64,.022,.036]);
  // Five pointed green-black sepals wrap under the bloom.
  for(let i=0;i<5;i++) surface((u,v)=>{
    const a=i*TAU/5+(u-.5)*.60*(1-v),r=.068+.095*v;
    return rose([r*Math.cos(a),r*Math.sin(a),-.012-.045*Math.sin(v*Math.PI)]);
  },12,20,[.075,.10,.06]);
  tube(t=>[mix(-.46,.76,t),-.424+.018*Math.sin(t*Math.PI),mix(.37,.47,t)],()=>.010,[.11,.105,.065],110);

  // Area-weighted stratified barycentric samples: stable density across triangle
  // sizes, not extra clouds concentrated at mesh vertices or petal intersections.
  const total=triangles.reduce((n,t)=>n+t.area,0);
  let index=0, cumulative=triangles[0].area;
  for(let i=0;i<budget;i++) {
    const target=(i+random())/budget*total;
    while(cumulative<target && index<triangles.length-1) cumulative+=triangles[++index].area;
    const t=triangles[index], a=Math.sqrt(random()), b=random();
    const p=t.a.map((x,k)=>x*(1-a)+t.b[k]*a*(1-b)+t.c[k]*a*b) as V;
    add(p,t.color,t.normal,t.color[1]>.5?.75:t.color[0]>.7?1.05:.88);
  }
  return {
    triangleCount: triangles.length,
    // Fur remains permeable to merge with the original textured cheek samples;
    // only the hard nose/lips and overlapping rose surfaces need an occluder.
    positions: triangles.filter(t => t.color[1] < .5).flatMap(t => [...t.a, ...t.b, ...t.c]),
  };
}
