const FAILSAFE_MS = 3000;

const BOOTSTRAP = `(function(){try{
var d=document.documentElement;
var m=matchMedia('(prefers-reduced-motion: reduce)').matches;
d.dataset.motion=m?'reduced':'full';
if(!m){
  d.setAttribute('data-reveal-armed','');
  setTimeout(function(){d.removeAttribute('data-reveal-armed');},${FAILSAFE_MS});
}
}catch(e){}})();`;

export function MotionBootstrap() {
  return <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP }} />;
}
